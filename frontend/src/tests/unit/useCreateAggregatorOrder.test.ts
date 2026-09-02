import { describe, expect, it, vi } from "vitest";
import {
  AGGREGATOR_SERVICE_CODE,
  buildAggregatorOrderPayload,
  createPendingAggregatorTransaction,
  markAggregatorAwaitingPayment,
  markAggregatorPaymentSessionRequested,
  parsePendingAggregatorTransaction,
  requestAggregatorOrder,
  requestAggregatorPaymentSession,
} from "@/hooks/useCreateAggregatorOrder";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";

const draft = {
  provider: "jne",
  origin_code: "JKT",
  pickup_address: "Jl. Pickup No. 1",
  pickup_location: { lat: -6.2, lng: 106.8 },
  dropoff_address: "Jl. Tujuan No. 2",
  dropoff_location: { lat: -6.91, lng: 107.61 },
  recipient_name: "Penerima Nyata",
  recipient_phone: "081234567890",
  destination_code: "BDO",
  pickup_city: "Jakarta",
  dropoff_city: "Bandung",
  payment_type: "NON_COD" as const,
  item_value: 125000,
  weight_kg: 1.2,
  quantity: 1,
  item_description: "Dokumen kontrak",
  category: "Dokumen",
  dangerous_goods: false,
  delivery_notes: "Hubungi penerima sebelum antar",
  schedule_type: "now" as const,
  vehicle_type: "Motor" as const,
};

describe("aggregator create API contract", () => {
  it("builds a persisted-order payload bound to a server quote", () => {
    const payload = buildAggregatorOrderPayload(draft, {
      quote_id: QUOTE_ID,
      service: "regular",
      service_name: "Reguler",
      price: 32000,
      net_price: 28000,
      expires_at: "2099-01-01T00:00:00.000Z",
      rule_version: "agg-2026-v1",
    });

    expect(payload.service_code).toBe(AGGREGATOR_SERVICE_CODE);
    expect(payload.pickup_location).toEqual(draft.pickup_location);
    expect(payload.dropoff_location).toEqual(draft.dropoff_location);
    expect(payload.aggregator_quote_id).toBe(QUOTE_ID);
    expect(payload.quote_id).toBe(QUOTE_ID);
    expect(payload.origin_code).toBe("JKT");
    expect(payload.logistics_tariff_idr).toBe(32000);
    expect(payload.logistics_net_cost_idr).toBe(28000);
    expect(payload.packages).toHaveLength(1);
    expect((payload.package_details as { size_tier: string }).size_tier).toBe("small");
  });

  it("refuses to build an aggregator order without an authoritative quote id", () => {
    expect(() => buildAggregatorOrderPayload(draft, {
      quote_id: "",
      service: "regular",
      price: 32000,
    })).toThrow("referensi server");
  });

  it("sends a stable idempotency key and refuses a response without an order id", async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true, order: { id: "order-1", status: "pending_payment" } } });
    const client = { post };

    await requestAggregatorOrder(client, { service_code: AGGREGATOR_SERVICE_CODE }, "agg-key-1");
    expect(post).toHaveBeenCalledWith(
      "/auth/web/orders",
      { service_code: AGGREGATOR_SERVICE_CODE },
      { headers: { "X-Idempotency-Key": "agg-key-1" } },
    );

    post.mockResolvedValueOnce({ data: { success: true } });
    await expect(requestAggregatorOrder(client, {}, "agg-key-2")).rejects.toThrow("referensi order");
  });

  it("does not treat a payment response without a usable session as success", async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true, payment: { payment_status: "pending" } } });
    await expect(requestAggregatorPaymentSession({ post }, "order-1", "pay-key-1"))
      .rejects.toThrow("sesi pembayaran");
  });

  it("rehydrates a pending transaction and preserves the payment idempotency key", () => {
    const created = createPendingAggregatorTransaction("order-1", "create-key-1", 1_000);
    const requested = markAggregatorPaymentSessionRequested(created, "payment-key-1");
    const awaiting = markAggregatorAwaitingPayment(requested);

    expect(parsePendingAggregatorTransaction(JSON.stringify(awaiting), 2_000)).toEqual({
      order_id: "order-1",
      create_idempotency_key: "create-key-1",
      payment_idempotency_key: "payment-key-1",
      created_at: 1_000,
      stage: "awaiting_payment",
    });
  });

  it("rejects malformed and expired pending transactions instead of retrying a new order", () => {
    expect(parsePendingAggregatorTransaction("not-json", 2_000)).toBeNull();
    expect(parsePendingAggregatorTransaction(JSON.stringify({
      order_id: "order-1",
      created_at: 0,
    }), 30 * 60 * 1000 + 1)).toBeNull();
    expect(parsePendingAggregatorTransaction(JSON.stringify({
      order_id: "order-1",
      created_at: 2_001,
    }), 2_000)).toBeNull();
  });
});
