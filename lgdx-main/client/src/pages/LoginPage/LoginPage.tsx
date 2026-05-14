import React, { useState, FormEvent, ChangeEvent } from 'react';
import { useTranslation } from '../../i18n';
import { useLocation, Path, Link, useNavigate } from '../../routes';
import { useAuth } from '../../context/AuthContext';
import styles from './LoginPage.module.css';

interface LocationState {
  from?: {
    pathname: string;
  };
}

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state: LocationState };
  const from = location.state?.from?.pathname as Path || '/';

  const { isLoading } = auth;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError(t('auth.bothRequired'));
      return;
    }
    setError(null);
    const success = await auth.login(login.trim(), password);
    if (success) {
      navigate(from, { replace: true });
    } else {
      setError(auth.error);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'login') setLogin(value);
    if (name === 'password') setPassword(value);
    if (error) setError(null);
  };

  return (
    <div className={styles['login-page']}>
      <div className={styles['login-container']}>
        <h2>{t('auth.login')}</h2>
        {auth.error && <p className={styles['error-message']}>{auth.error}</p>}
        {error && !auth.error && <p className={styles['error-message']}>{error}</p>}
        <form onSubmit={handleSubmit} className={styles['login-form']} noValidate>
          <div className={styles['form-group']}>
            <label htmlFor="login">{t('auth.emailOrPhone')}</label>
            <input
              type="text"
              id="login"
              name="login"
              autoComplete="username"
              value={login}
              onChange={handleChange}
              required
              placeholder={t('auth.emailOrPhonePlaceholder')}
              className={styles['form-input']}
            />
          </div>
          <div className={styles['form-group']}>
            <label htmlFor="password">{t('auth.password')}</label>
            <div className={styles['password-input-wrap']}>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={password}
                onChange={handleChange}
                required
                placeholder={t('auth.passwordPlaceholder')}
                className={styles['form-input']}
              />
              <button
                type="button"
                className={styles['password-toggle']}
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                title={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              >
                <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'} aria-hidden />
              </button>
            </div>
          </div>
          <button
            type="submit"
            className={styles['login-button']}
            disabled={isLoading}
          >
            {isLoading ? t('auth.loggingIn') : t('auth.login')}
          </button>
        </form>
        <div className={styles['register-link']}>
          <p>{t('auth.noAccount')} <Link to="/register">{t('auth.registerHere')}</Link></p>
          <p className={styles['forgot-password']}>
            <Link to="/reset-password">{t('auth.forgotPassword')}</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 