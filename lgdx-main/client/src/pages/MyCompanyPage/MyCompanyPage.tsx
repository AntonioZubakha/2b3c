import React, { useState } from "react";
import { useTranslation } from "../../i18n";
import { useAuth } from "../../context/AuthContext";
import CompanySettingsPanel from "../../components/MyCompany/CompanySettingsPanel";
import TeamPanel from "../../components/MyCompany/TeamPanel";
import InventoryPanel from "../../components/MyCompany/InventoryPanel";
import AccountPanel from "../../components/MyCompany/AccountPanel";
import Tabs, { TabItem } from "../../components/common/Tabs";
import PageHeader from "../../components/common/PageHeader/PageHeader";
import PageContainer from "../../components/common/PageContainer/PageContainer";
import PageSection from "../../components/common/PageSection/PageSection";
import styles from "./MyCompanyPage.module.css";
import { AuthContextType, Company } from "../../types";
import { Navigate } from "../../routes";

// Placeholder components for tabs - we will create these properly later

// Define the possible tab types for type safety
type TabType = "settings" | "team" | "inventory" | "account";

const MyCompanyPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("settings");
  const { user, isAuthenticated, isLoading } = useAuth() as AuthContextType;

  // Check authentication
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>{t("company.loadingAuth")}</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const tabs: TabItem[] = [
    {
      key: "settings",
      label: t("company.settings"),
      icon: "fas fa-cog",
    },
    {
      key: "team",
      label: t("company.team"),
      icon: "fas fa-users",
    },
    {
      key: "inventory",
      label: t("company.inventory"),
      icon: "fas fa-boxes",
    },
    {
      key: "account",
      label: t("company.account"),
      icon: "fas fa-user",
    },
  ];

  const renderTabContent = (): React.ReactNode => {
    switch (activeTab) {
      case "settings":
        return <CompanySettingsPanel />;
      case "team":
        return <TeamPanel />;
      case "inventory":
        return <InventoryPanel />;
      case "account":
        return <AccountPanel />;
      default:
        return <CompanySettingsPanel />;
    }
  };

  if (!user) {
    return (
      <div className={styles.loadingContainer}>
        <p>{t("company.loading")}</p>
      </div>
    );
  }

  const companyName =
    typeof user.company === "string"
      ? t("company.yourCompany")
      : (user.company as Company)?.name || t("company.myCompany");

  const roleLabel = user.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : t("header.user");

  return (
    <PageContainer>
      <PageHeader
        title={companyName}
        subtitle={`${t("company.welcome")}, ${user.firstName} ${user.lastName} • ${t("company.role")}: ${roleLabel}`}
      />

      <PageSection>
        <div className={styles.myCompanyContainer}>
          <Tabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tabKey) => setActiveTab(tabKey as TabType)}
            className={styles.tabs}
          />

          <div className={styles.tabView}>{renderTabContent()}</div>
        </div>
      </PageSection>
    </PageContainer>
  );
};

export default MyCompanyPage;
