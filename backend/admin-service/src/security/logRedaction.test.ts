import { installConsoleRedaction, redactForLog, redactString, securityLog, writeStructuredLog } from './logRedaction';

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

  it('handles primitive, array, invalid observability, and circular values', () => {
    expect(redactForLog(42)).toBe(42);
    expect(redactForLog(true)).toBe(true);
    expect(redactForLog(null)).toBeNull();
    expect(redactForLog(undefined)).toBe('undefined');
    expect(redactForLog(Symbol('value'))).toBe('Symbol(value)');
    expect(redactForLog(['hello@tembus.id', { trace_id: 'unsafe trace id' }])).toEqual([
      'he***@tembus.id',
      { trace_id: '[REDACTED]' },
    ]);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(redactForLog(circular)).toEqual({ self: '[Circular]' });
    expect(redactForLog({ request_id: 123, span_id: 'not-a-span' })).toEqual({
      request_id: '[REDACTED]',
      span_id: '[REDACTED]',
    });
  });

  it('writes structured logs through each public logging entry point', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env.SERVICE_NAME = 'admin-test';

    writeStructuredLog('info', 'safe user@tembus.id', { token: 'secret' });
    securityLog.warn('warning');
    securityLog.error('error');

    expect(stdout).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(String(stdout.mock.calls[0][0])).toContain('admin-test');
    expect(String(stdout.mock.calls[0][0])).toContain('[REDACTED]');
    delete process.env.SERVICE_NAME;
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('installs console redaction once and routes console calls to structured output', () => {
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    installConsoleRedaction();
    installConsoleRedaction();
    console.log('credential user@tembus.id', { password: 'secret' });
    expect(stdout).toHaveBeenCalled();
    expect(String(stdout.mock.calls.at(-1)?.[0])).toContain('[REDACTED]');
    stdout.mockRestore();
  });
});
