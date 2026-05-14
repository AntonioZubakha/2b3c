import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Globe } from './icons';
import BrandMark from './BrandMark';
import { getUiSurface } from '../lib/uiSurface';

const Footer: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [surfaceTick, setSurfaceTick] = useState(0);

  useEffect(() => {
    setSurfaceTick(x => x + 1);
  }, [location.pathname]);

  useEffect(() => {
    const onStorage = () => setSurfaceTick(x => x + 1);
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const uiSurface = useMemo(() => {
    void surfaceTick;
    return getUiSurface();
  }, [surfaceTick]);

  const brandTo = uiSurface === 'supplier' ? '/supplier/portal' : '/';

  if (uiSurface === 'buyer') {
    return (
      <footer className="relative z-10 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="petal-divider mb-12" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="md:col-span-1">
              <Link to={brandTo} className="flex items-center gap-2.5 mb-4 no-underline">
                <BrandMark size={44} />
                <span className="font-serif text-2xl text-ink">Stonee</span>
              </Link>
              <p className="text-sm text-ink-soft leading-relaxed max-w-xs">{t('footer.tagline')}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink mb-4">{t('footer.atelier')}</h4>
              <ul className="space-y-3 text-sm text-ink-soft">
                <li>
                  <Link to="/craft" className="hover:text-rose-gold-deep transition-colors no-underline">
                    {t('footer.beginPiece')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink mb-4">{t('footer.house')}</h4>
              <ul className="space-y-3 text-sm text-ink-soft">
                <li>
                  <Link to="/about" className="hover:text-rose-gold-deep transition-colors no-underline">
                    {t('footer.ourStory')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="petal-divider mt-12" />
          <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-ash">{t('footer.copyright')}</p>
            <div className="flex gap-6 text-xs text-ash">
              <a href="#" className="hover:text-ink-soft transition-colors">
                {t('footer.privacy')}
              </a>
              <a href="#" className="hover:text-ink-soft transition-colors">
                {t('footer.terms')}
              </a>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  if (uiSurface === 'supplier') {
    return (
      <footer className="relative z-10 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="petal-divider mb-12" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="md:col-span-1">
              <Link to={brandTo} className="flex items-center gap-2.5 mb-4 no-underline">
                <BrandMark size={44} />
                <span className="font-serif text-2xl text-ink">Stonee</span>
              </Link>
              <p className="text-sm text-ink-soft leading-relaxed max-w-xs">{t('supplier.workspaceBadge')}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink mb-4">{t('footer.partnerWorkspace')}</h4>
              <ul className="space-y-3 text-sm text-ink-soft">
                <li>
                  <Link to="/supplier/portal" className="hover:text-rose-gold-deep transition-colors no-underline">
                    {t('nav.supplierWorkspace')}
                  </Link>
                </li>
                <li>
                  <Link to="/supplier/orders" className="hover:text-rose-gold-deep transition-colors no-underline">
                    {t('nav.supplierOrders')}
                  </Link>
                </li>
                <li>
                  <Link to="/supplier/company" className="hover:text-rose-gold-deep transition-colors no-underline">
                    {t('nav.supplierCompany')}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink mb-4">{t('footer.contact')}</h4>
              <div className="flex gap-3">
                <a
                  href="#"
                  className="w-10 h-10 rounded-full bg-surface-elev border border-cream-200 flex items-center justify-center hover:bg-blush-50 hover:border-blush-300 transition-all text-ink-soft"
                >
                  <Globe className="w-4 h-4" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 rounded-full bg-surface-elev border border-cream-200 flex items-center justify-center hover:bg-blush-50 hover:border-blush-300 transition-all text-ink-soft"
                >
                  <Mail className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
          <div className="petal-divider mt-12" />
          <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-ash">{t('footer.copyright')}</p>
            <div className="flex gap-6 text-xs text-ash">
              <a href="#" className="hover:text-ink-soft transition-colors">
                {t('footer.privacy')}
              </a>
              <a href="#" className="hover:text-ink-soft transition-colors">
                {t('footer.terms')}
              </a>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative z-10 mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="petal-divider mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-1">
            <Link to={brandTo} className="flex items-center gap-2.5 mb-4 no-underline">
              <BrandMark size={44} />
              <span className="font-serif text-2xl text-ink">Stonee</span>
            </Link>
            <p className="text-sm text-ink-soft leading-relaxed max-w-xs">{t('footer.tagline')}</p>
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink mb-4">{t('footer.atelier')}</h4>
            <ul className="space-y-3 text-sm text-ink-soft">
              <li>
                <Link to="/craft" className="hover:text-rose-gold-deep transition-colors no-underline">
                  {t('footer.beginPiece')}
                </Link>
              </li>
              <li>
                <Link to="/collections" className="hover:text-rose-gold-deep transition-colors no-underline">
                  {t('footer.collections')}
                </Link>
              </li>
              <li>
                <Link to="/marketplace" className="hover:text-rose-gold-deep transition-colors no-underline">
                  {t('footer.looseDiamonds')}
                </Link>
              </li>
              <li>
                <Link to="/wishlist" className="hover:text-rose-gold-deep transition-colors no-underline">
                  {t('footer.wishlist')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink mb-4">{t('footer.house')}</h4>
            <ul className="space-y-3 text-sm text-ink-soft">
              <li>
                <Link to="/about" className="hover:text-rose-gold-deep transition-colors no-underline">
                  {t('footer.ourStory')}
                </Link>
              </li>
              <li>
                <a href="#" className="hover:text-rose-gold-deep transition-colors">
                  {t('footer.careCleaning')}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-rose-gold-deep transition-colors">
                  {t('footer.lifetimeWarranty')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink mb-4">{t('footer.contact')}</h4>
            <div className="flex gap-3">
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-surface-elev border border-cream-200 flex items-center justify-center hover:bg-blush-50 hover:border-blush-300 transition-all text-ink-soft"
              >
                <Globe className="w-4 h-4" />
              </a>
              <a
                href="#"
                className="w-10 h-10 rounded-full bg-surface-elev border border-cream-200 flex items-center justify-center hover:bg-blush-50 hover:border-blush-300 transition-all text-ink-soft"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="petal-divider mt-12" />
        <div className="mt-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-ash">{t('footer.copyright')}</p>
          <div className="flex gap-6 text-xs text-ash">
            <a href="#" className="hover:text-ink-soft transition-colors">
              {t('footer.privacy')}
            </a>
            <a href="#" className="hover:text-ink-soft transition-colors">
              {t('footer.terms')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
