import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Language } from '../types/api';
import ar from './ar';
import en from './en';

const LANG_KEY = 'autopark.lang';

export function getInitialLanguage(): Language {
  try {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(LANG_KEY) : null;
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export function applyDocumentLanguage(lang: Language): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_KEY, lang);
    }
  } catch {
    // ignore
  }
}

const initialLang = getInitialLanguage();
applyDocumentLanguage(initialLang);

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  const lang: Language = lng === 'ar' ? 'ar' : 'en';
  applyDocumentLanguage(lang);
});

export default i18n;
