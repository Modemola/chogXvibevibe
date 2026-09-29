import { describe, expect, it } from 'vitest';
import { FilterError, evaluateFilter, parseFilter, validateFilter } from '../src/index.js';
import type { WalletFields } from '../src/index.js';

const base: WalletFields = {
  score: 0.5, hold_quality: 0.6, market_quality: 0.4, alignment: 0.3, dump_score: 0.1, sybil_score: 0,
  spark_tier: 2, spark_balance: 250_000, viber_level: 3, viber_charged: true, guild_member: true,
  guild_ids: ['alpha'], scout_drops_received: 2, last_drop_sold_1h: 0, markets_traded: 5,
  stock_pair_markets: 3, graduated_positions: 2, held_substance_days_max: 20, created_launches: 1,
  shipped_substance: true, created_rug: false, cluster_size: 1, in_creator_cluster: false,
};

const ev = (src: string, over: Partial<WalletFields> = {}) => evaluateFilter(parseFilter(src), { ...base, ...over });

describe('filter language', () => {
  it('parses comparisons, AND/OR/NOT with precedence and parens', () => {
    expect(ev('spark_tier >= 1 AND dump_score < 0.25')).toBe(true);
    expect(ev('spark_tier >= 3 OR dump_score < 0.25 AND hold_quality > 0.5')).toBe(true);
    expect(ev('(spark_tier >= 3 OR dump_score < 0.25) AND hold_quality > 0.9')).toBe(false);
    expect(ev('NOT created_rug')).toBe(true);
    expect(ev('not shipped_substance or spark_tier == 2')).toBe(true);
  });

  it('treats a bare boolean field as == true', () => {
    expect(parseFilter('shipped_substance')).toEqual({ field: 'shipped_substance', op: '==', value: true });
    expect(ev('shipped_substance', { shipped_substance: false })).toBe(false);
  });

  it('supports HAS on list fields with either quote style', () => {
    expect(ev("guild_ids HAS 'alpha'")).toBe(true);
    expect(ev('guild_ids has "beta"')).toBe(false);
  });

  it('rejects unknown fields, bad operators, bad types and junk', () => {
    expect(() => parseFilter('wallet_age > 3')).toThrow(FilterError);
    expect(() => parseFilter('shipped_substance > 1')).toThrow(/not valid/);
    expect(() => parseFilter("spark_tier >= 'high'")).toThrow(/compares against a number/);
    expect(() => parseFilter('spark_tier >= 1 AND')).toThrow(FilterError);
    expect(() => parseFilter('(spark_tier >= 1')).toThrow(/Missing \)/);
    expect(() => parseFilter('spark_tier >= 1 spark_tier')).toThrow(/trailing/);
    expect(() => parseFilter('')).toThrow(/Empty/);
    expect(() => parseFilter('spark_tier ; 1')).toThrow(FilterError);
  });

  it('validates JSON ASTs the same way', () => {
    expect(() => validateFilter({ field: 'nope' as never, op: '>', value: 1 })).toThrow(/Unknown field/);
    expect(validateFilter({ and: [{ field: 'spark_tier', op: '>=', value: 1 }] })).toBeTruthy();
  });

  it('parses negative and decimal numbers', () => {
    expect(ev('alignment > -0.5')).toBe(true);
    expect(ev('score >= .5')).toBe(true);
  });
});
