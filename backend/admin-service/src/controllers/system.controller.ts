import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { db, readDb } from '../db';
import { redis } from '../redis';
import { getIO } from '../websocket';
import { getOnDemandExternalReadiness } from '../services/onDemandExternalReadiness';
import { getMapsProductionReadiness } from '../services/mapsProductionReadiness';
import {
  buildMapsRouteEtaSnapshot,
  fetchOpenStreetMapTile,
  getMapsProviderOpsSnapshot,
  getMapsProviderConfigValue,
  getPublicMapsProviderConfig,
  geocodeAddress,
  reverseGeocodePoint,
  updateMapsProviderConfigValue,
} from '../services/mapsProviderConfig';
import {
  activateMapsRuntimeCredential,
  createMapsRuntimeCredential,
  deactivateMapsRuntimeCredential,
  listMapsRuntimeCredentials,
  MapsCredentialError,
  testMapsRuntimeCredentialInput,
  validateStoredMapsRuntimeCredential,
} from '../services/mapsRuntimeCredentials';

export const getSystemConfigs = async (req: Request, res: Response) => {
  try {
    const category = req.query.category as string;
    let query = 'SELECT key, value, description, category, updated_at FROM system_configs';
    const values: any[] = [];

    if (category) {
      query += ' WHERE category = $1';
      values.push(category);
    }

    query += ' ORDER BY key ASC';

    const result = await readDb.query(query, values);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicRuntimeConfigs = async (req: Request, res: Response): Promise<void> => {
  try {
    const allowedKeys = [
      'insurance_premium_rate',
      'insurance_min_premium',
      'tax_ppn',
      'topup_denominations',
      'topup_min_amount',
      'withdraw_min_amount',
      'withdraw_fee',
      'courier_sync_interval_ms',
    ];
    
    const result = await readDb.query(
      'SELECT key, value FROM system_configs WHERE key = ANY($1)',
      [allowedKeys]
    );
    
    const configs = result.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, any>);
    
    // Add safety fallbacks if they don't exist yet in the database
    if (configs['insurance_premium_rate'] === undefined) configs['insurance_premium_rate'] = 0.002;
    if (configs['insurance_min_premium'] === undefined) configs['insurance_min_premium'] = 1000;
    if (configs['tax_ppn'] === undefined) configs['tax_ppn'] = 0.11;
    if (configs['topup_denominations'] === undefined) configs['topup_denominations'] = ['50000', '100000', '200000'];
    if (configs['topup_min_amount'] === undefined) configs['topup_min_amount'] = 10000;
    if (configs['withdraw_min_amount'] === undefined) configs['withdraw_min_amount'] = 50000;
    if (configs['withdraw_fee'] === undefined) configs['withdraw_fee'] = 5000;
    if (configs['courier_sync_interval_ms'] === undefined) configs['courier_sync_interval_ms'] = 30000;

    res.json({ data: configs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getLatestVersion = async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.query.type as string; // 'courier' or 'customer'
    if (!type || (type !== 'courier' && type !== 'customer')) {
      res.status(400).json({ error: 'Invalid app type' });
      return;
    }

    const versionKey = `mobile_${type}_version`;
    const result = await readDb.query(
      'SELECT value FROM system_configs WHERE key = $1',
      [versionKey]
    );

    const updateUrlResult = await readDb.query(
      'SELECT value FROM system_configs WHERE key = $1',
      ['mobile_update_url']
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Version info not found' });
      return;
    }

    res.json({
      ...result.rows[0].value,
      update_url: updateUrlResult.rows[0]?.value || 'https://github.com/yogisyahroni/TEMBUS/releases'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getOnDemandReadiness = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(getOnDemandExternalReadiness());
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicMapsProviderRuntimeConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'global';
    const config = await getPublicMapsProviderConfig(scope);
    res.setHeader('Cache-Control', `public, max-age=${Math.min(config.ttl_seconds, 300)}`);
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicMapsRoutePreview = async (req: Request, res: Response): Promise<void> => {
  try {
    const from = {
      latitude: Number(req.query.from_latitude ?? req.query.from_lat),
      longitude: Number(req.query.from_longitude ?? req.query.from_lng),
    };
    const to = {
      latitude: Number(req.query.to_latitude ?? req.query.to_lat),
      longitude: Number(req.query.to_longitude ?? req.query.to_lng),
    };
    if (![from.latitude, from.longitude, to.latitude, to.longitude].every(Number.isFinite)) {
      res.status(400).json({ error: 'Valid from/to coordinates are required' });
      return;
    }
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'tracking';
    const route = await buildMapsRouteEtaSnapshot(from, to, scope as any, {
      serviceCode: typeof req.query.service_code === 'string' ? req.query.service_code : null,
      vehicleType: typeof req.query.vehicle_type === 'string' ? req.query.vehicle_type : null,
      routeProfile: typeof req.query.route_profile === 'string' ? req.query.route_profile : null,
      requestId: typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : typeof req.query.request_id === 'string'
          ? req.query.request_id
          : null,
    });
    res.json(route);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicMapsGeocode = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    if (query.trim().length < 3) {
      res.status(400).json({ error: 'query must contain at least 3 characters' });
      return;
    }
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'web_customer';
    const results = await geocodeAddress(query, scope as any);
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicMapsReverseGeocode = async (req: Request, res: Response): Promise<void> => {
  try {
    const latitude = Number(req.query.latitude ?? req.query.lat);
    const longitude = Number(req.query.longitude ?? req.query.lng);
    if (![latitude, longitude].every(Number.isFinite)) {
      res.status(400).json({ error: 'Valid latitude and longitude are required' });
      return;
    }
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'web_customer';
    const result = await reverseGeocodePoint({ latitude, longitude }, scope as any);
    res.json({ result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getPublicOpenStreetMapTile = async (req: Request, res: Response): Promise<void> => {
  try {
    const tile = await fetchOpenStreetMapTile(String(req.params.z), String(req.params.x), String(req.params.y));
    res.setHeader('Content-Type', tile.contentType);
    res.setHeader('Cache-Control', tile.cacheControl);
    res.send(tile.body);
  } catch (error: any) {
    res.status(502).json({
      error: 'OpenStreetMap tile is temporarily unavailable',
      detail: error?.message || 'tile_provider_unavailable',
    });
  }
};

export const getAdminMapsProviderRuntimeConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const value = await getMapsProviderConfigValue();
    const resolved = await Promise.all([
      getPublicMapsProviderConfig('global'),
      getPublicMapsProviderConfig('customer_mobile'),
      getPublicMapsProviderConfig('courier_mobile'),
      getPublicMapsProviderConfig('web_customer'),
    ]);
    res.json({
      value,
      ops: await getMapsProviderOpsSnapshot(),
      resolved: {
        global: resolved[0],
        customer_mobile: resolved[1],
        courier_mobile: resolved[2],
        web_customer: resolved[3],
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAdminMapsProductionReadiness = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getMapsProductionReadiness());
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Maps production readiness failed' });
  }
};

export const updateAdminMapsProviderRuntimeConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const next = await updateMapsProviderConfigValue(req.body || {});
    getIO().emit('config:changed', { key: 'maps_provider_config', value: next, updated_at: new Date() });
    res.json({
      value: next,
      ops: await getMapsProviderOpsSnapshot(),
      resolved: {
        global: await getPublicMapsProviderConfig('global'),
        customer_mobile: await getPublicMapsProviderConfig('customer_mobile'),
        courier_mobile: await getPublicMapsProviderConfig('courier_mobile'),
        web_customer: await getPublicMapsProviderConfig('web_customer'),
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

const sendMapsCredentialError = (res: Response, error: unknown) => {
  if (error instanceof MapsCredentialError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  res.status(500).json({ error: 'Maps credential operation failed', code: 'maps_credential_operation_failed' });
};

const requireMapsCredentialIdParam = (value: string | string[] | undefined): string => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new MapsCredentialError('credential_id_invalid', 'Credential id is required.', 400);
};

export const listAdminMapsProviderCredentials = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json({ credentials: await listMapsRuntimeCredentials() });
  } catch (error) {
    sendMapsCredentialError(res, error);
  }
};

export const testAdminMapsProviderCredential = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = await testMapsRuntimeCredentialInput({ api_key: req.body?.api_key });
    res.status(validation.status === 'valid' ? 200 : 422).json({ validation });
  } catch (error) {
    sendMapsCredentialError(res, error);
  }
};

export const createAdminMapsProviderCredential = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await createMapsRuntimeCredential(req.body || {}, req.user?.id || null);
    res.status(201).json(result);
  } catch (error) {
    sendMapsCredentialError(res, error);
  }
};

export const validateAdminMapsProviderCredential = async (req: Request, res: Response): Promise<void> => {
  try {
    const credentialId = requireMapsCredentialIdParam(req.params.id);
    const result = await validateStoredMapsRuntimeCredential(credentialId, req.user?.id || null);
    res.status(result.validation.status === 'valid' ? 200 : 422).json(result);
  } catch (error) {
    sendMapsCredentialError(res, error);
  }
};

export const activateAdminMapsProviderCredential = async (req: Request, res: Response): Promise<void> => {
  try {
    const credentialId = requireMapsCredentialIdParam(req.params.id);
    const result = await activateMapsRuntimeCredential(credentialId, req.user?.id || null);
    getIO().emit('config:changed', { key: 'maps_provider_credential', action: 'activated', updated_at: new Date() });
    res.json(result);
  } catch (error) {
    sendMapsCredentialError(res, error);
  }
};

export const deactivateAdminMapsProviderCredential = async (req: Request, res: Response): Promise<void> => {
  try {
    const credentialId = requireMapsCredentialIdParam(req.params.id);
    const result = await deactivateMapsRuntimeCredential(
      credentialId,
      req.user?.id || null,
      req.body?.reactivate_previous !== false
    );
    getIO().emit('config:changed', { key: 'maps_provider_credential', action: 'deactivated', updated_at: new Date() });
    res.json(result);
  } catch (error) {
    sendMapsCredentialError(res, error);
  }
};

export const updateSystemConfig = async (req: Request, res: Response): Promise<void> => {
  const key = req.params.key as string;
  const { value, description, category } = req.body;
  
  console.log(`[updateSystemConfig] key: ${key}, value: ${value}`);

  if (typeof value === 'number' && isNaN(value)) {
    console.error(`[updateSystemConfig] ERROR: Invalid config value (NaN) for key=${key}`);
    res.status(400).json({ error: 'Invalid config value: NaN' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT * FROM system_configs WHERE key = $1', [key]);
    if (checkRes.rows.length === 0) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }
    const oldConfig = checkRes.rows[0];

    const updateRes = await client.query(
      `UPDATE system_configs 
       SET value = $1, description = COALESCE($2, description), category = COALESCE($3, category), updated_at = NOW() 
       WHERE key = $4 RETURNING *`,
      [JSON.stringify(value), description, category, key]
    );

    const changedBy = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';

    await client.query(
      `INSERT INTO feature_flag_logs (key, is_enabled, updated_by, change_reason, config, category) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`config:${key}`, true, changedBy, `Updated system config: ${key}`, JSON.stringify(value), category || oldConfig.category || 'general']
    );

    await client.query('COMMIT');

    getIO().emit('config:changed', { key, value, updated_at: new Date() });

    res.json(updateRes.rows[0]);
  } catch (error: any) {
    console.error(`[updateSystemConfig] FATAL ERROR: ${error.message}`, error.stack);
    await client.query('ROLLBACK');
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

export const getSystemHealth = async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const appVersion = process.env.npm_package_version || process.env.APP_VERSION || null;

  const probeDatabase = async () => {
    const start = Date.now();
    const result = await readDb.query('SHOW server_version');
    const latency = Date.now() - start;
    return {
      key: 'database',
      label: 'PostgreSQL',
      version: result.rows[0]?.server_version || null,
      status: latency < 100 ? 'Healthy' : 'Degraded',
      state: latency < 100 ? 'UP' : 'DEGRADED',
      metrics: `${latency}ms`,
    };
  };

  const probeRedis = async () => {
    const start = Date.now();
    await redis.ping();
    const info = await redis.info('server');
    const latency = Date.now() - start;
    const version = info.match(/^redis_version:(.+)$/m)?.[1]?.trim() || null;
    return {
      key: 'redis',
      label: 'Redis Cache',
      version,
      status: latency < 50 ? 'Live' : 'Degraded',
      state: latency < 50 ? 'UP' : 'DEGRADED',
      metrics: `${latency}ms`,
    };
  };

  const probeStorage = async () => {
    const provider = process.env.STORAGE_PROVIDER || process.env.FILE_STORAGE_PROVIDER || 'local_disk';
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');
    const start = Date.now();
    const probeDir = path.join(uploadDir, '.health');
    const probeFile = path.join(probeDir, `probe-${Date.now()}-${crypto.randomUUID()}.tmp`);
    await fs.mkdir(probeDir, { recursive: true });
    await fs.writeFile(probeFile, 'ok', { encoding: 'utf8' });
    await fs.unlink(probeFile);
    const latency = Date.now() - start;
    return {
      key: 'storage',
      label: `Storage (${provider})`,
      version: null,
      status: latency < 100 ? 'Writable' : 'Degraded',
      state: latency < 100 ? 'UP' : 'DEGRADED',
      metrics: `${latency}ms`,
    };
  };

  const probeWebSocket = async () => {
    const io = getIO();
    const clientsCount = io.engine?.clientsCount ?? null;
    return {
      key: 'websocket',
      label: 'WebSocket',
      version: null,
      status: 'Ready',
      state: 'UP',
      metrics: clientsCount === null ? 'ready' : `${clientsCount} clients`,
    };
  };

  const settleProbe = async (key: string, label: string, probe: () => Promise<any>) => {
    try {
      return await probe();
    } catch (error: any) {
      return {
        key,
        label,
        version: null,
        status: 'Error',
        state: 'DOWN',
        metrics: String(error?.message || 'unavailable').slice(0, 80),
      };
    }
  };

  const components = await Promise.all([
    Promise.resolve({
      key: 'api_gateway',
      label: 'API Gateway',
      version: appVersion,
      status: 'Ready',
      state: 'UP',
      metrics: `${Date.now() - startedAt}ms handler`,
    }),
    settleProbe('database', 'PostgreSQL', probeDatabase),
    settleProbe('redis', 'Redis Cache', probeRedis),
    settleProbe('storage', 'Storage', probeStorage),
    settleProbe('websocket', 'WebSocket', probeWebSocket),
  ]);

  const stateByKey = Object.fromEntries(components.map((component) => [component.key, component.state]));
  res.status(components.some((component) => component.state === 'DOWN') ? 503 : 200).json({
    api_gateway: stateByKey.api_gateway,
    database: stateByKey.database,
    redis: stateByKey.redis,
    storage: stateByKey.storage,
    websocket: stateByKey.websocket,
    generated_at: new Date().toISOString(),
    components: components.map(({ key, state, ...component }) => component),
  });
};
