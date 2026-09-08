import {
  buildCanonicalEventMetadata,
  canonicalEventHeaders,
  validateCanonicalEventInput,
} from './canonicalEvent';

describe('canonical event metadata', () => {
  it('derives complete metadata without persisting raw actor/header values', () => {
    const metadata = buildCanonicalEventMetadata({
      aggregateType: 'order',
      aggregateId: 'order-123',
      eventType: 'order.created',
      headers: {
        correlation_id: 'corr-123',
        trace_id: 'trace-123',
        idempotency_key: 'retry-key',
        customer_id: 'raw-customer-id',
      },
      payload: { market_code: 'id-jk' },
    });

    expect(metadata.schemaVersion).toBe(1);
    expect(metadata.marketCode).toBe('id-jk');
    expect(metadata.actorPseudonymousId).toBe('system');
    expect(metadata.entityId).toBe('order-123');
    expect(metadata.correlationId).toBe('corr-123');
    expect(metadata.traceId).toBe('trace-123');
    expect(metadata.dedupeKey).toMatch(/^[a-f0-9]{64}$/);
    expect(canonicalEventHeaders({ idempotency_key: 'secret', customer_id: 'raw', source: 'order-service' })).toEqual({
      source: 'order-service',
    });
  });

  it('rejects a raw actor identity and invalid event type', () => {
    expect(() => validateCanonicalEventInput({
      aggregateType: 'order',
      eventType: 'order created',
      actorPseudonymousId: 'customer-123',
    })).toThrow();
  });
});
