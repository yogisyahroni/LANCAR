export {};

const { db } = require('../db');

jest.mock('../db', () => ({ db: { query: jest.fn() } }));
jest.mock('../security/logRedaction', () => ({ securityLog: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('../middleware/csrfProtection', () => ({
  issueCsrfTokenCookie: jest.fn(),
  clearCsrfTokenCookie: jest.fn(),
}));

const {
  getCustomerSessions,
  logoutOtherCustomerSessions,
  changeCustomerPin,
} = require('./customerAuth.controller');

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  return res;
};

describe('customer web security controllers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns only session metadata and identifies the current session', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [
      {
        id: 'session-current',
        session_token: 'current-token',
        ip_address: '127.0.0.1',
        user_agent: 'Chrome on Windows',
        created_at: '2026-08-31T08:00:00.000Z',
      },
      {
        id: 'session-old',
        session_token: 'old-token',
        ip_address: '10.0.0.2',
        user_agent: 'Android',
        created_at: '2026-08-30T08:00:00.000Z',
      },
    ] });

    const res = makeRes();
    await getCustomerSessions({
      user: { id: 'customer-1' },
      cookies: { customer_session: 'current-token' },
    }, res);

    expect(res.body.sessions).toEqual([
      expect.objectContaining({ id: 'session-current', is_current: true }),
      expect.objectContaining({ id: 'session-old', is_current: false }),
    ]);
    expect(res.body.sessions[0].session_token).toBeUndefined();
  });

  it('revokes other sessions while keeping the current session', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rowCount: 2, rows: [{ id: 'old-1' }, { id: 'old-2' }] });
    const res = makeRes();

    await logoutOtherCustomerSessions({
      user: { id: 'customer-1' },
      cookies: { customer_session: 'current-token' },
    }, res);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('session_token <> $2'),
      ['customer-1', 'current-token'],
    );
    expect(res.body.revoked_count).toBe(2);
  });

  it('rejects malformed PIN input before touching the database', async () => {
    const res = makeRes();
    await changeCustomerPin({ user: { id: 'customer-1' }, body: { current_pin: '123', new_pin: 'abcdef' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/6 digits/);
    expect(db.query).not.toHaveBeenCalled();
  });
});
