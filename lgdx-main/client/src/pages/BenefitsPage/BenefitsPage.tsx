import React, { useEffect } from 'react';
import { useLocation, useNavigate } from '../../routes';
import { useTranslation } from '../../i18n';
import {
  FaUserTie,
  FaCloudUploadAlt,
  FaRoute,
  FaBoxes,
  FaEye,
  FaGem,
  FaCheckCircle,
  FaChartLine,
  FaChartBar,
  FaNewspaper,
  FaShippingFast,
  FaStar,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';
import styles from './BenefitsPage.module.css';
import SEO from '../../components/common/SEO/SEO';

const SUPPLIER_ITEMS = [
  { key: 'forSuppliers.item1', icon: FaUserTie },
  { key: 'forSuppliers.item2', icon: FaCloudUploadAlt },
  { key: 'forSuppliers.item3', icon: FaRoute },
  { key: 'forSuppliers.item4', icon: FaBoxes },
  { key: 'forSuppliers.item5', icon: FaEye },
] as const satisfies { key: string; icon: IconType }[];

const BUYER_ITEMS = [
  { key: 'forBuyers.item1', icon: FaGem },
  { key: 'forBuyers.item2', icon: FaCheckCircle },
  { key: 'forBuyers.item3', icon: FaChartLine },
  { key: 'forBuyers.item4', icon: FaChartBar },
  { key: 'forBuyers.item5', icon: FaNewspaper },
  { key: 'forBuyers.item6', icon: FaUserTie },
  { key: 'forBuyers.item7', icon: FaShippingFast },
] as const satisfies { key: string; icon: IconType }[];

const BenefitsPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isBuyers = location.pathname === '/for-buyers';

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [isBuyers]);

  const section = isBuyers ? 'forBuyers' : 'forSuppliers';
  const items = isBuyers ? BUYER_ITEMS : SUPPLIER_ITEMS;
  const title = t(`${section}.title`);
  const intro = t(`${section}.intro`);

  const handleTabSuppliers = () => {
    if (isBuyers) navigate('/for-suppliers');
  };
  const handleTabBuyers = () => {
    if (!isBuyers) navigate('/for-buyers');
  };

  return (
    <>
      <SEO
        title={title}
        description={`${intro} ${title} - LGDeal benefits.`}
        type="website"
        noindex={false}
        nofollow={false}
      />
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <h1 className={styles.benefitsTitle}>{t('footer.benefits')}</h1>
            <div className={styles.tabs} role="tablist" aria-label="Benefits section">
              <button
                type="button"
                role="tab"
                aria-selected={!isBuyers}
                aria-controls="benefits-content"
                id="tab-suppliers"
                className={`${styles.tab} ${!isBuyers ? styles.tabActive : ''}`}
                onClick={handleTabSuppliers}
              >
                {t('footer.forSuppliers')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={isBuyers}
                aria-controls="benefits-content"
                id="tab-buyers"
                className={`${styles.tab} ${isBuyers ? styles.tabActive : ''}`}
                onClick={handleTabBuyers}
              >
                {t('footer.forBuyers')}
              </button>
            </div>
            <p className={styles.intro} id="benefits-content">
              {intro}
            </p>
          </header>

          <div className={styles.grid}>
            {!isBuyers && (
              <article className={styles.card}>
                <FaStar className={styles.cardIcon} aria-hidden />
                <h2 className={styles.cardTitle}>{t('forSuppliers.tagline')}</h2>
                <p className={styles.cardDescription}>{t('forSuppliers.fairPricing')}</p>
              </article>
            )}
            {items.map(({ key, icon: Icon }) => (
              <article key={`${section}-${key}`} className={styles.card}>
                <Icon className={styles.cardIcon} aria-hidden />
                <h2 className={styles.cardTitle}>{t(key)}</h2>
                <p className={styles.cardDescription}>{t(`${key}Description`)}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default BenefitsPage;
