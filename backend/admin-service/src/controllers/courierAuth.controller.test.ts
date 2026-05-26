import { db } from '../db';
import { isFeatureFlagEnabled } from '../services/featureFlags';
import { loginCourier, verifyCourierLoginOtp } from './courierAuth.controller';

process.env.JWT_SECRET = 'test-jwt-secret-for-courier-auth-32';

jest.mock('../db', () => ({
  db: {
    query: jest.fn(),
  },
  readDb: {
    query: jest.fn(),
  },
}));

jest.mock('../notifications', () => ({
  createNotification: jest.fn(),
}));

jest.mock('../services/featureFlags', () => ({
  isFeatureFlagEnabled: jest.fn(),
}));

jest.mock('../services/payoutRiskEngine', () => ({
  evaluateCourierPayoutRisk: jest.fn(),
}));

jest.mock('../services/payoutStatusPolicy', () => ({
  decoratePayoutRequest: jest.fn(),
  payoutMobileMessage: jest.fn(),
}));

jest.mock('../utils/payoutObservability', () => ({
  evaluatePayoutAlerts: jest.fn(),
  writePayoutAuditEvent: jest.fn(),
}));

jest.mock('../services/onDemandRealtime', () => ({
  ON_DEMAND_REALTIME_EVENTS: {},
  emitOnDemandRealtime: jest.fn(),
}));

jest.mock('../services/realtimeObservability', () => ({
  evaluateOnDemandRealtimeAlerts: jest.fn(),
}));

jest.mock('../services/mapsProviderConfig', () => ({
  buildMapsRouteEtaSnapshot: jest.fn(),
}));

const courierRow = {
  id: 'courier-1',
  full_name: 'Kurir Satu',
  email: 'courier@example.test',
  phone_number: '081234567890',
  status: 'active',
  pin_hash: 'secure-pin',
  vehicle_type: 'motorcycle',
  photo_url: null,
};

const makeResponse = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const mockCourierQueryFlow = (trusted: boolean, courierOverride: Partial<typeof courierRow> = {}) => {
  (db.query as jest.Mock).mockImplementation(async (query: string) => {
    if (query.includes('FROM users u')) {
      return { rows: [{ ...courierRow, ...courierOverride }] };
    }

    if (query.includes('SELECT EXISTS')) {
      return { rows: [{ trusted }] };
    }

    if (
      query.includes('INSERT INTO user_sessions') ||
      query.includes('INSERT INTO auth_trusted_devices') ||
      query.includes('UPDATE auth_trusted_devices') ||
      query.includes('INSERT INTO otp_logs')
    ) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in courier auth test: ${query}`);
  });
};

describe('courier login OTP feature flag', () => {
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    consoleInfoSpy.mockRestore();
  });

  it('allows development login on a new device when courier OTP is disabled by admin flag', async () => {
    (isFeatureFlagEnabled as jest.Mock).mockResolvedValue(false);
    mockCourierQueryFlow(false);

    const req: any = {
      body: {
        username: 'courier@example.test',
        password: 'secure-pin',
        device_id: 'dev-device-1',
        device_info: { model: 'Pixel Dev' },
      },
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
    };
    const res = makeResponse();

    await loginCourier(req, res);

    expect(isFeatureFlagEnabled).toHaveBeenCalledWith('courier_login_otp_required', false);
    expect(db.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO otp_logs'), expect.anything());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        courier_id: 'courier-1',
        requires_otp: false,
        otp_policy: 'disabled_by_feature_flag',
      }),
    }));
  });

  it('allows seeded local courier credentials only when the development seed PIN is configured', async () => {
    const previousSeedPin = process.env.DEV_SEEDED_COURIER_PIN;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.DEV_SEEDED_COURIER_PIN = 'kurir123';
    process.env.NODE_ENV = 'test';

    try {
      (isFeatureFlagEnabled as jest.Mock).mockResolvedValue(false);
      mockCourierQueryFlow(false, { pin_hash: 'hashed_pin' });

      const req: any = {
        body: {
          username: 'courier@example.test',
          password: 'kurir123',
          device_id: 'dev-seed-device-1',
          device_info: { model: 'Pixel Seed' },
        },
        headers: { 'user-agent': 'jest' },
        ip: '127.0.0.1',
      };
      const res = makeResponse();

      await loginCourier(req, res);

      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          courier_id: 'courier-1',
          requires_otp: false,
        }),
      }));
    } finally {
      if (previousSeedPin === undefined) {
        delete process.env.DEV_SEEDED_COURIER_PIN;
      } else {
        process.env.DEV_SEEDED_COURIER_PIN = previousSeedPin;
      }

      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it('keeps OTP required for new devices when the production-safe flag is enabled', async () => {
    (isFeatureFlagEnabled as jest.Mock).mockResolvedValue(true);
    mockCourierQueryFlow(false);

    const req: any = {
      body: {
        username: 'courier@example.test',
        password: 'secure-pin',
        device_id: 'prod-device-1',
      },
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
    };
    const res = makeResponse();

    await loginCourier(req, res);

    const otpInsertCall = (db.query as jest.Mock).mock.calls.find(([query]) =>
      String(query).includes('INSERT INTO otp_logs')
    );
    expect(otpInsertCall).toBeTruthy();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        requires_otp: true,
        otp_reason: 'new_device',
      }),
    }));

    const insertedOtpCode = otpInsertCall?.[1]?.[1];
    const loggedMessages = consoleInfoSpy.mock.calls.flat().join('\n');
    expect(loggedMessages).not.toContain(String(insertedOtpCode));
    expect(loggedMessages).not.toContain('courier@example.test');
  });

  it('does not accept legacy hardcoded OTP bypass codes', async () => {
    (db.query as jest.Mock).mockImplementation(async (query: string) => {
      if (query.includes('FROM users u')) {
        return { rows: [courierRow] };
      }

      if (query.includes('FROM otp_logs')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected query in courier OTP test: ${query}`);
    });

    const req: any = {
      body: {
        username: 'courier@example.test',
        code: '123456',
        device_id: 'prod-device-2',
      },
      headers: { 'user-agent': 'jest' },
      ip: '127.0.0.1',
    };
    const res = makeResponse();

    await verifyCourierLoginOtp(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'ERR_INVALID_OTP',
    }));
  });
});
