import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  recordAuthFailure,
  recordAuthSuccess,
  resetInMemoryAuthProtectionForTests,
} from './bruteForceProtection';

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
});
