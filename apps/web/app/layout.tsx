import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Backdrop, CursorLight, SmoothScroll } from '@/components/ambient';
import { BrandMark } from '@/components/brand';
import { MobileNav, Nav } from '@/components/nav';
import { TourProvider } from '@/components/tour';
import './globals.css';

export const metadata: Metadata = {
  title: 'Graduation Scout',
  description: 'Explainable airdrop allocation for vibe/vibe graduations on Robinhood Chain.',
};

export const viewport: Viewport = { themeColor: '#04050a', colorScheme: 'dark' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Backdrop />
        <CursorLight />
        <SmoothScroll />
        <TourProvider>
          <Nav />
          <main className="wrap">{children}</main>
          <MobileNav />
        </TourProvider>
        <footer className="site">
          <div className="wrap">
            <div>
              <div className="row" style={{ marginBottom: 14 }}>
                <BrandMark size={22} />
                <span style={{ color: 'var(--ink)' }}>Graduation Scout</span>
              </div>
              <div style={{ maxWidth: 420 }}>
                An independent builder project for vibe/vibe on Robinhood Chain. Not affiliated with vibe/vibe or Spark Labs. Scores use
                public on-chain activity of opted-in wallets.
              </div>
              <div className="row" style={{ marginTop: 16, gap: 18 }}>
                <Link href="/builder" className="link">Builder</Link>
                <Link href="/launches" className="link">Launches</Link>
                <Link href="/join" className="link">Join</Link>
              </div>
            </div>
            <div className="mark" aria-hidden>Scout</div>
          </div>
        </footer>
      </body>
    </html>
  );
}
