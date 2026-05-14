import React from 'react';
import { Deal } from '../../../types';
import Modal from '../../../components/common/Modal/Modal';
import ActivityLog from './ActivityLog';
import { useTranslation } from '../../../i18n';

interface ActivityLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: Deal;
}

const ActivityLogModal: React.FC<ActivityLogModalProps> = ({ isOpen, onClose, deal }) => {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('dealDetail.activityLog')}
    >
      <ActivityLog deal={deal} />
    </Modal>
  );
};

export default ActivityLogModal; 