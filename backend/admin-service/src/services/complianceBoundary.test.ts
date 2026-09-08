import {
  ComplianceError,
  getCompliancePolicy,
  parseComplianceConsent,
  recordComplianceConsent,
} from './complianceBoundary';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

const { db, readDb } = jest.requireMock('../db') as {
  db: { query: jest.Mock };
  readDb: { query: jest.Mock };
};

describe('compliance market boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires a versioned, localized consent payload', () => {
    expect(() => parseComplianceConsent({
      market_code: 'id-jk',
      requirement_code: 'terms_of_service',
      document_type: 'terms',
      document_version: '',
      locale: 'id-ID',
      purpose: 'service_access',
      consent: true,
    })).toThrow(ComplianceError);

    expect(parseComplianceConsent({
      market_code: 'ID-JK',
      requirement_code: 'terms_of_service',
      document_type: 'terms',
      document_version: 'terms-id-jk-v1',
      locale: 'id-ID',
      purpose: 'service_access',
      consent: true,
    })).toEqual(expect.objectContaining({ market_code: 'id-jk', consent: true }));
  });

  it('resolves all policy dimensions from the requested market without fallback', async () => {
    readDb.query
      .mockResolvedValueOnce({ rows: [{ market_code: 'id-jk', config_version: 2, default_locale: 'id-ID' }] })
      .mockResolvedValueOnce({ rows: [{ role_code: 'customer', requirement_code: 'terms_of_service' }] })
      .mockResolvedValueOnce({ rows: [{ data_class: 'identity', retention_days: 1825 }] })
      .mockResolvedValueOnce({ rows: [{ role_code: 'courier', artifact_type: 'identity_document', storage_access_class: 'compliance_only' }] })
      .mockResolvedValueOnce({ rows: [{ city_code: 'jakarta', service_code: 'food', is_enabled: false }] })
      .mockResolvedValueOnce({ rows: [{ market_code: 'id-jk', is_ready: false, reason_codes: ['service_availability_missing'] }] });

    const result = await getCompliancePolicy('ID-JK');

    expect(result).toEqual(expect.objectContaining({
      market_code: 'id-jk',
      config_version: 2,
      default_locale: 'id-ID',
      requirements: [{ role_code: 'customer', requirement_code: 'terms_of_service' }],
      service_categories: [{ city_code: 'jakarta', service_code: 'food', is_enabled: false }],
    }));
    expect(readDb.query).toHaveBeenCalledTimes(6);
    for (const call of readDb.query.mock.calls) {
      expect(call[1]).toEqual(['id-jk']);
    }
  });

  it('fails closed when a market is not configured', async () => {
    readDb.query.mockResolvedValueOnce({ rows: [] });

    await expect(getCompliancePolicy('xx')).rejects.toMatchObject<Partial<ComplianceError>>({
      code: 'MARKET_NOT_CONFIGURED',
      status: 404,
    });
    expect(readDb.query).toHaveBeenCalledTimes(1);
  });

  it('accepts only a currently active consent requirement and records immutable events', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{
        requirement_code: 'terms_of_service',
        document_type: 'terms',
        document_version: 'terms-id-jk-v1',
        locale: 'id-ID',
        purpose: 'service_access',
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: '00000000-0000-4000-8000-000000000002',
        subject_role: 'customer',
        market_code: 'id-jk',
        requirement_code: 'terms_of_service',
        document_type: 'terms',
        document_version: 'terms-id-jk-v1',
        locale: 'id-ID',
        purpose: 'service_access',
        decision: 'granted',
      }] });

    const result = await recordComplianceConsent({
      market_code: 'ID-JK',
      requirement_code: 'terms_of_service',
      document_type: 'terms',
      document_version: 'terms-id-jk-v1',
      locale: 'id-ID',
      purpose: 'service_access',
      consent: true,
    }, {
      id: '00000000-0000-4000-8000-000000000001',
      role: 'customer',
    }, {
      ipAddress: '127.0.0.1',
      userAgent: 'compliance-test',
    });

    expect(result).toEqual(expect.objectContaining({ decision: 'granted', subject_role: 'customer' }));
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO market_compliance_consent_events');
    expect(db.query.mock.calls[1][0]).not.toContain('ON CONFLICT');
    expect(db.query.mock.calls[1][1]).toEqual(expect.arrayContaining([
      '00000000-0000-4000-8000-000000000001',
      'customer',
      'id-jk',
      'terms_of_service',
    ]));
  });

  it('rejects stale or mismatched document consent', async () => {
    db.query.mockResolvedValueOnce({ rows: [{
      requirement_code: 'terms_of_service',
      document_type: 'terms',
      document_version: 'terms-id-jk-v2',
      locale: 'id-ID',
      purpose: 'service_access',
    }] });

    await expect(recordComplianceConsent({
      market_code: 'id-jk',
      requirement_code: 'terms_of_service',
      document_type: 'terms',
      document_version: 'terms-id-jk-v1',
      locale: 'id-ID',
      purpose: 'service_access',
      consent: true,
    }, { id: '00000000-0000-4000-8000-000000000001', role: 'customer' })).rejects.toMatchObject<Partial<ComplianceError>>({
      code: 'COMPLIANCE_REQUIREMENT_NOT_ACTIVE',
      status: 409,
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});
