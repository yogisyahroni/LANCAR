import crypto from 'crypto';
import { Request } from 'express';
import { db } from '../db';
import { payoutStructuredLog, writePayoutAuditEvent } from '../utils/payoutObservability';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

type PoolLike = {
  connect: () => Promise<Queryable & { release: () => void }>;
};

export type ProviderStatus = 'processing' | 'unknown' | 'paid' | 'failed';

export type PayoutProviderPayload = {
  payout_request_id: string;
  request_number: string;
  amount_idr: number;
  currency: 'IDR';
  destination: {
    bank_code: string;
    account_name: string;
    account_number_last4: string;
    account_number_vault_ref: string;
  };
  metadata: {
    courier_id: string;
    payout_account_id: string;
  };
};

export type ProviderDispatchResult = {
  providerName: string;
  providerReference: string;
  providerStatus: ProviderStatus;
  response: Record<string, unknown>;
  failureReason?: string | null;
};

export type ProviderQueryResult = {
  providerStatus: ProviderStatus;
  response: Record<string, unknown>;
  failureReason?: string | null;
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
};

export const sha256Hex = (value: string | Buffer | Record<string, unknown>) => {
  const input = Buffer.isBuffer(value)
    ? value
    : typeof value === 'string'
      ? value
      : stableStringify(value);
  return crypto.createHash('sha256').update(input).digest('hex');
};

const configString = async (client: Queryable, key: string, fallback: string) => {
  const result = await client.query('SELECT value FROM system_configs WHERE key = $1 LIMIT 1', [key]);
  if (!result.rows[0]?.value) return fallback;
  const raw = String(result.rows[0].value);
  try {
    return String(JSON.parse(raw));
  } catch {
    return raw;
  }
};

const configInt = async (client: Queryable, key: string, fallback: number) => {
  const raw = await configString(client, key, String(fallback));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const configBool = async (client: Queryable, key: string, fallback: boolean) => {
  const raw = (await configString(client, key, String(fallback))).toLowerCase();
  if (['true', '1', 'yes', 'enabled'].includes(raw)) return true;
  if (['false', '0', 'no', 'disabled'].includes(raw)) return false;
  return fallback;
};

export const buildPayoutProviderPayload = (request: any): PayoutProviderPayload => ({
  payout_request_id: request.id,
  request_number: request.request_number,
  amount_idr: Number(request.net_amount_idr ?? request.amount_idr ?? 0),
  currency: 'IDR',
  destination: {
    bank_code: String(request.destination_snapshot?.bank_code || request.bank_code || ''),
    account_name: String(request.destination_snapshot?.account_name || request.account_name || ''),
    account_number_last4: String(request.destination_snapshot?.account_number_last4 || request.account_number_last4 || ''),
    account_number_vault_ref: String(request.destination_snapshot?.account_number_vault_ref || request.account_number_vault_ref || ''),
  },
  metadata: {
    courier_id: request.courier_id,
    payout_account_id: request.payout_account_id,
  },
});

export const providerIdempotencyKey = (payoutRequestId: string) => `courier-payout:${payoutRequestId}:v1`;

const providerReferenceFromKey = (idempotencyKey: string) => `STUB-${sha256Hex(idempotencyKey).slice(0, 18).toUpperCase()}`;

const normalizeProviderStatus = (status: unknown): ProviderStatus => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['completed', 'complete', 'paid', 'success', 'succeeded'].includes(normalized)) return 'paid';
  if (['failed', 'failure', 'rejected', 'cancelled', 'canceled'].includes(normalized)) return 'failed';
  if (['pending', 'processing', 'queued', 'submitted'].includes(normalized)) return 'processing';
  return 'unknown';
};

const providerGatewayURL = () => (process.env.PAYOUT_PROVIDER_GATEWAY_URL || process.env.INTEGRATION_GATEWAY_URL || 'http://integration-gateway:8085').replace(/\/+$/, '');

const payoutAccountVaultURL = () => (process.env.PAYOUT_ACCOUNT_VAULT_URL || '').replace(/\/+$/, '');

/**
 * Resolve the full destination only at the provider boundary. The canonical
 * payout tables intentionally store a vault reference and last four digits,
 * never the raw account number. A missing/unavailable vault must fail closed.
 */
