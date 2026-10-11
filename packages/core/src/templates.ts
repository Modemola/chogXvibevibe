import type { PolicyInput, TemplateId } from './policy.js';
import type { ScoreWeights } from './types.js';

export const DEFAULT_WEIGHTS: ScoreWeights = { alpha: 0.4, beta: 0.2, gamma: 0.4, delta: 0.8, epsilon: 1 };

export interface Template {
  id: TemplateId;
  name: string;
  description: string;
  weights: ScoreWeights;
  /** A ready-to-use policy. Creators start here and edit. */
  policy: PolicyInput;
}

const COMMON_EXCLUDES = ['sybil_score >= 0.8'];

export const TEMPLATES: Record<TemplateId, Template> = {
  spark_core: {
    id: 'spark_core',
    name: 'SPARK Core',
    description: 'SPARK snapshot holders only, weighted by tier, with anti-sybil.',
    weights: { alpha: 0.2, beta: 0.1, gamma: 0.7, delta: 0.5, epsilon: 1 },
    policy: {
      version: 1,
      template: 'spark_core',
      buckets: [{ id: 'spark', weightBps: 10_000, filter: 'spark_tier >= 1' }],
      excludes: COMMON_EXCLUDES,
    },
  },
  hold_or_die: {
    id: 'hold_or_die',
    name: 'Hold or Die',
    description: 'Rewards wallets that held previous Scout drops. 1h sellers are cut.',
    weights: { alpha: 0.6, beta: 0.1, gamma: 0.3, delta: 1.2, epsilon: 1 },
    policy: {
      version: 1,
      template: 'hold_or_die',
      buckets: [
        { id: 'holders', weightBps: 5_000, filter: 'scout_drops_received >= 1 AND dump_score < 0.25 AND hold_quality >= 0.5' },
        { id: 'spark', weightBps: 3_000, filter: 'spark_tier >= 1 AND dump_score < 0.5' },
        { id: 'builders', weightBps: 2_000, filter: 'shipped_substance' },
      ],
      excludes: [...COMMON_EXCLUDES, 'last_drop_sold_1h >= 0.8'],
      fallbackBucket: 'holders',
    },
  },
  builder_lane: {
    id: 'builder_lane',
    name: 'Builder Lane',
    description: 'Boosts wallets that shipped products with live links, and patient holders of substance launches.',
    weights: { alpha: 0.3, beta: 0.3, gamma: 0.4, delta: 0.6, epsilon: 1 },
    policy: {
      version: 1,
      template: 'builder_lane',
      buckets: [
        { id: 'builders', weightBps: 5_000, filter: 'shipped_substance' },
        { id: 'substance_holders', weightBps: 3_000, filter: 'held_substance_days_max >= 14' },
        { id: 'spark', weightBps: 2_000, filter: 'spark_tier >= 1' },
      ],
      excludes: [...COMMON_EXCLUDES, 'created_rug'],
      fallbackBucket: 'substance_holders',
    },
  },
  stock_pair_natives: {
    id: 'stock_pair_natives',
    name: 'Stock Pair Natives',
    description: 'Boosts traders who actually trade stock-paired launches, not only ETH pairs.',
    weights: { alpha: 0.35, beta: 0.45, gamma: 0.2, delta: 0.7, epsilon: 1 },
    policy: {
      version: 1,
      template: 'stock_pair_natives',
      buckets: [
        { id: 'natives', weightBps: 7_000, filter: 'stock_pair_markets >= 3 AND stock_pair_share >= 0.5' },
        { id: 'spark', weightBps: 3_000, filter: 'spark_tier >= 1' },
      ],
      excludes: COMMON_EXCLUDES,
      fallbackBucket: 'natives',
    },
  },
  chog_holders: {
    id: 'chog_holders',
    name: 'Chog Holders',
    description: 'vibe/vibe × Chog: Chog Genesis holders who stay get the drop; long-time Chogs get extra.',
    weights: { alpha: 0.4, beta: 0.1, gamma: 0.5, delta: 1, epsilon: 1 },
    policy: {
      version: 1,
      template: 'chog_holders',
      buckets: [
        { id: 'chogs', weightBps: 6_000, filter: 'chog_holder AND dump_score < 0.5' },
        { id: 'long_chogs', weightBps: 2_500, filter: 'chog_held_days >= 30 AND dump_score < 0.5' },
        { id: 'holders', weightBps: 1_500, filter: 'scout_drops_received >= 1 AND dump_score < 0.25 AND hold_quality >= 0.5' },
      ],
      excludes: [...COMMON_EXCLUDES, 'last_drop_sold_1h >= 0.8', 'created_rug'],
      fallbackBucket: 'chogs',
    },
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    description: 'Your own buckets, filters, caps and weights.',
    weights: DEFAULT_WEIGHTS,
    policy: {
      version: 1,
      template: 'custom',
      buckets: [
        { id: 'spark', weightBps: 4_000, filter: 'spark_tier >= 1' },
        { id: 'holders', weightBps: 4_000, filter: 'dump_score < 0.25 AND hold_quality > 0.5' },
        { id: 'builders', weightBps: 2_000, filter: 'shipped_substance' },
      ],
      excludes: COMMON_EXCLUDES,
    },
  },
};

export function resolveWeights(template: TemplateId, overrides?: Partial<ScoreWeights>): ScoreWeights {
  return { ...TEMPLATES[template].weights, ...overrides };
}
