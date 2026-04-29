'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glass?: boolean;
  animate?: boolean;
  delay?: number;
}

export default function Card({ 
  children, 
  className, 
  glass = false, 
  animate = true,
  delay = 0,
  ...props 
}: CardProps) {
  const content = (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface-raised p-6 transition-all duration-300',
        glass && 'glass',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );

  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: delay, ease: [0.23, 1, 0.32, 1] }}
      >
        {content}
      </motion.div>
    );
  }

  return content;
}

export function CardHeader({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={cn('mb-4 flex items-center justify-between', className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode, className?: string }) {
  return <h3 className={cn('text-lg font-semibold tracking-tight text-white', className)}>{children}</h3>;
}

export function CardDescription({ children, className }: { children: React.ReactNode, className?: string }) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>;
}

export function CardContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return <div className={className}>{children}</div>;
}
