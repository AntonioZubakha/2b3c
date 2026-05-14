import React from 'react';
import { useTranslation } from '../../../i18n';
import { Product, User, Deal, DealProduct, ProductStatusInfo } from '../../../types';
import styles from './SupervisorProductTable.module.css'; // Using a new stylesheet
import dealIconStyles from '../DealDetailIconSpacing.module.css';
import ProductStatusBadge from './ProductStatusBadge';
import Button from '../../../components/common/Button/Button';

// Interfaces can be reused or adapted if needed
interface AlternativeProduct extends DealProduct {
  product: Product;
  price: number;
  shippingCost: number;
  pairedLgdealToSellerDealId?: { status: string; stage: string; };
}
interface MainDealProduct extends DealProduct {
  product: Product;
  price: number;
  shippingCost: number;
  suggestedAlternatives?: AlternativeProduct[];
}

export interface ProductTableDeal extends Omit<Deal, 'products'> {
  products: MainDealProduct[];
  isMainProductSelected?: boolean;
}

interface SupervisorProductTableProps {
  deal: ProductTableDeal;
  user: User | null;
  onSelectAlternative: (originalProductId: string, alternativeProductId: string) => void;
  getProductStatus: (productId: string) => ProductStatusInfo | null;
}

const SupervisorProductTable: React.FC<SupervisorProductTableProps> = ({
  deal,
  onSelectAlternative,
  getProductStatus,
}) => {
  const { t, formatCurrency } = useTranslation();
  const renderProductRow = (
    item: MainDealProduct | AlternativeProduct,
    isMain: boolean,
    originalProductId?: string,
    alternativeIndex?: number,
  ) => {
    const product = item.product;
    const productStatus = getProductStatus(product._id) || {
      status: 'pending',
      displayStatus: 'Pending',
      canSelect: false,
      purchaseShippingCost: 0,
      saleShippingCost: 0,
    };

    const canSelect = productStatus?.canSelect ?? false;
    
    // Prices for supervisor view.
    // Sale price for the main product is fixed in the deal; for alternatives, it's their current market price.
    const salePrice = isMain ? item.price : (product.marketPrice || 0);
    // Purchase price for main product is based on the fixed deal price. For alternatives, it's based on their current market price.
    const purchasePrice = isMain ? salePrice * 0.96 : (product.marketPrice || 0) * 0.96;
    
    // Shipping costs
    const purchaseShippingCost = productStatus.purchaseShippingCost ?? 0;
    const saleShippingCost = isMain ? productStatus.saleShippingCost ?? 0 : 0;
    
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

    return (
      <tr key={product._id} className={rowClasses}>
        <td>
          <div className="fw-bold">
            {isMain 
              ? (productStatus.displayStatus === 'Selected Alternative' ? t('dealDetail.selectedAlternative') : t('dealDetail.mainProduct'))
              : t('dealDetail.alternative', { number: alternativeIndex ?? 0 })
            }
          </div>
          <div>{`${product.shape} ${product.carat}ct ${product.color} ${product.clarity}`}</div>
        </td>
        <td>{typeof product.company === 'object' && product.company?.name ? product.company.name : t('deals.notAvailable')}</td>
        <td><ProductStatusBadge productStatus={productStatus} /></td>
        <td>{product.certificateNumber || t('deals.notAvailable')}</td>
        <td><strong>{formatCurrency(purchasePrice)}</strong></td>
        <td><strong>{formatCurrency(salePrice)}</strong></td>
        <td>{formatCurrency(purchaseShippingCost)}</td>
        <td>{isMain ? formatCurrency(saleShippingCost) : t('deals.notAvailable')}</td>
        <td className="text-center">
          {isMain ? (
            <Button variant="success" disabled fullWidth>
              <i className={`fas fa-check-circle ${dealIconStyles.iconMarginEnd}`}></i>
              <span>{t('dealDetail.mainProductSelected')}</span>
            </Button>
          ) : (
            <Button
              variant={canSelect ? 'success' : 'neutral'}
              disabled={!canSelect}
              onClick={handleSelectClick}
              fullWidth
            >
              {canSelect ? (
                <><i className={`fas fa-random ${dealIconStyles.iconMarginEnd}`}></i><span>{t('dealDetail.select')}</span></>
              ) : (
                <><i className={`fas fa-lock ${dealIconStyles.iconMarginEnd}`}></i><span>{t('dealDetail.pending')}</span></>
              )}
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="deal-section card">
      <h3><i className={`fas fa-gem ${dealIconStyles.iconMarginEnd}`}></i>{t('dealDetail.productsOverviewSupervisor')}</h3>
      <div className="table-responsive">
        <table className={styles.productTable}>
          <thead>
            <tr>
              <th className={styles.colSupProduct}>{t('dealDetail.product')}</th>
              <th className={styles.colSupSupplier}>{t('dealDetail.supplier')}</th>
              <th className={styles.colSupStatus}>{t('company.status')}</th>
              <th className={styles.colSupCert}>{t('dealDetail.certificate')}</th>
              <th className={styles.colSupPurchase}>{t('dealDetail.purchasePrice')}</th>
              <th className={styles.colSupSale}>{t('dealDetail.salePrice')}</th>
              <th className={styles.colSupShipSupp}>{t('dealDetail.shippingToLgd')}</th>
              <th className={styles.colSupShipBuyer}>{t('dealDetail.shippingLgdToBuyer')}</th>
              <th className={styles.colSupAction}>{t('dealDetail.action')}</th>
            </tr>
          </thead>
          <tbody>
            {deal.products?.map((item) => {
              const currentProductId = String((item.product as { _id?: string })?._id ?? item.product);
              const selectableAlternatives = deal.status === 'quality_rejected'
                ? item.suggestedAlternatives?.filter((alt) => String((alt.product as { _id?: string })?._id ?? alt.product) !== currentProductId)
                : item.suggestedAlternatives;
              return (
              <React.Fragment key={item.product._id}>
                {renderProductRow(item, true)}
                {selectableAlternatives?.map((alt, altIndex) =>
                  renderProductRow(
                    alt,
                    false,
                    item.product._id,
                    altIndex + 1
                  )
                )}
              </React.Fragment>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SupervisorProductTable; 