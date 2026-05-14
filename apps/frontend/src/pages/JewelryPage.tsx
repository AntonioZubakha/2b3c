import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Sparkles, Loader2 } from '../components/icons';
import {
  jewelryCatalogCollection,
  jewelryCatalogDescription,
  jewelryCatalogTitle,
  jewelryCategoryLabel,
} from '../lib/displayI18n';
import { apiJson, GATEWAY } from '../lib/api';
import { orderQueryKeys } from '../lib/orderQuery';
import { getSessionId } from '../lib/session';
import { resolveJewelryImage } from '../lib/imageFallback';
import type { JewelryDoc, JewelryCollectionsResponse } from '../lib/contracts';

type JewelryItem = JewelryDoc;

const JewelryPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const priceLocale = i18n.language.startsWith('en') ? 'en-US' : 'ru-RU';
  const [items, setItems] = useState<JewelryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingToCart, setAddingToCart] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleAddToCart = async (item: JewelryItem) => {
    setAddingToCart(item._id);
    try {
      const sessionId = getSessionId();
      const data = await apiJson(`${GATEWAY.order}/cart/${sessionId}/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'jewelry',
          productId: item.sku,
          price: item.price,
          quantity: 1,
        }),
      });
      if (data.success) {
        void queryClient.invalidateQueries({ queryKey: orderQueryKeys.carts() });
        navigate('/cart');
      }
    } catch (err) {
      console.error('Add to cart failed:', err);
    } finally {
      setAddingToCart(null);
    }
  };

  useEffect(() => {
    apiJson<JewelryItem[]>(`${GATEWAY.jewelry}/collections`)
      .then(json => {
        const typed = json as JewelryCollectionsResponse;
        if (typed.success) setItems(typed.data);
      })
      .catch(err => console.error('Failed to fetch jewelry collections:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="pt-32 px-6 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 text-rose-gold-deep animate-spin mb-4" />
        <p className="text-ink-soft animate-pulse">{t('jewelry.loading')}</p>
      </div>
    );
  }

  return (
    <div className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-16 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blush-50 border border-blush-200/60 text-rose-gold-deep text-xs font-medium tracking-[0.2em] uppercase mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t('jewelry.badge')}</span>
        </div>
        <h1 className="font-serif text-5xl md:text-6xl font-light mb-6 tracking-tight text-ink">
          {t('jewelry.title')} <span className="text-gradient italic">{t('jewelry.titleItalic')}</span>
        </h1>
        <p className="text-ink-soft text-base max-w-2xl mx-auto leading-relaxed">{t('jewelry.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {items.map((item, idx) => {
          const cardTitle = jewelryCatalogTitle(t, item.sku, item.title);
          const cardDesc = jewelryCatalogDescription(t, item.sku, item.description);
          const cardCollection = jewelryCatalogCollection(t, item.sku, item.collectionName);
          return (
          <div
            key={item._id}
            className={`glass-card group overflow-hidden animate-fade-in-up animate-delay-${(idx + 1) * 100}`}
          >
            <div className="aspect-[4/5] relative bg-blush-50 overflow-hidden">
              <img
                src={resolveJewelryImage({
                  images: item.images,
                  category: item.category,
                  key: item.sku,
                })}
                alt={cardTitle}
                className="w-full h-full object-contain p-10 group-hover:scale-105 transition-transform duration-700"
              />
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 rounded-full bg-surface-elev/90 backdrop-blur border border-cream-200 text-[10px] font-medium uppercase tracking-[0.18em] text-ink-soft">
                  {jewelryCategoryLabel(t, item.category)}
                </span>
              </div>
            </div>

            <div className="p-8">
              <div className="text-[10px] font-medium text-rose-gold-deep uppercase tracking-[0.22em] mb-2">
                {cardCollection}
              </div>
              <h3 className="font-serif text-2xl text-ink mb-3 group-hover:text-rose-gold-deep transition-colors">
                {cardTitle}
              </h3>
              <p className="text-ink-soft text-sm mb-6 line-clamp-2 leading-relaxed">
                {cardDesc}
              </p>

              <div className="flex items-center justify-between pt-6 border-t border-cream-200">
                <div className="flex flex-col">
                  <span className="text-[10px] text-ash uppercase tracking-[0.18em] font-medium">
                    {t('jewelry.retailPrice')}
                  </span>
                  <span className="font-serif text-2xl text-ink">
                    ${item.price.toLocaleString(priceLocale)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddToCart(item)}
                  disabled={addingToCart === item._id}
                  aria-label={t('jewelry.addToCartAria')}
                  className="btn-primary p-3.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed border-0 cursor-pointer"
                >
                  {addingToCart === item._id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ShoppingBag className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
};

export default JewelryPage;
