import React, { useEffect } from 'react';
import { useTranslation } from '../../i18n';
import SEO from '../../components/common/SEO/SEO';
import styles from './PrivacyPolicyPage.module.css';

const PrivacyPolicyPage: React.FC = () => {
  const { t } = useTranslation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className={styles.privacyPage}>
      <SEO
        title={`${t('privacyPolicy.title')} – LGDeal`}
        description={t('privacyPolicy.introduction1')}
      />
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>{t('privacyPolicy.title')}</h1>
          <p className={styles.lastUpdated}>{t('privacyPolicy.lastUpdated')}</p>
        </header>

        <div className={styles.content}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.introduction')}</h2>
            <p>
              {t('privacyPolicy.introduction1')} <a href="/terms-of-use" className={styles.link}>{t('privacyPolicy.termsOfUseLink')}</a> {t('privacyPolicy.introduction2')}
            </p>
            <p>
              {t('privacyPolicy.introduction3')}
            </p>
            <p className={styles.notice}>
              {t('privacyPolicy.introduction4')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.informationWeCollect')}</h2>
            
            <h3 className={styles.subsectionTitle}>1. {t('privacyPolicy.dataYouProvide')}</h3>
            <p>{t('privacyPolicy.dataYouProvideDescription')}</p>
            <ul>
              <li>{t('privacyPolicy.dataYouProvideList1')}</li>
              <li>{t('privacyPolicy.dataYouProvideList2')}</li>
              <li>{t('privacyPolicy.dataYouProvideList3')}</li>
              <li>{t('privacyPolicy.dataYouProvideList4')}</li>
              <li>{t('privacyPolicy.dataYouProvideList5')}</li>
              <li>{t('privacyPolicy.dataYouProvideList6')}</li>
              <li>{t('privacyPolicy.dataYouProvideList7')}</li>
              <li>{t('privacyPolicy.dataYouProvideList8')}</li>
              <li>{t('privacyPolicy.dataYouProvideList9')}</li>
              <li>{t('privacyPolicy.dataYouProvideList10')}</li>
              <li>{t('privacyPolicy.dataYouProvideList11')}</li>
              <li>{t('privacyPolicy.dataYouProvideList12')}</li>
              <li>{t('privacyPolicy.dataYouProvideList13')}</li>
              <li>{t('privacyPolicy.dataYouProvideList14')}</li>
            </ul>

            <h3 className={styles.subsectionTitle}>2. {t('privacyPolicy.dataCollectedAutomatically')}</h3>
            <p>
              {t('privacyPolicy.dataCollectedAutomatically1')}
            </p>
            <p>
              {t('privacyPolicy.dataCollectedAutomatically2')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.purposesForData')}</h2>
            
            <h3 className={styles.subsectionTitle}>{t('privacyPolicy.purposesDataYouProvide')}</h3>
            <p>{t('privacyPolicy.purposesDataYouProvideDescription')}</p>
            <ul>
              <li>{t('privacyPolicy.purposesDataYouProvideList1')}</li>
              <li>{t('privacyPolicy.purposesDataYouProvideList2')}</li>
              <li>{t('privacyPolicy.purposesDataYouProvideList3')}</li>
              <li>{t('privacyPolicy.purposesDataYouProvideList4')}</li>
              <li>{t('privacyPolicy.purposesDataYouProvideList5')}</li>
              <li>{t('privacyPolicy.purposesDataYouProvideList6')}</li>
              <li>{t('privacyPolicy.purposesDataYouProvideList7')}</li>
            </ul>

            <h3 className={styles.subsectionTitle}>{t('privacyPolicy.purposesDataCollectedAutomatically')}</h3>
            <p>{t('privacyPolicy.purposesDataCollectedAutomaticallyDescription')}</p>
            <ul>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList1')}</li>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList2')}</li>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList3')}</li>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList4')}</li>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList5')}</li>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList6')}</li>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList7')}</li>
              <li>{t('privacyPolicy.purposesDataCollectedAutomaticallyList8')}</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.howWeDisclose')}</h2>
            <p className={styles.emphasis}>
              {t('privacyPolicy.howWeDiscloseEmphasis')}
            </p>
            
            <h3 className={styles.subsectionTitle}>{t('privacyPolicy.howWeDisclosePersonal')}</h3>
            <p>{t('privacyPolicy.howWeDisclosePersonalDescription')}</p>
            <ul>
              <li>{t('privacyPolicy.howWeDisclosePersonalList1')}</li>
              <li>{t('privacyPolicy.howWeDisclosePersonalList2')}</li>
              <li>{t('privacyPolicy.howWeDisclosePersonalList3')}</li>
              <li>{t('privacyPolicy.howWeDisclosePersonalList4')}</li>
              <li>{t('privacyPolicy.howWeDisclosePersonalList5')}</li>
            </ul>

            <h3 className={styles.subsectionTitle}>{t('privacyPolicy.howWeDiscloseAutomatic')}</h3>
            <p>
              {t('privacyPolicy.howWeDiscloseAutomaticDescription')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.yourRights')}</h2>
            <p>{t('privacyPolicy.yourRightsDescription')}</p>
            <ul>
              <li>
                <strong>{t('privacyPolicy.yourRightsKnow')}</strong> {t('privacyPolicy.yourRightsKnowDescription')} <a href="mailto:info@lgdeal.com" className={styles.link}>info@lgdeal.com</a>.
              </li>
              <li>
                <strong>{t('privacyPolicy.yourRightsCorrect')}</strong> {t('privacyPolicy.yourRightsCorrectDescription')} <a href="mailto:info@lgdeal.com" className={styles.link}>info@lgdeal.com</a>.
              </li>
              <li>
                <strong>{t('privacyPolicy.yourRightsOptOut')}</strong> {t('privacyPolicy.yourRightsOptOutDescription')}
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.californiaCustomers')}</h2>
            <p>
              {t('privacyPolicy.californiaCustomersDescription')}
            </p>
            <ul>
              <li>{t('privacyPolicy.californiaCustomersList1')}</li>
              <li>{t('privacyPolicy.californiaCustomersList2')}
                <ul>
                  <li>{t('privacyPolicy.californiaCustomersList2a')}</li>
                  <li>{t('privacyPolicy.californiaCustomersList2b')}</li>
                  <li>{t('privacyPolicy.californiaCustomersList2c')}</li>
                  <li>{t('privacyPolicy.californiaCustomersList2d')}</li>
                  <li>{t('privacyPolicy.californiaCustomersList2e')}</li>
                </ul>
              </li>
              <li>{t('privacyPolicy.californiaCustomersList3')}</li>
            </ul>
            <p className={styles.emphasis}>
              {t('privacyPolicy.californiaCustomersEmphasis')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.dataSecurity')}</h2>
            <p>
              {t('privacyPolicy.dataSecurity1')}
            </p>
            <p>
              {t('privacyPolicy.dataSecurity2')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.internationalTransfers')}</h2>
            <p>
              {t('privacyPolicy.internationalTransfersDescription')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.childrenPrivacy')}</h2>
            <p className={styles.emphasis}>
              {t('privacyPolicy.childrenPrivacyDescription')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.changesToPolicy')}</h2>
            <p>
              {t('privacyPolicy.changesToPolicy1')}
            </p>
            <p>
              {t('privacyPolicy.changesToPolicy2')}
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('privacyPolicy.questionsOrConcerns')}</h2>
            <p>
              {t('privacyPolicy.questionsOrConcernsDescription')}
            </p>
            <div className={styles.contactBox}>
              <p><strong>{t('privacyPolicy.questionsOrConcernsEmail')}</strong> <a href="mailto:info@lgdeal.com" className={styles.link}>info@lgdeal.com</a></p>
              <address className={styles.address}>
                <strong>{t('privacyPolicy.questionsOrConcernsMail')}</strong><br />
                {t('privacyPolicy.questionsOrConcernsAddress')}
              </address>
            </div>
            <p>{t('privacyPolicy.questionsOrConcernsResolve')}</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;

