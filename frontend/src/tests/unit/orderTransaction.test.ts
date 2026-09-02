import { describe, expect, it, vi } from "vitest";
import {
  isRetryableTransactionError,
  isUnknownOutcomeError,
  requestCustomerPaymentSession,
  requestPersistedCustomerOrder,
} from "@/lib/orderTransaction";
import { resolveBulkJobRecovery } from "@/lib/bulkJobRecovery";

describe("server-backed customer order transactions", () => {
  it("requires a persisted order id and reuses the supplied idempotency key", async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true, order: { id: "order-1", status: "pending_payment" } } });
    const order = await requestPersistedCustomerOrder({ post }, { service_code: "tembus_instant" }, "order-key-1");

    expect(order.id).toBe("order-1");
    expect(post).toHaveBeenCalledWith(
      "/auth/web/orders",
      { service_code: "tembus_instant" },
      { headers: { "X-Idempotency-Key": "order-key-1" } },
    );
  });

  it("rejects optimistic order success without a server resource", async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true, order: { status: "pending_payment" } } });
    await expect(requestPersistedCustomerOrder({ post }, {}, "order-key-2")).rejects.toThrow("referensi order");
  });

  it("accepts a usable payment session and keeps payment idempotent", async () => {
    const post = vi.fn().mockResolvedValue({ data: { success: true, payment: { payment_status: "pending", snap_token: "snap-token" } } });
    const payment = await requestCustomerPaymentSession({ post }, "order-1", "payment-key-1");

    expect(payment.snap_token).toBe("snap-token");
    expect(post).toHaveBeenCalledWith(
      "/auth/web/orders/order-1/payment/session",
      { payment_method: "midtrans" },
      { headers: { "X-Idempotency-Key": "payment-key-1" } },
    );
  });

  it("replays a timed-out create with the same key and accepts the persisted order", async () => {
    const timeout = { code: "ERR_NETWORK", request: {} };
    const post = vi.fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({ data: { success: true, order: { id: "order-replayed", status: "pending_payment" } } });

    await expect(requestPersistedCustomerOrder({ post }, { service_code: "tembus_instant" }, "order-retry-1"))
      .rejects.toMatchObject(timeout);
    const order = await requestPersistedCustomerOrder({ post }, { service_code: "tembus_instant" }, "order-retry-1");

    expect(order.id).toBe("order-replayed");
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/auth/web/orders",
      { service_code: "tembus_instant" },
      { headers: { "X-Idempotency-Key": "order-retry-1" } },
    );
  });

  it("replays a timed-out payment-session request with the same key", async () => {
    const timeout = { code: "ETIMEDOUT", request: {} };
    const post = vi.fn()
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({ data: { success: true, payment: { payment_status: "pending", snap_token: "snap-replayed" } } });

    await expect(requestCustomerPaymentSession({ post }, "order-1", "payment-retry-1"))
      .rejects.toMatchObject(timeout);
    const payment = await requestCustomerPaymentSession({ post }, "order-1", "payment-retry-1");

    expect(payment.snap_token).toBe("snap-replayed");
    expect(post).toHaveBeenNthCalledWith(
      2,
      "/auth/web/orders/order-1/payment/session",
      { payment_method: "midtrans" },
      { headers: { "X-Idempotency-Key": "payment-retry-1" } },
    );
  });

  it("classifies transport failures as unknown outcome, but not HTTP failures", () => {
    expect(isUnknownOutcomeError({ code: "ERR_NETWORK", request: {} })).toBe(true);
    expect(isUnknownOutcomeError({ code: "ECONNABORTED", request: {} })).toBe(true);
    expect(isUnknownOutcomeError({ response: { status: 500 }, code: "ERR_BAD_RESPONSE" })).toBe(false);
    expect(isRetryableTransactionError({ response: { status: 409, data: { code: "IDEMPOTENCY_REQUEST_IN_PROGRESS" } } })).toBe(true);
    expect(isRetryableTransactionError({ response: { status: 409, data: { code: "IDEMPOTENCY_KEY_CONFLICT" } } })).toBe(false);
  });

  it("chooses a safe refresh recovery action for every bulk job phase", () => {
    expect(resolveBulkJobRecovery({ status: "processing_orders" })).toEqual({ kind: "resume_polling" });
    expect(resolveBulkJobRecovery({ status: "completed", rows: [] })).toEqual({ kind: "review" });
    expect(resolveBulkJobRecovery({ status: "processed" })).toEqual({ kind: "redirect_orders" });
    expect(resolveBulkJobRecovery({ status: "failed" })).toEqual({ kind: "clear_pending" });
  });
});
