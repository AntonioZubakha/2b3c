import React from 'react';
import { useTranslation } from 'react-i18next';

const LanguageToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { i18n } = useTranslation();
  const active = i18n.language?.startsWith('en') ? 'en' : 'ru';

  return (
    <div
      className={`flex items-center rounded-full border border-[color:var(--border-soft)] bg-surface-elev p-0.5 ${
        compact ? 'scale-95' : ''
      }`}
      role="group"
      aria-label="Language"
    >
      {(['ru', 'en'] as const).map(code => (
        <button
          key={code}
          type="button"
          onClick={() => void i18n.changeLanguage(code)}
          className={`px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-[0.14em] transition-colors cursor-pointer border-0 ${
            active === code
              ? 'bg-rose-gold text-white shadow-sm'
              : 'bg-transparent text-ink-soft hover:text-rose-gold-deep'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  );
};

export default LanguageToggle;