export const resolvePayoutAccountNumber = async (vaultRef: string): Promise<string> => {
  const baseURL = payoutAccountVaultURL();
  if (!baseURL || !vaultRef) throw new Error('payout account vault is not configured');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch(`${baseURL}/v1/payout-accounts/${encodeURIComponent(vaultRef)}`, {
      headers: {
        accept: 'application/json',
        ...(process.env.PAYOUT_ACCOUNT_VAULT_TOKEN ? { authorization: `Bearer ${process.env.PAYOUT_ACCOUNT_VAULT_TOKEN}` } : {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const body = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) throw new Error(`payout account vault rejected request (${response.status})`);
  const accountNumber = String(body.account_number || body.accountNumber || body.value || '').replace(/\D/g, '');
  if (!/^\d{6,32}$/.test(accountNumber)) throw new Error('payout account vault returned an invalid account number');
  return accountNumber;
};

export const dispatchToProvider = async (
  providerName: string,
  payload: PayoutProviderPayload,
  idempotencyKey: string,
  accountNumber = '',
): Promise<ProviderDispatchResult> => {
  if (providerName === 'xendit') {
    if (!/^\d{6,32}$/.test(accountNumber)) {
      throw new Error('verified payout account number is unavailable for provider dispatch');
    }
    const response = await fetch(`${providerGatewayURL()}/api/internal/payment/disburse`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-api-key': process.env.INTERNAL_API_KEY || '',
        'x-payment-provider': 'xendit',
        'x-idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({
        ReferenceID: idempotencyKey,
        Amount: payload.amount_idr,
        BeneficiaryName: payload.destination.account_name,
        BeneficiaryAccount: accountNumber,
        BeneficiaryBank: payload.destination.bank_code,
        Notes: `Courier payout ${payload.request_number}`,
      }),
    });
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) throw new Error(`payout provider gateway rejected request (${response.status})`);
    const providerReference = String(body.reference_id || body.id || idempotencyKey);
    return {
      providerName,
      providerReference,
      providerStatus: normalizeProviderStatus(body.status),
      response: { provider: providerName, reference: providerReference, status: body.status || 'unknown', accepted_at: new Date().toISOString(), amount_idr: payload.amount_idr },
    };
  }
  if (providerName !== 'stub') {
    throw new Error(`Unsupported payout provider: ${providerName}`);
  }

  const providerReference = providerReferenceFromKey(idempotencyKey);
  return {
    providerName,
    providerReference,
    providerStatus: 'processing',
    response: {
      provider: providerName,
      reference: providerReference,
      status: 'processing',
      accepted_at: new Date().toISOString(),
      idempotency_key_hash: sha256Hex(idempotencyKey),
      amount_idr: payload.amount_idr,
    },
  };
};

/**
 * Query an ambiguous provider result without creating a second payout.
 * Real adapters can replace this stub boundary; the persisted UNKNOWN state
 * remains the source of truth until a query or webhook resolves it.
 */
export const queryProviderStatus = async (
  providerName: string,
  providerReference: string,
): Promise<ProviderQueryResult> => {
  if (providerName === 'xendit') {
    const response = await fetch(`${providerGatewayURL()}/api/internal/payment/disburse/${encodeURIComponent(providerReference)}`, {
      headers: {
        'x-internal-api-key': process.env.INTERNAL_API_KEY || '',
        'x-payment-provider': 'xendit',
      },
    });
    const body = await response.json().catch(() => ({} as Record<string, unknown>));
    if (!response.ok) throw new Error(`payout provider status query failed (${response.status})`);
    return {
      providerStatus: normalizeProviderStatus(body.status),
      response: { provider: providerName, reference: providerReference, status: body.status || 'unknown', polled_at: new Date().toISOString() },
    };
  }
  if (providerName !== 'stub') {
    throw new Error(`Unsupported payout provider: ${providerName}`);
  }
  return {
    providerStatus: 'processing',
    response: {
      provider: providerName,
      reference: providerReference,
      status: 'processing',
      polled_at: new Date().toISOString(),
    },
  };
};

const markPayoutFailedWithReversal = async (
  client: Queryable,
  payoutRequest: any,
  failureReason: string,
  metadata: Record<string, unknown>,
) => {
  await client.query(
    `UPDATE courier_payout_requests
     SET status = 'failed',
         failure_reason = $1,
         processed_at = COALESCE(processed_at, NOW()),
         updated_at = NOW()
     WHERE id = $2`,
    [failureReason, payoutRequest.id],
  );

  const reversalExists = await client.query(
    `SELECT 1
     FROM courier_earnings_ledger
     WHERE payout_request_id = $1
       AND transaction_type = 'payout_failed'
     LIMIT 1`,
    [payoutRequest.id],
  );

  if (reversalExists.rows.length === 0) {
    await client.query(
      `INSERT INTO courier_earnings_ledger (
         courier_id,
         source,
         direction,
         amount_idr,
         settlement_status,
         transaction_type,
         payout_request_id,
         description,
         metadata
       ) VALUES ($1, 'payout', 'credit', $2, 'available', 'payout_failed', $3, $4, $5::jsonb)`,
      [
        payoutRequest.courier_id,
        payoutRequest.amount_idr,
        payoutRequest.id,
        'Pencairan gagal dari provider, saldo dikembalikan',
        JSON.stringify(metadata),
      ],
    );
  }
};

