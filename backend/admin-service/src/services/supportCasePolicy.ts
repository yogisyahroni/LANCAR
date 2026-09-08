export const SUPPORT_REFERENCE_TYPES = [
  'order',
  'payment',
  'refund',
  'courier',
  'merchant',
  'carrier',
  'proof',
  'claim',
  'reconciliation',
] as const;

export type SupportReferenceType = (typeof SUPPORT_REFERENCE_TYPES)[number];

export const SUPPORT_CASE_STATUSES = [
  'open',
  'investigating',
  'pending_customer',
  'pending_internal',
  'resolved',
  'closed',
] as const;

export type SupportCaseStatus = (typeof SUPPORT_CASE_STATUSES)[number];

export const SUPPORT_ACTIONS = [
  'request_more_info',
  'reassign',
  'escalate',
  'resolve',
  'reopen',
  'refund',
  'compensate',
] as const;

export type SupportAction = (typeof SUPPORT_ACTIONS)[number];

export type SupportCasePolicyInput = {
  serviceCode: string;
  marketCode: string;
  category: string;
  caseStatus: SupportCaseStatus;
  orderStatus?: string | null;
  paymentStatus?: string | null;
  actorRole: string;
};

export type SupportCasePolicy = {
  version: string;
  allowedActions: SupportAction[];
  suggestedActions: SupportAction[];
  financialActions: SupportAction[];
  financialActionsRequireTotp: true;
  reason: string;
};

const SUPPORT_STAFF_ROLES = new Set([
  'super_admin',
  'ops_security',
  'ops_admin',
  'finance_admin',
  'finance',
  'cs_agent',
  'zone_manager',
]);

const FINANCIAL_MARKETS = new Set(
  String(process.env.SUPPORT_FINANCIAL_MARKETS || 'id-jk,id-sby,id-bdg')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

const FINANCIAL_SERVICES = new Set([
  'food_delivery',
  'parcel_delivery',
  'courier',
  'p2p',
  'two_legs',
  'three_legs',
]);

const OPEN_CASE_STATUSES = new Set<SupportCaseStatus>([
  'open',
  'investigating',
  'pending_customer',
  'pending_internal',
]);

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

/**
 * A deterministic, versioned policy boundary for support actions. The policy
 * only describes what may be attempted; authoritative state and financial
 * side effects are still checked by the controller and owning service.
 */
export const getSupportCasePolicy = (input: SupportCasePolicyInput): SupportCasePolicy => {
  const serviceCode = normalize(input.serviceCode);
  const marketCode = normalize(input.marketCode);
  const category = normalize(input.category);
  const orderStatus = normalize(input.orderStatus);
  const paymentStatus = normalize(input.paymentStatus);
  const isStaff = SUPPORT_STAFF_ROLES.has(normalize(input.actorRole));
  const allowedActions: SupportAction[] = [];
  const suggestedActions: SupportAction[] = [];

  if (!isStaff) {
    return {
      version: 'support-case-policy.v1',
      allowedActions: [],
      suggestedActions: [],
      financialActions: [],
      financialActionsRequireTotp: true,
      reason: 'Only support staff may execute case actions.',
    };
  }

  if (input.caseStatus === 'resolved' || input.caseStatus === 'closed') {
    allowedActions.push('reopen');
    return {
      version: 'support-case-policy.v1',
      allowedActions,
      suggestedActions: ['reopen'],
      financialActions: [],
      financialActionsRequireTotp: true,
      reason: 'A resolved or closed case can only be reopened for a new review.',
    };
  }

  if (OPEN_CASE_STATUSES.has(input.caseStatus)) {
    allowedActions.push('request_more_info', 'reassign', 'escalate', 'resolve');
  }

  if (input.caseStatus === 'pending_customer') {
    suggestedActions.push('request_more_info');
  } else if (input.caseStatus === 'pending_internal') {
    suggestedActions.push('reassign', 'escalate');
  } else {
    suggestedActions.push('request_more_info', 'resolve');
  }

  const financialMarket = FINANCIAL_MARKETS.has(marketCode);
  const financialService = FINANCIAL_SERVICES.has(serviceCode);
  const paidOrder = paymentStatus === 'paid' || paymentStatus === 'settled' || paymentStatus === 'captured';
  // A paid order may be refunded before, during or after fulfilment. The
  // owning refund API remains authoritative for the exact financial rules;
  // support only blocks states that cannot have a settled payment.
  const eligibleOrderState = !orderStatus || !new Set(['pending_payment', 'failed']).has(orderStatus);
  const financialCategory = /refund|payment|cancel|missing|damage|quality|food|compensation|claim/.test(category);
  const canUseFinancialPath = financialMarket && financialService && paidOrder && eligibleOrderState && financialCategory;

  if (canUseFinancialPath) {
    allowedActions.push('refund');
    suggestedActions.unshift('refund');
    if (serviceCode === 'food_delivery' || category.includes('compensation')) {
      allowedActions.push('compensate');
      suggestedActions.unshift('compensate');
    }
  }

  return {
    version: 'support-case-policy.v1',
    allowedActions: [...new Set(allowedActions)],
    suggestedActions: [...new Set(suggestedActions)],
    financialActions: allowedActions.filter((action) => action === 'refund' || action === 'compensate'),
    financialActionsRequireTotp: true,
    reason: canUseFinancialPath
      ? 'Financial action is enabled by service, market, paid state and case category.'
      : 'Financial action is withheld until service, market, payment and case state are eligible.',
  };
};

export const isSupportStaffRole = (role: string | undefined) => SUPPORT_STAFF_ROLES.has(normalize(role));

export const isRestrictedSupportReference = (referenceType: string) =>
  referenceType === 'payment' || referenceType === 'proof';

export const canViewRestrictedSupportData = (role: string | undefined) =>
  ['super_admin', 'ops_security', 'finance_admin', 'finance'].includes(normalize(role));
