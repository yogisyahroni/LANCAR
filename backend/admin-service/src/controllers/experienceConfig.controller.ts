import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  createExperienceManifest,
  ExperienceManifestError,
  getExperienceCacheControl,
  getExperienceManifestHistory,
  listExperienceManifestRevisions,
  previewExperienceManifest,
  publishExperienceManifest,
  resolvePublicExperienceManifest,
  rollbackExperienceManifest,
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
    res.json({ success: true, data, preview: true });
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

export const getPublicExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const surface = queryString(req.query.surface) as ExperienceSurface | undefined;
    const data = await resolvePublicExperienceManifest({
      market_code: queryString(req.query.market_code) || queryString(req.headers['x-market-code']) || '',
      locale: queryString(req.query.locale) || 'id-ID',
      surface: surface as ExperienceSurface,
      app_version: queryString(req.query.app_version) || '',
      cohort: queryString(req.query.cohort) || queryString(req.headers['x-experience-cohort']) || null,
      experiment_ref: queryString(req.query.experiment_ref) || queryString(req.headers['x-experience-experiment']) || null,
    });
    const etag = `"${data.checksum}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', getExperienceCacheControl(data));
    res.setHeader('Vary', 'Accept-Language, X-Market-Code, X-Experience-Cohort, X-Experience-Experiment');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'public');
  }
};
