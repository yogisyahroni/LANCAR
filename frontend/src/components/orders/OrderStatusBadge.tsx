import { createElement } from "react";
import { getOrderStatusPresentation } from "./orderPresentation";
import { cn } from "@/lib/utils";

type OrderStatusBadgeProps = {
  status?: string | null;
  className?: string;
  label?: string;
};

/** Status always carries a readable label and icon; color is supplemental only. */
export function OrderStatusBadge({ status, className, label }: OrderStatusBadgeProps) {
  const presentation = getOrderStatusPresentation(status);
  const visibleLabel = label || presentation.label;

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", presentation.className, className)}
      aria-label={`Status order: ${visibleLabel}`}
      data-status-badge="true"
    >
      {createElement(presentation.icon, { className: "h-3.5 w-3.5 shrink-0", "aria-hidden": true })}
      {visibleLabel}
    </span>
  );
}
