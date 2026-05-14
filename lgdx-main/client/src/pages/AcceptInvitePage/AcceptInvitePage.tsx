import React, { useState, useEffect, ChangeEvent } from 'react';
import { useTranslation } from '../../i18n';
import { useSearchParams, useNavigate } from '../../routes';
import { isAxiosError } from 'axios';
import Input from '../../components/common/Input/Input';
import Button from '../../components/common/Button/Button';
import api from '../../api';
import styles from './AcceptInvitePage.module.css';

const AcceptInvitePage: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get('token') || '';
    setToken(t);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password !== confirm) {
      setError(t('auth.passwordsNotMatch'));
      return;
    }
    setLoading(true);
    try {
      await api.post('/company/invitations/accept', {
        token,
        firstName,
        lastName,
        phone,
        password,
      });
      setMessage(t('acceptInvite.success'));
      setTimeout(() => navigate('/login'), 1200);
    } catch (err: unknown) {
      setError(isAxiosError(err) ? (err.response?.data?.message || t('acceptInvite.error')) : t('acceptInvite.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.acceptInvitePage}>
      <div className={styles.acceptInviteContainer}>
        <h2>{t('acceptInvite.title')}</h2>
        {!token && <p>{t('acceptInvite.error')}</p>}
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <Input label={t('auth.firstName')} value={firstName} onChange={(e: ChangeEvent<HTMLInputElement>) => setFirstName(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <Input label={t('auth.lastName')} value={lastName} onChange={(e: ChangeEvent<HTMLInputElement>) => setLastName(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <Input label={t('auth.phone')} value={phone} onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <Input label={t('auth.password')} type="password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required />
          </div>
          <div className={styles.formGroup}>
            <Input label={t('auth.confirmPassword')} type="password" value={confirm} onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)} required />
          </div>
          {error && <div className={styles.errorMessage}>{error}</div>}
          {message && <div className={styles.successMessage}>{message}</div>}
          <Button type="submit" loading={loading} disabled={!token}>{t('acceptInvite.title')}</Button>
        </form>
      </div>
    </div>
  );
};

export default AcceptInvitePage;


