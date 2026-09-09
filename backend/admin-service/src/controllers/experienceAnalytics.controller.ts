import { createHash } from 'node:crypto';
import { Request, Response } from 'express';
import { db } from '../db';
import { enqueueOutboxEvent } from '../services/eventOutbox';

const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MARKET_CODE = /^[a-z]{2}-[a-z0-9-]+$/;
const ALLOWED_EVENT_TYPES = new Set(['impression', 'click']);
const ALLOWED_COMPONENTS = new Set(['hero_banner', 'campaign_strip', 'promo_carousel']);

const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const normalized = value.trim().toLowerCase();
  if (!normalized || !IDENTIFIER.test(normalized)) throw new Error(`${field} is invalid`);
  return normalized;
};

const headerText = (req: Request, ...names: string[]): string | undefined => {
  for (const name of names) {
    const value = req.header(name);
    if (value?.trim()) return value.trim();
  }
  return undefined;
};

const pseudonymousActor = (userId: string): string =>
  `actor_${createHash('sha256').update(userId).digest('hex')}`;

/**
 * Accepts only presentation telemetry. It writes through the existing
 * canonical event outbox so delivery/replay is handled by the same durable
 * event path as the rest of the platform; no customer identity is stored.
 */
export const recordCustomerExperienceEvent = async (req: Request, res: Response): Promise<void> => {
  const userId = String(req.user?.id || '').trim();
  if (!userId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Unauthorized' });
    return;
  }

  try {
    const eventId = String(req.body?.event_id || '').trim();
    if (!EVENT_ID.test(eventId)) throw new Error('event_id is invalid');

    const eventType = String(req.body?.event_type || '').trim().toLowerCase();
    if (!ALLOWED_EVENT_TYPES.has(eventType)) throw new Error('event_type is invalid');

    const component = text(req.body?.component, 'component');
    if (!ALLOWED_COMPONENTS.has(component)) throw new Error('component is invalid');

    const campaignId = text(req.body?.campaign_id, 'campaign_id');
    const sectionId = text(req.body?.section_id, 'section_id');
    const revision = Number(req.body?.manifest_revision);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('manifest_revision is invalid');

    const marketCode = String(req.body?.market_code || 'id-jk').trim().toLowerCase();
    if (!MARKET_CODE.test(marketCode)) throw new Error('market_code is invalid');

    const correlationId = headerText(req, 'x-correlation-id', 'x-request-id');
    const traceId = headerText(req, 'x-trace-id');
    await enqueueOutboxEvent(db, {
      aggregateType: 'experience_banner',
      eventType: `experience.banner.${eventType}`,
      eventVersion: 1,
      payload: {
        event_id: eventId,
        event_type: eventType,
        surface: 'customer_android',
        component,
        campaign_id: campaignId,
        section_id: sectionId,
        manifest_revision: revision,
      },
      headers: {
        request_id: headerText(req, 'x-request-id'),
        correlation_id: correlationId,
        trace_id: traceId,
        market_code: marketCode,
        source: 'customer_android',
      },
      marketCode,
      serviceName: 'customer-android',
      actorPseudonymousId: pseudonymousActor(userId),
      entityId: campaignId,
      correlationId,
      traceId,
      piiClassification: 'internal',
      fieldPiiClassification: {
        event_id: 'internal',
        event_type: 'public',
        surface: 'public',
        component: 'public',
        campaign_id: 'internal',
        section_id: 'internal',
        manifest_revision: 'public',
      },
      retentionClass: 'short',
      // The client UUID is the replay/dedupe identity for this presentation event.
      dedupeKey: `customer-experience:${eventId}`,
    });

    res.status(202).json({ success: true, data: { accepted: true, event_id: eventId } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid experience event';
    if (/is required|is invalid/.test(message)) {
      res.status(400).json({ success: false, code: 'INVALID_EXPERIENCE_EVENT', message });
      return;
    }
    res.status(500).json({ success: false, code: 'EXPERIENCE_EVENT_UNAVAILABLE', message: 'Event could not be recorded' });
  }
};
