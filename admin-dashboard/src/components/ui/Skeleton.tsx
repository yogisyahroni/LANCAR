import { cn } from '../lib/utils'
import type { HTMLAttributes } from 'react'

type SkeletonProps = HTMLAttributes<HTMLDivElement>

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-xl bg-white/10', className)}
      {...props}
    />
  )
}
