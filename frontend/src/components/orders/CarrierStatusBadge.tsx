import { createElement } from 'react';
import { cn } from '@/lib/utils';
import { presentCarrierStatus } from '@/lib/carrierStatusPresentation';

type CarrierStatusBadgeProps = {
  status?: string | null;
  className?: string;
};

/** Carrier status always exposes a readable label and a supplemental icon. */
export function CarrierStatusBadge({ status, className }: CarrierStatusBadgeProps) {
  const presentation = presentCarrierStatus(status);

  return (
    <span
      aria-label={`Status carrier: ${presentation.label}`}
      data-status-badge="true"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
        presentation.className,
        className,
      )}
    >
      {createElement(presentation.icon, { className: 'h-3.5 w-3.5 shrink-0', 'aria-hidden': true })}
      {presentation.label}
    </span>
  );
}
