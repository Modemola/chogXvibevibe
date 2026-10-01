/** Shown while a server page resolves: a breathing glass placeholder in the page's shape. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ paddingTop: 8 }}>
      <div className="skeleton" style={{ width: 140, height: 12, marginBottom: 22 }} />
      <div className="skeleton" style={{ width: 'min(620px, 90%)', height: 72, marginBottom: 14 }} />
      <div className="skeleton" style={{ width: 'min(480px, 70%)', height: 18, marginBottom: 44 }} />
      <div className="grid cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass r-xl" style={{ height: 240 }}>
            <div className="skeleton" style={{ position: 'absolute', inset: 24, borderRadius: 16, opacity: 0.5 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
