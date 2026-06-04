import axios from 'axios';
import crypto from 'crypto';
import { db, readDb } from '../db';
import { redis } from '../redis';
import { securityLog } from '../security/logRedaction';

type Queryable = {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
};

type TransactionClient = Queryable & {
  release: () => void;
};

export type MapsCredentialValidationStatus = 'untested' | 'valid' | 'invalid';
export type MapsCredentialAction = 'created' | 'validated' | 'activated' | 'deactivated';

export type MapsCredentialSummary = {
  id: string;
  provider: 'google_maps';
  scope: string;
  key_alias: string;
  key_mask: string;
  secret_fingerprint: string;
  enabled_apis: string[];
  restriction_type: string;
  is_active: boolean;
  last_validation_status: MapsCredentialValidationStatus;
  last_error_code: string | null;
  last_validated_at: string | null;
  created_by: string | null;
  activated_by: string | null;
  created_at: string;
  updated_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
};

export type GoogleServerCredential = {
  source: 'runtime_store' | 'environment';
  apiKey: string;
  keyAlias: string;
  credentialId: string | null;
  cacheKey: string;
};

export type MapsCredentialValidationCheck = {
  name: 'geocode' | 'route';
  status: 'passed' | 'failed';
  provider_status?: string | null;
  error_code?: string | null;
  latency_ms: number;
};

export type MapsCredentialValidationResult = {
  status: MapsCredentialValidationStatus;
  checks: MapsCredentialValidationCheck[];
  error_code: string | null;
  message: string;
};

export type CreateMapsCredentialInput = {
  provider?: unknown;
  scope?: unknown;
  key_alias?: unknown;
  api_key?: unknown;
  enabled_apis?: unknown;
  restriction_type?: unknown;
  activate?: unknown;
};

export class MapsCredentialError extends Error {
  statusCode: number;
  code: string;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'MapsCredentialError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const VALID_ENABLED_APIS = new Set(['geocoding', 'routes', 'directions']);
const VALID_RESTRICTION_TYPES = new Set(['server_ip', 'http_referrer', 'android', 'ios', 'unrestricted', 'unknown']);
const API_KEY_PATTERN = /^AIza[0-9A-Za-z_-]{20,}$/;
const LOCAL_DEV_ENCRYPTION_SEED = 'tembus-local-maps-runtime-credential-key';

let activeCredentialCache: { expiresAt: number; credential: GoogleServerCredential | null } | null = null;

export const resetMapsRuntimeCredentialCacheForTests = () => {
  activeCredentialCache = null;
};

const envText = (name: string): string | null => {
  const value = process.env[name]?.trim();
  return value ? value : null;
};

const isProductionRuntime = () =>
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

const isMissingCredentialTableError = (error: any) => (
  error?.code === '42P01' ||
  String(error?.message || '').includes('maps_provider_credentials') ||
  String(error?.message || '').includes('maps_provider_credential_events')
);

const normalizeText = (value: unknown, fallback = '') => (
  typeof value === 'string' ? value.trim() : fallback
);

const sanitizeAlias = (value: unknown) => {
  const normalized = normalizeText(value, 'google-maps-runtime').replace(/\s+/g, '-').toLowerCase();
  const safe = normalized.replace(/[^a-z0-9._:-]/g, '').slice(0, 80);
  return safe || `google-maps-${Date.now().toString(36)}`;
};

const normalizeScope = (value: unknown) => {
  const normalized = normalizeText(value, 'server').toLowerCase();
  return /^[a-z0-9_-]{2,40}$/.test(normalized) ? normalized : 'server';
};

const normalizeRestrictionType = (value: unknown) => {
  const normalized = normalizeText(value, 'unknown').toLowerCase();
  return VALID_RESTRICTION_TYPES.has(normalized) ? normalized : 'unknown';
};

const normalizeEnabledApis = (value: unknown) => {
  if (!Array.isArray(value)) return ['geocoding', 'routes'];
  const normalized = value
    .map((item) => normalizeText(item).toLowerCase())
    .filter((item) => VALID_ENABLED_APIS.has(item));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : ['geocoding', 'routes'];
};

const normalizeActivateFlag = (value: unknown) => value === true || value === 'true';

const normalizeApiKey = (value: unknown) => {
  const apiKey = normalizeText(value);
  if (!apiKey) {
    throw new MapsCredentialError('api_key_required', 'Google Maps API key is required.');
  }
  if (!API_KEY_PATTERN.test(apiKey)) {
    throw new MapsCredentialError('api_key_format_invalid', 'Google Maps API key format is invalid.');
  }
  return apiKey;
};

export const maskGoogleApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 10) return '****';
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
};

