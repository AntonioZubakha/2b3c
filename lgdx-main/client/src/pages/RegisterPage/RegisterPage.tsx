import React, { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { RegisterUserData } from '../../types';
import styles from './RegisterPage.module.css';
import Input from '../../components/common/Input/Input';
import Button from '../../components/common/Button/Button';
import Modal from '../../components/common/Modal/Modal';
import { Link, useNavigate } from '../../routes';
import { areRegistrationsEnabled } from '../../api/systemSettingsApi';

interface RegisterFormData extends RegisterUserData {
  confirmPassword: string;
}

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<RegisterFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    companyRole: undefined
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [pageError, setPageError] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [registrationsEnabled, setRegistrationsEnabled] = useState<boolean>(true);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);

  const auth = useAuth();
  const navigate = useNavigate();

  // Проверка статуса регистраций при загрузке страницы
  useEffect(() => {
    const checkRegistrationStatus = async () => {
      try {
        const enabled = await areRegistrationsEnabled();
        setRegistrationsEnabled(enabled);
      } catch (error) {
        // В случае ошибки разрешаем регистрации по умолчанию
        setRegistrationsEnabled(true);
      } finally {
        setCheckingStatus(false);
      }
    };

    checkRegistrationStatus();
  }, []);

  const { firstName, lastName, email, phone, password, confirmPassword, companyName, companyRole } = formData;
  const activeError = auth.error || pageError;
  const isDuplicateEmailError = Boolean(
    activeError && /email.*already exists|user with this email already exists/i.test(activeError)
  );
  const isDuplicatePhoneError = Boolean(
    activeError &&
      /user with this phone (number )?already exists|user with this phone already exists|phone.*already (exists|taken)|phone is already taken/i.test(
        activeError
      )
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement> | ChangeEvent<HTMLSelectElement>): void => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    // Проверяем, включены ли регистрации
    if (!registrationsEnabled) {
      setPageError(t('auth.registrationDisabled'));
      return;
    }

    if (!firstName || !lastName || !email || !phone || !password || !companyName || !companyRole) {
      setPageError(t('auth.fillAllFields'));
      return;
    }
    if (password !== confirmPassword) {
      setPageError(t('auth.passwordsNotMatch'));
      return;
    }
    
    // Enhanced password validation to match server requirements
    const passwordErrors: string[] = [];
    if (password.length < 8) {
      passwordErrors.push(t('auth.passwordAtLeast8'));
    }
    if (!/(?=.*[a-z])/.test(password)) {
      passwordErrors.push(t('auth.passwordLowercase'));
    }
    if (!/(?=.*[A-Z])/.test(password)) {
      passwordErrors.push(t('auth.passwordUppercase'));
    }
    if (!/(?=.*\d)/.test(password)) {
      passwordErrors.push(t('auth.passwordNumber'));
    }
    
    if (passwordErrors.length > 0) {
      setPageError(`${t('auth.passwordRequirements').split(':')[0]}: ${passwordErrors.join(', ')}.`);
      return;
    }
    
    // Phone validation (E.164 international format - accepts with or without +)
    // Normalize phone: add + if missing
    let normalizedPhone = phone.trim();
    if (normalizedPhone && !normalizedPhone.startsWith('+') && /^[1-9]/.test(normalizedPhone)) {
      normalizedPhone = '+' + normalizedPhone;
    }
    
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      setPageError(t('auth.invalidPhone'));
      return;
    }
    
    // Update phone with normalized value
    const phoneToSend = normalizedPhone;

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setPageError(t('auth.invalidEmail'));
      return;
    }

    setIsSubmitting(true);
    setPageError('');
    auth.setAuthError('');

    const registrationData: RegisterUserData = {
      firstName,
      lastName,
      email,
      phone: phoneToSend,
      password,
      companyName,
      companyRole
    };

    const result = await auth.register(registrationData);

    if (result.success) {
      // Check if user needs email verification
      if (result.user && !result.user.emailVerified) {
        // Show email verification message
        setPageError('');
        setShowSuccessModal(true);
      } else {
        // LGDEAL users or already verified users go directly to dashboard
      navigate('/');
      }
    }
    setIsSubmitting(false);
  };

  // Показываем загрузку пока проверяем статус
  if (checkingStatus) {
    return (
      <main className={styles['register-page']}>
        <div className={styles['register-container']}>
          <div className={styles['loading-container']}>
            <div className={styles['spinner']}></div>
            <p>{t('auth.checkingStatus')}</p>
          </div>
        </div>
      </main>
    );
  }

  // Показываем сообщение если регистрации отключены
  if (!registrationsEnabled) {
    return (
      <main className={styles['register-page']}>
        <div className={styles['register-container']}>
          <div className={styles['disabled-container']}>
            <h2>{t('auth.registrationDisabledTitle')}</h2>
            <p>{t('auth.registrationDisabledMessage')}</p>
            <p>{t('auth.registrationDisabledContact')}</p>
            <Link to="/login" className={styles['login-link']}>
              {t('auth.backToLogin')}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles['register-page']}>
      <div className={styles['register-container']}>
        <h2>{t('auth.createAccount')}</h2>
        <form onSubmit={handleSubmit} className={styles['register-form']}>
          {activeError && (
            <>
              <p className={styles['error-message']}>{activeError}</p>
              {isDuplicateEmailError && (
                <div className={styles['error-hint']}>
                  <p>{t('auth.emailAlreadyExistsHint')}</p>
                  <Link to="/reset-password" className={styles['error-hint-link']}>
                    {t('auth.resetPasswordForExistingAccount')}
                  </Link>
                </div>
              )}
              {isDuplicatePhoneError && !isDuplicateEmailError && (
                <div className={styles['error-hint']}>
                  <p>{t('auth.phoneAlreadyExistsHint')}</p>
                  <div className={styles['error-hint-actions']}>
                    <Link to="/login" className={styles['error-hint-link']}>
                      {t('auth.tryLoginWithExistingPhone')}
                    </Link>
                    <span className={styles['error-hint-sep']} aria-hidden="true">
                      ·
                    </span>
                    <Link to="/reset-password" className={styles['error-hint-link']}>
                      {t('auth.recoverAccessPasswordReset')}
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
          <div className={styles['form-row']}>
            <Input
              label={t('auth.firstName')}
              id="firstName"
              name="firstName"
              value={firstName}
              onChange={handleChange}
              required
              disabled={isSubmitting}
            />
            <Input
              label={t('auth.lastName')}
              id="lastName"
              name="lastName"
              value={lastName}
              onChange={handleChange}
              required
              disabled={isSubmitting}
            />
          </div>
          <Input
            label={t('auth.email')}
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={handleChange}
            required
            disabled={isSubmitting}
          />
          <Input
            label={t('auth.phone')}
            id="phone"
            name="phone"
            type="tel"
            value={phone}
            onChange={handleChange}
            required
            disabled={isSubmitting}
            placeholder={t('auth.phonePlaceholder')}
          />
          <Input
            label={t('auth.companyName')}
            id="companyName"
            name="companyName"
            value={companyName}
            onChange={handleChange}
            required
            disabled={isSubmitting}
          />
          <div className={styles['form-group']}>
            <label htmlFor="companyRole" className={styles['form-label']}>
              {t('auth.companyRole')} *
            </label>
            <select
              id="companyRole"
              name="companyRole"
              value={formData.companyRole || ''}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              className={styles['form-select']}
            >
              <option value="">{t('auth.selectCompanyRole')}</option>
              <option value="seller">{t('auth.seller')}</option>
              <option value="buyer">{t('auth.buyer')}</option>
            </select>
            <small className={styles['role-help']}>
              {t('auth.roleHelp')}
            </small>
          </div>
          <div className={styles['form-row']}>
            <Input
              label={t('auth.password')}
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              placeholder={t('auth.passwordRequirementsShort')}
              showPasswordToggle
            />
            <Input
              label={t('auth.confirmPassword')}
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={handleChange}
              required
              disabled={isSubmitting}
              showPasswordToggle
            />
          </div>
          <div className={styles['password-requirements']}>
            <small>{t('auth.passwordRequirements')}</small>
          </div>
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={isSubmitting}
            size="lg"
          >
            {isSubmitting ? t('auth.registering') : t('auth.createAccountButton')}
          </Button>
        </form>
        <p className={styles['login-link-footer']}>
          {t('auth.hasAccount')} <Link to="/login">{t('auth.loginHere')}</Link>
        </p>
      </div>

      <Modal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          navigate('/catalog');
        }}
        title={t('auth.registrationSuccessful')}
        footer={
          <Button 
            variant="primary"
            onClick={() => {
              setShowSuccessModal(false);
              navigate('/catalog');
            }}
          >
            {t('auth.continueToCatalog')}
          </Button>
        }
      >
        <p>{t('auth.registrationSuccessMessage')}</p>
        <p>{t('auth.registrationSuccessNote')}</p>
      </Modal>
    </main>
  );
};

export default RegisterPage; 