import type { AxiosRequestConfig } from "axios";

export type OrderTransactionClient = {
  post: (url: string, body?: unknown, config?: AxiosRequestConfig) => Promise<{ data?: unknown }>;
  get: (url: string, config?: AxiosRequestConfig) => Promise<{ data?: unknown }>;
};

type OrderResponse = {
  success?: unknown;
  order?: unknown;
  payment?: unknown;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? value as Record<string, unknown> : null;

export type PersistedCustomerOrder = {
  id: string;
  order_number?: string;
  status?: string;
  total_price_idr?: number;
  [key: string]: unknown;
};

export type CustomerPaymentSession = {
  payment_status?: string;
  order_status?: string;
  amount_idr?: number;
  snap_token?: string | null;
  redirect_url?: string | null;
  client_key?: string;
  snap_js_url?: string;
  [key: string]: unknown;
};

export function createIdempotencyKey(prefix = "web-order"): string {
  const webCrypto = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (typeof webCrypto?.randomUUID === "function") return webCrypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function requestPersistedCustomerOrder(
  client: Pick<OrderTransactionClient, "post">,
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<PersistedCustomerOrder> {
  const response = await client.post("/auth/web/orders", payload, {
    headers: { "X-Idempotency-Key": idempotencyKey },
  });
  const data = asRecord(response.data) as OrderResponse | null;
  const order = asRecord(data?.order);
  if (
    data?.success !== true ||
    !order ||
    typeof order.id !== "string" ||
    order.id.trim().length === 0
  ) {
    throw new Error("Server tidak mengembalikan referensi order yang tersimpan");
  }
  return order as PersistedCustomerOrder;
}

export async function requestCustomerPaymentSession(
  client: Pick<OrderTransactionClient, "post">,
  orderId: string,
  idempotencyKey: string,
): Promise<CustomerPaymentSession> {
  const response = await client.post(
    `/auth/web/orders/${orderId}/payment/session`,
    { payment_method: "midtrans" },
    { headers: { "X-Idempotency-Key": idempotencyKey } },
  );
  const data = asRecord(response.data) as OrderResponse | null;
  const payment = asRecord(data?.payment);
  if (data?.success !== true || !payment) {
    throw new Error("Server tidak mengembalikan sesi pembayaran");
  }

  const hasUsableSession = Boolean(payment.snap_token || payment.redirect_url);
  const isAlreadyFinal =
    payment.payment_status === "paid" ||
    (payment.order_status && payment.order_status !== "pending_payment");
  if (!hasUsableSession && !isAlreadyFinal) {
    throw new Error("Server tidak mengembalikan sesi pembayaran yang dapat digunakan");
  }
  return payment as CustomerPaymentSession;
}

export function isUnknownOutcomeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { response?: unknown; request?: unknown; code?: unknown };
  if (candidate.response) return false;
  return Boolean(
    candidate.request ||
      ["ECONNABORTED", "ETIMEDOUT", "ERR_NETWORK", "ERR_CONNECTION_RESET"].includes(String(candidate.code)),
  );
}

export function isRetryableTransactionError(error: unknown): boolean {
  if (isUnknownOutcomeError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { response?: { status?: unknown; data?: unknown } };
  const data = asRecord(candidate.response?.data);
  return candidate.response?.status === 409 && data?.code === "IDEMPOTENCY_REQUEST_IN_PROGRESS";
}