const fingerprintSecret = (apiKey: string) =>
  crypto.createHash('sha256').update(apiKey).digest('hex');

const parseConfiguredEncryptionKey = (): Buffer => {
  const raw = envText('MAPS_CREDENTIAL_ENCRYPTION_KEY') || envText('MAPS_RUNTIME_CREDENTIAL_KEY');
  if (!raw) {
    if (isProductionRuntime()) {
      throw new MapsCredentialError(
        'maps_credential_encryption_key_missing',
        'MAPS_CREDENTIAL_ENCRYPTION_KEY is required before storing runtime credentials in production.',
        503
      );
    }
    return crypto.createHash('sha256').update(LOCAL_DEV_ENCRYPTION_SEED).digest();
  }

  const value = raw.startsWith('base64:') ? raw.slice('base64:'.length) : raw;
  const base64Candidate = Buffer.from(value, 'base64');
  if (base64Candidate.length === 32) return base64Candidate;

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, 'hex');
  }

  if (value.length >= 32) {
    return crypto.createHash('sha256').update(value).digest();
  }

  throw new MapsCredentialError(
    'maps_credential_encryption_key_weak',
    'MAPS_CREDENTIAL_ENCRYPTION_KEY must be 32 bytes base64, 64 hex chars, or a strong passphrase.',
    503
  );
};

