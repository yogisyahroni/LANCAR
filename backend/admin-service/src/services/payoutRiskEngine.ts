import { Request } from 'express';
import { writePayoutAuditEvent } from '../utils/payoutObservability';

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

type RiskDecision = 'auto_approved' | 'manual_review' | 'blocked';
type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

type RuleHit = {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  score: number;
  message: string;
};

const requestIp = (req?: Request) => {
  if (!req) return null;
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.socket.remoteAddress || null;
  return raw ? String(raw).split(',')[0].trim().replace('::ffff:', '') : null;
};

const requestDeviceId = (req?: Request) => {
  if (!req) return null;
  const raw = req.headers['x-device-id'] || req.headers['x-client-device-id'];
  return Array.isArray(raw) ? raw[0] : raw ? String(raw) : null;
};

const numberConfig = async (client: Queryable, key: string, fallback: number) => {
  const result = await client.query(
    `SELECT (value #>> '{}') AS value FROM system_configs WHERE key = $1 LIMIT 1`,
    [key],
  );
  const parsed = Number(result.rows[0]?.value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanConfig = async (client: Queryable, key: string, fallback: boolean) => {
  const result = await client.query(
    `SELECT (value #>> '{}') AS value FROM system_configs WHERE key = $1 LIMIT 1`,
    [key],
  );
  const value = String(result.rows[0]?.value ?? '').toLowerCase();
  if (['true', '1', 'yes', 'enabled'].includes(value)) return true;
  if (['false', '0', 'no', 'disabled'].includes(value)) return false;
  return fallback;
};

const riskLevelForScore = (score: number, blocked: boolean): RiskLevel => {
  if (blocked || score >= 85) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
};

const finalStatusForDecision = (decision: RiskDecision, score: number) => {
  if (decision === 'auto_approved') return 'approved_auto';
  if (decision === 'blocked') return 'blocked';
  return score >= 60 ? 'risk_hold' : 'manual_review';
};

export const evaluateCourierPayoutRisk = async (
  client: Queryable,
  req: Request | undefined,
  payoutRequestId: string,
) => {
  const deviceId = requestDeviceId(req);
  const ipAddress = requestIp(req);

  const requestResult = await client.query(
    `SELECT
       pr.*,
       cpa.status AS account_status,
       cpa.verified_at AS account_verified_at,
       cpa.created_at AS account_created_at,
       cpa.account_number_fingerprint,
       u.status AS courier_status,
       COALESCE(cp.avg_partner_rating, 5.0)::numeric AS avg_partner_rating,
       COALESCE(cp.complaint_count, 0)::int AS complaint_count,
       COALESCE(cp.complaint_ratio_pct, 0)::numeric AS complaint_ratio_pct
     FROM courier_payout_requests pr
     JOIN courier_payout_accounts cpa ON cpa.id = pr.payout_account_id
     JOIN users u ON u.id = pr.courier_id
     LEFT JOIN courier_profiles cp ON cp.user_id = pr.courier_id
     WHERE pr.id = $1
     FOR UPDATE`,
    [payoutRequestId],
  );

  const payout = requestResult.rows[0];
  if (!payout) {
    throw new Error('Payout request not found for risk evaluation');
  }

  const [
    autoEnabled,
    emergencyKillSwitch,
    maxAutoAmount,
    cooldownHours,
    hourlyLimit,
    bankHourlyLimit,
    deviceHourlyLimit,
    ipHourlyLimit,
    bankDailyAutoLimit,
    balance,
    disputes,
    hourlyRequests,
    bankHourlyRequests,
    bankDailyAmount,
    deviceHourlyRequests,
    ipHourlyRequests,
    deviceHistory,
    accountReuse,
  ] = await Promise.all([
    booleanConfig(client, 'payout_auto_approval_enabled', true),
    booleanConfig(client, 'payout_emergency_kill_switch_enabled', false),
    numberConfig(client, 'payout_max_auto_amount_idr', 500000),
    numberConfig(client, 'payout_account_cooldown_hours', 24),
    numberConfig(client, 'payout_hourly_request_limit', 3),
    numberConfig(client, 'payout_bank_hourly_request_limit', 5),
    numberConfig(client, 'payout_device_hourly_request_limit', 4),
    numberConfig(client, 'payout_ip_hourly_request_limit', 8),
    numberConfig(client, 'payout_bank_daily_auto_limit_idr', 1500000),
    client.query(
      `SELECT
         COALESCE(SUM(CASE
           WHEN direction = 'credit' AND settlement_status = 'available' THEN amount_idr
           WHEN direction = 'debit' AND settlement_status IN ('requested', 'processing', 'paid') THEN -amount_idr
           ELSE 0
         END), 0)::int AS available_balance_idr
       FROM courier_earnings_ledger
       WHERE courier_id = $1`,
      [payout.courier_id],
    ),
    client.query(
      `SELECT COUNT(DISTINCT d.id)::int AS open_dispute_count
       FROM courier_earnings_ledger cel
       JOIN disputes d ON d.order_id = cel.order_id
       WHERE cel.courier_id = $1
         AND cel.direction = 'credit'
         AND cel.settlement_status = 'available'
         AND d.status IN ('open', 'investigating', 'pending')`,
      [payout.courier_id],
    ),
    client.query(
      `SELECT COUNT(*)::int AS request_count
       FROM courier_payout_requests
       WHERE courier_id = $1
         AND requested_at >= NOW() - INTERVAL '1 hour'`,
      [payout.courier_id],
    ),
    client.query(
      `SELECT COUNT(*)::int AS request_count
       FROM courier_payout_requests pr
       JOIN courier_payout_accounts cpa ON cpa.id = pr.payout_account_id
       WHERE cpa.account_number_fingerprint = $1
         AND cpa.account_number_fingerprint IS NOT NULL
         AND pr.requested_at >= NOW() - INTERVAL '1 hour'`,
      [payout.account_number_fingerprint],
    ),
    client.query(
      `SELECT COALESCE(SUM(pr.amount_idr), 0)::int AS amount_idr
       FROM courier_payout_requests pr
       JOIN courier_payout_accounts cpa ON cpa.id = pr.payout_account_id
       WHERE cpa.account_number_fingerprint = $1
         AND cpa.account_number_fingerprint IS NOT NULL
         AND pr.requested_at >= date_trunc('day', NOW())
         AND pr.status NOT IN ('failed', 'rejected', 'blocked', 'cancelled')`,
      [payout.account_number_fingerprint],
    ),
    deviceId
      ? client.query(
          `SELECT COUNT(*)::int AS request_count
           FROM courier_payout_risk_decisions
           WHERE device_id = $1
             AND created_at >= NOW() - INTERVAL '1 hour'`,
          [deviceId],
        )
      : Promise.resolve({ rows: [{ request_count: 0 }] }),
    ipAddress
      ? client.query(
          `SELECT COUNT(*)::int AS request_count
           FROM courier_payout_risk_decisions
           WHERE ip_address = NULLIF($1, '')::inet
             AND created_at >= NOW() - INTERVAL '1 hour'`,
          [ipAddress],
        )
      : Promise.resolve({ rows: [{ request_count: 0 }] }),
    deviceId
      ? client.query(
          `SELECT COUNT(*)::int AS seen_count
           FROM courier_payout_security_events
           WHERE courier_id = $1
             AND device_id = $2
             AND created_at < NOW() - INTERVAL '1 hour'`,
          [payout.courier_id, deviceId],
        )
      : Promise.resolve({ rows: [{ seen_count: 0 }] }),
    client.query(
      `SELECT COUNT(DISTINCT courier_id)::int AS courier_count
       FROM courier_payout_accounts
       WHERE account_number_fingerprint = $1
         AND account_number_fingerprint IS NOT NULL`,
      [payout.account_number_fingerprint],
    ),
  ]);

  const hits: RuleHit[] = [];
  const reasons: string[] = [];
  let score = 0;
  let blocked = false;

  const hit = (rule: RuleHit) => {
    hits.push(rule);
    reasons.push(rule.message);
    score += rule.score;
    if (rule.severity === 'critical') blocked = true;
  };

  if (!autoEnabled) {
    hit({ code: 'AUTO_PAYOUT_DISABLED', severity: 'warning', score: 25, message: 'Auto payout sedang dinonaktifkan oleh konfigurasi operasional.' });
  }

  if (emergencyKillSwitch) {
    hit({ code: 'EMERGENCY_KILL_SWITCH', severity: 'warning', score: 60, message: 'Emergency kill switch aktif. Pengajuan masuk review manual.' });
  }

  if (payout.account_status !== 'verified') {
    hit({ code: 'ACCOUNT_NOT_VERIFIED', severity: 'critical', score: 100, message: 'Rekening pencairan belum terverifikasi.' });
  }

  const verifiedAt = new Date(payout.account_verified_at || payout.account_created_at || 0).getTime();
  if (Number.isFinite(verifiedAt) && Date.now() - verifiedAt < cooldownHours * 60 * 60 * 1000) {
    hit({ code: 'ACCOUNT_COOLDOWN', severity: 'warning', score: 35, message: 'Rekening baru diverifikasi atau berubah dalam periode cooldown.' });
  }

  const availableBalance = Number(balance.rows[0]?.available_balance_idr || 0);
  if (availableBalance < 0) {
    hit({ code: 'NEGATIVE_BALANCE', severity: 'critical', score: 100, message: 'Saldo ledger terdeteksi negatif.' });
  }

  const balanceBefore = Number(payout.risk_snapshot?.balance_before_idr || 0);
  if (balanceBefore < Number(payout.amount_idr)) {
    hit({ code: 'BALANCE_MISMATCH', severity: 'critical', score: 100, message: 'Saldo tersedia tidak cukup atau tidak cocok dengan snapshot request.' });
  }

  const openDisputeCount = Number(disputes.rows[0]?.open_dispute_count || 0);
  if (openDisputeCount > 0) {
    hit({ code: 'OPEN_DISPUTE', severity: 'warning', score: 35, message: 'Ada dispute aktif pada sumber saldo kurir.' });
  }

  if (Number(payout.amount_idr) > maxAutoAmount) {
    hit({ code: 'AMOUNT_ABOVE_AUTO_LIMIT', severity: 'warning', score: 30, message: 'Nominal pencairan melebihi limit auto approval.' });
  }

  const hourlyCount = Number(hourlyRequests.rows[0]?.request_count || 0);
  if (hourlyCount > hourlyLimit * 2) {
    hit({ code: 'REQUEST_VELOCITY_BLOCK', severity: 'critical', score: 100, message: 'Frekuensi pengajuan pencairan abnormal.' });
  } else if (hourlyCount > hourlyLimit) {
    hit({ code: 'REQUEST_VELOCITY_REVIEW', severity: 'warning', score: 30, message: 'Frekuensi pengajuan pencairan melewati batas normal.' });
  }

  const bankHourlyCount = Number(bankHourlyRequests.rows[0]?.request_count || 0);
  if (bankHourlyCount > bankHourlyLimit * 2) {
    hit({ code: 'BANK_VELOCITY_BLOCK', severity: 'critical', score: 100, message: 'Frekuensi pencairan pada rekening ini abnormal.' });
  } else if (bankHourlyCount > bankHourlyLimit) {
    hit({ code: 'BANK_VELOCITY_REVIEW', severity: 'warning', score: 35, message: 'Frekuensi pencairan pada rekening ini melewati batas normal.' });
  }

  const bankDailyTotal = Number(bankDailyAmount.rows[0]?.amount_idr || 0);
  if (bankDailyTotal > bankDailyAutoLimit) {
    hit({ code: 'BANK_DAILY_AUTO_LIMIT', severity: 'warning', score: 40, message: 'Total pencairan harian rekening melewati limit auto payout.' });
  }

  const deviceHourlyCount = Number(deviceHourlyRequests.rows[0]?.request_count || 0);
  if (deviceId && deviceHourlyCount > deviceHourlyLimit * 2) {
    hit({ code: 'DEVICE_VELOCITY_BLOCK', severity: 'critical', score: 100, message: 'Frekuensi pencairan dari perangkat ini abnormal.' });
  } else if (deviceId && deviceHourlyCount > deviceHourlyLimit) {
    hit({ code: 'DEVICE_VELOCITY_REVIEW', severity: 'warning', score: 35, message: 'Frekuensi pencairan dari perangkat ini melewati batas normal.' });
  }

  const ipHourlyCount = Number(ipHourlyRequests.rows[0]?.request_count || 0);
  if (ipAddress && ipHourlyCount > ipHourlyLimit * 2) {
    hit({ code: 'IP_VELOCITY_BLOCK', severity: 'critical', score: 100, message: 'Frekuensi pencairan dari jaringan ini abnormal.' });
  } else if (ipAddress && ipHourlyCount > ipHourlyLimit) {
    hit({ code: 'IP_VELOCITY_REVIEW', severity: 'warning', score: 35, message: 'Frekuensi pencairan dari jaringan ini melewati batas normal.' });
  }

  if (!deviceId) {
    hit({ code: 'MISSING_DEVICE_ID', severity: 'warning', score: 20, message: 'Device ID tidak tersedia untuk verifikasi perangkat.' });
  } else if (Number(deviceHistory.rows[0]?.seen_count || 0) === 0) {
    hit({ code: 'NEW_DEVICE', severity: 'warning', score: 20, message: 'Perangkat belum memiliki histori payout yang cukup.' });
  }

  if (Number(accountReuse.rows[0]?.courier_count || 0) > 1) {
    hit({ code: 'SHARED_BANK_ACCOUNT', severity: 'warning', score: 40, message: 'Rekening terdeteksi digunakan oleh lebih dari satu kurir.' });
  }

  if (Number(payout.complaint_ratio_pct || 0) >= 10 || Number(payout.complaint_count || 0) >= 5 || Number(payout.avg_partner_rating || 5) < 4) {
    hit({ code: 'LOW_COURIER_TRUST', severity: 'warning', score: 30, message: 'Trust score kurir membutuhkan review operasional.' });
  }

  score = Math.min(100, score);
  const decision: RiskDecision = blocked ? 'blocked' : score === 0 ? 'auto_approved' : 'manual_review';
  const riskLevel = riskLevelForScore(score, blocked);
  const finalStatus = finalStatusForDecision(decision, score);

  const inputSnapshot = {
    amount_idr: Number(payout.amount_idr),
    available_balance_after_hold_idr: availableBalance,
    balance_before_idr: balanceBefore,
    open_dispute_count: openDisputeCount,
    hourly_request_count: hourlyCount,
    bank_hourly_request_count: bankHourlyCount,
    bank_daily_amount_idr: bankDailyTotal,
    device_hourly_request_count: deviceHourlyCount,
    ip_hourly_request_count: ipHourlyCount,
    account_reuse_count: Number(accountReuse.rows[0]?.courier_count || 0),
    device_id_present: Boolean(deviceId),
    auto_enabled: autoEnabled,
    emergency_kill_switch_enabled: emergencyKillSwitch,
    max_auto_amount_idr: maxAutoAmount,
    hourly_request_limit: hourlyLimit,
    bank_hourly_request_limit: bankHourlyLimit,
    device_hourly_request_limit: deviceHourlyLimit,
    ip_hourly_request_limit: ipHourlyLimit,
    bank_daily_auto_limit_idr: bankDailyAutoLimit,
  };

  const decisionResult = await client.query(
    `INSERT INTO courier_payout_risk_decisions (
       payout_request_id,
       courier_id,
       payout_account_id,
       decision,
       risk_level,
       risk_score,
       reasons,
       rule_hits,
       input_snapshot,
       actor_id,
       device_id,
       ip_address,
       user_agent
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb, $9::jsonb, $10, $11, NULLIF($12, '')::inet, $13)
     RETURNING *`,
    [
      payout.id,
      payout.courier_id,
      payout.payout_account_id,
      decision,
      riskLevel,
      score,
      reasons,
      JSON.stringify(hits),
      JSON.stringify(inputSnapshot),
      req?.user?.id || payout.courier_id,
      deviceId,
      ipAddress,
      req?.headers['user-agent'] || null,
    ],
  );

  const riskSnapshot = {
    risk_engine: 'v1',
    risk_decision_id: decisionResult.rows[0].id,
    decision,
    risk_level: riskLevel,
    risk_score: score,
    reasons,
    rule_hits: hits,
  };

  const updated = await client.query(
    `UPDATE courier_payout_requests
     SET status = $1,
         failure_reason = CASE WHEN $1 = 'blocked' THEN $2 ELSE failure_reason END,
         risk_snapshot = risk_snapshot || $3::jsonb,
         reviewed_at = CASE WHEN $1 IN ('approved_auto', 'manual_review', 'risk_hold', 'blocked') THEN NOW() ELSE reviewed_at END,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [
      finalStatus,
      reasons[0] || 'Pencairan diblokir oleh risk engine.',
      JSON.stringify(riskSnapshot),
      payout.id,
    ],
  );

  if (finalStatus === 'blocked') {
    const reversalExists = await client.query(
      `SELECT 1
       FROM courier_earnings_ledger
       WHERE payout_request_id = $1
         AND transaction_type = 'payout_failed'
       LIMIT 1`,
      [payout.id],
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
         ) VALUES ($1, 'payout', 'credit', $2, 'available', 'payout_failed', $3, $4, $5)`,
        [
          payout.courier_id,
          payout.amount_idr,
          payout.id,
          'Pencairan diblokir risk engine, saldo dikembalikan',
          JSON.stringify(riskSnapshot),
        ],
      );
    }
  }

  await writePayoutAuditEvent(client, req, {
    courierId: payout.courier_id,
    payoutRequestId: payout.id,
    eventType: 'risk_decision_created',
    severity: decision === 'blocked' ? 'critical' : decision === 'manual_review' ? 'warning' : 'info',
    actorId: req?.user?.id || payout.courier_id,
    actorRole: req?.user?.role || 'courier',
    subjectType: 'courier_payout_request',
    subjectId: payout.id,
    oldStatus: payout.status,
    newStatus: finalStatus,
    metadata: riskSnapshot,
  });

  return {
    request: updated.rows[0],
    decision: decisionResult.rows[0],
  };
};
