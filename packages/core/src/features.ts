import type { ScoringConfig } from './config.js';
import type { ClusterInfo } from './sybil.js';
import type {
  DropOutcome,
  Feature,
  FeatureComponent,
  Lane,
  LaunchContext,
  SoldByWindow,
  WalletFacts,
  WalletFeatures,
} from './types.js';
import { DAY, clamp, decayWeight, toWhole } from './util.js';

export const SUBSTANCE_LANES: ReadonlySet<Lane> = new Set(['utility', 'rwa', 'vibecoded']);

const WINDOWS = [
  ['h1', 3_600],
  ['h24', DAY],
  ['d7', 7 * DAY],
  ['d30', 30 * DAY],
] as const satisfies readonly (readonly [keyof SoldByWindow, number])[];

type WindowKey = keyof SoldByWindow;

/** Sold fractions (0..1) for windows that have both elapsed by `asOf` and been measured. */
export function elapsedSold(drop: DropOutcome, asOf: number): Partial<Record<WindowKey, number>> {
  const out: Partial<Record<WindowKey, number>> = {};
  for (const [key, len] of WINDOWS) {
    const v = drop.sold[key];
    if (v !== undefined && drop.receivedAt + len <= asOf) out[key] = clamp(v / 10_000, 0, 1);
  }
  return out;
}

function latestWindow(sold: Partial<Record<WindowKey, number>>): WindowKey | undefined {
  let last: WindowKey | undefined;
  for (const [key] of WINDOWS) if (sold[key] !== undefined) last = key;
  return last;
}

function feature(components: FeatureComponent[], lo: number, hi: number, capCode: string): Feature {
  const kept = components.filter((c) => c.value !== 0);
  const sum = kept.reduce((s, c) => s + c.value, 0);
  const value = clamp(sum, lo, hi);
  if (value !== sum) kept.push({ code: capCode, value: value - sum, detail: `clamped to ${value}` });
  return { value, components: kept };
}

const fmt = (x: number) => (Math.round(x * 100) / 100).toString();

/** H: how well this wallet held airdrops and graduated positions. */
export function holdQuality(facts: WalletFacts, launch: LaunchContext, config: ScoringConfig): Feature {
  const cfg = config.hold;
  const asOf = launch.asOf;

  let dropW = 0;
  let dropWR = 0;
  let dropN = 0;
  for (const drop of facts.scoutDrops) {
    if (drop.receivedAt > asOf) continue;
    const sold = elapsedSold(drop, asOf);
    const last = latestWindow(sold);
    if (!last) continue;
    const w = cfg.windowWeight[last] * decayWeight(asOf - drop.receivedAt, cfg.halfLifeDays);
    dropW += w;
    dropWR += w * (1 - sold[last]!);
    dropN++;
  }

  let posW = 0;
  let posWR = 0;
  let posN = 0;
  for (const p of facts.positions) {
    if (!p.graduated || p.firstBuyAt > asOf) continue;
    const exited = p.exitedAt !== undefined && p.exitedAt <= asOf;
    const end = exited ? p.exitedAt! : asOf;
    const frac = clamp((end - p.firstBuyAt) / (cfg.positionFullDays * DAY), 0, 1);
    const decay = decayWeight(asOf - p.firstBuyAt, cfg.halfLifeDays);
    // A young position still being held is partial evidence of full retention;
    // an exited one is full evidence of partial retention.
    const w = cfg.positionWeight * decay * (exited ? 1 : frac);
    const r = exited ? frac : 1;
    posW += w;
    posWR += w * r;
    posN++;
  }

  const k = cfg.priorStrength;
  const denom = dropW + posW + k;
  return feature(
    [
      {
        code: 'HOLD_SCOUT_DROPS',
        value: dropWR / denom,
        detail: dropN ? `${dropN} Scout drops, ${fmt(dropWR / dropW)} avg retention` : undefined,
      },
      {
        code: 'HOLD_GRAD_POSITIONS',
        value: posWR / denom,
        detail: posN ? `${posN} graduated positions` : undefined,
      },
      { code: 'HOLD_PRIOR', value: (k * cfg.prior) / denom, detail: 'baseline for thin history' },
    ],
    0,
    1,
    'HOLD_CAP',
  );
}

