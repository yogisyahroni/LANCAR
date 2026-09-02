import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AsyncRecoveryState, NetworkStatusBanner } from "@/components/ui/AsyncRecoveryState";

describe("authenticated recovery surfaces", () => {
  it("exposes an actionable retry for an online load failure", () => {
    const onRetry = vi.fn();
    render(<AsyncRecoveryState title="Riwayat belum tersedia" message="Coba muat ulang dari server." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Riwayat belum tersedia");
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disables retry while offline and communicates the recovery condition", () => {
    const onRetry = vi.fn();
    render(<AsyncRecoveryState title="Detail belum tersedia" message="Koneksi diperlukan." onRetry={onRetry} offline />);

    const retry = screen.getByRole("button", { name: "Menunggu koneksi" });
    expect(retry).toBeDisabled();
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("announces reconnect state without fabricating loaded data", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(<NetworkStatusBanner />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Koneksi internet terputus.");
    expect(screen.queryByText(/order berhasil/i)).not.toBeInTheDocument();

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });
});
