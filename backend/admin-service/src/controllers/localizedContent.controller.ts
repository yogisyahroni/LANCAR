import { Request, Response } from 'express';
import { getActorId } from '../utils/authUtils';
import { securityLog } from '../security/logRedaction';
import {
  createLocalizedContentPack,
  listLocalizedContentPacks,
  LocalizedContentError,
  publishLocalizedContentPack,
  resolveLocalizedContentPack,
  updateLocalizedContentPackDraft,
  type LocalizedContentSurface,
} from '../services/localizedContent';

const correlationId = (req: Request, res: Response): string | null =>
  (res.locals.correlationId as string | undefined) ||
  (typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'] : null);

const respondWithError = (res: Response, error: unknown, operation: string): void => {
  if (error instanceof LocalizedContentError) {
    res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return;
  }
  securityLog.error(`localized_content_${operation}_failed`, {
    error: error instanceof Error ? error.message : 'unknown',
  });
  res.status(500).json({
    success: false,
    code: 'LOCALIZED_CONTENT_INTERNAL_ERROR',
    message: 'Localized content service failed',
  });
};

export const listAdminLocalizedContentPacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await listLocalizedContentPacks(req.query as Record<string, unknown>);
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'list');
  }
};

export const createAdminLocalizedContentPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await createLocalizedContentPack(req.body, getActorId(req), correlationId(req, res));
    res.status(201).json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'create');
  }
};

export const updateAdminLocalizedContentPackDraft = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await updateLocalizedContentPackDraft(req.params.contentPackId, req.body, getActorId(req), correlationId(req, res));
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'update');
  }
};

export const publishAdminLocalizedContentPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const data = await publishLocalizedContentPack(req.params.contentPackId, getActorId(req), correlationId(req, res));
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'publish');
  }
};

export const getPublicLocalizedContentPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const marketCode = typeof req.query.market_code === 'string'
      ? req.query.market_code
      : typeof req.headers['x-market-code'] === 'string' ? req.headers['x-market-code'] : '';
    const locale = typeof req.query.locale === 'string'
      ? req.query.locale
      : typeof req.headers['accept-language'] === 'string'
        ? req.headers['accept-language'].split(',')[0].split(';')[0].trim()
        : 'id-ID';
    const surface = typeof req.query.surface === 'string' ? req.query.surface as LocalizedContentSurface : undefined;
    if (!surface) {
      res.status(400).json({ success: false, code: 'LOCALIZED_CONTENT_SURFACE_REQUIRED', message: 'surface is required' });
      return;
    }
    const rawPackKey = req.params.packKey;
    const packKey = Array.isArray(rawPackKey) ? rawPackKey[0] : rawPackKey;
    const data = await resolveLocalizedContentPack({
      market_code: marketCode,
      surface,
      pack_key: packKey,
      requested_locale: locale,
      market_default_locale: typeof req.query.default_locale === 'string' ? req.query.default_locale : undefined,
    });
    if (!data) {
      res.status(404).json({ success: false, code: 'LOCALIZED_CONTENT_NOT_FOUND', message: 'Published localized content was not found' });
      return;
    }
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.setHeader('ETag', `"${data.content_checksum}"`);
    res.setHeader('Vary', 'Accept-Language, X-Market-Code');
    if (req.headers['if-none-match'] === `"${data.content_checksum}"`) {
      res.status(304).end();
      return;
    }
    res.json({ success: true, data });
  } catch (error) {
    respondWithError(res, error, 'public');
  }
};
