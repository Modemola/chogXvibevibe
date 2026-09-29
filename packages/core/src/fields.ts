import type { ScoringConfig } from './config.js';
import { SUBSTANCE_LANES, elapsedSold, sparkTierIndex } from './features.js';
import type { ClusterInfo } from './sybil.js';
import type { LaunchContext, WalletFacts, WalletScore } from './types.js';
import { DAY, toWhole } from './util.js';

/**
 * The flat record policy filters run against. Every field a creator can
 * reference in a filter is listed in `FIELD_TYPES`; anything else is a
 * validation error, not a silent false.
 */
export interface WalletFields {
  score: number;
  hold_quality: number;
  market_quality: number;
  alignment: number;
  dump_score: number;
  sybil_score: number;
  spark_tier: number;
  spark_balance: number;
  viber_level: number;
  viber_charged: boolean;
  guild_member: boolean;
  guild_ids: string[];
  scout_drops_received: number;
  last_drop_sold_1h: number;
  markets_traded: number;
  stock_pair_markets: number;
  /** Fraction of markets traded that are stock-paired, 0..1. */
  stock_pair_share: number;
  graduated_positions: number;
  held_substance_days_max: number;
  created_launches: number;
  shipped_substance: boolean;
  created_rug: boolean;
  cluster_size: number;
  in_creator_cluster: boolean;
}

export type FieldType = 'number' | 'boolean' | 'string[]';

export const FIELD_TYPES: Record<keyof WalletFields, FieldType> = {
  score: 'number',
  hold_quality: 'number',
  market_quality: 'number',
  alignment: 'number',
  dump_score: 'number',
  sybil_score: 'number',
  spark_tier: 'number',
  spark_balance: 'number',
  viber_level: 'number',
  viber_charged: 'boolean',
  guild_member: 'boolean',
  guild_ids: 'string[]',
  scout_drops_received: 'number',
  last_drop_sold_1h: 'number',
  markets_traded: 'number',
  stock_pair_markets: 'number',
  stock_pair_share: 'number',
  graduated_positions: 'number',
  held_substance_days_max: 'number',
  created_launches: 'number',
  shipped_substance: 'boolean',
  created_rug: 'boolean',
  cluster_size: 'number',
  in_creator_cluster: 'boolean',
};

export function computeFields(
  facts: WalletFacts,
  scored: WalletScore,
  cluster: ClusterInfo,
  launch: LaunchContext,
  inCreatorCluster: boolean,
  config: ScoringConfig,
): WalletFields {
  const asOf = launch.asOf;
  const f = scored.features;
  const positions = facts.positions.filter((p) => p.firstBuyAt <= asOf);
  const drops = facts.scoutDrops
    .filter((d) => d.receivedAt <= asOf)
    .sort((a, b) => b.receivedAt - a.receivedAt);
  const lastDrop = drops[0];

  let heldSubstanceDays = 0;
  for (const p of positions) {
    if (!SUBSTANCE_LANES.has(p.lane)) continue;
    const end = p.exitedAt !== undefined && p.exitedAt <= asOf ? p.exitedAt : asOf;
    heldSubstanceDays = Math.max(heldSubstanceDays, (end - p.firstBuyAt) / DAY);
  }

  const charged = facts.viber?.lastChargedAt;
  const stockMarkets = positions.filter((p) => p.pairClass === 'stock').length;

  return {
    score: scored.score,
    hold_quality: f.holdQuality.value,
    market_quality: f.marketQuality.value,
    alignment: f.alignment.value,
    dump_score: f.dumpScore.value,
    sybil_score: f.sybil.value,
    spark_tier: sparkTierIndex(facts, config) + 1,
    spark_balance: toWhole(facts.sparkBalance, config.spark.decimals),
    viber_level: facts.viber?.level ?? 0,
    viber_charged:
      charged !== undefined &&
      charged <= asOf &&
      asOf - charged <= config.alignment.viberChargeFreshDays * DAY,
    guild_member: facts.guilds.some((g) => g.goodStanding),
    guild_ids: facts.guilds.filter((g) => g.goodStanding).map((g) => g.id),
    scout_drops_received: drops.length,
    last_drop_sold_1h: lastDrop ? (elapsedSold(lastDrop, asOf).h1 ?? 0) : 0,
    markets_traded: positions.length,
    stock_pair_markets: stockMarkets,
    stock_pair_share: positions.length ? stockMarkets / positions.length : 0,
    graduated_positions: positions.filter((p) => p.graduated).length,
    held_substance_days_max: heldSubstanceDays,
    created_launches: facts.createdLaunches.length,
    shipped_substance: facts.createdLaunches.some(
      (c) => SUBSTANCE_LANES.has(c.lane) && c.graduated && c.hasProductLinks && !c.flaggedRug,
    ),
    created_rug: facts.createdLaunches.some((c) => c.flaggedRug),
    cluster_size: cluster.size,
    in_creator_cluster: inCreatorCluster,
  };
}
