import { AlertTriangle, Ban, CheckCircle2, Clock, FileText, Package, Truck, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusConfig = { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; icon: LucideIcon };
const orderStatuses: Record<string, StatusConfig> = {
  CONFIRMED: { label: 'Confirmed', tone: 'success', icon: CheckCircle2 },
  APPROVED: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  ISSUED: { label: 'Issued', tone: 'info', icon: FileText },
  SENT: { label: 'Sent', tone: 'info', icon: Truck },
  SENT_TO_VENDOR: { label: 'Sent to vendor', tone: 'info', icon: FileText },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'info', icon: CheckCircle2 },
  PROCESSING: { label: 'Processing', tone: 'warning', icon: Clock },
  IN_PROGRESS: { label: 'In Progress', tone: 'warning', icon: Clock },
  SHIPPED: { label: 'Shipped', tone: 'info', icon: Truck },
  DELIVERED: { label: 'Delivered', tone: 'success', icon: CheckCircle2 },
  GRN_RECEIVED: { label: 'Receipt recorded', tone: 'success', icon: CheckCircle2 },
  INVOICED: { label: 'Invoiced', tone: 'info', icon: FileText },
  CLOSED: { label: 'Closed', tone: 'success', icon: CheckCircle2 },
  COMPLETED: { label: 'Completed', tone: 'success', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelled', tone: 'danger', icon: Ban },
  REJECTED: { label: 'Rejected', tone: 'danger', icon: Ban },
  PENDING: { label: 'Pending', tone: 'neutral', icon: Clock },
};
const contractStatuses: Record<string, StatusConfig> = {
  APPROVED: orderStatuses.APPROVED,
  DRAFT: { label: 'Draft', tone: 'neutral', icon: FileText },
  PENDING_VENDOR_SIGNATURE: { label: 'Awaiting your signature', tone: 'warning', icon: Clock },
  AWAITING_VENDOR_SIGNATURE: { label: 'Awaiting your signature', tone: 'warning', icon: Clock },
  AWAITING_CUSTOMER_SIGNATURE: { label: 'Awaiting buyer signature', tone: 'info', icon: Clock },
  VENDOR_SIGNED: { label: 'Vendor signed', tone: 'success', icon: CheckCircle2 },
  ACCEPTED: { label: 'Active', tone: 'success', icon: CheckCircle2 },
  ACTIVE: { label: 'Active', tone: 'success', icon: CheckCircle2 },
  COMPLETED: orderStatuses.COMPLETED,
  EXPIRING_SOON: { label: 'Expiring soon', tone: 'warning', icon: AlertTriangle },
  EXPIRED: { label: 'Expired', tone: 'danger', icon: Clock },
  CANCELLED: orderStatuses.CANCELLED,
  TERMINATED: { label: 'Terminated', tone: 'danger', icon: Ban },
};

const invoiceStatuses: Record<string, StatusConfig> = {
  PENDING: { label: 'Pending', tone: 'warning', icon: Clock },
  APPROVED: orderStatuses.APPROVED,
  PAID: { label: 'Paid', tone: 'success', icon: CheckCircle2 },
  REJECTED: orderStatuses.REJECTED,
  OVERDUE: { label: 'Overdue', tone: 'danger', icon: AlertTriangle },
};

export function RecordStatusBadge({ status, kind, className }: { status?: string; kind: 'order' | 'contract' | 'invoice'; className?: string }) {
  const normalized = (status || '').trim().toUpperCase();
  const config = (kind === 'order' ? orderStatuses : kind === 'invoice' ? invoiceStatuses : contractStatuses)[normalized] ?? {
    label: normalized ? normalized.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Not specified',
    tone: 'neutral', icon: kind === 'order' ? Package : FileText,
  };
  const Icon = config.icon;
  return (
    <Badge tone={config.tone} className={cn(
      'whitespace-nowrap',
      config.tone === 'success' && 'text-emerald-700 dark:text-emerald-300',
      config.tone === 'warning' && 'text-amber-800 dark:text-amber-300',
      config.tone === 'danger' && 'text-red-700 dark:text-red-300',
      config.tone === 'info' && 'text-sky-700 dark:text-sky-300',
      className,
    )}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />{config.label}
    </Badge>
  );
}
