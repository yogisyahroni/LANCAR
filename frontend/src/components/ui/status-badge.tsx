'use client';

import { cn } from '@/lib/utils';

type StatusType = 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  dot?: boolean;
  className?: string;
}

export default function StatusBadge({ status, label, dot = true, className }: StatusBadgeProps) {
  const styles = {
    success: 'bg-success/10 text-success border-success/20',
    warning: 'bg-warning/10 text-warning border-warning/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    info: 'bg-primary/10 text-primary border-primary/20',
    muted: 'bg-muted/10 text-muted-foreground border-muted/20',
  };

  const dotStyles = {
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-primary',
    muted: 'bg-muted',
  };

  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
      styles[status],
      className
    )}>
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full mr-1.5 animate-pulse', dotStyles[status])} />
      )}
      {label}
    </span>
  );
}
