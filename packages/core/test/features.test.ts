import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORING_CONFIG as cfg,
  alignment,
  dumpScore,
  holdQuality,
  marketQuality,
} from '../src/index.js';
import { DAY, HOUR, SPARK, T0, drop, launch, position, wallet } from './fixtures.js';

const sum = (f: { components: { value: number }[] }) => f.components.reduce((s, c) => s + c.value, 0);

describe('hold quality (H)', () => {
  it('falls back to the prior for a brand-new wallet', () => {
    const h = holdQuality(wallet(1), launch(), cfg);
    expect(h.value).toBeCloseTo(cfg.hold.prior);
    expect(h.components.map((c) => c.code)).toEqual(['HOLD_PRIOR']);
  });

  it('ranks holders above dumpers, and components sum to the value', () => {
    const holder = holdQuality(wallet(1, { scoutDrops: [drop(40, 0), drop(20, 0.05)] }), launch(), cfg);
    const dumper = holdQuality(wallet(2, { scoutDrops: [drop(40, 0.9), drop(20, 1)] }), launch(), cfg);
    expect(holder.value).toBeGreaterThan(cfg.hold.prior);
    expect(dumper.value).toBeLessThan(cfg.hold.prior);
    expect(sum(holder)).toBeCloseTo(holder.value, 12);
  });

  it('ignores windows that had not elapsed at asOf', () => {
    const d = { ...drop(0, 1), receivedAt: T0 - 2 * HOUR }; // only the 1h window is observable
    const h = holdQuality(wallet(1, { scoutDrops: [d] }), launch(), cfg);
    // One low-weight window (0.25) of full selling: pulled below the prior but not to zero.
    expect(h.value).toBeGreaterThan(0.2);
    expect(h.value).toBeLessThan(cfg.hold.prior);
  });

  it('does not punish a young graduated position that is still held', () => {
    const young = holdQuality(wallet(1, { positions: [position({ firstBuyAt: T0 - 2 * DAY })] }), launch(), cfg);
    expect(young.value).toBeGreaterThanOrEqual(cfg.hold.prior);
    const flipped = holdQuality(
      wallet(2, { positions: [position({ firstBuyAt: T0 - 20 * DAY, exitedAt: T0 - 20 * DAY + HOUR })] }),
      launch(),
      cfg,
    );
    expect(flipped.value).toBeLessThan(cfg.hold.prior);
  });
});

describe('dump score (D)', () => {
  it('is zero with no history', () => {
    expect(dumpScore(wallet(1), launch(), cfg).value).toBe(0);
  });

  it('one dump does not max out D; repeated dumping does', () => {
    const once = dumpScore(wallet(1, { scoutDrops: [drop(5, 1)] }), launch(), cfg);
    const often = dumpScore(
      wallet(2, { scoutDrops: [drop(5, 1), drop(10, 1), drop(15, 1), drop(20, 1), drop(25, 1)] }),
      launch(),
      cfg,
    );
    expect(once.value).toBeLessThanOrEqual(0.5);
    expect(often.value).toBeGreaterThan(0.75);
    expect(once.components[0]!.code).toBe('DUMPED_1H_LAST_DROP');
  });

  it('decays: an old dump weighs less than a recent one', () => {
    const recent = dumpScore(wallet(1, { scoutDrops: [drop(2, 1)] }), launch(), cfg).value;
    const old = dumpScore(wallet(1, { scoutDrops: [drop(180, 1)] }), launch(), cfg).value;
    expect(old).toBeLessThan(recent);
  });

  it('weighs a 1h dump more than a slow 7d exit', () => {
    const fast = dumpScore(wallet(1, { scoutDrops: [drop(20, 1)] }), launch(), cfg).value;
    const slow = dumpScore(wallet(1, { scoutDrops: [drop(20, 0, 0, 1)] }), launch(), cfg).value;
    expect(slow).toBeLessThan(fast);
    expect(slow).toBeGreaterThan(0);
  });
});

describe('market quality (Q)', () => {
  it('prefers substance lanes and launch-relative fit', () => {
    const substance = marketQuality(
      wallet(1, { positions: [1, 2, 3].map((i) => position({ launchId: `u${i}`, lane: 'utility', pairClass: 'stock' })) }),
      launch(),
      cfg,
    );
    const memes = marketQuality(
      wallet(2, { positions: [1, 2, 3].map((i) => position({ launchId: `m${i}`, lane: 'meme', pairClass: 'eth' })) }),
      launch(),
      cfg,
    );
    expect(substance.value).toBeGreaterThan(memes.value);
    expect(sum(substance)).toBeCloseTo(substance.value, 12);
    // Same meme trader looks better for a meme/eth launch.
    const memeLaunch = marketQuality(
      wallet(2, { positions: [1, 2, 3].map((i) => position({ launchId: `m${i}`, lane: 'meme', pairClass: 'eth' })) }),
      launch({ lane: 'meme', pairClass: 'eth' }),
      cfg,
    );
    expect(memeLaunch.value).toBeGreaterThan(memes.value);
  });
});

describe('alignment (A)', () => {
  it('emits SPARK tier codes at the published thresholds', () => {
    const at = (n: bigint) => alignment(wallet(1, { sparkBalance: n * SPARK }), launch(), cfg).components[0]?.code;
    expect(at(49_999n)).toBeUndefined();
    expect(at(50_000n)).toBe('SPARK_50K');
    expect(at(200_000n)).toBe('SPARK_200K');
    expect(at(5_000_000n)).toBe('SPARK_1M');
  });

  it('rewards charged Vibers, guilds and shipping; punishes rugs', () => {
    const good = alignment(
      wallet(1, {
        viber: { level: 10, lastChargedAt: T0 - DAY },
        guilds: [{ id: 'g', goodStanding: true }],
        createdLaunches: [{ launchId: 'p', lane: 'vibecoded', graduated: true, hasProductLinks: true, flaggedRug: false }],
      }),
      launch(),
      cfg,
    );
    expect(good.components.map((c) => c.code).sort()).toEqual(['GUILD_GOOD_STANDING', 'SHIPPED_SUBSTANCE', 'VIBER_CHARGED']);
    expect(good.value).toBeCloseTo(0.2 + 0.1 + 0.2);

    const stale = alignment(wallet(2, { viber: { level: 10, lastChargedAt: T0 - 90 * DAY } }), launch(), cfg);
    expect(stale.components[0]!.code).toBe('VIBER_HELD');

    const rug = alignment(
      wallet(3, { createdLaunches: [{ launchId: 'r', lane: 'meme', graduated: false, hasProductLinks: false, flaggedRug: true }] }),
      launch(),
      cfg,
    );
    expect(rug.value).toBeLessThan(0);
  });
});
