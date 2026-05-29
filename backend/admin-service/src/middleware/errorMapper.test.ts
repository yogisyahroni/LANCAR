import express from 'express';
import request from 'supertest';
import { sanitizeErrorResponses, genericErrorHandler } from './errorMapper';
import { requestContext } from './requestContext';
import { redactForLog } from '../security/logRedaction';

describe('generic error mapper and log redaction', () => {
  const app = express();
  app.use(express.json());
  app.use(requestContext);
  app.use(sanitizeErrorResponses);
  app.get('/leaky-json', (_req, res) => {
    res.status(500).json({
      error: 'database failed for yogi@example.com token=eyJabc.def.ghi and phone 081234567890',
      stack: 'SELECT * FROM users',
    });
  });
  app.get('/leaky-send', (_req, res) => {
    res.status(500).send('postgres://user:password@db failed with card 4111111111111111');
  });
  app.get('/throw', () => {
    throw new Error('JWT secret leaked: eyJabc.def.ghi');
  });
  app.use(genericErrorHandler);

  it('maps 500 json responses to a safe envelope', async () => {
    const res = await request(app).get('/leaky-json').set('x-correlation-id', 'corr-test');

    expect(res.status).toBe(500);
    expect(res.body).toEqual(expect.objectContaining({
      success: false,
      error: 'Internal server error',
      message: 'Internal server error',
      code: 'ERR_INTERNAL_SERVER',
      correlation_id: 'corr-test',
      status_code: 500,
    }));
    expect(res.body.request_id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    expect(res.body.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(res.body)).not.toContain('yogi@example.com');
    expect(JSON.stringify(res.body)).not.toContain('SELECT');
  });

  it('maps 500 text responses to a safe JSON envelope', async () => {
    const res = await request(app).get('/leaky-send').set('x-correlation-id', 'corr-send');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ERR_INTERNAL_SERVER');
    expect(res.body.request_id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    expect(res.body.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(res.body)).not.toContain('4111111111111111');
  });

  it('maps thrown errors through the generic handler', async () => {
    const res = await request(app).get('/throw').set('x-correlation-id', 'corr-throw');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('ERR_INTERNAL_SERVER');
    expect(res.body.correlation_id).toBe('corr-throw');
    expect(res.body.request_id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
    expect(res.body.trace_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('redacts sensitive strings and object keys before logging', () => {
    const redacted = redactForLog({
      email: 'customer@example.com',
      phone_number: '081234567890',
      access_token: 'eyJaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc',
      password: 'super-secret-password',
      nested: {
        authorization: 'Bearer eyJaaaaaaaaaaa.bbbbbbbbbbbb.cccccccccccc',
        database_url: 'postgres://user:password@db',
        payment_card: '4111 1111 1111 1111',
      },
    });

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain('customer@example.com');
    expect(serialized).not.toContain('081234567890');
    expect(serialized).not.toContain('super-secret-password');
    expect(serialized).not.toContain('4111 1111 1111 1111');
    expect(serialized).not.toContain('user:password');
    expect(serialized).toContain('[REDACTED]');
  });
});
