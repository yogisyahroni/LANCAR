import { cookies } from 'next/headers';
import { LOCALE_COOKIE, normalizeLocale, type SupportedLocale } from './config';

export async function getRequestLocale(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
}
