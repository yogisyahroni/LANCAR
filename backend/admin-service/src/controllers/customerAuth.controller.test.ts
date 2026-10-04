export {};

const { db } = require('../db');
const jwt = require('jsonwebtoken');

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
  refreshToken,
  exchangeCustomerJwtForWebSession,
} = require('./customerAuth.controller');

const makeRes = () => {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.cookie = jest.fn();
  res.clearCookie = jest.fn();
  return res;
};

describe('customer web security controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'merchant-portal-test-secret';
    process.env.JWT_ISSUER = 'tembus-auth-service';
  });

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

  it('rotates the customer web session token instead of reusing it', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ user_id: 'customer-1', email: 'merchant@example.test', role: 'customer' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ user_id: 'customer-1' }] });
    const res = makeRes();

    await refreshToken({
      headers: { 'x-portal': 'customer' },
      cookies: { customer_session: 'current-token' },
    }, res);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('SET session_token = $1, expires_at = $2'),
      [expect.any(String), expect.any(Date), 'current-token'],
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'customer_session',
      expect.not.stringMatching(/^current-token$/),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
    expect(res.body).toEqual({ message: 'Session refreshed' });
  });

  it('rejects a refresh when the conditional session rotation loses a revoke race', async () => {
    (db.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ user_id: 'customer-1', email: 'merchant@example.test', role: 'customer' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const res = makeRes();

    await refreshToken({
      headers: { 'x-portal': 'customer' },
      cookies: { customer_session: 'revoked-token' },
    }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/expired/);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it.each([
    'super_admin',
    'admin',
    'ops_security',
    'ops_admin',
    'finance_admin',
    'cs_agent',
    'zone_manager',
  ])('rejects %s from creating a merchant web session', async (role) => {
    const token = jwt.sign(
      { user_id: 'support-user-1', role },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', issuer: process.env.JWT_ISSUER },
    );
    const res = makeRes();

    await exchangeCustomerJwtForWebSession({
      headers: { 'x-portal': 'merchant' },
      body: { access_token: token },
    }, res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Only merchant portal roles can create merchant web sessions');
    expect(db.query).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
