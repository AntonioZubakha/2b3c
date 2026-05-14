import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Menu, X, ShoppingBag, Shield, User, ChevronDown, LogOut, Package, ExternalLink, Lock, Heart } from './icons';
import ConciergeModal from './ConciergeModal';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import BrandMark from './BrandMark';
import { isStoneeStaffRole, isSupplierRole } from '@stonee/shared-types';
import { readWishlist, subscribeWishlist } from '../lib/wishlist';
import { getUiSurface } from '../lib/uiSurface';

const Navbar: React.FC = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [conciergeOpen, setConciergeOpen] = React.useState(false);
  const [showAccountMenu, setShowAccountMenu] = React.useState(false);
  const [wishCount, setWishCount] = React.useState(() => readWishlist().length);
  const location = useLocation();
  const navigate = useNavigate();

  const [surfaceTick, setSurfaceTick] = useState(0);
  const isLoggedIn = !!localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  const uiSurface = useMemo(() => {
    void surfaceTick;
    return getUiSurface();
  }, [surfaceTick, userRole, isLoggedIn]);

  useEffect(() => {
    const onStorage = () => setSurfaceTick(x => x + 1);
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const goAuth = () => {
    setIsOpen(false);
    navigate('/auth');
  };

  const goCart = () => {
    setIsOpen(false);
    navigate('/cart');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('supplierCategory');
    localStorage.removeItem('supplierCompanyId');
    localStorage.removeItem('supplierCompanies');
    localStorage.removeItem('stonee_staff_buyer_preview');
    localStorage.removeItem('stonee_session_id');
    window.dispatchEvent(new Event('storage'));
    navigate('/');
  };

  useEffect(() => {
    setIsOpen(false);
    setShowAccountMenu(false);
    setSurfaceTick(x => x + 1);
  }, [location.pathname]);

  useEffect(() => {
    setWishCount(readWishlist().length);
    return subscribeWishlist(() => setWishCount(readWishlist().length));
  }, []);

  const links = useMemo(() => {
    if (uiSurface === 'buyer') {
      return [
        { to: '/craft', label: t('nav.atelier') },
        { to: '/collections', label: t('nav.collections') },
      ];
    }
    if (uiSurface === 'supplier') {
      return [
        { to: '/supplier/portal', label: t('nav.supplierWorkspace') },
        { to: '/supplier/orders', label: t('nav.supplierOrders') },
        { to: '/supplier/inventory', label: t('nav.supplierInventory') },
        { to: '/supplier/company', label: t('nav.supplierCompany') },
      ];
    }
    return [
      { to: '/merchant', label: t('nav.operationsHub') },
      { to: '/craft', label: t('nav.atelier') },
      { to: '/collections', label: t('nav.collections') },
      { to: '/marketplace', label: t('nav.diamonds') },
      { to: '/about', label: t('nav.house') },
    ];
  }, [t, uiSurface]);

  const logoTo = uiSurface === 'supplier' ? '/supplier/portal' : '/';
  const showWishlist = uiSurface === 'staff';
  const showCart = uiSurface !== 'supplier';
  const showConciergeButton = uiSurface !== 'supplier';

  const menuVariants: Variants = {
    hidden: { opacity: 0, y: 14, scale: 0.97, filter: 'blur(8px)' },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: {
        type: 'spring',
        stiffness: 280,
        damping: 28,
        staggerChildren: 0.04,
        delayChildren: 0.08,
      },
    },
    exit: {
      opacity: 0,
      y: 8,
      scale: 0.98,
      filter: 'blur(4px)',
      transition: { duration: 0.18 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, x: -8 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <>
      <nav className="fixed inset-x-0 top-0 z-[100] isolate p-5">
        <div className="glass rounded-full max-w-6xl mx-auto px-6 sm:px-8 py-3 flex items-center justify-between gap-4">
          <Link to={logoTo} className="flex items-center gap-3 group no-underline shrink-0">
            <motion.div whileHover={{ rotate: 6, scale: 1.06 }} className="shrink-0">
              <BrandMark size={44} />
            </motion.div>
            <div className="flex flex-col">
              <span className="font-serif text-2xl text-ink leading-none tracking-tight">Stonee</span>
              <span className="text-[8px] font-medium uppercase tracking-[0.32em] text-rose-gold-deep mt-0.5">
                {t('nav.brandSubtitle')}
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center justify-center gap-7 lg:gap-9">
            {links.map(link => {
              const active = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`relative text-[11px] font-medium uppercase tracking-[0.22em] transition-colors duration-300 ${
                    active ? 'text-rose-gold-deep' : 'text-ink-soft hover:text-rose-gold-deep'
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-rose-gold" />
                  )}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0 relative">
            {showWishlist && (
            <Link
              to="/wishlist"
              className="p-2 text-ink-soft hover:text-rose-gold-deep transition-colors relative no-underline"
              aria-label={t('nav.wishlist')}
            >
              <Heart className="w-4 h-4" strokeWidth={1.75} />
              {wishCount > 0 ? (
                <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-gold text-[9px] font-semibold text-white flex items-center justify-center leading-none">
                  {wishCount > 9 ? '9+' : wishCount}
                </span>
              ) : null}
            </Link>
            )}

            {showCart && (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={goCart}
              type="button"
              className="p-2 text-ink-soft hover:text-rose-gold-deep transition-colors relative bg-transparent border-0 cursor-pointer"
              aria-label={t('nav.cartAria')}
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-rose-gold rounded-full" />
            </motion.button>
            )}

            <ThemeToggle compact />

            <LanguageToggle compact />

            <div className="hidden md:block h-5 w-px bg-cream-200" />

            {isLoggedIn ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowAccountMenu(!showAccountMenu)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-elev/70 border border-cream-200 hover:border-blush-300 transition-all min-w-[100px] justify-center cursor-pointer"
                >
                  <div className="w-5 h-5 rounded-full bg-blush-50 flex items-center justify-center">
                    <User className="w-3 h-3 text-rose-gold-deep" />
                  </div>
                  <span className="hidden lg:block text-[10px] font-medium uppercase tracking-[0.22em] text-ink-soft">
                    {t('nav.account')}
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 text-ash transition-transform duration-300 ${
                      showAccountMenu ? 'rotate-180 text-rose-gold-deep' : ''
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {showAccountMenu && (
                    <motion.div
                      variants={menuVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="absolute top-full right-0 mt-3 w-64 glass-card-premium overflow-hidden z-[150]"
                    >
                      <div className="p-2 space-y-1">
                        {uiSurface === 'staff' && (
                        <motion.div variants={itemVariants}>
                          <Link
                            to="/account/vault"
                            className="flex items-center justify-between p-3 rounded-2xl hover:bg-blush-50 transition-all group no-underline"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                                <Shield className="w-4 h-4 text-emerald-700" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink">
                                  {t('nav.myVault')}
                                </span>
                                <span className="text-[9px] text-ash uppercase tracking-wide">
                                  {t('nav.vaultSubtitle')}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                        )}

                        <motion.div variants={itemVariants}>
                          <Link
                            to={uiSurface === 'supplier' ? '/supplier/orders' : '/account/orders'}
                            className="flex items-center justify-between p-3 rounded-2xl hover:bg-blush-50 transition-all group no-underline"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blush-50 flex items-center justify-center">
                                <Package className="w-4 h-4 text-rose-gold-deep" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink">
                                  {t('nav.orders')}
                                </span>
                                <span className="text-[9px] text-ash uppercase tracking-wide">
                                  {t('nav.ordersSubtitle')}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </motion.div>

                        {showWishlist && (
                        <motion.div variants={itemVariants}>
                          <Link
                            to="/wishlist"
                            className="flex items-center justify-between p-3 rounded-2xl hover:bg-blush-50 transition-all group no-underline"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-cream-100 flex items-center justify-center">
                                <Heart className="w-4 h-4 text-rose-gold-deep" strokeWidth={1.75} />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink">
                                  {t('nav.wishlist')}
                                </span>
                                <span className="text-[9px] text-ash uppercase tracking-wide">
                                  {t('nav.wishlistSubtitle')}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                        )}

                        {uiSurface !== 'supplier' && (
                        <motion.div variants={itemVariants}>
                          <Link
                            to="/account/security"
                            className="flex items-center justify-between p-3 rounded-2xl hover:bg-blush-50 transition-all group no-underline"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-cream-100 flex items-center justify-center">
                                <Lock className="w-4 h-4 text-ink-soft" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink">
                                  {t('nav.security')}
                                </span>
                                <span className="text-[9px] text-ash uppercase tracking-wide">
                                  {t('nav.securitySubtitle')}
                                </span>
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                        )}

                        {isStoneeStaffRole(userRole) && (
                          <motion.div variants={itemVariants}>
                            <Link
                              to="/merchant"
                              className="flex items-center justify-between p-3 rounded-2xl hover:bg-blush-50 transition-all group no-underline"
                            >
                              <div className="flex items-center gap-3">
                                <BrandMark size={36} />
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink">
                                    {t('nav.operationsHub')}
                                  </span>
                                  <span className="text-[9px] text-ash uppercase tracking-wide">
                                    {t('nav.operationsSubtitle')}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        )}
                        {isSupplierRole(userRole) && uiSurface !== 'supplier' && (
                          <motion.div variants={itemVariants}>
                            <Link
                              to="/supplier/portal"
                              className="flex items-center justify-between p-3 rounded-2xl hover:bg-blush-50 transition-all group no-underline"
                            >
                              <div className="flex items-center gap-3">
                                <Package className="w-4 h-4 text-rose-gold-deep" />
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink">
                                    {t('nav.supplierPortal')}
                                  </span>
                                  <span className="text-[9px] text-ash uppercase tracking-wide">
                                    {t('nav.supplierSubtitle')}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        )}

                        <div className="petal-divider my-2" />

                        <motion.button
                          variants={itemVariants}
                          onClick={handleLogout}
                          className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-rose-50 transition-all text-rose-700 border-0 bg-transparent cursor-pointer group text-[11px] uppercase tracking-[0.18em] font-medium"
                        >
                          <div className="flex items-center gap-3">
                            <LogOut className="w-4 h-4" />
                            {t('nav.signOut')}
                          </div>
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button
                type="button"
                onClick={goAuth}
                className="text-[10px] font-medium uppercase tracking-[0.22em] text-ink-soft hover:text-rose-gold-deep transition-colors py-2 px-2 cursor-pointer bg-transparent border-0 hidden sm:block"
              >
                {t('nav.signIn')}
              </button>
            )}

            {showConciergeButton && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => setConciergeOpen(true)}
              className="btn-primary px-5 lg:px-6 py-2.5 text-[10px] font-medium uppercase tracking-[0.22em] cursor-pointer border-0 hidden xs:block"
            >
              {t('nav.concierge')}
            </motion.button>
            )}

            <button
              type="button"
              className="md:hidden p-2 text-ink bg-transparent border-0"
              aria-label={t('nav.openMenu')}
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {isOpen && (
          <div className="glass rounded-3xl mt-2 mx-4 p-6 md:hidden animate-fade-in-up">
            <div className="flex flex-col gap-4">
              {links.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setIsOpen(false)}
                  className="text-base font-medium uppercase tracking-[0.18em] text-ink hover:text-rose-gold-deep transition-colors"
                >
                  {link.label}
                </Link>
              ))}
              <div className="petal-divider" />
              {showWishlist && (
              <Link
                to="/wishlist"
                onClick={() => setIsOpen(false)}
                className="text-base font-medium uppercase tracking-[0.18em] text-ink hover:text-rose-gold-deep"
              >
                {t('nav.wishlist')}
              </Link>
              )}
              {isLoggedIn && (
                <>
                  {uiSurface === 'staff' && (
                  <Link
                    to="/account/vault"
                    onClick={() => setIsOpen(false)}
                    className="text-base font-medium uppercase tracking-[0.18em] text-rose-gold-deep"
                  >
                    {t('nav.myVault')}
                  </Link>
                  )}
                  <Link
                    to={uiSurface === 'supplier' ? '/supplier/orders' : '/account/orders'}
                    onClick={() => setIsOpen(false)}
                    className="text-base font-medium uppercase tracking-[0.18em] text-ink hover:text-rose-gold-deep"
                  >
                    {t('nav.orders')}
                  </Link>
                  {uiSurface !== 'supplier' && (
                  <Link
                    to="/account/security"
                    onClick={() => setIsOpen(false)}
                    className="text-base font-medium uppercase tracking-[0.18em] text-ink hover:text-rose-gold-deep"
                  >
                    {t('nav.security')}
                  </Link>
                  )}
                  {isStoneeStaffRole(userRole) && (
                    <Link
                      to="/merchant"
                      onClick={() => setIsOpen(false)}
                      className="text-base font-medium uppercase tracking-[0.18em] text-ink"
                    >
                      {t('nav.operationsHub')}
                    </Link>
                  )}
                  {isSupplierRole(userRole) && uiSurface !== 'supplier' && (
                    <Link
                      to="/supplier/portal"
                      onClick={() => setIsOpen(false)}
                      className="text-base font-medium uppercase tracking-[0.18em] text-ink"
                    >
                      {t('nav.supplierPortal')}
                    </Link>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={goAuth}
                className="btn-primary px-6 py-3 text-xs font-medium uppercase tracking-[0.22em] w-full text-center cursor-pointer border-0"
              >
                {isLoggedIn ? t('nav.account') : t('nav.signInRegister')}
              </button>
            </div>
          </div>
        )}
      </nav>
      <ConciergeModal isOpen={conciergeOpen} onClose={() => setConciergeOpen(false)} />
    </>
  );
};

export default Navbar;
