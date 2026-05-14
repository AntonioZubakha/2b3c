import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n';
import Logo from '../common/Logo/Logo';
import styles from './Footer.module.css';
import { Link } from '../../routes';

const currentYear = new Date().getFullYear();

const Footer: React.FC = () => {
  const { isAuthenticated, isLgdealSupervisor } = useAuth();
  const { t } = useTranslation();
  
  return (
    <footer className={styles.appFooter}>
      <div className={styles.footerContainer}>
        <div className={`${styles.footerSection} ${styles.footerBrand}`}>
          <Logo asLink={false} size="sm" className={styles.footerLogo} />
          <p className={styles.tagline}>{t('footer.tagline')}</p>
          <div className={styles.socialIcons}>
            <a href="https://www.facebook.com/lgdeal.us" target="_blank" rel="noopener noreferrer"><i className="fab fa-facebook-f"></i></a>
            <a href="https://www.linkedin.com/company/lgdeal/" target="_blank" rel="noopener noreferrer"><i className="fab fa-linkedin-in"></i></a>
            <a href="https://www.instagram.com/lgdeal.us/" target="_blank" rel="noopener noreferrer"><i className="fab fa-instagram"></i></a>
          </div>
        </div>
        <div className={`${styles.footerSection} ${styles.footerLinks}`}>
          <h5>{t('footer.usefulLinks')}</h5>
          <nav>
            <Link to="/">{t('navigation.home')}</Link>
            <Link to="/catalog">{t('navigation.catalog')}</Link>
            <Link to="/for-suppliers">{t('footer.forSuppliers')}</Link>
            <Link to="/for-buyers">{t('footer.forBuyers')}</Link>
            {isAuthenticated && <Link to="/my-deals">{t('navigation.myDeals')}</Link>}
            <Link to="/about-us">{t('navigation.aboutUs')}</Link>
            {isAuthenticated && <Link to="/my-company">{t('navigation.myCompany')}</Link>}
            {isAuthenticated && isLgdealSupervisor && (
              <Link to="/admin-panel">{t('navigation.adminPanel')}</Link>
            )}
          </nav>
        </div>
        <div className={`${styles.footerSection} ${styles.footerLinks}`}>
          <h5>{t('footer.information')}</h5>
          <nav>
            <Link to="/terms-of-use">{t('footer.termsOfUse')}</Link>
            <Link to="/privacy-policy">{t('footer.privacyPolicy')}</Link>
            <a href="/#schedule-demo">{t('footer.scheduleDemo')}</a>
            <Link to="/faq">{t('footer.faq')}</Link>
          </nav>
        </div>
        <div className={`${styles.footerSection} ${styles.footerContact}`}>
          <h5>{t('footer.contact')}</h5>
          <p><i className="fas fa-envelope"></i> Email: info@lgdeal.com</p>
          <p><i className="fas fa-phone"></i> Phone: +1 808 594 7382</p>
          <p><i className="fas fa-map-marker-alt"></i> {t('footer.address')}</p>
        </div>
      </div>
      <div className={styles.footerCopyright}>
        {t('footer.copyright', { year: currentYear })}
      </div>
    </footer>
  );
};

export default Footer; 