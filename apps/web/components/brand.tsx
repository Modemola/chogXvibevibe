/** The Scout lens: two crossing orbits around a spark. */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="brand-mark">
      <defs>
        <linearGradient id="bm-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#8e959f" />
          <stop offset="1" stopColor="#e6e9ed" />
        </linearGradient>
        <radialGradient id="bm-b">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.4" stopColor="#d6dbe1" />
          <stop offset="1" stopColor="#d6dbe1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="none" stroke="url(#bm-a)" strokeOpacity=".35" />
      <ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="url(#bm-a)" strokeWidth="1.4" transform="rotate(-28 16 16)" />
      <ellipse cx="16" cy="16" rx="13" ry="5.2" fill="none" stroke="url(#bm-a)" strokeWidth="1.4" transform="rotate(28 16 16)" />
      <circle cx="16" cy="16" r="6" fill="url(#bm-b)" />
      <path d="M16 11.5 17.2 14.8 20.5 16 17.2 17.2 16 20.5 14.8 17.2 11.5 16 14.8 14.8Z" fill="#fff" />
    </svg>
  );
}
