import React, { memo, useState } from 'react';
import { useTranslation } from '../../../i18n';
import styles from './CTASection.module.css';
import ButtonLink from '../../common/Button/ButtonLink';
import Button from '../../common/Button/Button';
import RequestDemoModal from '../RequestDemoModal/RequestDemoModal';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';

const CTASection: React.FC = memo(() => {
  const { t } = useTranslation();
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  
  return (
    <section 
      id="schedule-demo"
      className={`${styles.ctaSection} animateOnScroll`}
      aria-labelledby="cta-heading"
      role="region"
    >
      <div className={styles.ctaContent}>
        <HomeSectionHeader
          id="cta-heading"
          title={
            <>
              {t('cta.heading')} <span className="homeAccent">{t('cta.diamondAcquisition')}</span>
            </>
          }
          subtitle={t('cta.description')}
        />
        <div className={styles.ctaButtons} role="group" aria-label={t('accessibility.callToActionButtons')}>
          <ButtonLink to="/catalog" variant="primary" size="lg">
            <span>{t('hero.exploreCollection')}</span>
          </ButtonLink>
          <Button variant="secondary" size="lg" onClick={() => setIsDemoModalOpen(true)}>
            <span>{t('cta.requestDemo')}</span>
          </Button>
        </div>
      </div>
      <RequestDemoModal isOpen={isDemoModalOpen} onClose={() => setIsDemoModalOpen(false)} />
    </section>
  );
});

CTASection.displayName = 'CTASection';

export default CTASection;

