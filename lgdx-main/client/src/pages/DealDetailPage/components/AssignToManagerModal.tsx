import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../../i18n';
import Modal from '../../../components/common/Modal/Modal';
import Button from '../../../components/common/Button/Button';
import Select from '../../../components/common/Select/Select';
import { getLgdealManagers, LgdealUser } from '../../../api/dealApi';
import styles from './AssignToManagerModal.module.css';

interface AssignToManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (managerId: string) => void;
  currentManagerId?: string;
}

const AssignToManagerModal: React.FC<AssignToManagerModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit,
  currentManagerId 
}) => {
  const { t } = useTranslation();
  const [managers, setManagers] = useState<LgdealUser[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadManagers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const managersList = await getLgdealManagers();
      setManagers(managersList);
      setSelectedManagerId((prev) => {
        if (managersList.length === 0) return '';
        if (prev) return prev;
        return managersList[0]._id;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dealDetail.failedToLoadManagers'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (isOpen) {
      void loadManagers();
    } else {
      setSelectedManagerId('');
      setError(null);
    }
  }, [isOpen, loadManagers]);

  const handleSubmit = () => {
    if (selectedManagerId.trim()) {
      onSubmit(selectedManagerId);
    }
  };

  const managerOptions = [
    { value: '', label: t('dealDetail.selectManager') as string },
    ...managers.map(manager => ({
      value: manager._id,
      label: `${manager.firstName} ${manager.lastName} (${manager.email})` as string
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
        disabled={!selectedManagerId.trim() || isLoading}
      >
        {t('dealDetail.assignDeal')}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dealDetail.assignToManager')}
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
      ) : managers.length === 0 ? (
        <div className={styles.noManagers}>
          <i className="fas fa-info-circle"></i>
          <span>{t('dealDetail.noManagersAvailable')}</span>
        </div>
      ) : (
        <div className={styles.formGroup}>
          <Select
            id="manager"
            label={t('dealDetail.selectManager')}
            value={selectedManagerId}
            onChange={(e) => setSelectedManagerId(e.target.value)}
            options={managerOptions}
          />
          {currentManagerId && (
            <p className={styles.info}>
              <i className="fas fa-info-circle"></i>
              {t('dealDetail.currentlyAssignedTo', { 
                manager: managers.find(m => m._id === currentManagerId)?.fullName || t('dealDetail.unknownUser')
              })}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};

export default AssignToManagerModal;
