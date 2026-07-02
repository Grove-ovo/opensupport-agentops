import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { en } from './en.js';
import { zh } from './zh.js';

export type Locale = 'en' | 'zh';

const dictionaries: Record<Locale, Record<string, string>> = { en, zh };

const STORAGE_KEY = 'agentops-locale';

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language.startsWith('zh') ? 'zh' : 'en';
}

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  };

  const value = useMemo<LocaleContextValue>(() => {
    const dict = dictionaries[locale];
    const t = (key: string, params?: Record<string, string | number>): string => {
      let text = dict[key] ?? key;
      if (params) {
        for (const [param, val] of Object.entries(params)) {
          text = text.replaceAll(`{${param}}`, String(val));
        }
      }
      return text;
    };
    return { locale, setLocale, t };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (ctx === null) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return ctx;
}