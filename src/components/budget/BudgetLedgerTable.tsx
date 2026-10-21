// ============================================================
// components/budget/BudgetLedgerTable.tsx
// Section J: Document Movement Ledger Table with CSV export
// ============================================================
import React, { useState } from 'react';
import { Download, Search, FileText, ArrowDownRight, ArrowUpRight, RefreshCw, X } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface LedgerItem {
  id: string;
  documentType: string;
  documentNumber?: string | null;
  movementType: string;
  amount: number;
  docCurrency?: string | null;
  docAmount?: number | null;
  exchangeRate?: number | null;
  balanceAfter: number;
  createdByName?: string | null;
  remarks?: string | null;
  createdAt: string;
  budgetLine?: {
    lineCode: string;
    lineName: string;
    glAccountCode?: string | null;
  } | null;
}

interface BudgetLedgerTableProps {
  items: LedgerItem[];
  currency?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const BudgetLedgerTable: React.FC<BudgetLedgerTableProps> = ({
  items,
  currency = 'KES',
  isLoading = false,
  onRefresh,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = items.filter((item) => {
    const matchesType = filterType === 'ALL' || item.documentType === filterType;
    const matchesSearch =
      !searchTerm ||
      (item.documentNumber && item.documentNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.remarks && item.remarks.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.budgetLine?.lineCode && item.budgetLine.lineCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.budgetLine?.lineName && item.budgetLine.lineName.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const getMovementBadge = (type: string) => {
    switch (type) {
      case 'PRE_COMMIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <ArrowDownRight className="size-3" /> Pre-Commit
          </span>
        );
      case 'COMMIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
            <ArrowDownRight className="size-3" /> Commitment
          </span>
        );
      case 'ACTUAL_DEBIT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <ArrowDownRight className="size-3" /> Actual Spend
          </span>
        );
      case 'RELEASE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
            <ArrowUpRight className="size-3" /> Released
          </span>
        );
      case 'TRANSFER_IN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            <ArrowUpRight className="size-3" /> Transfer In
          </span>
        );
      case 'TRANSFER_OUT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <ArrowDownRight className="size-3" /> Transfer Out
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border">
            {type}
          </span>
        );
    }
  };

  const exportCSV = () => {
    if (filtered.length === 0) return;

    const headers = [
      'Timestamp',
      'Document Type',
      'Document Number',
      'Movement Type',
      'Line Code',
      'Line Name',
      'Amount',
      'Currency',
      'Balance After',
      'User',
      'Remarks',
    ];

    const rows = filtered.map((i) => [
      new Date(i.createdAt).toISOString(),
      i.documentType,
      i.documentNumber || '',
      i.movementType,
      i.budgetLine?.lineCode || '',
      `"${(i.budgetLine?.lineName || '').replace(/"/g, '""')}"`,
      i.amount,
      currency,
      i.balanceAfter,
      `"${(i.createdByName || '').replace(/"/g, '""')}"`,
      `"${(i.remarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `budget-ledger-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="p-5 border-border/80 shadow-sm space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search doc #, line code, remarks..."
              className="h-9 pl-9 pr-8 text-xs rounded-xl"
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchTerm('')}
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-9 px-3 text-xs rounded-xl border border-input bg-card text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="ALL">All Documents</option>
            <option value="PR">Requisitions (PR)</option>
            <option value="PO">Purchase Orders (PO)</option>
            <option value="INVOICE">Invoices</option>
            <option value="VIREMENT">Virements</option>
            <option value="SUPPLEMENT">Supplements</option>
          </select>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {onRefresh && (
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-9 w-9 rounded-xl"
              title="Refresh ledger"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="gap-1.5 h-9"
          >
            <Download className="size-3.5" />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/70">
            <tr>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Doc Type & #</th>
              <th className="px-4 py-3">Budget Line</th>
              <th className="px-4 py-3">Movement</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Balance After</th>
              <th className="px-4 py-3">User & Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <FileText className="size-7 mx-auto mb-2 opacity-40 text-muted-foreground" />
                  No ledger transactions recorded yet.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-[11px]">
                    {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-foreground">
                    <span className="font-semibold text-primary">{item.documentType}</span>{' '}
                    {item.documentNumber ? `#${item.documentNumber}` : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-foreground">
                      {item.budgetLine?.lineCode || '—'}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {item.budgetLine?.lineName || ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {getMovementBadge(item.movementType)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-foreground">
                    {item.amount.toLocaleString()} {currency}
                    {item.docCurrency && item.docCurrency !== currency && (
                      <div className="text-[10px] font-normal text-muted-foreground">
                        ({item.docAmount?.toLocaleString()} {item.docCurrency} @ {item.exchangeRate})
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-muted-foreground">
                    {item.balanceAfter.toLocaleString()} {currency}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-[11px] max-w-xs">
                    <div className="font-medium text-foreground">
                      {item.createdByName || 'System'}
                    </div>
                    <div className="truncate text-muted-foreground" title={item.remarks || ''}>
                      {item.remarks || '—'}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
