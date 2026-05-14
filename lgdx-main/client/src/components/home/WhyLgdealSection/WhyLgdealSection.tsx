import React, { memo } from 'react';
import { useTranslation } from '../../../i18n';
import styles from './WhyLgdealSection.module.css';
import HomeSectionHeader from '../HomeSectionHeader/HomeSectionHeader';

const WhyLgdealSection: React.FC = memo(() => {
  const { t } = useTranslation();

  const items = [
    { titleKey: 'whyLgdeal.item1Title' as const, textKey: 'whyLgdeal.item1Text' as const },
    { titleKey: 'whyLgdeal.item2Title' as const, textKey: 'whyLgdeal.item2Text' as const },
    { titleKey: 'whyLgdeal.item3Title' as const, textKey: 'whyLgdeal.item3Text' as const },
    { titleKey: 'whyLgdeal.item4Title' as const, textKey: 'whyLgdeal.item4Text' as const },
  ];

  return (
    <section
      className={styles.section}
      aria-labelledby="why-lgdeal-heading"
      role="region"
    >
      <div className="animateOnScroll">
        <HomeSectionHeader id="why-lgdeal-heading" title={t('whyLgdeal.heading')} />
      </div>
      <div className={`${styles.grid} animateOnScroll`} role="list">
        {items.map((item) => {
          const text = t(item.textKey);
          return (
            <article
              key={item.titleKey}
              className={styles.card}
              role="listitem"
            >
              <h3 className={styles.cardTitle}>{t(item.titleKey)}</h3>
              {text ? <p className={styles.cardText}>{text}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
});

WhyLgdealSection.displayName = 'WhyLgdealSection';

export default WhyLgdealSection;
