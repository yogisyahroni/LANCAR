import { evaluateCourierPayoutRisk } from './payoutRiskEngine';

const payoutRow = (overrides: Record<string, any> = {}) => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  courier_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  payout_account_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  amount_idr: 50000,
  status: 'risk_screening',
  risk_snapshot: { balance_before_idr: 150000 },
  account_status: 'verified',
  account_verified_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  account_created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
  account_number_fingerprint: 'fingerprint-1',
  courier_status: 'active',
  avg_partner_rating: 5,
  complaint_count: 0,
  complaint_ratio_pct: 0,
  ...overrides,
});

const makeClient = (payout: Record<string, any>, options: Record<string, any> = {}) => {
  const updates: any[] = [];
  const client = {
    updates,
    query: jest.fn(async (sql: string, params?: any[]) => {
      if (sql.includes('FROM courier_payout_requests pr') && sql.includes('FOR UPDATE')) {
        return { rows: [payout] };
      }
      if (sql.includes('FROM system_configs')) {
        const key = params?.[0];
        const values: Record<string, string> = {
          payout_auto_approval_enabled: String(options.autoEnabled ?? true),
          payout_emergency_kill_switch_enabled: String(options.killSwitch ?? false),
          payout_max_auto_amount_idr: String(options.maxAutoAmount ?? 500000),
          payout_account_cooldown_hours: String(options.cooldownHours ?? 24),
          payout_hourly_request_limit: String(options.hourlyLimit ?? 3),
          payout_bank_hourly_request_limit: String(options.bankHourlyLimit ?? 5),
          payout_device_hourly_request_limit: String(options.deviceHourlyLimit ?? 4),
          payout_ip_hourly_request_limit: String(options.ipHourlyLimit ?? 8),
          payout_bank_daily_auto_limit_idr: String(options.bankDailyAutoLimit ?? 1500000),
        };
        return { rows: [{ value: values[key] }] };
      }
      if (sql.includes('AS available_balance_idr')) {
        return { rows: [{ available_balance_idr: options.availableBalance ?? 100000 }] };
      }
      if (sql.includes('AS open_dispute_count')) {
        return { rows: [{ open_dispute_count: options.openDisputes ?? 0 }] };
      }
      if (sql.includes('FROM courier_payout_requests') && sql.includes('JOIN courier_payout_accounts') && sql.includes('INTERVAL \'1 hour\'')) {
        return { rows: [{ request_count: options.bankHourlyRequests ?? 1 }] };
      }
      if (sql.includes('AS amount_idr')) {
        return { rows: [{ amount_idr: options.bankDailyAmount ?? 50000 }] };
      }
      if (sql.includes('FROM courier_payout_risk_decisions') && sql.includes('device_id')) {
        return { rows: [{ request_count: options.deviceHourlyRequests ?? 0 }] };
      }
      if (sql.includes('FROM courier_payout_risk_decisions') && sql.includes('ip_address')) {
        return { rows: [{ request_count: options.ipHourlyRequests ?? 0 }] };
      }
      if (sql.includes('AS request_count')) {
        return { rows: [{ request_count: options.hourlyRequests ?? 1 }] };
      }
      if (sql.includes('AS seen_count')) {
        return { rows: [{ seen_count: options.deviceSeen ?? 1 }] };
      }
      if (sql.includes('AS courier_count')) {
        return { rows: [{ courier_count: options.accountReuse ?? 1 }] };
      }
      if (sql.includes('INSERT INTO courier_payout_risk_decisions')) {
        return {
          rows: [{
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            decision: params?.[3],
            risk_level: params?.[4],
            risk_score: params?.[5],
            reasons: params?.[6],
          }],
        };
      }
      if (sql.includes('UPDATE courier_payout_requests')) {
        updates.push(params);
        return { rows: [{ ...payout, status: params?.[0], risk_snapshot: params?.[2] }] };
      }
      if (sql.includes('FROM courier_earnings_ledger') && sql.includes('transaction_type')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO courier_earnings_ledger')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO courier_payout_security_events')) {
        return { rows: [] };
      }
      return { rows: [] };
    }),
  };
  return client;
};

describe('payout risk engine', () => {
  it('auto-approves low-risk payout requests', async () => {
    const client = makeClient(payoutRow());

    const result = await evaluateCourierPayoutRisk(client, {
      headers: { 'x-device-id': 'known-device', 'user-agent': 'jest' },
      socket: { remoteAddress: '127.0.0.1' },
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'courier', full_name: 'Courier', totp_verified: true },
    } as any, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(result.decision.decision).toBe('auto_approved');
    expect(result.request.status).toBe('approved_auto');
  });

  it('routes new device requests to manual review', async () => {
    const client = makeClient(payoutRow(), { deviceSeen: 0 });

    const result = await evaluateCourierPayoutRisk(client, {
      headers: { 'x-device-id': 'new-device', 'user-agent': 'jest' },
      socket: { remoteAddress: '127.0.0.1' },
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'courier', full_name: 'Courier', totp_verified: true },
    } as any, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(result.decision.decision).toBe('manual_review');
    expect(result.request.status).toBe('manual_review');
  });

  it('blocks and reverses payout when ledger balance is negative', async () => {
    const client = makeClient(payoutRow(), { availableBalance: -1000 });

    const result = await evaluateCourierPayoutRisk(client, {
      headers: { 'x-device-id': 'known-device', 'user-agent': 'jest' },
      socket: { remoteAddress: '127.0.0.1' },
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'courier', full_name: 'Courier', totp_verified: true },
    } as any, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(result.decision.decision).toBe('blocked');
    expect(result.request.status).toBe('blocked');
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO courier_earnings_ledger'), expect.any(Array));
  });

  it('routes requests to manual review when emergency kill switch is active', async () => {
    const client = makeClient(payoutRow(), { killSwitch: true });

    const result = await evaluateCourierPayoutRisk(client, {
      headers: { 'x-device-id': 'known-device', 'user-agent': 'jest' },
      socket: { remoteAddress: '127.0.0.1' },
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'courier', full_name: 'Courier', totp_verified: true },
    } as any, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(result.decision.decision).toBe('manual_review');
    expect(result.request.status).toBe('risk_hold');
    expect(result.decision.reasons).toContain('Emergency kill switch aktif. Pengajuan masuk review manual.');
  });

  it('blocks abnormal device velocity and reviews bank daily limit', async () => {
    const client = makeClient(payoutRow(), {
      bankDailyAmount: 1600000,
      bankDailyAutoLimit: 1500000,
      deviceHourlyRequests: 9,
      deviceHourlyLimit: 4,
    });

    const result = await evaluateCourierPayoutRisk(client, {
      headers: { 'x-device-id': 'hot-device', 'user-agent': 'jest' },
      socket: { remoteAddress: '127.0.0.1' },
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'courier', full_name: 'Courier', totp_verified: true },
    } as any, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

    expect(result.decision.decision).toBe('blocked');
    expect(result.decision.reasons).toContain('Total pencairan harian rekening melewati limit auto payout.');
    expect(result.decision.reasons).toContain('Frekuensi pencairan dari perangkat ini abnormal.');
  });
});
