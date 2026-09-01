import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-xl bg-muted", className)}
      {...props}
    />
  );
}

export function CustomerPageSkeleton() {
  return (
    <div className="space-y-6" aria-label="Memuat halaman">
      <div className="space-y-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-4 w-80 max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
    </div>
  );
}
