import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ru } from './locales/ru/index';
import { en } from './locales/en/index';

const STORAGE_KEY = 'stonee_locale';

function initialLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    /* ignore */
  }
  return 'ru';
}

const lng = initialLanguage();
if (typeof document !== 'undefined') {
  document.documentElement.lang = lng === 'en' ? 'en' : 'ru';
}

void i18n.use(initReactI18next).init({
  lng,
  fallbackLng: 'ru',
  supportedLngs: ['ru', 'en'],
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (l) => {
  try {
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l === 'en' ? 'en' : 'ru';
  } catch {
    /* ignore */
  }
});

export default i18n;
