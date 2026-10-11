import { TEMPLATES } from '@scout/core';
import { CHOG_MONAD } from '@scout/sources';
import Link from 'next/link';
import { CountUp, Item, Reveal, Stagger } from '@/components/motion';
import { PageHead } from '@/components/page-head';
import { date, short, tokens } from '@/lib/format';
import { getService } from '@/lib/server';

export const dynamic = 'force-dynamic';

const MONADSCAN = 'https://monadscan.com/address/';

export default async function ChogPage() {
  const svc = await getService();
  const holders = await svc.chogHolders(100);
  const recipe = TEMPLATES.chog_holders;

  return (
    <>
      <PageHead
        kicker="vibe/vibe × Chog"
        title="Chogs that stay, *get paid.*"
        lead="Your Chog Genesis lives on Monad. Your trades live on vibe/vibe. It is the same wallet address on both, so Scout reads your Chogs straight from Monad when you sign up: nothing to bridge, nothing to sign on Monad. Holding a Chog raises your score, and creators can pay Chog holders first."
        aside={
          <div className="glass r-xl row" style={{ gap: 0 }}>
            {(
              [
                ['Chog holders signed up', holders.holders],
                ['Wallets signed up', holders.profiles],
                ['Chog Genesis supply', 1969],
              ] as const
            ).map(([l, n], i) => (
              <div key={l} className="stat" style={{ padding: '18px 24px', boxShadow: i ? 'inset 1px 0 0 var(--hair)' : undefined }}>
                <div className="n" style={{ fontSize: 34 }}>
                  <CountUp value={n} />
                </div>
                <div className="l">{l}</div>
              </div>
            ))}
          </div>
        }
      />

      <Stagger className="grid cols-3" gap={0.08}>
        <Item>
          <div className="glass pad r-xl" style={{ height: '100%' }}>
            <div className="kicker">1 · Your Chog is your passport</div>
            <h3 style={{ margin: '12px 0 8px' }}>Same address, two chains</h3>
            <p className="muted small">
              Sign up with the wallet that holds your Chog. Scout checks Chog Genesis and $CHOG on Monad mainnet for that address and keeps the
              reading fresh, at most every 10 minutes.
            </p>
          </div>
        </Item>
        <Item>
          <div className="glass pad r-xl" style={{ height: '100%' }}>
            <div className="kicker">2 · Chogs score higher</div>
            <h3 style={{ margin: '12px 0 8px' }}>An alignment boost</h3>
            <p className="muted small">
              Holding a Chog adds +0.10 to alignment. Holding one for 30 days or more adds another +0.05. Every boost shows on your profile as a
              plain reason, like everything else Scout scores.
            </p>
          </div>
        </Item>
        <Item>
          <div className="glass pad r-xl" style={{ height: '100%' }}>
            <div className="kicker">3 · The Chog Holders recipe</div>
            <h3 style={{ margin: '12px 0 8px' }}>Pay Chogs first</h3>
            <p className="muted small">
              {recipe.policy.buckets.map((b) => `${b.weightBps / 100}% ${b.id.replace('_', ' ')}`).join(' · ')}. Chogs who dump their drops,
              rug a launch or farm with clusters are still left out. With few holders, every Chog gets the per-wallet maximum;
              the long-hold extra shows once there are more holders than the cap allows to fill.
            </p>
            <Link href="/builder?template=chog_holders" className="btn sm primary" style={{ marginTop: 10 }}>
              Use the recipe
            </Link>
          </div>
        </Item>
      </Stagger>

      <Reveal>
        <section className="glass pad r-xl" style={{ marginTop: 28 }}>
          <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3>Chog holders on Scout</h3>
              <p className="muted small" style={{ margin: '6px 0 0' }}>
                Signed-up wallets holding a Chog Genesis. &ldquo;Seen since&rdquo; is when Scout first saw the wallet holding one.
              </p>
            </div>
            <form action="/profile" method="get" className="seg-ctl" aria-label="Check a wallet">
              <input name="wallet" placeholder="0x… check your Chog" aria-label="Wallet address" spellCheck={false} />
              <button type="submit" className="btn sm">
                Check
              </button>
            </form>
          </div>
          <div className="divider" />
          {holders.list.length ? (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th className="num">Chogs</th>
                    <th className="num">$CHOG</th>
                    <th className="num">Seen since</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.list.map((h) => (
                    <tr key={h.wallet}>
                      <td>
                        <Link href={`/profile/${h.wallet}`} className="mono link">
                          {short(h.wallet)}
                        </Link>
                      </td>
                      <td className="num">{h.tokens}</td>
                      <td className="num mono">{h.chogBalance > 0n ? tokens(h.chogBalance, 0) : '–'}</td>
                      <td className="num faint" style={{ whiteSpace: 'nowrap' }}>{h.heldSince ? date(h.heldSince).slice(0, 10) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="notice">
              No Chog holders have signed up yet. <Link href="/join">Be the first</Link>.
            </div>
          )}
        </section>
      </Reveal>

      <Reveal>
        <p className="faint small" style={{ marginTop: 22 }}>
          Read only from Monad mainnet (chain 143): Chog Genesis{' '}
          <a className="mono link" href={`${MONADSCAN}${CHOG_MONAD.nft}`} target="_blank" rel="noreferrer">
            {short(CHOG_MONAD.nft)}
          </a>{' '}
          and $CHOG{' '}
          <a className="mono link" href={`${MONADSCAN}${CHOG_MONAD.token}`} target="_blank" rel="noreferrer">
            {short(CHOG_MONAD.token)}
          </a>
          . Payouts stay on Robinhood Chain. Built for the Chogathon; not affiliated with or endorsed by Chog or vibe/vibe.
        </p>
      </Reveal>
    </>
  );
}
