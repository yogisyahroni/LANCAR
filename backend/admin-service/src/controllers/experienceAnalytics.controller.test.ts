import { Request, Response } from 'express';
import { db } from '../db';
import { recordCustomerExperienceEvent } from './experienceAnalytics.controller';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
}));

const makeResponse = () => {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return response;
};

const makeRequest = (body: Record<string, unknown>, headers: Record<string, string> = {}) => ({
  body,
  headers,
  header(name: string) {
    return headers[name.toLowerCase()];
  },
  user: { id: 'customer-raw-id', role: 'customer' },
} as unknown as Request);

describe('recordCustomerExperienceEvent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes a pseudonymous canonical impression with manifest and campaign identity', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'event-row-id' }] });
    const response = makeResponse();

    await recordCustomerExperienceEvent(makeRequest({
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      event_type: 'impression',
      component: 'hero_banner',
      campaign_id: 'ramadan-2026',
      section_id: 'hero-main',
      manifest_revision: 12,
      market_code: 'id-jk',
    }, {
      'x-request-id': 'request-1',
      'x-correlation-id': 'correlation-1',
      'x-trace-id': 'trace-1',
    }), response);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [query, values] = (db.query as jest.Mock).mock.calls[0];
    expect(query).toContain('INSERT INTO event_outbox');
    expect(values[0]).toBe('experience_banner');
    expect(values[2]).toBe('experience.banner.impression');
    expect(values[9]).toBe('customer-android');
    expect(values[10]).toMatch(/^actor_[a-f0-9]{64}$/);
    expect(values[10]).not.toContain('customer-raw-id');
    expect(JSON.parse(values[4])).toEqual(expect.objectContaining({
      event_id: '550e8400-e29b-41d4-a716-446655440000',
      campaign_id: 'ramadan-2026',
      manifest_revision: 12,
    }));
    expect(response.status).toHaveBeenCalledWith(202);
  });

  it('rejects invalid event targets before touching the outbox', async () => {
    const response = makeResponse();

    await recordCustomerExperienceEvent(makeRequest({
      event_id: 'not-a-uuid',
      event_type: 'impression',
      component: 'hero_banner',
      campaign_id: 'promo',
      section_id: 'hero',
      manifest_revision: 1,
    }), response);

    expect(db.query).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_EXPERIENCE_EVENT' }));
  });

  it('returns unauthorized without an authenticated customer identity', async () => {
    const response = makeResponse();
    await recordCustomerExperienceEvent({ body: {} } as Request, response);

    expect(db.query).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });
});
