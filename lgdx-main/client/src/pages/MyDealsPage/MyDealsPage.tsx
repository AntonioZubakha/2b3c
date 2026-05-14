import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "../../i18n";
import { useAuth } from "../../context/AuthContext";
import DealRowSkeleton from "./DealRowSkeleton";
import DealRow from "./DealRow";
import Tabs, { TabItem } from "../../components/common/Tabs";
import PageHeader from "../../components/common/PageHeader/PageHeader";
import PageContainer from "../../components/common/PageContainer/PageContainer";
import PageSection from "../../components/common/PageSection/PageSection";
import styles from "./MyDealsPage.module.css";
import { Deal, Product, Company } from "../../types";
import { Navigate } from "../../routes";
import api from "../../api";

interface TabConfig {
  key: string;
  label: string;
  endpoint: string;
}

interface DealProduct {
  product: Product;
  quantity?: number;
  price: number;
}

interface StandardDeal {
  _id: string;
  dealNumber?: string;
  status?: string;
  stage?: string;
  dealType?: string;
  buyerCompanyId?: Company;
  sellerCompanyId?: Company;
  products: DealProduct[];
  amount?: number;
  createdAt?: string;
  counterpartyName?: string; // Expect this from all endpoints now
  dashboardDealType?: string; // For use in dashboard view
}

interface DashboardItem {
  customerSale: StandardDeal;
  linkedPurchases: StandardDeal[];
}

