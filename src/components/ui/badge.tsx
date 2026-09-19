import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex min-h-[30px] items-center gap-1.5 rounded-full border px-3.5 py-1 text-[13.5px] font-bold leading-none tracking-[0.01em]',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-secondary/70 text-secondary-foreground',
        primary: 'border-primary/18 bg-primary/10 text-primary',
        success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        warning: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-400',
        danger: 'border-destructive/30 bg-destructive/15 text-destructive',
        info: 'border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-400',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
