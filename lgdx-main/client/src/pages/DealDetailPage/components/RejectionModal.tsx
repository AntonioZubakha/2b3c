import stylesLocal from './RejectionModal.module.css';
import React from 'react';
import Modal from '../../../components/common/Modal/Modal';
import Button from '../../../components/common/Button/Button';
import { useTranslation } from '../../../i18n';

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  title: string;
  prompt: string;
  reason: string;
  setReason: (reason: string) => void;
}

const RejectionModal: React.FC<RejectionModalProps> = ({ isOpen, onClose, onSubmit, title, prompt, reason, setReason }) => {
  const { t } = useTranslation();

  const handleSubmit = () => {
    if (reason.trim()) {
      onSubmit(reason);
    }
  };

  const footerContent = (
    <>
      <Button variant="secondary" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button
        variant="danger"
        onClick={handleSubmit}
        disabled={!reason.trim()}
      >
        {t('common.submit')}
      </Button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={footerContent}
    >
      <p>{prompt}</p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('dealDetail.pleaseProvideReason')}
        className={`form-control ${stylesLocal.reasonTextarea}`}
      />
    </Modal>
  );
};

export default RejectionModal; 