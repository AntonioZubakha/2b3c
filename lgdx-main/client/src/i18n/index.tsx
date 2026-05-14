/**
 * Internationalization (i18n) Module
 * Система интернационализации приложения
 * 
 * @description
 * Легковесная i18n система без зависимостей.
 * Готова к интеграции с react-i18next или react-intl при необходимости.
 * 
 * @example
 * ```tsx
 * import { useTranslation } from './i18n';
 * 
 * const MyComponent = () => {
 *   const { t, locale, setLocale } = useTranslation();
 *   return <button>{t('common.submit')}</button>;
 * };
 * ```
 */

import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

/* ==========================================================================
   IMPORTS
   ========================================================================== */

import type { TranslationKey, TranslationVariables, TranslationDictionary, I18nContextType } from './types';
import { getNestedValue, replaceVariables, loadLocaleFromStorage, saveLocaleToStorage } from './utils';

// Import translations
import en from './locales/en';
import hi from './locales/hi';
import zh from './locales/zh';
import ja from './locales/ja';
import fr from './locales/fr';
import de from './locales/de';
/* ==========================================================================
   TRANSLATIONS
   ========================================================================== */

/**
 * All translations
 */
const translations: Record<string, TranslationDictionary> = {
  en,
  hi,
  zh,
  ja,
  fr,
  de,
};

type Locale = keyof typeof translations;

/* ==========================================================================
   CONTEXT
   ========================================================================== */

const I18nContext = createContext<I18nContextType | undefined>(undefined);

/* ==========================================================================
   PROVIDER
   ========================================================================== */

interface I18nProviderProps {
  children: ReactNode;
  defaultLocale?: Locale;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children, defaultLocale }) => {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale || loadLocaleFromStorage());

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    saveLocaleToStorage(newLocale);
    // Update HTML lang attribute for accessibility
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback((key: TranslationKey, variables?: TranslationVariables): string => {
    let translation = getNestedValue(translations[locale], key);
    if ((!translation || typeof translation !== 'string') && locale !== 'en') {
      translation = getNestedValue(translations.en, key);
    }
    if (!translation || typeof translation !== 'string') {
      return key;
    }
    return replaceVariables(translation, variables);
  }, [locale]);

  const formatDate = useCallback((date: Date, format: 'short' | 'long' | 'full' = 'short'): string => {
    let options: Intl.DateTimeFormatOptions;
    
    if (format === 'short') {
      options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    } else if (format === 'long') {
      options = { year: 'numeric', month: 'long', day: 'numeric' };
    } else {
      options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    }

    return new Intl.DateTimeFormat(locale, options).format(date);
  }, [locale]);

  const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions): string => {
    return new Intl.NumberFormat(locale, options).format(value);
  }, [locale]);

  const formatCurrency = useCallback((value: number, currency = 'USD'): string => {
    const formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(value);
    // Project standard: space between currency symbol and number (e.g. "$ 91.57")
    return formatted.replace(/(\$|€|£)(\d)/g, '$1 $2');
  }, [locale]);

  const value = useMemo<I18nContextType>(() => ({
    locale,
    setLocale,
    t,
    formatDate,
    formatNumber,
    formatCurrency,
  }), [locale, setLocale, t, formatDate, formatNumber, formatCurrency]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

/* ==========================================================================
   HOOKS
   ========================================================================== */

/**
 * Use translation hook
 */
export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  
  if (!context) {
    throw new Error('useTranslation must be used within I18nProvider');
  }
  
  return context;
};

/**
 * Use locale hook
 */
export const useLocale = (): [Locale, (locale: Locale) => void] => {
  const { locale, setLocale } = useTranslation();
  return [locale, setLocale];
};

/* ==========================================================================
   EXPORTS
   ========================================================================== */

// Re-export types
export type { Locale, TranslationKey, TranslationVariables, TranslationDictionary, I18nContextType };

export default {
  I18nProvider,
  useTranslation,
  useLocale,
};
