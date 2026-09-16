import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../../lib/utils';

interface WidgetHeaderProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
}

export function WidgetHeader({ icon, title, subtitle, href }: WidgetHeaderProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-border/80 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-primary">{icon}</span>
          <span className="truncate">{title}</span>
        </div>
        {subtitle && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {href && (
        <Link className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring" to={href}>
          View all <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

export function WidgetBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4 sm:p-5', className)}>{children}</div>;
}

export function WidgetLoading({ children = 'Loading…' }: { children?: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-muted/35 px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
