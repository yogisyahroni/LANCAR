export type SafetySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SafetyViewerRole = 'customer' | 'courier' | 'cs_agent' | 'ops_admin' | 'ops_security' | 'super_admin';

export const SAFETY_SLA_MINUTES: Record<SafetySeverity, number> = {
  LOW: 240,
  MEDIUM: 30,
  HIGH: 5,
  CRITICAL: 1,
};

export type SafetyCenterPolicy = {
  activeOrderReachable: boolean;
  actions: Array<'share_service' | 'emergency_contact' | 'report_safety' | 'contact_safety' | 'sos'>;
  sos: { configured: boolean; status: 'available' | 'fallback'; consequence: string };
  share: { minimumData: string[]; ttlMinutes: number; revocable: boolean; mutation: false };
};

export const safetyCenterPolicy = (input: { sosConfigured: boolean; shareTtlMinutes?: number }): SafetyCenterPolicy => ({
  activeOrderReachable: true,
  actions: ['share_service', 'emergency_contact', 'report_safety', 'contact_safety', 'sos'],
  sos: {
    configured: input.sosConfigured,
    status: input.sosConfigured ? 'available' : 'fallback',
    consequence: input.sosConfigured
      ? 'Creates an incident and sends it to the configured market escalation path.'
      : 'Creates an incident and shows the approved local emergency/support instructions; no response is claimed.',
  },
  share: {
    minimumData: ['service status', 'coarse location', 'last update time', 'support contact path'],
    ttlMinutes: Math.min(Math.max(Math.floor(input.shareTtlMinutes || 360), 15), 1440),
    revocable: true,
    mutation: false,
  },
});

export const safetySlaDueAt = (severity: SafetySeverity, createdAt: Date): Date =>
  new Date(createdAt.getTime() + SAFETY_SLA_MINUTES[severity] * 60_000);

export const canViewerSeeSensitiveSafetyData = (role: SafetyViewerRole, revealedByElevatedPolicy: boolean): boolean =>
  ['ops_security', 'super_admin'].includes(role) && revealedByElevatedPolicy;

export const contactAccessExpiry = (serviceEndedAt: Date, recoveryWindowMinutes = 30): Date =>
  new Date(serviceEndedAt.getTime() + Math.min(Math.max(Math.floor(recoveryWindowMinutes), 0), 24 * 60) * 60_000);

export const publicShareRateLimit = { windowSeconds: 60, maxRequests: 30 } as const;
