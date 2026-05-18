import { decoratePayoutRequest, payoutMobileMessage, payoutRiskAction, payoutStatusLabel } from './payoutStatusPolicy';

describe('payout status policy', () => {
  it('labels automatic approval, manual review, and blocked-by-risk states', () => {
    expect(payoutStatusLabel('requested')).toBe('Dalam pemeriksaan otomatis');
    expect(payoutStatusLabel('approved_auto')).toBe('Diproses');
    expect(payoutStatusLabel('manual_review')).toBe('Butuh review');
    expect(payoutStatusLabel('blocked')).toBe('Ditolak');
  });

  it('maps risk actions for admin operations', () => {
    expect(payoutRiskAction('approved_auto', 'auto_approved')).toBe('auto_approved');
    expect(payoutRiskAction('risk_hold', 'manual_review')).toBe('needs_review');
    expect(payoutRiskAction('blocked', 'blocked')).toBe('blocked_by_risk');
  });

  it('decorates payout request rows with enterprise flags', () => {
    const decorated = decoratePayoutRequest({ status: 'manual_review', risk_decision: 'manual_review' });

    expect(decorated.status_label).toBe('Butuh review');
    expect(decorated.status_message).toBe('Sedang diverifikasi oleh tim operasional.');
    expect(decorated.risk_action).toBe('needs_review');
    expect(decorated.requires_manual_review).toBe(true);
    expect(decorated.auto_approved).toBe(false);
  });

  it('returns courier-safe mobile messages', () => {
    expect(payoutMobileMessage('requested')).toContain('dicek otomatis');
    expect(payoutMobileMessage('approved_auto')).toContain('diproses ke rekening');
    expect(payoutMobileMessage('manual_review')).toBe('Sedang diverifikasi oleh tim operasional.');
    expect(payoutMobileMessage('blocked')).not.toContain('keamanan');
    expect(payoutMobileMessage('failed')).toContain('Saldo tetap tercatat');
  });
});
