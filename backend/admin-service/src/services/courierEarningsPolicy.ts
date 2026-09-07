export const COURIER_EARNINGS_POLICY_VERSION = 'courier-earnings-2026-v1';

export type CourierEarningComponents = {
  base_earning_idr: number;
  waiting_compensation_idr: number;
  toll_reimbursement_idr: number;
  return_compensation_idr: number;
  extra_service_compensation_idr: number;
  cancellation_compensation_idr: number;
  penalty_idr: number;
  estimated_total_idr: number;
};

export type CourierEarningPolicy = {
  version: string;
  service_code: string;
  payout_percent: number;
  minimum_payout_idr: number;
  compensation: {
    waiting: { enabled: boolean; threshold_minutes: number; rate_idr_per_minute: number; cap_idr: number };
    toll: { enabled: boolean; cap_idr: number };
    return: { enabled: boolean; cap_idr: number };
    extra_service: { enabled: boolean; payout_percent: number; cap_idr: number };
    cancellation: { enabled: boolean; cap_idr: number };
  };
};

type EarningPolicySource = {
  code?: string;
  courier_payout_percent?: number;
  courier_min_payout_idr?: number;
  metadata?: Record<string, unknown> | null;
};

const DEFAULT_COMPENSATION = {
  waiting: { enabled: true, threshold_minutes: 10, rate_idr_per_minute: 500, cap_idr: 10000 },
  toll: { enabled: true, cap_idr: 50000 },
  return: { enabled: true, cap_idr: 15000 },
  extra_service: { enabled: true, payout_percent: 80, cap_idr: 50000 },
  cancellation: { enabled: true, cap_idr: 10000 },
};

const finiteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nonNegativeInteger = (value: unknown, fallback = 0) =>
  Math.max(0, Math.round(finiteNumber(value, fallback)));

const boundedPercent = (value: unknown, fallback: number) =>
  Math.min(100, Math.max(0, finiteNumber(value, fallback)));

const mergeCompensation = (source: unknown) => {
  const raw = source && typeof source === 'object' ? source as Record<string, any> : {};
  return {
    waiting: {
      ...DEFAULT_COMPENSATION.waiting,
      ...(raw.waiting && typeof raw.waiting === 'object' ? raw.waiting : {}),
    },
    toll: {
      ...DEFAULT_COMPENSATION.toll,
      ...(raw.toll && typeof raw.toll === 'object' ? raw.toll : {}),
    },
    return: {
      ...DEFAULT_COMPENSATION.return,
      ...(raw.return && typeof raw.return === 'object' ? raw.return : {}),
    },
    extra_service: {
      ...DEFAULT_COMPENSATION.extra_service,
      ...(raw.extra_service && typeof raw.extra_service === 'object' ? raw.extra_service : {}),
    },
    cancellation: {
      ...DEFAULT_COMPENSATION.cancellation,
      ...(raw.cancellation && typeof raw.cancellation === 'object' ? raw.cancellation : {}),
    },
  };
};

export const buildCourierEarningPolicy = (service: EarningPolicySource): CourierEarningPolicy => {
  const metadata = service.metadata && typeof service.metadata === 'object' ? service.metadata : {};
  const configured = metadata.courier_earning_policy && typeof metadata.courier_earning_policy === 'object'
    ? metadata.courier_earning_policy as Record<string, any>
    : {};

  const compensation = mergeCompensation(configured.compensation);
  return {
    version: String(configured.version || COURIER_EARNINGS_POLICY_VERSION),
    service_code: String(service.code || configured.service_code || 'unknown'),
    payout_percent: boundedPercent(service.courier_payout_percent ?? configured.payout_percent, 0),
    minimum_payout_idr: nonNegativeInteger(service.courier_min_payout_idr ?? configured.minimum_payout_idr),
    compensation: {
      waiting: {
        enabled: compensation.waiting.enabled !== false,
        threshold_minutes: nonNegativeInteger(compensation.waiting.threshold_minutes, 10),
        rate_idr_per_minute: nonNegativeInteger(compensation.waiting.rate_idr_per_minute, 500),
        cap_idr: nonNegativeInteger(compensation.waiting.cap_idr, 10000),
      },
      toll: {
        enabled: compensation.toll.enabled !== false,
        cap_idr: nonNegativeInteger(compensation.toll.cap_idr, 50000),
      },
      return: {
        enabled: compensation.return.enabled !== false,
        cap_idr: nonNegativeInteger(compensation.return.cap_idr, 15000),
      },
      extra_service: {
        enabled: compensation.extra_service.enabled !== false,
        payout_percent: boundedPercent(compensation.extra_service.payout_percent, 80),
        cap_idr: nonNegativeInteger(compensation.extra_service.cap_idr, 50000),
      },
      cancellation: {
        enabled: compensation.cancellation.enabled !== false,
        cap_idr: nonNegativeInteger(compensation.cancellation.cap_idr, 10000),
      },
    },
  };
};

