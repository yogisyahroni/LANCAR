import { Request, Response } from 'express';
import {
  buildAuditAction,
  buildHttpAuditPayload,
  resolveAuditTargetId,
  shouldAuditRequest,
} from './auditTrail';

const makeRequest = (overrides: Partial<Request> = {}) => ({
  method: 'POST',
  path: '/admin/orders/550e8400-e29b-41d4-a716-446655440000/flag',
  originalUrl: '/admin/orders/550e8400-e29b-41d4-a716-446655440000/flag?token=secret',
  url: '/admin/orders/550e8400-e29b-41d4-a716-446655440000/flag',
  params: { id: '550e8400-e29b-41d4-a716-446655440000' },
  query: { token: 'secret' },
  body: { reason: 'damaged', password: 'should-not-be-stored' },
  headers: { 'user-agent': 'jest' },
  ip: '127.0.0.1',
  socket: { remoteAddress: '127.0.0.1' },
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    role: 'admin',
    full_name: 'Admin User',
    totp_verified: true,
  },
  ...overrides,
}) as unknown as Request;

const makeResponse = (statusCode = 200) => ({
  statusCode,
  locals: {
    requestId: 'req-1',
    correlationId: 'corr-1',
  },
}) as unknown as Response;

describe('auditTrail middleware helpers', () => {
  afterEach(() => {
    delete process.env.AUDIT_TRAIL_HTTP_MUTATIONS;
  });

  it('audits successful authenticated mutation requests only', () => {
    expect(shouldAuditRequest(makeRequest(), makeResponse(200))).toBe(true);
    expect(shouldAuditRequest(makeRequest({ method: 'GET' }), makeResponse(200))).toBe(false);
    expect(shouldAuditRequest(makeRequest(), makeResponse(401))).toBe(false);
    expect(shouldAuditRequest(makeRequest({ user: undefined }), makeResponse(200))).toBe(false);
  });

  it('builds stable action names and target ids', () => {
    const req = makeRequest();
    expect(buildAuditAction(req)).toBe('http.post.admin.orders.:id.flag');
    expect(resolveAuditTargetId(req)).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('stores request shape instead of sensitive body values', () => {
    const payload = buildHttpAuditPayload(makeRequest(), makeResponse(200));
    expect(payload).toMatchObject({
      request_id: 'req-1',
      correlation_id: 'corr-1',
      method: 'POST',
      status_code: 200,
      actor_role: 'admin',
    });
    expect(payload.request_body_keys).toEqual(['password', 'reason']);
    expect(JSON.stringify(payload)).not.toContain('should-not-be-stored');
  });
});
