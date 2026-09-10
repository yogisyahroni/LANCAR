import {
  customerQuoteInputFingerprint,
  loadCustomerPriceQuote,
  persistCustomerPriceQuote,
} from './_shared';
import { redis } from '../../redis';

jest.mock('../../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../../redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

const service = (code = 'tembus_instant') => ({
  code,
} as any);

const packages = [{
  package_index: 0,
  package_code: 'PKG-1',
  description: 'Dokumen',
  category: 'document',
  quantity: 1,
  size_tier: 'small',
  weight_kg: 1,
  length_cm: 20,
  width_cm: 15,
  height_cm: 10,
  declared_value_idr: 0,
  dimensions_scanned: false,
  is_fragile: false,
  is_prohibited: false,
  requires_delivery_code: false,
  metadata: { source: 'mobile' },
}];

const fingerprintInput = (overrides: Record<string, unknown> = {}) => ({
  service: service(),
  pickupPoint: { lat: -6.175392, lng: 106.827153 },
  dropoffPoint: { lat: -6.21462, lng: 106.84513 },
  dimensions: { length: 20, width: 15, height: 10 },
  weightKg: 1,
  packages,
  hasInsurance: false,
  itemValue: 0,
  sizeTier: 'small',
  courierId: null,
  materialCodes: [],
  recipientName: 'Customer',
  recipientPhone: '628000000000',
  requiresDeliveryCode: false,
  ...overrides,
} as any);

describe('customer quote persistence contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fingerprints the server pricing inputs and ignores package metadata provenance', () => {
    const base = customerQuoteInputFingerprint(fingerprintInput());
    const metadataOnly = customerQuoteInputFingerprint(fingerprintInput({
      packages: [{ ...packages[0], metadata: { source: 'web' } }],
    }));
    const changedDropoff = customerQuoteInputFingerprint(fingerprintInput({
      dropoffPoint: { lat: -6.3, lng: 106.9 },
    }));

    expect(metadataOnly).toBe(base);
    expect(changedDropoff).not.toBe(base);
  });

  it('stores and loads a customer-owned quote snapshot with a bounded Redis TTL', async () => {
    const quote = {
      quote_id: 'quote-1',
      input_fingerprint: 'fingerprint-1',
      snapshot_hash: 'snapshot-1',
      expires_at: '2099-01-01T00:00:00.000Z',
      total_price_idr: 25000,
    };
    (redis.set as jest.Mock).mockResolvedValue('OK');
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({
      customer_id: 'customer-1',
      quote,
    }));

    await persistCustomerPriceQuote(quote, 'customer-1');
    expect(redis.set).toHaveBeenCalledWith(
      'customer:price-quote:customer-1:quote-1',
      JSON.stringify({ customer_id: 'customer-1', quote }),
      'EX',
      600,
    );
    await expect(loadCustomerPriceQuote('quote-1', 'customer-1')).resolves.toEqual(quote);
  });
});
