import {
  type Address,
  type LaunchContext,
  type ScoringConfig,
  TEMPLATES,
  type TemplateId,
  type WalletFacts,
  clusterWallets,
  resolveAllocation,
  resolveWeights,
  scoreWallet,
  singletonCluster,
} from '@scout/core';

/**
 * Scores a labelled population (the simulator's ground truth) and reports how
 * well Scout separates the personas and catches the farms. This is how the
 * weights in ScoringConfig get tuned: change a number, re-run, compare.
 */
export interface EvalInput {
  facts: WalletFacts[];
  labels: Map<Address, { persona: string; farmId?: string }>;
  launch: LaunchContext;
  template: TemplateId;
  slice: bigint;
  config: ScoringConfig;
}

export interface PersonaRow {
  persona: string;
  wallets: number;
  meanScore: number;
  medianScore: number;
  recipients: number;
  /** Share of the allocated amount going to this persona, 0..1. */
  allocationShare: number;
}

export interface FarmRow {
  farmId: string;
  members: number;
  flagged: number;
  recipients: number;
  allocationShare: number;
}

export interface EvalReport {
  template: TemplateId;
  profiles: number;
  allocatedShare: number;
  personas: PersonaRow[];
  farms: FarmRow[];
  /** Non-farm wallets with a sybil penalty. */
  falsePositives: number;
  nonFarmWallets: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function evaluate(input: EvalInput): EvalReport {
  const { facts, labels, launch, config } = input;
  const clusters = clusterWallets(facts, config);
  const weights = resolveWeights(input.template, undefined);
  const scores = new Map(
    facts.map((f) => [f.wallet, scoreWallet(f, launch, clusters.get(f.wallet) ?? singletonCluster(f.wallet), weights, config)]),
  );
  const allocation = resolveAllocation({
    policy: TEMPLATES[input.template].policy,
    launch,
    slice: input.slice,
    wallets: facts,
    config,
  });
  const received = new Map(allocation.recipients.map((r) => [r.wallet, r.amount]));
  const allocated = allocation.allocated > 0n ? allocation.allocated : 1n;
  const share = (ws: Address[]) =>
    Number((ws.reduce((s, w) => s + (received.get(w) ?? 0n), 0n) * 1_000_000n) / allocated) / 1_000_000;

  const byPersona = new Map<string, Address[]>();
  const byFarm = new Map<string, Address[]>();
  for (const f of facts) {
    const label = labels.get(f.wallet) ?? { persona: 'unlabelled' };
    byPersona.set(label.persona, [...(byPersona.get(label.persona) ?? []), f.wallet]);
    if (label.farmId) byFarm.set(label.farmId, [...(byFarm.get(label.farmId) ?? []), f.wallet]);
  }

  const personas: PersonaRow[] = [...byPersona.entries()]
    .map(([persona, ws]) => {
      const s = ws.map((w) => scores.get(w)!.score);
      return {
        persona,
        wallets: ws.length,
        meanScore: s.reduce((a, b) => a + b, 0) / s.length,
        medianScore: median(s),
        recipients: ws.filter((w) => received.has(w)).length,
        allocationShare: share(ws),
      };
    })
    .sort((a, b) => b.meanScore - a.meanScore);

  const farms: FarmRow[] = [...byFarm.entries()]
    .map(([farmId, ws]) => ({
      farmId,
      members: ws.length,
      flagged: ws.filter((w) => (clusters.get(w)?.sybilScore ?? 0) > 0).length,
      recipients: ws.filter((w) => received.has(w)).length,
      allocationShare: share(ws),
    }))
    .sort((a, b) => a.farmId.localeCompare(b.farmId));

  const nonFarm = facts.filter((f) => !labels.get(f.wallet)?.farmId);
  return {
    template: input.template,
    profiles: facts.length,
    allocatedShare: Number((allocation.allocated * 10_000n) / (input.slice || 1n)) / 10_000,
    personas,
    farms,
    falsePositives: nonFarm.filter((f) => (clusters.get(f.wallet)?.sybilScore ?? 0) > 0).length,
    nonFarmWallets: nonFarm.length,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function renderReport(r: EvalReport): string {
  const lines: string[] = [];
  lines.push(`Template: ${r.template}   profiles: ${r.profiles}   slice allocated: ${pct(r.allocatedShare)}`);
  lines.push('');
  lines.push('persona        wallets  mean score  median  recipients  share of allocation');
  for (const p of r.personas) {
    lines.push(
      `${p.persona.padEnd(14)} ${String(p.wallets).padStart(7)}  ${p.meanScore.toFixed(3).padStart(10)}  ${p.medianScore
        .toFixed(3)
        .padStart(6)}  ${String(p.recipients).padStart(10)}  ${pct(p.allocationShare).padStart(19)}`,
    );
  }
  lines.push('');
  lines.push('farm               members  flagged  recipients  share of allocation');
  for (const f of r.farms) {
    lines.push(
      `${f.farmId.padEnd(18)} ${String(f.members).padStart(7)}  ${String(f.flagged).padStart(7)}  ${String(f.recipients).padStart(
        10,
      )}  ${pct(f.allocationShare).padStart(19)}`,
    );
  }
  lines.push('');
  lines.push(`False positives: ${r.falsePositives} of ${r.nonFarmWallets} non-farm wallets carry a sybil penalty`);
  return lines.join('\n');
}
