import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../../../i18n';
import Modal from '../../../components/common/Modal/Modal';
import Button from '../../../components/common/Button/Button';
import Select from '../../../components/common/Select/Select';
import Input from '../../../components/common/Input/Input';
import { getLgdealManagers, LgdealUser } from '../../../api/dealApi';
import styles from './ReassignManagerModal.module.css';

interface ReassignManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newManagerId: string, reason: string) => void;
  currentManagerId: string;
  currentManagerName?: string;
}

const ReassignManagerModal: React.FC<ReassignManagerModalProps> = ({ 
  isOpen, 
  onClose, 
  onSubmit,
  currentManagerId,
  currentManagerName
}) => {
  const { t } = useTranslation();
  const [managers, setManagers] = useState<LgdealUser[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadManagers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const managersList = await getLgdealManagers();
      const availableManagers = managersList.filter(m => m._id !== currentManagerId);
      setManagers(availableManagers);
      setSelectedManagerId((prev) => {
        if (availableManagers.length === 0) return '';
        if (prev) return prev;
        return availableManagers[0]._id;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dealDetail.failedToLoadManagers'));
    } finally {
      setIsLoading(false);
    }
  }, [t, currentManagerId]);

  useEffect(() => {
    if (isOpen) {
      void loadManagers();
    } else {
      setSelectedManagerId('');
      setReason('');
      setError(null);
    }
  }, [isOpen, loadManagers]);

  const handleSubmit = () => {
    if (selectedManagerId.trim() && reason.trim()) {
      onSubmit(selectedManagerId, reason);
    }
  };

  const managerOptions = [
    { value: '', label: t('dealDetail.selectNewManager') as string },
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
        disabled={!selectedManagerId.trim() || !reason.trim() || isLoading}
      >
        {t('dealDetail.reassignDeal')}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dealDetail.reassignManager')}
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
          <span>{t('dealDetail.noOtherManagersAvailable')}</span>
        </div>
      ) : (
        <>
          {currentManagerName && (
            <div className={styles.currentManager}>
              <i className="fas fa-user"></i>
              <span>
                {t('dealDetail.currentlyAssignedTo', { manager: currentManagerName })}
              </span>
            </div>
          )}
          <div className={styles.formGroup}>
            <Select
              id="newManager"
              label={t('dealDetail.selectNewManager')}
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              options={managerOptions}
            />
          </div>
          <div className={styles.formGroup}>
            <Input
              id="reason"
              label={t('dealDetail.reassignmentReason')}
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('dealDetail.reassignmentReasonPlaceholder')}
              required
            />
            <p className={styles.helperText}>
              {t('dealDetail.reassignmentReasonHelper')}
            </p>
          </div>
        </>
      )}
    </Modal>
  );
};

export default ReassignManagerModal;
