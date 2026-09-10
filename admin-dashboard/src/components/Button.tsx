import React from 'react'
import { motion } from 'framer-motion'
import { cn } from '../lib/utils'

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'style'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'glass'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    const variants = {
      primary: 'bg-primary text-on-primary hover:bg-primary-dark shadow-lg shadow-primary/20',
      secondary: 'bg-primary-light text-on-primary hover:bg-primary',
      ghost: 'bg-transparent hover:bg-surface-subtle text-foreground-secondary',
      outline: 'bg-transparent border border-border-strong hover:border-primary/50 text-foreground-secondary',
      glass: 'glass-button text-foreground',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-6 py-2.5 text-base',
      lg: 'px-8 py-4 text-lg font-semibold',
    }

    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'inline-flex items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
        ) : null}
        {children}
      </motion.button>
    )
  }
)

Button.displayName = 'Button'