/** Q: quality of markets the wallet trades, and fit with this launch's lane/pair. */
export function marketQuality(
  facts: WalletFacts,
  launch: LaunchContext,
  config: ScoringConfig,
): Feature {
  const cfg = config.market;
  const positions = facts.positions.filter((p) => p.firstBuyAt <= launch.asOf);
  const n = positions.length;
  const k = cfg.priorStrength;

  let mix = 0;
  let affinity = 0;
  if (n > 0) {
    const totalVol = positions.reduce((s, p) => s + Math.max(0, p.volumeUsd), 0);
    const weight = (p: (typeof positions)[number]) =>
      totalVol > 0 ? Math.max(0, p.volumeUsd) / totalVol : 1 / n;
    for (const p of positions) {
      const w = weight(p);
      const q = cfg.laneQuality[p.lane] + (p.pairClass === 'stock' ? cfg.stockPairBonus : 0);
      mix += w * clamp(q, 0, 1);
      affinity += w * (0.5 * Number(p.lane === launch.lane) + 0.5 * Number(p.pairClass === launch.pairClass));
    }
  }

  const scale = n / (n + k);
  return feature(
    [
      {
        code: 'MARKET_QUALITY_MIX',
        value: scale * cfg.mixWeight * mix,
        detail: n ? `${n} markets, ${fmt(mix)} lane quality` : undefined,
      },
      {
        code: 'LANE_AFFINITY',
        value: scale * cfg.affinityWeight * affinity,
        detail: n ? `${fmt(affinity)} fit with ${launch.lane}/${launch.pairClass}` : undefined,
      },
      { code: 'MARKET_PRIOR', value: (k * cfg.prior) / (n + k), detail: 'baseline for thin history' },
    ],
    0,
    1,
    'MARKET_CAP',
  );
}

