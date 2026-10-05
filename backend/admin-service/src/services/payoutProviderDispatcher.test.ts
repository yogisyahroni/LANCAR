import crypto from 'crypto';
import {
  applyProviderCallback,
  buildPayoutProviderPayload,
  dispatchApprovedPayouts,
  dispatchToProvider,
  providerIdempotencyKey,
  queryProviderStatus,
  resolvePayoutAccountNumber,
  sha256Hex,
  verifyProviderWebhookSignature,
} from './payoutProviderDispatcher';

describe('payoutProviderDispatcher', () => {
  it('builds sanitized provider payload without raw account number', () => {
    const payload = buildPayoutProviderPayload({
      id: 'payout-1',
      request_number: 'CPY-1',
      courier_id: 'courier-1',
      payout_account_id: 'account-1',
      amount_idr: 100000,
      net_amount_idr: 100000,
      destination_snapshot: {
        bank_code: 'BCA',
        account_name: 'Andri Pratama',
        account_number_last4: '1234',
        account_number_vault_ref: 'vault:account-1',
      },
    });

    expect(payload.destination).toEqual({
      bank_code: 'BCA',
      account_name: 'Andri Pratama',
      account_number_last4: '1234',
      account_number_vault_ref: 'vault:account-1',
    });
    expect(JSON.stringify(payload)).not.toContain('account_number":"');
  });

  it('generates stable hashes and idempotent stub references', async () => {
    const payload = buildPayoutProviderPayload({
      id: 'payout-1',
      request_number: 'CPY-1',
      courier_id: 'courier-1',
      payout_account_id: 'account-1',
      amount_idr: 50000,
      destination_snapshot: { bank_code: 'BNI', account_name: 'Courier', account_number_last4: '6789', account_number_vault_ref: 'vault:1' },
    });
    const key = providerIdempotencyKey('payout-1');

    expect(key).toBe('courier-payout:payout-1:v1');
    expect(sha256Hex({ b: 1, a: 2 })).toBe(sha256Hex({ a: 2, b: 1 }));

    const first = await dispatchToProvider('stub', payload, key);
    const second = await dispatchToProvider('stub', payload, key);

    expect(first.providerStatus).toBe('processing');
    expect(first.providerReference).toBe(second.providerReference);
  });

  it('dispatches through the configured Xendit gateway without exposing the account in the persisted response', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.BeneficiaryAccount).toBe('1234567890');
      return new Response(JSON.stringify({ status: 'PENDING', reference_id: 'xnd-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as any;
    try {
      const result = await dispatchToProvider('xendit', buildPayoutProviderPayload({
        id: 'payout-1', request_number: 'CPY-1', courier_id: 'courier-1', payout_account_id: 'account-1', amount_idr: 100000,
        destination_snapshot: { bank_code: 'BCA', account_name: 'Courier', account_number_last4: '7890', account_number_vault_ref: 'vault:1' },
      }), 'courier-payout:payout-1:v1', '1234567890');
      expect(result).toMatchObject({ providerName: 'xendit', providerReference: 'xnd-1', providerStatus: 'processing' });
      expect(JSON.stringify(result.response)).not.toContain('1234567890');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('maps provider status query to paid without issuing a second payout', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ status: 'COMPLETED', reference_id: 'xnd-1' }), { status: 200 })) as any;
    try {
      await expect(queryProviderStatus('xendit', 'xnd-1')).resolves.toMatchObject({ providerStatus: 'paid' });
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/internal/payment/disburse/xnd-1'), expect.any(Object));
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('resolves payout account only through the configured vault boundary', async () => {
    const originalFetch = global.fetch;
    const originalURL = process.env.PAYOUT_ACCOUNT_VAULT_URL;
    const originalToken = process.env.PAYOUT_ACCOUNT_VAULT_TOKEN;
    process.env.PAYOUT_ACCOUNT_VAULT_URL = 'https://vault.test';
    process.env.PAYOUT_ACCOUNT_VAULT_TOKEN = 'test-token';
    global.fetch = jest.fn(async (input, init) => {
      expect(input).toBe('https://vault.test/v1/payout-accounts/vault%3Aaccount-1');
      expect(init?.headers).toMatchObject({ authorization: 'Bearer test-token' });
      return new Response(JSON.stringify({ account_number: '1234567890' }), { status: 200 });
    }) as any;
    try {
      await expect(resolvePayoutAccountNumber('vault:account-1')).resolves.toBe('1234567890');
    } finally {
      global.fetch = originalFetch;
      if (originalURL === undefined) delete process.env.PAYOUT_ACCOUNT_VAULT_URL;
      else process.env.PAYOUT_ACCOUNT_VAULT_URL = originalURL;
      if (originalToken === undefined) delete process.env.PAYOUT_ACCOUNT_VAULT_TOKEN;
      else process.env.PAYOUT_ACCOUNT_VAULT_TOKEN = originalToken;
    }
  });

  it('verifies webhook signatures with timing safe hmac', () => {
    const raw = Buffer.from(JSON.stringify({ event_id: 'evt-1', status: 'paid' }));
    const secret = 'secret';
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('hex');

    expect(verifyProviderWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyProviderWebhookSignature(raw, `sha256=${signature}`, secret)).toBe(true);
    expect(verifyProviderWebhookSignature(raw, signature.slice(2), secret)).toBe(false);
    expect(verifyProviderWebhookSignature(raw, undefined, secret)).toBe(false);
  });

  it('reverses the courier ledger exactly once when a provider callback fails', async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT d.*, pr.status AS request_status')) {
          return {
            rows: [{
              id: 'dispatch-1',
              payout_request_id: 'payout-1',
              provider_name: 'xendit',
              provider_reference: 'xnd-1',
              request_status: 'processing',
              amount_idr: 100000,
              courier_id: 'courier-1',
            }],
          };
        }
        if (sql.includes('SELECT 1') && sql.includes("transaction_type = 'payout_failed'")) return { rows: [] };
        return { rows: [] };
      }),
    };

    await expect(applyProviderCallback(client as any, {
      providerName: 'xendit',
      providerReference: 'xnd-1',
      providerStatus: 'failed',
      response: { status: 'FAILED', reference_id: 'xnd-1' },
      failureReason: 'bank rejected',
    })).resolves.toMatchObject({ payoutRequestId: 'payout-1', status: 'failed' });

    expect(queries.some((sql) => sql.includes('INSERT INTO courier_earnings_ledger'))).toBe(true);
    expect(queries.filter((sql) => sql.includes("transaction_type = 'payout_failed'"))).toHaveLength(1);
  });

  it('does not dispatch when emergency kill switch is active', async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        queries.push(sql);
        if (sql.includes('SELECT value FROM system_configs')) {
          const values: Record<string, string> = {
            payout_dispatcher_enabled: 'true',
            payout_emergency_kill_switch_enabled: 'true',
            payout_dispatcher_batch_size: '25',
            payout_provider_daily_limit_idr: '50000000',
            payout_provider_name: '"stub"',
          };
          return { rows: [{ value: values[params?.[0]] }] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    const result = await dispatchApprovedPayouts({ connect: async () => client } as any);

    expect(result.processed).toBe(0);
    expect(result.skipped[0].reason).toBe('emergency_kill_switch_enabled');
    expect(queries.some((sql) => sql.includes('FOR UPDATE SKIP LOCKED'))).toBe(false);
  });

  it('skips dispatch that would exceed provider daily limit', async () => {
    const payout = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      courier_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payout_account_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      request_number: 'CPY-1',
      status: 'approved_auto',
      amount_idr: 60000,
      net_amount_idr: 60000,
      destination_snapshot: {
        bank_code: 'BCA',
        account_name: 'Courier',
        account_number_last4: '1234',
        account_number_vault_ref: 'vault:1',
      },
    };
    const client = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        if (sql.includes('SELECT value FROM system_configs')) {
          const values: Record<string, string> = {
            payout_dispatcher_enabled: 'true',
            payout_emergency_kill_switch_enabled: 'false',
            payout_dispatcher_batch_size: '25',
            payout_provider_daily_limit_idr: '100000',
            payout_provider_name: '"stub"',
          };
          return { rows: [{ value: values[params?.[0]] }] };
        }
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('AS amount_idr') && sql.includes('courier_payout_dispatches')) {
          return { rows: [{ amount_idr: 50000 }] };
        }
        if (sql.includes('FOR UPDATE SKIP LOCKED')) {
          return { rows: [payout] };
        }
        if (sql.includes('INSERT INTO courier_payout_security_events')) return { rows: [] };
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    const result = await dispatchApprovedPayouts({ connect: async () => client } as any);

    expect(result.processed).toBe(0);
    expect(result.skipped).toEqual([{ payoutRequestId: payout.id, reason: 'provider_daily_limit_exceeded' }]);
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO courier_payout_dispatches'), expect.any(Array));
  });
});
