import React from 'react';
import { useTranslation } from '../../../i18n';
import { Deal } from '../../../types';
import { translateShape } from '../../../utils/shapeTranslations';
import styles from './AgreedTerms.module.css';
import { DiamondShape } from '../../../i18n/types'

interface AgreedTermsProps {
  deal: Deal;
}

const AgreedTerms: React.FC<AgreedTermsProps> = ({ deal }) => {
  const { t, formatCurrency } = useTranslation();

  return (
    <div className={styles.agreedTermsContainer}>
      <div className={styles.dealTermsContainer}>
        <div className={styles.dealTermsProducts}>
          <h4>{t('dealDetail.products')}</h4>
          <div className="table-responsive">
            <table className={`table ${styles.dealsTable}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('dealDetail.product')}</th>
                  <th>{t('dealDetail.certNumber')}</th>
                  <th>{t('dealDetail.productPrice')}</th>
                  <th>{t('dealDetail.location')}</th>
                </tr>
              </thead>
              <tbody>
                {deal.products?.map((item, index) => {
                  if (!item) return null;
                  // Use productSnapshot when product was removed from catalog (closed deals)
                  const product = item.product && typeof item.product === 'object' && (item.product as { shape?: unknown }).shape !== undefined
                    ? item.product
                    : (item as { productSnapshot?: { shape?: DiamondShape; carat?: number; color?: string; clarity?: string; certificateNumber?: string; certificateInstitute?: string; location?: string } }).productSnapshot;
                  if (!product) return null;
                  const productPrice = item.price ?? 0;

                  return (
                    <tr key={(product as { _id?: string })._id || `product-${index}`}>
                      <td>{index + 1}</td>
                      <td>{`${translateShape(product.shape, t) || ''} ${product.carat || t('deals.notAvailable')}ct ${product.color || t('deals.notAvailable')} / ${product.clarity || t('deals.notAvailable')}`}</td>
                      <td>{product.certificateNumber || t('deals.notAvailable')}</td>
                      <td>{formatCurrency(productPrice)}</td>
                      <td>{product.location || t('deals.notAvailable')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={styles.dealTermsSummary}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryRowLabel}>{t('dealDetail.productsSubtotal')}</span>
              <span className={styles.summaryRowValue}>{formatCurrency(deal.products?.reduce((sum, item) => sum + (item.price ?? 0), 0) ?? 0)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryRowLabel}>{t('dealDetail.shippingCost')}</span>
              <span className={styles.summaryRowValue}>{formatCurrency(deal.shippingDetails?.cost ?? 0)}</span>
            </div>
            {deal.dealType === 'buyer-to-lgdeal' && (deal.shippingDetails?.importTariff ?? 0) > 0 && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryRowLabel}>{t('dealDetail.importTariff')}</span>
                <span className={styles.summaryRowValue}>{formatCurrency(deal.shippingDetails?.importTariff ?? 0)}</span>
              </div>
            )}
            <div className={styles.summaryTotalRow}>
              <span className={styles.summaryTotalLabel}>{t('dealDetail.totalIncludingShippingAndTariffs')}</span>
              <span className={styles.summaryTotalValue}>{formatCurrency(deal.amount)}</span>
            </div>
          </div>
        </div>
        {deal.negotiationDetails?.finalTerms && (
          <div className={styles.dealTermsAdditional}>
            <h4>{t('dealDetail.additionalTerms')}</h4>
            <p>{deal.negotiationDetails.finalTerms.additionalTerms || t('dealDetail.noAdditionalTerms')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgreedTerms; 