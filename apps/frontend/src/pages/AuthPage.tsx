import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from '../components/icons';
import BrandMark from '../components/BrandMark';
import { GATEWAY } from '../lib/api';

import { SUPPLIER_CATEGORY_LABELS, type SupplierCategory, type UserRole, isStoneeStaffRole } from '@stonee/shared-types';

const inputClass =
  'glass-input w-full px-4 py-3.5 text-sm focus:ring-2 focus:ring-[color:var(--rose-gold)]/30';

export default function AuthPage() {
  const { t } = useTranslation();
  const roles = useMemo(
    () =>
      [
        { value: 'buyer' as const, label: t('auth.roleBuyer') },
        { value: 'supplier' as const, label: t('auth.roleSupplier') },
        { value: 'stonee_admin' as const, label: t('auth.roleAdmin') },
        { value: 'stonee_supervisor' as const, label: t('auth.roleSupervisor') },
        { value: 'stonee_manager' as const, label: t('auth.roleManager') },
      ] satisfies { value: UserRole; label: string }[],
    [t],
  );
  const supplierCategories = useMemo(
    () => (Object.keys(SUPPLIER_CATEGORY_LABELS) as SupplierCategory[]).map(c => [c, t(`auth.supplierCat_${c}`)] as const),
    [t],
  );
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    companyName: '',
    role: 'buyer' as UserRole,
    supplierCategory: 'general' as SupplierCategory,
    staffInviteCode: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const path = mode === 'login' ? '/auth/login' : '/auth/register';
      const registerPayload: Record<string, unknown> = {
        email: form.email,
        password: form.password,
        name: form.name,
        role: form.role,
      };
      if (form.role === 'supplier') {
        registerPayload.supplierCategory = form.supplierCategory;
        registerPayload.companyName = form.companyName.trim();
      }
      if (['stonee_admin', 'stonee_supervisor', 'stonee_manager'].includes(form.role)) {
        registerPayload.staffInviteCode = form.staffInviteCode;
      }
      const res = await fetch(`${GATEWAY.user}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email: form.email, password: form.password } : registerPayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('common.somethingWrong'));
      setSuccess(mode === 'login' ? t('auth.signedInSuccess') : t('auth.accountCreatedSuccess'));

      if (mode === 'login') {
        localStorage.setItem('token', data.token);
        const role = data.user?.role ?? data.role ?? 'buyer';
        localStorage.setItem('userRole', role);
        if (data.user?.supplierCategory) {
          localStorage.setItem('supplierCategory', data.user.supplierCategory);
        } else {
          localStorage.removeItem('supplierCategory');
        }
        const companies = data.user?.supplierCompanies as { id: string }[] | undefined;
        if (Array.isArray(companies) && companies.length > 0) {
          localStorage.setItem('supplierCompanyId', companies[0].id);
          localStorage.setItem('supplierCompanies', JSON.stringify(companies));
        } else {
          localStorage.removeItem('supplierCompanyId');
          localStorage.removeItem('supplierCompanies');
        }
        window.dispatchEvent(new Event('storage'));
        const rawRedirect = searchParams.get('redirect');
        const redirectTo =
          rawRedirect != null && rawRedirect.trim() !== ''
            ? rawRedirect.trim()
            : role === 'supplier'
              ? '/supplier/portal'
              : isStoneeStaffRole(role)
                ? '/merchant'
                : '/craft';
        setTimeout(() => navigate(redirectTo), 1200);
      } else {
        setTimeout(() => setMode('login'), 1500);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('common.somethingWrong'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-28 pb-20 px-4">
      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center justify-center">
        <div className="w-full animate-fade-in-up">
          <div className="mb-8 text-center">
            <div className="mb-5 flex justify-center">
              <BrandMark size={96} />
            </div>
            <h1 className="mb-3 font-serif text-5xl md:text-6xl font-light text-ink tracking-tight">
              {mode === 'login' ? (
                <>
                  {t('auth.welcomeBack')} <span className="text-gradient italic">{t('auth.welcomeBackItalic')}</span>
                </>
              ) : (
                <>
                  {t('auth.join')} <span className="text-gradient italic">{t('auth.joinItalic')}</span>
                </>
              )}
            </h1>
            <p className="text-sm text-ink-soft">
              {mode === 'login' ? t('auth.subtitleLogin') : t('auth.subtitleRegister')}
            </p>
          </div>

          <div className="glass-card p-8 md:p-10 rounded-[2rem]">
            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'register' && (
                <>
                  <div>
                    <label
                      htmlFor="auth-name"
                      className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
                    >
                      {t('auth.name')}
                    </label>
                    <input
                      id="auth-name"
                      name="name"
                      type="text"
                      placeholder={t('auth.namePlaceholder')}
                      value={form.name}
                      onChange={handleChange}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="auth-role"
                      className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
                    >
                      {t('auth.role')}
                    </label>
                    <select
                      id="auth-role"
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      className={`${inputClass} cursor-pointer`}
                    >
                      {roles.map(r => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {form.role === 'supplier' && (
                    <>
                      <div>
                        <label
                          htmlFor="auth-company-name"
                          className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
                        >
                          {t('auth.companyName')}
                        </label>
                        <input
                          id="auth-company-name"
                          name="companyName"
                          type="text"
                          placeholder={t('auth.companyNamePlaceholder')}
                          value={form.companyName}
                          onChange={handleChange}
                          className={inputClass}
                          required
                          minLength={2}
                          autoComplete="organization"
                        />
                        <p className="mt-2 text-[10px] text-ink-soft leading-relaxed">{t('auth.companyNameHint')}</p>
                      </div>
                      <div>
                        <label
                          htmlFor="auth-supplier-cat"
                          className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
                        >
                          {t('auth.supplierFocus')}
                        </label>
                        <select
                          id="auth-supplier-cat"
                          name="supplierCategory"
                          value={form.supplierCategory}
                          onChange={handleChange}
                          className={`${inputClass} cursor-pointer`}
                        >
                          {supplierCategories.map(([value, lab]) => (
                            <option key={value} value={value}>
                              {lab}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  {['stonee_admin', 'stonee_supervisor', 'stonee_manager'].includes(form.role) && (
                    <div>
                      <label
                        htmlFor="auth-staff-invite"
                        className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
                      >
                        {t('auth.staffInvite')}
                      </label>
                      <input
                        id="auth-staff-invite"
                        name="staffInviteCode"
                        type="password"
                        autoComplete="off"
                        placeholder={t('auth.staffInvitePlaceholder')}
                        value={form.staffInviteCode}
                        onChange={handleChange}
                        className={inputClass}
                        required
                      />
                      <p className="mt-2 text-[10px] text-ink-soft leading-relaxed">{t('auth.staffInviteHint')}</p>
                    </div>
                  )}
                </>
              )}
              <div>
                <label
                  htmlFor="auth-email"
                  className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
                >
                  {t('auth.email')}
                </label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  placeholder={t('auth.emailPlaceholder')}
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="auth-password"
                  className="mb-2 block text-[10px] font-medium uppercase tracking-[0.22em] text-ash"
                >
                  {t('auth.password')}
                </label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={form.password}
                  onChange={handleChange}
                  className={inputClass}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-4 text-sm font-medium uppercase tracking-[0.22em] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} />
                    {t('common.loading')}
                  </>
                ) : mode === 'login' ? (
                  t('auth.signIn')
                ) : (
                  t('auth.createAccount')
                )}
              </button>
            </form>

            <div className="petal-divider mt-8" />
            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button
                type="button"
                className="text-xs uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-rose-gold-deep disabled:pointer-events-none disabled:opacity-40"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setSuccess('');
                }}
                disabled={mode === 'login'}
              >
                {t('auth.alreadyHaveAccount')}
              </button>
              <button
                type="button"
                className="text-xs uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-rose-gold-deep disabled:pointer-events-none disabled:opacity-40"
                onClick={() => {
                  setMode('register');
                  setError('');
                  setSuccess('');
                }}
                disabled={mode === 'register'}
              >
                {t('auth.needAccount')}
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
                {error}
              </div>
            )}
            {success && (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700">
                {success}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
