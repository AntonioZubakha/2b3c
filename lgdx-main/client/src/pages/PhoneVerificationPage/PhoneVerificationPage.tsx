import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n';
import { useSearchParams, useNavigate } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import styles from './PhoneVerificationPage.module.css';
import Button from '../../components/common/Button/Button';
import api from '../../api';
import { isAxiosError } from 'axios';

const RESEND_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const SMS_SENT_KEY_PREFIX = 'sms_sent_';

const PhoneVerificationPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const [timeRemaining, setTimeRemaining] = useState<number>(0); // in seconds
  const [showSmsSentMessage, setShowSmsSentMessage] = useState<boolean>(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const navigate = useNavigate();
  const auth = useAuth();
  
  // Получаем номер телефона из параметров
  const phone = searchParams.get('phone') || '';

  // Initialize timer and SMS sent message on mount
  useEffect(() => {
    if (!phone) return;

    const storageKey = `${SMS_SENT_KEY_PREFIX}${phone}`;
    const lastSentTime = localStorage.getItem(storageKey);
    const now = Date.now();

    if (!lastSentTime) {
      // First time on this page - SMS was sent during registration
      // Set timer to 2 minutes from now
      localStorage.setItem(storageKey, now.toString());
      setTimeRemaining(Math.floor(RESEND_COOLDOWN_MS / 1000));
      setShowSmsSentMessage(true);
    } else {
      const lastSent = parseInt(lastSentTime, 10);
      const elapsed = now - lastSent;
      const remaining = RESEND_COOLDOWN_MS - elapsed;

      if (remaining > 0) {
        // Still in cooldown period
        setTimeRemaining(Math.floor(remaining / 1000));
        setShowSmsSentMessage(true);
      } else {
        // Cooldown expired
        setTimeRemaining(0);
        setShowSmsSentMessage(false);
      }
    }

    // Cleanup timer on unmount
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [phone]);

  // Timer countdown effect
  useEffect(() => {
    if (timeRemaining <= 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setShowSmsSentMessage(false);
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [timeRemaining]);

  // Простая верификация кода
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!verificationCode || verificationCode.length !== 4) {
      setMessage(t('phoneVerification.invalidCode'));
      setMessageType('error');
      return;
    }

    if (!phone) {
      setMessage(t('phoneVerification.error'));
      setMessageType('error');
      return;
    }

    setIsVerifying(true);
    setMessage('');
    setMessageType('');

    try {
      // Простой API вызов
      await api.post('/auth/verify-phone', {
        phone, 
        code: verificationCode 
      });
      
      // Успех!
      setMessage(t('phoneVerification.success'));
      setMessageType('success');
      
      // Обновляем пользователя
      await auth.loadUser();
      
      // Перенаправляем через 2 секунды
      setTimeout(() => navigate('/'), 2000);
      
    } catch (error: unknown) {
      // Ошибка
      const errorMsg = isAxiosError(error) ? (error.response?.data?.message || t('phoneVerification.error')) : t('phoneVerification.error');
      setMessage(errorMsg);
      setMessageType('error');
    } finally {
      setIsVerifying(false);
    }
  };

  // Отправка нового кода
  const handleResendCode = async () => {
    if (!phone) {
      setMessage(t('phoneVerification.error'));
      setMessageType('error');
      return;
    }

    if (timeRemaining > 0) {
      return; // Prevent resend during cooldown
    }

    setIsResending(true);
    setMessage('');
    setMessageType('');

    try {
      await api.post('/auth/resend-phone-verification', { phone });
      
      // Update last sent time
      const storageKey = `${SMS_SENT_KEY_PREFIX}${phone}`;
      localStorage.setItem(storageKey, Date.now().toString());
      
      // Reset timer
      setTimeRemaining(Math.floor(RESEND_COOLDOWN_MS / 1000));
      setShowSmsSentMessage(true);
      
      setMessage(t('phoneVerification.smsResent'));
      setMessageType('success');
    } catch (error: unknown) {
      const errorMsg = isAxiosError(error) ? (error.response?.data?.message || t('phoneVerification.error')) : t('phoneVerification.error');
      setMessage(errorMsg);
      setMessageType('error');
      
      // If backend says we need to wait, try to sync timer from backend response
      // Backend might return cooldown info in the error message
      if (isAxiosError(error) && error.response?.status === 400) {
        // Check if error mentions waiting time - if so, reset timer to be safe
        const errorText = errorMsg.toLowerCase();
        if (errorText.includes('wait') || errorText.includes('minute')) {
          // Reset timer to 2 minutes as fallback
          const storageKey = `${SMS_SENT_KEY_PREFIX}${phone}`;
          localStorage.setItem(storageKey, Date.now().toString());
          setTimeRemaining(Math.floor(RESEND_COOLDOWN_MS / 1000));
        }
      }
    } finally {
      setIsResending(false);
    }
  };

  // Format time remaining as MM:SS
  const formatTimeRemaining = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Очистка сообщения при изменении кода
  useEffect(() => {
    if (message) {
      setMessage('');
      setMessageType('');
    }
  }, [verificationCode, message]);

  return (
    <main className={styles['verification-page']}>
      <div className={styles['verification-container']}>
        <div className={styles.content}>
          <h2>{t('phoneVerification.title')}</h2>
          
          {phone && (
            <p className={styles.phoneDisplay}>
              {t('phoneVerification.code')} {t('common.sent') || 'sent to'}: <strong>{phone}</strong>
            </p>
          )}
          
          {showSmsSentMessage && (
            <div className={`${styles.message} ${styles.success}`}>
              <i className="fas fa-check-circle"></i>
              {t('phoneVerification.smsAlreadySent')}
            </div>
          )}
          
          <p>{t('phoneVerification.codePlaceholder')}</p>
          
          <form className={styles.verificationForm} onSubmit={handleVerifyCode}>
            <input
              type="text"
              placeholder="0000"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={styles.codeInput}
              maxLength={4}
              pattern="[0-9]{4}"
              required
              autoFocus
            />
            
            <Button
              type="submit"
              variant="primary"
              loading={isVerifying}
              size="lg"
              fullWidth
            >
              {isVerifying ? t('phoneVerification.verifying') : t('phoneVerification.verify')}
            </Button>
          </form>
          
          <div className={styles.resendSection}>
            <p className={styles.resendText}>
              {timeRemaining > 0 
                ? t('phoneVerification.resendAvailableIn', { time: formatTimeRemaining(timeRemaining) })
                : t('phoneVerification.didNotReceiveCode')
              }
            </p>
            <Button
              variant="secondary"
              onClick={handleResendCode}
              loading={isResending}
              disabled={timeRemaining > 0}
              size="md"
            >
              {isResending 
                ? t('phoneVerification.resending') 
                : timeRemaining > 0
                ? t('phoneVerification.resendCode') + ` (${formatTimeRemaining(timeRemaining)})`
                : t('phoneVerification.resendCode')
              }
            </Button>
          </div>
          
          {message && (
            <div className={`${styles.message} ${styles[messageType]}`}>
              {message}
            </div>
          )}
        </div>
        
        <div className={styles['footer-links']}>
          <Button 
            variant="secondary" 
            onClick={() => navigate('/login')}
          >
            {t('phoneVerification.error') ? t('passwordReset.backToLogin') : 'Back to Login'}
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

export default PhoneVerificationPage; 