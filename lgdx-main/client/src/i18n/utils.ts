/**
 * Internationalization (i18n) Utilities
 * Утилиты для системы интернационализации
 */

import type { Locale, TranslationVariables } from './types';

/**
 * Get nested value from object by dot notation key
 */
export const getNestedValue = (obj: unknown, path: string): unknown => {
  return path.split('.').reduce((current: unknown, key: string) => 
    (current && typeof current === 'object' && key in current) 
      ? (current as Record<string, unknown>)[key] 
      : undefined
  , obj);
};

/**
 * Replace variables in translation string
 */
export const replaceVariables = (text: string, variables?: TranslationVariables): string => {
  if (!variables) return text;
  
  return Object.entries(variables).reduce((result, [key, value]) => {
    return result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }, text);
};

/**
 * Detect browser locale
 */
export const detectBrowserLocale = (): Locale => {
  const browserLang = navigator.language.split('-')[0];
  const supportedLocales: Locale[] = ['en', 'hi', 'zh', 'ja', 'fr', 'de'];
  return supportedLocales.includes(browserLang as Locale) ? (browserLang as Locale) : 'en';
};

/**
 * Load locale from storage
 */
export const loadLocaleFromStorage = (): Locale => {
  try {
    const saved = localStorage.getItem('locale');
    const supportedLocales: Locale[] = ['en', 'hi', 'zh', 'ja', 'fr', 'de'];
    return saved && supportedLocales.includes(saved as Locale) ? (saved as Locale) : detectBrowserLocale();
  } catch {
    return detectBrowserLocale();
  }
};

/**
 * Save locale to storage
 */
export const saveLocaleToStorage = (locale: Locale): void => {
  try {
    localStorage.setItem('locale', locale);
  } catch {
    // Silent fail
  }
};

