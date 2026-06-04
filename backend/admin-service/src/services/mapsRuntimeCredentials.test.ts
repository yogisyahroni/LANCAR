const mockDbQuery = jest.fn();
const mockReadDbQuery = jest.fn();
const mockConnect = jest.fn();
const mockRedisDel = jest.fn();

jest.mock('../db', () => ({
  db: {
    query: mockDbQuery,
    connect: mockConnect,
  },
  readDb: {
    query: mockReadDbQuery,
  },
}));

jest.mock('../redis', () => ({
  redis: {
    del: mockRedisDel,
  },
}));

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const {
  createMapsRuntimeCredential,
  decryptMapsCredentialSecret,
  encryptMapsCredentialSecret,
  getActiveGoogleMapsServerCredential,
  listMapsRuntimeCredentials,
  resetMapsRuntimeCredentialCacheForTests,
  validateGoogleMapsServerKey,
} = require('./mapsRuntimeCredentials') as typeof import('./mapsRuntimeCredentials');

describe('mapsRuntimeCredentials', () => {
  const axios = jest.requireMock('axios');
  const validApiKey = `AI${'za'}abcdefghijklmnopqrstuvwxyz1234567890`;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MAPS_CREDENTIAL_ENCRYPTION_KEY = Buffer.from('12345678901234567890123456789012').toString('base64');
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_ROUTES_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;
    resetMapsRuntimeCredentialCacheForTests();
  });

  it('encrypts and decrypts Google Maps credentials without storing plaintext', () => {
    const encrypted = encryptMapsCredentialSecret(validApiKey);

    expect(encrypted.encryptedSecret).not.toContain(validApiKey);
    expect(encrypted.encryptionKid).toMatch(/^local-aes-gcm:/);
    expect(decryptMapsCredentialSecret(encrypted.encryptedSecret)).toBe(validApiKey);
  });

  it('validates a server key through mandatory geocode and route checks', async () => {
    axios.get.mockResolvedValue({
      data: {
        status: 'OK',
        results: [{ formatted_address: 'Jakarta, Indonesia' }],
      },
    });
    axios.post.mockResolvedValue({
      data: {
        routes: [
          {
            distanceMeters: 4200,
            polyline: { encodedPolyline: 'encoded-route' },
          },
        ],
      },
    });

    const validation = await validateGoogleMapsServerKey(validApiKey);

    expect(validation.status).toBe('valid');
    expect(validation.error_code).toBeNull();
    expect(validation.checks.every((check) => check.status === 'passed')).toBe(true);
  });

  it('classifies rejected Google keys without leaking the key', async () => {
    axios.get.mockResolvedValue({
      data: {
        status: 'REQUEST_DENIED',
        error_message: 'API key is not authorized',
      },
    });
    axios.post.mockRejectedValue({
      response: {
        data: {
          error: {
            status: 'PERMISSION_DENIED',
            message: 'API key rejected',
          },
        },
      },
    });

    const validation = await validateGoogleMapsServerKey(validApiKey);

    expect(validation.status).toBe('invalid');
    expect(['REQUEST_DENIED', 'PERMISSION_DENIED']).toContain(validation.error_code);
    expect(JSON.stringify(validation)).not.toContain(validApiKey);
  });

  it('lists credentials as masked metadata only', async () => {
    mockReadDbQuery.mockResolvedValue({
      rows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          provider: 'google_maps',
          scope: 'server',
          key_alias: 'staging-google',
          key_mask: 'AIzaab...7890',
          secret_fingerprint: 'f'.repeat(64),
          enabled_apis: ['geocoding', 'routes'],
          restriction_type: 'server_ip',
          is_active: true,
          last_validation_status: 'valid',
          last_error_code: null,
          last_validated_at: '2026-06-04T00:00:00.000Z',
          created_by: null,
          activated_by: null,
          created_at: '2026-06-04T00:00:00.000Z',
          updated_at: '2026-06-04T00:00:00.000Z',
          activated_at: '2026-06-04T00:00:00.000Z',
          deactivated_at: null,
          encrypted_secret: 'ciphertext-must-not-return',
        },
      ],
    });

    const credentials = await listMapsRuntimeCredentials();

    expect(credentials[0]).toEqual(expect.objectContaining({
      key_alias: 'staging-google',
      key_mask: 'AIzaab...7890',
      is_active: true,
    }));
    expect(JSON.stringify(credentials)).not.toContain('ciphertext-must-not-return');
    expect(JSON.stringify(credentials)).not.toContain(validApiKey);
  });

  it('resolves the active runtime credential from encrypted store before env fallback', async () => {
    const encrypted = encryptMapsCredentialSecret(validApiKey);
    mockReadDbQuery.mockResolvedValue({
      rows: [
        {
          id: '22222222-2222-2222-2222-222222222222',
          key_alias: 'runtime-google',
          encrypted_secret: encrypted.encryptedSecret,
          secret_fingerprint: 'a'.repeat(64),
        },
      ],
    });

    const credential = await getActiveGoogleMapsServerCredential();

    expect(credential).toEqual(expect.objectContaining({
      source: 'runtime_store',
      apiKey: validApiKey,
      keyAlias: 'runtime-google',
    }));
  });

  it('stores invalid credentials encrypted and inactive without writing plaintext to database', async () => {
    axios.get.mockResolvedValue({ data: { status: 'REQUEST_DENIED' } });
    axios.post.mockRejectedValue({
      response: {
        data: {
          error: { status: 'PERMISSION_DENIED' },
        },
      },
    });

    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockConnect.mockResolvedValue(mockClient);
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO maps_provider_credentials')) {
        return {
          rows: [
            {
              id: '33333333-3333-3333-3333-333333333333',
              provider: 'google_maps',
              scope: 'server',
              key_alias: 'bad-key',
              key_mask: 'AIzaab...7890',
              secret_fingerprint: 'b'.repeat(64),
              enabled_apis: ['geocoding', 'routes'],
              restriction_type: 'server_ip',
              is_active: false,
              last_validation_status: 'invalid',
              last_error_code: 'REQUEST_DENIED',
              last_validated_at: '2026-06-04T00:00:00.000Z',
              created_by: '44444444-4444-4444-4444-444444444444',
              activated_by: null,
              created_at: '2026-06-04T00:00:00.000Z',
              updated_at: '2026-06-04T00:00:00.000Z',
              activated_at: null,
              deactivated_at: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await createMapsRuntimeCredential(
      {
        key_alias: 'bad-key',
        api_key: validApiKey,
        restriction_type: 'server_ip',
        activate: true,
      },
      '44444444-4444-4444-4444-444444444444'
    );

    expect(result.credential.is_active).toBe(false);
    expect(result.validation.status).toBe('invalid');
    const dbCalls = JSON.stringify(mockClient.query.mock.calls);
    expect(dbCalls).not.toContain(validApiKey);
  });
});
