export type EconomicPolicyType = 'pricing' | 'surge';

export type EconomicPolicyPayload = Record<string, unknown>;

export type EconomicPolicyDraft = {
  policyType: EconomicPolicyType;
  marketCode: string;
  zoneId: string | null;
  serviceCode: string;
  policyVersion: string;
  runtimeConfigKey: string;
  policyKey: string;
  businessReason: string;
  payload: EconomicPolicyPayload;
};

export type QuoteBasis = {
  baseFareIdr: number;
  includedDistanceKm: number;
  perKmIdr: number;
  serviceMultiplier: number;
  source: 'delivery_service_products' | 'pricing_configs';
};

export class EconomicPolicyValidationError extends Error {
  statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'EconomicPolicyValidationError';
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SAFE_MARKET_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const RUNTIME_KEY_PATTERN = /^dynamic_pricing_policy_[a-z0-9][a-z0-9_-]{0,79}$/;

const asFiniteNumber = (value: unknown, field: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new EconomicPolicyValidationError(`${field} harus berupa angka finite`);
  }
  return parsed;
};

const asNonEmptyCode = (value: unknown, field: string, pattern: RegExp): string => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!pattern.test(normalized)) {
    throw new EconomicPolicyValidationError(`${field} tidak valid`);
  }
  return normalized;
};

const protectedCapForService = (serviceCode: string): number => {
  if (serviceCode === 'food_delivery') return 1.4;
  if (serviceCode.startsWith('tambal_ban') || serviceCode.startsWith('towing')) return 1.2;
  return 1.5;
};

const cloneObject = (value: unknown, field: string): EconomicPolicyPayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EconomicPolicyValidationError(`${field} harus berupa object JSON`);
  }
  return JSON.parse(JSON.stringify(value)) as EconomicPolicyPayload;
};

const validatePeakWindows = (value: unknown): Array<Record<string, number>> => {
  if (!Array.isArray(value)) {
    throw new EconomicPolicyValidationError('peak_windows harus berupa array');
  }
  return value.map((rawWindow, index) => {
    const window = cloneObject(rawWindow, `peak_windows[${index}]`);
    const startHour = asFiniteNumber(window.start_hour, `peak_windows[${index}].start_hour`);
    const endHour = asFiniteNumber(window.end_hour, `peak_windows[${index}].end_hour`);
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour >= 24 || endHour <= startHour || endHour > 24) {
      throw new EconomicPolicyValidationError(`peak_windows[${index}] memiliki jam yang tidak valid`);
    }
    return { start_hour: startHour, end_hour: endHour };
  });
};

export const validateEconomicPolicyPayload = (
  rawPayload: unknown,
  metadata: Pick<EconomicPolicyDraft, 'serviceCode' | 'marketCode' | 'policyVersion'>,
): EconomicPolicyPayload => {
  const payload = cloneObject(rawPayload, 'payload');
  const floorMultiplier = asFiniteNumber(payload.floor_multiplier, 'floor_multiplier');
  const ceilingMultiplier = asFiniteNumber(payload.ceiling_multiplier, 'ceiling_multiplier');
  const protectedCapMultiplier = asFiniteNumber(payload.protected_cap_multiplier, 'protected_cap_multiplier');
  const peakMultiplier = asFiniteNumber(payload.peak_multiplier, 'peak_multiplier');
  const maxProtectedCap = protectedCapForService(metadata.serviceCode);

  if (floorMultiplier < 1 || ceilingMultiplier < floorMultiplier || protectedCapMultiplier < floorMultiplier) {
    throw new EconomicPolicyValidationError('floor/ceiling/protected cap policy bounds tidak valid');
  }
  if (protectedCapMultiplier > maxProtectedCap || ceilingMultiplier > maxProtectedCap || peakMultiplier > maxProtectedCap) {
    throw new EconomicPolicyValidationError(`protected pricing cap untuk ${metadata.serviceCode} tidak boleh melebihi ${maxProtectedCap}`);
  }
  if (peakMultiplier < 1) {
    throw new EconomicPolicyValidationError('peak_multiplier tidak boleh di bawah 1');
  }
  if (payload.fairness_reviewed !== true) {
    throw new EconomicPolicyValidationError('policy wajib memiliki fairness_reviewed=true');
  }
  if (!String(payload.zone_scope ?? '').trim() || !String(payload.timezone ?? '').trim()) {
    throw new EconomicPolicyValidationError('zone_scope dan timezone wajib diisi');
  }

  return {
    ...payload,
    policy_version: metadata.policyVersion,
    market: metadata.marketCode,
    service_code: metadata.serviceCode,
    floor_multiplier: floorMultiplier,
    ceiling_multiplier: ceilingMultiplier,
    protected_cap_multiplier: protectedCapMultiplier,
    peak_multiplier: peakMultiplier,
    peak_windows: validatePeakWindows(payload.peak_windows),
    fairness_reviewed: true,
  };
};

