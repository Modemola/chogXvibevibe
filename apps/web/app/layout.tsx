import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Graduation Scout',
  description: 'Explainable airdrop allocation for vibe/vibe graduations on Robinhood Chain.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand">
              Graduation <span>Scout</span>
            </Link>
            <nav className="links">
              <Link href="/builder">Policy builder</Link>
              <Link href="/launches">Launches</Link>
              <Link href="/join">Join</Link>
            </nav>
            <form className="lookup" action="/profile" method="get">
              <input name="wallet" placeholder="Look up 0x… wallet" aria-label="Wallet address" />
            </form>
          </div>
        </header>
        <main className="wrap">{children}</main>
        <footer className="bottom">
          <div className="wrap">
            Independent builder project for vibe/vibe; not affiliated with vibe/vibe or Spark Labs. Scores use public on-chain
            activity of opted-in wallets.
          </div>
        </footer>
      </body>
    </html>
  );
}
