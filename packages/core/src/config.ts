import type { Lane } from './types.js';

/**
 * Every tunable number in the scoring model lives here. The config is
 * published with each allocation (by version + hash) so anyone can re-derive
 * a result. Change numbers by shipping a new version, never in place.
 */
export interface ScoringConfig {
  version: string;

  spark: {
    /** Tier thresholds in whole SPARK, ascending. Index 0 = tier 1. */
    tierThresholds: number[];
    /** Alignment contribution per tier, same indexing. */
    tierAlignment: number[];
    decimals: number;
  };

  hold: {
    /** Retention measured at a later window counts more. */
    windowWeight: { h1: number; h24: number; d7: number; d30: number };
    /** Weight of a non-airdrop position in a graduated launch. */
    positionWeight: number;
    /** Days held for a graduated position to count as full retention. */
    positionFullDays: number;
    halfLifeDays: number;
    prior: number;
    priorStrength: number;
  };

  market: {
    laneQuality: Record<Lane, number>;
    stockPairBonus: number;
    mixWeight: number;
    affinityWeight: number;
    prior: number;
    priorStrength: number;
  };

  alignment: {
    viberChargedBase: number;
    viberLevelBonus: number;
    viberMaxLevel: number;
    viberChargeFreshDays: number;
    viberHeld: number;
    guildGoodStanding: number;
    shippedSubstance: number;
    creatorRug: number;
  };

  dump: {
    /** d = w1h*sold1h + w24h*(sold24h-sold1h)+ + w7d*(sold7d-sold24h)+, capped at 1. */
    w1h: number;
    w24h: number;
    w7d: number;
    halfLifeDays: number;
    /** Pseudo-count of clean history. One dump alone cannot max D out. */
    priorStrength: number;
    /** A last drop with at least this much sold in 1h gets its own reason code. */
    lastDropFlagBps: number;
  };

  sybil: {
    /** Two wallets funded by the same funder within this many seconds are linked. */
    fundingWindowSec: number;
    /** Funders never used as a link (CEX hot wallets, bridges, faucets). */
    ignoredFunders: string[];
    /** How many early buys to compare. */
    earlyBuyCount: number;
    /** Minimum early buys both wallets need before comparing. */
    earlyBuyMin: number;
    /** Same launch at the same position within this many seconds = a match. */
    earlyBuyWindowSec: number;
    /** Fraction of positions that must match to link two wallets. */
    earlyBuyMatchRatio: number;
    /** Undeclared cluster size at which the sybil penalty reaches 1. */
    fullPenaltyClusterSize: number;
  };

  /** Contributions smaller than this are left out of the reason list. */
  reasonMinAbs: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  version: 'scout-scoring-v1',

  spark: {
    // Placeholder tiers. 200k matches the announced "200k SPARK = 1 Viber".
    tierThresholds: [50_000, 200_000, 1_000_000],
    tierAlignment: [0.2, 0.35, 0.5],
    decimals: 18,
  },

  hold: {
    windowWeight: { h1: 0.25, h24: 0.5, d7: 0.85, d30: 1 },
    positionWeight: 0.5,
    positionFullDays: 14,
    halfLifeDays: 60,
    prior: 0.35,
    priorStrength: 1.5,
  },

  market: {
    laneQuality: { utility: 1, rwa: 1, vibecoded: 1, art: 0.5, meme: 0.3 },
    stockPairBonus: 0.2,
    mixWeight: 0.6,
    affinityWeight: 0.4,
    prior: 0.3,
    priorStrength: 2,
  },

  alignment: {
    viberChargedBase: 0.1,
    viberLevelBonus: 0.1,
    viberMaxLevel: 10,
    viberChargeFreshDays: 30,
    viberHeld: 0.05,
    guildGoodStanding: 0.1,
    shippedSubstance: 0.2,
    creatorRug: -0.3,
  },

  dump: {
    w1h: 1,
    w24h: 0.5,
    w7d: 0.2,
    halfLifeDays: 45,
    priorStrength: 1,
    lastDropFlagBps: 5_000,
  },

  sybil: {
    fundingWindowSec: 30 * 60,
    ignoredFunders: [],
    earlyBuyCount: 10,
    earlyBuyMin: 5,
    earlyBuyWindowSec: 120,
    earlyBuyMatchRatio: 0.8,
    fullPenaltyClusterSize: 5,
  },

  reasonMinAbs: 0.005,
};
