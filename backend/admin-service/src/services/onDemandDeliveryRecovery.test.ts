import {
  DeliveryRecoveryPolicyError,
  evaluateOnDemandDeliveryRecovery,
} from './onDemandDeliveryRecovery';

describe('on-demand delivery recovery policy', () => {
  const baseInput = {
    serviceCategory: 'on_demand',
    failedDeliveryPolicy: 'must_deliver',
    reasonCode: 'recipient_unavailable',
    hasEvidence: true,
    custodyTransferred: true,
  };

  it('offers retry/contact/support without forcing return-to-sender', () => {
    const decision = evaluateOnDemandDeliveryRecovery(baseInput);

    expect(decision.recoveryOptions).toEqual(['retry', 'contact_receiver', 'support_review']);
    expect(decision.returnToSenderAllowed).toBe(false);
    expect(decision.settlementEligible).toBe(false);
  });

  it('only exposes return-to-sender when explicitly allowed by policy input', () => {
    const decision = evaluateOnDemandDeliveryRecovery({
      ...baseInput,
      returnToSenderAllowed: true,
    });

    expect(decision.recoveryOptions).toContain('return_to_sender');
  });

  it('requires evidence before accepting a failed delivery report', () => {
    expect(() => evaluateOnDemandDeliveryRecovery({ ...baseInput, hasEvidence: false }))
      .toThrow(new DeliveryRecoveryPolicyError(
        'ERR_FAILURE_EVIDENCE_REQUIRED',
        'Foto atau bukti lapangan wajib dilampirkan untuk laporan failed delivery.',
      ));
  });

  it('keeps recipient mismatch on safe contact/support handoff', () => {
    const decision = evaluateOnDemandDeliveryRecovery({
      ...baseInput,
      reasonCode: 'recipient_mismatch',
    });

    expect(decision.recoveryOptions).toEqual(['contact_receiver', 'support_review']);
  });

  it('blocks regular services from using on-demand recovery', () => {
    expect(() => evaluateOnDemandDeliveryRecovery({ ...baseInput, serviceCategory: 'regular' }))
      .toThrow('Recovery policy ini hanya berlaku untuk layanan on-demand.');
  });
});
