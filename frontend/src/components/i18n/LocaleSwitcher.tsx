'use client';

import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@/i18n/config';
import { useI18n } from './I18nProvider';

export default function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className={`inline-flex items-center gap-2 text-xs text-current ${className}`}>
      <span className="sr-only">{t('accessibility.localeSwitcher')}</span>
      <select
        aria-label={t('accessibility.localeSwitcher')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as (typeof SUPPORTED_LOCALES)[number])}
        className="rounded-lg border border-current/20 bg-transparent px-2 py-1.5 font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {SUPPORTED_LOCALES.map((supportedLocale) => (
          <option key={supportedLocale} value={supportedLocale}>
            {LOCALE_LABELS[supportedLocale]}
          </option>
        ))}
      </select>
    </label>
  );
}
