import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  perPage?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function getPaginationPages(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
}

export function TablePagination({
  currentPage,
  totalItems,
  perPage = 8,
  onPageChange,
  className,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  if (totalItems <= perPage) return null;

  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startItem = (safePage - 1) * perPage + 1;
  const endItem = Math.min(safePage * perPage, totalItems);

  const pages = getPaginationPages(safePage, totalPages);

  return (
    <div
      className={cn(
        'mt-4 flex flex-col gap-3 rounded-xl border border-border/65 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <span className="text-xs text-muted-foreground">
        {startItem}–{endItem} of {totalItems}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {pages.map((p, idx) =>
          typeof p === 'number' ? (
            <Button
              key={p}
              variant={safePage === p ? 'default' : 'ghost'}
              size="icon-sm"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
            >
              {p}
            </Button>
          ) : (
            <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground select-none">
              …
            </span>
          )
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export default TablePagination;
