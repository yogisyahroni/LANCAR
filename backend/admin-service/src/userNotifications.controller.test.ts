import { registerDeviceToken } from './controllers/userNotifications.controller';
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

  it('accepts Android FCM tokens and upserts them into user_devices', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });

    const req: any = {
      user: { id: 'customer-user-1', role: 'customer' },
      body: {
        fcmToken: 'realistic-fcm-token',
        platform: 'android',
      },
    };
    const res = makeResponse();

    await registerDeviceToken(req, res);

    expect(ensureUserDevicesTable).toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_devices'), [
      'customer-user-1',
      'realistic-fcm-token',
      'android',
    ]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
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
