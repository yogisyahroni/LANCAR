import { api } from './api';

export type FeatureFlagVariant = string | number | boolean;

export interface FeatureFlagState {
  enabled: boolean;
  variant: FeatureFlagVariant | null;
}

export type FeatureFlagStateMap = Record<string, FeatureFlagState>;

const CACHE_STORAGE_KEY = 'tembus_customer_feature_flags_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const FLAGS_ENDPOINT = '/auth/web/feature-flags';

interface CachePayload {
  fetchedAt: number;
  flags: FeatureFlagStateMap;
}

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
};

const asVariant = (value: unknown): FeatureFlagVariant | null => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return null;
};

const normalizeEntry = (raw: Record<string, unknown>): FeatureFlagState => {
  let enabled = asBoolean(raw.is_enabled);
  if (enabled === null) enabled = asBoolean(raw.enabled);

  let variant: FeatureFlagVariant | null = null;
  const config = raw.config;
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    const configRecord = config as Record<string, unknown>;
    for (const candidateKey of ['variant', 'value', 'variant_value']) {
      variant = asVariant(configRecord[candidateKey]);
      if (variant !== null) break;
    }
    if (enabled === null) enabled = asBoolean(configRecord.enabled);
  }
  if (variant === null) variant = asVariant(raw.variant);
  if (variant === null) variant = asVariant(raw.value);

  return {
    enabled: enabled ?? false,
    variant,
  };
};

const normalizeFlagsPayload = (payload: unknown): FeatureFlagStateMap => {
  const result: FeatureFlagStateMap = {};

  const consumeRow = (key: unknown, value: unknown) => {
    if (typeof key !== 'string' || !key) return;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = normalizeEntry(value as Record<string, unknown>);
      return;
    }
    const primitiveEnabled = asBoolean(value);
    const primitiveVariant = asVariant(value);
    result[key] = {
      enabled: primitiveEnabled ?? false,
      variant: primitiveVariant,
    };
  };

  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (!row || typeof row !== 'object') continue;
      consumeRow((row as Record<string, unknown>).key, row);
    }
    return result;
  }

  if (!payload || typeof payload !== 'object') return result;

  const record = payload as Record<string, unknown>;
  if (record.flags && typeof record.flags === 'object') {
    if (Array.isArray(record.flags)) {
      return normalizeFlagsPayload(record.flags);
    }
    const flagsRecord = record.flags as Record<string, unknown>;
    for (const [key, value] of Object.entries(flagsRecord)) {
      consumeRow(key, value);
    }
    return result;
  }

  for (const [key, value] of Object.entries(record)) {
    consumeRow(key, value);
  }
  return result;
};

let memoryCache: CachePayload | null = null;
let inflightRequest: Promise<FeatureFlagStateMap> | null = null;

const readLocalStorageCache = (): CachePayload | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachePayload>;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.flags) return null;
    return { fetchedAt: parsed.fetchedAt, flags: parsed.flags };
  } catch {
    return null;
  }
};

const writeCaches = (payload: CachePayload) => {
  memoryCache = payload;
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage may be unavailable (quota/private mode); memory cache still applies.
  }
};

const isCacheFresh = (payload: CachePayload | null) =>
  Boolean(payload) && Date.now() - (payload?.fetchedAt ?? 0) < CACHE_TTL_MS;

const fetchFlagsFromServer = async (): Promise<FeatureFlagStateMap> => {
  try {
    const response = await api.get(FLAGS_ENDPOINT);
    return normalizeFlagsPayload(response.data);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return {};
    }
    throw error;
  }
};

export const loadFeatureFlags = async (
  options: { forceRefresh?: boolean } = {}
): Promise<FeatureFlagStateMap> => {
  if (!options.forceRefresh) {
    if (isCacheFresh(memoryCache)) return memoryCache!.flags;

    const persisted = readLocalStorageCache();
    if (persisted) {
      if (!memoryCache) memoryCache = persisted;
      if (isCacheFresh(persisted)) return persisted.flags;
    }
  }

  if (inflightRequest) return inflightRequest;

  inflightRequest = (async () => {
    try {
      const flags = await fetchFlagsFromServer();
      writeCaches({ fetchedAt: Date.now(), flags });
      return flags;
    } catch {
      const stale = memoryCache ?? readLocalStorageCache();
      return stale ? stale.flags : {};
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
};

export const getCachedFeatureFlags = (): FeatureFlagStateMap => {
  if (memoryCache) return memoryCache.flags;
  const persisted = readLocalStorageCache();
  if (persisted) {
    memoryCache = persisted;
    return persisted.flags;
  }
  return {};
};

export const evaluateFeatureFlag = (
  flags: FeatureFlagStateMap,
  key: string,
  defaultValue = false
): boolean => {
  const state = flags[key];
  if (!state) return defaultValue;
  return state.enabled;
};

export const evaluateFeatureFlagVariant = (
  flags: FeatureFlagStateMap,
  key: string
): FeatureFlagVariant | null => {
  const state = flags[key];
  if (!state) return null;
  return state.variant;
};
