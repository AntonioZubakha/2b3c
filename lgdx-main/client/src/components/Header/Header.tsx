import React, { useState, useEffect } from 'react';
import { NavLink, Link } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import CartCounter from './CartCounter';
import LanguageSelector from '../common/LanguageSelector/LanguageSelector';
import ThemeToggle from '../common/ThemeToggle/ThemeToggle';
import NotificationBell from '../NotificationBell/NotificationBell';
import Logo from '../common/Logo/Logo';
import styles from './Header.module.css';
import { getCookie } from '../../utils/cookies';

const Header: React.FC = () => {
  const { 
    isAuthenticated, 
    user, 
    logout, 
    isLgdealSupervisor, 
    isImpersonating, 
    stopImpersonating 
  } = useAuth();
  const { t } = useTranslation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Optimization: Memoize localStorage read so we don't hit the disk on every re-render
  const { cookieImpersonation, localImpersonation } = React.useMemo(() => ({
    cookieImpersonation: getCookie('impersonation') === '1',
    localImpersonation: (() => {
      try { return localStorage.getItem('impersonation') === '1'; } catch { return false; }
    })()
  }), []);

  const getNavClass = React.useCallback(
    ({ isActive }: { isActive: boolean }) => isActive ? `${styles.navLink} ${styles.active}` : styles.navLink, 
    []
  );
  
  const getMobileNavClass = React.useCallback(
    ({ isActive }: { isActive: boolean }) => isActive ? `${styles.mobileNavLink} ${styles.active}` : styles.mobileNavLink, 
    []
  );

  const handleLogout = async (): Promise<void> => {
    await logout();
    setIsMobileMenuOpen(false);
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleMobileNavClick = () => {
    closeMobileMenu();
  };

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (isMobileMenuOpen && !target.closest(`.${styles.mobileMenuContent}`) && !target.closest(`.${styles.mobileMenuButton}`)) {
        closeMobileMenu();
      }
    };

    // Close mobile menu on escape key
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isMobileMenuOpen) {
        closeMobileMenu();
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscapeKey);
      document.body.classList.add('mobile-menu-open');
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
      document.body.classList.remove('mobile-menu-open');
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      {(isImpersonating || cookieImpersonation || localImpersonation) && (
        <div className={styles.impersonationBanner}>
          <span>{t('header.impersonationBanner')}</span>
          <button onClick={stopImpersonating} className={styles.impersonationButton}>
            {t('header.returnToAdmin')}
          </button>
        </div>
      )}
      <header className={styles.appHeader}>
        <Logo asLink linkClassName={styles.logoLink} size="sm" />
        
        {/* Desktop Navigation */}
        <nav aria-label="Main navigation">
          <NavLink to="/catalog" className={getNavClass}>{t('navigation.catalog')}</NavLink>
          {isAuthenticated && (
            <NavLink
              to="/market-overview"
              className={getNavClass}
              aria-label={t('navigation.marketOverview')}
              title={t('navigation.marketOverview')}
            >
              <span className={styles.navMarketLabelFull} aria-hidden="true">
                {t('navigation.marketOverview')}
              </span>
              <span className={styles.navMarketLabelShort} aria-hidden="true">
                {t('navigation.marketOverviewShort')}
              </span>
            </NavLink>
          )}
          <NavLink to="/about-us" className={getNavClass}>{t('navigation.aboutUs')}</NavLink>
          <NavLink to="/for-experts" className={getNavClass}>{t('navigation.forExperts')}</NavLink>

          {isAuthenticated && isLgdealSupervisor && (
            <NavLink
              to="/admin-panel"
              className={getNavClass}
              aria-label={t('navigation.adminPanel')}
              title={t('navigation.adminPanel')}
            >
              <span className={styles.navLabelFull} aria-hidden="true">
                {t('navigation.adminPanel')}
              </span>
              <span className={styles.navLabelShort} aria-hidden="true">
                {t('navigation.adminPanelShort')}
              </span>
            </NavLink>
          )}
          
          {isAuthenticated && (
            <NavLink to="/my-company" className={getNavClass}>{t('navigation.myCompany')}</NavLink>
          )}
          
          {isAuthenticated && user?.role !== 'logist' && (
            <NavLink to="/my-deals" className={getNavClass}>{t('navigation.myDeals')}</NavLink>
          )}
          
          {isAuthenticated && (user?.role === 'logist' || isLgdealSupervisor) && (
            <NavLink
              to="/logist-dashboard"
              className={getNavClass}
              aria-label={t('navigation.logistDashboard')}
              title={t('navigation.logistDashboard')}
            >
              <span className={styles.navLabelFull} aria-hidden="true">
                {t('navigation.logistDashboard')}
              </span>
              <span className={styles.navLabelShort} aria-hidden="true">
                {t('navigation.logistDashboardShort')}
              </span>
            </NavLink>
          )}
        </nav>
        
        <div className={styles.userActions}>
          <span className={styles.userActionDesktop}>
            <ThemeToggle />
          </span>
          {isAuthenticated ? (
            <>
              <span className={styles.userGreeting}>{t('header.greeting', { name: user?.firstName || t('header.user') })}</span>
              <span className={styles.userActionDesktop}><LanguageSelector /></span>
              <span className={styles.userActionDesktop}><NotificationBell /></span>
              <CartCounter />
              <span className={styles.userActionDesktop}>
                <button onClick={handleLogout} className={styles.navButton}>{t('navigation.logout')}</button>
              </span>
            </>
          ) : (
            <>
              <span className={styles.userActionDesktop}><LanguageSelector /></span>
              <span className={styles.userActionDesktop}>
                <NavLink to="/login" className={getNavClass}>{t('navigation.login')}</NavLink>
                <NavLink to="/register" className={getNavClass}>{t('navigation.register')}</NavLink>
              </span>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button 
          className={styles.mobileMenuButton}
          onClick={toggleMobileMenu}
          aria-label={t('header.toggleMenu')}
          aria-expanded={isMobileMenuOpen}
          aria-controls="app-mobile-menu"
        >
          <i className="fas fa-bars"></i>
        </button>
      </header>

      {/* Mobile Menu */}
      <div 
        id="app-mobile-menu"
        className={`${styles.mobileMenu} ${isMobileMenuOpen ? styles.open : ''}`}
        aria-hidden={!isMobileMenuOpen}
      >
        <div className={styles.mobileMenuContent}>
          <div className={styles.mobileMenuHeader}>
            <Link to="/" onClick={handleMobileNavClick} className={styles.mobileLogoLink}>
              <Logo asLink={false} size="sm" />
            </Link>
            <button 
              className={styles.mobileMenuClose}
              onClick={closeMobileMenu}
              aria-label={t('header.closeMenu')}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          
          <nav className={styles.mobileNav} aria-label="Mobile navigation">
            <NavLink 
              to="/catalog" 
              className={getMobileNavClass}
              onClick={handleMobileNavClick}
            >
              {t('navigation.catalog')}
            </NavLink>
            {isAuthenticated && (
              <NavLink 
                to="/market-overview" 
                className={getMobileNavClass}
                onClick={handleMobileNavClick}
              >
                {t('navigation.marketOverview')}
              </NavLink>
            )}
            <NavLink 
              to="/about-us" 
              className={getMobileNavClass}
              onClick={handleMobileNavClick}
            >
              {t('navigation.aboutUs')}
            </NavLink>
            
            {isAuthenticated && isLgdealSupervisor && (
              <NavLink 
                to="/admin-panel" 
                className={getMobileNavClass}
                onClick={handleMobileNavClick}
              >
                {t('navigation.adminPanel')}
              </NavLink>
            )}
            
            {isAuthenticated && (
              <NavLink 
                to="/my-company" 
                className={getMobileNavClass}
                onClick={handleMobileNavClick}
              >
                {t('navigation.myCompany')}
              </NavLink>
            )}
            
            {isAuthenticated && user?.role !== 'logist' && (
              <NavLink 
                to="/my-deals" 
                className={getMobileNavClass}
                onClick={handleMobileNavClick}
              >
                {t('navigation.myDeals')}
              </NavLink>
            )}
            
            {isAuthenticated && (user?.role === 'logist' || isLgdealSupervisor) && (
              <NavLink 
                to="/logist-dashboard" 
                className={getMobileNavClass}
                onClick={handleMobileNavClick}
              >
                {t('navigation.logistDashboard')}
              </NavLink>
            )}
          </nav>
          
          <div className={styles.mobileUserActions}>
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <div className={styles.mobileUserGreeting}>
                  {t('header.greeting', { name: user?.firstName || t('header.user') })}
                </div>
                <LanguageSelector />
                <Link to="/cart" className={styles.mobileNavButton} onClick={handleMobileNavClick}>
                  <i className="fas fa-shopping-cart"></i> {t('navigation.cart')}
                </Link>
                <button onClick={handleLogout} className={styles.mobileNavButton}>
                  {t('navigation.logout')}
                </button>
              </>
            ) : (
              <>
                <LanguageSelector />
                <NavLink 
                  to="/login" 
                  className={getMobileNavClass}
                  onClick={handleMobileNavClick}
                >
                  {t('navigation.login')}
                </NavLink>
                <NavLink 
                  to="/register" 
                  className={getMobileNavClass}
                  onClick={handleMobileNavClick}
                >
                  {t('navigation.register')}
                </NavLink>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Header; 