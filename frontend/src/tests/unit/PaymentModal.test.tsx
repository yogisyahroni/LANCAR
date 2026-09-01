import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentModal } from "@/components/orders/PaymentModal";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe("PaymentModal server-owned payment state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.snap = {
      pay: vi.fn((_token: string, callbacks: { onPending: () => void }) => callbacks.onPending()),
    };
  });

  it("shows pending with an explicit server-status retry after the gateway callback", async () => {
    render(
      <PaymentModal
        isOpen
        onClose={vi.fn()}
        orderId="order-1"
        snapToken="snap-token"
        snapJsUrl="https://example.test/snap.js"
        clientKey="client-key"
        amount={32000}
        onSuccess={vi.fn()}
      />,
    );

    const payButton = await screen.findByRole("button", { name: "Bayar dengan Midtrans" });
    fireEvent.click(payButton);

    expect(await screen.findByText("Pembayaran sedang pending. Status akan diperbarui oleh notifikasi Midtrans.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cek status pembayaran lagi" })).toBeInTheDocument();
  });

  it("only reports success after the server confirms paid", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true, payment_status: "paid" } });
    const onSuccess = vi.fn();

    render(
      <PaymentModal
        isOpen
        onClose={vi.fn()}
        orderId="order-2"
        snapToken="snap-token"
        snapJsUrl="https://example.test/snap.js"
        clientKey="client-key"
        amount={32000}
        onSuccess={onSuccess}
      />,
    );

    const payButton = await screen.findByRole("button", { name: "Bayar dengan Midtrans" });
    fireEvent.click(payButton);
    fireEvent.click(await screen.findByRole("button", { name: "Cek status pembayaran lagi" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/auth/web/orders/order-2/payment/check",
      undefined,
      expect.objectContaining({ headers: expect.objectContaining({ "X-Idempotency-Key": expect.any(String) }) }),
    ));
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
