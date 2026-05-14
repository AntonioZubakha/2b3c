import React from 'react';
import { useTranslation } from '../../i18n';
import { translateShape } from '../../utils/shapeTranslations';
import { Link } from '../../routes';
import { Deal } from '../../types';
import styles from './MyDealsPage.module.css';
import { DiamondShape } from '../../i18n/types'

interface ProductDetail {
  shape?: DiamondShape;
  carat?: number;
  color?: string;
  clarity?: string;
}

// Deal product item may have product (populated) or productSnapshot when product was removed from catalog
function getProductDisplayDetail(item: unknown): ProductDetail | null {
  if (typeof item !== 'object' || item === null) return null;
  const row = item as { product?: unknown; productSnapshot?: ProductDetail };
  if (row.product && typeof row.product === 'object' && row.product !== null) {
    const p = row.product as ProductDetail;
    if (p.shape != null || p.carat != null || p.color != null || p.clarity != null) return p;
  }
  if (row.productSnapshot && typeof row.productSnapshot === 'object') return row.productSnapshot as ProductDetail;
  return null;
}

interface DealRowProps {
  deal: Deal;
  activeTab: string;
  isParent?: boolean;
  isExpanded?: boolean;
  isChild?: boolean;
  onToggleExpand?: () => void;
}

