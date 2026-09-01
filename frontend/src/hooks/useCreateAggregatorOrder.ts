import type { AxiosRequestConfig } from "axios";

export { createIdempotencyKey } from "@/lib/orderTransaction";

export const AGGREGATOR_SERVICE_CODE = "tembus_aggregator";

export type Coordinate = { lat: number; lng: number };

export type AggregatorQuote = {
  service: string;
  price: number;
  net_price?: number;
  service_name?: string;
  etd?: string;
};

export type AggregatorOrderDraft = {
  provider: string;
  pickup_address: string;
  pickup_location: Coordinate;
  dropoff_address: string;
  dropoff_location: Coordinate;
  recipient_name: string;
  recipient_phone: string;
  destination_code: string;
  pickup_city: string;
  dropoff_city: string;
  payment_type: "COD" | "NON_COD";
  item_value: number;
  weight_kg: number;
  quantity: number;
  item_description: string;
  category?: string;
  dangerous_goods: boolean;
  delivery_notes?: string;
  schedule_type: "now" | "scheduled";
  scheduled_at?: string;
  vehicle_type: "Motor" | "Mobil" | "Truk";
};

export type AggregatorOrder = {
  id: string;
  order_number?: string;
  status?: string;
  total_price_idr?: number;
  [key: string]: unknown;
};

export type AggregatorPayment = {
  payment_status?: string;
  order_status?: string;
  amount_idr?: number;
  snap_token?: string | null;
  redirect_url?: string | null;
  client_key?: string;
  snap_js_url?: string;
  [key: string]: unknown;
};

export type AggregatorApiClient = {
  post: (url: string, body?: unknown, config?: AxiosRequestConfig) => Promise<{ data?: any }>;
};

function sizeTierForWeight(weightKg: number): "small" | "medium" | "large" {
  if (weightKg <= 3) return "small";
  if (weightKg <= 10) return "medium";
  return "large";
}

export function buildAggregatorOrderPayload(
  draft: AggregatorOrderDraft,
  quote: AggregatorQuote,
): Record<string, unknown> {
  const totalPrice = Number(quote.price);
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    throw new Error("Tarif pengiriman dari server tidak valid");
  }

  return {
    pickup_address: draft.pickup_address.trim(),
    pickup_location: draft.pickup_location,
    dropoff_address: draft.dropoff_address.trim(),
    dropoff_location: draft.dropoff_location,
    recipient_name: draft.recipient_name.trim(),
    recipient_phone: draft.recipient_phone.trim(),
    pickup_city: draft.pickup_city,
    dropoff_city: draft.dropoff_city,
    schedule_type: draft.schedule_type,
    scheduled_at: draft.scheduled_at || undefined,
    customer_notes: draft.delivery_notes?.trim() || undefined,
    has_insurance: false,
    item_value: draft.item_value,
    package_details: {
      item_description: draft.item_description.trim(),
      category: draft.category?.trim() || undefined,
      weight_kg: draft.weight_kg,
      quantity: draft.quantity,
      dangerous_goods: draft.dangerous_goods,
      vehicle_type: draft.vehicle_type,
      size_tier: sizeTierForWeight(draft.weight_kg),
    },
    packages: [
      {
        description: draft.item_description.trim(),
        category: draft.category?.trim() || undefined,
        weight_kg: draft.weight_kg,
        quantity: draft.quantity,
        declared_value_idr: draft.item_value,
      },
    ],
    service_code: AGGREGATOR_SERVICE_CODE,
    logistics_provider: draft.provider,
    logistics_service_type: quote.service,
    logistics_tariff_idr: totalPrice,
    ...(quote.net_price && quote.net_price > 0
      ? { logistics_net_cost_idr: Number(quote.net_price) }
      : {}),
    price_breakdown: {
      service_code: AGGREGATOR_SERVICE_CODE,
      total_price_idr: totalPrice,
      provider: draft.provider,
      service_type: quote.service,
      quote_etd: quote.etd || undefined,
    },
    payment_method: draft.payment_type === "COD" ? "cod" : "midtrans",
  };
}

export async function requestAggregatorOrder(
  client: AggregatorApiClient,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<AggregatorOrder> {
  const response = await client.post("/auth/web/orders", payload, {
    headers: { "X-Idempotency-Key": idempotencyKey },
  });
  const order = response.data?.order;
  if (!order?.id) {
    throw new Error("Server tidak mengembalikan referensi order yang tersimpan");
  }
  return order as AggregatorOrder;
}

export async function requestAggregatorPaymentSession(
  client: AggregatorApiClient,
  orderId: string,
  idempotencyKey: string,
): Promise<AggregatorPayment | null> {
  const response = await client.post(
    `/auth/web/orders/${orderId}/payment/session`,
    { payment_method: "midtrans" },
    { headers: { "X-Idempotency-Key": idempotencyKey } },
  );
  const payment = response.data?.payment || null;
  if (payment?.payment_status === "paid" || (payment?.order_status && payment.order_status !== "pending_payment")) {
    return payment;
  }
  if (!payment?.snap_token && !payment?.redirect_url) {
    throw new Error("Server tidak mengembalikan sesi pembayaran yang dapat digunakan");
  }
  return payment as AggregatorPayment;
}
