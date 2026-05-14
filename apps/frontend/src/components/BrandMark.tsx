import React from 'react';

/**
 * Stonee atelier sigil — the rose-gold line-mark.
 *
 * The artwork (a transparent PNG) lives in `public/assets/stonee_logo.png`.
 * We render it through an `<img>` so the original artisan linework stays
 * untouched. Tone-aware cushion behind:
 *
 * - `tone="auto"` (default) — dark mocha disc in light theme, naked in dark.
 *   In dark theme the page background is already mocha, so a cushion just
 *   creates a visible black ring around the mark. Light theme needs the
 *   cushion to make the rose-gold strokes pop on cream surfaces.
 * - `tone="contrast"` — always show the dark mocha disc (used inside the
 *   rose-gold concierge panel where rose-gold-on-rose-gold would vanish).
 * - `tone="ghost"`    — always naked.
 * - `tone="inverse"`  — rose-gold gradient cushion (rare, dark hero spreads).
 */
export interface BrandMarkProps {
  size?: number;
  className?: string;
  tone?: 'auto' | 'contrast' | 'ghost' | 'inverse';
  rounded?: 'full' | 'squircle';
  alt?: string;
}

const BrandMark: React.FC<BrandMarkProps> = ({
  size = 40,
  className = '',
  tone = 'auto',
  rounded = 'full',
  alt = 'Stonee atelier',
}) => {
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-[28%]';

  // The PNG already includes its own breathing room around the linework, so
  // we never pad — the mark fills the cushion edge-to-edge and stays the
  // exact same physical size in light, dark, ghost, or contrast tones.
  let cushion = '';

  if (tone === 'contrast') {
    cushion = 'bg-[#1a1419] ring-1 ring-[#3a2a32] shadow-[0_8px_22px_rgba(43,32,36,0.30)]';
  } else if (tone === 'inverse') {
    cushion =
      'bg-gradient-to-br from-[color:var(--rose-gold)] to-[color:var(--rose-gold-deep)] ring-1 ring-white/30';
  } else if (tone === 'auto') {
    // Dark cushion only in light theme; transparent in dark.
    cushion =
      'bg-[#1a1419] ring-1 ring-[#3a2a32] shadow-[0_10px_26px_rgba(43,32,36,0.28)] ' +
      'dark:bg-transparent dark:ring-0 dark:shadow-none';
  }
  // ghost: nothing — naked PNG.

  return (
    <span
      role="img"
      aria-label={alt}
      className={`inline-flex items-center justify-center ${radius} ${cushion} ${className}`}
      style={{ width: size, height: size, lineHeight: 0 }}
    >
      <img
        src="/assets/stonee_logo.png"
        alt={alt}
        draggable={false}
        className="w-full h-full object-contain block select-none"
      />
    </span>
  );
};

export default BrandMark;
