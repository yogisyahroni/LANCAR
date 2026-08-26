import { cn } from '../../lib/utils'
import type { HTMLAttributes } from 'react'

type VisuallyHiddenProps = HTMLAttributes<HTMLSpanElement>

export function VisuallyHidden({ className, children, ...props }: VisuallyHiddenProps) {
  return (
    <span className={cn('sr-only', className)} {...props}>
      {children}
    </span>
  )
}
