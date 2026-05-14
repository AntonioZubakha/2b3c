import React, { useState } from 'react';
import { useTranslation } from '../../../i18n';
import Modal from '../../common/Modal/Modal';
import Button from '../../common/Button/Button';
import Input from '../../common/Input/Input';
import styles from './RequestDemoModal.module.css';
import { submitDemoRequest } from '../../../api/demoRequestApi';

interface RequestDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
}

const RequestDemoModal: React.FC<RequestDemoModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await submitDemoRequest({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        company: formData.company.trim() || undefined
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setFormData({ firstName: '', lastName: '', email: '', phone: '', company: '' });
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { message?: string } } };
      setError(axiosError.response?.data?.message || t('demoRequest.errorSubmit'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null);
      setFormData({ firstName: '', lastName: '', email: '', phone: '', company: '' });
      onClose();
    }
  };

  if (success) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} title={t('demoRequest.title')} size="md">
        <div className={styles.successMessage}>
          <i className="fas fa-check-circle" aria-hidden />
          <p>{t('demoRequest.successMessage')}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('demoRequest.title')}
      size="md"
      footer={
        <div className={styles.footer}>
          <Button variant="neutral" onClick={handleClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="demo-request-form" loading={isSubmitting} disabled={isSubmitting}>
            {t('demoRequest.submit')}
          </Button>
        </div>
      }
    >
      <form id="demo-request-form" onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.description}>{t('demoRequest.description')}</p>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="demo-firstName" className={styles.label}>
              {t('auth.firstName')} *
            </label>
            <Input
              id="demo-firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
              placeholder={t('demoRequest.firstNamePlaceholder')}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="demo-lastName" className={styles.label}>
              {t('auth.lastName')} *
            </label>
            <Input
              id="demo-lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
              placeholder={t('demoRequest.lastNamePlaceholder')}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="demo-email" className={styles.label}>
            {t('auth.email')} *
          </label>
          <Input
            id="demo-email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            placeholder="you@company.com"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="demo-phone" className={styles.label}>
            {t('auth.phone')} *
          </label>
          <Input
            id="demo-phone"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
            required
            placeholder="+1 234 567 8900"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="demo-company" className={styles.label}>
            {t('auth.companyName')}
          </label>
          <Input
            id="demo-company"
            name="company"
            value={formData.company}
            onChange={handleChange}
            placeholder={t('demoRequest.companyPlaceholder')}
          />
        </div>
      </form>
    </Modal>
  );
};

export default RequestDemoModal;
