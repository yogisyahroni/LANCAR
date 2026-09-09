import { localeFallbackChain } from './config';

export type LocalizedContentStatus = 'draft' | 'published' | 'approved' | 'archived';

export interface LocalizedContentRecord {
  key: string;
  locale: string;
  value: string;
  status: LocalizedContentStatus;
  version?: number | string;
  publishedAt?: string | null;
  approvedAt?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  uri?: string | null;
}

export interface MarketLegalDocument {
  document_type: string;
  locale: string;
  version: string;
  document_uri: string;
  effective_from: string;
}

export interface ContentResolutionOptions {
  requestedLocale: string;
  marketDefaultLocale?: string;
  now?: Date;
}

function isInWindow(record: LocalizedContentRecord, now: Date): boolean {
  const timestamp = now.getTime();
  const starts = record.effectiveFrom ? new Date(record.effectiveFrom).getTime() : Number.NEGATIVE_INFINITY;
  const ends = record.effectiveTo ? new Date(record.effectiveTo).getTime() : Number.POSITIVE_INFINITY;
  return Number.isNaN(starts) || Number.isNaN(ends) ? false : starts <= timestamp && timestamp < ends;
}

function resolve(
  records: LocalizedContentRecord[],
  options: ContentResolutionOptions,
  isEligible: (record: LocalizedContentRecord, now: Date) => boolean,
): LocalizedContentRecord | null {
  const now = options.now || new Date();
  const keys = localeFallbackChain(options.requestedLocale, options.marketDefaultLocale);
  for (const locale of keys) {
    const candidate = records.find((record) => record.locale.replace('_', '-') === locale && isEligible(record, now));
    if (candidate) return candidate;
  }
  return null;
}

export function resolveMarketingContent(
  records: LocalizedContentRecord[],
  key: string,
  options: ContentResolutionOptions,
): LocalizedContentRecord | null {
  return resolve(
    records.filter((record) => record.key === key),
    options,
    (record, now) => record.status === 'published' && Boolean(record.publishedAt) && isInWindow(record, now),
  );
}

export function resolveLegalContent(
  records: LocalizedContentRecord[],
  key: string,
  options: ContentResolutionOptions,
): LocalizedContentRecord | null {
  return resolve(
    records.filter((record) => record.key === key),
    options,
    (record, now) => record.status === 'approved' && Boolean(record.approvedAt) && isInWindow(record, now),
  );
}

/** The public market-config API has already filtered these documents through the
 * server readiness/approval gate; preserve its version and effective timestamp. */
export function marketLegalDocumentsToContent(
  documents: MarketLegalDocument[],
): LocalizedContentRecord[] {
  return documents.map((document) => ({
    key: document.document_type,
    locale: document.locale,
    value: document.document_type,
    status: 'approved',
    version: document.version,
    approvedAt: document.effective_from,
    effectiveFrom: document.effective_from,
    uri: document.document_uri,
  }));
}
