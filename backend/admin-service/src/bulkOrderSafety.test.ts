import { buildBulkProcessResult, getBulkJobStatus, processBulkPayment } from './controllers/bulkOrder.controller';
import { db } from './db';
import { redis } from './redis';

jest.mock('./db', () => ({
  db: {
    connect: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('./redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('./security/logRedaction', () => ({
  securityLog: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock('./controllers/deliveryServices.controller', () => ({
  calculateServiceSettlement: jest.fn(),
  customerFacingService: jest.fn((service) => service),
  findDeliveryServiceByCode: jest.fn(),
}));

jest.mock('./services/mapsProviderConfig', () => ({
  buildMapsRouteEtaSnapshot: jest.fn(),
  buildMapsMultiWaypointRouteEtaSnapshot: jest.fn(),
  geocodeAddress: jest.fn(),
}));

jest.mock('./midtrans', () => ({
  createSnapTransaction: jest.fn(),
  getMidtransClientKey: jest.fn(() => 'client-key'),
  getMidtransSnapJsUrl: jest.fn(() => 'https://snap.test'),
}));

const makeResponse = () => {
  const res: any = {};
  res.status = jest.fn((code: number) => {
    res.statusCodeValue = code;
    return res;
  });
  res.json = jest.fn((body: unknown) => {
    res.bodyValue = body;
    return res;
  });
  return res;
};

describe('bulk order ownership and resume contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only exposes a job to its owning customer', async () => {
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
      customer_id: 'customer-a',
      status: 'completed',
      revision: 2,
      rows: [],
    }));

    const ownerResponse = makeResponse();
    await getBulkJobStatus({ params: { job_id: 'job-1' }, user: { id: 'customer-a' } } as any, ownerResponse);
    expect(ownerResponse.statusCodeValue).toBeUndefined();
    expect(ownerResponse.bodyValue).toEqual(expect.objectContaining({ customer_id: 'customer-a', revision: 2 }));

    const otherResponse = makeResponse();
    await getBulkJobStatus({ params: { job_id: 'job-1' }, user: { id: 'customer-b' } } as any, otherResponse);
    expect(otherResponse.statusCodeValue).toBe(404);
  });

  it('returns the persisted process result when a completed job is resumed', async () => {
    const processResult = {
      success: true,
      job_id: 'job-1',
      order_ids: ['order-1'],
      processed_count: 1,
    };
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
      customer_id: 'customer-a',
      status: 'processed',
      revision: 1,
      process_result: processResult,
      rows: [],
    }));
    const client = { query: jest.fn(), release: jest.fn() };
    (db.connect as jest.Mock).mockResolvedValue(client);

    const response = makeResponse();
    await processBulkPayment({
      body: { job_id: 'job-1', job_revision: 1 },
      user: { id: 'customer-a' },
    } as any, response);

    expect(response.statusCodeValue).toBe(200);
    expect(response.bodyValue).toEqual(processResult);
    expect(client.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });

  it('returns each server-created payment link with the exact order reference', () => {
    expect(buildBulkProcessResult(
      'job-2',
      4,
      75000,
      [{ id: 'order-2', order_number: 'TMB-BLK-2' }],
      [{
        order_id: 'order-2',
        order_number: 'TMB-BLK-2',
        payment_url: 'https://tembus.id/pay/link-2',
        expires_at: '2026-09-01T10:10:00.000Z',
      }],
    )).toEqual(expect.objectContaining({
      success: true,
      job_id: 'job-2',
      job_revision: 4,
      order_ids: ['order-2'],
      payment_links: [expect.objectContaining({ order_id: 'order-2', payment_url: 'https://tembus.id/pay/link-2' })],
      payment: null,
    }));
  });
});
