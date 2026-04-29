'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function Switch({ 
  checked, 
  onChange, 
  disabled = false,
  size = 'md' 
}: SwitchProps) {
  const sizes = {
    sm: { width: 'w-8', height: 'h-4', circle: 'h-3 w-3', x: 16 },
    md: { width: 'w-11', height: 'h-6', circle: 'h-4 w-4', x: 20 },
    lg: { width: 'w-14', height: 'h-8', circle: 'h-6 w-6', x: 24 },
  };

  const currentSize = sizes[size];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
        currentSize.width,
        currentSize.height,
        checked ? 'bg-primary' : 'bg-muted/30',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <motion.span
        animate={{ x: checked ? currentSize.x : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn(
          'pointer-events-none inline-block rounded-full bg-white shadow ring-0 transition-all duration-200 mt-1',
          currentSize.circle
        )}
      />
    </button>
  );
}
