export type SupportedClientType = 'customer' | 'courier' | 'merchant' | 'web';
export type SupportedMobileClientType = Exclude<SupportedClientType, 'web'>;

export type ClientCompatibilityStatus = 'compatible' | 'upgrade_required' | 'unknown';

export type ClientCompatibility = {
  clientType: SupportedClientType | null;
  appVersion: string | null;
  appVersionCode: number | null;
  schemaVersion: number | null;
  capabilities: string[];
  status: ClientCompatibilityStatus;
  upgradeRequired: boolean;
  dynamicFeaturesEnabled: boolean;
  reason: string | null;
};

export type ClientCompatibilityPolicy = {
  minimumSupportedVersionCode: number;
  minimumSupportedVersionName: string;
  currentApiSchemaVersion: number;
  supportedApiSchemaVersions: number[];
};

const defaultPolicy: ClientCompatibilityPolicy = {
  minimumSupportedVersionCode: 1,
  minimumSupportedVersionName: '1.0.0',
  currentApiSchemaVersion: 1,
  supportedApiSchemaVersions: [1],
};

export const supportedClientTypes: SupportedClientType[] = ['customer', 'courier', 'merchant', 'web'];
export const supportedMobileClientTypes: SupportedMobileClientType[] = ['customer', 'courier', 'merchant'];

const envNumber = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const policyFor = (clientType: SupportedClientType): ClientCompatibilityPolicy => ({
  ...defaultPolicy,
  minimumSupportedVersionCode: envNumber(
    `MOBILE_${clientType.toUpperCase()}_MIN_VERSION_CODE`,
    defaultPolicy.minimumSupportedVersionCode,
  ),
});

export const getClientCompatibilityPolicy = (clientType: SupportedClientType): ClientCompatibilityPolicy =>
  policyFor(clientType);

const firstHeader = (headers: Record<string, unknown>, name: string): string | null => {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0].trim() || null : null;
  return typeof value === 'string' ? value.trim() || null : null;
};

const positiveIntegerHeader = (headers: Record<string, unknown>, name: string): number | null => {
  const raw = firstHeader(headers, name);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

const normalizeClientType = (value: string | null): SupportedClientType | null => {
  return value && supportedClientTypes.includes(value as SupportedClientType)
    ? value as SupportedClientType
    : null;
};

const parseCapabilities = (raw: string | null): string[] => {
  if (!raw) return [];

  const values = raw.trim().startsWith('[')
    ? (() => {
        try {
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
    : raw.split(',');

  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 100);
};

export const readClientCompatibility = (
  headers: Record<string, unknown>,
  expectedType?: SupportedClientType,
): ClientCompatibility => {
  const clientType = expectedType || normalizeClientType(firstHeader(headers, 'x-app-type'));
  const appVersion = firstHeader(headers, 'x-app-version');
  const appVersionCode = positiveIntegerHeader(headers, 'x-app-version-code');
  const schemaVersion = positiveIntegerHeader(headers, 'x-app-schema-version');
  const capabilities = parseCapabilities(firstHeader(headers, 'x-app-capabilities'));

  if (!clientType || !appVersionCode || !schemaVersion) {
    return {
      clientType,
      appVersion,
      appVersionCode,
      schemaVersion,
      capabilities,
      status: 'unknown',
      upgradeRequired: false,
      dynamicFeaturesEnabled: false,
      reason: 'client_version_or_schema_missing',
    };
  }

  const policy = policyFor(clientType);
  if (appVersionCode < policy.minimumSupportedVersionCode) {
    return {
      clientType,
      appVersion,
      appVersionCode,
      schemaVersion,
      capabilities,
      status: 'upgrade_required',
      upgradeRequired: true,
      dynamicFeaturesEnabled: false,
      reason: 'minimum_client_version_not_met',
    };
  }

  if (!policy.supportedApiSchemaVersions.includes(schemaVersion)) {
    return {
      clientType,
      appVersion,
      appVersionCode,
      schemaVersion,
      capabilities,
      status: 'upgrade_required',
      upgradeRequired: true,
      dynamicFeaturesEnabled: false,
      reason: 'unsupported_api_schema',
    };
  }

  return {
    clientType,
    appVersion,
    appVersionCode,
    schemaVersion,
    capabilities,
    status: 'compatible',
    upgradeRequired: false,
    dynamicFeaturesEnabled: true,
    reason: null,
  };
};

const numberConfig = (config: Record<string, unknown>, key: string): number | null => {
  const value = config[key];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

export const isDynamicFeatureSupported = (
  config: unknown,
  compatibility: ClientCompatibility,
): boolean => {
  if (!compatibility.dynamicFeaturesEnabled) return false;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return true;

  const normalized = config as Record<string, unknown>;
  const minimumVersionCode = numberConfig(normalized, 'min_app_version_code');
  if (minimumVersionCode && (compatibility.appVersionCode || 0) < minimumVersionCode) return false;

  const requiredSchemaVersion = numberConfig(normalized, 'required_schema_version');
  if (requiredSchemaVersion && (compatibility.schemaVersion || 0) < requiredSchemaVersion) return false;

  const requiredCapabilities = Array.isArray(normalized.required_capabilities)
    ? normalized.required_capabilities
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
    : [];
  return requiredCapabilities.every((capability) => compatibility.capabilities.includes(capability));
};

export const compatibilityResponse = (
  compatibility: ClientCompatibility,
  policy: ClientCompatibilityPolicy,
) => ({
  status: compatibility.status,
  upgrade_required: compatibility.upgradeRequired,
  dynamic_features_enabled: compatibility.dynamicFeaturesEnabled,
  reason: compatibility.reason,
  minimum_supported_version_code: policy.minimumSupportedVersionCode,
  minimum_supported_version_name: policy.minimumSupportedVersionName,
  current_api_schema_version: policy.currentApiSchemaVersion,
  supported_api_schema_versions: policy.supportedApiSchemaVersions,
});
