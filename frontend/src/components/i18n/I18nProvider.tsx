'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  directionForLocale,
  LOCALE_COOKIE,
  normalizeLocale,
  type SupportedLocale,
} from '@/i18n/config';
import { translate, type MessageKey, type MessageValues } from '@/i18n/messages';

interface I18nContextValue {
  locale: SupportedLocale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: SupportedLocale) => void;
  t: (key: MessageKey, values?: MessageValues) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function applyDocumentLocale(locale: SupportedLocale): void {
  document.documentElement.lang = locale;
  document.documentElement.dir = directionForLocale(locale);
  document.documentElement.dataset.locale = locale;
}

export default function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<SupportedLocale>(normalizeLocale(initialLocale));

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    const normalized = normalizeLocale(nextLocale);
    setLocaleState(normalized);
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(normalized)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    direction: directionForLocale(locale),
    setLocale,
    t: (key, values) => translate(locale, key, values),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
