import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { GATEWAY, apiFetch } from '../lib/api';

type CompanyForm = {
  name: string;
  contactEmail: string;
  phone: string;
  description: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  country: string;
  postalCode: string;
  role?: string;
};

export default function SupplierCompanyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = localStorage.getItem('userRole');
  const token = localStorage.getItem('token');
  const companyId = localStorage.getItem('supplierCompanyId') || '';
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token || role !== 'supplier' || !companyId) {
      navigate('/auth?redirect=/supplier/company');
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`${GATEWAY.user}/auth/companies/${encodeURIComponent(companyId)}`);
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.success) {
          setMsg(typeof j?.error === 'string' ? j.error : t('supplier.companyLoadFail'));
          return;
        }
        const d = j.data as CompanyForm;
        setForm(d);
      } catch {
        setMsg(t('supplier.companyLoadFail'));
      }
    })();
  }, [companyId, navigate, role, t, token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!form) return;
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const save = async () => {
    if (!form || !companyId) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await apiFetch(`${GATEWAY.user}/auth/companies/${encodeURIComponent(companyId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          contactEmail: form.contactEmail,
          phone: form.phone,
          description: form.description,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          country: form.country,
          postalCode: form.postalCode,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(typeof j?.error === 'string' ? j.error : `HTTP ${res.status}`);
        return;
      }
      if (j.success && j.data) setForm({ ...(j.data as CompanyForm), role: form.role });
      setMsg(t('supplier.companySaved'));
    } catch {
      setMsg(t('supplier.companySaveFail'));
    } finally {
      setSaving(false);
    }
  };

  if (!token || role !== 'supplier') {
    return <div className="pt-40 text-center text-ink-soft">{t('supplier.loading')}</div>;
  }

  const inputClass =
    'glass-input w-full px-4 py-3 text-sm focus:ring-2 focus:ring-[color:var(--rose-gold)]/30';

  return (
    <div className="pt-28 pb-24 px-6 max-w-2xl mx-auto min-h-screen">
      <div className="glass-card p-10 space-y-6 animate-fade-in-up">
        <Link to="/supplier/portal" className="text-xs uppercase tracking-[0.18em] text-rose-gold-deep hover:underline">
          ← {t('supplier.backToPortal')}
        </Link>
        <div>
          <h1 className="font-serif text-4xl font-light text-ink">{t('supplier.companyTitle')}</h1>
          <p className="text-sm text-ink-soft mt-2">{t('supplier.companyIntro')}</p>
          {form?.role === 'member' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-3">
              {t('supplier.companyReadOnlyHint')}
            </p>
          )}
        </div>
        {msg && (
          <p className={`text-sm ${msg === t('supplier.companySaved') ? 'text-emerald-700' : 'text-rose-700'}`}>{msg}</p>
        )}
        {form && (
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldCompanyName')}</label>
              <input name="name" value={form.name} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldContactEmail')}</label>
              <input name="contactEmail" type="email" value={form.contactEmail} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldPhone')}</label>
              <input name="phone" value={form.phone} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldDescription')}</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={4} className={inputClass} disabled={form.role === 'member'} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldAddress1')}</label>
              <input name="addressLine1" value={form.addressLine1} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldAddress2')}</label>
              <input name="addressLine2" value={form.addressLine2} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldCity')}</label>
                <input name="city" value={form.city} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldCountry')}</label>
                <input name="country" value={form.country} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
              </div>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] text-ash mb-1">{t('supplier.fieldPostal')}</label>
              <input name="postalCode" value={form.postalCode} onChange={handleChange} className={inputClass} disabled={form.role === 'member'} />
            </div>
            {form.role !== 'member' && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="btn-primary px-8 py-3 text-xs font-medium uppercase tracking-[0.22em] disabled:opacity-50"
              >
                {saving ? t('common.loading') : t('supplier.companySave')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
