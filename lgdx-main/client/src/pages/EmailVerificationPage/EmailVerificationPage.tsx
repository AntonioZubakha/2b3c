import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { useSearchParams, useNavigate } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import styles from './EmailVerificationPage.module.css';
import Button from '../../components/common/Button/Button';
import api from '../../api';

const EmailVerificationPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  
  const navigate = useNavigate();
  const auth = useAuth();

  const tRef = useRef(t);
  const navigateRef = useRef(navigate);
  const authRef = useRef(auth);
  const verifyInFlightRef = useRef(false);

  tRef.current = t;
  navigateRef.current = navigate;
  authRef.current = auth;
  
  // Получаем email из параметров
  const email = searchParams.get('email') || '';
  const tokenFromUrl = searchParams.get('token') ?? '';

  const verifyEmail = useCallback(async (token: string) => {
    if (verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;

    setIsVerifying(true);
    setMessage('');
    setMessageType('');

    const tr = tRef.current;

    try {
      await api.post('/auth/verify-email', { token });
      setMessage(tr('emailVerification.successMessage'));
      setMessageType('success');

      await authRef.current.loadUser();

      setTimeout(() => navigateRef.current('/'), 2000);
    } catch {
      setMessage(tr('emailVerification.errorMessage'));
      setMessageType('error');
      try {
        await authRef.current.loadUser();
        if (authRef.current.user?.emailVerified) {
          setMessage(tr('emailVerification.successMessage'));
          setMessageType('success');
          setTimeout(() => navigateRef.current('/'), 2000);
          return;
        }
      } catch {
        setMessage(tr('emailVerification.errorMessage'));
        setMessageType('error');
      }
    } finally {
      setIsVerifying(false);
      verifyInFlightRef.current = false;
    }
  }, []);

  // Отправка нового кода верификации
  const handleResendVerification = async () => {
    if (!email) {
      setMessage(t('emailVerification.errorMessage'));
      setMessageType('error');
      return;
    }

    setIsResending(true);
    setMessage('');
    setMessageType('');

    try {
      await api.post('/auth/resend-verification', { email });
      setMessage(t('emailVerification.resentMessage'));
      setMessageType('success');
    } catch (error) {
      setMessage(t('emailVerification.errorMessage'));
      setMessageType('error');
    } finally {
      setIsResending(false);
    }
  };

  useEffect(() => {
    if (!tokenFromUrl) return;
    void verifyEmail(tokenFromUrl);
  }, [tokenFromUrl, verifyEmail]);

  useEffect(() => {
    if (tokenFromUrl) return;
    setMessage(t('emailVerification.errorMessage'));
    setMessageType('error');
  }, [tokenFromUrl, t]);

  return (
    <main className={styles['verification-page']}>
      <div className={styles['verification-container']}>
        <div className={styles.content}>
          <h2>{t('emailVerification.title')}</h2>
          
          {email && (
            <p className={styles.emailDisplay}>
              {t('emailVerification.verifying')}: <strong>{email}</strong>
            </p>
          )}
          
          {isVerifying && (
            <div className={styles.loadingSection}>
              <div className={styles.loadingSpinner}></div>
              <p>{t('emailVerification.verifying')}</p>
            </div>
          )}
          
          {message && (
            <div className={`${styles.message} ${styles[messageType]}`}>
              {message}
            </div>
          )}
          
          {!isVerifying && messageType === 'error' && (
            <div className={styles.resendSection}>
              <p className={styles.resendText}>{t('emailVerification.resentMessage')}</p>
              <Button
                variant="primary"
                onClick={handleResendVerification}
                loading={isResending}
                size="lg"
              >
                {isResending ? t('emailVerification.resending') : t('emailVerification.resendEmail')}
              </Button>
            </div>
          )}
        </div>
        
        <div className={styles['footer-links']}>
          <Button 
            variant="secondary" 
            onClick={() => navigate('/login')}
          >
            {t('emailVerification.backToHome')}
          </Button>
          <Button 
            variant="secondary" 
            onClick={() => navigate('/register')}
          >
            {t('passwordReset.createNewAccount')}
          </Button>
        </div>
      </div>
    </main>
  );
};

export default EmailVerificationPage; 