import { canViewerSeeSensitiveSafetyData, contactAccessExpiry, safetyCenterPolicy, safetySlaDueAt } from './safetyIncidentPolicy';

describe('safety incident policy', () => {
  it('keeps active safety entry available and returns honest SOS fallback', () => {
    const policy = safetyCenterPolicy({ sosConfigured: false });
    expect(policy.activeOrderReachable).toBe(true);
    expect(policy.sos.status).toBe('fallback');
    expect(policy.sos.consequence).toContain('no response is claimed');
    expect(policy.share.mutation).toBe(false);
  });

  it('uses severity SLA and bounded contact expiry', () => {
    const created = new Date('2026-09-12T00:00:00.000Z');
    expect(safetySlaDueAt('CRITICAL', created).toISOString()).toBe('2026-09-12T00:01:00.000Z');
    expect(contactAccessExpiry(created, 99999).toISOString()).toBe('2026-09-13T00:00:00.000Z');
  });

  it('requires both sensitive role and elevated policy to reveal exact data', () => {
    expect(canViewerSeeSensitiveSafetyData('cs_agent', true)).toBe(false);
    expect(canViewerSeeSensitiveSafetyData('ops_security', false)).toBe(false);
    expect(canViewerSeeSensitiveSafetyData('ops_security', true)).toBe(true);
  });
});
