import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertConcurrentCreateResults,
  assertKeyConflictResponse,
  assertPersistedDatabaseRow,
  assertQuoteContract,
  assertQuoteParity,
  assertRequoteResponse,
  assertReplayResponse,
  normalizeApiBase,
} from './core-part-a-contract.mjs';

const quote = {
  quote_id: 'quote-1',
  input_fingerprint: 'fingerprint-1',
  snapshot_hash: 'snapshot-1',
  expires_at: '2099-01-01T00:00:00.000Z',
  currency: 'IDR',
  total_price_idr: 25000,
  price_components: { total_price_idr: 25000 },
  service_code: 'tembus_instant',
  pricing_rule_version: 'pricing-2026-09-01',
  distance_km: 4.2,
  base_price_idr: 20000,
  volumetric_surcharge_idr: 0,
  insurance_premium_idr: 0,
  dynamic_price_idr: 0,
  platform_fee_idr: 5000,
  material_cost_idr: 0,
  toll_cost_idr: 0,
  eta_minutes: 30,
};

const result = (status, body, replayed = false) => ({
  status,
  body,
  headers: new Headers(replayed ? { 'X-Idempotency-Replayed': 'true' } : {}),
});

test('normalizes API roots without duplicating /api/v1', () => {
  assert.equal(normalizeApiBase('https://staging.example.test'), 'https://staging.example.test/api/v1');
  assert.equal(normalizeApiBase('https://staging.example.test/api/v1/'), 'https://staging.example.test/api/v1');
});

test('accepts the canonical quote and rejects expired or incomplete quotes', () => {
  assert.doesNotThrow(() => assertQuoteContract(quote));
  assert.throws(() => assertQuoteContract({ ...quote, expires_at: '2020-01-01T00:00:00.000Z' }));
  assert.throws(() => assertQuoteContract({ ...quote, snapshot_hash: '' }));
});

test('quote parity compares server money and identity fields across surfaces', () => {
  assert.doesNotThrow(() => assertQuoteParity(quote, { ...quote, quote_id: 'quote-2', snapshot_hash: 'snapshot-2' }));
  assert.throws(() => assertQuoteParity(quote, { ...quote, total_price_idr: 26000 }));
});

test('the ten-way matrix permits one winner and controlled idempotency conflicts only', () => {
  const responses = [result(201, { order: { id: 'order-1' } })];
  for (let index = 1; index < 10; index += 1) {
    responses.push(result(409, { code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }));
  }
  assert.deepEqual(assertConcurrentCreateResults(responses), {
    orderId: 'order-1',
    createdCount: 1,
    replayedCount: 0,
    conflictCount: 9,
  });
  const replayedResponses = [result(201, { order: { id: 'order-1' } })];
  replayedResponses[0].headers = new Headers({ 'X-Idempotency-Replayed': 'true' });
  replayedResponses.push(result(201, { order: { id: 'order-1' } }));
  for (let index = 2; index < 10; index += 1) {
    replayedResponses.push(result(409, { code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' }));
  }
  assert.deepEqual(assertConcurrentCreateResults(replayedResponses), {
    orderId: 'order-1',
    createdCount: 1,
    replayedCount: 1,
    conflictCount: 8,
  });
  assert.throws(() => assertConcurrentCreateResults([
    result(201, { order: { id: 'order-1' } }),
    result(201, { order: { id: 'order-2' } }),
    ...responses.slice(2),
  ]));
});

test('replay, different-payload conflict, and requote invalidation are strict', () => {
  assert.doesNotThrow(() => assertReplayResponse(result(201, { order: { id: 'order-1' } }, true), 'order-1'));
  assert.throws(() => assertReplayResponse(result(201, { order: { id: 'order-2' } }, true), 'order-1'));
  assert.doesNotThrow(() => assertKeyConflictResponse(result(409, { code: 'IDEMPOTENCY_KEY_CONFLICT' })));
  assert.doesNotThrow(() => assertRequoteResponse(result(409, {
    code: 'REQUOTE_REQUIRED',
    requires_requote: true,
    trusted_price_breakdown: { total_price_idr: 25000 },
  }), 'changed address'));
  assert.throws(() => assertRequoteResponse(result(400, { code: 'ERR_BAD_REQUEST' }), 'expired quote'));
});

test('database proof requires one order, one payment, one key, and the exact quote snapshot', () => {
  const row = {
    order_id: 'order-1',
    order_count: 1,
    payment_count: 1,
    idempotency_count: 1,
    quote_id: quote.quote_id,
    pricing_snapshot: { ...quote },
  };
  assert.doesNotThrow(() => assertPersistedDatabaseRow(row, quote, 'order-1'));
  assert.throws(() => assertPersistedDatabaseRow({ ...row, payment_count: 2 }, quote, 'order-1'));
  assert.throws(() => assertPersistedDatabaseRow({ ...row, pricing_snapshot: { ...quote, total_price_idr: 26000 } }, quote, 'order-1'));
});