const encryptionKid = (key: Buffer) =>
  `local-aes-gcm:${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;

export const encryptMapsCredentialSecret = (plaintext: string) => {
  const key = parseConfiguredEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedSecret: [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':'),
    encryptionKid: encryptionKid(key),
  };
};

export const decryptMapsCredentialSecret = (encryptedSecret: string) => {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = encryptedSecret.split(':');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new MapsCredentialError('maps_credential_ciphertext_invalid', 'Stored maps credential ciphertext is invalid.', 500);
  }
  const key = parseConfiguredEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivEncoded, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

const toCredentialSummary = (row: any): MapsCredentialSummary => ({
  id: String(row.id),
  provider: 'google_maps',
  scope: String(row.scope || 'server'),
  key_alias: String(row.key_alias || 'google-maps-runtime'),
  key_mask: String(row.key_mask || 'stored-secret'),
  secret_fingerprint: String(row.secret_fingerprint || '').slice(0, 16),
  enabled_apis: Array.isArray(row.enabled_apis) ? row.enabled_apis.map(String) : [],
  restriction_type: String(row.restriction_type || 'unknown'),
  is_active: Boolean(row.is_active),
  last_validation_status: ['valid', 'invalid', 'untested'].includes(String(row.last_validation_status))
    ? row.last_validation_status
    : 'untested',
  last_error_code: row.last_error_code || null,
  last_validated_at: row.last_validated_at || null,
  created_by: row.created_by || null,
  activated_by: row.activated_by || null,
  created_at: row.created_at,
  updated_at: row.updated_at,
  activated_at: row.activated_at || null,
  deactivated_at: row.deactivated_at || null,
});

const classifyGoogleErrorCode = (error: any) => {
  const raw = String(
    error?.response?.data?.error?.status ||
    error?.response?.data?.error?.message ||
    error?.response?.data?.status ||
    error?.code ||
    error?.message ||
    'GOOGLE_MAPS_VALIDATION_FAILED'
  );
  const upper = raw.toUpperCase();
  if (upper.includes('BILLING')) return 'BILLING_DISABLED';
  if (upper.includes('REQUEST_DENIED')) return 'REQUEST_DENIED';
  if (upper.includes('PERMISSION_DENIED')) return 'PERMISSION_DENIED';
  if (upper.includes('OVER_QUERY_LIMIT') || upper.includes('RESOURCE_EXHAUSTED')) return 'OVER_QUERY_LIMIT';
  if (upper.includes('API_KEY_INVALID') || upper.includes('INVALID_KEY')) return 'API_KEY_INVALID';
  if (upper.includes('API_NOT_ACTIVATED') || upper.includes('SERVICE_DISABLED')) return 'API_DISABLED';
  if (upper.includes('REFERER') || upper.includes('ANDROID') || upper.includes('IP')) return 'KEY_RESTRICTION_MISMATCH';
  return upper.replace(/[^A-Z0-9_:-]/g, '_').slice(0, 80) || 'GOOGLE_MAPS_VALIDATION_FAILED';
};

const validationMessage = (errorCode: string | null) => {
  if (!errorCode) return 'Credential validation passed.';
  if (errorCode === 'REQUEST_DENIED' || errorCode === 'PERMISSION_DENIED') {
    return 'Google rejected the key. Check API enablement, billing, and key restrictions.';
  }
  if (errorCode === 'BILLING_DISABLED') return 'Google Cloud billing is not active for this key project.';
  if (errorCode === 'OVER_QUERY_LIMIT') return 'Google Maps quota is exhausted or too low.';
  if (errorCode === 'KEY_RESTRICTION_MISMATCH') return 'The key restriction does not match server-side usage.';
  if (errorCode === 'API_DISABLED') return 'Required Google Maps APIs are not enabled.';
  return 'Google Maps credential validation failed.';
};

const assertAllowlistedGoogleEndpoint = (endpoint: string, allowedHostsEnv: string, defaultHosts: string) => {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new MapsCredentialError('google_endpoint_protocol_not_allowed', 'Google validation endpoint protocol is not allowed.', 500);
  }
  const allowedHosts = new Set(
    (envText(allowedHostsEnv) || defaultHosts)
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean)
  );
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new MapsCredentialError('google_endpoint_host_not_allowed', 'Google validation endpoint host is not allowlisted.', 500);
  }
  return parsed.toString();
};

const googleGeocodeEndpoint = () => assertAllowlistedGoogleEndpoint(
  envText('GOOGLE_GEOCODING_API_URL') || 'https://maps.googleapis.com/maps/api/geocode/json',
  'GOOGLE_GEOCODING_ALLOWED_HOSTS',
  'maps.googleapis.com,localhost,127.0.0.1,host.docker.internal'
);

const googleRoutesEndpoint = () => assertAllowlistedGoogleEndpoint(
  envText('GOOGLE_ROUTES_API_URL') || 'https://routes.googleapis.com/directions/v2:computeRoutes',
  'GOOGLE_ROUTES_ALLOWED_HOSTS',
  'routes.googleapis.com,localhost,127.0.0.1,host.docker.internal'
);

const validationTimeoutMs = () => {
  const parsed = Number(envText('GOOGLE_MAPS_CREDENTIAL_TEST_TIMEOUT_MS') || 4500);
  return Number.isFinite(parsed) && parsed >= 1000 && parsed <= 15000 ? parsed : 4500;
};

const runGoogleGeocodeValidation = async (apiKey: string): Promise<MapsCredentialValidationCheck> => {
  const startedAt = Date.now();
  try {
    const response = await axios.get(googleGeocodeEndpoint(), {
      params: {
        address: 'Jakarta, Indonesia',
        key: apiKey,
      },
      timeout: validationTimeoutMs(),
    });
    const providerStatus = String(response.data?.status || '');
    if (providerStatus !== 'OK') {
      throw new MapsCredentialError(providerStatus || 'GOOGLE_GEOCODING_NOT_OK', 'Google geocode validation failed.');
    }
    return {
      name: 'geocode',
      status: 'passed',
      provider_status: providerStatus,
      latency_ms: Date.now() - startedAt,
    };
  } catch (error: any) {
    const errorCode = error instanceof MapsCredentialError ? error.code : classifyGoogleErrorCode(error);
    return {
      name: 'geocode',
      status: 'failed',
      provider_status: error?.response?.data?.status || null,
      error_code: errorCode,
      latency_ms: Date.now() - startedAt,
    };
  }
};

const runGoogleRouteValidation = async (apiKey: string): Promise<MapsCredentialValidationCheck> => {
  const startedAt = Date.now();
  try {
    const response = await axios.post(
      googleRoutesEndpoint(),
      {
        origin: { location: { latLng: { latitude: -6.2088, longitude: 106.8456 } } },
        destination: { location: { latLng: { latitude: -6.1754, longitude: 106.8272 } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        languageCode: 'id-ID',
        units: 'METRIC',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
        },
        timeout: validationTimeoutMs(),
      }
    );
    const route = response.data?.routes?.[0];
    if (!route || !route.distanceMeters || !route.polyline?.encodedPolyline) {
      throw new MapsCredentialError('GOOGLE_ROUTES_SAMPLE_INVALID', 'Google route validation did not return route geometry.');
    }
    return {
      name: 'route',
      status: 'passed',
      provider_status: 'OK',
      latency_ms: Date.now() - startedAt,
    };
  } catch (error: any) {
    const errorCode = error instanceof MapsCredentialError ? error.code : classifyGoogleErrorCode(error);
    return {
      name: 'route',
      status: 'failed',
      provider_status: error?.response?.data?.error?.status || error?.response?.data?.status || null,
      error_code: errorCode,
      latency_ms: Date.now() - startedAt,
    };
  }
};

export const validateGoogleMapsServerKey = async (apiKey: string): Promise<MapsCredentialValidationResult> => {
  const checks = [
    await runGoogleGeocodeValidation(apiKey),
    await runGoogleRouteValidation(apiKey),
  ];
  const failed = checks.find((check) => check.status === 'failed');
  const errorCode = failed?.error_code || null;
  return {
    status: failed ? 'invalid' : 'valid',
    checks,
    error_code: errorCode,
    message: validationMessage(errorCode),
  };
};

const writeCredentialAudit = async (
  client: Queryable,
  action: MapsCredentialAction,
  actorId: string | null,
  credentialId: string | null,
  metadata: Record<string, unknown>
) => {
  const safeMetadata = {
    provider: 'google_maps',
    key_alias: metadata.key_alias,
    validation_status: metadata.validation_status,
    error_code: metadata.error_code,
    activated_previous_id: metadata.activated_previous_id,
  };
  try {
    await client.query(
      `INSERT INTO maps_provider_credential_events
       (credential_id, action, actor_id, key_alias, validation_status, error_code, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        credentialId,
        action,
        actorId,
        metadata.key_alias || null,
        metadata.validation_status || null,
        metadata.error_code || null,
        JSON.stringify(safeMetadata),
      ]
    );
  } catch (error) {
    if (!isMissingCredentialTableError(error)) throw error;
  }

  if (!actorId || !credentialId) return;
  try {
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_id, payload)
       VALUES ($1, $2, $3, $4)`,
      [actorId, `maps_credential.${action}`, credentialId, JSON.stringify(safeMetadata)]
    );
  } catch (error) {
    if (!isMissingCredentialTableError(error)) {
      securityLog.warn('Failed to write maps credential audit log', { action, credential_id: credentialId, error });
    }
  }
};

const invalidateMapsCredentialCache = async () => {
  activeCredentialCache = null;
  try {
    if (typeof (redis as any).del === 'function') {
      await (redis as any).del('maps:runtime:active-google-credential');
    }
  } catch (error) {
    securityLog.warn('Failed to invalidate maps credential redis cache', { error });
  }
};

export const listMapsRuntimeCredentials = async (): Promise<MapsCredentialSummary[]> => {
  try {
    const result = await readDb.query(
      `SELECT id, provider, scope, key_alias, key_mask, secret_fingerprint, enabled_apis,
              restriction_type, is_active, last_validation_status, last_error_code,
              last_validated_at, created_by, activated_by, created_at, updated_at,
              activated_at, deactivated_at
       FROM maps_provider_credentials
       WHERE deleted_at IS NULL
       ORDER BY is_active DESC, updated_at DESC
       LIMIT 50`
    );
    return result.rows.map(toCredentialSummary);
  } catch (error) {
    if (isMissingCredentialTableError(error)) return [];
    throw error;
  }
};

export const testMapsRuntimeCredentialInput = async (
  input: Pick<CreateMapsCredentialInput, 'api_key'>
): Promise<MapsCredentialValidationResult> => {
  const apiKey = normalizeApiKey(input.api_key);
  return validateGoogleMapsServerKey(apiKey);
};

export const createMapsRuntimeCredential = async (
  input: CreateMapsCredentialInput,
  actorId: string | null
): Promise<{ credential: MapsCredentialSummary; validation: MapsCredentialValidationResult }> => {
  const provider = normalizeText(input.provider, 'google_maps');
  if (provider !== 'google_maps') {
    throw new MapsCredentialError('provider_not_supported', 'Only Google Maps runtime credentials are supported.');
  }
  const apiKey = normalizeApiKey(input.api_key);
  const keyAlias = sanitizeAlias(input.key_alias);
  const scope = normalizeScope(input.scope);
  const enabledApis = normalizeEnabledApis(input.enabled_apis);
  const restrictionType = normalizeRestrictionType(input.restriction_type);
  const activate = normalizeActivateFlag(input.activate);
  const validation = await validateGoogleMapsServerKey(apiKey);
  const encrypted = encryptMapsCredentialSecret(apiKey);
  const fingerprint = fingerprintSecret(apiKey);

  const client = await (db as any).connect() as TransactionClient;
  try {
    await client.query('BEGIN');
    const insertResult = await client.query(
      `INSERT INTO maps_provider_credentials
       (provider, scope, key_alias, key_mask, encrypted_secret, encryption_kid,
        secret_fingerprint, enabled_apis, restriction_type, is_active,
        last_validation_status, last_error_code, last_validated_at, created_by, metadata)
       VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, false, $10, $11, NOW(), $12, $13::jsonb)
       RETURNING id, provider, scope, key_alias, key_mask, secret_fingerprint, enabled_apis,
                 restriction_type, is_active, last_validation_status, last_error_code,
                 last_validated_at, created_by, activated_by, created_at, updated_at,
                 activated_at, deactivated_at`,
      [
        'google_maps',
        scope,
        keyAlias,
        maskGoogleApiKey(apiKey),
        encrypted.encryptedSecret,
        encrypted.encryptionKid,
        fingerprint,
        enabledApis,
        restrictionType,
        validation.status,
        validation.error_code,
        actorId,
        JSON.stringify({
          validation_checks: validation.checks,
          validation_message: validation.message,
        }),
      ]
    );
    let credentialRow = insertResult.rows[0];
    await writeCredentialAudit(client, 'created', actorId, credentialRow.id, {
      key_alias: keyAlias,
      validation_status: validation.status,
      error_code: validation.error_code,
    });

    if (activate && validation.status === 'valid') {
      await client.query(
        `UPDATE maps_provider_credentials
         SET is_active = false, deactivated_at = NOW(), updated_at = NOW()
         WHERE provider = 'google_maps'
           AND is_active = true
           AND id <> $1`,
        [credentialRow.id]
      );
      const activated = await client.query(
        `UPDATE maps_provider_credentials
         SET is_active = true, activated_at = NOW(), deactivated_at = NULL,
             activated_by = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, provider, scope, key_alias, key_mask, secret_fingerprint, enabled_apis,
                   restriction_type, is_active, last_validation_status, last_error_code,
                   last_validated_at, created_by, activated_by, created_at, updated_at,
                   activated_at, deactivated_at`,
        [credentialRow.id, actorId]
      );
      credentialRow = activated.rows[0];
      await writeCredentialAudit(client, 'activated', actorId, credentialRow.id, {
        key_alias: keyAlias,
        validation_status: validation.status,
      });
    }

    await client.query('COMMIT');
    await invalidateMapsCredentialCache();
    return {
      credential: toCredentialSummary(credentialRow),
      validation,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const loadCredentialForUpdate = async (client: Queryable, credentialId: string) => {
  const result = await client.query(
    `SELECT id, encrypted_secret, key_alias, last_validation_status
     FROM maps_provider_credentials
     WHERE id = $1
       AND provider = 'google_maps'
       AND deleted_at IS NULL
     LIMIT 1`,
    [credentialId]
  );
  if (!result.rows[0]) {
    throw new MapsCredentialError('maps_credential_not_found', 'Maps credential was not found.', 404);
  }
  return result.rows[0];
};

export const validateStoredMapsRuntimeCredential = async (
  credentialId: string,
  actorId: string | null
): Promise<{ credential: MapsCredentialSummary; validation: MapsCredentialValidationResult }> => {
  const existing = await loadCredentialForUpdate(readDb, credentialId);
  const apiKey = decryptMapsCredentialSecret(existing.encrypted_secret);
  const validation = await validateGoogleMapsServerKey(apiKey);
  const result = await db.query(
    `UPDATE maps_provider_credentials
     SET last_validation_status = $2, last_error_code = $3, last_validated_at = NOW(),
         metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{last_validation}', $4::jsonb, true),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, provider, scope, key_alias, key_mask, secret_fingerprint, enabled_apis,
               restriction_type, is_active, last_validation_status, last_error_code,
               last_validated_at, created_by, activated_by, created_at, updated_at,
               activated_at, deactivated_at`,
    [
      credentialId,
      validation.status,
      validation.error_code,
      JSON.stringify({
        checks: validation.checks,
        message: validation.message,
      }),
    ]
  );
  await writeCredentialAudit(db, 'validated', actorId, credentialId, {
    key_alias: existing.key_alias,
    validation_status: validation.status,
    error_code: validation.error_code,
  });
  return {
    credential: toCredentialSummary(result.rows[0]),
    validation,
  };
};

export const activateMapsRuntimeCredential = async (
  credentialId: string,
  actorId: string | null
): Promise<{ credential: MapsCredentialSummary; validation: MapsCredentialValidationResult }> => {
  const client = await (db as any).connect() as TransactionClient;
  try {
    await client.query('BEGIN');
    const existing = await loadCredentialForUpdate(client, credentialId);
    const apiKey = decryptMapsCredentialSecret(existing.encrypted_secret);
    const validation = await validateGoogleMapsServerKey(apiKey);
    if (validation.status !== 'valid') {
      await client.query(
        `UPDATE maps_provider_credentials
         SET last_validation_status = $2, last_error_code = $3, last_validated_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [credentialId, validation.status, validation.error_code]
      );
      await writeCredentialAudit(client, 'validated', actorId, credentialId, {
        key_alias: existing.key_alias,
        validation_status: validation.status,
        error_code: validation.error_code,
      });
      await client.query('COMMIT');
      throw new MapsCredentialError(
        validation.error_code || 'maps_credential_validation_failed',
        validation.message,
        422
      );
    }

    await client.query(
      `UPDATE maps_provider_credentials
       SET is_active = false, deactivated_at = NOW(), updated_at = NOW()
       WHERE provider = 'google_maps'
         AND is_active = true
         AND id <> $1`,
      [credentialId]
    );
    const result = await client.query(
      `UPDATE maps_provider_credentials
       SET is_active = true, activated_at = NOW(), deactivated_at = NULL,
           activated_by = $2, last_validation_status = 'valid',
           last_error_code = NULL, last_validated_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, provider, scope, key_alias, key_mask, secret_fingerprint, enabled_apis,
                 restriction_type, is_active, last_validation_status, last_error_code,
                 last_validated_at, created_by, activated_by, created_at, updated_at,
                 activated_at, deactivated_at`,
      [credentialId, actorId]
    );
    await writeCredentialAudit(client, 'activated', actorId, credentialId, {
      key_alias: existing.key_alias,
      validation_status: 'valid',
    });
    await client.query('COMMIT');
    await invalidateMapsCredentialCache();
    return {
      credential: toCredentialSummary(result.rows[0]),
      validation,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateMapsRuntimeCredential = async (
  credentialId: string,
  actorId: string | null,
  reactivatePreviousValid = true
): Promise<{ credential: MapsCredentialSummary; rollback_to: MapsCredentialSummary | null }> => {
  const client = await (db as any).connect() as TransactionClient;
  try {
    await client.query('BEGIN');
    const existing = await loadCredentialForUpdate(client, credentialId);
    const deactivated = await client.query(
      `UPDATE maps_provider_credentials
       SET is_active = false, deactivated_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING id, provider, scope, key_alias, key_mask, secret_fingerprint, enabled_apis,
                 restriction_type, is_active, last_validation_status, last_error_code,
                 last_validated_at, created_by, activated_by, created_at, updated_at,
                 activated_at, deactivated_at`,
      [credentialId]
    );
    let rollbackRow: any = null;
    if (reactivatePreviousValid) {
      const previous = await client.query(
        `SELECT id
         FROM maps_provider_credentials
         WHERE provider = 'google_maps'
           AND id <> $1
           AND deleted_at IS NULL
           AND last_validation_status = 'valid'
         ORDER BY activated_at DESC NULLS LAST, updated_at DESC
         LIMIT 1`,
        [credentialId]
      );
      if (previous.rows[0]?.id) {
        await client.query(
          `UPDATE maps_provider_credentials
           SET is_active = false, deactivated_at = NOW(), updated_at = NOW()
           WHERE provider = 'google_maps'
             AND is_active = true`,
        );
        const activated = await client.query(
          `UPDATE maps_provider_credentials
           SET is_active = true, activated_at = NOW(), deactivated_at = NULL,
               activated_by = $2, updated_at = NOW()
           WHERE id = $1
           RETURNING id, provider, scope, key_alias, key_mask, secret_fingerprint, enabled_apis,
                     restriction_type, is_active, last_validation_status, last_error_code,
                     last_validated_at, created_by, activated_by, created_at, updated_at,
                     activated_at, deactivated_at`,
          [previous.rows[0].id, actorId]
        );
        rollbackRow = activated.rows[0];
      }
    }
    await writeCredentialAudit(client, 'deactivated', actorId, credentialId, {
      key_alias: existing.key_alias,
      activated_previous_id: rollbackRow?.id || null,
    });
    await client.query('COMMIT');
    await invalidateMapsCredentialCache();
    return {
      credential: toCredentialSummary(deactivated.rows[0]),
      rollback_to: rollbackRow ? toCredentialSummary(rollbackRow) : null,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const environmentGoogleServerCredential = (): GoogleServerCredential | null => {
  const apiKey = envText('GOOGLE_ROUTES_API_KEY') || envText('GOOGLE_MAPS_API_KEY') || envText('GOOGLE_DIRECTIONS_API_KEY');
  if (!apiKey) return null;
  return {
    source: 'environment',
    apiKey,
    keyAlias: envText('GOOGLE_MAPS_SERVER_KEY_ALIAS') || 'env-google-maps',
    credentialId: null,
    cacheKey: `env:${fingerprintSecret(apiKey).slice(0, 16)}`,
  };
};

const credentialCacheTtlMs = () => {
  const parsed = Number(envText('MAPS_RUNTIME_CREDENTIAL_CACHE_TTL_SECONDS') || 30);
  const seconds = Number.isFinite(parsed) && parsed >= 5 && parsed <= 300 ? parsed : 30;
  return seconds * 1000;
};

export const getActiveGoogleMapsServerCredential = async (): Promise<GoogleServerCredential | null> => {
  const now = Date.now();
  if (activeCredentialCache && activeCredentialCache.expiresAt > now) {
    return activeCredentialCache.credential;
  }

  try {
    const result = await readDb.query(
      `SELECT id, key_alias, encrypted_secret, secret_fingerprint
       FROM maps_provider_credentials
       WHERE provider = 'google_maps'
         AND is_active = true
         AND deleted_at IS NULL
         AND last_validation_status = 'valid'
       ORDER BY activated_at DESC, updated_at DESC
       LIMIT 1`
    );
    const row = result.rows[0];
    if (row?.encrypted_secret) {
      const apiKey = decryptMapsCredentialSecret(row.encrypted_secret);
      const credential = {
        source: 'runtime_store',
        apiKey,
        keyAlias: String(row.key_alias || 'google-maps-runtime'),
        credentialId: String(row.id),
        cacheKey: `runtime:${String(row.id)}:${String(row.secret_fingerprint || '').slice(0, 16)}`,
      } satisfies GoogleServerCredential;
      activeCredentialCache = { credential, expiresAt: now + credentialCacheTtlMs() };
      return credential;
    }
    if (row?.id) {
      securityLog.warn('Runtime Google Maps credential row is missing encrypted secret, falling back to environment', {
        credentialId: row.id,
      });
    }
  } catch (error) {
    if (!isMissingCredentialTableError(error)) {
      securityLog.warn('Runtime Google Maps credential lookup failed, falling back to environment', { error });
    }
  }

  const fallback = environmentGoogleServerCredential();
  activeCredentialCache = { credential: fallback, expiresAt: now + credentialCacheTtlMs() };
  return fallback;
};

export const hasGoogleMapsServerCredential = async () => Boolean(await getActiveGoogleMapsServerCredential());
