import React, { useEffect } from 'react';
import { useTranslation } from '../../i18n';
import styles from './TermsOfUsePage.module.css';
import SEO from '../../components/common/SEO/SEO';

const TermsOfUsePage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <SEO
        title={t('termsOfUse.title')}
        description="Terms of Use for LGDeal - Global B2B Lab-Grown Diamond Exchange. Read our terms and conditions for using our diamond trading platform."
        type="website"
        noindex={false}
        nofollow={false}
      />
      <div className={styles.termsPage}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t('termsOfUse.title')}</h1>
          <p className={styles.lastUpdated}>{t('termsOfUse.lastUpdated')}</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <p className={styles.notice}>
              {t('termsOfUse.notice')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.introduction')}</h2>
            <p>{t('termsOfUse.introduction1')}</p>
            <p>{t('termsOfUse.introduction2')}</p>
            <p>{t('termsOfUse.introduction3')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.eligibility')}</h2>
            <p>{t('termsOfUse.eligibility1')}</p>
            <p>{t('termsOfUse.eligibility2')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.changesToTerms')}</h2>
            <p>{t('termsOfUse.changesToTerms1')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.definitions')}</h2>
            <ul className={styles.definitionList}>
              <li>
                <strong>{t('termsOfUse.productDefinition')}</strong>
              </li>
              <li>
                <strong>{t('termsOfUse.customerDefinition')}</strong>
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.inventoryInformationUse')}</h2>
            <p>{t('termsOfUse.inventoryInfo1')}</p>
            <p>{t('termsOfUse.inventoryInfo2')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.userContent')}</h2>
            <p>{t('termsOfUse.userContent1')}</p>
            <p>{t('termsOfUse.userContent2')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.intellectualProperty')}</h2>
            <p>{t('termsOfUse.intellectualProperty1')}</p>
            <p>{t('termsOfUse.intellectualProperty2')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.copyrightInfringement')}</h2>
            <p>{t('termsOfUse.copyright1')}</p>
            <p>
              {t('termsOfUse.copyright2')}{' '}
              <a href="mailto:info@lgdeal.com" className={styles.link}>info@lgdeal.com</a>
              {' '}
              {t('termsOfUse.copyright3')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.prohibitedActivities')}</h2>
            <p>{t('termsOfUse.prohibitedIntro')}</p>
            <ul>
              <li>{t('termsOfUse.prohibited1')}</li>
              <li>{t('termsOfUse.prohibited2')}</li>
              <li>{t('termsOfUse.prohibited3')}</li>
              <li>{t('termsOfUse.prohibited4')}</li>
              <li>{t('termsOfUse.prohibited5')}</li>
              <li>{t('termsOfUse.prohibited6')}</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.privacySecurity')}</h2>
            <p>
              {t('termsOfUse.privacySecurity1')}{' '}
              <a href="/privacy-policy" className={styles.link}>{t('privacyPolicy.title') || 'Privacy Policy'}</a>
              {' '}
              {t('termsOfUse.privacySecurity2')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.serviceAsIs')}</h2>
            <p className={styles.emphasis}>
              {t('termsOfUse.serviceAsIs1')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.linksToThirdParty')}</h2>
            <p>{t('termsOfUse.linksToThirdParty1')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.limitationOfLiability')}</h2>
            <p className={styles.emphasis}>
              {t('termsOfUse.limitationOfLiability1')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.governingLaw')}</h2>
            <p>{t('termsOfUse.governingLaw1')}</p>
            <p className={styles.emphasis}>
              {t('termsOfUse.governingLaw2')}
            </p>
            <p>{t('termsOfUse.governingLaw3')}</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.contact')}</h2>
            <p>
              {t('termsOfUse.contact1')}{' '}
              <a href="mailto:info@lgdeal.com" className={styles.link}>info@lgdeal.com</a>
              {' '}
              {t('termsOfUse.contact2')}
            </p>
            <address className={styles.address}>
              {t('termsOfUse.contactAddress').split('\n').map((line, idx, arr) => (
                <React.Fragment key={idx}>
                  {line}
                  {idx < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </address>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('termsOfUse.termAndTermination')}</h2>
            <p>{t('termsOfUse.termAndTermination1')}</p>
          </section>
        </div>
      </div>
    </div>
    </>
  );
};

export default TermsOfUsePage;

