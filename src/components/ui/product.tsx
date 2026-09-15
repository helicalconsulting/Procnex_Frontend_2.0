import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from './card';

export function PageFrame({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full px-1 py-2 sm:px-2 sm:py-3 lg:px-3', className)} {...props} />;
}

interface PageLeadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageLead({ title, description, actions, className, ...props }: PageLeadProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:mb-7 lg:flex-row lg:items-start lg:justify-between', className)} {...props}>
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-[1.15] tracking-[-0.035em] text-foreground sm:text-[26px]">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon: LucideIcon;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'violet' | 'cyan';
}

const toneClasses = {
  primary: 'bg-primary/10 text-primary ring-primary/12',
  success: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/12 dark:text-emerald-300',
  warning: 'bg-amber-500/12 text-amber-700 ring-amber-500/12 dark:text-amber-300',
  danger: 'bg-destructive/10 text-destructive ring-destructive/12',
  violet: 'bg-violet-500/10 text-violet-600 ring-violet-500/12 dark:text-violet-300',
  cyan: 'bg-cyan-500/10 text-cyan-700 ring-cyan-500/12 dark:text-cyan-300',
};

export function MetricCard({ label, value, detail, icon: Icon, tone = 'primary', className, ...props }: MetricCardProps) {
  return (
    <Card className={cn('group min-w-0 p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md sm:p-5', className)} {...props}>
      <div className="flex items-start gap-3.5">
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1', toneClasses[tone])}>
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold leading-none tracking-[-0.04em] text-foreground">{value}</div>
          {detail && <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detail}</div>}
        </div>
      </div>
    </Card>
  );
}

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <Card variant="soft" className={cn('flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center', className)} {...props}>
      <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="size-6" strokeWidth={1.7} />
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-[-0.025em]">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function SectionHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
