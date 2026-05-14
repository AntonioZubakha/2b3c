import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import AccountKycPanel from '../components/AccountKycPanel';

const SecurityPage: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="pt-32 pb-24 px-6 max-w-3xl mx-auto min-h-screen">
      <div className="mb-12 animate-fade-in">
        <h1 className="font-serif text-5xl md:text-6xl font-light mb-3 text-ink">
          {t('security.title')} <span className="text-gradient italic">{t('security.titleItalic')}</span>
        </h1>
        <p className="text-ink-soft max-w-xl">{t('security.subtitle')}</p>
      </div>

      <div className="space-y-8 animate-fade-in-up">
        <AccountKycPanel variant="standalone" />

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/account/vault"
            className="glass-button px-6 py-4 text-center text-xs font-medium uppercase tracking-[0.22em] no-underline flex-1"
          >
            {t('security.toVault')}
          </Link>
          <Link
            to="/account/orders"
            className="btn-primary px-6 py-4 text-center text-xs font-medium uppercase tracking-[0.22em] no-underline flex-1"
          >
            {t('security.toOrders')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SecurityPage;
