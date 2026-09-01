import { ArrowRight, Bike, Boxes, ExternalLink } from "lucide-react";
import { getOrderServicePresentation, type OrderPresentationInput } from "./orderPresentation";

type OrderServiceBadgeProps = OrderPresentationInput & { compact?: boolean };

export function OrderServiceBadge({ compact = false, ...order }: OrderServiceBadgeProps) {
  const presentation = getOrderServicePresentation(order);
  const isAggregator = presentation.kind === "aggregator";

  return (
    <div className="space-y-1.5" aria-label={`Layanan ${presentation.label}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${isAggregator ? "border-violet-400/30 bg-violet-400/10 text-violet-200" : "border-brand-emerald-400/30 bg-brand-emerald-400/10 text-brand-emerald-200"}`}>
          {isAggregator ? <Boxes className="h-3 w-3" /> : <Bike className="h-3 w-3" />}
          {presentation.label}
        </span>
        {!compact && <span className="text-xs text-muted-foreground">{presentation.description}</span>}
      </div>
      {isAggregator && (
        <div className="flex flex-wrap items-center gap-1 text-[10px] font-semibold">
          <span className="rounded border border-brand-emerald-400/20 bg-brand-emerald-400/5 px-2 py-0.5 text-brand-emerald-200">{presentation.firstMileLabel}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span className="inline-flex items-center gap-1 rounded border border-violet-400/20 bg-violet-400/5 px-2 py-0.5 text-violet-200">
            <ExternalLink className="h-3 w-3" />
            {presentation.externalCarrierLabel}
          </span>
        </div>
      )}
    </div>
  );
}
