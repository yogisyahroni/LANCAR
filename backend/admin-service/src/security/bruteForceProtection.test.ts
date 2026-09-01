import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  getRequestIpAddress,
  recordAuthFailure,
  recordAuthSuccess,
  resetInMemoryAuthProtectionForTests,
  sendAuthProtectionError,
} from './bruteForceProtection';

jest.mock('../redis', () => ({
  redis: {
    ttl: jest.fn(),
    exists: jest.fn(),
    pipeline: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

describe('bruteForceProtection', () => {
  beforeEach(() => {
    delete process.env.REDIS_URL;
    process.env.AUTH_BRUTE_FORCE_REQUEST_LIMIT = '100';
    process.env.AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT = '2';
    process.env.AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT = '10';
    process.env.AUTH_BRUTE_FORCE_BASE_LOCKOUT_SECONDS = '60';
    process.env.AUTH_BRUTE_FORCE_MAX_LOCKOUT_SECONDS = '120';
    resetInMemoryAuthProtectionForTests();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.AUTH_BRUTE_FORCE_REQUEST_LIMIT;
    delete process.env.AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT;
    delete process.env.AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT;
    delete process.env.AUTH_BRUTE_FORCE_BASE_LOCKOUT_SECONDS;
    delete process.env.AUTH_BRUTE_FORCE_MAX_LOCKOUT_SECONDS;
    resetInMemoryAuthProtectionForTests();
  });

  it('locks an identifier after repeated failed attempts', async () => {
    await assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'admin@example.test',
      ipAddress: '10.20.30.40',
    });
    await recordAuthFailure({
      scope: 'admin_web_login',
      identifier: 'admin@example.test',
      ipAddress: '10.20.30.40',
      reason: 'invalid_password',
    });
    await assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'admin@example.test',
      ipAddress: '10.20.30.40',
    });
    await recordAuthFailure({
      scope: 'admin_web_login',
      identifier: 'admin@example.test',
      ipAddress: '10.20.30.40',
      reason: 'invalid_password',
    });

    await expect(assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'admin@example.test',
      ipAddress: '10.20.30.40',
    })).rejects.toMatchObject({
      code: 'ERR_ACCOUNT_TEMPORARILY_LOCKED',
      statusCode: 423,
    });
  });

  it('clears identifier failure state after successful authentication', async () => {
    await recordAuthFailure({
      scope: 'courier_otp_verify',
      identifier: 'courier@example.test',
      ipAddress: '10.20.30.41',
      reason: 'invalid_otp',
    });
    await recordAuthFailure({
      scope: 'courier_otp_verify',
      identifier: 'courier@example.test',
      ipAddress: '10.20.30.41',
      reason: 'invalid_otp',
    });

    await expect(assertAuthAttemptAllowed({
      scope: 'courier_otp_verify',
      identifier: 'courier@example.test',
      ipAddress: '10.20.30.41',
    })).rejects.toBeInstanceOf(AuthProtectionError);

    await recordAuthSuccess({
      scope: 'courier_otp_verify',
      identifier: 'courier@example.test',
      ipAddress: '10.20.30.41',
    });

    await expect(assertAuthAttemptAllowed({
      scope: 'courier_otp_verify',
      identifier: 'courier@example.test',
      ipAddress: '10.20.30.41',
    })).resolves.toBeUndefined();
  });

  it('rate limits noisy auth requests by source IP', async () => {
    process.env.AUTH_BRUTE_FORCE_REQUEST_LIMIT = '1';
    resetInMemoryAuthProtectionForTests();

    await assertAuthAttemptAllowed({
      scope: 'courier_login',
      identifier: 'courier@example.test',
      ipAddress: '10.20.30.42',
    });

    await expect(assertAuthAttemptAllowed({
      scope: 'courier_login',
      identifier: 'courier@example.test',
      ipAddress: '10.20.30.42',
    })).rejects.toMatchObject({
      code: 'ERR_AUTH_RATE_LIMIT',
      statusCode: 429,
    });
  });

  it('locks the source IP independently from an identifier', async () => {
    process.env.AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT = '100';
    process.env.AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT = '2';
    resetInMemoryAuthProtectionForTests();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await recordAuthFailure({
        scope: 'password_reset',
        identifier: `user-${attempt}@example.test`,
        ipAddress: '10.20.30.43',
        reason: 'invalid_code',
      });
    }

    await expect(assertAuthAttemptAllowed({
      scope: 'password_reset',
      identifier: 'different@example.test',
      ipAddress: '10.20.30.43',
    })).rejects.toMatchObject({
      code: 'ERR_AUTH_NETWORK_TEMPORARILY_LOCKED',
      statusCode: 429,
    });
  });

  it('serializes an auth protection response with Retry-After', () => {
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const error = new AuthProtectionError('locked', 'ERR_LOCKED', 423, 30);

    sendAuthProtectionError(response, error);

    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(response.status).toHaveBeenCalledWith(423);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'locked',
      code: 'ERR_LOCKED',
    });

    sendAuthProtectionError(response, new AuthProtectionError('rate limited', 'ERR_RATE', 429, 0));
    expect(response.status).toHaveBeenLastCalledWith(429);
  });

  it('resolves the first trusted request IP header and safe fallbacks', () => {
    expect(getRequestIpAddress({ headers: { 'x-forwarded-for': ' 10.0.0.1, 10.0.0.2' } } as any)).toBe('10.0.0.1');
    expect(getRequestIpAddress({ headers: { 'x-real-ip': '10.0.0.3' } } as any)).toBe('10.0.0.3');
    expect(getRequestIpAddress({ headers: {}, ip: '10.0.0.4' } as any)).toBe('10.0.0.4');
    expect(getRequestIpAddress({ headers: {}, socket: { remoteAddress: '10.0.0.5' } } as any)).toBe('10.0.0.5');
    expect(getRequestIpAddress({ headers: {} } as any)).toBe('unknown');
  });

  it('purges expired in-memory counters before incrementing them again', async () => {
    process.env.AUTH_BRUTE_FORCE_MAX_LOCKOUT_SECONDS = '1';
    const realNow = Date.now;
    let currentTime = realNow();
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    await recordAuthFailure({
      scope: 'customer_jwt_exchange',
      identifier: 'expired@example.test',
      ipAddress: '10.20.30.49',
      reason: 'invalid_token',
    });
    currentTime += 2_000;
    await recordAuthFailure({
      scope: 'customer_jwt_exchange',
      identifier: 'expired@example.test',
      ipAddress: '10.20.30.49',
      reason: 'invalid_token',
    });
    jest.restoreAllMocks();
  });

  it('uses safe development and production defaults when policy env is absent', async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedEnvironment = process.env.ENVIRONMENT;
    const policyKeys = [
      'AUTH_BRUTE_FORCE_REQUEST_LIMIT',
      'AUTH_BRUTE_FORCE_REQUEST_WINDOW_SECONDS',
      'AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT',
      'AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT',
      'AUTH_BRUTE_FORCE_BASE_LOCKOUT_SECONDS',
      'AUTH_BRUTE_FORCE_MAX_LOCKOUT_SECONDS',
    ];
    policyKeys.forEach((key) => delete process.env[key]);
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'test';
    await assertAuthAttemptAllowed({ scope: 'customer_jwt_exchange' });

    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://production-defaults.invalid';
    const redis = jest.requireMock('../redis').redis as any;
    redis.exists.mockResolvedValue(0);
    redis.ttl.mockResolvedValue(0);
    redis.pipeline.mockImplementation(() => ({
      incr: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([[null, 1]]),
    }));
    await assertAuthAttemptAllowed({ scope: 'customer_jwt_exchange' });

    if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedNodeEnv;
    if (savedEnvironment === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = savedEnvironment;
  });

  it('uses Redis atomically when configured and preserves production failure semantics', async () => {
    const redis = jest.requireMock('../redis').redis as any;
    process.env.REDIS_URL = 'redis://test.invalid';
    process.env.AUTH_BRUTE_FORCE_IDENTIFIER_FAILURE_LIMIT = '1';
    process.env.AUTH_BRUTE_FORCE_IP_FAILURE_LIMIT = '1';
    redis.exists.mockResolvedValue(0);
    redis.ttl.mockResolvedValue(45);
    redis.pipeline.mockImplementation(() => ({
      incr: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([[null, 1]]),
    }));
    redis.set.mockResolvedValue('OK');
    redis.del.mockResolvedValue(1);

    await assertAuthAttemptAllowed({ scope: 'admin_web_login', identifier: 'redis@example.test', ipAddress: '10.20.30.50' });
    await recordAuthFailure({
      scope: 'admin_web_login',
      identifier: 'redis@example.test',
      ipAddress: '10.20.30.50',
      reason: 'invalid_password',
    });
    await recordAuthSuccess({ scope: 'admin_web_login', identifier: 'redis@example.test', ipAddress: '10.20.30.50' });
    expect(redis.pipeline).toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();

    redis.exists.mockResolvedValue(1);
    redis.ttl.mockResolvedValue(0);
    await expect(assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'redis@example.test',
      ipAddress: '10.20.30.50',
    })).rejects.toMatchObject({ code: 'ERR_ACCOUNT_TEMPORARILY_LOCKED', retryAfterSeconds: 0 });

    redis.exists.mockRejectedValue(new Error('redis unavailable'));
    process.env.ENVIRONMENT = 'production';
    await expect(assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'redis@example.test',
      ipAddress: '10.20.30.50',
    })).rejects.toMatchObject({ code: 'ERR_AUTH_PROTECTION_UNAVAILABLE', statusCode: 503 });

    process.env.ENVIRONMENT = 'test';
    await expect(assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'redis@example.test',
      ipAddress: '10.20.30.50',
    })).resolves.toBeNull();
    delete process.env.ENVIRONMENT;
  });

  it('maps Redis module loading failures to degraded or unavailable behavior', async () => {
    const originalEnvironment = process.env.ENVIRONMENT;
    process.env.REDIS_URL = 'redis://load-failure.invalid';
    process.env.ENVIRONMENT = 'production';

    jest.resetModules();
    jest.doMock('../redis', () => {
      throw new Error('redis module load failed');
    });
    const isolated = require('./bruteForceProtection') as typeof import('./bruteForceProtection');
    await expect(isolated.assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'load-failure@example.test',
      ipAddress: '10.20.30.51',
    })).rejects.toMatchObject({ code: 'ERR_AUTH_PROTECTION_UNAVAILABLE', statusCode: 503 });

    jest.resetModules();
    process.env.ENVIRONMENT = 'test';
    const degraded = require('./bruteForceProtection') as typeof import('./bruteForceProtection');
    await expect(degraded.assertAuthAttemptAllowed({
      scope: 'admin_web_login',
      identifier: 'load-failure@example.test',
      ipAddress: '10.20.30.51',
    })).resolves.toBeUndefined();

    if (originalEnvironment === undefined) delete process.env.ENVIRONMENT;
    else process.env.ENVIRONMENT = originalEnvironment;
    delete process.env.REDIS_URL;
  });
});
