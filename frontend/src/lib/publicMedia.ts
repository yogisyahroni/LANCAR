import { customerApiUrl } from './runtimeConfig';

/** Resolve a public API upload path for customer web rendering. */
export const resolveCustomerMediaUrl = (value: string | null | undefined): string => {
  const source = String(value || '').trim();
  if (!source) return '';
  if (/^https:\/\//i.test(source)) return source;
  const origin = customerApiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
  return `${origin}/${source.replace(/^\//, '')}`;
};
