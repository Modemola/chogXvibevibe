import type { ScoringConfig } from './config.js';
import { computeFeatures } from './features.js';
import type { ClusterInfo } from './sybil.js';
import type {
  Feature,
  LaunchContext,
  Reason,
  ScoreWeights,
  WalletFacts,
  WalletFeatures,
  WalletScore,
} from './types.js';
import { round9 } from './util.js';

/**
 * S(w, L) = αH + βQ + γA − δD − εY
 *
 * Every component of every feature becomes a signed reason, so the reasons
 * always add up to the score (minus the ones too small to show).
 */
export function scoreFeatures(
  features: WalletFeatures,
  weights: ScoreWeights,
  config: ScoringConfig,
): { score: number; reasons: Reason[] } {
  const terms: [Feature, number][] = [
    [features.holdQuality, weights.alpha],
    [features.marketQuality, weights.beta],
    [features.alignment, weights.gamma],
    [features.dumpScore, -weights.delta],
    [features.sybil, -weights.epsilon],
  ];

  let score = 0;
  const all: Reason[] = [];
  for (const [feature, w] of terms) {
    score += w * feature.value;
    for (const c of feature.components) {
      const reason: Reason = { code: c.code, contrib: round9(w * c.value) };
      if (c.detail) reason.detail = c.detail;
      all.push(reason);
    }
  }

  const reasons = all
    .filter((r) => Math.abs(r.contrib) >= config.reasonMinAbs)
    .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib) || a.code.localeCompare(b.code));

  return { score: round9(score), reasons };
}

export function scoreWallet(
  facts: WalletFacts,
  launch: LaunchContext,
  cluster: ClusterInfo,
  weights: ScoreWeights,
  config: ScoringConfig,
): WalletScore {
  const features = computeFeatures(facts, launch, cluster, config);
  const { score, reasons } = scoreFeatures(features, weights, config);
  return { wallet: facts.wallet, score, reasons, features };
}
