import {
  courierSupportActionDescriptors,
  normalizeCourierSupportIssue,
  routeCourierSupportIssue,
  supportReferencesForRole,
} from './courierSupportPolicy';

describe('courier support routing policy', () => {
  it('routes active-job operational help to the operational queue with domain actions', () => {
    const issue = normalizeCourierSupportIssue({
      eventType: 'support_request',
      reasonCode: 'recipient_unavailable',
      severity: 'high',
      orderId: 'order-1',
      serviceCode: 'food_delivery',
      hasActiveJob: true,
    });

    expect(issue.reportedParty).toBe('customer');
    expect(issue.routing.queueCode).toBe('active_job_operations');
    expect(courierSupportActionDescriptors({ orderId: 'order-1', actions: issue.routing.supportedActions }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ action: 'reassign', domain_api: 'orders.reassign' }),
        expect.objectContaining({ action: 'cancel', domain_api: 'orders.force_cancel' }),
        expect.objectContaining({ action: 'compensation', domain_api: 'disputes.resolve_refund' }),
      ]));
  });

  it('routes critical incidents to safety and redacts evidence for ordinary support roles', () => {
    expect(routeCourierSupportIssue({
      eventType: 'sos', severity: 'critical', orderId: 'order-1', hasActiveJob: true,
    }).queueCode).toBe('safety_emergency');

    const refs = supportReferencesForRole({
      support: {
        references: {
          orderId: 'order-1',
          evidence: [{ kind: 'photo', url: '/private/evidence.jpg', checksum_sha256: 'hash' }],
          locationCaptured: true,
        },
      },
    },
      'cs_agent',
      { latitude: -6.2, longitude: 106.8, accuracy: 5 },
    );

    expect(refs.evidence).toEqual([{ kind: 'photo', available: true }]);
    expect(refs.location).toEqual({ latitude: -6.2, longitude: 106.8, accuracy_m: null });
  });

  it('keeps admin actions role-scoped and requires references before execution', () => {
    const csActions = courierSupportActionDescriptors({
      orderId: 'order-1',
      role: 'cs_agent',
      actions: ['reassign', 'cancel', 'compensation', 'chat'],
    });
    expect(csActions.map((action) => action.action)).toEqual(['reassign', 'chat']);

    const safetyActions = courierSupportActionDescriptors({
      orderId: 'order-1',
      eventId: 'event-1',
      role: 'ops_security',
      actions: ['safety_escalation'],
    });
    expect(safetyActions[0]).toEqual(expect.objectContaining({
      endpoint: '/admin/courier-safety-events/event-1',
      available: true,
    }));
    expect(courierSupportActionDescriptors({ actions: ['compensation'], role: 'super_admin' })[0]).toEqual(expect.objectContaining({
      available: false,
      requires_reference: 'dispute_id',
    }));
  });

  it('rejects an explicitly invalid reported party instead of silently rerouting it', () => {
    expect(() => normalizeCourierSupportIssue({
      eventType: 'support_request',
      reasonCode: 'general_support',
      severity: 'medium',
      reportedParty: 'unknown_party',
      hasActiveJob: false,
    })).toThrow('Target laporan support tidak valid.');
  });
});
