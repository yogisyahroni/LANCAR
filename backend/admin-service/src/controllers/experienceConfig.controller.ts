import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  createExperienceManifest,
  approveExperienceManifest,
  ExperienceManifestError,
  listExperienceAssets,
  listExperienceAudit,
  listExperienceDeepLinks,
  listExperienceKillSwitches,
  listExperienceRollouts,
  getExperienceCacheControl,
  getExperienceManifestHistory,
  listExperienceManifestRevisions,
  previewExperienceManifest,
  previewExperienceManifestAudience,
  publishExperienceManifest,
  rejectExperienceManifest,
  resolvePublicExperienceManifest,
  rollbackExperienceManifest,
  setExperienceManifestKillSwitch,
  submitExperienceManifestApproval,
  updateExperienceManifestDraft,
  validateExperienceAsset,
  validateExperienceDeepLink,
  validateExperienceManifestDraft,
  validateExperienceRollout,
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
      ...(error.issues.length > 0 ? { issues: error.issues } : {}),
      request_id: res.locals.requestId || null,
      correlation_id: res.locals.correlationId || null,
    });
    return;
  }
  const code = typeof (error as { code?: unknown })?.code === 'string'
    ? String((error as { code: string }).code)
    : 'EXPERIENCE_MANIFEST_INTERNAL_ERROR';
  securityLog.error(`experience_manifest_${operation}_failed`, { error: error instanceof Error ? error.message : 'unknown', code });
  res.status(500).json({
    success: false,
    code: 'EXPERIENCE_MANIFEST_INTERNAL_ERROR',
    message: 'Experience manifest service failed',
    request_id: res.locals.requestId || null,
    correlation_id: res.locals.correlationId || null,
  });
};

const auditContext = (req: Request, res: Response) => ({
  requestId: (res.locals.requestId as string | undefined) || null,
  actorRole: req.user?.role || null,
});

const responseMeta = (req: Request, res: Response) => ({
  request_id: res.locals.requestId || null,
  correlation_id: res.locals.correlationId || correlationId(req, res),
});

const setManifestVersionHeaders = (res: Response, data: unknown): void => {
  if (!data || typeof data !== 'object') return;
  const manifest = data as { checksum?: unknown; revision?: unknown };
  if (typeof manifest.checksum === 'string') res.setHeader('ETag', `"${manifest.checksum}"`);
  if (Number.isInteger(manifest.revision)) res.setHeader('X-Experience-Revision', String(manifest.revision));
};

const respondSuccess = (req: Request, res: Response, data: unknown, status = 200, extra: Record<string, unknown> = {}): void => {
  setManifestVersionHeaders(res, data);
  res.status(status).json({ success: true, data, ...extra, ...responseMeta(req, res) });
};

const headerString = (req: Request, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const bodyWithoutConcurrency = (body: unknown): unknown => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const {
    expected_revision: _expectedRevision,
    expected_checksum: _expectedChecksum,
    ...rest
  } = body as Record<string, unknown>;
  return rest;
};

const expectedDraftVersion = (req: Request): { expected: { revision?: number; checksum: string }; body: unknown } => {
  const ifMatch = headerString(req, 'if-match')?.trim();
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
  const rawChecksum = ifMatch || '';
  const checksum = rawChecksum.replace(/^W\//i, '').replace(/^"|"$/g, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new ExperienceManifestError(
      'EXPERIENCE_PRECONDITION_REQUIRED',
      428,
      'Draft updates require the latest strong If-Match ETag',
      ['experience_draft_etag_required'],
    );
  }
  const rawRevision = headerString(req, 'x-experience-revision') || body.expected_revision;
  const revision = rawRevision === undefined || rawRevision === null || rawRevision === '' ? undefined : Number(rawRevision);
  if (revision !== undefined && (!Number.isInteger(revision) || revision < 1)) {
    throw new ExperienceManifestError('INVALID_EXPERIENCE_REVISION', 400, 'X-Experience-Revision must be a positive integer');
  }
  return { expected: { checksum, ...(revision === undefined ? {} : { revision }) }, body: bodyWithoutConcurrency(req.body) };
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
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'list');
  }
};

export const getAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await getExperienceManifestHistory(manifestId(req));
    const latest = data.revisions[0];
    setManifestVersionHeaders(res, latest);
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'get');
  }
};

