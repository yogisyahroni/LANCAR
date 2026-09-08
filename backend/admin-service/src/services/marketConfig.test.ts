import {
  getPublicMarketConfig,
  MarketConfigError,
  parseMarketConfigPatch,
  updateMarketConfig,
} from './marketConfig';

jest.mock('../db', () => ({
  db: { connect: jest.fn() },
  readDb: { query: jest.fn() },
}));

const { db, readDb } = jest.requireMock('../db') as {
  db: { connect: jest.Mock };
  readDb: { query: jest.Mock };
};

const baseConfig = {
  market_code: 'id-jk', country_code: 'ID', region_code: 'ID-JK', currency_code: 'IDR',
  currency_minor_unit: 0, default_locale: 'id-ID', timezone: 'Asia/Jakarta',
  measurement_system: 'metric', phone_rules: { country_calling_code: '+62' },
  address_rules: { required_fields: ['address', 'latitude', 'longitude'] },
  payment_methods: ['qris'], logistics_providers: [{ code: 'lancar' }],
  map_providers: [{ code: 'openstreetmap' }], tax_policy_refs: ['id-ppn-v1'],
  insurance_policy_refs: ['lancar-standard-insurance-v1'],
  service_hours: { default: { opens: '00:00', closes: '23:59' } },
  launch_state: 'active', config_version: 1, effective_from: new Date(0).toISOString(),
  rollback_version: null, approval_status: 'approved', approval_reason: 'seed',
  approved_by: null, approved_at: null, created_by: null, updated_by: null,
  created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
};

describe('market configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not allow approval fields through the material config patch', () => {
    expect(parseMarketConfigPatch({ approval_status: 'approved', approved_by: 'secret' })).toEqual({});
  });

  it('rejects provider credentials from public capability references', () => {
    expect(() => parseMarketConfigPatch({
      logistics_providers: [{ code: 'lancar', api_key: 'must-not-be-stored' }],
    })).toThrow(MarketConfigError);
  });

  it('returns only public market facts after readiness passes', async () => {
    readDb.query
      .mockResolvedValueOnce({ rows: [{ market_code: 'id-jk', is_ready: true, reason_codes: [] }] })
      .mockResolvedValueOnce({ rows: [baseConfig] })
      .mockResolvedValueOnce({ rows: [{ city_code: 'jakarta', service_code: 'food', is_enabled: true, service_hours: {}, policy_refs: {} }] })
      .mockResolvedValueOnce({ rows: [{ document_type: 'privacy', locale: 'id-ID', version: 'v1', document_uri: '/legal/privacy', status: 'approved', effective_from: new Date(0).toISOString() }] });

    const result = await getPublicMarketConfig('ID-JK', 'jakarta');

    expect(result.market_code).toBe('id-jk');
    expect(result.service_availability).toEqual([{ city_code: 'jakarta', service_code: 'food', service_hours: {}, policy_refs: {} }]);
    expect(result.legal_documents[0]).toEqual(expect.objectContaining({ document_type: 'privacy', version: 'v1' }));
    expect(result).not.toHaveProperty('approved_by');
    expect(result).not.toHaveProperty('approval_status');
    expect(result).not.toHaveProperty('created_by');
  });

  it('fails closed for an unknown market instead of applying an Indonesia default', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [{ market_code: 'xx', is_ready: false, reason_codes: ['market_not_configured'] }] });

    await expect(getPublicMarketConfig('xx')).rejects.toMatchObject<Partial<MarketConfigError>>({
      code: 'MARKET_NOT_CONFIGURED',
      status: 404,
      reasonCodes: ['market_not_configured'],
    });
    expect(readDb.query).toHaveBeenCalledTimes(1);
  });

  it('increments version, records rollback version, and resets approval on material update', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [baseConfig] })
        .mockResolvedValueOnce({ rows: [{ ...baseConfig, currency_code: 'USD', config_version: 2, rollback_version: 1, approval_status: 'pending_approval', launch_state: 'paused' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}),
      release: jest.fn(),
    };
    db.connect.mockResolvedValueOnce(client);

    const result = await updateMarketConfig('id-jk', { currency_code: 'USD' }, '00000000-0000-4000-8000-000000000001', 'corr-1');

    expect(result).toEqual(expect.objectContaining({ config_version: 2, rollback_version: 1, approval_status: 'pending_approval' }));
    expect(client.query).toHaveBeenCalledWith('BEGIN');
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
    expect(client.query.mock.calls[2][0]).toContain("approval_status = 'pending_approval'");
    expect(client.query.mock.calls[3][0]).toContain('market_config_audit');
  });
});
