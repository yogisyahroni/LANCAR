'use client';

import * as React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  asChild?: boolean;
  isLoading?: boolean;
  children?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, children, isLoading, ...props }, ref) => {
    const Component = asChild ? Slot : motion.button;

    const variants = {
      primary: 'bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20',
      secondary: 'bg-surface-raised text-white hover:bg-white/5 border border-border',
      outline: 'bg-transparent border border-border text-white hover:bg-white/5',
      ghost: 'bg-transparent text-muted-foreground hover:text-white hover:bg-white/5',
      danger: 'bg-danger text-white hover:bg-danger/90 shadow-lg shadow-danger/20',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
      icon: 'p-2',
    };

    const baseProps = asChild ? props : {
      whileHover: { scale: 1.01 },
      whileTap: { scale: 0.98 },
      ...props
    };

    return (
      <Component
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...baseProps}
      >
        {isLoading ? (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </Component>
    );
  }
);
Button.displayName = 'Button';

export { Button };
