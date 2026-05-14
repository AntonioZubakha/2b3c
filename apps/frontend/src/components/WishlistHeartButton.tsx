import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Heart } from './icons';
import { isDiamondInWishlist, subscribeWishlist, toggleDiamondWishlist, type WishlistDiamond } from '../lib/wishlist';

type Props = {
  diamond: Omit<WishlistDiamond, 'kind' | 'addedAt'>;
  /** Stop parent Link navigation on marketplace cards */
  stopNavigation?: boolean;
  className?: string;
  size?: 'sm' | 'md';
};

const WishlistHeartButton: React.FC<Props> = ({ diamond, stopNavigation, className = '', size = 'md' }) => {
  const { t } = useTranslation();
  const [on, setOn] = useState(() => isDiamondInWishlist(diamond.catalogId));

  useEffect(() => {
    setOn(isDiamondInWishlist(diamond.catalogId));
    return subscribeWishlist(() => {
      setOn(isDiamondInWishlist(diamond.catalogId));
    });
  }, [diamond.catalogId]);

  const iconSize = size === 'sm' ? 16 : 20;
  const pad = size === 'sm' ? 'p-2' : 'p-2.5';

  return (
    <button
      type="button"
      title={on ? t('wishlist.removeHint') : t('wishlist.addHint')}
      aria-label={on ? t('wishlist.removeHint') : t('wishlist.addHint')}
      aria-pressed={on}
      onClick={e => {
        if (stopNavigation) {
          e.preventDefault();
          e.stopPropagation();
        }
        const now = toggleDiamondWishlist({ kind: 'diamond', ...diamond });
        setOn(now);
      }}
      className={`wishlist-heart-btn rounded-full border transition-all duration-300 ${pad} ${className} ${
        on
          ? 'border-rose-gold bg-blush-50 text-rose-gold-deep shadow-[0_4px_18px_rgba(207,154,133,0.35)] scale-105'
          : 'border-cream-200 bg-white/90 text-ash hover:border-rose-gold/50 hover:text-rose-gold-deep hover:shadow-md backdrop-blur-sm'
      }`}
    >
      <Heart
        size={iconSize}
        className={on ? 'text-rose-gold-deep drop-shadow-[0_1px_6px_rgba(176,124,102,0.45)]' : ''}
        strokeWidth={on ? 2.25 : 1.75}
      />
    </button>
  );
};

export default WishlistHeartButton;