export const initialCourierEarningComponents = (baseEarningIDR: number): CourierEarningComponents => ({
  base_earning_idr: nonNegativeInteger(baseEarningIDR),
  waiting_compensation_idr: 0,
  toll_reimbursement_idr: 0,
  return_compensation_idr: 0,
  extra_service_compensation_idr: 0,
  cancellation_compensation_idr: 0,
  penalty_idr: 0,
  estimated_total_idr: nonNegativeInteger(baseEarningIDR),
});

export type CourierEarningFacts = Partial<Omit<CourierEarningComponents, 'estimated_total_idr'>>;

export const calculateCourierEarnings = (
  policy: CourierEarningPolicy,
  facts: CourierEarningFacts,
): CourierEarningComponents => {
  const waiting = policy.compensation.waiting.enabled
    ? Math.min(
      policy.compensation.waiting.cap_idr,
      nonNegativeInteger(facts.waiting_compensation_idr),
    )
    : 0;
  const toll = policy.compensation.toll.enabled
    ? Math.min(policy.compensation.toll.cap_idr, nonNegativeInteger(facts.toll_reimbursement_idr))
    : 0;
  const returnCompensation = policy.compensation.return.enabled
    ? Math.min(policy.compensation.return.cap_idr, nonNegativeInteger(facts.return_compensation_idr))
    : 0;
  const extraService = policy.compensation.extra_service.enabled
    ? Math.min(policy.compensation.extra_service.cap_idr, nonNegativeInteger(facts.extra_service_compensation_idr))
    : 0;
  const cancellation = policy.compensation.cancellation.enabled
    ? Math.min(policy.compensation.cancellation.cap_idr, nonNegativeInteger(facts.cancellation_compensation_idr))
    : 0;
  const penalty = nonNegativeInteger(facts.penalty_idr);
  const base = nonNegativeInteger(facts.base_earning_idr);
  const estimatedTotal = Math.max(0, base + waiting + toll + returnCompensation + extraService + cancellation - penalty);

  return {
    base_earning_idr: base,
    waiting_compensation_idr: waiting,
    toll_reimbursement_idr: toll,
    return_compensation_idr: returnCompensation,
    extra_service_compensation_idr: extraService,
    cancellation_compensation_idr: cancellation,
    penalty_idr: penalty,
    estimated_total_idr: estimatedTotal,
  };
};

export const earningComponentsFromSnapshot = (snapshot: unknown, fallbackBaseIDR = 0) => {
  const raw = snapshot && typeof snapshot === 'object' ? snapshot as Record<string, any> : {};
  const policy = raw.courier_earning_policy && typeof raw.courier_earning_policy === 'object'
    ? raw.courier_earning_policy as CourierEarningPolicy
    : buildCourierEarningPolicy({ code: String(raw.service_code || 'unknown') });
  const rawComponents = raw.courier_earning_components && typeof raw.courier_earning_components === 'object'
    ? raw.courier_earning_components as CourierEarningFacts
    : { base_earning_idr: fallbackBaseIDR };
  return { policy, components: calculateCourierEarnings(policy, rawComponents) };
};
