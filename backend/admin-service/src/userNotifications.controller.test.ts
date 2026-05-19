import {
  registerDeviceToken,
  validateDeviceTokenRegistrationInput
} from './controllers/userNotifications.controller';
import { db } from './db';
import { ensureUserDevicesTable } from './notifications';

jest.mock('./db', () => ({
  db: {
    query: jest.fn(),
  },
  readDb: {
    query: jest.fn(),
  },
}));

jest.mock('./notifications', () => ({
  ensureUserDevicesTable: jest.fn().mockResolvedValue(undefined),
}));

const makeResponse = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('mobile notification device token registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates FCM token registration before persistence', () => {
    const token = `${'a'.repeat(100)}:APA91b_${'Z'.repeat(80)}`;

    expect(validateDeviceTokenRegistrationInput({
      fcmToken: token,
      platform: 'Android',
    })).toEqual({
      valid: true,
      error: null,
      token,
      platform: 'android',
    });

    expect(validateDeviceTokenRegistrationInput({
      fcm_token: token,
    })).toEqual({
      valid: true,
      error: null,
      token,
      platform: 'android',
    });

    expect(validateDeviceTokenRegistrationInput({
      fcmToken: 'short',
      platform: 'android',
    })).toEqual(expect.objectContaining({
      valid: false,
      error: 'device_token format is invalid',
    }));

    expect(validateDeviceTokenRegistrationInput({
      fcmToken: token,
      platform: 'desktop',
    })).toEqual(expect.objectContaining({
      valid: false,
      error: 'platform must be one of android, ios, or web',
    }));
  });

  it('accepts Android FCM tokens and upserts them into user_devices', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });
    const token = `${'b'.repeat(100)}:APA91b_${'Y'.repeat(80)}`;

    const req: any = {
      user: { id: 'customer-user-1', role: 'customer' },
      body: {
        fcmToken: token,
        platform: 'android',
      },
    };
    const res = makeResponse();

    await registerDeviceToken(req, res);

    expect(ensureUserDevicesTable).toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_devices'), [
      'customer-user-1',
      token,
      'android',
    ]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: true,
    }));
  });

  it('rejects token registration without an authenticated user', async () => {
    const req: any = {
      body: {
        fcmToken: 'token',
        platform: 'android',
      },
    };
    const res = makeResponse();

    await registerDeviceToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(db.query).not.toHaveBeenCalled();
  });
});
