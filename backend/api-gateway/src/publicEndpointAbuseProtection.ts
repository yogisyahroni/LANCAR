import { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { rateLimitStoreOptions } from './redisRateLimitStore';

type PublicEndpoint = 'maps' | 'pricing' | 'system';
type AbuseAction = 'blocked' | 'rate_limited' | 'observed';
type AbuseEvent = {
  endpoint: PublicEndpoint;
  reason: string;
  action: AbuseAction;
};

type AbuseProtectionOptions = {
  recordEvent?: (event: AbuseEvent) => void;
};

const VALID_MAP_SCOPES = new Set(['global', 'customer_mobile', 'courier_mobile', 'web_customer', 'web_admin', 'tracking']);
const VALID_ROUTE_PROFILES = new Set(['car', 'motorcycle', 'bike', 'foot', 'driving', 'two_wheeler']);
const MAX_QUERY_LENGTH = 120;
const MAX_SERVICE_CODE_LENGTH = 64;
const MAX_ROUTE_DISTANCE_KM = Number(process.env.PUBLIC_MAPS_MAX_ROUTE_DISTANCE_KM || 300);
const MAX_PRICING_DISTANCE_KM = Number(process.env.PUBLIC_PRICING_MAX_ROUTE_DISTANCE_KM || 300);
const MIN_RADIUS_METERS = 1;
const MAX_RADIUS_METERS = Number(process.env.PUBLIC_MAPS_MAX_RADIUS_METERS || 50000);
const MAX_BBOX_AREA_DEGREES = Number(process.env.PUBLIC_MAPS_MAX_BBOX_AREA_DEGREES || 4);

const emit = (options: AbuseProtectionOptions | undefined, event: AbuseEvent) => {
  options?.recordEvent?.(event);
};

const clientIpKey = (req: Request) => ipKeyGenerator(req.ip || req.socket.remoteAddress || '0.0.0.0');

export const publicEndpointKey = (req: Request, endpoint: PublicEndpoint) => {
  const deviceId = String(req.headers['x-device-id'] || req.headers['x-client-device-id'] || '').trim();
  const userId = String(req.headers['x-user-id'] || '').trim();
  if (userId) return `${endpoint}:user:${userId}`;
  if (deviceId) return `${endpoint}:device:${deviceId.slice(0, 96)}`;
  return `${endpoint}:ip:${clientIpKey(req)}`;
};

const reject = (res: Response, endpoint: PublicEndpoint, reason: string, options?: AbuseProtectionOptions) => {
  emit(options, { endpoint, reason, action: 'blocked' });
  res.status(400).json({
    status: 'error',
    code: 'ERR_INVALID_PUBLIC_REQUEST',
    message: 'Invalid public request',
    reason,
  });
};

const numberFromQuery = (params: URLSearchParams, ...names: string[]) => {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null) return Number(value);
  }
  return Number.NaN;
};

const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;

const distanceKm = (fromLat: number, fromLng: number, toLat: number, toLng: number) => {
  const earthRadiusKm = 6371;
  const toRad = (degree: number) => (degree * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const validateScope = (params: URLSearchParams) => {
  const scope = params.get('scope');
  return !scope || VALID_MAP_SCOPES.has(scope);
};

const validateQueryLengths = (params: URLSearchParams) => {
  for (const [key, value] of params.entries()) {
    if (key.length > 48 || value.length > MAX_QUERY_LENGTH) return false;
  }
  return true;
};

const validateOptionalRadius = (params: URLSearchParams) => {
  const rawRadius = params.get('radius') || params.get('radius_meters');
  if (!rawRadius) return true;
  const radius = Number(rawRadius);
  return Number.isFinite(radius) && radius >= MIN_RADIUS_METERS && radius <= MAX_RADIUS_METERS;
};

const validateOptionalBoundingBox = (params: URLSearchParams) => {
  const bbox = params.get('bbox') || params.get('bounding_box');
  if (!bbox) return true;
  const values = bbox.split(',').map((value) => Number(value.trim()));
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) return false;
  const [minLng, minLat, maxLng, maxLat] = values;
  if (!isValidLongitude(minLng) || !isValidLongitude(maxLng) || !isValidLatitude(minLat) || !isValidLatitude(maxLat)) {
    return false;
  }
  if (minLng >= maxLng || minLat >= maxLat) return false;
  return (maxLng - minLng) * (maxLat - minLat) <= MAX_BBOX_AREA_DEGREES;
};

const validateTilePath = (pathname: string) => {
  const match = pathname.match(/^\/api\/v1\/maps\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!match) return true;
  const z = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!Number.isInteger(z) || z < 0 || z > 19) return false;
  const maxTile = 2 ** z;
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < maxTile && y < maxTile;
};

