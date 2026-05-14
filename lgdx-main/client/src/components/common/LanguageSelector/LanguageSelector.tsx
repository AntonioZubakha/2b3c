import React, { useState, useRef, useEffect } from 'react';
import { useTranslation, Locale } from '../../../i18n';
import styles from './LanguageSelector.module.css';

const LanguageSelector: React.FC = () => {
  const { locale, setLocale, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const languages: { code: Locale; label: string; nativeName: string }[] = [
    { code: 'en', label: t('language.english'), nativeName: t('language.english') },
    { code: 'hi', label: t('language.hindi'), nativeName: t('language.hindi') },
    { code: 'zh', label: t('language.chinese'), nativeName: t('language.chinese') },
    { code: 'ja', label: t('language.japanese'), nativeName: t('language.japanese') },
    { code: 'fr', label: t('language.french'), nativeName: t('language.french') },
    { code: 'de', label: t('language.german'), nativeName: t('language.german') },
  ];

  const currentLanguage = languages.find(lang => lang.code === locale) || languages[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleLanguageChange = (newLocale: Locale) => {
    setLocale(newLocale);
    setIsOpen(false);
  };

  return (
    <div className={styles.languageSelector} ref={dropdownRef}>
      <button
        className={styles.languageButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('language.selectLanguage')}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className={styles.languageCode}>{currentLanguage.code.toUpperCase()}</span>
        <span className={styles.chevron} aria-hidden="true">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>
      
      {isOpen && (
        <div className={styles.dropdown} role="listbox">
          {languages.map((lang) => (
            <button
              key={lang.code}
              className={`${styles.languageOption} ${locale === lang.code ? styles.active : ''}`}
              onClick={() => handleLanguageChange(lang.code)}
              role="option"
              aria-selected={locale === lang.code}
            >
              <span className={styles.languageNativeName}>{lang.nativeName}</span>
              <span className={styles.languageLabel}>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;

