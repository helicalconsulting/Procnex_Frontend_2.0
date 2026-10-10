import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  ShoppingCart,
  Users,
  Timer,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  CalendarDays,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { MessageStrip } from '../../../components/shared/MessageStrip';
import { useServiceData } from '../../../hooks/useServiceData';
import { dashboardService } from '../../../services/dashboardService';
import { purchaseRequisitionService } from '../../../services/purchaseRequisitionService';
import { quotationService } from '../../../services/quotationService';
import { vendorService } from '../../../services/vendorService';
import { approvalService } from '../../../services/approvalService';
import { invoiceService, type APInvoice } from '../../../services/invoiceService';
import { localDataService } from '../../../services/localDataService';
import { useCurrency } from '../../../components/shared/CurrencyMaster';
import type { DashboardPipelineItem, DashboardRecentRfq, KpiItem, VendorTableRow, ApprovalTableRow } from '../../../types/viewModels';
import type { Quotation } from '../../../types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { Badge } from '../../../components/ui/badge';
import { StatsSkeleton } from '../../../components/shared/Skeleton';
import { cn } from '../../../lib/utils';

interface DashboardOverview {
  rfqs: { total: number; draft: number; sent: number; pendingApproval: number };
  quotations: { active: number };
  purchaseOrders: { total: number };
  vendors: { total: number; pendingApproval: number };
}

interface SpendOverview {
  monthlyTrend: Array<{ month: string; value: number }>;
  categories: Array<{ label: string; amount: number; percent: number }>;
}

interface TopVendor {
  name: string;
  initials: string;
  pos: number;
  score: number;
  quality: number;
  delivery: number;
  avatarMod: string;
}

interface DetailRow {
  label: string;
  value: string;
  helper?: string;
  link?: string;
}

interface ActivityItemRow {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  helper?: string;
  link: string;
}

const KPI_ICONS: Record<string, typeof FileText> = {
  rfq: FileText,
  approvals: Clock,
  pos: ShoppingCart,
  vendors: Users,
  spend: TrendingUp,
  lead: Timer,
  quotes: FileText,
  tasks: Timer,
};

