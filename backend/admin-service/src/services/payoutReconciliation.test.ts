import { buildPayoutReconciliationItems } from './payoutReconciliation';

const makeClient = (overrides: Record<string, any> = {}) => ({
  query: jest.fn(async (sql: string, params?: any[]) => {
    if (sql.includes('FROM system_configs')) {
      const values: Record<string, string> = {
        payout_provider_latency_alert_minutes: String(overrides.latencyMinutes ?? 30),
        payout_pending_too_long_minutes: String(overrides.pendingMinutes ?? 60),
        payout_webhook_missing_minutes: String(overrides.webhookMinutes ?? 20),
      };
      return { rows: [{ value: values[params?.[0]] }] };
    }
    if (sql.includes('HAVING COALESCE') && sql.includes("pr.status NOT IN")) {
      return { rows: overrides.ledgerMismatch || [] };
    }
    if (sql.includes('d.provider_status =') && sql.includes('request_status')) {
      return { rows: overrides.providerMismatch || [] };
    }
    if (sql.includes("WHERE pr.status = 'paid'")) {
      return { rows: overrides.paidLedgerMismatch || [] };
    }
    if (sql.includes("d.provider_status = 'processing'") && sql.includes('age_minutes')) {
      return { rows: overrides.providerLatency || [] };
    }
    if (sql.includes("status IN ('requested'") && sql.includes('age_minutes')) {
      return { rows: overrides.pendingTooLong || [] };
    }
    if (sql.includes('LEFT JOIN courier_payout_provider_webhook_events')) {
      return { rows: overrides.webhookMissing || [] };
    }
    return { rows: [] };
  }),
});

describe('payout reconciliation', () => {
  it('builds mismatch and alert items across payout checks', async () => {
    const client = makeClient({
      ledgerMismatch: [{
        payout_request_id: 'payout-1',
        courier_id: 'courier-1',
        amount_idr: 100000,
        ledger_debit_idr: 90000,
      }],
      providerMismatch: [{
        payout_request_id: 'payout-2',
        courier_id: 'courier-2',
        request_status: 'processing',
        provider_status: 'paid',
        provider_reference: 'REF-1',
      }],
      providerLatency: [{
        payout_request_id: 'payout-3',
        courier_id: 'courier-3',
        provider_reference: 'REF-2',
        age_minutes: 45,
      }],
      webhookMissing: [{
        payout_request_id: 'payout-4',
        courier_id: 'courier-4',
        provider_name: 'stub',
        provider_reference: 'REF-3',
      }],
    });

    const items = await buildPayoutReconciliationItems(client as any);

    expect(items.map((item) => item.check_type)).toEqual([
      'ledger_vs_request',
      'request_vs_provider',
      'provider_latency_high',
      'webhook_missing',
    ]);
    expect(items[0].severity).toBe('critical');
    expect(items[2].severity).toBe('warning');
  });
});
