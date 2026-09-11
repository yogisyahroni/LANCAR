import { createElement } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { getOrderServicePresentation, type OrderPresentationInput } from "./orderPresentation";
import { getCustomerServiceIcon } from "./serviceIcon";

type OrderServiceBadgeProps = OrderPresentationInput & { compact?: boolean };

export function OrderServiceBadge({ compact = false, ...order }: OrderServiceBadgeProps) {
  const presentation = getOrderServicePresentation(order);
  const isAggregator = presentation.kind === "aggregator";
  const ServiceIcon = getCustomerServiceIcon(presentation.kind, presentation.label);

  return (
    <div
      className="space-y-1.5"
      aria-label={`Layanan ${presentation.label}`}
      data-service-badge="true"
      data-service-kind={presentation.kind}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${isAggregator ? "border-info bg-info-surface text-info" : "border-success bg-success-surface text-success"}`}>
          {createElement(ServiceIcon, { className: "h-3 w-3", "aria-hidden": true })}
          {presentation.label}
        </span>
        {!compact && <span className="text-xs text-foreground-secondary">{presentation.description}</span>}
      </div>
      {isAggregator && (
        <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
          <span className="rounded border border-success/20 bg-success/5 px-2 py-0.5 text-success">{presentation.firstMileLabel}</span>
          <ArrowRight className="h-3 w-3 text-foreground-muted" aria-hidden="true" />
          <span className="inline-flex items-center gap-1 rounded border border-info bg-info-surface px-2 py-0.5 text-info">
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
            {presentation.externalCarrierLabel}
          </span>
        </div>
      )}
    </div>
  );
}
