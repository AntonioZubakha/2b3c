import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../../i18n';
import Modal from '../../../components/common/Modal/Modal';
import Button from '../../../components/common/Button/Button';
import Select from '../../../components/common/Select/Select';
import { getLgdealLogists, LgdealUser } from '../../../api/dealApi';
import styles from './AssignToLogistModal.module.css';

interface AssignToLogistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (logistId: string) => void;
}

const AssignToLogistModal: React.FC<AssignToLogistModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit
}) => {
  const { t } = useTranslation();
  const [logists, setLogists] = useState<LgdealUser[]>([]);
  const [selectedLogistId, setSelectedLogistId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogists = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const logistsList = await getLgdealLogists();
      setLogists(logistsList);
      setSelectedLogistId((prev) => {
        if (logistsList.length === 0) return '';
        if (prev) return prev;
        return logistsList[0]._id;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dealDetail.failedToLoadLogists'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      void loadLogists();
    } else {
      setSelectedLogistId('');
      setError(null);
    }
  }, [isOpen, loadLogists]);

  const handleSubmit = () => {
    if (selectedLogistId.trim()) {
      onSubmit(selectedLogistId);
    }
  };

  const logistOptions = [
    { value: '', label: t('dealDetail.selectLogist') as string },
    ...logists.map(logist => ({
      value: logist._id,
      label: `${logist.firstName} ${logist.lastName} (${logist.email})` as string
    }))
  ];

  const footerContent = (
    <>
      <Button variant="secondary" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="primary"
        onClick={handleSubmit}
        disabled={!selectedLogistId.trim() || isLoading}
      >
        {t('dealDetail.assignDeal')}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dealDetail.assignToLogist')}
      footer={footerContent}
    >
      {isLoading ? (
        <div className={styles.loading}>
          <i className="fas fa-spinner fa-spin"></i>
          <span>{t('common.loading')}</span>
        </div>
      ) : error ? (
        <div className={styles.error}>
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      ) : logists.length === 0 ? (
        <div className={styles.noLogists}>
          <i className="fas fa-info-circle"></i>
          <span>{t('dealDetail.noLogistsAvailable')}</span>
        </div>
      ) : (
        <div className={styles.formGroup}>
          <Select
            id="logist"
            label={t('dealDetail.selectLogist')}
            value={selectedLogistId}
            onChange={(e) => setSelectedLogistId(e.target.value)}
            options={logistOptions}
          />
        </div>
      )}
    </Modal>
  );
};

export default AssignToLogistModal;
