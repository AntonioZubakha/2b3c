import React, { useEffect } from 'react';
import { useTranslation } from '../../i18n';
import styles from './FAQPage.module.css';
import SEO from '../../components/common/SEO/SEO';

const FAQ_KEYS = [
  { q: 'q1' as const, a: 'a1' as const },
  { q: 'q2' as const, a: 'a2' as const },
  { q: 'q3' as const, a: 'a3' as const },
  { q: 'q4' as const, a: 'a4' as const },
  { q: 'q5' as const, a: 'a5' as const },
  { q: 'q6' as const, a: 'a6' as const },
  { q: 'q7' as const, a: 'a7' as const },
  { q: 'q8' as const, a: 'a8' as const },
  { q: 'q9' as const, a: 'a9' as const },
  { q: 'q10' as const, a: 'a10' as const },
];

const FAQPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <SEO
        title={t('faq.title')}
        description="Frequently asked questions about LGDeal - lab-grown diamonds, market prices, data analytics, certifications, delivery tracking, and account management."
        type="website"
        noindex={false}
        nofollow={false}
      />
      <div className={styles.faqPage}>
        <div className={styles.container}>
          <header className={styles.header}>
            <h1 className={styles.title}>{t('faq.title')}</h1>
          </header>

          <div className={styles.content}>
            {FAQ_KEYS.map(({ q, a }, index) => (
              <section key={q} className={styles.item} aria-labelledby={`faq-q-${index + 1}`}>
                <h2 id={`faq-q-${index + 1}`} className={styles.question}>
                  {t(`faq.${q}`)}
                </h2>
                <p className={styles.answer}>{t(`faq.${a}`)}</p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default FAQPage;