export const applyProviderCallback = async (
  client: Queryable,
  input: {
    providerName: string;
    providerReference: string;
    providerStatus: ProviderStatus;
    response: Record<string, unknown>;
    failureReason?: string | null;
    req?: Request;
  },
) => {
  const dispatchResult = await client.query(
    `SELECT d.*, pr.status AS request_status, pr.amount_idr, pr.courier_id
     FROM courier_payout_dispatches d
     JOIN courier_payout_requests pr ON pr.id = d.payout_request_id
     WHERE d.provider_name = $1
       AND d.provider_reference = $2
     ORDER BY d.created_at DESC
     LIMIT 1
     FOR UPDATE OF d, pr`,
    [input.providerName, input.providerReference],
  );

  if (dispatchResult.rows.length === 0) {
    throw new Error('Payout dispatch reference not found');
  }

  const dispatch = dispatchResult.rows[0];
  const responseHash = sha256Hex(input.response);
  const metadata = {
    provider_name: input.providerName,
    provider_reference: input.providerReference,
    provider_status: input.providerStatus,
    response_hash: responseHash,
  };

  await client.query(
    `UPDATE courier_payout_dispatches
     SET provider_status = $1,
         response_hash = $2,
         response_snapshot = $3::jsonb,
         failure_reason = CASE WHEN $1 = 'failed' THEN $4 ELSE failure_reason END,
         completed_at = CASE WHEN $1 IN ('paid', 'failed') THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $5`,
    [
      input.providerStatus,
      responseHash,
      JSON.stringify(input.response),
      input.failureReason || null,
      dispatch.id,
    ],
  );

  if (input.providerStatus === 'paid') {
    await client.query(
      `UPDATE courier_payout_requests
       SET status = 'paid',
           provider_response_hash = $1,
           paid_at = NOW(),
           processed_at = COALESCE(processed_at, NOW()),
           updated_at = NOW()
       WHERE id = $2`,
      [responseHash, dispatch.payout_request_id],
    );
  } else if (input.providerStatus === 'failed') {
    await markPayoutFailedWithReversal(
      client,
      { ...dispatch, id: dispatch.payout_request_id },
      input.failureReason || 'Pencairan gagal diproses provider.',
      metadata,
    );
  } else {
    await client.query(
      `UPDATE courier_payout_requests
       SET status = 'processing',
           provider_response_hash = $1,
           processed_at = COALESCE(processed_at, NOW()),
           updated_at = NOW()
       WHERE id = $2`,
      [responseHash, dispatch.payout_request_id],
    );
  }

  await writePayoutAuditEvent(client, input.req, {
    courierId: dispatch.courier_id,
    payoutRequestId: dispatch.payout_request_id,
    eventType: 'payout_provider_callback',
    severity: input.providerStatus === 'failed' ? 'warning' : 'info',
    actorRole: 'provider',
    subjectType: 'courier_payout_dispatch',
    subjectId: dispatch.id,
    oldStatus: dispatch.request_status,
    newStatus: input.providerStatus,
    metadata,
  });

  return { dispatchId: dispatch.id, payoutRequestId: dispatch.payout_request_id, status: input.providerStatus };
};

