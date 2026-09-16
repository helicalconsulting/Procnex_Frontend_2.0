import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold leading-none tracking-[0.01em]',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-secondary/70 text-secondary-foreground',
        primary: 'border-primary/18 bg-primary/10 text-primary',
        success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        warning: 'border-amber-500/20 bg-amber-500/12 text-amber-700 dark:text-amber-300',
        danger: 'border-destructive/20 bg-destructive/10 text-destructive',
        info: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
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
