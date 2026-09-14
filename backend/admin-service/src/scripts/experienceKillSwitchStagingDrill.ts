import dotenv from 'dotenv';
import path from 'path';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const requireConfirmation = process.env.SAFETY_STAGING_DRILL_CONFIRM === 'true';
const databaseUrl = process.env.SAFETY_STAGING_DATABASE_URL || process.env.DATABASE_URL;
const apiBaseUrl = (process.env.SAFETY_STAGING_API_BASE_URL || 'https://api.bawain.my.id').replace(/\/$/, '');
const customerEmail = process.env.SAFETY_STAGING_CUSTOMER_EMAIL || 'customer@tembus.id';

if (!requireConfirmation) {
  throw new Error('Set SAFETY_STAGING_DRILL_CONFIRM=true for a staging-only control-plane drill');
}
if (!databaseUrl) {
  throw new Error('SAFETY_STAGING_DATABASE_URL or DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl, max: 2 });
const drillKey = `experience.new_order_gate.tembus_instant.drill.${Date.now().toString(36)}`;

const run = async (): Promise<void> => {
  const sessionResult = await pool.query(
    `SELECT s.session_token
       FROM web_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE u.email = $1
        AND u.deleted_at IS NULL
        AND s.expires_at > NOW()
      ORDER BY s.expires_at DESC
      LIMIT 1`,
    [customerEmail],
  );
  const sessionToken = String(sessionResult.rows[0]?.session_token || '').trim();
  if (!sessionToken) throw new Error('No active staging customer web session found');

  const config = {
    control_plane: 'experience',
    kill_switch_type: 'new_order_gate',
    service_code: 'tembus_instant',
    market_codes: [],
    city_codes: [],
    zone_codes: [],
    fallback_behavior: 'reject_new_orders',
    preserve_active_orders: true,
    starts_at: new Date().toISOString(),
    last_reason: 'staging controlled outage drill',
    rollback_plan: 'delete temporary drill control after request verification',
  };

  try {
    await pool.query(
      `INSERT INTO feature_flags
        (key, name, description, category, is_enabled, config, require_checklist, evaluation_revision, updated_at)
       VALUES ($1, $2, $3, 'experience_kill_switch', TRUE, $4::jsonb, FALSE, 1, NOW())`,
      [drillKey, 'Staging new order gate drill', 'Temporary controlled outage drill', JSON.stringify(config)],
    );

    const response = await fetch(`${apiBaseUrl}/api/v1/customer/orders`, {
      method: 'POST',
      headers: {
        Cookie: `customer_session=${sessionToken}`,
        Origin: 'https://app.bawain.my.id',
        Referer: 'https://app.bawain.my.id/orders/new',
        'X-Portal': 'customer',
        'Idempotency-Key': `safety-gate-drill-${Date.now().toString(36)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'TEMBUS-staging-drill/1.0',
      },
      body: JSON.stringify({ service_code: 'tembus_instant' }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(`unexpected drill response content type status=${response.status} content_type=${contentType || 'none'}`);
    }
    const body = await response.json() as Record<string, unknown>;
    const code = String(body.code || '');
    const preserved = body.active_orders_preserved === true;
    if (response.status !== 503 || code !== 'NEW_ORDER_GATE_ACTIVE' || !preserved) {
      throw new Error(`unexpected drill response status=${response.status} code=${code || 'none'} preserved=${preserved}`);
    }

    console.log(`api_base_url ${apiBaseUrl}`);
    console.log(`new_order_gate_http ${response.status}`);
    console.log(`new_order_gate_code ${code}`);
    console.log(`active_orders_preserved ${preserved}`);
  } finally {
    await pool.query('DELETE FROM feature_flags WHERE key = $1', [drillKey]);
  }

  const remaining = await pool.query('SELECT COUNT(*)::int AS count FROM feature_flags WHERE key = $1', [drillKey]);
  console.log(`temporary_gate_rows_after_cleanup ${Number(remaining.rows[0]?.count || 0)}`);
  if (Number(remaining.rows[0]?.count || 0) !== 0) throw new Error('temporary gate cleanup failed');
};

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'staging kill-switch drill failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());
