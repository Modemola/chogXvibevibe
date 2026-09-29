import { z } from 'zod';
import { type FilterExpr, FilterError, compileFilter } from './filter.js';
import type { Address, ScoreWeights } from './types.js';
import { hashJson, normalizeAddress } from './util.js';

/**
 * A Launch Policy: the creator's rules for who gets the graduation slice.
 * Policies are data. They are validated, normalized and content-hashed so the
 * hash can be stored on-chain next to the Merkle root.
 */

export const TEMPLATE_IDS = [
  'spark_core',
  'hold_or_die',
  'builder_lane',
  'stock_pair_natives',
  'custom',
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const filterInput = z.union([z.string().min(1).max(1_000), z.custom<FilterExpr>((v) => typeof v === 'object' && v !== null)]);

const address = z.string().transform((v, ctx) => {
  try {
    return normalizeAddress(v);
  } catch {
    ctx.addIssue({ code: 'custom', message: `Invalid address: ${v}` });
    return z.NEVER;
  }
});

const bucketSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/, 'bucket id: lowercase letters, digits, _ or -, max 32'),
  weightBps: z.number().int().min(1).max(10_000),
  filter: filterInput.optional(),
  allowlist: z.array(address).max(10_000).optional(),
  distribution: z.enum(['score', 'equal']).optional(),
  maxRecipients: z.number().int().min(1).max(10_000).optional(),
  minScore: z.number().optional(),
});

const weightsSchema = z
  .object({
    alpha: z.number().min(0).max(10),
    beta: z.number().min(0).max(10),
    gamma: z.number().min(0).max(10),
    delta: z.number().min(0).max(10),
    epsilon: z.number().min(0).max(10),
  })
  .partial();

export const policySchema = z
  .object({
    version: z.literal(1),
    template: z.enum(TEMPLATE_IDS).default('custom'),
    weights: weightsSchema.optional(),
    buckets: z.array(bucketSchema).min(1).max(10),
    caps: z
      .object({
        perWalletBps: z.number().int().min(1).max(10_000),
        perClusterBps: z.number().int().min(1).max(10_000),
      })
      .default({ perWalletBps: 50, perClusterBps: 80 }),
    excludes: z.array(filterInput).max(20).default([]),
    minScore: z.number().optional(),
    fallbackBucket: z.string().optional(),
  })
  .superRefine((p, ctx) => {
    const total = p.buckets.reduce((s, b) => s + b.weightBps, 0);
    if (total !== 10_000) {
      ctx.addIssue({ code: 'custom', message: `bucket weights must sum to 10000 bps, got ${total}`, path: ['buckets'] });
    }
    const ids = new Set<string>();
    for (const b of p.buckets) {
      if (ids.has(b.id)) ctx.addIssue({ code: 'custom', message: `duplicate bucket id '${b.id}'`, path: ['buckets'] });
      ids.add(b.id);
    }
    if (p.fallbackBucket !== undefined && !ids.has(p.fallbackBucket)) {
      ctx.addIssue({ code: 'custom', message: `fallbackBucket '${p.fallbackBucket}' is not a bucket`, path: ['fallbackBucket'] });
    }
    if (p.caps.perClusterBps < p.caps.perWalletBps) {
      ctx.addIssue({ code: 'custom', message: 'perClusterBps must be >= perWalletBps', path: ['caps'] });
    }
  });

export type PolicyInput = z.input<typeof policySchema>;
type ParsedPolicy = z.output<typeof policySchema>;

export interface CompiledBucket {
  id: string;
  weightBps: number;
  filter?: FilterExpr;
  allowlist?: Address[];
  distribution: 'score' | 'equal';
  maxRecipients: number;
  minScore?: number;
}

/** A validated policy with filters parsed and defaults filled in. */
export interface Policy {
  version: 1;
  template: TemplateId;
  weights?: Partial<ScoreWeights>;
  buckets: CompiledBucket[];
  caps: { perWalletBps: number; perClusterBps: number };
  excludes: FilterExpr[];
  minScore?: number;
  fallbackBucket?: string;
}

export const DEFAULT_MAX_RECIPIENTS = 500;

export class PolicyError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
  }
}

export function compilePolicy(input: unknown): Policy {
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'policy'}: ${i.message}`);
    throw new PolicyError(`Invalid policy: ${issues.join('; ')}`, issues);
  }
  const p: ParsedPolicy = parsed.data;
  const issues: string[] = [];
  const compile = (f: string | FilterExpr, where: string): FilterExpr | undefined => {
    try {
      return compileFilter(f);
    } catch (e) {
      if (e instanceof FilterError) {
        issues.push(`${where}: ${e.message}`);
        return undefined;
      }
      throw e;
    }
  };

  const buckets: CompiledBucket[] = p.buckets.map((b, i) => {
    const out: CompiledBucket = {
      id: b.id,
      weightBps: b.weightBps,
      distribution: b.distribution ?? (b.allowlist ? 'equal' : 'score'),
      maxRecipients: b.maxRecipients ?? DEFAULT_MAX_RECIPIENTS,
    };
    if (b.filter !== undefined) {
      const f = compile(b.filter, `buckets.${i}.filter`);
      if (f) out.filter = f;
    }
    if (b.allowlist) out.allowlist = [...new Set(b.allowlist)].sort() as Address[];
    if (b.minScore !== undefined) out.minScore = b.minScore;
    return out;
  });
  const excludes = p.excludes.map((f, i) => compile(f, `excludes.${i}`)).filter((f) => f !== undefined);
  if (issues.length) throw new PolicyError(`Invalid policy: ${issues.join('; ')}`, issues);

  const policy: Policy = { version: 1, template: p.template, buckets, caps: p.caps, excludes };
  if (p.weights) policy.weights = p.weights;
  if (p.minScore !== undefined) policy.minScore = p.minScore;
  if (p.fallbackBucket !== undefined) policy.fallbackBucket = p.fallbackBucket;
  return policy;
}

/** Content hash of the compiled policy. Filters are hashed as ASTs, so formatting doesn't matter. */
export function policyHash(policy: Policy): `0x${string}` {
  return hashJson(policy);
}
