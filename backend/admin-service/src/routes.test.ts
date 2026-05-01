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
      .set('x-user-role', 'super_admin')
      .set('x-totp-verified', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ key: 'test-flag' }]);
  });

  it('should toggle flag', async () => {
    const res = await request(app).patch('/admin/feature-flags/test-flag/toggle')
      .set('x-user-role', 'super_admin')
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
      .set('x-user-role', 'super_admin')
      .set('x-totp-verified', 'true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ readiness: true });
  });

  afterAll(async () => {
    // Close connections to prevent open handles
    await db.end();
    await redis.quit();
    await closeWebSocket();
  });
});