export const normalizeEconomicPolicyDraft = (body: Record<string, unknown>): EconomicPolicyDraft => {
  const policyType = String(body.policy_type ?? '').trim().toLowerCase() as EconomicPolicyType;
  if (policyType !== 'pricing' && policyType !== 'surge') {
    throw new EconomicPolicyValidationError('policy_type hanya pricing atau surge');
  }

  const marketCode = asNonEmptyCode(body.market_code ?? 'default', 'market_code', SAFE_MARKET_PATTERN);
  const serviceCode = asNonEmptyCode(body.service_code ?? 'food_delivery', 'service_code', SAFE_CODE_PATTERN);
  const policyVersion = String(body.policy_version ?? '').trim();
  if (!policyVersion || policyVersion.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(policyVersion)) {
    throw new EconomicPolicyValidationError('policy_version wajib berupa identifier yang valid');
  }

  const zoneIdRaw = body.zone_id === undefined || body.zone_id === null || body.zone_id === '' ? null : String(body.zone_id).trim();
  if (zoneIdRaw && !UUID_PATTERN.test(zoneIdRaw)) {
    throw new EconomicPolicyValidationError('zone_id harus berupa UUID valid');
  }

  const runtimeConfigKey = String(
    body.runtime_config_key || (marketCode === 'default'
      ? `dynamic_pricing_policy_default_${serviceCode}`
      : `dynamic_pricing_policy_${marketCode}_${serviceCode}`),
  ).trim().toLowerCase();
  if (!RUNTIME_KEY_PATTERN.test(runtimeConfigKey)) {
    throw new EconomicPolicyValidationError('runtime_config_key harus menunjuk ke dynamic pricing policy yang tervalidasi');
  }

  const businessReason = String(body.business_reason ?? '').trim();
  if (businessReason.length < 3 || businessReason.length > 2000) {
    throw new EconomicPolicyValidationError('business_reason wajib diisi (3-2000 karakter)');
  }

  const draftMetadata = { serviceCode, marketCode, policyVersion };
  const payload = validateEconomicPolicyPayload(body.payload, draftMetadata);
  const policyKey = `economics:${policyType}:${runtimeConfigKey}:${zoneIdRaw || 'global'}`;

  return {
    policyType,
    marketCode,
    zoneId: zoneIdRaw,
    serviceCode,
    policyVersion,
    runtimeConfigKey,
    policyKey,
    businessReason,
    payload,
  };
};

export const buildExampleQuotes = (
  basis: QuoteBasis | null,
  payload: EconomicPolicyPayload,
): Array<Record<string, number | string>> => {
  if (!basis) return [];
  const floor = Number(payload.floor_multiplier);
  const ceiling = Math.min(Number(payload.ceiling_multiplier), Number(payload.protected_cap_multiplier));
  const multiplier = Math.min(ceiling, Math.max(floor, 1));
  const distances = [1, 3, 5];
  return distances.map((distanceKm) => {
    const routeCharge = Math.max(0, distanceKm - basis.includedDistanceKm) * basis.perKmIdr;
    const baseAmount = Math.ceil((basis.baseFareIdr + routeCharge) * basis.serviceMultiplier);
    return {
      distance_km: distanceKm,
      base_quote_idr: baseAmount,
      candidate_quote_idr: Math.ceil(baseAmount * multiplier),
      applied_multiplier: multiplier,
      quote_type: 'server_simulation_only',
    };
  });
};

export const quoteBasisFromRow = (
  row: Record<string, unknown> | undefined,
  source: QuoteBasis['source'],
): QuoteBasis | null => {
  if (!row) return null;
  const baseFareIdr = Number(row.base_fare_idr ?? row.base_fee);
  const includedDistanceKm = Number(row.included_distance_km ?? row.min_distance_km ?? 0);
  const perKmIdr = Number(row.per_km_idr ?? row.per_km_fee);
  const serviceMultiplier = Number(row.service_multiplier ?? 1);
  if (![baseFareIdr, includedDistanceKm, perKmIdr, serviceMultiplier].every(Number.isFinite)) return null;
  return { baseFareIdr, includedDistanceKm, perKmIdr, serviceMultiplier, source };
};
