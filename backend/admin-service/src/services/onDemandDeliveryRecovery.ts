export const ON_DEMAND_FAILURE_REASON_CODES = [
  'recipient_unavailable',
  'address_not_found',
  'package_issue',
  'recipient_mismatch',
  'lost_package',
  'damaged_package',
  'operational_assist',
] as const;

export type OnDemandFailureReasonCode = typeof ON_DEMAND_FAILURE_REASON_CODES[number];
export type DeliveryRecoveryOption =
  | 'retry'
  | 'contact_receiver'
  | 'return_to_sender'
  | 'cancel'
  | 'support_review';

export type DeliveryRecoveryInput = {
  serviceCategory: string;
  failedDeliveryPolicy: string;
  reasonCode: unknown;
  hasEvidence: boolean;
  custodyTransferred: boolean;
  returnToSenderAllowed?: boolean;
  cancelAllowed?: boolean;
};

export type DeliveryRecoveryDecision = {
  reasonCode: OnDemandFailureReasonCode;
  recoveryOptions: DeliveryRecoveryOption[];
  evidenceRequired: true;
  evidencePresent: boolean;
  custodyTransferred: boolean;
  settlementEligible: false;
  returnToSenderAllowed: boolean;
};

export class DeliveryRecoveryPolicyError extends Error {
  constructor(
    public readonly code:
      | 'ERR_INVALID_SERVICE_CATEGORY'
      | 'ERR_INVALID_FAILURE_REASON'
      | 'ERR_FAILURE_EVIDENCE_REQUIRED'
      | 'ERR_INVALID_RECOVERY_POLICY',
    message: string,
  ) {
    super(message);
    this.name = 'DeliveryRecoveryPolicyError';
  }
}

const BASE_OPTIONS_BY_REASON: Record<OnDemandFailureReasonCode, DeliveryRecoveryOption[]> = {
  recipient_unavailable: ['retry', 'contact_receiver', 'support_review'],
  address_not_found: ['retry', 'contact_receiver', 'support_review'],
  package_issue: ['support_review', 'contact_receiver'],
  recipient_mismatch: ['contact_receiver', 'support_review'],
  lost_package: ['support_review'],
  damaged_package: ['support_review'],
  operational_assist: ['contact_receiver', 'support_review'],
};

const normalizeReasonCode = (value: unknown): OnDemandFailureReasonCode | null => {
  const normalized = String(value || '').trim().toLowerCase();
  return (ON_DEMAND_FAILURE_REASON_CODES as readonly string[]).includes(normalized)
    ? normalized as OnDemandFailureReasonCode
    : null;
};

/**
 * The on-demand contract deliberately keeps recovery as an explicit decision.
 * A failed attempt is evidence for Ops review; it is not a terminal order
 * state and never implies return-to-sender by itself.
 */
export const evaluateOnDemandDeliveryRecovery = (
  input: DeliveryRecoveryInput,
): DeliveryRecoveryDecision => {
  const serviceCategory = String(input.serviceCategory || '').trim().toLowerCase();
  if (serviceCategory !== 'on_demand') {
    throw new DeliveryRecoveryPolicyError(
      'ERR_INVALID_SERVICE_CATEGORY',
      'Recovery policy ini hanya berlaku untuk layanan on-demand.',
    );
  }

  const reasonCode = normalizeReasonCode(input.reasonCode);
  if (!reasonCode) {
    throw new DeliveryRecoveryPolicyError(
      'ERR_INVALID_FAILURE_REASON',
      'Alasan failed delivery wajib menggunakan reason code yang terdaftar.',
    );
  }

  if (!input.hasEvidence) {
    throw new DeliveryRecoveryPolicyError(
      'ERR_FAILURE_EVIDENCE_REQUIRED',
      'Foto atau bukti lapangan wajib dilampirkan untuk laporan failed delivery.',
    );
  }

  const policy = String(input.failedDeliveryPolicy || 'must_deliver').trim().toLowerCase();
  if (!['must_deliver', 'admin_review'].includes(policy)) {
    throw new DeliveryRecoveryPolicyError(
      'ERR_INVALID_RECOVERY_POLICY',
      'Policy recovery on-demand tidak dikonfigurasi dengan aman.',
    );
  }

  const returnToSenderAllowed = input.returnToSenderAllowed === true;
  const options = [...BASE_OPTIONS_BY_REASON[reasonCode]];
  if (policy === 'admin_review') {
    options.splice(0, options.length, 'support_review');
  }
  if (returnToSenderAllowed && !options.includes('return_to_sender')) {
    options.push('return_to_sender');
  }
  if (input.cancelAllowed === true && !input.custodyTransferred && !options.includes('cancel')) {
    options.push('cancel');
  }

  return {
    reasonCode,
    recoveryOptions: options,
    evidenceRequired: true,
    evidencePresent: input.hasEvidence,
    custodyTransferred: input.custodyTransferred,
    settlementEligible: false,
    returnToSenderAllowed,
  };
};
