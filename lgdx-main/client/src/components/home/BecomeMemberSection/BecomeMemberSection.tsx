import React, { memo } from 'react';
import { useTranslation } from '../../../i18n';
import styles from './BecomeMemberSection.module.css';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';

const BecomeMemberSection: React.FC = memo(() => {
  const { t } = useTranslation();

  return (
    <section
      className={styles.section}
      aria-labelledby="become-member-heading"
      role="region"
    >
      <div className={`${styles.wrapper} animateOnScroll`}>
        <HomeSectionHeader
          id="become-member-heading"
          title={t('becomeMember.heading')}
          subtitle={t('becomeMember.intro')}
        />
        <p className={styles.kyc}>
          <span className={styles.kycIcon} aria-hidden="true">✓</span>
          {t('becomeMember.kyc')}
        </p>
      </div>
    </section>
  );
});

BecomeMemberSection.displayName = 'BecomeMemberSection';

export default BecomeMemberSection;
