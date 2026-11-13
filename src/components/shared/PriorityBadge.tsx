import React from 'react';
import { cn } from '../../lib/utils';

export type PriorityLevel = 'LOW' | 'MODERATE' | 'URGENT';

export function normalizePriority(priority?: string): PriorityLevel {
  const p = String(priority || '').toUpperCase().trim();
  if (p === 'URGENT' || p === 'HIGH' || p === 'CRITICAL') return 'URGENT';
  if (p === 'LOW') return 'LOW';
  return 'MODERATE'; // Default for MEDIUM, MODERATE, or unspecified
}

export function getPriorityLabel(priority?: string): string {
  const p = normalizePriority(priority);
  if (p === 'URGENT') return 'Urgent';
  if (p === 'LOW') return 'Low';
  return 'Moderate';
}

export function getPriorityStyles(priority?: string) {
  const p = normalizePriority(priority);
  if (p === 'URGENT') {
    return {
      level: 'URGENT' as const,
      label: 'Urgent',
      badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/35 font-bold',
      dot: 'bg-rose-500 animate-pulse',
      borderLeft: 'border-l-[3.5px] border-l-rose-500',
      softBg: 'bg-rose-500/[0.025]',
    };
  }
  if (p === 'LOW') {
    return {
      level: 'LOW' as const,
      label: 'Low',
      badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-bold',
      dot: 'bg-emerald-500',
      borderLeft: 'border-l-[3.5px] border-l-emerald-500',
      softBg: 'bg-emerald-500/[0.015]',
    };
  }
  return {
    level: 'MODERATE' as const,
    label: 'Moderate',
    badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-bold',
    dot: 'bg-amber-500',
    borderLeft: 'border-l-[3.5px] border-l-amber-500',
    softBg: 'bg-amber-500/[0.015]',
  };
}

interface PriorityBadgeProps {
  priority?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showDot?: boolean;
}

export default function PriorityBadge({
  priority,
  size = 'md',
  className,
  showDot = true,
}: PriorityBadgeProps) {
  const styles = getPriorityStyles(priority);

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-0.5 gap-1.5 font-semibold',
    md: 'text-[13.5px] px-3.5 py-1 min-h-[28px] gap-1.5 font-bold leading-none tracking-[0.01em]',
    lg: 'text-sm px-4 py-1.5 min-h-[32px] gap-2 font-bold',
  }[size];

  const dotSize = {
    sm: 'size-1.5',
    md: 'size-2',
    lg: 'size-2.5',
  }[size];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border transition-colors select-none',
        sizeClasses,
        styles.badge,
        className
      )}
    >
      {showDot && <span className={cn('rounded-full shrink-0', dotSize, styles.dot)} />}
      <span>{styles.label}</span>
    </span>
  );
}
