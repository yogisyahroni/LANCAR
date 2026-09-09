import { DEFAULT_LOCALE, type SupportedLocale } from './config';

type LocaleLike = SupportedLocale | string;

function safeLocale(locale: LocaleLike = DEFAULT_LOCALE): string {
  return locale || DEFAULT_LOCALE;
}

function dateValue(value: Date | string | number): Date | null {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatNumber(
  value: number,
  locale: LocaleLike = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(safeLocale(locale), options).format(value);
}

export function formatCurrency(
  value: number,
  currency = 'IDR',
  locale: LocaleLike = DEFAULT_LOCALE,
  minorUnit?: number,
): string {
  if (!Number.isFinite(value)) return '—';
  const fractionDigits = Number.isInteger(minorUnit) && minorUnit !== undefined
    ? Math.max(0, Math.min(3, minorUnit))
    : undefined;
  return new Intl.NumberFormat(safeLocale(locale), {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits ?? (currency === 'IDR' ? 0 : undefined),
  }).format(value);
}

export function formatDate(
  value: Date | string | number,
  locale: LocaleLike = DEFAULT_LOCALE,
  timeZone?: string,
): string {
  const date = dateValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(safeLocale(locale), {
    dateStyle: 'medium',
    timeZone,
  }).format(date);
}

export function formatTime(
  value: Date | string | number,
  locale: LocaleLike = DEFAULT_LOCALE,
  timeZone?: string,
): string {
  const date = dateValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(safeLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

export function formatDateTime(
  value: Date | string | number,
  locale: LocaleLike = DEFAULT_LOCALE,
  timeZone?: string,
): string {
  const date = dateValue(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat(safeLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}

export interface AddressParts {
  street?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export function formatAddress(parts: AddressParts, locale: LocaleLike = DEFAULT_LOCALE): string {
  const language = safeLocale(locale).split('-')[0].toLowerCase();
  const values = language === 'en'
    ? [parts.street, parts.city, parts.region, parts.postalCode, parts.district, parts.country]
    : [parts.street, parts.district, parts.city, parts.region, parts.postalCode, parts.country];
  const clean = values.filter((part): part is string => Boolean(part?.trim())).map((part) => part.trim());
  if (clean.length === 0) return '—';
  return new Intl.ListFormat(safeLocale(locale), { type: 'unit', style: 'long' }).format(clean);
}

/** Display phone numbers predictably while retaining the supplied country context. */
export function formatPhone(phone: string | null | undefined, countryCode = 'ID'): string {
  const raw = phone?.trim();
  if (!raw) return '—';
  const digits = raw.replace(/[^\d+]/g, '');
  const country = countryCode.toUpperCase();
  const dialCode = country === 'US' || country === 'CA' ? '1' : country === 'SG' ? '65' : '62';
  const national = digits.startsWith('+')
    ? digits.slice(1).replace(new RegExp(`^${dialCode}`), '')
    : digits.replace(/^0+/, '');
  return `+${dialCode} ${national.match(/.{1,4}/g)?.join(' ') || ''}`.trim();
}
