'use client';

import {
  resolveLegalContent,
  resolveMarketingContent,
  type LocalizedContentRecord,
} from '@/i18n/content';

export function LocalizedMarketingText({
  records,
  contentKey,
  locale,
  marketDefaultLocale,
}: {
  records: LocalizedContentRecord[];
  contentKey: string;
  locale: string;
  marketDefaultLocale?: string;
}) {
  const record = resolveMarketingContent(records, contentKey, { requestedLocale: locale, marketDefaultLocale });
  return record ? <>{record.value}</> : null;
}

function safeLegalUri(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith('/') && !uri.startsWith('//')) return uri;
  if (uri.startsWith('https://')) return uri;
  return null;
}

export function LocalizedLegalDocumentLink({
  records,
  documentType,
  locale,
  marketDefaultLocale,
  children,
}: {
  records: LocalizedContentRecord[];
  documentType: string;
  locale: string;
  marketDefaultLocale?: string;
  children: React.ReactNode;
}) {
  const record = resolveLegalContent(records, documentType, { requestedLocale: locale, marketDefaultLocale });
  const uri = safeLegalUri(record?.uri);
  if (!record || !uri) return null;

  return <a href={uri} data-legal-version={String(record.version || '')}>{children}</a>;
}
