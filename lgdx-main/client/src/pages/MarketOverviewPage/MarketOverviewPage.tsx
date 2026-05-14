import React from "react";
import { useTranslation } from "../../i18n";
import MarketOverview from "../../components/MarketOverview/MarketOverview";
import PageHeader from "../../components/common/PageHeader/PageHeader";
import PageContainer from "../../components/common/PageContainer/PageContainer";
import PageSection from "../../components/common/PageSection/PageSection";
import SEO from "../../components/common/SEO/SEO";

const MarketOverviewPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <SEO
        title={t("marketOverview.title")}
        description={t("marketOverview.subtitle")}
        type="website"
        keywords={[
          "diamond market analysis",
          "diamond price trends",
          "market intelligence",
          "diamond analytics",
          "B2B Lab-Grown Diamond Exchange",
          "lab-grown diamonds market",
          "diamond trading insights",
        ]}
      />
      <PageContainer>
        <PageHeader
          title={t("marketOverview.title")}
          subtitle={t("marketOverview.subtitle")}
        />

        <PageSection>
          <MarketOverview />
        </PageSection>
      </PageContainer>
    </>
  );
};

export default MarketOverviewPage;
