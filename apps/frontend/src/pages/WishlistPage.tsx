import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Gem, Heart, Trash2 } from '../components/icons';
import Seo from '../components/Seo';
import { DiamondCatalogMedia } from '../components/DiamondCatalogMedia';
import { readWishlist, removeFromWishlist, subscribeWishlist, type WishlistEntry } from '../lib/wishlist';

const WishlistPage: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<WishlistEntry[]>(() => readWishlist());

  useEffect(() => {
    setItems(readWishlist());
    return subscribeWishlist(() => setItems(readWishlist()));
  }, []);

  return (
    <>
      <Seo
        title={t('wishlist.seoTitle')}
        description={t('wishlist.seoDescription')}
        path="/wishlist"
      />
      <div className="pt-32 pb-24 px-6 max-w-5xl mx-auto min-h-screen">
        <div className="mb-14 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blush-50 border border-blush-200 text-rose-gold-deep text-[10px] font-medium uppercase tracking-[0.2em] mb-4">
            <Heart className="text-rose-gold-deep" size={14} strokeWidth={2} />
            {t('wishlist.badge')}
          </div>
          <h1 className="font-serif text-5xl md:text-6xl font-light text-ink">
            {t('wishlist.title')}{' '}
            <span className="text-gradient italic">{t('wishlist.titleItalic')}</span>
          </h1>
          <p className="text-ink-soft mt-3 max-w-lg">{t('wishlist.subtitle')}</p>
        </div>

        {items.length === 0 ? (
          <div className="glass-card p-16 text-center animate-fade-in-up">
            <Gem size={48} className="mx-auto text-ash-soft mb-6" />
            <p className="text-ink-soft mb-8">{t('wishlist.empty')}</p>
            <Link to="/marketplace" className="btn-primary inline-block px-8 py-4 text-xs font-medium uppercase tracking-[0.22em] no-underline">
              {t('wishlist.browse')}
            </Link>
          </div>
        ) : (
          <ul className="space-y-5">
            {items.map((item, idx) => (
              <li
                key={item.catalogId}
                className="glass-card product-card-lift p-5 flex flex-col sm:flex-row gap-5 items-center animate-fade-in-up"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <Link
                  to={`/diamond/${item.catalogId}`}
                  className="w-full sm:w-36 h-36 rounded-2xl bg-blush-50 border border-cream-200 flex-shrink-0 overflow-hidden flex items-center justify-center no-underline"
                >
                  <DiamondCatalogMedia
                    images={item.images}
                    videoUrl={item.videoUrl}
                    alt=""
                    className="h-full w-full"
                    mediaClassName="h-full w-full object-contain p-4"
                    variant="card"
                  />
                </Link>
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <Link to={`/diamond/${item.catalogId}`} className="no-underline group">
                    <h2 className="font-serif text-2xl text-ink group-hover:text-rose-gold-deep transition-colors">
                      {item.carat} ct {item.shape}
                    </h2>
                  </Link>
                  <p className="text-[11px] text-ash uppercase tracking-[0.18em] mt-1">
                    {item.color} · {item.clarity} · SKU {item.sku}
                  </p>
                  <p className="font-serif text-2xl text-ink mt-3">${item.price.toLocaleString()}</p>
                </div>
                <div className="flex sm:flex-col gap-2 w-full sm:w-auto justify-center">
                  <Link
                    to={`/diamond/${item.catalogId}`}
                    className="glass-button px-5 py-3 text-[10px] font-medium uppercase tracking-[0.18em] no-underline flex-1 sm:flex-none text-center"
                  >
                    {t('wishlist.view')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => removeFromWishlist(item.catalogId)}
                    className="p-3 rounded-xl border border-cream-200 text-ash hover:text-rose-700 hover:border-rose-200 transition-colors"
                    aria-label={t('wishlist.remove')}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
};

export default WishlistPage;
