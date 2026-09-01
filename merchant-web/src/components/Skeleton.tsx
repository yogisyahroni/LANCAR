import type { HTMLAttributes } from 'react'

type SkeletonProps = HTMLAttributes<HTMLDivElement>

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={`animate-pulse rounded-xl bg-zinc-200/80 ${className}`} {...props} />
}

/** Shared first-load placeholder for merchant portal pages. */
export function MerchantPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat halaman" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <div className="space-y-3 rounded-[1.75rem] bg-white p-6 shadow-sm">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
      </div>
    </div>
  )
}
