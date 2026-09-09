import { CreditCard, Truck } from "lucide-react";
import { deliveryStateKey, deliveryStateLabel, getPaymentStatePresentation } from "./orderPresentation";
import { useI18n } from '@/components/i18n/I18nProvider';
import { formatCurrency } from '@/i18n/format';

type OrderPriceBreakdownProps = {
  totalPriceIdr?: number | null;
  paymentStatus?: string | null;
  deliveryStatus?: string | null;
  compact?: boolean;
};

export function OrderPriceBreakdown({ totalPriceIdr, paymentStatus, deliveryStatus, compact = false }: OrderPriceBreakdownProps) {
  const { locale, t } = useI18n();
  const payment = getPaymentStatePresentation(paymentStatus);
  const hasTotal = typeof totalPriceIdr === "number" && Number.isFinite(totalPriceIdr);
  const formattedTotal = hasTotal
    ? formatCurrency(totalPriceIdr, 'IDR', locale)
    : "-";
  const deliveryKey = deliveryStateKey(deliveryStatus);

  return (
    <div className={`space-y-2 ${compact ? "text-xs" : "rounded-xl border border-white/10 bg-background/30 p-4"}`} aria-label={t('order.moneyStatus')}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><CreditCard className="h-3.5 w-3.5" aria-hidden="true" /> {t('order.payment')}</span>
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${payment.className}`}>{t(payment.labelKey)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Truck className="h-3.5 w-3.5" aria-hidden="true" /> {t('order.delivery')}</span>
        <span className="font-semibold text-foreground">{deliveryKey ? t(deliveryKey) : deliveryStateLabel(deliveryStatus)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
        <span className="text-muted-foreground">{t('order.total')}</span>
        <span className="font-bold text-brand-emerald-300">{formattedTotal}</span>
      </div>
    </div>
  );
}
