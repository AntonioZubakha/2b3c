import React from "react";
import { useTranslation } from "../../i18n";
import PageHeader from "../../components/common/PageHeader/PageHeader";
import styles from "./AboutUsPage.module.css";
import SEO from "../../components/common/SEO/SEO";
import PageContainer from "../../components/common/PageContainer/PageContainer";

const AboutUsPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <SEO
        title={`${t("aboutUs.title")} – ${t("hero.preHeadline")}`}
        description={t("aboutUs.conclusion")}
        keywords={[
          "about lgdeal",
          t("hero.preHeadline"),
          "diamond trading platform",
          "B2B diamonds",
        ]}
        type="website"
      />

      <PageHeader
        title={t("aboutUs.title")}
        subtitle={t("aboutUs.subtitle")}
      />

      <div className={styles.aboutUsPage}>

        {/* Who We Are Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <i className="fas fa-users"></i>
            <h2>{t("aboutUs.whoWeAre")}</h2>
          </div>

          <div className={styles.cardsGrid}>
            <div className={styles.featureCard}>
              <div className={styles.cardIcon}>
                <i className="fas fa-rocket"></i>
              </div>
              <h3>{t("aboutUs.innovationTitle")}</h3>
              <p>{t("aboutUs.innovationDescription")}</p>
            </div>

            <div className={styles.featureCard}>
              <div className={styles.cardIcon}>
                <i className="fas fa-globe"></i>
              </div>
              <h3>{t("aboutUs.teamTitle")}</h3>
              <p>{t("aboutUs.teamDescription")}</p>
            </div>
          </div>
        </div>

        {/* Vision & Mission Section */}
        <div className={styles.visionMissionGrid}>
          <div className={styles.visionCard}>
            <div className={styles.cardIcon}>
              <i className="fas fa-eye"></i>
            </div>
            <h2>{t("aboutUs.vision")}</h2>
            <p>{t("aboutUs.visionDescription")}</p>
          </div>

          <div className={styles.missionCard}>
            <div className={styles.cardIcon}>
              <i className="fas fa-bullseye"></i>
            </div>
            <h2>{t("aboutUs.mission")}</h2>
            <p>{t("aboutUs.missionDescription")}</p>
          </div>
        </div>

        {/* Conclusion CTA Section */}
        <div className={styles.ctaSection}>
          <div className={styles.ctaCard}>
            <i className="fas fa-sparkles"></i>
            <p>{t("aboutUs.conclusion")}</p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default AboutUsPage;
