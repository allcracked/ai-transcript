import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'success' | 'destructive' | 'outline';
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  secondary: 'bg-zinc-700/50 text-zinc-300 border-zinc-600/50',
  success: 'bg-green-600/20 text-green-400 border-green-500/30',
  destructive: 'bg-red-600/20 text-red-400 border-red-500/30',
  outline: 'bg-transparent text-zinc-300 border-zinc-600',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
