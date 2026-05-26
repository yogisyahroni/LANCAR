import crypto from 'crypto';
import {
  hmacSha256Hex,
  insertWebhookAuditEvent,
  sha256Hex,
  timingSafeEqualHex,
  verifyMidtransSignature,
} from './webhookSecurity';

describe('webhookSecurity', () => {
  it('verifies Midtrans SHA512 signatures using constant-time hex comparison', () => {
    const serverKey = 'midtrans-server-key';
    const payload = {
      order_id: 'ORDER-1',
      status_code: '200',
      gross_amount: '15000.00',
      signature_key: crypto
        .createHash('sha512')
        .update('ORDER-120015000.00midtrans-server-key')
        .digest('hex'),
    };

    expect(verifyMidtransSignature(payload, serverKey)).toBe(true);
    expect(verifyMidtransSignature({ ...payload, signature_key: payload.signature_key.slice(2) }, serverKey)).toBe(false);
    expect(verifyMidtransSignature({ ...payload, signature_key: '' }, serverKey)).toBe(false);
  });

  it('verifies HMAC signatures with and without sha256 prefix', () => {
    const signature = hmacSha256Hex(Buffer.from('{"event":"paid"}'), 'provider-secret');

    expect(timingSafeEqualHex(signature, signature)).toBe(true);
    expect(timingSafeEqualHex(signature, `sha256=${signature}`)).toBe(true);
    expect(timingSafeEqualHex(signature, signature.slice(2))).toBe(false);
    expect(timingSafeEqualHex(signature, 'not-hex')).toBe(false);
  });

  it('inserts valid audit events with partial-conflict duplicate protection', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'audit-1' }] });

    const result = await insertWebhookAuditEvent(
      { query },
      {
        headers: { 'user-agent': 'jest-agent', 'x-forwarded-for': '127.0.0.1' },
      } as any,
      {
        providerName: 'midtrans',
        providerEventId: 'event-1',
        providerReference: 'ORDER-1',
        eventType: 'settlement',
        verificationStatus: 'valid',
        payload: { order_id: 'ORDER-1' },
        rawBody: Buffer.from('{"order_id":"ORDER-1"}'),
        signature: 'abc123',
      },
    );

    expect(result).toEqual({ duplicate: false, id: 'audit-1' });
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (provider_name, provider_event_id) WHERE provider_event_id IS NOT NULL AND verification_status = 'valid'");
    expect(query.mock.calls[0][1]).toContain(sha256Hex(Buffer.from('{"order_id":"ORDER-1"}')));
  });

  it('reports duplicate when a valid provider event already exists', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    const result = await insertWebhookAuditEvent(
      { query },
      undefined,
      {
        providerName: 'midtrans',
        providerEventId: 'event-1',
        verificationStatus: 'valid',
        payload: {},
        rawBody: Buffer.from('{}'),
      },
    );

    expect(result.duplicate).toBe(true);
    expect(result.id).toBeNull();
  });
});
