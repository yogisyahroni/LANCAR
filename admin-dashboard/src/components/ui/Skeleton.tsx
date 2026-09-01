import { cn } from '../../lib/utils'
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

export function AdminPageSkeleton() {
  return (
    <div role="status" aria-label="Memuat halaman" className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-[70vw]" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28" />)}
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  )
}
