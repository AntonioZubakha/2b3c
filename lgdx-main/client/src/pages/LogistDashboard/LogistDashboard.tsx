import React, { useState, useEffect } from "react";
import { useNavigate } from "../../routes";
import { useTranslation } from "../../i18n";
import { useAuth } from "../../context/AuthContext";
import { Deal } from "../../types";
import api from "../../api";
import { logger } from "../../utils/logger";
import styles from "./LogistDashboard.module.css";
import PageHeader from "../../components/common/PageHeader/PageHeader";

/**
 * LogistDashboard - Dashboard for LGDEAL Logists
 * Shows deals assigned to logist for shipping management
 */
const LogistDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "ready" | "shipping" | "delivered"
  >("all");

  useEffect(() => {
    fetchDeals();
  }, []);

  const fetchDeals = async () => {
    setIsLoading(true);
    try {
      // Get seller deals (logist gets deals via seller endpoint with assignedTo filter)
      const response = await api.get<{ deals: Deal[] }>("/deal/seller");
      setDeals(response.data.deals);
    } catch (error) {
      logger.error(
        "Failed to fetch deals",
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredDeals = (): Deal[] => {
    switch (filter) {
      case "ready":
        return deals.filter((d) => d.status === "ready_for_shipping");
      case "shipping":
        return deals.filter((d) => d.status === "shipped");
      case "delivered":
        return deals.filter(
          (d) => d.status === "delivery_confirmed" || d.status === "completed",
        );
      default:
        return deals;
    }
  };

  const filteredDeals = getFilteredDeals();

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case "ready_for_shipping":
        return styles.statusReady;
      case "shipped":
        return styles.statusShipping;
      case "delivery_confirmed":
      case "completed":
        return styles.statusDelivered;
      default:
        return styles.statusDefault;
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case "ready_for_shipping":
        return t("logistDashboard.statusReady");
      case "shipped":
        return t("logistDashboard.statusShipping");
      case "delivery_confirmed":
      case "completed":
        return t("logistDashboard.statusDelivered");
      default:
        return status;
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString();
  };

  const formatAddress = (deal: Deal): string => {
    const addr = deal.shippingDetails?.shippingAddress;
    if (!addr) return "-";

    const parts = [
      addr.addressLine1,
      addr.addressLine2,
      addr.city,
      addr.stateProvinceRegion,
      addr.postalCode,
      addr.country,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(", ") : "-";
  };

  const getRecipientName = (deal: Deal): string => {
    // First try to get recipient name from shipping address
    const recipientName = deal.shippingDetails?.shippingAddress?.recipientName;
    if (recipientName) return recipientName;

    // Fallback to buyer's name
    if (typeof deal.buyerId === "object" && deal.buyerId !== null) {
      const fullName =
        `${deal.buyerId.firstName || ""} ${deal.buyerId.lastName || ""}`.trim();
      if (fullName) return fullName;
    }

    return "N/A";
  };

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>{t("logistDashboard.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title={t("logistDashboard.title")}
        subtitle={t("logistDashboard.welcome", {
          name: user?.firstName || "User",
        })}
      />

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div
            className={`${styles.statIcon} ${styles.statIconBlue}`}
          >
            <i className="fas fa-box"></i>
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>
              {deals.filter((d) => d.status === "ready_for_shipping").length}
            </div>
            <div className={styles.statLabel}>
              {t("logistDashboard.readyForShipping")}
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div
            className={`${styles.statIcon} ${styles.statIconAmber}`}
          >
            <i className="fas fa-truck"></i>
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>
              {deals.filter((d) => d.status === "shipped").length}
            </div>
            <div className={styles.statLabel}>
              {t("logistDashboard.inTransit")}
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div
            className={`${styles.statIcon} ${styles.statIconGreen}`}
          >
            <i className="fas fa-check-circle"></i>
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>
              {
                deals.filter(
                  (d) =>
                    d.status === "delivery_confirmed" ||
                    d.status === "completed",
                ).length
              }
            </div>
            <div className={styles.statLabel}>
              {t("logistDashboard.delivered")}
            </div>
          </div>
        </div>

        <div className={styles.statCard}>
          <div
            className={`${styles.statIcon} ${styles.statIconNeutral}`}
          >
            <i className="fas fa-list"></i>
          </div>
          <div className={styles.statContent}>
            <div className={styles.statValue}>{deals.length}</div>
            <div className={styles.statLabel}>
              {t("logistDashboard.totalDeals")}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <button
          className={`${styles.filterButton} ${filter === "all" ? styles.active : ""}`}
          onClick={() => setFilter("all")}
        >
          {t("logistDashboard.filterAll")} ({deals.length})
        </button>
        <button
          className={`${styles.filterButton} ${filter === "ready" ? styles.active : ""}`}
          onClick={() => setFilter("ready")}
        >
          {t("logistDashboard.filterReady")} (
          {deals.filter((d) => d.status === "ready_for_shipping").length})
        </button>
        <button
          className={`${styles.filterButton} ${filter === "shipping" ? styles.active : ""}`}
          onClick={() => setFilter("shipping")}
        >
          {t("logistDashboard.filterShipping")} (
          {deals.filter((d) => d.status === "shipped").length})
        </button>
        <button
          className={`${styles.filterButton} ${filter === "delivered" ? styles.active : ""}`}
          onClick={() => setFilter("delivered")}
        >
          {t("logistDashboard.filterDelivered")} (
          {
            deals.filter(
              (d) =>
                d.status === "delivery_confirmed" || d.status === "completed",
            ).length
          }
          )
        </button>
      </div>

      {/* Deals Table */}
      <div className={styles.tableContainer}>
        {filteredDeals.length === 0 ? (
          <div className={styles.empty}>
            <i className="fas fa-inbox"></i>
            <p>{t("logistDashboard.noDeals")}</p>
          </div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("logistDashboard.dealNumber")}</th>
                <th>{t("logistDashboard.status")}</th>
                <th>{t("logistDashboard.buyer")}</th>
                <th>{t("logistDashboard.destination")}</th>
                <th>{t("logistDashboard.trackingNumber")}</th>
                <th>{t("logistDashboard.assignedDate")}</th>
                <th>{t("logistDashboard.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => (
                <tr
                  key={deal._id}
                  onClick={() => navigate(`/deal/${deal._id}`)}
                  className={styles.tableRow}
                >
                  <td>
                    <strong>{deal.dealNumber}</strong>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${getStatusBadgeClass(deal.status)}`}
                    >
                      {getStatusLabel(deal.status)}
                    </span>
                  </td>
                  <td>{getRecipientName(deal)}</td>
                  <td>{formatAddress(deal)}</td>
                  <td>
                    {deal.shippingDetails?.trackingNumber ? (
                      <code className={styles.trackingCode}>
                        {deal.shippingDetails.trackingNumber}
                      </code>
                    ) : (
                      <span className={styles.noTracking}>-</span>
                    )}
                  </td>
                  <td>{formatDate(deal.assignedAt)}</td>
                  <td>
                    <button
                      className={styles.viewButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/deal/${deal._id}`);
                      }}
                    >
                      <i className="fas fa-eye"></i>
                      {t("logistDashboard.view")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default LogistDashboard;
