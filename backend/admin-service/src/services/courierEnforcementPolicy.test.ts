import {
  CourierEnforcementPolicyError,
  courierEnforcementDisplayReason,
  normalizeCourierEnforcementInput,
} from './courierEnforcementPolicy';

describe('courier enforcement policy', () => {
  it('requires an explicit target and effective period contract', () => {
    const input = normalizeCourierEnforcementInput({
      type: 'suspension',
      scope: 'market',
      marketCode: 'ID-JKT',
      reasonCategory: 'safety',
      reasonDetail: 'Review keselamatan diperlukan sebelum akses dilanjutkan.',
      effectiveUntil: '2026-10-01T00:00:00.000Z',
    });

    expect(input.scope).toBe('market');
    expect(input.marketCode).toBe('id-jkt');
    expect(input.safeJobPolicy).toBe('allow_active_job_completion');
    expect(input.effectiveUntil?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rejects invalid targets and dates instead of silently broadening enforcement', () => {
    expect(() => normalizeCourierEnforcementInput({
      type: 'suspension',
      scope: 'market',
      reasonCategory: 'quality',
      reasonDetail: 'Alasan review kualitas minimal sepuluh karakter.',
    })).toThrow(CourierEnforcementPolicyError);

    expect(() => normalizeCourierEnforcementInput({
      type: 'restriction',
      scope: 'account',
      reasonCategory: 'quality',
      reasonDetail: 'Alasan review kualitas minimal sepuluh karakter.',
      effectiveFrom: '2026-10-02T00:00:00.000Z',
      effectiveUntil: '2026-10-01T00:00:00.000Z',
    })).toThrow('effective_until must be after effective_from');
  });

  it('hides sensitive detail while preserving an actionable reason category', () => {
    expect(courierEnforcementDisplayReason({
      reason_category: 'fraud_integrity',
      courier_message: 'internal case detail',
      disclosure_level: 'security_restricted',
    })).toEqual(expect.objectContaining({
      reason_category: 'fraud_integrity',
      disclosure_level: 'security_restricted',
      actionable_reason: expect.stringContaining('pemeriksaan keamanan'),
    }));
  });
});

