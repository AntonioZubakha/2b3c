import React, { memo, useMemo } from 'react';
import { useTranslation } from '../../../i18n';
import type { TranslationKey } from '../../../i18n/types';
import { useHomeStats } from '../../../hooks/useHomeStats';
import styles from './CollectionSection.module.css';
import ButtonLink from '../../common/Button/ButtonLink';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';
import roundIcon from '../../../assets/images/round_shape.svg';
import ovalIcon from '../../../assets/images/oval_shape.svg';
import princessIcon from '../../../assets/images/princess_shape.svg';
import emeraldIcon from '../../../assets/images/emerald_shape.svg';

interface CollectionStat {
  value: string;
  label: string;
  description: string;
}

interface CollectionFeature {
  icon: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  ariaLabel: string;
}

interface CollectionShapeOption {
  icon: string;
  label: string;
  nameKey: TranslationKey;
}

const CollectionSection: React.FC = memo(() => {
  const { t } = useTranslation();
  const { stonesFormatted, loading } = useHomeStats();

  const stats = useMemo<CollectionStat[]>(() => [
    {
      value: loading ? t('hero.stats250k') : stonesFormatted,
      label: t('collection.stones'),
      description: t('collection.premiumStones'),
    },
    {
      value: '98%',
      label: t('collection.matchRate'),
      description: t('collection.perfectPairAccuracy'),
    },
    {
      value: t('collection.aiAnalytics24'),
      label: t('features.aiAnalytics.title'),
      description: t('collection.realTimeInsights'),
    },
  ], [t, loading, stonesFormatted]);

  const features = useMemo<CollectionFeature[]>(() => [
    {
      icon: 'fas fa-gem',
      titleKey: 'collection.eliteCuts',
      descriptionKey: 'collection.eliteCutsDescription',
      ariaLabel: 'Diamond cut icon'
    },
    {
      icon: 'fas fa-star',
      titleKey: 'collection.exceptionalQuality',
      descriptionKey: 'collection.exceptionalQualityDescription',
      ariaLabel: 'Quality star icon'
    },
    {
      icon: 'fas fa-shield-alt',
      titleKey: 'collection.ethicalExcellence',
      descriptionKey: 'collection.ethicalExcellenceDescription',
      ariaLabel: 'Ethical shield icon'
    },
  ], []);

  const shapes = useMemo<CollectionShapeOption[]>(() => [
    { icon: roundIcon, label: 'Round cut diamond', nameKey: 'collection.round' },
    { icon: ovalIcon, label: 'Oval cut diamond', nameKey: 'collection.oval' },
    { icon: princessIcon, label: 'Princess cut diamond', nameKey: 'collection.princess' },
    { icon: emeraldIcon, label: 'Emerald cut diamond', nameKey: 'collection.emerald' },
  ], []);

  return (
    <section 
      className={`${styles.collectionSection} animateOnScroll`}
      aria-labelledby="collection-heading"
      role="region"
    >
      <div className="animateOnScroll">
        <HomeSectionHeader
          id="collection-heading"
          title={
            <>
              {t('collection.heading')} <span className="homeAccent">{t('collection.collection')}</span>
            </>
          }
          subtitle={t('collection.subheading')}
        />
      </div>

      {/* Statistics Banner */}
      <div className={styles.statsBanner}>
        {stats.map((stat, index) => (
          <div key={index} className={styles.statCard}>
            <div className={styles.statValue}>{stat.value}</div>
            <div className={styles.statLabel}>{stat.label}</div>
            <div className={styles.statDescription}>{stat.description}</div>
          </div>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className={styles.collectionContent}>
        {/* Visual Rail */}
        <aside className={styles.shapeShowcase}>
          <div className={styles.shapeShowcaseHeader}>
            <h3 className={styles.shapeShowcaseTitle}>{t('collection.popularShapes')}</h3>
            <p className={styles.shapeShowcaseSubtitle}>{t('collection.discoverShapes')}</p>
          </div>
          <div className={styles.shapesGrid}>
            {shapes.map((shape, index) => (
              <div 
                key={index}
                className={styles.shapeCard}
              >
                <div className={styles.shapeContainer} aria-label={shape.label}>
                  <img 
                    src={shape.icon} 
                    alt={shape.label}
                    className={styles.shapeImage}
                  />
                </div>
                <span className={styles.shapeCaption}>{t(shape.nameKey)}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Content Rail */}
        <div className={styles.collectionText}>
          <div className={styles.introBlock}>
            <h3 className={styles.introTitle}>
              {t('collection.craftedWith')} <span className="homeAccent">{t('collection.precision')}</span>
            </h3>
            <p className={styles.introText}>
              {t('collection.craftedDescription')}
            </p>
          </div>

          <div className={styles.featuresGrid}>
            {features.map((feature, index) => (
              <article 
                key={index}
                className={styles.featureCard} 
                role="article"
              >
                <div className={styles.featureIconWrapper}>
                  <i 
                    className={`${feature.icon} ${styles.featureIcon}`} 
                    aria-hidden="true" 
                    role="img" 
                    aria-label={feature.ariaLabel}
                  />
                </div>
                <div className={styles.featureContent}>
                  <h4 className={styles.featureTitle}>{t(feature.titleKey)}</h4>
                  <p className={styles.featureDescription}>{t(feature.descriptionKey)}</p>
                </div>
              </article>
            ))}
          </div>

          <div className={styles.ctaWrapper}>
            <ButtonLink to="/catalog" variant="primary" size="lg" className={styles.collectionCta}>
              <span>{t('hero.exploreCollection')}</span>
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
});

CollectionSection.displayName = 'CollectionSection';

export default CollectionSection;

