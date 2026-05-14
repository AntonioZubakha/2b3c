import React, { useState } from 'react';
import { useTranslation } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import styles from './EmailVerificationBanner.module.css';
import Modal from '../Modal/Modal';
import Button from '../Button/Button';
import api from '../../../api';

const EmailVerificationBanner: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isResending, setIsResending] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [modalType, setModalType] = useState<'success' | 'error'>('success');

  // Don't show banner if user is verified
  if (!user || user.emailVerified) {
    return null;
  }

  const handleResendVerification = async () => {
    if (!user.email) {
      setModalMessage(t('emailVerification.emailRequired'));
      setModalType('error');
      setShowModal(true);
      return;
    }

    setIsResending(true);
    try {
      await api.post('/auth/resend-verification', { email: user.email });
      setModalMessage(t('emailVerification.emailSentSuccess'));
      setModalType('success');
      setShowModal(true);
    } catch (error) {
      setModalMessage(t('emailVerification.failedToResendEmail'));
      setModalType('error');
      setShowModal(true);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <>
      <div className={styles.banner}>
        <div className={styles.content}>
          <div className={styles.icon}>📧</div>
          <div className={styles.text}>
            <h4>{t('emailVerification.pleaseVerifyEmail')}</h4>
            <p>{t('emailVerification.emailVerificationMessage')}</p>
          </div>
          <button 
            className={styles.resendButton}
            onClick={handleResendVerification}
            disabled={isResending}
          >
            {isResending ? t('emailVerification.sending') : t('emailVerification.resendEmail')}
          </button>
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={modalType === 'success' ? t('common.success') : t('common.error')}
        footer={
          <Button 
            variant={modalType === 'success' ? 'primary' : 'secondary'}
            onClick={() => setShowModal(false)}
          >
            {t('common.close')}
          </Button>
        }
      >
        <p>{modalMessage}</p>
      </Modal>
    </>
  );
};

export default EmailVerificationBanner; 