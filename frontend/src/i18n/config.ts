export const DEFAULT_LOCALE = 'id-ID' as const;
export const SUPPORTED_LOCALES = ['id-ID', 'en-US'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_COOKIE = 'tembus_locale';

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  'id-ID': 'Bahasa Indonesia',
  'en-US': 'English',
};

const RTL_LANGUAGES = new Set(['ar', 'fa', 'he', 'ur', 'ps', 'ku', 'dv', 'yi']);

function languagePart(value: string): string {
  return value.trim().replace('_', '-').split('-')[0]?.toLowerCase() || '';
}

/** Normalize browser/API locale hints to the locales currently released by TEMBUS. */
export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  return languagePart(value || '') === 'en' ? 'en-US' : DEFAULT_LOCALE;
}

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return value === 'id-ID' || value === 'en-US';
}

/**
 * Return the deterministic content fallback order. The full locale is tried
 * first, then its language, then the market default, and finally id-ID.
 */
export function localeFallbackChain(
  requestedLocale: string | null | undefined,
  marketDefaultLocale: string = DEFAULT_LOCALE,
): string[] {
  const requested = requestedLocale?.trim().replace('_', '-') || DEFAULT_LOCALE;
  const marketDefault = marketDefaultLocale.trim().replace('_', '-') || DEFAULT_LOCALE;
  const candidates = [
    requested,
    languagePart(requested),
    marketDefault,
    languagePart(marketDefault),
    DEFAULT_LOCALE,
    languagePart(DEFAULT_LOCALE),
  ];
  return [...new Set(candidates.filter(Boolean))];
}

/** Direction is calculated independently from the supported release list. This lets us
 * test RTL layout behavior before an RTL market is enabled in production. */
export function directionForLocale(locale: string | null | undefined): 'ltr' | 'rtl' {
  return RTL_LANGUAGES.has(languagePart(locale || '')) ? 'rtl' : 'ltr';
}

export function languageName(locale: SupportedLocale): string {
  return new Intl.DisplayNames([locale], { type: 'language' }).of(languagePart(locale)) || LOCALE_LABELS[locale];
}
