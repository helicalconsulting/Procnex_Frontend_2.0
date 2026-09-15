import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScrollableTabListProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  containerClassName?: string;
}

export function ScrollableTabList({
  label,
  className,
  containerClassName,
  children,
  ...props
}: ScrollableTabListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setCanScrollLeft(scroller.scrollLeft > 2);
    setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    updateScrollState();
    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(scroller);
    return () => resizeObserver.disconnect();
  }, [children, updateScrollState]);

  const scrollTabs = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: direction * Math.max(180, scrollerRef.current.clientWidth * 0.62),
      behavior: 'smooth',
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'),
    );
    if (tabs.length === 0) return;

    const currentIndex = tabs.indexOf(document.activeElement as HTMLElement);
    if (currentIndex < 0) return;

    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
    if (event.key === 'Home') {
      scrollerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
    } else if (event.key === 'End') {
      scrollerRef.current?.scrollTo({ left: scrollerRef.current.scrollWidth, behavior: 'smooth' });
    }
  };

  return (
    <div className={cn('relative min-w-0', containerClassName)}>
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={label}
        className={cn(
          'flex min-w-0 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>[role=tab]]:snap-start',
          className,
        )}
        onScroll={updateScrollState}
        onKeyDown={handleKeyDown}
        onFocusCapture={(event) => {
          if ((event.target as HTMLElement).getAttribute('role') === 'tab') {
            (event.target as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }}
        {...props}
      >
        {children}
      </div>

      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll tabs left"
          className="absolute left-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-lg border border-border/80 bg-card/95 text-muted-foreground shadow-md backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => scrollTabs(-1)}
        >
          <ChevronLeft size={16} />
        </button>
      )}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll tabs right"
          className="absolute right-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-lg border border-border/80 bg-card/95 text-muted-foreground shadow-md backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => scrollTabs(1)}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
