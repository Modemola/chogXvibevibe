import type { ScoringConfig } from './config.js';
import type { Address, WalletFacts } from './types.js';
import { clamp, compareAddress, normalizeAddress } from './util.js';

export type ClusterEdgeKind = 'declared' | 'funding' | 'funded_by' | 'early_buys';

export interface ClusterEdge {
  a: Address;
  b: Address;
  kind: ClusterEdgeKind;
  detail: string;
}

export interface ClusterInfo {
  /** Lowest address in the cluster. Stable across runs. */
  clusterId: Address;
  /** All wallets treated as one person (declared + detected links). */
  size: number;
  /** Size of the undeclared (detected-only) component this wallet sits in. */
  detectedSize: number;
  /** 0..1. Only undeclared links raise it. */
  sybilScore: number;
  /** Edges touching this wallet, for the "why". */
  edges: ClusterEdge[];
}

class UnionFind {
  private parent = new Map<Address, Address>();

  add(x: Address): void {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }

  find(x: Address): Address {
    this.add(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: Address, b: Address): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // Keep the lowest address as root so ids are deterministic.
    if (compareAddress(ra, rb) < 0) this.parent.set(rb, ra);
    else this.parent.set(ra, rb);
  }

  groups(): Map<Address, Address[]> {
    const out = new Map<Address, Address[]>();
    for (const x of this.parent.keys()) {
      const r = this.find(x);
      const list = out.get(r);
      if (list) list.push(x);
      else out.set(r, [x]);
    }
    return out;
  }
}

/**
 * Groups wallets that are probably one person.
 *
 * Rules (published, deliberately boring):
 * - declared: a verified "B is owned by A" signature.
 * - funding: same first funder within `fundingWindowSec` of each other.
 * - funded_by: a wallet's first funder is itself a wallet in the set.
 * - early_buys: near-identical first N buys (same launches, same order, seconds apart).
 *
 * Declared links merge caps but carry no penalty. Detected links do both.
 */
export function clusterWallets(
  facts: readonly WalletFacts[],
  config: ScoringConfig,
): Map<Address, ClusterInfo> {
  const cfg = config.sybil;
  const all = new UnionFind();
  const detected = new UnionFind();
  const edges: ClusterEdge[] = [];
  const nodes = new Set<Address>();
  const ignored = new Set(cfg.ignoredFunders.map(normalizeAddress));

  for (const f of facts) nodes.add(f.wallet);
  for (const n of nodes) {
    all.add(n);
    detected.add(n);
  }

  const link = (a: Address, b: Address, kind: ClusterEdgeKind, detail: string) => {
    if (a === b) return;
    edges.push({ a, b, kind, detail });
    all.union(a, b);
    if (kind !== 'declared') detected.union(a, b);
  };

  for (const f of facts) {
    if (f.linkedTo) {
      const primary = normalizeAddress(f.linkedTo);
      nodes.add(primary);
      detected.add(primary);
      link(f.wallet, primary, 'declared', `linked to ${primary}`);
    }
  }

  // Funding: same funder, close in time. Sort by time and chain neighbours.
  const byFunder = new Map<Address, { wallet: Address; at: number }[]>();
  for (const f of facts) {
    if (!f.firstFunding) continue;
    const funder = normalizeAddress(f.firstFunding.funder);
    if (ignored.has(funder)) continue;
    if (nodes.has(funder)) {
      link(f.wallet, funder, 'funded_by', `first funded by ${funder}`);
    }
    const list = byFunder.get(funder) ?? [];
    list.push({ wallet: f.wallet, at: f.firstFunding.at });
    byFunder.set(funder, list);
  }
  for (const [funder, list] of byFunder) {
    list.sort((x, y) => x.at - y.at || compareAddress(x.wallet, y.wallet));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const cur = list[i]!;
      if (cur.at - prev.at <= cfg.fundingWindowSec) {
        link(prev.wallet, cur.wallet, 'funding', `same funder ${funder} within ${cur.at - prev.at}s`);
      }
    }
  }

  // Early buys: block on the first three launches to avoid comparing everyone.
  const blocks = new Map<string, WalletFacts[]>();
  for (const f of facts) {
    const buys = f.earlyBuys.slice(0, cfg.earlyBuyCount);
    if (buys.length < cfg.earlyBuyMin) continue;
    const key = buys
      .slice(0, 3)
      .map((b) => b.launchId)
      .join('|');
    const list = blocks.get(key) ?? [];
    list.push(f);
    blocks.set(key, list);
  }
  for (const list of blocks.values()) {
    list.sort((x, y) => compareAddress(x.wallet, y.wallet));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const ratio = earlyBuyMatch(a, b, config);
        if (ratio >= cfg.earlyBuyMatchRatio) {
          link(a.wallet, b.wallet, 'early_buys', `${Math.round(ratio * 100)}% identical early buys`);
        }
      }
    }
  }

  // Assemble per-wallet info.
  const detectedSize = new Map<Address, number>();
  for (const members of detected.groups().values()) {
    for (const m of members) detectedSize.set(m, members.length);
  }
  const edgesByWallet = new Map<Address, ClusterEdge[]>();
  for (const e of edges) {
    for (const w of [e.a, e.b]) {
      const list = edgesByWallet.get(w) ?? [];
      list.push(e);
      edgesByWallet.set(w, list);
    }
  }

  const out = new Map<Address, ClusterInfo>();
  const full = Math.max(2, cfg.fullPenaltyClusterSize);
  for (const [root, members] of all.groups()) {
    let penalty = 0;
    for (const m of members) {
      const size = detectedSize.get(m) ?? 1;
      penalty = Math.max(penalty, clamp((size - 1) / (full - 1), 0, 1));
    }
    for (const m of members) {
      out.set(m, {
        clusterId: root,
        size: members.length,
        detectedSize: detectedSize.get(m) ?? 1,
        sybilScore: penalty,
        edges: edgesByWallet.get(m) ?? [],
      });
    }
  }
  return out;
}

function earlyBuyMatch(a: WalletFacts, b: WalletFacts, config: ScoringConfig): number {
  const cfg = config.sybil;
  const xa = a.earlyBuys.slice(0, cfg.earlyBuyCount);
  const xb = b.earlyBuys.slice(0, cfg.earlyBuyCount);
  const m = Math.min(xa.length, xb.length);
  if (m < cfg.earlyBuyMin) return 0;
  let matches = 0;
  for (let i = 0; i < m; i++) {
    const pa = xa[i]!;
    const pb = xb[i]!;
    if (pa.launchId === pb.launchId && Math.abs(pa.at - pb.at) <= cfg.earlyBuyWindowSec) matches++;
  }
  return matches / m;
}

/** A cluster for a wallet that was not part of the clustering input. */
export function singletonCluster(wallet: Address): ClusterInfo {
  return { clusterId: wallet, size: 1, detectedSize: 1, sybilScore: 0, edges: [] };
}
