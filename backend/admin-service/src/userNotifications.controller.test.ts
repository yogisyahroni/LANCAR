import {
  getNotificationUnreadCount,
  getUserNotifications,
  markNotificationRead,
  registerDeviceToken,
  validateDeviceTokenRegistrationInput
} from './controllers/userNotifications.controller';
import { db, readDb } from './db';
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

  it('lists notification deep links with category filter', async () => {
    (readDb.query as jest.Mock).mockResolvedValue({
      rows: [{
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Pesan baru',
        body: 'Kurir mengirim pesan.',
        type: 'chat_message',
        category: 'message',
        priority: 'high',
        is_read: false,
        created_at: '2026-06-07T01:00:00.000Z',
        order_id: '22222222-2222-4222-8222-222222222222',
        deep_link: 'tembus://orders/22222222-2222-4222-8222-222222222222/chat',
      }],
    });

    const req: any = {
      user: { id: 'customer-user-1', role: 'customer' },
      query: { category: 'message', limit: '20' },
    };
    const res = makeResponse();

    await getUserNotifications(req, res);

    expect(readDb.query).toHaveBeenCalledWith(expect.stringContaining('FROM notifications'), [
      'customer-user-1',
      'message',
      20,
    ]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.arrayContaining([
        expect.objectContaining({
          category: 'message',
          deep_link: 'tembus://orders/22222222-2222-4222-8222-222222222222/chat',
        }),
      ]),
    }));
  });

  it('marks a notification read only for the authenticated owner', async () => {
    const notificationId = '11111111-1111-4111-8111-111111111111';
    (db.query as jest.Mock).mockResolvedValue({
      rowCount: 1,
      rows: [{ id: notificationId, is_read: true, read_at: '2026-06-07T01:01:00.000Z' }],
    });

    const req: any = {
      user: { id: 'customer-user-1', role: 'customer' },
      params: { id: notificationId },
    };
    const res = makeResponse();

    await markNotificationRead(req, res);

    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND user_id = $2'), [
      notificationId,
      'customer-user-1',
    ]);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ is_read: true }),
    }));
  });

  it('returns unread counts grouped by notification category', async () => {
    (readDb.query as jest.Mock).mockResolvedValue({
      rows: [
        { category: 'message', count: 2 },
        { category: 'promo', count: 1 },
      ],
    });

    const req: any = {
      user: { id: 'customer-user-1', role: 'customer' },
    };
    const res = makeResponse();

    await getNotificationUnreadCount(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        total: 3,
        by_category: expect.objectContaining({
          message: 2,
          promo: 1,
          activity: 0,
          support: 0,
          system: 0,
        }),
      },
    });
  });
});
