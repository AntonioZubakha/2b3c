import React from 'react';
import { useTranslation } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import { User, ProductStatusInfo, Deal, ShippingAddress } from '../../../types';
import type { DealJsonActionName } from '../../../api/dealApi';
import ProductTable, { ProductTableDeal } from './ProductTable';
import SupervisorProductTable from './SupervisorProductTable';
import RequestStatusPanel from './RequestStatusPanel';
import AlternativeProductProposal from './AlternativeProductProposal';
import PricingAdjustmentPanel from './PricingAdjustmentPanel';
import styles from './RequestStageView.module.css';
import dealIconStyles from '../DealDetailIconSpacing.module.css';

interface RequestStageViewProps {
  deal: Deal;
  user: User | null;
  handleDealAction: (action: DealJsonActionName, payload?: Record<string, unknown>) => void;
  handleSelectAlternative: (originalProductId: string, alternativeProductId: string) => void;
  getProductStatus: (productId: string) => ProductStatusInfo | null;
}

/** Formats shipping destination for display (supplier → LGDEAL, or LGDEAL → buyer). */
function formatDestinationAddressLines(addr: ShippingAddress | undefined): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  if (addr.recipientName?.trim()) lines.push(addr.recipientName.trim());
  const street = [addr.addressLine1, addr.addressLine2].filter(Boolean).join(', ');
  if (street) lines.push(street);
  const cityLine = [addr.city, addr.stateProvinceRegion, addr.postalCode].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  if (addr.country?.trim()) lines.push(addr.country.trim());
  if (addr.phone?.trim()) lines.push(addr.phone.trim());
  return lines;
}

const RequestStageView: React.FC<RequestStageViewProps> = ({ deal, user, handleDealAction, handleSelectAlternative, getProductStatus }) => {
  const { t, formatCurrency } = useTranslation();
  const { isLgdealSupervisor } = useAuth();

  const destinationLines = formatDestinationAddressLines(deal.shippingDetails?.shippingAddress);
  const showDestinationAddress = destinationLines.length > 0;
  
  return (
    <div className={styles.requestViewContainer}>
      <RequestStatusPanel deal={deal} />

      {showDestinationAddress && (
        <div className={`deal-section card ${styles.shippingCostSection}`}>
          <h3>
            <i className={`fas fa-map-marker-alt ${dealIconStyles.iconMarginEnd}`} aria-hidden />
            {t('dealDetail.destinationAddressTitle')}
          </h3>
          <p>{t('dealDetail.destinationAddressHint')}</p>
          <div className={styles.destinationAddressBlock}>
            {destinationLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {deal.status === 'alternative_product_proposed' && deal.userRole === 'buyer' && (
        <AlternativeProductProposal
          deal={deal}
          onAccept={() => handleDealAction('accept_alternative_product')}
          onReject={(reason) => handleDealAction('reject_alternative_product', { rejectionReason: reason })}
        />
      )}

      {isLgdealSupervisor 
        ? <SupervisorProductTable deal={deal as ProductTableDeal} user={user} onSelectAlternative={handleSelectAlternative} getProductStatus={getProductStatus} />
        : <ProductTable deal={deal as ProductTableDeal} user={user} onSelectAlternative={handleSelectAlternative} allowedActions={deal.allowedActions} getProductStatus={getProductStatus} />
      }

      {/* Shipping cost / import tariff editors (shared with payment_delivery/awaiting_invoice). */}
      <PricingAdjustmentPanel deal={deal} handleDealAction={handleDealAction} />

      {!isLgdealSupervisor && (
        <div className="deal-section card">
          <div className={styles.summaryContainer}>
            <div className={styles.summaryDetails}>
              <h3><i className={`fas fa-file-invoice-dollar ${dealIconStyles.iconMarginEnd}`}></i>{t('dealDetail.summary')}</h3>
              <ul>
                <li>{t('dealDetail.productsSubtotal')} <strong>{formatCurrency(deal.products?.reduce((sum, item) => (sum + (item.price ?? 0)), 0) || 0)}</strong></li>
                <li>{t('dealDetail.shippingCost')} <strong>{formatCurrency(typeof deal.shippingDetails?.cost === 'number' ? deal.shippingDetails.cost : 0)}</strong></li>
                {deal.dealType === 'buyer-to-lgdeal' && (deal.shippingDetails?.importTariff ?? 0) > 0 && (
                  <li>{t('dealDetail.importTariff')} <strong>{formatCurrency(deal.shippingDetails?.importTariff ?? 0)}</strong></li>
                )}
              </ul>
            </div>
            <div className={styles.summaryTotal}>
              <h4>{t('dealDetail.total')} <span>{formatCurrency(typeof deal.amount === 'number' ? deal.amount : 0)}</span></h4>
            </div>
          </div>
        </div>
      )}
      
      <div className={styles.actionsContainer}>
        {/* This container is now empty as actions are moved to DealActionsPanel */}
      </div>
    </div>
  );
};

export default RequestStageView; 