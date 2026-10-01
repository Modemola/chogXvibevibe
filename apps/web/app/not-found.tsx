import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ minHeight: '62vh', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <div>
        <div className="kicker" style={{ justifyContent: 'center' }}>404</div>
        <h1 className="display" style={{ fontSize: 'clamp(56px, 10vw, 140px)', margin: '18px 0' }}>
          Lost in the <em className="text-iris">aftermath.</em>
        </h1>
        <p className="lead" style={{ margin: '0 auto 30px' }}>That page didn&apos;t graduate. Try a wallet or a launch with ⌘K.</p>
        <Link href="/" className="btn primary lg">
          Back home <span className="arrow">→</span>
        </Link>
      </div>
    </div>
  );
}