export const dispatchApprovedPayouts = async (pool: PoolLike = db, req?: Request) => {
  const client = await pool.connect();
  const results: Array<{ payoutRequestId: string; status: ProviderStatus; providerReference: string }> = [];
  const skipped: Array<{ payoutRequestId?: string; reason: string }> = [];

  try {
    const enabled = await configBool(client, 'payout_dispatcher_enabled', true);
    const emergencyKillSwitch = await configBool(client, 'payout_emergency_kill_switch_enabled', false);
    const batchSize = await configInt(client, 'payout_dispatcher_batch_size', 25);
    const providerDailyLimit = await configInt(client, 'payout_provider_daily_limit_idr', 50000000);
    const providerName = await configString(client, 'payout_provider_name', process.env.PAYOUT_PROVIDER_NAME || 'stub');

    if (!enabled) return { processed: 0, skipped: [{ reason: 'dispatcher_disabled' }], results };
    if (emergencyKillSwitch) return { processed: 0, skipped: [{ reason: 'emergency_kill_switch_enabled' }], results };

    await client.query('BEGIN');
    const providerUsage = await client.query(
      `SELECT COALESCE(SUM(pr.net_amount_idr), 0)::int AS amount_idr
       FROM courier_payout_dispatches d
       JOIN courier_payout_requests pr ON pr.id = d.payout_request_id
       WHERE d.provider_name = $1
         AND d.created_at >= date_trunc('day', NOW())
         AND d.provider_status IN ('processing', 'paid')`,
      [providerName],
    );
    let providerAmountToday = Number(providerUsage.rows[0]?.amount_idr || 0);

    const candidates = await client.query(
      `SELECT pr.*, cpa.bank_code AS payout_account_bank_code,
              cpa.account_name AS payout_account_name,
              cpa.account_number_last4 AS payout_account_last4,
              cpa.account_number_vault_ref AS payout_account_vault_ref,
              cpa.status AS payout_account_status
       FROM courier_payout_requests pr
       LEFT JOIN courier_payout_accounts cpa ON cpa.id = pr.payout_account_id
       WHERE pr.status IN ('approved_auto', 'approved')
         AND cpa.status = 'verified'
         AND NOT EXISTS (
           SELECT 1
           FROM courier_payout_dispatches d
           WHERE d.payout_request_id = pr.id
             AND d.provider_status IN ('processing', 'paid')
         )
       ORDER BY COALESCE(pr.reviewed_at, pr.requested_at), pr.created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );

    for (const payout of candidates.rows) {
      const payoutAmount = Number(payout.net_amount_idr ?? payout.amount_idr ?? 0);
      if (providerAmountToday + payoutAmount > providerDailyLimit) {
        skipped.push({ payoutRequestId: payout.id, reason: 'provider_daily_limit_exceeded' });
        await writePayoutAuditEvent(client, req, {
          courierId: payout.courier_id,
          payoutRequestId: payout.id,
          eventType: 'payout_dispatch_created',
          severity: 'warning',
          actorRole: req?.user?.role || 'system',
          subjectType: 'courier_payout_request',
          subjectId: payout.id,
          oldStatus: payout.status,
          newStatus: payout.status,
          metadata: {
            skipped: true,
            reason: 'provider_daily_limit_exceeded',
            provider_name: providerName,
            provider_daily_limit_idr: providerDailyLimit,
            provider_amount_today_idr: providerAmountToday,
            payout_amount_idr: payoutAmount,
          },
        });
        continue;
      }

      const payload = buildPayoutProviderPayload({
        ...payout,
        bank_code: payout.payout_account_bank_code,
        account_name: payout.payout_account_name,
        account_number_last4: payout.payout_account_last4,
        account_number_vault_ref: payout.payout_account_vault_ref,
      });
      const idempotencyKey = providerIdempotencyKey(payout.id);
      const payloadHash = sha256Hex(payload);
      let providerAccountNumber = '';
      if (providerName === 'xendit') {
        try {
          providerAccountNumber = await resolvePayoutAccountNumber(payload.destination.account_number_vault_ref);
        } catch (error) {
          const reason = String(error instanceof Error ? error.message : error).includes('not configured')
            ? 'payout_account_vault_unconfigured'
            : 'provider_account_unavailable';
          skipped.push({ payoutRequestId: payout.id, reason });
          await writePayoutAuditEvent(client, req, {
            courierId: payout.courier_id,
            payoutRequestId: payout.id,
            eventType: 'payout_dispatch_created',
            severity: 'warning',
            actorRole: req?.user?.role || 'system',
            subjectType: 'courier_payout_request',
            subjectId: payout.id,
            oldStatus: payout.status,
            newStatus: payout.status,
            metadata: { skipped: true, reason, provider_name: providerName },
          });
          continue;
        }
      }
      const providerResult = await dispatchToProvider(providerName, payload, idempotencyKey, providerAccountNumber);
      const responseHash = sha256Hex(providerResult.response);

      const inserted = await client.query(
        `INSERT INTO courier_payout_dispatches (
           payout_request_id,
           courier_id,
           payout_account_id,
           provider_name,
           provider_reference,
           provider_status,
           idempotency_key,
           request_payload_hash,
           response_hash,
           response_snapshot,
           failure_reason
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
         ON CONFLICT (idempotency_key) DO UPDATE SET
           attempt_count = courier_payout_dispatches.attempt_count + 1,
           updated_at = NOW()
         RETURNING *`,
        [
          payout.id,
          payout.courier_id,
          payout.payout_account_id,
          providerResult.providerName,
          providerResult.providerReference,
          providerResult.providerStatus,
          idempotencyKey,
          payloadHash,
          responseHash,
          JSON.stringify(providerResult.response),
          providerResult.failureReason || null,
        ],
      );

      await client.query(
        `UPDATE courier_payout_requests
         SET provider_name = $1,
             provider_reference = $2,
             provider_payload_hash = $3,
             provider_response_hash = $4,
             processed_at = COALESCE(processed_at, NOW()),
             updated_at = NOW()
         WHERE id = $5`,
        [
          providerResult.providerName,
          providerResult.providerReference,
          payloadHash,
          responseHash,
          payout.id,
        ],
      );

      if (providerResult.providerStatus === 'failed') {
        await markPayoutFailedWithReversal(
          client,
          payout,
          providerResult.failureReason || 'Pencairan gagal diproses provider.',
          {
            provider_name: providerResult.providerName,
            provider_reference: providerResult.providerReference,
            request_payload_hash: payloadHash,
            response_hash: responseHash,
          },
        );
      } else {
        await client.query(
          `UPDATE courier_payout_requests
           SET status = $1,
               paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END,
               updated_at = NOW()
           WHERE id = $2`,
          [providerResult.providerStatus, payout.id],
        );
      }

      await writePayoutAuditEvent(client, req, {
        courierId: payout.courier_id,
        payoutRequestId: payout.id,
        eventType: 'payout_dispatch_created',
        severity: providerResult.providerStatus === 'failed' ? 'warning' : 'info',
        actorRole: req?.user?.role || 'system',
        subjectType: 'courier_payout_dispatch',
        subjectId: inserted.rows[0].id,
        oldStatus: payout.status,
        newStatus: providerResult.providerStatus,
        metadata: {
          provider_name: providerResult.providerName,
          provider_reference: providerResult.providerReference,
          request_payload_hash: payloadHash,
          response_hash: responseHash,
        },
      });

      results.push({
        payoutRequestId: payout.id,
        status: providerResult.providerStatus,
        providerReference: providerResult.providerReference,
      });
      providerAmountToday += payoutAmount;
    }

    await client.query('COMMIT');
    return { processed: results.length, skipped, results };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    payoutStructuredLog('error', 'payout_dispatch_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
};

export const pollUnknownPayouts = async (pool: PoolLike = db, req?: Request) => {
  const client = await pool.connect();
  const results: Array<{ payoutRequestId: string; status: ProviderStatus; providerReference: string }> = [];
  const skipped: Array<{ payoutRequestId?: string; reason: string }> = [];

  try {
    const batchSize = await configInt(client, 'payout_provider_poll_batch_size', 25);
    await client.query('BEGIN');
    const candidates = await client.query(
      `SELECT d.provider_name, d.provider_reference, d.payout_request_id
       FROM courier_payout_dispatches d
       WHERE d.provider_status = 'unknown'
         AND d.provider_reference IS NOT NULL
       ORDER BY d.updated_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize],
    );

    for (const dispatch of candidates.rows) {
      try {
        const providerResult = await queryProviderStatus(dispatch.provider_name, dispatch.provider_reference);
        const result = await applyProviderCallback(client, {
          providerName: dispatch.provider_name,
          providerReference: dispatch.provider_reference,
          providerStatus: providerResult.providerStatus,
          response: providerResult.response,
          failureReason: providerResult.failureReason,
          req,
        });
        results.push({
          payoutRequestId: result.payoutRequestId,
          status: result.status,
          providerReference: dispatch.provider_reference,
        });
      } catch (error) {
        skipped.push({ payoutRequestId: dispatch.payout_request_id, reason: error instanceof Error ? error.message : String(error) });
        payoutStructuredLog('warn', 'payout_provider_poll_failed', {
          payout_request_id: dispatch.payout_request_id,
          provider_name: dispatch.provider_name,
          provider_reference: dispatch.provider_reference,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await client.query('COMMIT');
    return { processed: results.length, skipped, results };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    payoutStructuredLog('error', 'payout_provider_poll_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
};

export const verifyProviderWebhookSignature = (rawBody: Buffer | string, signature: string | undefined, secret: string) => {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const normalized = signature.startsWith('sha256=') ? signature.slice('sha256='.length) : signature;
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(normalized, 'hex');
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
};
