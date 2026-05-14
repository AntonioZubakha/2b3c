import React, { memo, useMemo } from 'react';
import { useTranslation } from '../../../i18n';
import type { TranslationKey } from '../../../i18n/types';
import styles from './FeaturesSection.module.css';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';

interface Feature {
  icon: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  ariaLabel: string;
}

const FeaturesSection: React.FC = memo(() => {
  const { t } = useTranslation();

  const features: Feature[] = useMemo(() => [
    {
      icon: 'certification',
      titleKey: 'features.qualityControl.title',
      descriptionKey: 'features.qualityControl.description',
      ariaLabel: t('accessibility.qualityControlIcon')
    },
    {
      icon: 'technology',
      titleKey: 'features.aiAnalytics.title',
      descriptionKey: 'features.aiAnalytics.description',
      ariaLabel: t('accessibility.aiTechnologyIcon')
    },
    {
      icon: 'value',
      titleKey: 'features.consolidatedShipments.title',
      descriptionKey: 'features.consolidatedShipments.description',
      ariaLabel: t('accessibility.valueIcon')
    },
    {
      icon: 'service',
      titleKey: 'features.personalizedService.title',
      descriptionKey: 'features.personalizedService.description',
      ariaLabel: t('accessibility.personalizedServiceIcon')
    }
  ], [t]);

  return (
    <section 
      className={styles.featuresSection} 
      aria-labelledby="features-heading"
      role="region"
    >
      <div className="animateOnScroll">
        <HomeSectionHeader
          id="features-heading"
          title={
            <>
              {t('features.heading')} <span className="homeAccent">{t('features.elitePromise')}</span>
            </>
          }
          subtitle={t('features.subheading')}
        />
      </div>
      <div className={`${styles.featuresGrid} animateOnScroll`} role="list">
        {features.map((feature) => (
          <article 
            key={feature.icon}
            className={styles.featureCard} 
            role="listitem"
          >
            <div 
              className={`${styles.featureIcon} ${styles[`icon${feature.icon.charAt(0).toUpperCase() + feature.icon.slice(1)}`]}`}
              aria-hidden="true"
              role="img"
              aria-label={feature.ariaLabel}
            />
            <h3 className={styles.featureTitle}>{t(feature.titleKey)}</h3>
            <p className={styles.featureDescription}>{t(feature.descriptionKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
});

FeaturesSection.displayName = 'FeaturesSection';

export default FeaturesSection;

