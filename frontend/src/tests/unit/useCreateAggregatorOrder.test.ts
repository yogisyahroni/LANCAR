import { describe, expect, it, vi } from "vitest";
import {
  AGGREGATOR_SERVICE_CODE,
  buildAggregatorOrderPayload,
  requestAggregatorOrder,
  requestAggregatorPaymentSession,
} from "@/hooks/useCreateAggregatorOrder";

const draft = {
  provider: "jne",
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
  length_cm: 10,
  width_cm: 10,
  height_cm: 10,
  quantity: 1,
  item_description: "Dokumen kontrak",
  category: "Dokumen",
  dangerous_goods: false,
  insurance: false,
  delivery_notes: "Hubungi penerima sebelum antar",
  schedule_type: "now" as const,
  vehicle_type: "Motor" as const,
};

describe("aggregator create API contract", () => {
  it("builds a persisted-order payload from a server quote", () => {
    const payload = buildAggregatorOrderPayload(draft, {
      service: "regular",
      service_name: "Reguler",
      price: 32000,
      net_price: 28000,
      quote_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(payload.service_code).toBe(AGGREGATOR_SERVICE_CODE);
    expect(payload.pickup_location).toEqual(draft.pickup_location);
    expect(payload.dropoff_location).toEqual(draft.dropoff_location);
    expect(payload.logistics_tariff_idr).toBe(32000);
    expect(payload.logistics_net_cost_idr).toBe(28000);
    expect(payload.packages).toHaveLength(1);
    expect((payload.package_details as { size_tier: string }).size_tier).toBe("small");
  });

  it("fails closed when an unsupported COD option is requested", () => {
    expect(() => buildAggregatorOrderPayload({ ...draft, payment_type: "COD" }, {
      service: "regular",
      price: 32000,
      quote_id: "11111111-1111-4111-8111-111111111111",
    })).toThrow("COD aggregator belum tersedia");
  });

  it("fails closed when the selected tariff has no persisted quote id", () => {
    expect(() => buildAggregatorOrderPayload(draft, {
      service: "regular",
      price: 32000,
    })).toThrow("Quote tarif tidak tersedia");
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

    post.mockResolvedValueOnce({ data: { order: { id: "order-2" } } });
    await expect(requestAggregatorOrder(client, {}, "agg-key-3")).rejects.toThrow("mengonfirmasi order");
  });

  it("does not treat a payment response without a usable session as success", async () => {
    const post = vi.fn().mockResolvedValue({ data: { payment: { payment_status: "pending" } } });
    await expect(requestAggregatorPaymentSession({ post }, "order-1", "pay-key-1"))
      .rejects.toThrow("sesi pembayaran");

    const unsuccessful = vi.fn().mockResolvedValue({ data: { success: false, payment: { snap_token: "token" } } });
    await expect(requestAggregatorPaymentSession({ post: unsuccessful }, "order-1", "pay-key-2"))
      .rejects.toThrow("mengonfirmasi sesi pembayaran");
  });
});
