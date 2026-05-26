import crypto from 'crypto';
import { Request } from 'express';

export type WebhookVerificationStatus = 'valid' | 'invalid' | 'missing_signature' | 'invalid_payload';
export type WebhookProcessingStatus = 'received' | 'duplicate' | 'ignored' | 'processed' | 'failed';

export const sha256Hex = (value: Buffer | string) =>
  crypto.createHash('sha256').update(value).digest('hex');

export const hmacSha256Hex = (value: Buffer | string, secret: string) =>
  crypto.createHmac('sha256', secret).update(value).digest('hex');

export const timingSafeEqualHex = (expected: string, provided: string) => {
  if (!expected || !provided) return false;
  const normalizedExpected = expected.startsWith('sha256=') ? expected.slice('sha256='.length) : expected;
  const normalizedProvided = provided.startsWith('sha256=') ? provided.slice('sha256='.length) : provided;

  if (!/^[a-f0-9]+$/i.test(normalizedExpected) || !/^[a-f0-9]+$/i.test(normalizedProvided)) {
    return false;
  }

  const expectedBuffer = Buffer.from(normalizedExpected, 'hex');
  const providedBuffer = Buffer.from(normalizedProvided, 'hex');
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};

export const verifyMidtransSignature = (payload: {
  order_id?: unknown;
  status_code?: unknown;
  gross_amount?: unknown;
  signature_key?: unknown;
}, serverKey: string) => {
  const orderId = typeof payload.order_id === 'string' ? payload.order_id : '';
  const statusCode = typeof payload.status_code === 'string' ? payload.status_code : '';
  const grossAmount = typeof payload.gross_amount === 'string' ? payload.gross_amount : '';
  const signature = typeof payload.signature_key === 'string' ? payload.signature_key : '';

  if (!serverKey || !orderId || !statusCode || !grossAmount || !signature) return false;
  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
};

export const resolveRawBody = (req: Request) => {
  const rawBody = (req as any).rawBody as Buffer | undefined;
  return rawBody || Buffer.from(JSON.stringify(req.body || {}));
};

export const requestIp = (req?: Request) =>
  String(req?.headers?.['x-forwarded-for'] || req?.ip || req?.socket?.remoteAddress || '')
    .split(',')[0]
    .trim() || null;

export const requestUserAgent = (req?: Request) =>
  String(req?.headers?.['user-agent'] || '').slice(0, 500) || null;

export const insertWebhookAuditEvent = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  req: Request | undefined,
  input: {
    providerName: string;
    providerEventId: string | null;
    providerReference?: string | null;
    eventType?: string | null;
    verificationStatus: WebhookVerificationStatus;
    processingStatus?: WebhookProcessingStatus;
    payload: unknown;
    rawBody: Buffer;
    signature?: string | null;
    errorCode?: string | null;
  }
) => {
  const signatureHash = input.signature ? sha256Hex(input.signature) : null;
  const result = await client.query(
    `INSERT INTO webhook_audit_events (
       provider_name,
       provider_event_id,
       provider_reference,
       event_type,
       payload_hash,
       signature_hash,
       verification_status,
       processing_status,
       raw_payload,
       error_code,
       source_ip,
       user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
     ON CONFLICT (provider_name, provider_event_id) WHERE provider_event_id IS NOT NULL AND verification_status = 'valid'
     DO NOTHING
     RETURNING id`,
    [
      input.providerName,
      input.providerEventId,
      input.providerReference || null,
      input.eventType || null,
      sha256Hex(input.rawBody),
      signatureHash,
      input.verificationStatus,
      input.processingStatus || 'received',
      JSON.stringify(input.payload ?? null),
      input.errorCode || null,
      requestIp(req),
      requestUserAgent(req),
    ],
  );

  return {
    duplicate: input.verificationStatus === 'valid' && Boolean(input.providerEventId) && result.rows.length === 0,
    id: result.rows[0]?.id || null,
  };
};

export const updateWebhookAuditEvent = async (
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  eventId: string | null,
  processingStatus: WebhookProcessingStatus,
  errorCode?: string | null,
) => {
  if (!eventId) return;
  await client.query(
    `UPDATE webhook_audit_events
     SET processing_status = $2,
         processed_at = CASE WHEN $2 IN ('processed', 'ignored', 'duplicate', 'failed') THEN NOW() ELSE processed_at END,
         error_code = COALESCE($3, error_code)
     WHERE id = $1`,
    [eventId, processingStatus, errorCode || null],
  );
};
