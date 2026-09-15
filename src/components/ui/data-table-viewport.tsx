import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { MoveHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableViewportProps {
  label: string;
  children: ReactNode;
  className?: string;
  showHint?: boolean;
}

export function DataTableViewport({
  label,
  children,
  className,
  showHint = true,
}: DataTableViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  const updateOverflow = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const overflowing = viewport.scrollWidth > viewport.clientWidth + 2;
    setHasOverflow(overflowing);
    setAtEnd(!overflowing || viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    updateOverflow();
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [children, updateOverflow]);

  return (
    <div className="relative min-w-0">
      {showHint && hasOverflow && (
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground lg:hidden">
          <MoveHorizontal size={14} aria-hidden="true" />
          Scroll horizontally to view all columns
        </div>
      )}
      <div
        ref={viewportRef}
        role="region"
        aria-label={label}
        tabIndex={hasOverflow ? 0 : undefined}
        className={cn(
          'min-w-0 overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          className,
        )}
        onScroll={updateOverflow}
      >
        {children}
      </div>
      {hasOverflow && !atEnd && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 top-6 w-10 bg-gradient-to-l from-card/90 to-transparent lg:top-0"
        />
      )}
    </div>
  );
}
