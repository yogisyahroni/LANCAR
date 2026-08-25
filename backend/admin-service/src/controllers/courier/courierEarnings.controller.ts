import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import { db } from '../../db';
import { createNotification } from '../../notifications';

import crypto from 'crypto';
import axios from 'axios';

import { evaluateCourierPayoutRisk } from '../../services/payoutRiskEngine';
import { decoratePayoutRequest, payoutMobileMessage } from '../../services/payoutStatusPolicy';

import { evaluatePayoutAlerts, writePayoutAuditEvent } from '../../utils/payoutObservability';
import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { isFeatureFlagEnabled } from '../../services/featureFlags';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import {
  AuthProtectionError,
  assertAuthAttemptAllowed,
  getRequestIpAddress,
  recordAuthFailure,
  recordAuthSuccess,
  sendAuthProtectionError,
} from '../../security/bruteForceProtection';




import {
  getCourierPayoutPolicy,
  isValidCourierPassword,
  logPayoutSecurityEvent,
  sha256,
} from './_shared';

export const getMobileCourierEarningsLedger = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT
         cel.id,
         cel.order_id,
         o.order_number,
         cel.source,
         COALESCE(cel.transaction_type, 'earning_credit') AS transaction_type,
         cel.direction,
         cel.amount_idr,
         cel.settlement_status,
         cel.description,
         cel.created_at
       FROM courier_earnings_ledger cel
       LEFT JOIN orders o ON o.id = cel.order_id
       WHERE cel.courier_id = $1
       ORDER BY cel.created_at DESC
       LIMIT 40`,
      [req.user.id]
    );

    const summary = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_idr ELSE -amount_idr END), 0)::int AS total_balance_idr,
         COALESCE(SUM(CASE
           WHEN settlement_status = 'available' AND direction = 'credit' THEN amount_idr
           WHEN settlement_status IN ('requested', 'processing', 'paid') AND direction = 'debit' THEN -amount_idr
           ELSE 0
         END), 0)::int AS available_balance_idr,
         COALESCE(SUM(CASE
           WHEN settlement_status = 'pending' AND direction = 'credit' THEN amount_idr
           WHEN settlement_status IN ('requested', 'processing') AND direction = 'debit' THEN amount_idr
           ELSE 0
         END), 0)::int AS pending_balance_idr
       FROM courier_earnings_ledger
       WHERE courier_id = $1`,
      [req.user.id]
    );
    const payoutAccount = await db.query(
      `WITH verified_account AS (
         SELECT
           bank_code,
           ('**** ' || account_number_last4) AS account_number,
           account_name,
           status,
           verified_at
         FROM courier_payout_accounts
         WHERE courier_id = $1
           AND is_primary = TRUE
         ORDER BY
           CASE status
             WHEN 'verified' THEN 1
             WHEN 'pending_review' THEN 2
             WHEN 'suspended' THEN 3
             ELSE 4
           END,
           verified_at DESC NULLS LAST,
           created_at DESC
         LIMIT 1
       ), legacy_account AS (
         SELECT
           bank_code,
           CASE
             WHEN bank_account_number IS NULL THEN NULL
             ELSE '**** ' || right(regexp_replace(bank_account_number, '\\D', '', 'g'), 4)
           END AS account_number,
           bank_account_name AS account_name,
           CASE
             WHEN bank_code IS NOT NULL AND bank_account_number IS NOT NULL AND bank_account_name IS NOT NULL THEN 'pending_review'
             ELSE NULL
           END AS status,
           NULL::timestamptz AS verified_at
         FROM courier_profiles
         WHERE user_id = $1
         LIMIT 1
       )
       SELECT * FROM verified_account
       UNION ALL
       SELECT * FROM legacy_account
       WHERE NOT EXISTS (SELECT 1 FROM verified_account)
       LIMIT 1`,
      [req.user.id]
    );
    const summaryRow = summary.rows[0] || {
      total_balance_idr: 0,
      available_balance_idr: 0,
      pending_balance_idr: 0,
    };

    res.json({
      success: true,
      data: {
        summary: {
          ...summaryRow,
          payout_account: payoutAccount.rows[0] || null,
        },
        transactions: result.rows,
      },
      message: 'Courier earnings ledger loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier earnings ledger error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};



export const getMobileCourierPayoutSummary = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const policy = await getCourierPayoutPolicy();
    const [balance, account, activeRequests, dailyRequested] = await Promise.all([
      db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_idr ELSE -amount_idr END), 0)::int AS total_balance_idr,
           COALESCE(SUM(
             CASE
               WHEN cel.direction = 'credit'
                 AND cel.settlement_status = 'available'
                 AND NOT EXISTS (
                   SELECT 1 FROM disputes d
                   WHERE d.order_id = cel.order_id
                     AND d.status IN ('open', 'investigating', 'pending')
                 )
               THEN cel.amount_idr
               WHEN cel.direction = 'debit'
                 AND cel.settlement_status IN ('requested', 'processing', 'paid')
               THEN -cel.amount_idr
               ELSE 0
             END
           ), 0)::int AS available_balance_idr,
           COALESCE(SUM(CASE
             WHEN settlement_status = 'pending' AND direction = 'credit' THEN amount_idr
             WHEN settlement_status IN ('requested', 'processing') AND direction = 'debit' THEN amount_idr
             ELSE 0
           END), 0)::int AS pending_balance_idr
         FROM courier_earnings_ledger cel
         WHERE cel.courier_id = $1`,
        [req.user.id]
      ),
      db.query(
        `SELECT
           id,
           bank_code,
           ('**** ' || account_number_last4) AS account_number,
           account_name,
           status,
           verified_at,
           created_at
         FROM courier_payout_accounts
         WHERE courier_id = $1
           AND is_primary = TRUE
         ORDER BY
           CASE status
             WHEN 'verified' THEN 1
             WHEN 'pending_review' THEN 2
             WHEN 'suspended' THEN 3
             ELSE 4
           END,
           verified_at DESC NULLS LAST,
           created_at DESC
         LIMIT 1`,
        [req.user.id]
      ),
      db.query(
        `SELECT COUNT(*)::int AS active_request_count
         FROM courier_payout_requests
         WHERE courier_id = $1
           AND status IN ('requested', 'risk_screening', 'approved_auto', 'risk_hold', 'manual_review', 'under_review', 'approved', 'processing')`,
        [req.user.id]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount_idr), 0)::int AS requested_today_idr
         FROM courier_payout_requests
         WHERE courier_id = $1
           AND requested_at >= date_trunc('day', NOW())
           AND status NOT IN ('failed', 'rejected', 'blocked', 'cancelled')`,
        [req.user.id]
      ),
    ]);

    const balanceRow = balance.rows[0] || {};
    const accountRow = account.rows[0] || null;
    const activeRequestCount = Number(activeRequests.rows[0]?.active_request_count || 0);
    const requestedToday = Number(dailyRequested.rows[0]?.requested_today_idr || 0);
    const availableBalance = Number(balanceRow.available_balance_idr || 0);

    const eligibilityReasons: string[] = [];
    if (!accountRow || accountRow.status !== 'verified') {
      eligibilityReasons.push('Rekening pencairan belum terverifikasi.');
    }
    if (availableBalance < policy.min_amount_idr) {
      eligibilityReasons.push(`Saldo tersedia belum mencapai minimum Rp${policy.min_amount_idr.toLocaleString('id-ID')}.`);
    }
    if (activeRequestCount >= policy.max_pending_requests) {
      eligibilityReasons.push('Masih ada pengajuan pencairan aktif yang perlu diselesaikan.');
    }
    if (requestedToday >= policy.daily_limit_idr) {
      eligibilityReasons.push('Limit pencairan harian sudah tercapai.');
    }

    await logPayoutSecurityEvent(req, 'summary_viewed', 'info');

    res.json({
      success: true,
      data: {
        summary: {
          total_balance_idr: Number(balanceRow.total_balance_idr || 0),
          available_balance_idr: availableBalance,
          pending_balance_idr: Number(balanceRow.pending_balance_idr || 0),
          requested_today_idr: requestedToday,
          active_request_count: activeRequestCount,
        },
        payout_account: accountRow,
        policy,
        eligibility: {
          can_request: eligibilityReasons.length === 0,
          reasons: eligibilityReasons,
          max_requestable_idr: Math.max(0, Math.min(availableBalance, policy.daily_limit_idr - requestedToday)),
        },
      },
      message: 'Courier payout summary loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier payout summary error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};



export const getMobileCourierPayoutRequests = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  try {
    const result = await db.query(
      `SELECT
         pr.id,
         pr.request_number,
         pr.amount_idr,
         pr.fee_idr,
         pr.net_amount_idr,
         pr.status,
         pr.destination_snapshot,
         pr.risk_snapshot,
         pr.failure_reason,
         pr.requested_at,
         pr.reviewed_at,
         pr.processed_at,
         pr.paid_at
       FROM courier_payout_requests pr
       WHERE pr.courier_id = $1
       ORDER BY pr.requested_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    await logPayoutSecurityEvent(req, 'request_list_viewed', 'info');

    res.json({
      success: true,
      data: result.rows.map((row) => decoratePayoutRequest(row)),
      message: 'Courier payout requests loaded',
    });
  } catch (error) {
    securityLog.error('Get mobile courier payout requests error:', error);
    res.status(500).json({ success: false, data: null, message: 'Internal Server Error', code: 'ERR_INTERNAL_SERVER' });
  }
};



export const createMobileCourierPayoutRequest = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
    return;
  }

  const amountIdr = Number(req.body?.amount_idr ?? req.body?.amount);
  const transactionPin = String(req.body?.transaction_pin || req.body?.pin || '');
  const idempotencyKey = String(req.headers['x-idempotency-key'] || req.body?.idempotency_key || '').trim();

  if (!Number.isInteger(amountIdr) || amountIdr <= 0) {
    res.status(400).json({ success: false, data: null, message: 'Nominal pencairan tidak valid.', code: 'ERR_INVALID_AMOUNT' });
    return;
  }

  if (!transactionPin) {
    res.status(400).json({ success: false, data: null, message: 'PIN transaksi wajib diisi.', code: 'ERR_STEP_UP_REQUIRED' });
    return;
  }

  if (idempotencyKey.length < 12) {
    res.status(400).json({ success: false, data: null, message: 'Idempotency key wajib dikirim untuk pencairan.', code: 'ERR_IDEMPOTENCY_REQUIRED' });
    return;
  }

  try {
    const courier = await db.query(
      `SELECT id, role, status, pin_hash
       FROM users
       WHERE id = $1
         AND role = 'courier'
       LIMIT 1`,
      [req.user.id]
    );

    const courierRow = courier.rows[0];
    if (!courierRow || courierRow.status !== 'active' || !isValidCourierPassword(transactionPin, courierRow.pin_hash)) {
      await logPayoutSecurityEvent(req, 'step_up_failed', 'warning', { amount_idr: amountIdr });
      res.status(403).json({
        success: false,
        data: null,
        message: 'Verifikasi PIN transaksi gagal.',
        code: 'ERR_STEP_UP_FAILED',
      });
      return;
    }

    const client = await db.connect();
    let requestRow: any;
    let riskResult: Awaited<ReturnType<typeof evaluateCourierPayoutRisk>> | null = null;
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `SELECT payout_request_id, status, available_balance_idr
         FROM request_courier_payout($1, $2, $3)`,
        [req.user.id, amountIdr, idempotencyKey]
      );
      requestRow = result.rows[0];
      riskResult = await evaluateCourierPayoutRisk(client, req, requestRow.payout_request_id);
      await client.query('COMMIT');
    } catch (riskError) {
      await client.query('ROLLBACK');
      throw riskError;
    } finally {
      client.release();
    }

    const detail = await db.query(
      `SELECT
         pr.id,
         pr.request_number,
         pr.amount_idr,
         pr.fee_idr,
         pr.net_amount_idr,
         pr.status,
         pr.destination_snapshot,
         pr.risk_snapshot,
         pr.requested_at,
         rd.decision AS risk_decision,
         rd.risk_level,
         rd.risk_score,
         rd.reasons AS risk_reasons
       FROM courier_payout_requests pr
       LEFT JOIN LATERAL (
         SELECT decision, risk_level, risk_score, reasons
         FROM courier_payout_risk_decisions
         WHERE payout_request_id = pr.id
         ORDER BY created_at DESC
         LIMIT 1
       ) rd ON TRUE
       WHERE pr.id = $1
         AND pr.courier_id = $2
       LIMIT 1`,
      [requestRow.payout_request_id, req.user.id]
    );

    await logPayoutSecurityEvent(
      req,
      'request_created',
      'info',
      {
        amount_idr: amountIdr,
        idempotency_key_hash: sha256(idempotencyKey),
        risk_decision: riskResult?.decision?.decision || null,
        risk_score: riskResult?.decision?.risk_score ?? null,
      },
      requestRow.payout_request_id
    );
    await evaluatePayoutAlerts(db);

    const decoratedRequest = detail.rows[0] ? decoratePayoutRequest(detail.rows[0]) : null;

    res.status(201).json({
      success: true,
      data: {
        request: decoratedRequest,
        available_balance_idr: Number(requestRow.available_balance_idr || 0),
        risk_decision: riskResult?.decision || null,
      },
      message: payoutMobileMessage(decoratedRequest?.status || requestRow.status),
    });
  } catch (error: any) {
    const message = String(error?.message || 'Payout request failed');
    await logPayoutSecurityEvent(req, 'request_blocked', 'warning', {
      amount_idr: amountIdr,
      reason: message,
    });
    await evaluatePayoutAlerts(db);

    const knownPolicyError = /minimum|Verified payout account|cooldown|Too many|Daily payout|Insufficient|Idempotency/i.test(message);
    res.status(knownPolicyError ? 422 : 500).json({
      success: false,
      data: null,
      message: knownPolicyError ? message : 'Internal Server Error',
      code: knownPolicyError ? 'ERR_PAYOUT_POLICY_BLOCKED' : 'ERR_INTERNAL_SERVER',
    });
  }
};


