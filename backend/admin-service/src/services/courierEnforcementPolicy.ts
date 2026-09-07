export const COURIER_ENFORCEMENT_TYPES = ['suspension', 'restriction'] as const;
export type CourierEnforcementType = (typeof COURIER_ENFORCEMENT_TYPES)[number];

export const COURIER_ENFORCEMENT_SCOPES = ['account', 'market', 'capability'] as const;
export type CourierEnforcementScope = (typeof COURIER_ENFORCEMENT_SCOPES)[number];

export const COURIER_ENFORCEMENT_REASONS = [
  'safety',
  'fraud_integrity',
  'document_compliance',
  'quality',
  'market_policy',
  'availability',
  'other',
] as const;
export type CourierEnforcementReason = (typeof COURIER_ENFORCEMENT_REASONS)[number];

export const COURIER_SAFE_JOB_POLICIES = [
  'allow_active_job_completion',
  'reassign_unpicked_jobs',
  'immediate_safety_stop',
] as const;
export type CourierSafeJobPolicy = (typeof COURIER_SAFE_JOB_POLICIES)[number];

export const COURIER_ENFORCEMENT_STATUSES = [
  'scheduled',
  'pending_safe_completion',
  'active',
  'revoked',
  'expired',
] as const;

export type CourierEnforcementInput = {
  type: string;
  scope: string;
  reasonCategory: string;
  reasonDetail: string;
  courierMessage?: string | null;
  marketCode?: string | null;
  serviceCode?: string | null;
  effectiveFrom?: string | Date | null;
  effectiveUntil?: string | Date | null;
  safeJobPolicy?: string | null;
  disclosureLevel?: string | null;
};

export type NormalizedCourierEnforcementInput = {
  type: CourierEnforcementType;
  scope: CourierEnforcementScope;
  reasonCategory: CourierEnforcementReason;
  reasonDetail: string;
  courierMessage: string | null;
  marketCode: string | null;
  serviceCode: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  safeJobPolicy: CourierSafeJobPolicy;
  disclosureLevel: 'actionable' | 'security_restricted';
};

export class CourierEnforcementPolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CourierEnforcementPolicyError';
  }
}

const normalizeDate = (value: string | Date | null | undefined, field: string): Date | null => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_ENFORCEMENT_DATE', `${field} must be a valid date`);
  }
  return parsed;
};

export const normalizeCourierEnforcementInput = (
  input: CourierEnforcementInput,
): NormalizedCourierEnforcementInput => {
  const type = String(input.type || '').trim().toLowerCase() as CourierEnforcementType;
  const scope = String(input.scope || '').trim().toLowerCase() as CourierEnforcementScope;
  const reasonCategory = String(input.reasonCategory || '').trim().toLowerCase() as CourierEnforcementReason;
  const reasonDetail = String(input.reasonDetail || '').trim();
  const marketCode = input.marketCode === undefined || input.marketCode === null
    ? null
    : String(input.marketCode).trim().toLowerCase() || null;
  const serviceCode = input.serviceCode === undefined || input.serviceCode === null
    ? null
    : String(input.serviceCode).trim().toLowerCase() || null;
  const effectiveFrom = normalizeDate(input.effectiveFrom, 'effective_from') || new Date();
  const effectiveUntil = normalizeDate(input.effectiveUntil, 'effective_until');
  const safeJobPolicy = String(input.safeJobPolicy || 'allow_active_job_completion').trim().toLowerCase() as CourierSafeJobPolicy;
  const disclosureLevel = String(input.disclosureLevel || 'actionable').trim().toLowerCase() === 'security_restricted'
    ? 'security_restricted'
    : 'actionable';

  if (!COURIER_ENFORCEMENT_TYPES.includes(type)) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_ENFORCEMENT_TYPE', 'type must be suspension or restriction');
  }
  if (!COURIER_ENFORCEMENT_SCOPES.includes(scope)) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_ENFORCEMENT_SCOPE', 'scope must be account, market, or capability');
  }
  if (!COURIER_ENFORCEMENT_REASONS.includes(reasonCategory)) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_ENFORCEMENT_REASON', 'reason_category is not supported');
  }
  if (reasonDetail.length < 10 || reasonDetail.length > 2000) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_ENFORCEMENT_REASON', 'reason_detail must be 10-2000 characters');
  }
  if (!COURIER_SAFE_JOB_POLICIES.includes(safeJobPolicy)) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_SAFE_JOB_POLICY', 'safe_job_policy is not supported');
  }
  if (effectiveUntil && effectiveUntil <= effectiveFrom) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_ENFORCEMENT_DATE', 'effective_until must be after effective_from');
  }
  if (scope === 'market' && !marketCode) {
    throw new CourierEnforcementPolicyError('ERR_MARKET_REQUIRED', 'market_code is required for market enforcement');
  }
  if (scope === 'capability' && !serviceCode) {
    throw new CourierEnforcementPolicyError('ERR_SERVICE_REQUIRED', 'service_code is required for capability enforcement');
  }
  if (scope === 'account' && (marketCode || serviceCode)) {
    throw new CourierEnforcementPolicyError('ERR_INVALID_ENFORCEMENT_TARGET', 'account enforcement cannot include market or service target');
  }

  return {
    type,
    scope,
    reasonCategory,
    reasonDetail,
    courierMessage: input.courierMessage ? String(input.courierMessage).trim().slice(0, 500) : null,
    marketCode,
    serviceCode,
    effectiveFrom,
    effectiveUntil,
    safeJobPolicy,
    disclosureLevel,
  };
};

export const courierEnforcementDisplayReason = (row: {
  reason_category?: string | null;
  courier_message?: string | null;
  disclosure_level?: string | null;
}) => ({
  reason_category: row.reason_category || 'other',
  actionable_reason: row.disclosure_level === 'security_restricted'
    ? 'Akses sedang dibatasi sementara untuk pemeriksaan keamanan. Hubungi dukungan TEMBUS untuk tindak lanjut.'
    : row.courier_message || 'Akses layanan sedang dibatasi. Ajukan banding melalui aplikasi untuk meminta peninjauan.',
  disclosure_level: row.disclosure_level || 'actionable',
});

