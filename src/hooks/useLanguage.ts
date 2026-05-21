import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { translations } from '../lib/i18n';

const STORAGE_KEY = 'plantos_language';
export type Language = 'pt-BR' | 'es-LATAM';

export const LANGUAGE_META: Record<Language, { label: string; native: string; locale: string }> = {
  'pt-BR':    { label: 'Português',  native: 'Brasil',        locale: 'pt-BR' },
  'es-LATAM': { label: 'Español',    native: 'Latinoamérica', locale: 'es-MX' },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  meta: typeof LANGUAGE_META[Language];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'pt-BR';
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    return stored === 'es-LATAM' ? 'es-LATAM' : 'pt-BR';
  });

  useEffect(() => {
    document.documentElement.setAttribute('lang', LANGUAGE_META[language].locale);
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const setLanguage = useCallback((lang: Language) => setLanguageState(lang), []);

  const t = useCallback(
    (key: string) => {
      if (language === 'pt-BR') return key;
      const dict = translations['es-LATAM'];
      return dict[key] ?? key;
    },
    [language]
  );

  const value: LanguageContextValue = { language, setLanguage, t, meta: LANGUAGE_META[language] };

  return React.createElement(LanguageContext.Provider, { value }, children);
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback: standalone reader so OnboardingScreen can read lang before provider mounts in tests.
    // In production, LanguageProvider must wrap the app.
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
