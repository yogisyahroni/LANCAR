import { createElement } from 'react'
import { cn } from '../lib/utils'
import { getOrderStatusPresentation } from '../lib/orderStatusPresentation'

type OrderStatusBadgeProps = {
  status?: unknown
  className?: string
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const presentation = getOrderStatusPresentation(status)
  return (
    <span
      aria-label={`Order status: ${presentation.label}`}
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-bold', presentation.className, className)}
    >
      {createElement(presentation.icon, { className: 'h-3.5 w-3.5 shrink-0', 'aria-hidden': true })}
      {presentation.label}
    </span>
  )
}
