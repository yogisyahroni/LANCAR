import type { SupportedLocale } from './config';
import idMessages from './messages/id-ID';
import enMessages from './messages/en-US';

export const messages = {
  'id-ID': idMessages,
  'en-US': enMessages,
} as const satisfies Record<SupportedLocale, Record<keyof typeof idMessages, string>>;

export type MessageKey = keyof typeof idMessages;
export type MessageValues = Record<string, string | number>;

export function interpolate(message: string, values: MessageValues = {}): string {
  return message.replace(/\{([\w.-]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function translate(locale: SupportedLocale, key: MessageKey, values?: MessageValues): string {
  const message = messages[locale][key] || messages['id-ID'][key];
  return interpolate(message || '—', values);
}