const KPI_TONES: Record<string, { icon: string }> = {
  rfq: { icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
  approvals: { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  pos: { icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-300' },
  vendors: { icon: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300' },
  spend: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  lead: { icon: 'bg-pink-500/10 text-pink-600 dark:text-pink-300' },
  quotes: { icon: 'bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  tasks: { icon: 'bg-orange-500/10 text-orange-600 dark:text-orange-300' },
};

function TrendIcon({ direction }: { direction: 'up' | 'down' | 'neutral' }) {
  if (direction === 'up') return <TrendingUp size={14} />;
  if (direction === 'down') return <TrendingDown size={14} />;
  return <Minus size={14} />;
}

function getKpiKey(kpi: KpiItem) {
  return kpi.id === 'quotes' ? 'quotes' : kpi.modifier || kpi.id;
}

function getKpiDescription(kpi: KpiItem) {
  const key = getKpiKey(kpi);
  const descriptions: Record<string, string> = {
    rfq: 'Current RFQ activity, draft work, and recent procurement requests.',
    approvals: 'Pending approvals and evaluation across POs, Invoices, Payment Vouchers, Quotations, and RFQs.',
    pos: 'Purchase order volume, release status, and recent orders.',
    vendors: 'Vendor base health, top performers, and vendor records.',
    spend: 'Spend movement and category distribution from tracked orders.',
    lead: 'Pending tasks and action items requiring your review or approval.',
    quotes: 'Active quotation volume, submission status, and quote records.',
  };
  return descriptions[key] || 'Dashboard metric details and related activity.';
}

function getKpiDefaultRoute(key: string): string {
  switch (key) {
    case 'rfq':
      return '/rfq';
    case 'approvals':
      return '/approvals';
    case 'pos':
      return '/procurement/purchase-orders';
    case 'vendors':
      return '/vendors';
    case 'spend':
      return '/procurement/purchase-orders';
    case 'quotes':
      return '/quotations';
    case 'lead':
      return '/approvals';
    default:
      return '/rfq';
  }
}

function buildSummaryRows(
  kpi: KpiItem,
  overview: DashboardOverview | null,
  purchaseOrders: any[],
  quotations: Quotation[],
  vendorsList: VendorTableRow[],
  myTasks: { tasks: Array<{ type: string; count: number; label: string; link: string }>; taskCount: number },
  pendingApprovals: ApprovalTableRow[],
  invoices: APInvoice[],
  payments: any[]
): DetailRow[] {
  const key = getKpiKey(kpi);
  const base: DetailRow[] = [
    { label: 'Current Value', value: kpi.value, link: getKpiDefaultRoute(key) },
    { label: 'Signal', value: kpi.trend || 'No trend available' },
  ];

  if (key === 'rfq') {
    return [
      { label: 'Total RFQs', value: String(overview?.rfqs?.total ?? 0), link: '/rfq' },
      { label: 'Draft RFQs', value: String(overview?.rfqs?.draft ?? 0), link: '/rfq?status=DRAFT' },
      { label: 'Sent RFQs', value: String(overview?.rfqs?.sent ?? 0), link: '/rfq?status=SENT' },
    ];
  }

  if (key === 'approvals') {
    const pendingPOsCount = Math.max(
      pendingApprovals.filter((a) => a.module === 'Purchase Order' && ['PENDING', 'RETURNED'].includes(a.status)).length,
      purchaseOrders.filter((p: any) => ['PENDING_APPROVAL', 'PENDING', 'RE_REVIEW', 'RETURNED'].includes(String(p.status || '').toUpperCase())).length
    );

    const pendingInvoicesCount = Math.max(
      pendingApprovals.filter((a) => (a.module === 'Purchase Invoice' || a.module === 'Accounts Payable') && ['PENDING', 'RETURNED'].includes(a.status)).length,
      invoices.filter((i: any) => ['PENDING', 'PENDING_APPROVAL', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(i.status || '').toUpperCase())).length
    );

    const pendingVouchersCount = Math.max(
      pendingApprovals.filter((a) => ['Payment', 'Payments', 'Payment Voucher'].includes(a.module) && ['PENDING', 'RETURNED'].includes(a.status)).length,
      payments.filter((p: any) => ['PENDING', 'PROCESSING', 'RETURNED', 'RE_REVIEW', 'PENDING_APPROVAL'].includes(String(p.status || '').toUpperCase())).length
    );

    const pendingQuotationsCount = Math.max(
      pendingApprovals.filter((a) => a.module === 'Quotation' && ['PENDING', 'RETURNED'].includes(a.status)).length,
      quotations.filter((q: any) => ['SUBMITTED', 'UNDER_EVALUATION', 'PENDING'].includes(String(q.status || '').toUpperCase())).length
    );

    const pendingRfqsCount = Math.max(
      pendingApprovals.filter((a) => a.module === 'RFQ' && ['PENDING', 'RETURNED'].includes(a.status)).length,
      overview?.rfqs?.pendingApproval ?? 0
    );

    return [
      {
        label: 'Pending POs',
        value: String(pendingPOsCount),
        helper: 'Awaiting order sign-off',
        link: '/approvals?module=Purchase+Order&status=PENDING',
      },
      {
        label: 'Pending Invoices',
        value: String(pendingInvoicesCount),
        helper: 'Awaiting invoice approval',
        link: '/approvals?module=Purchase+Invoice&status=PENDING',
      },
      {
        label: 'Pending Payment Vouchers',
        value: String(pendingVouchersCount),
        helper: 'Awaiting payment release',
        link: '/payments?status=PENDING',
      },
      {
        label: 'Pending Quotations',
        value: String(pendingQuotationsCount),
        helper: 'Bids under evaluation',
        link: '/quotations',
      },
      {
        label: 'Pending RFQs',
        value: String(pendingRfqsCount),
        helper: 'RFQs under review',
        link: '/approvals?module=RFQ&status=PENDING',
      },
    ];
  }

  if (key === 'pos') {
    const approvedCount = purchaseOrders.filter((p: any) =>
      ['APPROVED', 'SENT_TO_VENDOR', 'RELEASED'].includes(String(p.status || '').toUpperCase())
    ).length;
    const pendingCount = purchaseOrders.filter((p: any) =>
      ['PENDING_APPROVAL', 'PENDING', 'RE_REVIEW', 'DRAFT'].includes(String(p.status || '').toUpperCase())
    ).length;
    const totalPos = overview?.purchaseOrders?.total ?? purchaseOrders.length;
    return [
      { label: 'Purchase Orders', value: String(totalPos), link: '/procurement/purchase-orders' },
      { label: 'Approved / Released', value: String(approvedCount), helper: 'Ready or issued to vendor', link: '/procurement/purchase-orders?status=APPROVED' },
      { label: 'Draft / Pending', value: String(pendingCount), helper: 'Awaiting action or release', link: '/procurement/purchase-orders?status=DRAFT_PENDING' },
    ];
  }

  if (key === 'quotes') {
    const acceptedCount = quotations.filter((q: any) =>
      ['ACCEPTED', 'APPROVED', 'AWARDED'].includes(String(q.status || '').toUpperCase())
    ).length;
    const pendingCount = quotations.filter((q: any) =>
      ['SUBMITTED', 'UNDER_EVALUATION', 'PENDING'].includes(String(q.status || '').toUpperCase())
    ).length;
    const totalQuotes = quotations.length || (overview?.quotations?.active ?? 0);
    return [
      { label: 'Active Quotations', value: String(overview?.quotations?.active ?? pendingCount), helper: 'Awaiting evaluation', link: '/quotations' },
      { label: 'Accepted Quotes', value: String(acceptedCount), helper: 'Evaluated & approved', link: '/quotations' },
      { label: 'Total Received', value: String(totalQuotes), helper: 'All vendor submissions', link: '/quotations' },
    ];
  }

  if (key === 'lead') {
    const evalTasks = myTasks.tasks.find((t) => t.type.includes('QUOTATION_EVAL'))?.count ?? 0;
    const poTasks = myTasks.tasks.find((t) => t.type.includes('QUOTATION_ACCEPTED'))?.count ?? 0;
    return [
      { label: 'My Tasks', value: String(myTasks.taskCount || kpi.value), link: '/approvals' },
      { label: 'Quotes to Evaluate', value: String(evalTasks), helper: 'Quotations needing review', link: '/rfq?status=QUOTATIONS_RECEIVED' },
      { label: 'Pending PO Creation', value: String(poTasks), helper: 'Accepted quotes awaiting PO', link: '/procurement/purchase-orders' },
    ];
  }

  if (key === 'vendors') {
    const activeCount = overview?.vendors?.total ?? vendorsList.filter((v: any) => v.isActive).length;
    const pendingCount = overview?.vendors?.pendingApproval ?? vendorsList.filter((v: any) => !v.isActive).length;
    return [
      { label: 'Active Vendors', value: String(activeCount), link: '/vendors?status=active' },
      { label: 'Pending Approval', value: String(pendingCount), helper: 'Awaiting onboarding check', link: '/vendors?status=inactive' },
      { label: 'Total Vendors', value: String(vendorsList.length || activeCount), link: '/vendors' },
    ];
  }

  return base;
}

function buildBreakdownRows(
  kpi: KpiItem,
  pipeline: DashboardPipelineItem[],
  spend: SpendOverview | null,
  topVendors: TopVendor[],
  myTasks: { tasks: Array<{ type: string; count: number; label: string; link: string }>; taskCount: number },
  purchaseOrders: any[],
  quotations: Quotation[],
  formatMoney: (n: number) => string,
  pendingApprovals: ApprovalTableRow[],
  invoices: APInvoice[],
  payments: any[],
  overview: DashboardOverview | null
): DetailRow[] {
  const key = getKpiKey(kpi);

  if (key === 'approvals') {
    const pendingPOsCount = Math.max(
      pendingApprovals.filter((a) => a.module === 'Purchase Order' && ['PENDING', 'RETURNED'].includes(a.status)).length,
      purchaseOrders.filter((p: any) => ['PENDING_APPROVAL', 'PENDING', 'RE_REVIEW', 'RETURNED'].includes(String(p.status || '').toUpperCase())).length
    );

    const pendingInvoicesCount = Math.max(
      pendingApprovals.filter((a) => (a.module === 'Purchase Invoice' || a.module === 'Accounts Payable') && ['PENDING', 'RETURNED'].includes(a.status)).length,
      invoices.filter((i: any) => ['PENDING', 'PENDING_APPROVAL', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(i.status || '').toUpperCase())).length
    );

    const pendingVouchersCount = Math.max(
      pendingApprovals.filter((a) => ['Payment', 'Payments', 'Payment Voucher'].includes(a.module) && ['PENDING', 'RETURNED'].includes(a.status)).length,
      payments.filter((p: any) => ['PENDING', 'PROCESSING', 'RETURNED', 'RE_REVIEW', 'PENDING_APPROVAL'].includes(String(p.status || '').toUpperCase())).length
    );

    const pendingQuotationsCount = Math.max(
      pendingApprovals.filter((a) => a.module === 'Quotation' && ['PENDING', 'RETURNED'].includes(a.status)).length,
      quotations.filter((q: any) => ['SUBMITTED', 'UNDER_EVALUATION', 'PENDING'].includes(String(q.status || '').toUpperCase())).length
    );

    const pendingRfqsCount = Math.max(
      pendingApprovals.filter((a) => a.module === 'RFQ' && ['PENDING', 'RETURNED'].includes(a.status)).length,
      overview?.rfqs?.pendingApproval ?? 0
    );

    return [
      {
        label: 'Pending Purchase Orders',
        value: String(pendingPOsCount),
        helper: 'Orders awaiting management & finance approval',
        link: '/approvals?module=Purchase+Order&status=PENDING',
      },
      {
        label: 'Pending Purchase Invoices',
        value: String(pendingInvoicesCount),
        helper: 'Invoices under 3-way match & finance verification',
        link: '/approvals?module=Purchase+Invoice&status=PENDING',
      },
      {
        label: 'Pending Payment Vouchers',
        value: String(pendingVouchersCount),
        helper: 'Bank payment vouchers pending disbursement authorization',
        link: '/payments?status=PENDING',
      },
      {
        label: 'Pending Quotations',
        value: String(pendingQuotationsCount),
        helper: 'Vendor quotes awaiting evaluation & awarding',
        link: '/quotations',
      },
      {
        label: 'Pending RFQs',
        value: String(pendingRfqsCount),
        helper: 'Requisitions and RFQs awaiting management approval',
        link: '/approvals?module=RFQ&status=PENDING',
      },
    ];
  }

  if (key === 'pos') {
    const approvedCount = purchaseOrders.filter((p: any) =>
      ['APPROVED', 'SENT_TO_VENDOR', 'RELEASED'].includes(String(p.status || '').toUpperCase())
    ).length;
    const pendingApprovalCount = purchaseOrders.filter((p: any) =>
      ['PENDING_APPROVAL', 'PENDING', 'RE_REVIEW', 'RETURNED'].includes(String(p.status || '').toUpperCase())
    ).length;
    const draftCount = purchaseOrders.filter((p: any) =>
      String(p.status || '').toUpperCase() === 'DRAFT'
    ).length;
    const rejectedCount = purchaseOrders.filter((p: any) =>
      ['REJECTED', 'CANCELLED'].includes(String(p.status || '').toUpperCase())
    ).length;

    return [
      { label: 'Approved / Released', value: String(approvedCount), helper: 'Confirmed purchase orders', link: '/procurement/purchase-orders?status=APPROVED' },
      { label: 'Pending Approval', value: String(pendingApprovalCount), helper: 'Under workflow review', link: '/procurement/purchase-orders?status=DRAFT_PENDING' },
      { label: 'Draft Orders', value: String(draftCount), helper: 'In preparation', link: '/procurement/purchase-orders?status=DRAFT_PENDING' },
      { label: 'Rejected / Cancelled', value: String(rejectedCount), helper: 'Declined or cancelled', link: '/procurement/purchase-orders?status=REJECTED' },
    ];
  }

  if (key === 'quotes') {
    const pendingCount = quotations.filter((q: any) =>
      ['SUBMITTED', 'UNDER_EVALUATION', 'PENDING'].includes(String(q.status || '').toUpperCase())
    ).length;
    const acceptedCount = quotations.filter((q: any) =>
      ['ACCEPTED', 'APPROVED', 'AWARDED'].includes(String(q.status || '').toUpperCase())
    ).length;
    const rejectedCount = quotations.filter((q: any) =>
      String(q.status || '').toUpperCase() === 'REJECTED'
    ).length;
    const total = quotations.length || 1;

    return [
      { label: 'Pending Evaluation', value: String(pendingCount), helper: `${Math.round((pendingCount / total) * 100)}% of submitted quotations`, link: '/quotations' },
      { label: 'Accepted / Awarded', value: String(acceptedCount), helper: `${Math.round((acceptedCount / total) * 100)}% of submitted quotations`, link: '/quotations' },
      { label: 'Rejected', value: String(rejectedCount), helper: `${Math.round((rejectedCount / total) * 100)}% of submitted quotations`, link: '/quotations' },
    ];
  }

  if (key === 'lead') {
    return myTasks.tasks.length
      ? myTasks.tasks.map((t) => ({
          label: t.label,
          value: String(t.count),
          helper: `${t.count} pending action`,
          link: t.link,
        }))
      : [{ label: 'My Tasks', value: '0', helper: 'All tasks completed!', link: '/approvals' }];
  }

  if (key === 'vendors') {
    return topVendors.length
      ? topVendors.map((vendor) => ({
          label: vendor.name,
          value: `${vendor.score}% overall`,
          helper: `Quality: ${vendor.quality}% · Delivery: ${vendor.delivery}% · ${vendor.pos} orders`,
          link: `/vendors?search=${encodeURIComponent(vendor.name)}`,
        }))
      : [{ label: 'Top Vendors', value: 'No vendor details available', link: '/vendors' }];
  }

  if (key === 'spend') {
    const categories = spend?.categories || [];
    return categories.length
      ? categories.map((cat) => ({
          label: cat.label,
          value: formatMoney(cat.amount),
          helper: `${cat.percent}% of tracked spend`,
          link: '/procurement/purchase-orders',
        }))
      : [{ label: 'Spend Breakdown', value: 'No spend data available', link: '/procurement/purchase-orders' }];
  }

  if (pipeline.length) {
    return pipeline.map((stage) => {
      const statusKey = String(stage.status || stage.label).toUpperCase();
      let link = '/rfq';
      if (statusKey.includes('DRAFT')) {
        link = '/rfq?status=DRAFT';
      } else if (statusKey.includes('SENT')) {
        link = '/rfq?status=SENT';
      } else if (statusKey.includes('QUOTE') || statusKey.includes('QUOTATION')) {
        link = '/quotations';
      } else if (statusKey.includes('EVAL') || statusKey.includes('PENDING')) {
        link = '/rfq?status=PENDING_APPROVAL';
      } else if (statusKey.includes('PO') || statusKey.includes('ORDER')) {
        link = '/procurement/purchase-orders';
      } else if (statusKey.includes('CLOSE')) {
        link = '/rfq?status=CLOSED';
      }

      return {
        label: stage.label,
        value: String(stage.count),
        helper: stage.status,
        link,
      };
    });
  }

  return [{ label: 'Breakdown', value: 'No breakdown available', link: '/rfq' }];
}

function getRelatedActivity(
  kpi: KpiItem,
  recentRfqs: DashboardRecentRfq[],
  purchaseOrders: any[],
  quotations: Quotation[],
  vendorsList: VendorTableRow[],
  myTasks: { tasks: Array<{ type: string; count: number; label: string; link: string }>; taskCount: number },
  formatMoney: (n: number) => string,
  pendingApprovals: ApprovalTableRow[],
  invoices: APInvoice[],
  payments: any[]
): ActivityItemRow[] {
  const key = getKpiKey(kpi);

  if (key === 'approvals') {
    const list: ActivityItemRow[] = [];

    const pendingOnly = pendingApprovals.filter((a) => a.status === 'PENDING' || a.status === 'RETURNED');
    const sourceApprovals = pendingOnly.length > 0 ? pendingOnly : pendingApprovals;

    for (const item of sourceApprovals) {
      const mod = item.module || 'Approval';
      const ref = item.referenceNumber || item.referenceId || `#${item.id}`;
      let link = '/approvals';
      if (mod === 'Purchase Order') link = `/approvals?module=Purchase+Order&search=${encodeURIComponent(ref)}`;
      else if (mod === 'Purchase Invoice' || mod === 'Accounts Payable') link = `/approvals?module=Purchase+Invoice&search=${encodeURIComponent(ref)}`;
      else if (mod === 'Payment' || mod === 'Payments' || mod === 'Payment Voucher') link = `/payments?search=${encodeURIComponent(ref)}`;
      else if (mod === 'Quotation') link = `/quotations?search=${encodeURIComponent(ref)}`;
      else if (mod === 'RFQ') link = `/approvals?module=RFQ&search=${encodeURIComponent(ref)}`;

      list.push({
        id: `appr-${item.id}`,
        title: `${mod} · ${ref}`,
        subtitle: `${item.requestedBy || 'Requester'} · ${item.title || mod}`,
        badge: item.status || 'PENDING',
        badgeTone: item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'danger' : 'warning',
        helper: item.amount && item.amount !== '—' ? item.amount : mod,
        link,
      });
    }

    if (list.length < 5) {
      const pendingPoItems = purchaseOrders.filter((p: any) =>
        ['PENDING_APPROVAL', 'PENDING', 'RE_REVIEW', 'RETURNED'].includes(String(p.status || '').toUpperCase())
      );
      for (const po of pendingPoItems) {
        if (list.length >= 5) break;
        const poNum = po.poNumber || `PO-${po.id}`;
        list.push({
          id: `po-${po.id || poNum}`,
          title: `Purchase Order · ${poNum}`,
          subtitle: `${po.vendorName || po.vendor?.name || 'Vendor'} · ${po.poDate ? new Date(po.poDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent'}`,
          badge: 'PENDING',
          badgeTone: 'warning',
          helper: po.grandTotal ? formatMoney(po.grandTotal) : 'PO',
          link: `/approvals?module=Purchase+Order&search=${encodeURIComponent(poNum)}`,
        });
      }

      const pendingInvItems = invoices.filter((i: any) =>
        ['PENDING', 'PENDING_APPROVAL', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(i.status || '').toUpperCase())
      );
      for (const inv of pendingInvItems) {
        if (list.length >= 5) break;
        const invNum = inv.invoiceNumber || `INV-${inv.id}`;
        list.push({
          id: `inv-${inv.id || invNum}`,
          title: `Purchase Invoice · ${invNum}`,
          subtitle: `${inv.vendorName || 'Vendor'} · Due: ${inv.dueDate || 'Soon'}`,
          badge: 'PENDING',
          badgeTone: 'warning',
          helper: inv.amount ? formatMoney(inv.amount) : 'Invoice',
          link: `/approvals?module=Purchase+Invoice&search=${encodeURIComponent(invNum)}`,
        });
      }

      const pendingPayItems = payments.filter((p: any) =>
        ['PENDING', 'PROCESSING', 'RETURNED', 'RE_REVIEW', 'PENDING_APPROVAL'].includes(String(p.status || '').toUpperCase())
      );
      for (const pay of pendingPayItems) {
        if (list.length >= 5) break;
        const payNum = pay.paymentNumber || pay.paymentId || `PV-${pay.id}`;
        list.push({
          id: `pay-${pay.id || payNum}`,
          title: `Payment Voucher · ${payNum}`,
          subtitle: `${pay.vendorName || pay.vendor || 'Vendor'} · ${pay.method || 'NEFT'}`,
          badge: 'PENDING',
          badgeTone: 'warning',
          helper: pay.amount ? formatMoney(pay.amount) : 'Voucher',
          link: `/payments?search=${encodeURIComponent(payNum)}`,
        });
      }

      const pendingQuoteItems = quotations.filter((q: any) =>
        ['SUBMITTED', 'UNDER_EVALUATION', 'PENDING'].includes(String(q.status || '').toUpperCase())
      );
      for (const q of pendingQuoteItems) {
        if (list.length >= 5) break;
        const qNum = q.qNo || q.vendorQuotationNumber || `Quote-${q.id}`;
        list.push({
          id: `quote-${q.id || qNum}`,
          title: `Quotation · ${qNum}`,
          subtitle: `${q.vendor?.name || 'Vendor'} · Submitted`,
          badge: 'PENDING',
          badgeTone: 'warning',
          helper: q.totalPrice ? formatMoney(q.totalPrice) : 'Quote',
          link: `/quotations?search=${encodeURIComponent(qNum)}`,
        });
      }

      for (const rfq of recentRfqs) {
        if (list.length >= 5) break;
        list.push({
          id: `rfq-${rfq.id}`,
          title: `RFQ · ${rfq.rfqNumber}`,
          subtitle: `${rfq.title} · ${rfq.creator}`,
          badge: rfq.status || 'PENDING',
          badgeTone: 'warning',
          helper: `${rfq.quotations} quotes`,
          link: `/approvals?module=RFQ&search=${encodeURIComponent(rfq.rfqNumber)}`,
        });
      }
    }

    return list.slice(0, 5);
  }

  if (key === 'pos') {
    return purchaseOrders.slice(0, 5).map((po: any, idx: number) => {
      const poNum = po.poNumber || `PO-${idx + 1}`;
      const vName = po.vendorName || po.vendor?.name || 'Vendor';
      const status = String(po.status || 'DRAFT').toUpperCase();
      const isApproved = status === 'APPROVED' || status === 'SENT_TO_VENDOR' || status === 'RELEASED';
      const isRejected = status === 'REJECTED' || status === 'CANCELLED';
      const formattedDate = po.poDate || po.createdAt
        ? new Date(po.poDate || po.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Recent';

      return {
        id: String(po.id || poNum),
        title: `${poNum} · ${vName}`,
        subtitle: `${po.grandTotal ? formatMoney(po.grandTotal) : ''} · ${formattedDate}`.trim().replace(/^·\s*/, ''),
        badge: status,
        badgeTone: isApproved ? 'success' : isRejected ? 'danger' : 'neutral',
        helper: po.currency || 'Purchase Order',
        link: `/procurement/purchase-orders?search=${encodeURIComponent(po.poNumber || '')}`,
      };
    });
  }

  if (key === 'quotes') {
    return quotations.slice(0, 5).map((q: any, idx: number) => {
      const vName = q.vendor?.name || 'Vendor';
      const qNum = q.qNo || q.vendorQuotationNumber || q.id || `Quote-${idx + 1}`;
      const status = String(q.status || 'SUBMITTED').toUpperCase();
      const isAccepted = status === 'ACCEPTED' || status === 'APPROVED' || status === 'AWARDED';
      const isRejected = status === 'REJECTED';
      const formattedDate = q.submittedAt
        ? new Date(q.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'Recent';

      return {
        id: String(q.id || idx),
        title: `${qNum} · ${vName}`,
        subtitle: `${q.totalPrice ? formatMoney(q.totalPrice) : ''} · ${formattedDate}`.trim().replace(/^·\s*/, ''),
        badge: status,
        badgeTone: isAccepted ? 'success' : isRejected ? 'danger' : 'neutral',
        helper: q.currency || 'Quotation',
        link: `/quotations?search=${encodeURIComponent(vName || qNum)}`,
      };
    });
  }

  if (key === 'lead') {
    return myTasks.tasks.slice(0, 5).map((t: any, idx: number) => ({
      id: String(t.type || idx),
      title: t.label,
      subtitle: `${t.count} item${t.count === 1 ? '' : 's'} requiring review or action`,
      badge: 'Action Required',
      badgeTone: 'warning',
      helper: 'My Tasks',
      link: t.link || '/approvals',
    }));
  }

  if (key === 'vendors') {
    return vendorsList.slice(0, 5).map((v: any) => ({
      id: String(v.id),
      title: v.name,
      subtitle: `${v.category || 'General'} · ${v.contactPerson || v.email || 'Contact'}`,
      badge: v.isActive ? 'Active' : 'Pending',
      badgeTone: v.isActive ? 'success' : 'neutral',
      helper: `${v.totalOrders || 0} orders`,
      link: `/vendors?search=${encodeURIComponent(v.name)}`,
    }));
  }

  // Fallback for rfq: Recent RFQs
  return recentRfqs.slice(0, 5).map((rfq) => ({
    id: String(rfq.id),
    title: `${rfq.rfqNumber} · ${rfq.title}`,
    subtitle: `${rfq.creator} · ${new Date(rfq.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    badge: rfq.status,
    badgeTone: 'neutral',
    helper: `${rfq.quotations} quotes`,
    link: rfq.id ? `/rfq/${rfq.id}` : `/rfq?search=${encodeURIComponent(rfq.rfqNumber)}`,
  }));
}

export default function KpiStatsWidget() {
  const navigate = useNavigate();
  const [selectedKpi, setSelectedKpi] = useState<KpiItem | null>(null);

  const { data: kpis, loading, error } = useServiceData(
    () => dashboardService.getKpis(),
    [] as KpiItem[],
    [],
    { cacheKey: 'dashboard-kpis' }
  );
  const { data: overview } = useServiceData(
    () => dashboardService.getOverview(),
    null as DashboardOverview | null,
    [],
    { cacheKey: 'dashboard-kpi-overview' }
  );
  const { data: pipeline } = useServiceData(
    () => dashboardService.getPipeline(),
    [] as DashboardPipelineItem[],
    [],
    { cacheKey: 'dashboard-kpi-pipeline' }
  );
  const { data: recentRfqs } = useServiceData(
    () => dashboardService.getRecentRfqs(),
    [] as DashboardRecentRfq[],
    [],
    { cacheKey: 'dashboard-kpi-recent-rfqs' }
  );
  const { data: spend } = useServiceData(
    () => dashboardService.getSpendOverview(),
    null as SpendOverview | null,
    [],
    { cacheKey: 'dashboard-kpi-spend' }
  );
  const { data: topVendors } = useServiceData(
    () => dashboardService.getTopVendors(),
    [] as TopVendor[],
    [],
    { cacheKey: 'dashboard-kpi-top-vendors' }
  );
  const { data: purchaseOrders } = useServiceData(
    () => purchaseRequisitionService.list().then((res) => res || []).catch(() => []),
    [],
    [],
    { cacheKey: 'dashboard-kpi-purchase-orders' }
  );
  const { data: quotations } = useServiceData(
    () => quotationService.list(true).then((res) => res || []).catch(() => []),
    [] as Quotation[],
    [],
    { cacheKey: 'dashboard-kpi-quotations' }
  );
  const { data: vendorsList } = useServiceData(
    () => vendorService.list().then((res) => res || []).catch(() => []),
    [] as VendorTableRow[],
    [],
    { cacheKey: 'dashboard-kpi-vendors-list' }
  );

  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const formatMoney = useCallback(
    (n: number) => formatAmount(n, companyDefaultCurrency),
    [formatAmount, companyDefaultCurrency]
  );

  const { data: myTasks } = useServiceData(
    () => dashboardService.getMyTasks(),
    { tasks: [], taskCount: 0 },
    [],
    { cacheKey: 'dashboard-kpi-my-tasks' }
  );
  const { data: pendingApprovals } = useServiceData(
    () => approvalService.listTable().then((res) => res || []).catch(() => []),
    [] as ApprovalTableRow[],
    [],
    { cacheKey: 'dashboard-kpi-approvals-table' }
  );
  const { data: invoices } = useServiceData(
    () => invoiceService.list().then((res) => res || []).catch(() => []),
    [] as APInvoice[],
    [],
    { cacheKey: 'dashboard-kpi-invoices' }
  );
  const { data: payments } = useServiceData(
    () => localDataService.getPayments().then((res) => res || []).catch(() => []),
    [] as any[],
    [],
    { cacheKey: 'dashboard-kpi-payments' }
  );

  const selectedIcon = useMemo(() => {
    if (!selectedKpi) return FileText;
    return KPI_ICONS[selectedKpi.modifier] || KPI_ICONS[selectedKpi.id] || FileText;
  }, [selectedKpi]);

  const summaryRows = useMemo(
    () =>
      selectedKpi
        ? buildSummaryRows(
            selectedKpi,
            overview,
            purchaseOrders,
            quotations,
            vendorsList,
            myTasks,
            pendingApprovals,
            invoices,
            payments
          )
        : [],
    [selectedKpi, overview, purchaseOrders, quotations, vendorsList, myTasks, pendingApprovals, invoices, payments]
  );

  const getKpiResolvedValue = useCallback(
    (kpi: KpiItem) => {
      const key = getKpiKey(kpi);
      if (key === 'approvals') {
        const pendingPOsCount = Math.max(
          pendingApprovals.filter((a) => a.module === 'Purchase Order' && ['PENDING', 'RETURNED'].includes(a.status)).length,
          purchaseOrders.filter((p: any) => ['PENDING_APPROVAL', 'PENDING', 'RE_REVIEW', 'RETURNED'].includes(String(p.status || '').toUpperCase())).length
        );

        const pendingInvoicesCount = Math.max(
          pendingApprovals.filter((a) => (a.module === 'Purchase Invoice' || a.module === 'Accounts Payable') && ['PENDING', 'RETURNED'].includes(a.status)).length,
          invoices.filter((i: any) => ['PENDING', 'PENDING_APPROVAL', 'SUBMITTED', 'UNDER_REVIEW'].includes(String(i.status || '').toUpperCase())).length
        );

        const pendingVouchersCount = Math.max(
          pendingApprovals.filter((a) => ['Payment', 'Payments', 'Payment Voucher'].includes(a.module) && ['PENDING', 'RETURNED'].includes(a.status)).length,
          payments.filter((p: any) => ['PENDING', 'PROCESSING', 'RETURNED', 'RE_REVIEW', 'PENDING_APPROVAL'].includes(String(p.status || '').toUpperCase())).length
        );

        const pendingQuotationsCount = Math.max(
          pendingApprovals.filter((a) => a.module === 'Quotation' && ['PENDING', 'RETURNED'].includes(a.status)).length,
          quotations.filter((q: any) => ['SUBMITTED', 'UNDER_EVALUATION', 'PENDING'].includes(String(q.status || '').toUpperCase())).length
        );

        const pendingRfqsCount = Math.max(
          pendingApprovals.filter((a) => a.module === 'RFQ' && ['PENDING', 'RETURNED'].includes(a.status)).length,
          overview?.rfqs?.pendingApproval ?? 0
        );

        const total = pendingPOsCount + pendingInvoicesCount + pendingVouchersCount + pendingQuotationsCount + pendingRfqsCount;
        return String(total);
      }
      if (key === 'tasks') {
        return String(myTasks.taskCount || kpi.value);
      }
      return kpi.value;
    },
    [pendingApprovals, purchaseOrders, invoices, payments, quotations, overview, myTasks]
  );

  const breakdownRows = useMemo(
    () =>
      selectedKpi
        ? buildBreakdownRows(
            selectedKpi,
            pipeline,
            spend,
            topVendors,
            myTasks,
            purchaseOrders,
            quotations,
            formatMoney,
            pendingApprovals,
            invoices,
            payments,
            overview
          )
        : [],
    [
      selectedKpi,
      pipeline,
      spend,
      topVendors,
      myTasks,
      purchaseOrders,
      quotations,
      formatMoney,
      pendingApprovals,
      invoices,
      payments,
      overview,
    ]
  );

  const activityRows = useMemo(
    () =>
      selectedKpi
        ? getRelatedActivity(
            selectedKpi,
            recentRfqs,
            purchaseOrders,
            quotations,
            vendorsList,
            myTasks,
            formatMoney,
            pendingApprovals,
            invoices,
            payments
          )
        : [],
    [
      selectedKpi,
      recentRfqs,
      purchaseOrders,
      quotations,
      vendorsList,
      myTasks,
      formatMoney,
      pendingApprovals,
      invoices,
      payments,
    ]
  );

  const openKpi = (kpi: KpiItem) => {
    setSelectedKpi(kpi);
  };

  const closeModal = () => setSelectedKpi(null);

  const handleTaskClick = useCallback((link: string) => {
    navigate(link);
    closeModal();
  }, [navigate]);

  if (error) {
    return <MessageStrip type="error">{error}</MessageStrip>;
  }

  if (loading) {
    return <StatsSkeleton count={6} />;
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => {
          const Icon = KPI_ICONS[kpi.modifier] || KPI_ICONS[kpi.id] || FileText;
          const tone = KPI_TONES[getKpiKey(kpi)] || KPI_TONES.rfq;
          return (
            <button
              key={kpi.id}
              type="button"
              className={cn(
                'group flex min-h-[78px] items-center gap-3 rounded-2xl border border-border/80 bg-card px-3.5 py-3 text-left shadow-sm outline-none transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-blue-400/70 hover:shadow-[0_0_0_1px_rgba(59,130,246,0.45),0_0_14px_rgba(59,130,246,0.28)] focus-visible:ring-2 focus-visible:ring-ring'
              )}
              onClick={() => openKpi(kpi)}
              aria-label={`Open ${kpi.label} details`}
            >
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
                <Icon size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-2xl font-semibold leading-none tracking-[-0.035em] tabular-nums text-foreground">{getKpiResolvedValue(kpi)}</span>
                <span className="mt-1 block truncate text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{kpi.label}</span>
                {kpi.trend ? (
                  <span className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${kpi.direction === 'down' ? 'text-rose-600 dark:text-rose-300' : kpi.direction === 'up' ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground'}`}>
                    <TrendIcon direction={kpi.direction} /> {kpi.trend}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selectedKpi} onOpenChange={(open) => !open && closeModal()}>
        {selectedKpi && (
          <DialogContent className="max-h-[min(90vh,860px)] max-w-4xl gap-0 overflow-hidden p-0">
            <div className="border-b border-border bg-muted/35 px-5 py-5 pr-14 sm:px-7">
              <div className="flex items-start gap-4">
                <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${KPI_TONES[getKpiKey(selectedKpi)]?.icon || KPI_TONES.rfq.icon}`}>
                  {(() => { const Icon = selectedIcon; return <Icon size={21} />; })()}
                </div>
                <DialogHeader className="min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">KPI details</span>
                  <DialogTitle className="text-xl">{selectedKpi.label}</DialogTitle>
                  <DialogDescription>{getKpiDescription(selectedKpi)}</DialogDescription>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge tone="primary"><BarChart3 size={11} /> Value {getKpiResolvedValue(selectedKpi)}</Badge>
                    {selectedKpi.trend && <Badge tone={selectedKpi.direction === 'down' ? 'danger' : selectedKpi.direction === 'up' ? 'success' : 'neutral'}><TrendIcon direction={selectedKpi.direction} /> {selectedKpi.trend}</Badge>}
                  </div>
                </DialogHeader>
              </div>
            </div>

            <div className="grid gap-7 overflow-y-auto p-5 sm:p-7">
              {summaryRows.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><BarChart3 size={14} /> Overview</h3>
                  <div className={cn("grid gap-3 sm:grid-cols-2", summaryRows.length >= 4 ? "lg:grid-cols-3 xl:grid-cols-5" : "lg:grid-cols-3")}>
                    {summaryRows.map((row) => {
                      const isClickable = !!row.link;
                      const inner = (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="block text-[12px] font-medium text-muted-foreground">{row.label}</span>
                            {isClickable && <ExternalLink size={13} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />}
                          </div>
                          <span className="mt-1 block text-lg font-semibold tabular-nums text-foreground">{row.value}</span>
                          {row.helper && <span className="mt-1 block text-[12px] leading-4 text-muted-foreground">{row.helper}</span>}
                        </>
                      );

                      if (isClickable) {
                        return (
                          <button
                            key={row.label}
                            type="button"
                            onClick={() => handleTaskClick(row.link!)}
                            className="group rounded-xl border border-border/80 bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-muted/30 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                          >
                            {inner}
                          </button>
                        );
                      }

                      return (
                        <div key={row.label} className="rounded-xl border border-border/80 bg-card p-4">
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {breakdownRows.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><BarChart3 size={14} /> Breakdown</h3>
                  <div className="overflow-hidden rounded-xl border border-border/80">
                    {breakdownRows.slice(0, 6).map((row) => (
                      <button
                        key={`${row.label}-${row.value}`}
                        type="button"
                        disabled={!row.link}
                        onClick={() => row.link && handleTaskClick(row.link)}
                        className="group flex min-h-14 w-full items-center justify-between gap-4 border-b border-border/70 px-4 py-2.5 text-left last:border-b-0 enabled:outline-none enabled:transition-colors enabled:hover:bg-muted/50 enabled:focus-visible:ring-2 enabled:focus-visible:ring-inset enabled:focus-visible:ring-ring disabled:cursor-default cursor-pointer"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors">{row.label}</span>
                          {row.helper && <span className="block truncate text-[12px] text-muted-foreground">{row.helper}</span>}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold tabular-nums text-foreground">{row.value}</span>
                          {row.link && <ChevronRight size={15} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {activityRows.length > 0 && (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"><CalendarDays size={14} /> Recent related activity</h3>
                  <div className="overflow-hidden rounded-xl border border-border/80">
                    {activityRows.slice(0, 5).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => item.link && handleTaskClick(item.link)}
                        className="group flex min-h-16 w-full items-center justify-between gap-4 border-b border-border/70 px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring cursor-pointer"
                      >
                        <div className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-foreground group-hover:text-primary transition-colors">
                            {item.title}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {item.subtitle}
                          </span>
                        </div>
                        <div className="shrink-0 text-right flex items-center gap-3">
                          <div>
                            {item.badge && <Badge tone={item.badgeTone || 'neutral'}>{item.badge}</Badge>}
                            {item.helper && <span className="mt-1 block text-[11px] text-muted-foreground">{item.helper}</span>}
                          </div>
                          <ChevronRight size={15} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
