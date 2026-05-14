import React, { useState, type CSSProperties } from 'react';
import { Gem } from './icons';

/** Known 360 hosts — tuned without cross-origin DOM access (iframe crop + desktop layout width). */
type ViewerPreset = 'diamond-video' | 'gem360' | 'gemview' | 'generic';

function detectViewerPreset(url: string): ViewerPreset {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === 'video.diamond-video.live' || h.endsWith('.diamond-video.live')) return 'diamond-video';
    if (h.includes('gem360')) return 'gem360';
    if (h.includes('gemview')) return 'gemview';
  } catch {
    /* invalid URL */
  }
  return 'generic';
}

/**
 * Card grid: load viewer at a large intrinsic size so vendor CSS lays out the main canvas (e.g. V360
 * on the left), then scale + clip so the stone fills the tile instead of tiny full-page squeeze.
 */
const VIEWER_CARD_FRAME: Record<
  ViewerPreset,
  { intrinsicW: number; intrinsicH: number; style: CSSProperties }
> = {
  'diamond-video': {
    intrinsicW: 1320,
    intrinsicH: 860,
    style: {
      position: 'absolute',
      left: 0,
      top: '50%',
      transform: 'translateY(-50%) scale(0.5)',
      transformOrigin: 'left center',
      maxWidth: 'none',
    },
  },
  gem360: {
    intrinsicW: 1280,
    intrinsicH: 820,
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -52%) scale(0.54)',
      transformOrigin: 'center center',
      maxWidth: 'none',
    },
  },
  gemview: {
    intrinsicW: 1180,
    intrinsicH: 800,
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%) scale(0.56)',
      transformOrigin: 'center center',
      maxWidth: 'none',
    },
  },
  generic: {
    intrinsicW: 1240,
    intrinsicH: 820,
    style: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%) scale(0.52)',
      transformOrigin: 'center center',
      maxWidth: 'none',
    },
  },
};

function firstImage(images?: string[]): string | undefined {
  for (const raw of images ?? []) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim();
    if (s) return s;
  }
  return undefined;
}

/** Direct file URLs we can play in a HTML video element */
export function isDirectVideoUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0].toLowerCase();
  return /\.(mp4|webm|ogg|mov|m4v)(\b|$)/i.test(path);
}

type Variant = 'card' | 'detail';

type Props = {
  images?: string[];
  videoUrl?: string;
  alt: string;
  className?: string;
  mediaClassName?: string;
  /** `card`: silent preview, clicks pass through to parent links. `detail`: controls / full embed. */
  variant?: Variant;
};

export const DiamondCatalogMedia: React.FC<Props> = ({
  images,
  videoUrl,
  alt,
  className = '',
  mediaClassName,
  variant = 'detail',
}) => {
  const [imgBroken, setImgBroken] = useState(false);
  const img = firstImage(images);
  const v = videoUrl?.trim();
  const isCard = variant === 'card';
  const passThrough = isCard ? 'pointer-events-none' : '';
  const defaultMediaClass = 'h-full w-full object-contain';
  const resolvedMediaClass = mediaClassName ?? defaultMediaClass;

  if (img && !imgBroken) {
    return (
      <div className={`flex h-full w-full items-center justify-center overflow-hidden ${className}`}>
        <img
          src={img}
          alt={alt}
          className={`${resolvedMediaClass} ${passThrough}`}
          onError={() => setImgBroken(true)}
        />
      </div>
    );
  }

  if (v && isDirectVideoUrl(v)) {
    return (
      <div className={`flex h-full w-full items-center justify-center overflow-hidden bg-ink/90 ${className}`}>
        <video
          src={v}
          className={`${resolvedMediaClass} ${passThrough}`}
          autoPlay
          muted
          loop
          playsInline
          controls={!isCard}
          preload={isCard ? 'metadata' : 'auto'}
          aria-label={alt}
        />
      </div>
    );
  }

  if (v && (v.startsWith('http://') || v.startsWith('https://'))) {
    const preset = detectViewerPreset(v);
    const cardFrame = VIEWER_CARD_FRAME[preset];

    if (isCard) {
      return (
        <div className={`relative h-full w-full overflow-hidden bg-[#101012] ${className}`}>
          <iframe
            src={v}
            title={alt}
            width={cardFrame.intrinsicW}
            height={cardFrame.intrinsicH}
            className={`border-0 ${passThrough}`}
            style={cardFrame.style}
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      );
    }

    return (
      <div className={`flex h-full w-full flex-col overflow-hidden bg-ink/95 ${className}`}>
        <iframe
          src={v}
          title={alt}
          className={`min-h-0 flex-1 border-0 ${resolvedMediaClass}`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-gradient-to-b from-blush-50 via-cream-50 to-blush-50 ${className}`}
      role="img"
      aria-label={alt}
    >
      <Gem className="text-rose-gold-deep/35" size={isCard ? 48 : 72} aria-hidden />
    </div>
  );
};
