import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { useSearchParams, Link, useNavigate } from '../../routes';
import styles from './PasswordResetPage.module.css';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import api from '../../api';

const PasswordResetPage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'request' | 'reset'>('request');
  const [emailOrPhone, setEmailOrPhone] = useState<string>('');
  const [delivery, setDelivery] = useState<'email' | 'sms'>('email');
  const [token, setToken] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (tokenParam) {
      setToken(tokenParam);
      setMode('reset');
    }
  }, [searchParams]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emailOrPhone.trim()) {
      setMessage(t('passwordReset.emailOrPhoneRequired'));
      setIsSuccess(false);
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      await api.post('/auth/request-password-reset', { emailOrPhone: emailOrPhone.trim(), delivery });
      setMessage(t('passwordReset.successMessage'));
      setIsSuccess(true);
    } catch (error) {
      setMessage(t('passwordReset.requestFailed'));
      setIsSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword || !confirmPassword) {
      setMessage(t('passwordReset.fillAllFields'));
      setIsSuccess(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage(t('passwordReset.passwordsDoNotMatch'));
      setIsSuccess(false);
      return;
    }

    if (newPassword.length < 6) {
      setMessage(t('passwordReset.passwordTooShort'));
      setIsSuccess(false);
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      await api.post('/auth/reset-password', { token, newPassword });
      setMessage(t('passwordReset.resetSuccess'));
      setIsSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      setMessage(t('passwordReset.resetFailed'));
      setIsSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderRequestForm = () => (
    <div className={styles.formSection}>
      <h2>{t('passwordReset.title')}</h2>
      <p>{t('passwordReset.enterEmailOrPhoneDescription')}</p>
      
      <form onSubmit={handleRequestReset} className={styles.form}>
        <Input
          label={t('passwordReset.emailOrPhone')}
          id="emailOrPhone"
          name="emailOrPhone"
          type="text"
          inputMode="email"
          autoComplete="username"
          value={emailOrPhone}
          onChange={(e) => setEmailOrPhone(e.target.value)}
          required
          disabled={isSubmitting}
          placeholder={t('passwordReset.emailOrPhonePlaceholder')}
        />
        <div className={styles.deliveryOptions}>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="delivery"
              value="email"
              checked={delivery === 'email'}
              onChange={() => setDelivery('email')}
              disabled={isSubmitting}
            />
            <span>{t('passwordReset.deliveryEmail')}</span>
          </label>
          <label className={styles.radioLabel}>
            <input
              type="radio"
              name="delivery"
              value="sms"
              checked={delivery === 'sms'}
              onChange={() => setDelivery('sms')}
              disabled={isSubmitting}
            />
            <span>{t('passwordReset.deliverySms')}</span>
          </label>
        </div>
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={isSubmitting}
          size="lg"
        >
          {isSubmitting ? t('passwordReset.sending') : t('passwordReset.sendResetLink')}
        </Button>
      </form>
    </div>
  );

  const renderResetForm = () => (
    <div className={styles.formSection}>
      <h2>{t('passwordReset.setNewPassword')}</h2>
      <p>{t('passwordReset.enterNewPasswordDescription')}</p>
      
      <form onSubmit={handleResetPassword} className={styles.form}>
        <Input
          label={t('passwordReset.newPassword')}
          id="newPassword"
          name="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          disabled={isSubmitting}
          placeholder={t('passwordReset.newPasswordPlaceholder')}
        />
        
        <Input
          label={t('passwordReset.confirmNewPassword')}
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={isSubmitting}
          placeholder={t('passwordReset.confirmNewPasswordPlaceholder')}
        />
        
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={isSubmitting}
          size="lg"
        >
          {isSubmitting ? t('passwordReset.resetting') : t('passwordReset.resetPassword')}
        </Button>
      </form>
    </div>
  );

  return (
    <main className={styles['reset-page']}>
      <div className={styles['reset-container']}>
        {message && (
          <div className={`${styles.message} ${isSuccess ? styles.success : styles.error}`}>
            {message}
          </div>
        )}
        
        {mode === 'request' ? renderRequestForm() : renderResetForm()}
        
        <div className={styles['footer-links']}>
          <Link to="/login">{t('passwordReset.backToLogin')}</Link>
          {mode === 'request' && (
            <Link to="/register">{t('passwordReset.createNewAccount')}</Link>
          )}
        </div>
      </div>
    </main>
  );
};

export default PasswordResetPage; 