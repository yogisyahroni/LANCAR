'use client';

import * as React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  asChild?: boolean;
  isLoading?: boolean;
  // Support for motion props if asChild is false
  whileHover?: HTMLMotionProps<'button'>['whileHover'];
  whileTap?: HTMLMotionProps<'button'>['whileTap'];
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, isLoading, children, whileHover, whileTap, ...props }, ref) => {
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

    const commonClasses = cn(
      'inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
      variants[variant],
      sizes[size],
      className
    );

    const content = (
      <>
        {isLoading ? (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </>
    );

    if (asChild) {
      return (
        <Slot ref={ref} className={commonClasses} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <motion.button
        ref={ref}
        className={commonClasses}
        whileHover={whileHover || { scale: 1.01 }}
        whileTap={whileTap || { scale: 0.98 }}
        {...(props as any)}
      >
        {content}
      </motion.button>
    );
  }
);
Button.displayName = 'Button';

export { Button };
