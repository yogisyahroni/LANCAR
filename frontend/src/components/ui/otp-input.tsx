'use client';

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export default function OTPInput({ 
  value, 
  onChange, 
  length = 6, 
  disabled = false 
}: OTPInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Focus first input on mount if not disabled
    if (!disabled && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [disabled]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const val = e.target.value;
    if (isNaN(Number(val))) return;

    const newValue = value.split('');
    // Handle paste or multiple characters
    if (val.length > 1) {
      const pastedData = val.slice(0, length).split('');
      pastedData.forEach((char, i) => {
        if (newValue[i] !== undefined) newValue[i] = char;
      });
      onChange(newValue.join(''));
      
      // Move focus to last filled or next empty
      const nextIndex = Math.min(pastedData.length, length - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    newValue[index] = val;
    onChange(newValue.join(''));

    // Move to next input if value is entered
    if (val !== '' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace') {
      if (value[index] === '' && index > 0) {
        // Move to previous input on backspace if current is empty
        const newValue = value.split('');
        newValue[index - 1] = '';
        onChange(newValue.join(''));
        inputRefs.current[index - 1]?.focus();
      } else {
        // Clear current input
        const newValue = value.split('');
        newValue[index] = '';
        onChange(newValue.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  return (
    <div className="flex justify-between gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputRefs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={length}
          value={value[i] || ''}
          disabled={disabled}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          className={cn(
            "w-full h-14 bg-surface border-2 border-border rounded-2xl text-center text-2xl font-bold text-white focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all",
            disabled && "opacity-50 cursor-not-allowed",
            value[i] && "border-primary/50 bg-primary/5"
          )}
        />
      ))}
    </div>
  );
}
