const { db } = require('../db');
const broadcastService = require('../services/broadcast.service');
const broadcastTarget = require('../services/broadcastTarget.service');
const broadcastDelivery = require('../services/broadcastDelivery.service');

jest.mock('../db', () => ({ db: { query: jest.fn() } }));
jest.mock('../redis', () => ({ redis: { get: jest.fn(), multi: jest.fn(() => ({ incr: jest.fn().mockReturnThis(), expire: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) })) } }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn() } }));
jest.mock('../notifications', () => ({ createNotification: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/broadcast.service');
jest.mock('../services/broadcastTarget.service');
jest.mock('../services/broadcastDelivery.service');

const {
  listAdminBroadcasts,
  createAdminBroadcast,
  updateAdminBroadcast,
} = require('./broadcast.controller');

const makeRes = () => {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (payload: unknown) => { res.body = payload; return res; };
  return res;
};

const adminUser = { user: { id: '22222222-2222-4222-8222-222222222222' } };

describe('broadcast admin controller flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    broadcastService.isUuid.mockReturnValue(true);
  });

  it('creates a draft broadcast and lists it back', async () => {
    broadcastService.validateBroadcastInput.mockReturnValue({
      title: 'Info',
      body: 'Isi',
      image_url: null,
      deep_link: null,
      category: 'system',
      priority: 'normal',
      channels: ['push', 'in_app'],
      target_type: 'all',
      target_filter: null,
      status: 'draft',
      scheduled_at: null,
    });
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'b1', title: 'Info', status: 'draft', created_by: adminUser.user.id }],
    });

    const created = makeRes();
    await createAdminBroadcast(
      { ...adminUser, body: { title: 'Info', body: 'Isi', status: 'draft' }, query: {} } as any,
      created as any,
    );
    expect(created.statusCode).toBe(201);
    expect(created.body.data.id).toBe('b1');

    broadcastService.listBroadcasts.mockResolvedValue({ rows: [{ id: 'b1' }], total: 1 });
    const list = makeRes();
    await listAdminBroadcasts({ query: { page: '1', limit: '20' } } as any, list as any);
    expect(list.body.total).toBe(1);
    expect(broadcastService.listBroadcasts).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined, page: 1, limit: 20 }),
    );
  });

  it('rejects send_now when the per-admin rate limit is exhausted', async () => {
    broadcastService.validateBroadcastInput.mockReturnValue({
      title: 'Info',
      body: 'Isi',
      image_url: null,
      deep_link: null,
      category: 'system',
      priority: 'normal',
      channels: ['push', 'in_app'],
      target_type: 'all',
      target_filter: null,
      status: 'draft',
      scheduled_at: null,
    });
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{ id: 'b2', title: 'Info', status: 'draft', created_by: adminUser.user.id }],
    });
    broadcastService.consumeAdminBroadcastSendAllowance.mockResolvedValue(false);

    const created = makeRes();
    await createAdminBroadcast(
      { ...adminUser, body: { title: 'Info', body: 'Isi', status: 'draft', send_now: true }, query: {} } as any,
      created as any,
    );
    expect(created.statusCode).toBe(429);
    expect(broadcastDelivery.dispatchBroadcastAsync).not.toHaveBeenCalled();
  });

  it('cancels a scheduled broadcast through the patch endpoint', async () => {
    broadcastService.validateBroadcastPatch.mockReturnValue({ status: 'cancelled' });
    (broadcastService.updateBroadcast as jest.Mock).mockResolvedValue({ id: 'b3', status: 'cancelled' });

    const res = makeRes();
    await updateAdminBroadcast(
      { ...adminUser, params: { id: 'b3' }, body: { status: 'cancelled' } } as any,
      res as any,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(broadcastService.updateBroadcast).toHaveBeenCalledWith('b3', { status: 'cancelled' });
  });
});
