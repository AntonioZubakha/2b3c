/**
 * Internationalization (i18n) Types
 * Типы для системы интернационализации
 */

import type en from './locales/en'
import type { Locale } from './index'

export type { Locale } from './index'


type FlattenKeys<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Record<string, any>
      ? FlattenKeys<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

/**
 * Translation keys (dot notation)
 */
export type TranslationKey = FlattenKeys<TranslationDictionary>;

/**
 * Translation variables
 */
export type TranslationVariables = Record<string, string | number>;

/**
 * Translation dictionary
 */
export type TranslationDictionary = typeof en;

export type DiamondShape = keyof TranslationDictionary['catalog']['shapes']

/**
 * I18n Context Type
 */
export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, variables?: TranslationVariables) => string;
  formatDate: (date: Date, format?: 'short' | 'long' | 'full') => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
}

