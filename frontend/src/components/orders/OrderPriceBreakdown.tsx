import { CreditCard, Truck } from "lucide-react";
import { deliveryStateLabel, getPaymentStatePresentation } from "./orderPresentation";

type OrderPriceBreakdownProps = {
  totalPriceIdr?: number | null;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
  compact?: boolean;
};

export function OrderPriceBreakdown({ totalPriceIdr, paymentStatus, deliveryStatus, compact = false }: OrderPriceBreakdownProps) {
  const payment = getPaymentStatePresentation(paymentStatus);
  const hasTotal = typeof totalPriceIdr === "number" && Number.isFinite(totalPriceIdr);
  const formattedTotal = hasTotal
    ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalPriceIdr)
    : "-";

  return (
    <div className={`space-y-2 ${compact ? "text-xs" : "rounded-xl border border-white/10 bg-background/30 p-4"}`} aria-label="Status uang dan pengiriman">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CreditCard className="h-3.5 w-3.5" /> Pembayaran</span>
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${payment.className}`}>{payment.label}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Truck className="h-3.5 w-3.5" /> Pengiriman</span>
        <span className="font-semibold text-foreground">{deliveryStateLabel(deliveryStatus)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
        <span className="text-muted-foreground">Total</span>
        <span className="font-bold text-brand-emerald-300">{formattedTotal}</span>
      </div>
    </div>
  );
}
