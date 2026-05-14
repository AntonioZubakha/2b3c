import React from "react";
import { useTranslation } from "../../i18n";
import { Link } from "../../routes";
import styles from "./ForExpertsPage.module.css";
import SEO from "../../components/common/SEO/SEO";
import PageContainer from "../../components/common/PageContainer/PageContainer";
import PageHeader from "../../components/common/PageHeader/PageHeader";

const ForExpertsPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <PageContainer>
      <SEO
        title={`${t("navigation.forExperts")} – ${t("hero.preHeadline")}`}
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
        title={t("navigation.forExperts")}
        subtitle="Mastering the Art and Science of Lab-Grown Diamonds"
      />
      <div className={styles.articleRow}>
        <div className={styles.mobileHidden}>
          <img
            alt={t("forExperts.alt.cardColors")}
            className={styles.imageContainer}
            src={require("../../assets/images/articles/colors-of-lab-grown-diamonds.png")}
          />
        </div>
        <div className={styles.contentWrapper}>
          <Link
            className={styles.titleLink}
            to="/for-experts/colors-of-lab-grown-diamonds"
          >
            {t("forExperts.articles.colors.title")}
          </Link>
          <div className={styles.description}>
            {t("forExperts.articles.colors.description")}
          </div>
          <Link
            className={styles.readMoreLink}
            to="/for-experts/colors-of-lab-grown-diamonds"
          >
            {t("forExperts.readMore")}
          </Link>
        </div>
      </div>
      <div className={styles.articleRow}>
        <div className={styles.mobileHidden}>
          <img
            alt={t("forExperts.alt.cardGrading")}
            className={styles.imageContainer}
            src={require("../../assets/images/articles/color-grading.png")}
          />
        </div>
        <div className={styles.contentWrapper}>
          <Link className={styles.titleLink} to="/for-experts/color-grading">
            {t("forExperts.articles.grading.title")}
          </Link>
          <div className={styles.description}>
            {t("forExperts.articles.grading.description")}
          </div>
          <Link className={styles.readMoreLink} to="/for-experts/color-grading">
            {t("forExperts.readMore")}
          </Link>
        </div>
      </div>
      <div className={styles.articleRow}>
        <div className={styles.mobileHidden}>
          <img
            alt={t("forExperts.alt.cardDifferences")}
            className={styles.imageContainer}
            src={require("../../assets/images/articles/differences.png")}
          />
        </div>
        <div className={styles.contentWrapper}>
          <Link className={styles.titleLink} to="/for-experts/differences">
            {t("forExperts.articles.differences.title")}
          </Link>
          <div className={styles.description}>
            {t("forExperts.articles.differences.description")}
          </div>
          <Link className={styles.readMoreLink} to="/for-experts/differences">
            {t("forExperts.readMore")}
          </Link>
        </div>
      </div>
    </PageContainer>
  );
};

export default ForExpertsPage;
