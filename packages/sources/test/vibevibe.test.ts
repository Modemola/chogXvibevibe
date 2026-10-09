import { describe, expect, it } from 'vitest';
import { type RawLog, VV_TOPICS, decodeGraduation, decodeLaunch, decodeTrade } from '../src/vibevibe.js';
import receipts from './fixtures/vibevibe-receipts.json' with { type: 'json' };

/**
 * Decoders checked against real Robinhood Chain testnet receipts, recorded in fixtures:
 * the $SCOUT launch, a buy and a sell through the router, and a graduation.
 */
const R = receipts as unknown as Record<string, { from: string; logs: RawLog[] }>;
const E18 = 10n ** 18n;
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const find = (k: string, topic: string) => R[k]!.logs.find((l) => l.topics[0] === topic)!;
/** Token amount moved to/from `who` by the token's own Transfer logs in the same receipt. */
const transferred = (k: string, token: string, from: string, to: string) =>
  R[k]!.logs.filter((l) => l.topics[0] === TRANSFER && l.address.toLowerCase() === token && l.topics[1]!.endsWith(from.slice(2)) && l.topics[2]!.endsWith(to.slice(2)))
    .reduce((s, l) => s + BigInt(l.data), 0n);

describe('vibe/vibe decoders', () => {
  it('decodes the $SCOUT launch', () => {
    const l = decodeLaunch(find('scoutLaunch', VV_TOPICS.launched));
    expect(l).toMatchObject({
      id: 8422n,
      creator: '0x3acb6d0cb65532a90665330f5ff4cbc0c68cd185',
      token: '0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de',
      pool: '0x90dbcadd611784273b3fd14633274e1c762bbb30',
      name: 'Graduation Scout',
      symbol: 'SCOUT',
      pairClass: 'eth',
      taxBps: 100,
      graduationTarget: 4n * E18,
    });
    expect(l.pairToken).toBeUndefined();
    expect(l.uri).toMatch(/^ipfs:\/\//);
  });

  it('decodes the creator buy at launch: 10,000,000 SCOUT to the creator', () => {
    const t = decodeTrade(find('scoutLaunch', VV_TOPICS.launchBuy))!;
    expect(t).toMatchObject({ side: 'buy', wallet: '0x3acb6d0cb65532a90665330f5ff4cbc0c68cd185', tokenAmount: 10_000_000n * E18 });
    expect(transferred('scoutLaunch', '0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de', t.pool, t.wallet)).toBe(t.tokenAmount);
  });

  it('decodes a buy through the router: the buyer, not the router, and the tokens they received', () => {
    const t = decodeTrade(find('buyViaRouter', VV_TOPICS.buy))!;
    expect(t.side).toBe('buy');
    expect(t.wallet).toBe(R.buyViaRouter!.from.toLowerCase());
    expect(transferred('buyViaRouter', '0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de', t.pool, t.wallet)).toBe(t.tokenAmount);
    expect(t.quoteAmount).toBe(298923874053407732n); // + 0.001076 ETH fee = the 0.3 ETH sent
  });

  it('decodes a sell through the router: the seller and the tokens they put in', () => {
    const t = decodeTrade(find('sellViaRouter', VV_TOPICS.sell))!;
    expect(t.side).toBe('sell');
    expect(t.wallet).toBe(R.sellViaRouter!.from.toLowerCase());
    expect(transferred('sellViaRouter', '0x0a272e5ee3f48c668ccf30e65e7738099ae0a1de', t.wallet, t.pool)).toBe(t.tokenAmount);
  });

  it('decodes a graduation at the 4 ETH target', () => {
    const g = decodeGraduation(find('graduation', VV_TOPICS.graduated))!;
    expect(g.quoteAmount).toBe(4n * E18);
    expect(g.tokenAmount).toBe(200_000_000n * E18);
    // The graduating pool also emitted the buy that pushed it over the line.
    expect(decodeTrade(find('graduation', VV_TOPICS.buy))!.pool).toBe(g.pool);
  });

  it('ignores logs that are not trades', () => {
    expect(decodeTrade(find('graduation', VV_TOPICS.graduated))).toBeUndefined();
    expect(decodeGraduation(find('buyViaRouter', VV_TOPICS.buy))).toBeUndefined();
  });
});
