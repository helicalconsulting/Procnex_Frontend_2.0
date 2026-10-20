import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, MoveHorizontal } from 'lucide-react';
import './data-table-viewport.css';
import { cn } from '@/lib/utils';

interface DataTableViewportProps {
  label: string;
  children: ReactNode;
  className?: string;
  showHint?: boolean;
  stickyActions?: boolean;
  wrapperClassName?: string;
}

export function DataTableViewport({
  label,
  children,
  className,
  showHint = true,
  stickyActions = false,
  wrapperClassName,
}: DataTableViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const [atStart, setAtStart] = useState(true);

  const updateOverflow = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const overflowing = viewport.scrollWidth > viewport.clientWidth + 2;
    setHasOverflow(overflowing);
    setAtStart(viewport.scrollLeft <= 2);
    setAtEnd(!overflowing || viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    updateOverflow();
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(viewport);
    if (viewport.firstElementChild) resizeObserver.observe(viewport.firstElementChild);
    return () => resizeObserver.disconnect();
  }, [children, updateOverflow]);

  return (
    <div className={cn("data-table-shell", wrapperClassName)}>
      {showHint && hasOverflow && (
        <div className="data-table-scroll-tools">
          <span><MoveHorizontal size={14} aria-hidden="true" /> Scroll to view all columns</span>
          <div>
            <button type="button" aria-label={`Scroll ${label} left`} disabled={atStart} onClick={() => viewportRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}><ChevronLeft size={16} /></button>
            <button type="button" aria-label={`Scroll ${label} right`} disabled={atEnd} onClick={() => viewportRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}><ChevronRight size={16} /></button>
          </div>
        </div>
      )}
      <div
        ref={viewportRef}
        role="region"
        aria-label={label}
        tabIndex={hasOverflow ? 0 : undefined}
        className={cn(
          'data-table-viewport min-w-0 overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          stickyActions && 'data-table-register',
          className,
        )}
        onScroll={updateOverflow}
      >
        {children}
      </div>

    </div>
  );
}
