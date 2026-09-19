import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './card';

export function PageFrame({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full px-1 py-2 sm:px-2 sm:py-3 lg:px-3', className)} {...props} />;
}

interface PageLeadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title' | 'action'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  action?: React.ReactNode;
}

export function PageLead({ title, description, actions, action, className, ...props }: PageLeadProps) {
  const headerActions = actions ?? action;
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:mb-7 lg:flex-row lg:items-start lg:justify-between', className)} {...props}>
      <div className="min-w-0">
        <h1 className="text-[25px] font-semibold leading-[1.15] tracking-[-0.035em] text-foreground sm:text-[27px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[16px]">{description}</p>}
      </div>
      {headerActions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{headerActions}</div>}
    </div>
  );
}

interface MetricCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'action'> {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'violet' | 'cyan';
  action?: React.ReactNode;
  actions?: React.ReactNode;
}

const toneClasses = {
  primary: 'bg-primary/10 text-primary ring-primary/12',
  success: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/12 dark:text-emerald-300',
  warning: 'bg-amber-500/12 text-amber-700 ring-amber-500/12 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive ring-destructive/12',
  violet: 'bg-violet-500/10 text-violet-600 ring-violet-500/12 dark:text-violet-300',
  cyan: 'bg-cyan-500/10 text-cyan-700 ring-cyan-500/12 dark:text-cyan-300',
};

export function MetricCard({ label, value, detail, icon: Icon, tone = 'primary', action, actions, className, ...props }: MetricCardProps) {
  const isPressed = props['aria-pressed'] === true || props['aria-pressed'] === 'true';
  return (
    <Card
      className={cn(
        'group min-w-0 p-4 transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md sm:p-5',
        isPressed &&
          'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]',
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-3.5">
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1', toneClasses[tone])}>
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-semibold leading-none tracking-[-0.04em] text-foreground">{value}</div>
          <div className="mt-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
          {detail && <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</div>}
        </div>
      </div>
    </Card>
  );
}

interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'action'> {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'default' | 'lg';
}

export function EmptyState({ icon: Icon, title, description, action, actions, size = 'default', className, ...props }: EmptyStateProps) {
  const isLg = size === 'lg';
  const emptyAction = action ?? actions;
  return (
    <Card
      variant="soft"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        isLg ? 'min-h-[380px] sm:min-h-[440px] px-8 py-16 sm:py-20' : 'min-h-72 px-6 py-12',
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center justify-center text-center my-auto w-full max-w-lg">
        <div
          className={cn(
            'grid place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 shadow-sm',
            isLg ? 'size-14 sm:size-16' : 'size-12'
          )}
        >
          <Icon className={cn(isLg ? 'size-7 sm:size-8' : 'size-6')} strokeWidth={1.7} />
        </div>
        <h2 className={cn('font-semibold tracking-[-0.025em] text-foreground', isLg ? 'mt-5 sm:mt-6 text-xl sm:text-2xl' : 'mt-4 text-lg')}>
          {title}
        </h2>
        <p className={cn('leading-relaxed text-muted-foreground', isLg ? 'mt-3 max-w-md text-sm sm:text-base' : 'mt-2 max-w-md text-sm')}>
          {description}
        </p>
        {emptyAction && <div className={cn(isLg ? 'mt-7 sm:mt-8' : 'mt-5')}>{emptyAction}</div>}
      </div>
    </Card>
  );
}

export function SectionHeader({ title, description, action, actions, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  const headerAction = action ?? actions;
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6', className)}>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {headerAction}
    </div>
  );
}
