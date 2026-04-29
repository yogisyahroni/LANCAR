import express from 'express';
import request from 'supertest';
import { routes } from './routes';
import * as controllers from './controllers';

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
}));

describe('Admin Service Routes', () => {
  it('should return all flags', async () => {
    const res = await request(app).get('/admin/feature-flags');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ key: 'test-flag' }]);
  });

  it('should toggle flag', async () => {
    const res = await request(app).patch('/admin/feature-flags/test-flag/toggle').send({
      enabled: true,
      reason: '12345678901234567890123456789012345678901234567890',
      totpToken: '123456'
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'toggled' });
  });

  it('should get 3-legs readiness', async () => {
    const res = await request(app).get('/admin/feature-flags/readiness/three-legs');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ readiness: true });
  });
});
