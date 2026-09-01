import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { routes } from './routes';
import * as controllers from './controllers';
import { db } from './db';
import { redis } from './redis';
import { closeWebSocket } from './websocket';
import { buildInternalAuthHeaders, InternalIdentity } from './internalAuth';

const INTERNAL_GATEWAY_SECRET = 'test-internal-gateway-secret-minimum-32-bytes';
process.env.INTERNAL_GATEWAY_SECRET = INTERNAL_GATEWAY_SECRET;

const gatewayHeaders = (overrides: Partial<InternalIdentity> = {}) =>
  buildInternalAuthHeaders(
    {
      userId: 'test-user-id',
      role: 'super_admin',
      fullName: 'Test User',
      totpVerified: true,
      ...overrides,
    },
    INTERNAL_GATEWAY_SECRET
  );

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(routes);

// Mock the controllers
jest.mock('./controllers', () => ({
  getAllFlags: jest.fn((req, res) => res.status(200).json([{ key: 'test-flag' }])),
  getFlagByKey: jest.fn((req, res) => res.status(200).json({ key: req.params.key })),
  toggleFlag: jest.fn((req, res) => res.status(200).json({ status: 'toggled' })),
  updateFlagConfig: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  getFlagLogs: jest.fn((req, res) => res.status(200).json([])),
  getThreeLegsReadiness: jest.fn((req, res) => res.status(200).json({ readiness: true })),
  createFlag: jest.fn((req, res) => res.status(201).json({ key: 'new-flag' })),
  getAllLogs: jest.fn((req, res) => res.status(200).json([])),
  // Public tracking controller (namespace for /api/v1/tracking/public)
  publicTracking: {
    publicTrackingRateLimiter: jest.fn((req, res, next) => next()),
    getPublicTrackingByResi: jest.fn((req, res) => res.status(200).json({ id: '1' })),
  },
  // Settings & system config controllers
  getSystemConfigs: jest.fn((req, res) => res.status(200).json([])),
  updateSystemConfig: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  // Admin team management controllers
  getAllAdmins: jest.fn((req, res) => res.status(200).json([])),
  deleteAdmin: jest.fn((req, res) => res.status(200).json({ status: 'deleted' })),
  inviteAdmin: jest.fn((req, res) => res.status(201).json({ id: 'new-admin-1' })),
  // System health controller
  getSystemHealth: jest.fn((req, res) => res.status(200).json([])),
  // New controller functions
  getAllOrders: jest.fn((req, res) => res.status(200).json([])),
  getOrderStats: jest.fn((req, res) => res.status(200).json({})),
  getOrderById: jest.fn((req, res) => res.status(200).json({})),
  reassignOrder: jest.fn((req, res) => res.status(200).json({ status: 'reassigned' })),
  flagOrderIssue: jest.fn((req, res) => res.status(200).json({ status: 'flagged' })),
  getAllCouriers: jest.fn((req, res) => res.status(200).json([])),
  getCourierStats: jest.fn((req, res) => res.status(200).json({})),
  getCourierById: jest.fn((req, res) => res.status(200).json({})),
  updateCourierStatus: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  updateMobileCourierDuty: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  createOrder: jest.fn((req, res) => res.status(201).json({ id: 'new-order' })),
  exportOrders: jest.fn((req, res) => res.status(200).send('csv,data')),
  getCourierHistory: jest.fn((req, res) => res.status(200).json([])),
  exportCouriers: jest.fn((req, res) => res.status(200).send('csv,data')),
  getDisputes: jest.fn((req, res) => res.status(200).json([])),
  getDisputeStats: jest.fn((req, res) => res.status(200).json({})),
  updateDisputeStatus: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  assignDispute: jest.fn((req, res) => res.status(200).json({ status: 'assigned' })),
  getFinancialStats: jest.fn((req, res) => res.status(200).json({})),
  getCourierPayoutAccounts: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  updateCourierPayoutAccountStatus: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id } })),
  getCourierPayoutRequests: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  updateCourierPayoutRequestStatus: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id } })),
  getMobileCourierPayoutSummary: jest.fn((req, res) => res.status(200).json({ success: true, data: { eligibility: { can_request: true } } })),
  getMobileCourierPayoutRequests: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  createMobileCourierPayoutRequest: jest.fn((req, res) => res.status(201).json({ success: true, data: { request: { id: 'payout-1' } } })),
  getMobileCourierOffers: jest.fn((req, res) => res.status(200).json({ success: true, data: [] })),
  acceptMobileCourierOffer: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id } })),
  rejectMobileCourierOffer: jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id } })),
  updateMobileCourierOrderStatus: jest.fn((req, res) => res.status(200).json({ success: true, data: true })),
  verifyMobileCourierFace: jest.fn((req, res) => res.status(200).json({ success: true, data: { verified: true } })),
  scanMobileCourierOrder: jest.fn((req, res) => res.status(200).json({ success: true, data: { scanned: true } })),
  uploadMobileCourierPod: jest.fn((req, res) => res.status(200).json({ success: true, data: { uploaded: true } })),
  uploadMobileCourierServiceReportProof: jest.fn((req, res) => res.status(201).json({ success: true, data: { file_url: '/uploads/service-reports/test.jpg' } })),
  getPayouts: jest.fn((req, res) => res.status(200).json([])),
  exportPayouts: jest.fn((req, res) => res.status(200).send('csv,data')),
  updatePayoutStatus: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  getCustomers: jest.fn((req, res) => res.status(200).json({ data: [], total: 0, page: 1, limit: 20 })),
  getCustomerStats: jest.fn((req, res) => res.status(200).json({})),
  exportCustomers: jest.fn((req, res) => res.status(200).send('csv,data')),
  getNotificationTemplates: jest.fn((req, res) => res.status(200).json([])),
  getNotificationTemplateById: jest.fn((req, res) => res.status(200).json({ id: req.params.id })),
  createNotificationTemplate: jest.fn((req, res) => res.status(201).json({ id: 'new-template' })),
  updateNotificationTemplate: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  deleteNotificationTemplate: jest.fn((req, res) => res.status(200).json({ status: 'deleted' })),
  getVouchers: jest.fn((req, res) => res.status(200).json([])),
  getVoucherStats: jest.fn((req, res) => res.status(200).json({})),
  getZones: jest.fn((req, res) => res.status(200).json([])),
  getPricingConfig: jest.fn((req, res) => res.status(200).json([])),
  updatePricingConfig: jest.fn((req, res) => res.status(200).json({})),
  getSLAConfigs: jest.fn((req, res) => res.status(200).json([])),
  updateSLAConfig: jest.fn((req, res) => res.status(200).json({})),
  getDashboardStats: jest.fn((req, res) => res.status(200).json({})),
  getDashboardEvents: jest.fn((req, res) => res.status(200).json([])),
  updateCustomerStatus: jest.fn((req, res) => res.status(200).json({})),
  bulkEmailCustomers: jest.fn((req, res) => res.status(200).json({})),
  getFinancialSummary: jest.fn((req, res) => res.status(200).json({})),
  getRevenueBreakdown: jest.fn((req, res) => res.status(200).json([])),
  getCostBreakdown: jest.fn((req, res) => res.status(200).json([])),
  getEmergencyFund: jest.fn((req, res) => res.status(200).json({})),
  createVoucher: jest.fn((req, res) => res.status(201).json({ id: 'new-voucher' })),
  updateVoucher: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  deleteVoucher: jest.fn((req, res) => res.status(200).json({ status: 'deleted' })),
  createZone: jest.fn((req, res) => res.status(201).json({ id: 'new-zone' })),
  updateZone: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  deleteZone: jest.fn((req, res) => res.status(200).json({ status: 'deleted' })),
  getAnalyticsKPIs: jest.fn((req, res) => res.status(200).json({})),
  getAnalyticsSLA: jest.fn((req, res) => res.status(200).json({})),
  getAnalyticsSurge: jest.fn((req, res) => res.status(200).json({})),
  getAnalyticsScanAccuracy: jest.fn((req, res) => res.status(200).json({})),
  getAnalyticsRetention: jest.fn((req, res) => res.status(200).json({})),
  getHeatData: jest.fn((req, res) => res.status(200).json([])),
  exportAnalytics: jest.fn((req, res) => res.status(200).send('csv,data')),
  getScheduledReports: jest.fn((req, res) => res.status(200).json([])),
  createScheduledReport: jest.fn((req, res) => res.status(201).json({ id: 'new-report' })),
  updateScheduledReport: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  deleteScheduledReport: jest.fn((req, res) => res.status(200).json({ status: 'deleted' })),
}));

