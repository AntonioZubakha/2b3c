import React from 'react';
import { useTranslation } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import { Product, User, Deal, DealProduct, ProductStatusInfo } from '../../../types';
import styles from './SupervisorProductTable.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';
import ProductStatusBadge from './ProductStatusBadge';

interface AlternativeProduct extends DealProduct {
  product: Product;
  price: number;
  shippingCost: number;
  pairedLgdealToSellerDealId?: { status: string; stage: string; };
}
export interface MainDealProduct extends DealProduct {
  product: Product;
  price: number;
  shippingCost: number;
  suggestedAlternatives?: AlternativeProduct[];
}

export interface ProductTableDeal extends Omit<Deal, 'products'> {
  products: MainDealProduct[];
  isMainProductSelected?: boolean;
  activePurchaseDealId?: {
    shippingDetails?: {
      cost?: number;
    }
  };
}

interface ProductTableProps {
  deal: ProductTableDeal;
  user: User | null;
  onSelectAlternative: (originalProductId: string, alternativeProductId: string) => void;
  onValidationUpdate?: () => void;
  allowedActions?: string[];
  getProductStatus: (productId: string) => ProductStatusInfo | null;
}

const ProductTable: React.FC<ProductTableProps> = ({
  deal,
  onSelectAlternative,
  getProductStatus,
}) => {
  const { t, formatCurrency } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const isBuyer = deal.userRole === 'buyer' || deal.userRole === 'LGDEAL buyer' || deal.userRole === 'LGDEAL dual-role';

  const renderProductRow = (
    product: Product,
    price: number,
    isMain: boolean,
    originalProductId?: string,
    itemIndex?: number,
    alternativeIndex?: number,
  ) => {
    const productStatus = getProductStatus(product._id) || {
      status: 'pending',
      displayStatus: 'Pending',
      canSelect: false,
      shippingCost: 0
    };

    const canSelect = productStatus?.canSelect ?? false;
    
    // Determine which price to display.
    // For the main product, it's the agreed-upon sale price from the deal data.
    // For alternatives, the supervisor sees the purchase cost (96%), while a buyer would see the full price.
    const priceToShow = isMain
      ? price
      : isLgdealSupervisor
      ? price * 0.96
      : price;

    let rowClass = styles.alternativeProductRow;
    if (isMain) {
      rowClass = styles.mainProductRow;
    }

    const rowClasses = [
      rowClass,
      productStatus?.status === 'pending_approval' && !isMain ? styles.pending : '',
      productStatus?.status === 'not_available' && !isMain ? styles.noDeal : '',
    ].filter(Boolean).join(' ');
    
    const handleSelectClick = () => {
      if (originalProductId && product._id) {
        onSelectAlternative(originalProductId, product._id);
      }
    };

    // For the main product row, the shipping cost shown is the final cost to the buyer.
    // For alternatives, it's the cost from that supplier to LGDEAL.
    const shippingCostToShow = isMain ? (deal.shippingDetails?.cost ?? 0) : (productStatus?.shippingCost ?? 0);

    return (
      <tr key={product._id || `product-${alternativeIndex}`} className={rowClasses}>
        <td>
          <div className={styles.productCell}>
            <div className={styles.productInfo}>
              <span className={styles.productName}>{`${product.shape} ${product.carat}ct ${product.color} ${product.clarity}`}</span>
              <span className={styles.productSku}>{isMain ? t('dealDetail.mainProduct') : t('dealDetail.alternative', { number: alternativeIndex ?? 0 })}</span>
            </div>
          </div>
        </td>
        <td>{isBuyer ? 'LGDeal INC' : (typeof product.company === 'object' && product.company?.name ? product.company.name : t('deals.notAvailable'))}</td>
        {isLgdealSupervisor && (
          <td>
            <ProductStatusBadge productStatus={productStatus} />
          </td>
        )}
        <td>{product.certificateNumber || t('deals.notAvailable')}</td>
        <td>
          <strong className={styles.priceHighlight}>{typeof priceToShow === 'number' ? formatCurrency(priceToShow) : t('deals.notAvailable')}</strong>
        </td>
        <td>{formatCurrency(shippingCostToShow)}</td>
        {isLgdealSupervisor && (
          <td className="text-center">
            {isMain ? (
              <button className={`${styles.productActionBtn} ${styles.mainProductSelected}`} disabled>
                <i className={`fas fa-check-circle ${dealIconStyles.iconMarginEnd}`}></i>
                <span>{t('dealDetail.mainProductSelected')}</span>
              </button>
            ) : (
              <button
                className={`${styles.productActionBtn} ${canSelect ? 'btn-success' : 'btn-secondary'}`}
                disabled={!canSelect}
                onClick={handleSelectClick}
              >
                {canSelect ? (
                  <><i className={`fas fa-random ${dealIconStyles.iconMarginEnd}`}></i><span>{t('dealDetail.select')}</span></>
                ) : (
                  <><i className={`fas fa-lock ${dealIconStyles.iconMarginEnd}`}></i><span>{t('dealDetail.pending')}</span></>
                )}
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="deal-section card">
      <h3><i className={`fas fa-gem ${dealIconStyles.iconMarginEnd}`}></i>{t('dealDetail.products')}</h3>
      
      <div className="table-responsive">
        <table className={styles.productTable}>
          <thead>
            <tr>
              <th className={isLgdealSupervisor ? styles.colProductSupervisor : styles.colProductMain}>{t('dealDetail.products')}</th>
              <th className={isLgdealSupervisor ? styles.colSupplierSupervisor : styles.colSupplierMain}>{t('dealDetail.supplier')}</th>
              {isLgdealSupervisor && <th className={styles.colStatus}>{t('company.status')}</th>}
              <th className={isLgdealSupervisor ? styles.colCertificateSupervisor : styles.colCertificateMain}>{t('dealDetail.certificate')}</th>
              <th className={styles.colPrice}>{t('dealDetail.price')}</th>
              <th className={styles.colShipping}>{isBuyer ? t('dealDetail.shipping') : t('dealDetail.shippingToLgd')}</th>
              {isLgdealSupervisor && <th className={styles.colAction}>{t('dealDetail.action')}</th>}
            </tr>
          </thead>
          <tbody>
            {deal.products?.map((item, itemIndex) => (
              <React.Fragment key={item.product._id}>
                {renderProductRow(
                  item.product, 
                  item.price,
                  true, 
                  undefined, 
                  itemIndex
                )}
                {isLgdealSupervisor && (deal.status === 'quality_rejected'
                  ? item.suggestedAlternatives?.filter((alt) => String((alt.product as { _id?: string })?._id ?? alt.product) !== String((item.product as { _id?: string })?._id ?? item.product))
                  : item.suggestedAlternatives
                )?.map((alt, altIndex) =>
                  renderProductRow(
                    alt.product,
                    alt.price || alt.product.price || 0,
                    false,
                    item.product._id,
                    itemIndex,
                    altIndex + 1
                  )
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductTable;