/** Index into `tierThresholds` (0-based), or -1 below tier 1. */
export function sparkTierIndex(facts: WalletFacts, config: ScoringConfig): number {
  const whole = toWhole(facts.sparkBalance, config.spark.decimals);
  let tier = -1;
  config.spark.tierThresholds.forEach((t, i) => {
    if (whole >= t) tier = i;
  });
  return tier;
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${n / 1_000}K`;
  return `${n}`;
}

/** A: SPARK tier, Viber status, guild standing, shipping record. */
export function alignment(facts: WalletFacts, launch: LaunchContext, config: ScoringConfig): Feature {
  const cfg = config.alignment;
  const components: FeatureComponent[] = [];

  const tier = sparkTierIndex(facts, config);
  if (tier >= 0) {
    const threshold = config.spark.tierThresholds[tier]!;
    components.push({
      code: `SPARK_${compact(threshold)}`,
      value: config.spark.tierAlignment[tier] ?? 0,
      detail: `SPARK tier ${tier + 1}`,
    });
  }

  if (facts.viber) {
    const charged = facts.viber.lastChargedAt;
    const fresh =
      charged !== undefined &&
      charged <= launch.asOf &&
      launch.asOf - charged <= cfg.viberChargeFreshDays * DAY;
    if (fresh) {
      const level = clamp(facts.viber.level, 0, cfg.viberMaxLevel);
      components.push({
        code: 'VIBER_CHARGED',
        value: cfg.viberChargedBase + (cfg.viberLevelBonus * level) / cfg.viberMaxLevel,
        detail: `Viber level ${facts.viber.level}, charged recently`,
      });
    } else {
      components.push({ code: 'VIBER_HELD', value: cfg.viberHeld, detail: 'Viber not charged recently' });
    }
  }

  if (facts.guilds.some((g) => g.goodStanding)) {
    components.push({ code: 'GUILD_GOOD_STANDING', value: cfg.guildGoodStanding });
  }

  const shipped = facts.createdLaunches.filter(
    (c) => SUBSTANCE_LANES.has(c.lane) && c.graduated && c.hasProductLinks && !c.flaggedRug,
  );
  if (shipped.length) {
    components.push({
      code: 'SHIPPED_SUBSTANCE',
      value: cfg.shippedSubstance,
      detail: `${shipped.length} graduated ${shipped.length === 1 ? 'product' : 'products'} with live links`,
    });
  }

  if (facts.createdLaunches.some((c) => c.flaggedRug)) {
    components.push({ code: 'CREATOR_RUG', value: cfg.creatorRug, detail: 'created a flagged launch' });
  }

  return feature(components, -1, 1, 'ALIGNMENT_CAP');
}

/** Dump severity of one drop, 0..1, from elapsed windows only. Undefined if nothing elapsed. */
export function dropDumpSeverity(drop: DropOutcome, asOf: number, config: ScoringConfig): number | undefined {
  const sold = elapsedSold(drop, asOf);
  if (latestWindow(sold) === undefined) return undefined;
  const cfg = config.dump;
  const s1 = sold.h1 ?? 0;
  const s24 = sold.h24 ?? s1;
  const s7 = sold.d7 ?? s24;
  return clamp(cfg.w1h * s1 + cfg.w24h * Math.max(0, s24 - s1) + cfg.w7d * Math.max(0, s7 - s24), 0, 1);
}

/** D: recency-weighted dumping of previous Scout airdrops. */
export function dumpScore(facts: WalletFacts, launch: LaunchContext, config: ScoringConfig): Feature {
  const cfg = config.dump;
  const asOf = launch.asOf;
  const evidence = facts.scoutDrops
    .filter((d) => d.receivedAt <= asOf)
    .map((d) => ({ drop: d, severity: dropDumpSeverity(d, asOf, config) }))
    .filter((e): e is { drop: DropOutcome; severity: number } => e.severity !== undefined)
    .sort((a, b) => b.drop.receivedAt - a.drop.receivedAt || a.drop.launchId.localeCompare(b.drop.launchId));

  if (!evidence.length) return { value: 0, components: [] };

  const weights = evidence.map((e) => decayWeight(asOf - e.drop.receivedAt, cfg.halfLifeDays));
  const denom = weights.reduce((s, w) => s + w, 0) + cfg.priorStrength;

  const last = evidence[0]!;
  const lastSold1h = elapsedSold(last.drop, asOf).h1 ?? 0;
  const lastValue = (weights[0]! * last.severity) / denom;
  let restValue = 0;
  for (let i = 1; i < evidence.length; i++) restValue += (weights[i]! * evidence[i]!.severity) / denom;

  return feature(
    [
      {
        code: lastSold1h * 10_000 >= cfg.lastDropFlagBps ? 'DUMPED_1H_LAST_DROP' : 'DUMP_LAST_DROP',
        value: lastValue,
        detail: `${Math.round(lastSold1h * 100)}% sold within 1h of ${last.drop.launchId}`,
      },
      {
        code: 'DUMP_HISTORY',
        value: restValue,
        detail: evidence.length > 1 ? `${evidence.length - 1} earlier drops` : undefined,
      },
    ],
    0,
    1,
    'DUMP_CAP',
  );
}

/** Y: penalty from undeclared wallet clustering. */
export function sybilFeature(cluster: ClusterInfo): Feature {
  if (cluster.sybilScore <= 0) return { value: 0, components: [] };
  return {
    value: cluster.sybilScore,
    components: [
      {
        code: 'SYBIL_CLUSTER',
        value: cluster.sybilScore,
        detail: `${cluster.detectedSize} wallets linked by funding or trade patterns`,
      },
    ],
  };
}

export function computeFeatures(
  facts: WalletFacts,
  launch: LaunchContext,
  cluster: ClusterInfo,
  config: ScoringConfig,
): WalletFeatures {
  return {
    wallet: facts.wallet,
    holdQuality: holdQuality(facts, launch, config),
    marketQuality: marketQuality(facts, launch, config),
    alignment: alignment(facts, launch, config),
    dumpScore: dumpScore(facts, launch, config),
    sybil: sybilFeature(cluster),
  };
}
