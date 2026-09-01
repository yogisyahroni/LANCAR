import crypto from 'crypto';
import {
  hmacSha256Hex,
  insertWebhookAuditEvent,
  requestIp,
  requestUserAgent,
  resolveRawBody,
  sha256Hex,
  timingSafeEqualHex,
  updateWebhookAuditEvent,
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
    expect(timingSafeEqualHex('', signature)).toBe(false);
    expect(timingSafeEqualHex(signature, '')).toBe(false);
    expect(timingSafeEqualHex(signature, `${signature}00`)).toBe(false);
  });

  it('rejects incomplete or non-string Midtrans payload fields', () => {
    expect(verifyMidtransSignature({}, 'server-key')).toBe(false);
    expect(verifyMidtransSignature({ order_id: 123, status_code: '200', gross_amount: '1', signature_key: 'x' }, 'server-key')).toBe(false);
    expect(verifyMidtransSignature({ order_id: '1', status_code: '200', gross_amount: '1', signature_key: 'x' }, '')).toBe(false);
  });

  it('resolves raw request metadata and applies safe fallbacks', () => {
    const rawBody = Buffer.from('{"raw":true}');
    expect(resolveRawBody({ rawBody, body: { ignored: true } } as any)).toBe(rawBody);
    expect(resolveRawBody({ body: { ok: true } } as any).toString()).toBe('{"ok":true}');
    expect(resolveRawBody({ body: null } as any).toString()).toBe('{}');
    expect(requestIp({ headers: { 'x-forwarded-for': ' 10.0.0.1, 10.0.0.2' } } as any)).toBe('10.0.0.1');
    expect(requestIp({ headers: {}, ip: '10.0.0.3' } as any)).toBe('10.0.0.3');
    expect(requestIp(undefined)).toBeNull();
    expect(requestUserAgent({ headers: { 'user-agent': 'agent' } } as any)).toBe('agent');
    expect(requestUserAgent(undefined)).toBeNull();
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

  it('stores defaults and updates a processed audit event', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'audit-2' }] });
    await insertWebhookAuditEvent(
      { query },
      { headers: {} } as any,
      {
        providerName: 'xendit',
        providerEventId: null,
        verificationStatus: 'invalid_payload',
        payload: undefined,
        rawBody: Buffer.from('{}'),
      },
    );
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining([null, 'received', null, null, null]));

    await updateWebhookAuditEvent({ query }, 'audit-2', 'processed', 'OK');
    await updateWebhookAuditEvent({ query }, null, 'failed');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(['audit-2', 'processed', 'OK']);
  });
});