export const validateMapsRequest = (originalUrl: string) => {
  const url = new URL(originalUrl, 'http://tembus.local');
  const { pathname, searchParams } = url;

  if (!validateQueryLengths(searchParams)) return 'query_too_long';
  if (!validateScope(searchParams)) return 'invalid_scope';
  if (!validateOptionalRadius(searchParams)) return 'invalid_radius';
  if (!validateOptionalBoundingBox(searchParams)) return 'invalid_bounding_box';
  if (!validateTilePath(pathname)) return 'invalid_tile';

  if (pathname === '/api/v1/maps/config') return null;

  if (pathname === '/api/v1/maps/geocode') {
    const query = String(searchParams.get('query') || '').trim();
    if (query.length < 3) return 'query_too_short';
    if (query.length > MAX_QUERY_LENGTH) return 'query_too_long';
    return null;
  }

  if (pathname === '/api/v1/maps/reverse-geocode') {
    const latitude = numberFromQuery(searchParams, 'latitude', 'lat');
    const longitude = numberFromQuery(searchParams, 'longitude', 'lng');
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return 'invalid_coordinates';
    return null;
  }

  if (pathname === '/api/v1/maps/route') {
    const fromLat = numberFromQuery(searchParams, 'from_latitude', 'from_lat');
    const fromLng = numberFromQuery(searchParams, 'from_longitude', 'from_lng');
    const toLat = numberFromQuery(searchParams, 'to_latitude', 'to_lat');
    const toLng = numberFromQuery(searchParams, 'to_longitude', 'to_lng');
    if (!isValidLatitude(fromLat) || !isValidLongitude(fromLng) || !isValidLatitude(toLat) || !isValidLongitude(toLng)) {
      return 'invalid_coordinates';
    }
    if (distanceKm(fromLat, fromLng, toLat, toLng) > MAX_ROUTE_DISTANCE_KM) return 'route_distance_too_large';
    const routeProfile = searchParams.get('route_profile');
    if (routeProfile && !VALID_ROUTE_PROFILES.has(routeProfile)) return 'invalid_route_profile';
    const serviceCode = searchParams.get('service_code');
    if (serviceCode && serviceCode.length > MAX_SERVICE_CODE_LENGTH) return 'service_code_too_long';
    return null;
  }

  if (pathname.startsWith('/api/v1/maps/tiles/')) return null;
  return 'unknown_maps_endpoint';
};

export const validatePricingPayload = (body: unknown) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'invalid_body';
  const payload = body as Record<string, unknown>;
  const pickupLat = Number(payload.pickup_lat);
  const pickupLng = Number(payload.pickup_lng);
  const dropoffLat = Number(payload.dropoff_lat);
  const dropoffLng = Number(payload.dropoff_lng);
  if (!isValidLatitude(pickupLat) || !isValidLongitude(pickupLng) || !isValidLatitude(dropoffLat) || !isValidLongitude(dropoffLng)) {
    return 'invalid_coordinates';
  }
  if (distanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng) > MAX_PRICING_DISTANCE_KM) return 'route_distance_too_large';

  const dimensions = ['length', 'width', 'height', 'weight'].map((key) => Number(payload[key]));
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) return 'invalid_dimensions';
  const [length, width, height, weight] = dimensions;
  if (length > 300 || width > 300 || height > 300 || weight > 200) return 'dimensions_too_large';

  const models = payload.models;
  if (models !== undefined) {
    if (!Array.isArray(models) || models.length < 1 || models.length > 3) return 'invalid_models';
    if (models.some((model) => typeof model !== 'string' || model.length < 2 || model.length > 32)) return 'invalid_models';
  }
  return null;
};

export const createMapsAbuseGuard = (options?: AbuseProtectionOptions) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const reason = validateMapsRequest(req.originalUrl);
  if (reason) return reject(res, 'maps', reason, options);
  emit(options, { endpoint: 'maps', reason: 'accepted', action: 'observed' });
  return next();
};

export const createPricingAbuseGuard = (options?: AbuseProtectionOptions) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const reason = validatePricingPayload(req.body);
  if (reason) return reject(res, 'pricing', reason, options);
  emit(options, { endpoint: 'pricing', reason: 'accepted', action: 'observed' });
  return next();
};

export const createPublicEndpointRateLimiter = (
  endpoint: PublicEndpoint,
  options: AbuseProtectionOptions = {}
): ReturnType<typeof rateLimit> => {
  const windowMs = Number(process.env[`PUBLIC_${endpoint.toUpperCase()}_RATE_WINDOW_MS`] || 60_000);
  return rateLimit({
  windowMs,
  max: Number(process.env[`PUBLIC_${endpoint.toUpperCase()}_RATE_LIMIT`] || (endpoint === 'maps' ? 60 : 30)),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => publicEndpointKey(req, endpoint),
  handler: (_req, res) => {
    emit(options, { endpoint, reason: 'rate_limit_exceeded', action: 'rate_limited' });
    res.status(429).json({
      status: 'error',
      code: 'ERR_PUBLIC_RATE_LIMIT',
      message: 'Too many public requests, please try again later',
    });
  },
  ...rateLimitStoreOptions(`public-${endpoint}`, windowMs),
  });
};
