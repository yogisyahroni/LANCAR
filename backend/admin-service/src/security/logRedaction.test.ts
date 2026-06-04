import { redactForLog, redactString } from './logRedaction';

describe('log redaction', () => {
  it('redacts sensitive object keys and common credential patterns', () => {
    const testJwt = [
      'eyJhbGciOiJIUzI1NiJ9',
      'eyJzdWIiOiIxMjM0In0',
      'signaturepart',
    ].join('.');
    const redacted = redactForLog({
      authorization: `Bearer ${testJwt}`,
      fcmToken: 'fcm-token-value',
      customerEmail: 'andri.pratama@tembus.id',
      customerPhone: '6281211112222',
      nested: {
        apiKey: `AI${'za'}abcdefghijklmnopqrstuvwxyz123456`,
        message: 'Send to dimas.delivery@tembus.id from 6281233334444',
      },
    }) as Record<string, unknown>;

    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.fcmToken).toBe('[REDACTED]');
    expect(redacted.customerEmail).toBe('an***@tembus.id');
    expect(redacted.customerPhone).toBe('628***222');
    expect((redacted.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
    expect((redacted.nested as Record<string, unknown>).message).toBe('Send to di***@tembus.id from 628***444');
  });

  it('redacts strings without leaking bearer tokens, jwt, card numbers, or url credentials', () => {
    const redacted = redactString(
      'Bearer abcdefghijklmnopqrstuvwxyz123456 jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature ' +
      'card 4111 1111 1111 1111 url postgres://tembus:secret@db:5432/tembus'
    );

    expect(redacted).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(redacted).not.toContain('4111 1111 1111 1111');
    expect(redacted).toContain('postgres://[REDACTED]@db:5432/tembus');
  });

  it('redacts error messages and stack traces', () => {
    const error = new Error('Failed user andri.pratama@tembus.id token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature');
    error.stack = 'stack 6281211112222 at handler';

    const redacted = redactForLog(error) as Record<string, string>;

    expect(redacted.message).toContain('an***@tembus.id');
    expect(redacted.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(redacted.stack).toContain('628***222');
  });

  it('keeps safe observability IDs and redacts unsafe trace/log metadata', () => {
    const redacted = redactForLog({
      request_id: 'tmb-safe-request-123',
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      span_id: '00f067aa0ba902b7',
      authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
      cookie: 'customer_session=secret-session-value',
      request_body: { password: 'Namakamu766!!', otp: '123456' },
      response_body: { token: 'secret-token-value' },
    }) as Record<string, unknown>;

    expect(redacted.request_id).toBe('tmb-safe-request-123');
    expect(redacted.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(redacted.span_id).toBe('00f067aa0ba902b7');
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.cookie).toBe('[REDACTED]');
    expect(redacted.request_body).toBe('[REDACTED]');
    expect(redacted.response_body).toBe('[REDACTED]');
  });
});