const MyDealsPage: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<StandardDeal[] | DashboardItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false); // Changed from true to false
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const { isAuthenticated, isLoading, isLgdealSupervisor } = useAuth();

  const tabConfigs: TabConfig[] = useMemo(() => {
    const allTabs: TabConfig[] = [
      {
        key: "purchases",
        label: t("deals.purchases"),
        endpoint: "/deal/buyer",
      },
      { key: "sales", label: t("deals.sales"), endpoint: "/deal/seller" },
    ];
    if (isLgdealSupervisor) {
      allTabs.unshift({
        key: "dashboard",
        label: t("deals.dashboard"),
        endpoint: "/deal/dashboard",
      });
    }
    return allTabs;
  }, [isLgdealSupervisor, t]);

  const tabs: TabItem[] = useMemo(
    () =>
      tabConfigs.map((config) => ({
        key: config.key,
        label: config.label,
        icon:
          config.key === "dashboard"
            ? "fas fa-chart-line"
            : config.key === "purchases"
              ? "fas fa-shopping-cart"
              : "fas fa-handshake",
      })),
    [tabConfigs],
  );

  // Set default active tab when user auth status is determined
  useEffect(() => {
    if (!isLoading && isAuthenticated && tabConfigs.length > 0 && !activeTab) {
      const defaultTab = isLgdealSupervisor ? "dashboard" : "purchases";
      const firstAvailableTab =
        tabConfigs.find((tab) => tab.key === defaultTab) || tabConfigs[0];
      setActiveTab(firstAvailableTab.key);
    }
  }, [isLoading, isAuthenticated, isLgdealSupervisor, tabConfigs, activeTab]);

  const fetchDeals = useCallback(async () => {
    if (!activeTab) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const config = tabConfigs.find((tab) => tab.key === activeTab);
      if (!config) {
        return;
      }

      const data = (
        await api.get(config.endpoint, {
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        })
      ).data;

      if (activeTab === "dashboard") {
        // For dashboard, keep the hierarchical structure
        const dashboardItems: DashboardItem[] = data.deals || [];
        setItems(dashboardItems);
      } else {
        // For other tabs, it's a flat list
        setItems(data.deals || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deals.error"));
    } finally {
      setLoading(false);
    }
  }, [activeTab, tabConfigs, t]);

  useEffect(() => {
    // Only fetch deals if we have an active tab and user is authenticated
    if (activeTab && !isLoading && isAuthenticated) {
      fetchDeals();
    }
  }, [activeTab, fetchDeals, isLoading, isAuthenticated]);

  const handleTabClick = useCallback(
    (tabKey: string): void => {
      // Validate that the tab is available for the current user
      const isTabAvailable = tabConfigs.some((tab) => tab.key === tabKey);
      if (!isTabAvailable) {
        return;
      }
      setActiveTab(tabKey);
    },
    [tabConfigs],
  );

  const handleToggleExpand = useCallback((rowId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  }, []);

  const getTableHeaders = useMemo(() => {
    switch (activeTab) {
      case "dashboard":
        return [
          t("deals.dealNumber"),
          t("deals.dealType"),
          t("deals.products"),
          t("deals.amount"),
          t("deals.status"),
          t("deals.counterparty"),
          t("deals.date"),
          t("common.actions") || "Actions",
        ];
      case "purchases":
        return [
          t("deals.products"),
          t("deals.amount"),
          t("deals.status"),
          t("deals.seller"),
          t("deals.date"),
          t("common.actions") || "Actions",
        ];
      case "sales":
        return [
          t("deals.products"),
          t("deals.amount"),
          t("deals.status"),
          t("deals.buyer"),
          t("deals.date"),
          t("common.actions") || "Actions",
        ];
      default:
        return [
          t("deals.products"),
          t("deals.amount"),
          t("deals.status"),
          t("deals.counterparty"),
          t("deals.date"),
          t("common.actions") || "Actions",
        ];
    }
  }, [activeTab, t]);

  // Check authentication
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>{t("company.loadingAuth")}</div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const renderTableRows = () => {
    // Show skeleton only when we're actually loading data and have an active tab
    if (loading && activeTab) {
      return Array.from({ length: 5 }).map((_, index) => (
        <DealRowSkeleton key={index} columns={getTableHeaders.length} />
      ));
    }

    if (error) {
      return (
        <tr>
          <td colSpan={getTableHeaders.length} className={styles.textCenter}>
            <div className={styles.loadingSpinner}>
              {t("common.error")}: {error}
            </div>
          </td>
        </tr>
      );
    }

    // Don't show "No deals found" until we've actually tried to load data
    if (!loading && items.length === 0 && activeTab) {
      return (
        <tr>
          <td colSpan={getTableHeaders.length} className={styles.textCenter}>
            <div className={styles.loadingSpinner}>{t("deals.noDeals")}</div>
          </td>
        </tr>
      );
    }

    if (activeTab === "dashboard") {
      const dashboardItems = items as DashboardItem[];
      return dashboardItems.flatMap((item) => {
        // Add a guard to prevent crashes from malformed items
        if (!item || !item.customerSale) {
          return []; // Return an empty array to skip this item in flatMap
        }

        const isExpanded = expandedRows.has(item.customerSale._id);
        const parentRow = (
          <DealRow
            key={item.customerSale._id}
            deal={item.customerSale as Deal}
            activeTab={activeTab}
            isParent={item.linkedPurchases && item.linkedPurchases.length > 0}
            isExpanded={isExpanded}
            onToggleExpand={() => handleToggleExpand(item.customerSale._id)}
          />
        );

        const childRows = isExpanded
          ? item.linkedPurchases.map((purchase) => (
              <DealRow
                key={purchase._id}
                deal={purchase as Deal}
                activeTab={activeTab}
                isChild={true}
              />
            ))
          : [];

        return [parentRow, ...childRows];
      });
    }

    const standardDeals = items as StandardDeal[];
    return standardDeals.map((deal) => (
      <DealRow key={deal._id} deal={deal as Deal} activeTab={activeTab} />
    ));
  };

  return (
    <PageContainer>
      <PageHeader title={t("deals.title")} subtitle={t("deals.subtitle")} />

      <PageSection>
        {tabConfigs.length > 0 &&
          activeTab &&
          isAuthenticated &&
          !isLoading && (
            <div className={styles.tabsContainer}>
              <Tabs
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={handleTabClick}
              />

              <div className={styles.tableResponsive}>
                <table className={styles.dealsTable}>
                  <thead>
                    <tr>
                      {getTableHeaders.map((header, index) => (
                        <th key={index}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>{renderTableRows()}</tbody>
                </table>
              </div>
            </div>
          )}

        {tabConfigs.length === 0 && !isLoading && (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}>
              {t("deals.noAvailableTabs")}
            </div>
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
};

export default MyDealsPage;
