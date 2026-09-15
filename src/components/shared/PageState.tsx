import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './Skeleton';

interface PageStateProps {
  kind: 'loading' | 'empty' | 'error';
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function PageState({ kind, title, description, icon, action, className }: PageStateProps) {
  if (kind === 'loading') {
    return (
      <div className={cn('rounded-2xl border border-border/70 bg-card p-5 shadow-sm', className)} role="status" aria-label={title || 'Loading content'}>
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    );
  }

  const isError = kind === 'error';
  return (
    <div
      className={cn(
        'rounded-2xl border border-dashed bg-card px-5 py-14 text-center shadow-sm',
        isError ? 'border-destructive/35' : 'border-border',
        className,
      )}
      role={isError ? 'alert' : 'status'}
    >
      <div className={cn('mx-auto grid size-11 place-items-center rounded-2xl', isError ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
        {icon || (isError ? <AlertTriangle size={21} /> : <Inbox size={21} />)}
      </div>
      <h3 className="mt-4 text-base font-semibold tracking-[-0.02em] text-foreground">
        {title || (isError ? 'Something went wrong' : 'Nothing here yet')}
      </h3>
      {description && <p className="mx-auto mt-1 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
