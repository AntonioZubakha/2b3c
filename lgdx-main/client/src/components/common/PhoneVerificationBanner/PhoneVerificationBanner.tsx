import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../../i18n';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from '../../../routes';
import styles from './PhoneVerificationBanner.module.css';
import Button from '../Button/Button';
import api from '../../../api';
import { isAxiosError } from 'axios';

const RESEND_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const SMS_SENT_KEY_PREFIX = 'sms_sent_';

const PhoneVerificationBanner: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isResending, setIsResending] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const [timeRemaining, setTimeRemaining] = useState<number>(0); // in seconds
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize timer on mount
  useEffect(() => {
    if (!user?.phone) return;

    const storageKey = `${SMS_SENT_KEY_PREFIX}${user.phone}`;
    const lastSentTime = localStorage.getItem(storageKey);
    const now = Date.now();

    if (lastSentTime) {
      const lastSent = parseInt(lastSentTime, 10);
      const elapsed = now - lastSent;
      const remaining = RESEND_COOLDOWN_MS - elapsed;

      if (remaining > 0) {
        setTimeRemaining(Math.floor(remaining / 1000));
      } else {
        setTimeRemaining(0);
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [user?.phone]);

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

  const handleResendVerification = async () => {
    if (!user?.phone) {
      setMessage(t('phoneVerification.phoneRequired'));
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
      await api.post('/auth/resend-phone-verification', { phone: user.phone });
      
      // Update last sent time
      const storageKey = `${SMS_SENT_KEY_PREFIX}${user.phone}`;
      localStorage.setItem(storageKey, Date.now().toString());
      
      // Reset timer
      setTimeRemaining(Math.floor(RESEND_COOLDOWN_MS / 1000));
      
      setMessage(t('phoneVerification.smsResent'));
      setMessageType('success');
      
      // Очищаем сообщение через 3 секунды
      setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 3000);
      
    } catch (error: unknown) {
      const msg = isAxiosError(error) 
        ? (error.response?.data?.message || t('phoneVerification.failedToResendSms'))
        : t('phoneVerification.failedToResendSms');
      setMessage(msg);
      setMessageType('error');
      
      // If backend says we need to wait, sync timer
      if (isAxiosError(error) && error.response?.status === 400) {
        const errorText = msg.toLowerCase();
        if (errorText.includes('wait') || errorText.includes('minute')) {
          // Reset timer to 2 minutes as fallback
          const storageKey = `${SMS_SENT_KEY_PREFIX}${user.phone}`;
          localStorage.setItem(storageKey, Date.now().toString());
          setTimeRemaining(Math.floor(RESEND_COOLDOWN_MS / 1000));
        }
      }
      
      // Очищаем сообщение через 5 секунд
      setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 5000);
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

  const handleEnterCode = () => {
    navigate({
      pathname: `/verify-phone`,
      params: { phone: user?.phone || '' }
    });
  };

  // Don't show banner if user is verified or not logged in
  if (!user || user.phoneVerified) {
    return null;
  }

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <div className={styles.icon}>📱</div>
        <div className={styles.text}>
          <h4>{t('phoneVerification.pleaseVerifyPhone')}</h4>
          <p>{t('phoneVerification.phoneVerificationMessage')}</p>
        </div>
        <div className={styles.actions}>
          <Button 
            variant="primary"
            size="sm"
            onClick={handleEnterCode}
          >
            {t('phoneVerification.enterCode')}
          </Button>
          <Button 
            variant="secondary"
            size="sm"
            onClick={handleResendVerification}
            loading={isResending}
            disabled={timeRemaining > 0}
          >
            {isResending 
              ? t('phoneVerification.sending') 
              : timeRemaining > 0
              ? `${t('phoneVerification.resendSms')} (${formatTimeRemaining(timeRemaining)})`
              : t('phoneVerification.resendSms')
            }
          </Button>
        </div>
      </div>
      
      {message && (
        <div className={`${styles.message} ${styles[messageType]}`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default PhoneVerificationBanner; 