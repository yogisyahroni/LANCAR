import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  createExperienceManifest,
  approveExperienceManifest,
  ExperienceManifestError,
  getExperienceCacheControl,
  getExperienceManifestHistory,
  listExperienceManifestRevisions,
  previewExperienceManifest,
  previewExperienceManifestAudience,
  publishExperienceManifest,
  resolvePublicExperienceManifest,
  rollbackExperienceManifest,
  setExperienceManifestKillSwitch,
  updateExperienceManifestDraft,
  type ExperienceSurface,
} from '../services/experienceConfig';

const correlationId = (req: Request, res: Response): string | null =>
  (res.locals.correlationId as string | undefined) ||
  (typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'] : null);

const respondWithError = (res: Response, error: unknown, operation: string): void => {
  if (error instanceof ExperienceManifestError) {
    res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.reasonCodes.length > 0 ? { reason_codes: error.reasonCodes } : {}),
    });
    return;
  }
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? String((error as { code: string }).code)
    : 'EXPERIENCE_MANIFEST_INTERNAL_ERROR';
  securityLog.error(`experience_manifest_${operation}_failed`, { error: error instanceof Error ? error.message : 'unknown', code });
  res.status(500).json({ success: false, code: 'EXPERIENCE_MANIFEST_INTERNAL_ERROR', message: 'Experience manifest service failed' });
};

const queryString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const manifestId = (req: Request): string => queryString(req.params.manifestId) || '';

const safeAudienceIdentifier = (value: unknown): string | null => {
  const normalized = queryString(value)?.toLowerCase();
  return normalized && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(normalized) ? normalized : null;
};

const previewAudienceInput = (req: Request, manifest: { market_code: string; locale: string; min_app_version: string }): Record<string, unknown> => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const raw = body.audience && typeof body.audience === 'object' && !Array.isArray(body.audience)
    ? body.audience as Record<string, unknown>
    : body.simulation && typeof body.simulation === 'object' && !Array.isArray(body.simulation)
      ? body.simulation as Record<string, unknown>
      : body;
  return {
    market_code: safeAudienceIdentifier(raw.market_code) || manifest.market_code,
    locale: queryString(raw.locale) || manifest.locale,
    default_locale: queryString(raw.default_locale) || manifest.locale,
    app_version: queryString(raw.app_version) || manifest.min_app_version,
    cohort: safeAudienceIdentifier(raw.cohort),
    experiment_ref: safeAudienceIdentifier(raw.experiment_ref),
    experiment_assignment: safeAudienceIdentifier(raw.experiment_assignment),
    city_code: safeAudienceIdentifier(raw.city_code),
    zone_code: safeAudienceIdentifier(raw.zone_code),
    service_usage_cohort: safeAudienceIdentifier(raw.service_usage_cohort),
    user_status: raw.user_status ?? null,
    role: raw.role ?? null,
    at: raw.at,
  };
};

export const listAdminExperienceManifests = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listExperienceManifestRevisions({
      market_code: req.query.market_code,
      surface: req.query.surface,
      state: req.query.state,
    });
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'list');
  }
};

export const getAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await getExperienceManifestHistory(manifestId(req));
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'get');
  }
};

export const createAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await createExperienceManifest(req.body, getActorId(req), correlationId(req, res));
    res.status(201).json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'create');
  }
};

export const updateAdminExperienceManifestDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await updateExperienceManifestDraft(manifestId(req), req.body, getActorId(req), correlationId(req, res));
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'update');
  }
};

export const previewAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await previewExperienceManifest(manifestId(req), getActorId(req), correlationId(req, res));
    const simulation = previewExperienceManifestAudience(data, previewAudienceInput(req, data));
    res.json({ success: true, data, simulation, preview: true });
  } catch (error) {
    respondWithError(res, error, 'preview');
  }
};

export const publishAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await publishExperienceManifest(manifestId(req), getActorId(req), correlationId(req, res));
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'publish');
  }
};

export const approveAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await approveExperienceManifest(manifestId(req), getActorId(req), correlationId(req, res));
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'approve');
  }
};

export const rollbackAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const targetRevision = req.body?.target_revision;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const data = await rollbackExperienceManifest(
      manifestId(req),
      targetRevision,
      getActorId(req),
      reason,
      correlationId(req, res),
    );
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'rollback');
  }
};

const setAdminExperienceManifestKillSwitch = async (req: Request, res: Response, active: boolean): Promise<void> => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const data = await setExperienceManifestKillSwitch(
      manifestId(req),
      active,
      getActorId(req),
      reason,
      correlationId(req, res),
    );
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, active ? 'kill' : 'kill_restore');
  }
};

export const killAdminExperienceManifest = async (req: Request, res: Response): Promise<void> =>
  setAdminExperienceManifestKillSwitch(req, res, true);

export const restoreAdminExperienceManifest = async (req: Request, res: Response): Promise<void> =>
  setAdminExperienceManifestKillSwitch(req, res, false);

export const getPublicExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const surface = queryString(req.query.surface) as ExperienceSurface | undefined;
    const data = await resolvePublicExperienceManifest({
      market_code: queryString(req.query.market_code) || queryString(req.headers['x-market-code']) || '',
      locale: queryString(req.query.locale) || 'id-ID',
      surface: surface as ExperienceSurface,
      app_version: queryString(req.query.app_version) || '',
      cohort: safeAudienceIdentifier(req.query.cohort) || safeAudienceIdentifier(req.headers['x-experience-cohort']),
      experiment_ref: safeAudienceIdentifier(req.query.experiment_ref) || safeAudienceIdentifier(req.headers['x-experience-experiment']),
      experiment_assignment: safeAudienceIdentifier(req.query.experiment_assignment) || safeAudienceIdentifier(req.headers['x-experience-assignment']),
      city_code: safeAudienceIdentifier(req.query.city_code) || safeAudienceIdentifier(req.headers['x-city-code']),
      zone_code: safeAudienceIdentifier(req.query.zone_code) || safeAudienceIdentifier(req.headers['x-zone-code']),
      service_usage_cohort: safeAudienceIdentifier(req.query.service_usage_cohort) || safeAudienceIdentifier(req.headers['x-experience-service-cohort']),
      user_id: req.user?.id ?? null,
      role: req.user?.role === 'customer' || req.user?.role === 'merchant' || req.user?.role === 'courier'
        ? req.user.role
        : null,
    });
    const etag = `"${data.checksum}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', getExperienceCacheControl(data));
    res.setHeader(
      'Vary',
      'Accept-Language, X-Market-Code, X-Experience-Cohort, X-Experience-Experiment, '
        + 'X-Experience-Assignment, X-City-Code, X-Zone-Code, X-Experience-Service-Cohort, Authorization',
    );
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'public');
  }
};
