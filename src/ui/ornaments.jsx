// Hand-drawn SVG ornaments for the book-club theme. All strokes inherit
// currentColor so they recolor with the surrounding text; the flamingo pink
// appears only as small deliberate accents (a bookmark ribbon, one spine).

// An open book with a pink bookmark ribbon. Used in empty/loading states.
export function OpenBook({ size = 72, ...props }) {
  return (
    <svg
      width={size}
      height={Math.round(size * 0.78)}
      viewBox="0 0 96 75"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* Covers / pages */}
      <path d="M48 16 C40 9, 22 6.5, 10 9.5 L10 57 C22 54, 40 56, 48 63 C56 56, 74 54, 86 57 L86 9.5 C74 6.5, 56 9, 48 16 Z" />
      <path d="M48 16 L48 63" />
      {/* Text lines, left page */}
      <path d="M18 20 C26 18, 36 19, 42 23 M18 30 C26 28, 36 29, 42 33 M18 40 C26 38, 36 39, 42 43" strokeWidth="1.6" opacity="0.45" />
      {/* Text lines, right page */}
      <path d="M54 23 C60 19, 68 18, 78 20 M54 33 C60 29, 68 28, 78 30 M54 43 C60 39, 68 38, 78 40" strokeWidth="1.6" opacity="0.45" />
      {/* Bookmark ribbon — the one pink accent */}
      <path d="M61 11 L61 34 L66 29 L71 34 L71 12" fill="var(--primary)" stroke="none" opacity="0.9" />
    </svg>
  );
}

// A row of book spines resting on a shelf line, one leaning, one pink.
export function Bookshelf({ width = 190, ...props }) {
  return (
    <svg
      width={width}
      height={Math.round((width / 190) * 36)}
      viewBox="0 0 190 36"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect x="14" y="8" width="7" height="25" rx="1.5" fill="currentColor" opacity="0.30" />
      <rect x="24" y="4" width="9" height="29" rx="1.5" fill="var(--primary-ink)" opacity="0.75" />
      <rect x="36" y="10" width="6" height="23" rx="1.5" fill="var(--accent-gold)" opacity="0.65" />
      <rect x="45" y="6" width="8" height="27" rx="1.5" fill="currentColor" opacity="0.40" />
      <rect x="56" y="9" width="7" height="24" rx="1.5" fill="var(--sage)" opacity="0.55" />
      {/* Leaning book */}
      <g transform="rotate(10 76 33)">
        <rect x="70" y="9" width="8" height="24" rx="1.5" fill="currentColor" opacity="0.25" />
      </g>
      <rect x="86" y="5" width="8" height="28" rx="1.5" fill="currentColor" opacity="0.45" />
      <rect x="97" y="10" width="6" height="23" rx="1.5" fill="var(--primary)" opacity="0.80" />
      <rect x="106" y="7" width="9" height="26" rx="1.5" fill="currentColor" opacity="0.30" />
      <rect x="118" y="11" width="6" height="22" rx="1.5" fill="var(--accent-gold)" opacity="0.5" />
      <rect x="127" y="6" width="8" height="27" rx="1.5" fill="var(--primary-ink)" opacity="0.6" />
      {/* Book lying flat on top of the row */}
      <rect x="139" y="26" width="26" height="7" rx="1.5" fill="currentColor" opacity="0.35" />
      <rect x="142" y="19" width="21" height="7" rx="1.5" fill="currentColor" opacity="0.22" />
      {/* Shelf */}
      <line x1="4" y1="34" x2="186" y2="34" stroke="currentColor" strokeWidth="1.8" opacity="0.4" strokeLinecap="round" />
    </svg>
  );
}
