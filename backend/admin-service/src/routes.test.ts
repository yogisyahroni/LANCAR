import express from 'express';
import request from 'supertest';
import { routes } from './routes';
import * as controllers from './controllers';
import { db } from './db';
import { redis } from './redis';
import { closeWebSocket } from './websocket';

const app = express();
app.use(express.json());
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
  createOrder: jest.fn((req, res) => res.status(201).json({ id: 'new-order' })),
  exportOrders: jest.fn((req, res) => res.status(200).send('csv,data')),
  getCourierHistory: jest.fn((req, res) => res.status(200).json([])),
  exportCouriers: jest.fn((req, res) => res.status(200).send('csv,data')),
  getDisputes: jest.fn((req, res) => res.status(200).json([])),
  getDisputeStats: jest.fn((req, res) => res.status(200).json({})),
  updateDisputeStatus: jest.fn((req, res) => res.status(200).json({ status: 'updated' })),
  assignDispute: jest.fn((req, res) => res.status(200).json({ status: 'assigned' })),
  getFinancialStats: jest.fn((req, res) => res.status(200).json({})),
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
  it('should return all flags', async () => {
    const res = await request(app).get('/admin/feature-flags')
      .set('x-user-id', 'test-user-id')
      .set('x-user-role', 'super_admin')
      .set('x-user-full-name', 'Test User')
      .set('x-totp-verified', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ key: 'test-flag' }]);
  });

  it('should toggle flag', async () => {
    const res = await request(app).patch('/admin/feature-flags/test-flag/toggle')
      .set('x-user-id', 'test-user-id')
      .set('x-user-role', 'super_admin')
      .set('x-user-full-name', 'Test User')
      .set('x-totp-verified', 'true')
      .send({
        enabled: true,
        reason: '12345678901234567890123456789012345678901234567890',
        totpToken: '123456'
      });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'toggled' });
  });

  it('should get 3-legs readiness', async () => {
    const res = await request(app).get('/admin/feature-flags/readiness/three-legs')
      .set('x-user-id', 'test-user-id')
      .set('x-user-role', 'super_admin')
      .set('x-user-full-name', 'Test User')
      .set('x-totp-verified', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ readiness: true });
  });
  
  it('should get notification template by id', async () => {
    const res = await request(app).get('/admin/notifications/templates/1')
      .set('x-user-id', 'test-user-id')
      .set('x-user-role', 'super_admin')
      .set('x-user-full-name', 'Test User')
      .set('x-totp-verified', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: '1' });
  });

  it('should create notification template', async () => {
    const res = await request(app).post('/admin/notifications/templates')
      .set('x-user-id', 'test-user-id')
      .set('x-user-role', 'super_admin')
      .set('x-user-full-name', 'Test User')
      .set('x-totp-verified', 'true')
      .send({ trigger: 'test', subject: 'test', content: 'test' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'new-template' });
  });

  it('should delete notification template', async () => {
    const res = await request(app).delete('/admin/notifications/templates/1')
      .set('x-user-id', 'test-user-id')
      .set('x-user-role', 'super_admin')
      .set('x-user-full-name', 'Test User')
      .set('x-totp-verified', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'deleted' });
  });

  afterAll(async () => {
    // Close connections to prevent open handles
    await db.end();
    await redis.quit();
    await closeWebSocket();
  });
});
