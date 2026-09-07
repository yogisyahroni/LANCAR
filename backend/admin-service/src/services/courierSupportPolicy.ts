export const COURIER_SUPPORT_QUEUES = [
  'safety_emergency',
  'safety_review',
  'active_job_operations',
  'general_operations',
] as const;

export type CourierSupportQueue = typeof COURIER_SUPPORT_QUEUES[number];
export type CourierSupportReportedParty = 'merchant' | 'customer' | 'location' | 'service' | 'other';

export const COURIER_SUPPORT_REPORTED_PARTIES: CourierSupportReportedParty[] = [
  'merchant',
  'customer',
  'location',
  'service',
  'other',
];

export const COURIER_SUPPORT_ISSUE_CODES = [
  'merchant_unavailable',
  'merchant_refused',
  'recipient_unavailable',
  'address_not_found',
  'route_issue',
  'package_issue',
  'service_unavailable',
  'operational_assist',
  'failed_delivery',
  'return_required',
  'road_incident',
  'prohibited_goods',
  'general_support',
] as const;

export type CourierSupportIssueCode = typeof COURIER_SUPPORT_ISSUE_CODES[number];

export type CourierSupportIssueInput = {
  eventType: string;
  reasonCode?: unknown;
  severity: string;
  orderId?: string | null;
  serviceCode?: unknown;
  reportedParty?: unknown;
  hasActiveJob: boolean;
  conversationId?: string | null;
  disputeId?: unknown;
};

export type CourierSupportRouting = {
  queueCode: CourierSupportQueue;
  queueKind: 'safety' | 'operations';
  priority: 'critical' | 'high' | 'normal';
  activeJobHelp: boolean;
  supportedActions: string[];
};

export type CourierSupportReferences = {
  orderId: string | null;
  serviceCode: string | null;
  conversationId: string | null;
  disputeId: string | null;
  evidence: Array<{ kind: 'photo'; url: string | null; checksum_sha256: string | null }>;
  locationCaptured: boolean;
};

export class CourierSupportPolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CourierSupportPolicyError';
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeText = (value: unknown, maxLength: number): string | null => {
  const normalized = String(value || '').trim().replace(/[^A-Za-z0-9_:.\-/]/g, '_').slice(0, maxLength);
  return normalized || null;
};

export const reportedPartyForIssue = (issueCode: string, eventType: string, pickupPhase = false): CourierSupportReportedParty => {
  if (issueCode.startsWith('merchant_') || (pickupPhase && issueCode === 'package_issue')) return 'merchant';
  if (issueCode === 'recipient_unavailable') return 'customer';
  if (['address_not_found', 'route_issue'].includes(issueCode)) return 'location';
  if (['package_issue', 'service_unavailable', 'operational_assist', 'failed_delivery', 'return_required'].includes(issueCode)) return 'service';
  if (eventType === 'report_sender') return 'merchant';
  if (eventType === 'report_recipient') return 'customer';
  return 'other';
};

export const routeCourierSupportIssue = (input: CourierSupportIssueInput): CourierSupportRouting => {
  const eventType = normalizeText(input.eventType, 40) || 'support_request';
  const severity = ['low', 'medium', 'high', 'critical'].includes(input.severity) ? input.severity : 'medium';
  const safetyEmergency = eventType === 'sos' || eventType === 'road_incident' || severity === 'critical';
  const safetyReview = eventType === 'prohibited_goods' || eventType === 'report_sender' || eventType === 'report_recipient';
  const activeJobHelp = Boolean(input.hasActiveJob && input.orderId);

  if (safetyEmergency) {
    return {
      queueCode: 'safety_emergency',
      queueKind: 'safety',
      priority: 'critical',
      activeJobHelp,
      supportedActions: ['safety_escalation', ...(activeJobHelp ? ['reassign', 'cancel'] : [])],
    };
  }
  if (safetyReview) {
    return {
      queueCode: 'safety_review',
      queueKind: 'safety',
      priority: 'high',
      activeJobHelp,
      supportedActions: ['safety_review', ...(activeJobHelp ? ['reassign'] : [])],
    };
  }
  if (activeJobHelp) {
    return {
      queueCode: 'active_job_operations',
      queueKind: 'operations',
      priority: severity === 'high' ? 'high' : 'normal',
      activeJobHelp: true,
      supportedActions: ['chat', 'reassign', 'cancel', 'compensation'],
    };
  }
  return {
    queueCode: 'general_operations',
    queueKind: 'operations',
    priority: severity === 'high' ? 'high' : 'normal',
    activeJobHelp: false,
    supportedActions: ['chat', 'compensation'],
  };
};