const DealRow: React.FC<DealRowProps> = ({ 
  deal, 
  activeTab, 
  isParent, 
  isExpanded,
  isChild,
  onToggleExpand 
}) => {
  const { t, formatCurrency } = useTranslation();
  
  if (!deal) {
    return null;
  }

  // Helper function to get company name safely
  const getCompanyName = (company: unknown): string => {
    if (typeof company === 'object' && company !== null && 'name' in company && typeof company.name === 'string') {
      return company.name;
    }
    return t('deals.notAvailable');
  };

  const getStatusBadgeClass = (status: string | undefined): string => {
    if (!status) {
      return 'status-pending';
    }
    switch (status) {
      case 'pending':
      case 'awaiting_invoice':
      case 'invoice_pending':
      case 'awaiting_payment':
      case 'alternative_product_proposed':
        return 'status-pending';
      case 'approved':
      case 'terms_accepted':
      case 'shipped':
      case 'completed':
        return 'status-approved';
      case 'rejected':
      case 'cancelled':
      case 'failed':
        return 'status-cancelled';
      default:
        return 'status-pending';
    }
  };

  // Helper function to render the status badge safely
  const renderStatusBadge = (status: string | undefined) => {
    return (
      <span className={`${styles.statusBadge} ${styles[getStatusBadgeClass(status)]}`}>
        {(status || 'pending').replace(/_/g, ' ')}
      </span>
    );
  };

  // Format products display with deal number for purchases/sales tabs.
  // Uses productSnapshot when product was removed from catalog (closed deals).
  const formatProducts = (products?: unknown[], includeDealNumber = false): string => {
    if (!products || products.length === 0) return t('deals.noProducts');
    
    let productText = '';
    if (products.length === 1) {
      const detail = getProductDisplayDetail(products[0]);
      if (detail) {
        productText = `${translateShape(detail.shape, t) || t('catalog.diamond')} ${detail.carat ?? 0}ct ${detail.color || ''} ${detail.clarity || ''}`.trim();
      }
    } else {
      const detail = getProductDisplayDetail(products[0]);
      if (detail) {
        const remainingCount = products.length - 1;
        productText = `${translateShape(detail.shape, t) || t('catalog.diamond')} ${detail.carat ?? 0}ct +${remainingCount} ${t('common.more')}`;
      }
    }
    
    // Add deal number if requested (for purchases/sales tabs)
    if (includeDealNumber && deal.dealNumber) {
      return `#${deal.dealNumber} | ${productText}`;
    }
    
    return productText;
  };

  // Determine counterparty name based on deal type and active tab
  const getCounterpartyDisplay = (): string => {
    if (activeTab === 'dashboard') {
      // Try different approaches to get counterparty
      if (deal.counterpartyName) {
        return deal.counterpartyName;
      }
      
      if (deal.dashboardDealType === 'mainCustomerSale' || deal.dealType === 'buyer-to-lgdeal') {
        return getCompanyName(deal.buyerCompanyId);
      } else if (deal.dashboardDealType?.includes('Supplier') || 
                 deal.dashboardDealType?.includes('Purchase') || 
                 deal.dealType === 'lgdeal-to-seller') {
        return getCompanyName(deal.sellerCompanyId);
      }

      // Fallback: try any available company info
      const buyerName = getCompanyName(deal.buyerCompanyId);
      const sellerName = getCompanyName(deal.sellerCompanyId);
      return buyerName !== t('deals.notAvailable') 
        ? buyerName 
        : sellerName;
    } else if (activeTab === 'purchases' && deal.sellerCompanyId) {
      // For purchases, show seller company
      return getCompanyName(deal.sellerCompanyId);
    } else if (activeTab === 'sales' && deal.buyerCompanyId) {
      // For sales, show buyer company
      return getCompanyName(deal.buyerCompanyId);
    }
    return t('deals.notAvailable');
  };

  // Get deal type display for dashboard
  const getDealTypeDisplay = (): string => {
    if (activeTab === 'dashboard' && deal.dashboardDealType) {
      switch (deal.dashboardDealType) {
        case 'mainCustomerSale':
          return t('deals.customerSale');
        case 'primarySupplierPurchase':
          return t('deals.supplierPurchaseMain');
        case 'alternativeSupplierPurchase':
          return t('deals.supplierPurchaseAlt');
        case 'standaloneSupplierPurchase':
          return t('deals.supplierPurchaseStandalone');
        default:
          return deal.dealType || t('deals.notAvailable');
      }
    }
    return deal.dealType || t('deals.notAvailable');
  };

  // Format date helper function
  const formatDate = (dateStr: string | Date | undefined): string => {
    if (!dateStr) return t('deals.notAvailable');
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return t('deals.notAvailable');
      return date.toLocaleDateString();
    } catch {
      return t('deals.notAvailable');
    }
  };

  const renderCellsForTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <>
            <td>
              <span className={styles.dealNumber}>#{deal.dealNumber || t('deals.notAvailable')}</span>
            </td>
            <td>
              {isParent && (
                <button onClick={onToggleExpand} className={styles.expandButton}>
                  {isExpanded ? '−' : '+'}
                </button>
              )}
              {getDealTypeDisplay()}
            </td>
            <td>{formatProducts(deal.products)}</td>
            <td>{deal.amount != null ? formatCurrency(deal.amount) : '0'}</td>
            <td>{renderStatusBadge(deal.status)}</td>
            <td>{getCounterpartyDisplay()}</td>
            <td>{formatDate(deal.createdAt)}</td>
          </>
        );
      case 'purchases':
        return (
          <>
            <td>{formatProducts(deal.products, true)}</td>
            <td>{deal.amount != null ? formatCurrency(deal.amount) : '0'}</td>
            <td>{renderStatusBadge(deal.status)}</td>
            <td>{getCounterpartyDisplay()}</td>
            <td>{formatDate(deal.createdAt)}</td>
          </>
        );
      case 'sales':
        return (
          <>
            <td>{formatProducts(deal.products, true)}</td>
            <td>{deal.amount != null ? formatCurrency(deal.amount) : '0'}</td>
            <td>{renderStatusBadge(deal.status)}</td>
            <td>{getCounterpartyDisplay()}</td>
            <td>{formatDate(deal.createdAt)}</td>
          </>
        );
      default:
        return (
          <>
            <td>{formatProducts(deal.products)}</td>
            <td>{deal.amount != null ? formatCurrency(deal.amount) : '0'}</td>
            <td>{renderStatusBadge(deal.status)}</td>
            <td>{formatDate(deal.createdAt)}</td>
          </>
        );
    }
  };

  return (
    <tr className={isChild ? styles.childRow : ''}>
      {renderCellsForTab()}
      <td>
        <Link to={`/deal/${deal._id}`} className={styles.viewButton}>
          {t('deals.view')}
        </Link>
      </td>
    </tr>
  );
};

export default DealRow; 