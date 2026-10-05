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

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    pages.push(1);
    if (safePage > 3) pages.push('...');
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (safePage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

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
        {getPageNumbers().map((p, idx) =>
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