// Mock Redis to prevent open handles
jest.mock('./redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    publish: jest.fn(),
    multi: jest.fn(() => ({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
    quit: jest.fn().mockResolvedValue('OK'),
  },
}));

// Mock DB to prevent open handles
jest.mock('./db', () => ({
  db: {
    query: jest.fn(),
    connect: jest.fn(() => ({
      query: jest.fn(),
      release: jest.fn(),
    })),
    end: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('Admin Service Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (redis.get as jest.Mock).mockResolvedValue(null);
  });

  it('keeps the public health endpoint reachable without admin auth', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(controllers.getSystemHealth).toHaveBeenCalled();
  });

  it('should return all flags', async () => {
    const res = await request(app).get('/admin/feature-flags')
      .set(gatewayHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ key: 'test-flag' }]);
  });

  it('rejects forged internal admin headers without gateway signature', async () => {
    const res = await request(app).get('/admin/feature-flags')
      .set('x-user-id', 'attacker-user-id')
      .set('x-user-role', 'super_admin')
      .set('x-user-full-name', 'Forged User')
      .set('x-totp-verified', 'true');

    expect(res.status).toBe(401);
    expect(controllers.getAllFlags).not.toHaveBeenCalled();
  });

  it('should toggle flag', async () => {
    const res = await request(app).patch('/admin/feature-flags/test-flag/toggle')
      .set(gatewayHeaders())
      .send({
        enabled: true,
        reason: '12345678901234567890123456789012345678901234567890',
        totpToken: '123456'
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'toggled' });
  });

  it('rejects cookie-authenticated mutations without trusted origin or referer', async () => {
    const res = await request(app).post('/admin/feature-flags')
      .set('Cookie', 'admin_session=test-admin-session')
      .send({ key: 'csrf-test' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual(expect.objectContaining({ code: 'ERR_CSRF_ORIGIN' }));
    expect(controllers.createFlag).not.toHaveBeenCalled();
  });

  it('allows cookie-authenticated mutations from an allowed origin', async () => {
    (db.query as jest.Mock).mockResolvedValueOnce({
      rows: [{
        user_id: 'admin-user-id',
        role: 'super_admin',
        full_name: 'Admin User',
      }],
    });

    const res = await request(app).post('/admin/feature-flags')
      .set('Cookie', 'admin_session=test-admin-session')
      .set('Origin', 'http://localhost:3002')
      .send({ key: 'csrf-test' });

    expect(res.status).toBe(201);
    expect(controllers.createFlag).toHaveBeenCalled();
  });

  it('should get notification template by id', async () => {
    const res = await request(app).get('/admin/notifications/templates/1')
      .set(gatewayHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: '1' });
  });

  it('should create notification template', async () => {
    const res = await request(app).post('/admin/notifications/templates')
      .set(gatewayHeaders())
      .send({ trigger: 'test', subject: 'test', content: 'test' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'new-template' });
  });

  it('should delete notification template', async () => {
    const res = await request(app).delete('/admin/notifications/templates/1')
      .set(gatewayHeaders());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'deleted' });
  });

  it('protects courier payout summary without a mobile/web session', async () => {
    const res = await request(app).get('/api/v1/courier/payout/summary');

    expect(res.status).toBe(401);
    expect(controllers.getMobileCourierPayoutSummary).not.toHaveBeenCalled();
  });

  it('allows authenticated courier payout summary access', async () => {
    const res = await request(app).get('/api/v1/courier/payout/summary')
      .set(gatewayHeaders({
        userId: 'courier-user-id',
        role: 'courier',
        fullName: 'Courier Test',
        totpVerified: false,
      }));

    expect(res.status).toBe(200);
    expect(controllers.getMobileCourierPayoutSummary).toHaveBeenCalled();
  });

  it('requires idempotency keys for courier offer, status, face, scan, and POD mutations', async () => {
    const previousSetting = process.env.REQUIRE_IDEMPOTENCY_KEYS;
    process.env.REQUIRE_IDEMPOTENCY_KEYS = 'true';

    const courierHeaders = gatewayHeaders({
      userId: 'courier-user-id',
      role: 'courier',
      fullName: 'Courier Test',
      totpVerified: false,
    });

    const cases = [
      {
        path: '/api/v1/courier/offers/offer-1/accept',
        body: {},
        controller: controllers.acceptMobileCourierOffer,
      },
      {
        path: '/api/v1/courier/face/verify',
        body: { order_id: 'order-1' },
        controller: controllers.verifyMobileCourierFace,
      },
      {
        path: '/api/v1/orders/status',
        body: { order_id: 'order-1', status: 'pickup_arrived' },
        controller: controllers.updateMobileCourierOrderStatus,
      },
      {
        path: '/api/v1/orders/scan',
        body: { order_id: 'order-1', package_code: 'PKG-1' },
        controller: controllers.scanMobileCourierOrder,
      },
      {
        path: '/api/v1/orders/pod/upload',
        body: { order_id: 'order-1' },
        controller: controllers.uploadMobileCourierPod,
      },
      {
        path: '/api/v1/courier/service-report/proof',
        body: { order_id: 'order-1', service_type: 'towing', proof_type: 'completion_photo' },
        controller: controllers.uploadMobileCourierServiceReportProof,
      },
    ];

    try {
      for (const routeCase of cases) {
        (routeCase.controller as jest.Mock).mockClear();

        const res = await request(app)
          .post(routeCase.path)
          .set(courierHeaders)
          .send(routeCase.body);

        expect(res.status).toBe(428);
        expect(res.body).toEqual(expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUIRED' }));
        expect(routeCase.controller).not.toHaveBeenCalled();
      }
    } finally {
      if (previousSetting === undefined) {
        delete process.env.REQUIRE_IDEMPOTENCY_KEYS;
      } else {
        process.env.REQUIRE_IDEMPOTENCY_KEYS = previousSetting;
      }
    }
  });

  it('rate limits courier mutations before idempotency persistence and controller execution', async () => {
    (redis.get as jest.Mock).mockResolvedValueOnce('60');

    const res = await request(app)
      .post('/api/v1/courier/offers/offer-1/accept')
      .set(gatewayHeaders({
        userId: 'courier-user-id',
        role: 'courier',
        fullName: 'Courier Test',
        totpVerified: false,
      }))
      .set('X-Idempotency-Key', 'offer-accept-rate-limit-1')
      .send({});

    expect(res.status).toBe(429);
    expect(res.body).toEqual(expect.objectContaining({ code: 'ERR_RATE_LIMITED' }));
    expect(controllers.acceptMobileCourierOffer).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('requires TOTP for admin payout request status changes', async () => {
    const res = await request(app).patch('/admin/finance/payout-requests/11111111-1111-4111-8111-111111111111')
      .set(gatewayHeaders({
        userId: 'admin-user-id',
        role: 'super_admin',
        fullName: 'Admin Test',
        totpVerified: false,
      }))
      .send({ status: 'approved' });

    expect(res.status).toBe(403);
    expect(controllers.updateCourierPayoutRequestStatus).not.toHaveBeenCalled();
  });

  it('allows TOTP-verified admin payout request status changes', async () => {
    const res = await request(app).patch('/admin/finance/payout-requests/11111111-1111-4111-8111-111111111111')
      .set(gatewayHeaders({
        userId: 'admin-user-id',
        role: 'super_admin',
        fullName: 'Admin Test',
        totpVerified: true,
      }))
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(controllers.updateCourierPayoutRequestStatus).toHaveBeenCalled();
  });

  it('exposes public tracking by resi (cek resi publik)', async () => {
    const res = await request(app).get('/api/v1/tracking/public?resi=TRK-001');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: '1' });
  });

  it('validates resi parameter on public tracking', async () => {
      const res = await request(app).get('/api/v1/tracking/public?resi=');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: '1' });
    });

  afterAll(async () => {
    // Close connections to prevent open handles
    await db.end();
    await redis.quit();
    await closeWebSocket();
  });
});
