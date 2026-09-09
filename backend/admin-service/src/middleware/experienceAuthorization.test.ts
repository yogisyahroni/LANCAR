import express from 'express';
import request from 'supertest';
import { db } from '../db';
import {
  EXPERIENCE_PERMISSIONS,
  requireExperienceAccess,
} from './experienceAuthorization';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const OPERATOR_ID = '11111111-1111-4111-8111-111111111111';
const MANIFEST_ID = '22222222-2222-4222-8222-222222222222';

let permissionAllowed = true;
let allowedMarkets = new Set(['id-jk']);
let globalScopeAllowed = false;

const buildApp = (middleware: ReturnType<typeof requireExperienceAccess>) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: OPERATOR_ID,
      role: 'ops_admin',
      full_name: 'Indonesia Operator',
      totp_verified: true,
    };
    next();
  });
  app.get('/experience', middleware, (_req, res) => res.status(200).json({ ok: true }));
  app.get('/experience/global', requireExperienceAccess(EXPERIENCE_PERMISSIONS.read, { target: 'global' }), (_req, res) => res.status(200).json({ ok: true }));
  app.patch('/experience/manifests/:manifestId/draft', requireExperienceAccess(EXPERIENCE_PERMISSIONS.draftWrite, { target: 'manifest-body' }), (_req, res) => res.status(200).json({ ok: true }));
  return app;
};

describe('Experience authorization middleware', () => {
  beforeEach(() => {
    permissionAllowed = true;
    allowedMarkets = new Set(['id-jk']);
    globalScopeAllowed = false;
    (db.query as jest.Mock).mockImplementation((sql: string, values: unknown[] = []) => {
      if (sql.includes('FROM permissions')) return Promise.resolve({ rows: [{ allowed: permissionAllowed }] });
      if (sql.includes('experience_admin_scope_grants')) {
        const market = values[2];
        return Promise.resolve({ rows: [{ allowed: market === '*' ? globalScopeAllowed : allowedMarkets.has(String(market)) }] });
      }
      if (sql.includes('FROM experience_manifest_revisions')) {
        return Promise.resolve({ rows: [{ market_code: 'id-jk', surface: 'customer_android' }] });
      }
      if (sql.includes('INSERT INTO audit_logs')) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
  });

  it('allows an assigned capability inside the assigned market/surface scope', async () => {
    const app = buildApp(requireExperienceAccess(EXPERIENCE_PERMISSIONS.read, { target: 'query' }));
    const res = await request(app).get('/experience').query({ market_code: 'id-jk', surface: 'customer_android' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns a typed permission denial and writes an audit row', async () => {
    permissionAllowed = false;
    const app = buildApp(requireExperienceAccess(EXPERIENCE_PERMISSIONS.publish, { target: 'query' }));
    const res = await request(app).get('/experience').query({ market_code: 'id-jk' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({
      code: 'EXPERIENCE_AUTHORIZATION_DENIED',
      reason_code: 'EXPERIENCE_PERMISSION_REQUIRED',
      permission: 'experience.publish',
    }));
    expect((db.query as jest.Mock).mock.calls.some(([sql]) => String(sql).includes('INSERT INTO audit_logs'))).toBe(true);
  });

  it('denies an Indonesia operator outside the assigned market', async () => {
    const app = buildApp(requireExperienceAccess(EXPERIENCE_PERMISSIONS.draftWrite, { target: 'query' }));
    const res = await request(app).get('/experience').query({ market_code: 'sg-sg', surface: 'customer_web' });

    expect(res.status).toBe(403);
    expect(res.body.reason_code).toBe('EXPERIENCE_SCOPE_DENIED');
    expect(res.body.market_code).toBe('sg-sg');
  });

  it('requires an explicit global grant for global actions', async () => {
    const app = buildApp(requireExperienceAccess(EXPERIENCE_PERMISSIONS.featureFlagWrite, { target: 'global' }));
    const res = await request(app).get('/experience/global');

    expect(res.status).toBe(403);
    expect(res.body.reason_code).toBe('EXPERIENCE_GLOBAL_SCOPE_REQUIRED');
  });

  it('checks both current and requested scope before a draft can move markets', async () => {
    const app = buildApp(requireExperienceAccess(EXPERIENCE_PERMISSIONS.draftWrite, { target: 'manifest-body' }));
    const res = await request(app)
      .patch(`/experience/manifests/${MANIFEST_ID}/draft`)
      .send({ market_code: 'sg-sg', surface: 'customer_web' });

    expect(res.status).toBe(403);
    expect(res.body.reason_code).toBe('EXPERIENCE_SCOPE_DENIED');
    expect(res.body.market_code).toBe('sg-sg');
  });
});