export const createAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await createExperienceManifest(req.body, getActorId(req), correlationId(req, res), auditContext(req, res));
    respondSuccess(req, res, data, 201);
  } catch (error) {
    respondWithError(res, error, 'create');
  }
};

export const updateAdminExperienceManifestDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const { expected, body } = expectedDraftVersion(req);
    const data = await updateExperienceManifestDraft(manifestId(req), body, getActorId(req), correlationId(req, res), auditContext(req, res), expected);
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'update');
  }
};

export const previewAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await previewExperienceManifest(manifestId(req), getActorId(req), correlationId(req, res), auditContext(req, res));
    const simulation = previewExperienceManifestAudience(data, previewAudienceInput(req, data));
    respondSuccess(req, res, data, 200, { simulation, preview: true });
  } catch (error) {
    respondWithError(res, error, 'preview');
  }
};

export const publishAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await publishExperienceManifest(manifestId(req), getActorId(req), correlationId(req, res), auditContext(req, res));
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'publish');
  }
};

export const approveAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await approveExperienceManifest(manifestId(req), getActorId(req), correlationId(req, res), auditContext(req, res));
    respondSuccess(req, res, data);
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
      auditContext(req, res),
    );
    respondSuccess(req, res, data);
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
      auditContext(req, res),
    );
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, active ? 'kill' : 'kill_restore');
  }
};

export const killAdminExperienceManifest = async (req: Request, res: Response): Promise<void> =>
  setAdminExperienceManifestKillSwitch(req, res, true);

export const restoreAdminExperienceManifest = async (req: Request, res: Response): Promise<void> =>
  setAdminExperienceManifestKillSwitch(req, res, false);

export const validateAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await validateExperienceManifestDraft(manifestId(req));
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'validate');
  }
};

export const submitAdminExperienceManifestApproval = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await submitExperienceManifestApproval(manifestId(req), getActorId(req), correlationId(req, res), auditContext(req, res));
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'submit_approval');
  }
};

export const rejectAdminExperienceManifest = async (req: Request, res: Response): Promise<void> => {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const data = await rejectExperienceManifest(manifestId(req), getActorId(req), reason, correlationId(req, res), auditContext(req, res));
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'reject');
  }
};

export const listAdminExperienceAssets = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listExperienceAssets({ market_code: req.query.market_code, surface: req.query.surface });
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'assets_list');
  }
};

export const validateAdminExperienceAsset = async (req: Request, res: Response): Promise<void> => {
  try {
    const value = req.body?.asset && typeof req.body.asset === 'object' ? req.body.asset : req.body;
    const data = validateExperienceAsset(value);
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'asset_validate');
  }
};

export const listAdminExperienceRevisions = async (req: Request, res: Response): Promise<void> =>
  listAdminExperienceManifests(req, res);

export const listAdminExperienceAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listExperienceAudit({
      market_code: req.query.market_code,
      surface: req.query.surface,
      manifest_id: req.query.manifest_id,
    });
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'audit_list');
  }
};

export const listAdminExperienceDeepLinks = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listExperienceDeepLinks({ market_code: req.query.market_code, surface: req.query.surface });
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'deep_links_list');
  }
};

export const validateAdminExperienceDeepLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const value = req.body?.deep_link;
    const data = { deep_link: validateExperienceDeepLink(value) };
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'deep_link_validate');
  }
};

export const listAdminExperienceRollouts = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listExperienceRollouts({ market_code: req.query.market_code, surface: req.query.surface });
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'rollouts_list');
  }
};

export const validateAdminExperienceRollout = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = validateExperienceRollout(req.body);
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'rollout_validate');
  }
};

export const listAdminExperienceKillSwitches = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listExperienceKillSwitches({ market_code: req.query.market_code, surface: req.query.surface });
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'kill_switches_list');
  }
};

export const setAdminExperienceKillSwitch = async (req: Request, res: Response): Promise<void> => {
  try {
    const manifestIdValue = req.body?.manifest_id;
    const active = req.body?.active;
    if (typeof active !== 'boolean') {
      throw new ExperienceManifestError('INVALID_EXPERIENCE_KILL_SWITCH', 400, 'active must be a boolean');
    }
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
    const data = await setExperienceManifestKillSwitch(
      manifestIdValue,
      active,
      getActorId(req),
      reason,
      correlationId(req, res),
      auditContext(req, res),
    );
    respondSuccess(req, res, data);
  } catch (error) {
    respondWithError(res, error, 'kill_switch');
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
