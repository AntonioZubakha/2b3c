import React, { useState } from 'react';
import { useTranslation } from '../../../i18n';
import Modal from '../../../components/common/Modal/Modal';
import Button from '../../../components/common/Button/Button';
import Input from '../../../components/common/Input/Input';
import Select from '../../../components/common/Select/Select';
import styles from './AddTrackingModal.module.css';

interface AddTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (trackingNumber: string, carrier: string) => void;
}

const AddTrackingModal: React.FC<AddTrackingModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');

  const handleSubmit = () => {
    if (trackingNumber.trim()) {
      onSubmit(trackingNumber.trim(), carrier.trim());
    }
  };

  const footerContent = (
    <>
      <Button variant="secondary" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={!trackingNumber.trim()}
      >
        {t('dealDetail.submitTrackingInfo')}
      </Button>
    </>
  );

  const carrierOptions = [
    { value: '', label: t('dealDetail.selectCarrier') },
    { value: 'FedEx', label: 'FedEx' },
    { value: 'UPS', label: 'UPS' },
    { value: 'USPS', label: 'USPS' },
    { value: 'DHL', label: 'DHL' },
    { value: 'Other', label: t('dealDetail.carrierOther') },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dealDetail.addShipmentTracking')}
      footer={footerContent}
    >
      <div className={styles.formGroup}>
        <Input
          id="trackingNumber"
          label={t('dealDetail.trackingNumber')}
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder={t('dealDetail.trackingNumberPlaceholder')}
        />
      </div>
      <div className={styles.formGroup}>
        <Select
          id="carrier"
          label={t('dealDetail.carrier')}
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          options={carrierOptions}
        />
      </div>
    </Modal>
  );
};

export default AddTrackingModal; 