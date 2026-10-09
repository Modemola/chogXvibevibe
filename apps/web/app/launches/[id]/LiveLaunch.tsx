import Link from 'next/link';
import { CountUp, Item, Reveal, Stagger, Tilt } from '@/components/motion';
import { PageHead } from '@/components/page-head';
import { date, short } from '@/lib/format';
import { getService } from '@/lib/server';
import { isApiError } from '@/lib/service';

const EXPLORER = 'https://explorer.testnet.chain.robinhood.com';
const PAIR: Record<string, string> = { eth: 'ETH', stock: 'a tokenised stock', other: 'VIBEVIBE' };

/** A real vibe/vibe launch: its facts, and Scout's read of its buyers as counts only. */
export async function LiveLaunch({ id }: { id: string }) {
  let l;
  try {
    l = await (await getService()).liveLaunch(id);
  } catch (e) {
    if (isApiError(e)) return <div className="notice error">{e.message}</div>;
    throw e;
  }
  const { read } = l;
  const share = (n: number) => (read.buyers ? Math.round((n / read.buyers) * 100) : 0);
  const when = l.graduatedAt ? 'before it graduated' : 'so far';
  const symbol = l.symbol.replace(/\*/g, '');
  const cards: [string, number, string, string][] = [
    ['Bought ' + when, read.buyers, 'wallets', ''],
    ['Sold 80%+ within an hour', read.flipped, `${share(read.flipped)}% of buyers`, 'bad'],
    ['Trade in lockstep', read.lockstep, `${share(read.lockstep)}% of buyers`, 'bad'],
    ['Signed up for Scout', read.signedUp, read.signedUp ? 'scored and eligible' : 'none yet', 'good'],
  ];
  return (
    <>
      <PageHead
        kicker={
          <>
            <Link href="/launches" className="link">
              Launches
            </Link>
            &nbsp;/ <span className="live-dot" /> Live #{l.number}
          </>
        }
        title={`*$${symbol}* ${l.name.replace(/\*/g, '')}`.slice(0, 80)}
        lead={
          <>
            A real vibe/vibe launch on Robinhood Chain testnet, paired with {PAIR[l.pairClass] ?? l.pairClass}, {(l.taxBps / 100).toFixed(l.taxBps % 100 ? 1 : 0)}% trade
            tax. Launched {date(l.createdAt)}
            {l.graduatedAt ? `, graduated ${date(l.graduatedAt)}` : ', still on its bonding curve'}. {l.trades} trades indexed.
          </>
        }
      />

      <Stagger className="grid cols-4">
        {cards.map(([label, n, sub, tone]) => (
          <Item key={label}>
            <Tilt className="h100" max={6}>
              <div className="glass pad r-xl h100 stat">
                <div className={`n ${n > 0 && tone === 'bad' ? 'neg' : n > 0 && tone === 'good' ? 'text-iris' : ''}`}>
                  <CountUp value={n} />
                </div>
                <div className="l">{label}</div>
                <div className="tiny faint" style={{ marginTop: 6 }}>
                  {sub}
                </div>
              </div>
            </Tilt>
          </Item>
        ))}
      </Stagger>

      <Reveal>
        <div className="split" style={{ marginTop: 28, gap: 28 }}>
          <div className="glass pad r-xl">
            <h3 style={{ marginTop: 0 }}>Scout&apos;s read</h3>
            <p className="muted">
              An airdrop to everyone who bought {when} would pay all {read.buyers} wallets
              {read.flipped
                ? `, including the ${read.flipped} that sold most of what they bought within an hour.`
                : '. None of them has flipped within an hour yet: the kind of buyers a drop should reach.'}
            </p>
            <p className="muted">
              These are the behaviours Scout&apos;s score weighs: a quick exit lowers a wallet&apos;s hold score, and wallets that buy in
              lockstep with others (the same launches, in the same order, within minutes) or share a funder are linked into one cluster
              and penalised. Only wallets that sign up are scored or paid, so none of these wallets is listed here.
            </p>
            <Link href="/join" className="btn" style={{ marginTop: 8, whiteSpace: 'normal', maxWidth: '100%' }}>
              Bought ${symbol.slice(0, 12)}? Sign up <span className="arrow">→</span>
            </Link>
          </div>
          <div className="glass pad r-xl">
            <dl className="onchain-facts">
              <dt>Token</dt>
              <dd>
                <a className="mono link" href={`${EXPLORER}/address/${l.token}`} target="_blank" rel="noreferrer">
                  {short(l.token)} ↗
                </a>
              </dd>
              <dt>Creator</dt>
              <dd>
                <a className="mono link" href={`${EXPLORER}/address/${l.creator}`} target="_blank" rel="noreferrer">
                  {short(l.creator)} ↗
                </a>
              </dd>
              <dt>Bonding pool</dt>
              <dd>
                <a className="mono link" href={`${EXPLORER}/address/${l.pool}`} target="_blank" rel="noreferrer">
                  {short(l.pool)} ↗
                </a>
              </dd>
              <dt>Still holding</dt>
              <dd className="mono">
                {read.holding} of {read.buyers}
              </dd>
            </dl>
            <p className="tiny faint" style={{ marginTop: 18 }}>
              Read from vibe/vibe&apos;s public events. Trades after graduation happen on Uniswap and are not counted here.
              &quot;Sold within an hour&quot; is measured from each wallet&apos;s first buy.
            </p>
          </div>
        </div>
      </Reveal>
    </>
  );
}