export const normalizeCourierSupportIssue = (input: CourierSupportIssueInput) => {
  const eventType = normalizeText(input.eventType, 40) || 'support_request';
  const issueCode = normalizeText(input.reasonCode, 64) || 'general_support';
  const reportedParty = String(input.reportedParty || '').trim().toLowerCase();
  if (reportedParty && !COURIER_SUPPORT_REPORTED_PARTIES.includes(reportedParty as CourierSupportReportedParty)) {
    throw new CourierSupportPolicyError('ERR_INVALID_SUPPORT_TARGET', 'Target laporan support tidak valid.');
  }
  const normalizedParty = COURIER_SUPPORT_REPORTED_PARTIES.includes(reportedParty as CourierSupportReportedParty)
    ? reportedParty as CourierSupportReportedParty
    : reportedPartyForIssue(issueCode, eventType);
  const serviceCode = normalizeText(input.serviceCode, 80);
  const conversationId = input.conversationId && uuidPattern.test(String(input.conversationId))
    ? String(input.conversationId)
    : null;
  const disputeId = input.disputeId && uuidPattern.test(String(input.disputeId))
    ? String(input.disputeId)
    : null;

  if (!COURIER_SUPPORT_REPORTED_PARTIES.includes(normalizedParty)) {
    throw new CourierSupportPolicyError('ERR_INVALID_SUPPORT_TARGET', 'Target laporan support tidak valid.');
  }
  if (!/^[a-z0-9_:.\-/]{1,64}$/.test(issueCode)) {
    throw new CourierSupportPolicyError('ERR_INVALID_SUPPORT_ISSUE', 'Kode issue support tidak valid.');
  }
  if (input.conversationId && !conversationId) {
    throw new CourierSupportPolicyError('ERR_INVALID_SUPPORT_REFERENCE', 'Referensi chat tidak valid.');
  }
  if (input.disputeId && !disputeId) {
    throw new CourierSupportPolicyError('ERR_INVALID_SUPPORT_REFERENCE', 'Referensi dispute tidak valid.');
  }

  const routing = routeCourierSupportIssue({ ...input, eventType, reasonCode: issueCode });
  return {
    eventType,
    issueCode,
    reportedParty: normalizedParty,
    serviceCode,
    conversationId,
    disputeId,
    routing,
  };
};

export const buildCourierSupportReferences = (input: {
  orderId?: string | null;
  serviceCode?: string | null;
  conversationId?: string | null;
  disputeId?: string | null;
  photoUrl?: string | null;
  photoChecksum?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}) : CourierSupportReferences => ({
  orderId: input.orderId || null,
  serviceCode: input.serviceCode || null,
  conversationId: input.conversationId || null,
  disputeId: input.disputeId || null,
  evidence: [{ kind: 'photo', url: input.photoUrl || null, checksum_sha256: input.photoChecksum || null }],
  locationCaptured: Number.isFinite(Number(input.latitude)) && Number.isFinite(Number(input.longitude)),
});

export const supportReferencesForRole = (metadata: any, role?: string | null, location?: { latitude?: number | null; longitude?: number | null; accuracy?: number | null }) => {
  const normalizedRole = String(role || '').trim().toLowerCase();
  const privilegedLocation = ['super_admin', 'ops_security'].includes(normalizedRole);
  const operationalEvidence = privilegedLocation || normalizedRole === 'ops_admin';
  const support = metadata?.support || {};
  const references = support.references || {};
  const locationValue = location?.latitude != null && location?.longitude != null
    ? privilegedLocation
      ? { latitude: Number(location.latitude), longitude: Number(location.longitude), accuracy_m: location.accuracy == null ? null : Number(location.accuracy) }
      : { latitude: Number((Math.round(Number(location.latitude) / 0.001) * 0.001).toFixed(3)), longitude: Number((Math.round(Number(location.longitude) / 0.001) * 0.001).toFixed(3)), accuracy_m: null }
    : null;

  return {
    order_id: references.orderId || null,
    service_code: references.serviceCode || null,
    conversation_id: references.conversationId || null,
    dispute_id: references.disputeId || null,
    evidence: operationalEvidence ? references.evidence || [] : (references.evidence || []).map((item: any) => ({ kind: item.kind, available: Boolean(item.url) })),
    location: locationValue,
    location_captured: Boolean(references.locationCaptured),
  };
};

export const courierSupportActionDescriptors = (input: { orderId?: string | null; disputeId?: string | null; eventId?: string | null; role?: string | null; actions: string[] }) => {
  const orderId = input.orderId || ':orderId';
  const eventId = input.eventId || ':id';
  const role = String(input.role || '').trim().toLowerCase();
  const descriptors: Record<string, any> = {
    reassign: { action: 'reassign', domain_api: 'orders.reassign', method: 'POST', endpoint: `/admin/orders/${orderId}/reassign`, available: Boolean(input.orderId) },
    cancel: { action: 'cancel', domain_api: 'orders.force_cancel', method: 'POST', endpoint: `/admin/orders/${orderId}/force-cancel`, available: Boolean(input.orderId) },
    compensation: {
      action: 'compensation',
      domain_api: 'disputes.resolve_refund',
      method: 'PATCH',
      endpoint: input.disputeId ? `/admin/disputes/${input.disputeId}/resolve` : '/admin/disputes/:disputeId/resolve',
      available: Boolean(input.disputeId),
      requires_reference: 'dispute_id',
    },
    chat: { action: 'chat', domain_api: 'order_communication', method: 'POST', endpoint: `/api/v1/mobile/chats/orders/${orderId}/chats`, available: Boolean(input.orderId) },
    safety_escalation: { action: 'safety_escalation', domain_api: 'courier_safety_events', method: 'PATCH', endpoint: `/admin/courier-safety-events/${eventId}`, available: Boolean(input.eventId) },
    safety_review: { action: 'safety_review', domain_api: 'courier_safety_events', method: 'PATCH', endpoint: `/admin/courier-safety-events/${eventId}`, available: Boolean(input.eventId) },
  };
  const allowedByRole: Record<string, string[]> = {
    courier: ['chat'],
    cs_agent: ['reassign', 'chat'],
    ops_security: ['reassign', 'chat', 'safety_escalation', 'safety_review'],
    ops_admin: ['reassign', 'cancel', 'compensation', 'chat', 'safety_escalation', 'safety_review'],
    super_admin: Object.keys(descriptors),
  };
  const allowedActions = role && allowedByRole[role] ? allowedByRole[role] : null;
  return input.actions
    .filter((action) => !allowedActions || allowedActions.includes(action))
    .map((action) => descriptors[action])
    .filter(Boolean);
};
