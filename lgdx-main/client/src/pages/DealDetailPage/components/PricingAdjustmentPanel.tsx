import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import { Deal } from '../../../types';
import type { DealJsonActionName } from '../../../api/dealApi';
import Button from '../../../components/common/Button/Button';
import Input from '../../../components/common/Input/Input';
import Modal from '../../../components/common/Modal/Modal';
import styles from './RequestStageView.module.css';

interface PricingAdjustmentPanelProps {
  deal: Deal;
  handleDealAction: (action: DealJsonActionName, payload?: Record<string, unknown>) => void;
  /**
   * When true, the panel renders intro copy tailored to the post-invoice-recall
   * scenario (logistics changed → adjust before re-issuing the invoice).
   * Default: false (request-stage copy).
   */
  preInvoiceContext?: boolean;
}

interface NotificationState {
  isOpen: boolean;
  title: string;
  message: string;
}

/**
 * Reusable inline editors for shipping cost and (for buyer-to-lgdeal) import tariff.
 * Used both at the 'request' stage and at 'payment_delivery / awaiting_invoice' so the
 * seller can correct logistics costs before (re-)issuing the invoice.
 */
const PricingAdjustmentPanel: React.FC<PricingAdjustmentPanelProps> = ({
  deal,
  handleDealAction,
  preInvoiceContext = false,
}) => {
  const { t, formatCurrency } = useTranslation();
  const { isLgdealSupervisor } = useAuth();
  const [shippingCost, setShippingCost] = useState('');
  const [importTariff, setImportTariff] = useState('');
  const [notification, setNotification] = useState<NotificationState>({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    if (deal.shippingDetails?.cost !== undefined && shippingCost === '') {
      setShippingCost(deal.shippingDetails.cost.toString());
    }
  }, [deal.shippingDetails?.cost, shippingCost]);

  useEffect(() => {
    if (deal.shippingDetails?.importTariff !== undefined && importTariff === '') {
      setImportTariff(deal.shippingDetails.importTariff.toString());
    }
  }, [deal.shippingDetails?.importTariff, importTariff]);

  const canSetShippingCost = deal.allowedActions?.includes('set_shipping_cost');
  const canSetImportTariff = deal.dealType === 'buyer-to-lgdeal' && deal.allowedActions?.includes('set_import_tariff');

  if (!canSetShippingCost && !canSetImportTariff) return null;

  const handleSetShippingCost = () => {
    if (shippingCost && parseFloat(shippingCost) >= 0) {
      handleDealAction('set_shipping_cost', { shippingCost: parseFloat(shippingCost) });
    } else {
      setNotification({ isOpen: true, title: t('dealDetail.invalidInput'), message: t('dealDetail.invalidShippingCost') });
    }
  };

  const handleSetImportTariff = () => {
    if (importTariff !== '' && parseFloat(importTariff) >= 0) {
      handleDealAction('set_import_tariff', { importTariff: parseFloat(importTariff) });
    } else {
      setNotification({ isOpen: true, title: t('dealDetail.invalidInput'), message: t('dealDetail.invalidImportTariff') });
    }
  };

  return (
    <>
      {canSetShippingCost && (
        <div className={`deal-section card ${styles.shippingCostSection}`}>
          <h3>{t('dealDetail.setShippingCost')}</h3>
          <p>
            {preInvoiceContext
              ? t('dealDetail.adjustShippingCostBeforeInvoice')
              : isLgdealSupervisor
                ? t('dealDetail.setShippingCostDescriptionSupervisor')
                : t('dealDetail.setShippingCostDescription')}
          </p>
          {deal.shippingDetails?.cost !== undefined && (
            <p><strong>{t('dealDetail.currentShippingCost')}</strong> {formatCurrency(deal.shippingDetails.cost)}</p>
          )}
          <div className={styles.inputGroup}>
            <span className={styles.inputGroupText}>$</span>
            <Input
              type="number"
              className={styles.inputWithPrefix}
              value={shippingCost}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShippingCost(e.target.value)}
              placeholder="e.g., 50.00"
              inputSize="md"
            />
          </div>
          <div className={styles.actionsContainer}>
            <Button
              onClick={handleSetShippingCost}
              variant="primary"
              disabled={shippingCost === '' || parseFloat(shippingCost) < 0}
            >
              {deal.shippingDetails?.cost !== undefined ? t('dealDetail.updateShippingCost') : t('dealDetail.setShippingCostButton')}
            </Button>
          </div>
        </div>
      )}

      {canSetImportTariff && (
        <div className={`deal-section card ${styles.shippingCostSection}`}>
          <h3>{t('dealDetail.setImportTariff')}</h3>
          <p>
            {preInvoiceContext
              ? t('dealDetail.adjustImportTariffBeforeInvoice')
              : t('dealDetail.setImportTariffDescription')}
          </p>
          {deal.shippingDetails?.importTariff !== undefined && (
            <p><strong>{t('dealDetail.currentImportTariff')}</strong> {formatCurrency(deal.shippingDetails.importTariff)}</p>
          )}
          <div className={styles.inputGroup}>
            <span className={styles.inputGroupText}>$</span>
            <Input
              type="number"
              className={styles.inputWithPrefix}
              value={importTariff}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setImportTariff(e.target.value)}
              placeholder="e.g., 25.00"
              inputSize="md"
            />
          </div>
          <div className={styles.actionsContainer}>
            <Button
              onClick={handleSetImportTariff}
              variant="primary"
              disabled={importTariff === '' || parseFloat(importTariff) < 0}
            >
              {deal.shippingDetails?.importTariff !== undefined ? t('dealDetail.updateImportTariff') : t('dealDetail.setImportTariffButton')}
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
      >
        <p>{notification.message}</p>
      </Modal>
    </>
  );
};

export default PricingAdjustmentPanel;
