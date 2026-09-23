import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { RFQStatus } from '../../types';
import type { RFQTableRow } from '../../types/viewModels';
import ColumnCustomizer from '../shared/ColumnCustomizer';
import { MessageStrip } from '../shared/MessageStrip';
import { rfqService } from '../../services/rfqService';
import { approvalService } from '../../services/approvalService';
import { sseClient } from '../../services/sseClient';
import {
  X, CalendarDays, Building2, Tag, Banknote, ClipboardList, Users,
  Package, FileText, Minus, Maximize2, Minimize2, ChevronUp,
  Trophy, Eye, ArrowRightLeft, Shield, ShieldCheck, TrendingUp, CheckCircle2,
  XCircle, Undo2, Clock, ArrowLeft, Send, ChevronRight, PenLine,
} from 'lucide-react';
import { useCurrency, CurrencySelector, CurrencyBadge, DEFAULT_CURRENCY } from '../../components/shared/CurrencyMaster';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ViewPaymentPlanModal from '../vendor/ViewPaymentPlanModal';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { cn } from '../../lib/utils';
import '../../pages/rfq/RFQPage.css';

function getStatusTone(status: RFQStatus): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'DRAFT': return 'neutral';
    case 'PENDING_APPROVAL': return 'warning';
    case 'APPROVED':
    case 'SENT':
    case 'IN_PROGRESS':
    case 'CLOSED': return 'success';
    case 'CANCELLED':
    case 'REJECTED': return 'danger';
    default: return 'neutral';
  }
}


type ModalState = 'open' | 'expanded' | 'minimized';

interface LineItem {
  id: number;
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  expectedDate: string;
}

interface ItemColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  renderHeader?: () => React.ReactNode;
  renderCell: (item: LineItem, idx: number, formatDate: (d: string) => string) => React.ReactNode;
}

interface EvalCategoryScore {
  categoryId: string;
  categoryName: string;
  weightage: number;
  enabled: boolean;
  earned: number;
  maxPossible: number;
  percentage: number;
  weightedScore: number;
  subParameterScores: Array<{ subParameterId: string; subParameterName: string; maxScore: number; score: number }>;
}

interface EvalSupplierResult {
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  categoryScores: EvalCategoryScore[];
  totalWeightedScore: number;
  finalScore: number;
  rank: number;
  isRecommended: boolean;
}

interface EvalData {
  rfq: { id: string; rfqNumber: string; title: string; rfqType: string; status: string };
  categories: Array<{ id: string; name: string; weightage: number; enabled: boolean }>;
  suppliers: EvalSupplierResult[];
  summary: { totalSuppliers: number; recommendedVendor: EvalSupplierResult | null; averageScore: number };
}

const STATUS_LABELS: Record<RFQStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  SENT: 'Approved',
  IN_PROGRESS: 'Accepted',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  REJECTED: 'Rejected',
};

const QUOT_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  SHORTLISTED: 'Shortlisted',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  RETURNED: 'Returned',
};



const PRIORITY_CLASS: Record<string, string> = {
  Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical',
};

const ALL_ITEM_COLUMNS: ItemColumnDef[] = [
  {
    key: 'index', label: '#', defaultVisible: true, required: true,
    width: '48px', align: 'center',
    renderCell: (_item, idx) => <span className="rfq-modal__row-num">{idx + 1}</span>,
  },
  {
    key: 'itemName', label: 'Item Name', defaultVisible: true, required: true,
    width: '180px',
    renderCell: (item) => <span className="rfq-modal__item-name">{item.itemName || '—'}</span>,
  },
  {
    key: 'description', label: 'Description', defaultVisible: true,
    renderCell: (item) => <span className="rfq-modal__item-desc">{item.description || '—'}</span>,
  },
  {
    key: 'quantity', label: 'Qty', defaultVisible: true,
    width: '70px', align: 'right',
    renderCell: (item) => <span className="rfq-modal__item-qty">{item.quantity || '—'}</span>,
  },
  {
    key: 'unit', label: 'Unit', defaultVisible: true,
    width: '72px', align: 'center',
    renderCell: (item) => <span className="rfq-modal__unit-badge">{item.unit}</span>,
  },
  {
    key: 'expectedDate', label: 'Expected Date', defaultVisible: true,
    width: '120px',
    renderCell: (item, _idx, formatDate) => (
      <span className="rfq-modal__item-date">{item.expectedDate ? formatDate(item.expectedDate) : '—'}</span>
    ),
  },
];

const ITEM_COL_WIDTHS: Record<string, string> = {
  index: '48px', itemName: '180px', description: 'auto',
  quantity: '70px', unit: '72px', expectedDate: '120px',
};

// ─── Evaluation Score Colors ───────────────────────────────

const SCORE_GRADE_COLORS = [
  { min: 90, color: '#16a34a', label: 'Excellent' },
  { min: 75, color: '#ca8a04', label: 'Good' },
  { min: 60, color: '#ea580c', label: 'Average' },
  { min: 0, color: '#dc2626', label: 'Poor' },
];

function getScoreGrade(score: number): { color: string; label: string } {
  for (const g of SCORE_GRADE_COLORS) {
    if (score >= g.min) return g;
  }
  return SCORE_GRADE_COLORS[SCORE_GRADE_COLORS.length - 1];
}

const RANK_COLORS = ['#f59e0b', '#9ca3af', '#d97706'];
const VENDOR_BAR_COLORS = ['#0a6ed1', '#16a34a', '#7c3aed', '#ca8a04', '#0891b2', '#ea580c', '#db2777', '#dc2626'];

export interface RFQDetailModalProps {
  rfq: RFQTableRow | null;
  onClose: () => void;
  variant?: 'modal' | 'page';
  loading?: boolean;
  enableSend?: boolean;
  onSend?: () => void | Promise<void>;
  sending?: boolean;
  sendError?: string | null;
  sendSuccess?: string | null;
  onDismissSendSuccess?: () => void;
  onDismissSendError?: () => void;
  /** When set, compare link calls this instead of navigating away */
  onCompareQuotations?: (rfqNumber: string) => void;
}

export default function RFQDetailModal({
  rfq,
  onClose,
  variant = 'modal',
  loading = false,
  enableSend = false,
  onSend,
  sending = false,
  sendError = null,
  sendSuccess = null,
  onDismissSendSuccess,
  onDismissSendError,
  onCompareQuotations,
}: RFQDetailModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'info' | 'items' | 'vendors' | 'quotations' | 'approvals'>('info');
  const [modalState, setModalState] = useState<ModalState>('open');
  const [viewPlanQuotation, setViewPlanQuotation] = useState<{ name: string; milestones: Array<{ id: string; title: string; percentage: number }> } | null>(null);
  const [viewDisplayCurrency, setViewDisplayCurrency] = useState('');
  // ── Evaluation State ──────────────────────────────────────
  const [evalData, setEvalData] = useState<EvalData | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // ── Approval Action State for RFQ Approval Flow ──
  const [pendingApproval, setPendingApproval] = useState<any | null>(null);
  const [approvalActionLoading, setApprovalActionLoading] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [showCommentBox, setShowCommentBox] = useState<'reject' | 'return' | null>(null);
  const [approvalActionSuccess, setApprovalActionSuccess] = useState<string | null>(null);
  const [approvalActionError, setApprovalActionError] = useState<string | null>(null);

  const [approvalChain, setApprovalChain] = useState<{ levels?: any[]; history?: any[]; timeline?: any[]; totalLevels?: number } | null>(null);
  const [approvalChainLoading, setApprovalChainLoading] = useState(false);

  const fetchApprovalChain = useCallback(() => {
    if (!rfq?.id) return;
    setApprovalChainLoading(true);
    approvalService.getChain('RFQ', String(rfq.id))
      .then((res) => {
        if (res) setApprovalChain(res);
      })
      .catch(() => {})
      .finally(() => setApprovalChainLoading(false));
  }, [rfq?.id]);

  useEffect(() => {
    fetchApprovalChain();
  }, [rfq?.id, fetchApprovalChain]);

  // Fetch pending approval for this RFQ when status is PENDING_APPROVAL
  useEffect(() => {
    if (!rfq || rfq.status !== 'PENDING_APPROVAL') {
      setPendingApproval(null);
      return;
    }
    approvalService.listTable({ module: 'RFQ', status: 'PENDING' })
      .then((pendingRows) => {
        const pendingFound = pendingRows.find(
          (r) => String(r.referenceId) === String(rfq.id) || r.referenceNumber === rfq.rfqNumber
        );
        setPendingApproval(pendingFound || null);
      })
      .catch(() => {
        setPendingApproval(null);
      });
  }, [rfq?.id, rfq?.status]);

  const handleApproveRFQ = async () => {
    if (!pendingApproval || !rfq) return;
    const approvalId = pendingApproval.id;
    const comment = approvalComment;
    
    // Instant optimistic update
    setPendingApproval(null);
    rfq.status = 'APPROVED';
    (rfq as any)._isApprovedByMe = true;
    (rfq as any).canUserAct = false;
    setShowCommentBox(null);
    setApprovalComment('');
    setApprovalActionLoading(true);
    setApprovalActionError(null);
    setApprovalActionSuccess('RFQ Level approved successfully!');
    window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));

    try {
      const res = await approvalService.approve(approvalId, comment);
      if (res?.message) setApprovalActionSuccess(res.message);
      if (res?.nextLevel) {
        const rows = await approvalService.listTable({ module: 'RFQ', status: 'PENDING' });
        const found = rows.find((r) => (String(r.referenceId) === String(rfq.id) || r.referenceNumber === rfq.rfqNumber) && r.canAct);
        if (found) setPendingApproval(found);
      }
      fetchApprovalChain();
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
    } catch (err) {
      setApprovalActionError(err instanceof Error ? err.message : 'Failed to approve RFQ');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const handleRejectRFQ = async () => {
    if (!pendingApproval || !rfq) return;
    if (!approvalComment.trim()) {
      setApprovalActionError('Please enter a comment explaining the reason for rejection.');
      return;
    }
    const approvalId = pendingApproval.id;
    const comment = approvalComment;

    // Instant optimistic update
    setPendingApproval(null);
    rfq.status = 'REJECTED';
    (rfq as any)._isRejectedByMe = true;
    (rfq as any).canUserAct = false;
    setShowCommentBox(null);
    setApprovalComment('');
    setApprovalActionLoading(true);
    setApprovalActionError(null);
    setApprovalActionSuccess('RFQ Rejected.');
    window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));

    try {
      const res = await approvalService.reject(approvalId, comment);
      if (res?.message) setApprovalActionSuccess(res.message);
      fetchApprovalChain();
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
    } catch (err) {
      setApprovalActionError(err instanceof Error ? err.message : 'Failed to reject RFQ');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const handleReturnRFQ = async () => {
    if (!pendingApproval || !rfq) return;
    if (!approvalComment.trim()) {
      setApprovalActionError('Please enter a comment explaining the reason for return.');
      return;
    }
    const approvalId = pendingApproval.id;
    const comment = approvalComment;

    // Instant optimistic update
    setPendingApproval(null);
    rfq.status = 'RETURNED';
    (rfq as any)._isReturnedByMe = true;
    (rfq as any).canUserAct = false;
    setShowCommentBox(null);
    setApprovalComment('');
    setApprovalActionLoading(true);
    setApprovalActionError(null);
    setApprovalActionSuccess('RFQ Returned for revision.');
    window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));

    try {
      const res = await approvalService.return(approvalId, comment, 'LEVEL_1');
      if (res?.message) setApprovalActionSuccess(res.message);
      fetchApprovalChain();
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
    } catch (err) {
      setApprovalActionError(err instanceof Error ? err.message : 'Failed to return RFQ');
    } finally {
      setApprovalActionLoading(false);
    }
  };

  const loadEvalData = useCallback(async () => {
    if (!rfq) return;
    setEvalLoading(true);
    setEvalError(null);
    try {
      const isTender = rfq.rfqType === 'TENDER' || rfq.rfqType === 'CUSTOM';

      if (isTender) {
        // Tender RFQ: fetch enterprise evaluation scores
        const data = await rfqService.getEvaluationScores(rfq.id);
        const raw = data as Record<string, unknown>;
        const suppliers: EvalSupplierResult[] = (raw.suppliers as unknown[])?.map((s: unknown) => {
          const sup = s as Record<string, unknown>;
          return {
            vendorId: sup.vendorId as string,
            vendorName: sup.vendorName as string,
            vendorEmail: sup.vendorEmail as string,
            categoryScores: (sup.categoryScores as unknown[])?.map((cs: unknown) => {
              const catScore = cs as Record<string, unknown>;
              return {
                categoryId: catScore.categoryId as string,
                categoryName: catScore.categoryName as string,
                weightage: catScore.weightage as number,
                enabled: catScore.enabled as boolean,
                earned: catScore.earned as number,
                maxPossible: catScore.maxPossible as number,
                percentage: catScore.percentage as number,
                weightedScore: catScore.weightedScore as number,
                subParameterScores: (catScore.subParameterScores as unknown[]) || [],
              } as EvalCategoryScore;
            }) || [],
            totalWeightedScore: sup.totalWeightedScore as number,
            finalScore: sup.finalScore as number,
            rank: sup.rank as number,
            isRecommended: sup.isRecommended as boolean,
          } as EvalSupplierResult;
        }) || [];
        const sortedSuppliers = [...suppliers].sort((a, b) => (a.rank && b.rank ? a.rank - b.rank : b.finalScore - a.finalScore));
        const recommendedVendor = sortedSuppliers.find((s: EvalSupplierResult) => s.isRecommended) || sortedSuppliers[0] || null;
        setEvalData({
          rfq: raw.rfq as EvalData['rfq'],
          categories: (raw.categories as unknown[])?.map((c: unknown) => c as EvalData['categories'][0]) || [],
          suppliers: sortedSuppliers,
          summary: {
            totalSuppliers: (raw.summary as Record<string, unknown>)?.totalSuppliers as number || sortedSuppliers.length,
            recommendedVendor,
            averageScore: (raw.summary as Record<string, unknown>)?.averageScore as number || (sortedSuppliers.length ? Math.round(sortedSuppliers.reduce((a, b) => a + b.finalScore, 0) / sortedSuppliers.length) : 0),
          },
        });
      } else {
        // Standard / Normal RFQ: build evaluation scores from submitted quotations
        const quotations = rfq.quotations || [];
        if (quotations.length > 0) {
          const prices = quotations.map((q) => q.totalPrice).filter((v) => v > 0);
          const leads = quotations.map((q) => q.leadTimeDays).filter((v) => v != null && v > 0) as number[];
          const minPrice = prices.length ? Math.min(...prices) : 0;
          const minLead = leads.length ? Math.min(...leads) : 0;

          const customFieldsList = (rfq as any).customFields || [];
          const parsedCustomFields = (Array.isArray(customFieldsList) ? customFieldsList : []).map((rawCf: any) => {
            if (rawCf?.value && typeof rawCf.value === 'string') {
              try { return { ...rawCf, ...JSON.parse(rawCf.value) }; } catch {}
            }
            return rawCf;
          });

          const scoredSuppliers = quotations.map((q) => {
            const priceScore = minPrice && q.totalPrice > 0 ? Math.round((minPrice / q.totalPrice) * 100) : 80;
            const leadScore = minLead && q.leadTimeDays ? Math.round((minLead / q.leadTimeDays) * 100) : 80;
            const ratingScore = 80;
            const complianceScore = 100;
            const responseScore = 90;

            const categoryScores: EvalCategoryScore[] = [
              {
                categoryId: 'pricing', categoryName: 'Pricing (Commercials)', weightage: 45,
                enabled: true, earned: Math.round((priceScore * 45) / 100), maxPossible: 45,
                percentage: priceScore, weightedScore: (priceScore * 45) / 100, subParameterScores: [],
              },
              {
                categoryId: 'leadTime', categoryName: 'Delivery / Lead Time', weightage: 15,
                enabled: true, earned: Math.round((leadScore * 15) / 100), maxPossible: 15,
                percentage: leadScore, weightedScore: (leadScore * 15) / 100, subParameterScores: [],
              },
              {
                categoryId: 'rating', categoryName: 'Vendor Rating', weightage: 15,
                enabled: true, earned: Math.round((ratingScore * 15) / 100), maxPossible: 15,
                percentage: ratingScore, weightedScore: (ratingScore * 15) / 100, subParameterScores: [],
              },
              {
                categoryId: 'compliance', categoryName: 'Compliance & Documents', weightage: 15,
                enabled: true, earned: Math.round((complianceScore * 15) / 100), maxPossible: 15,
                percentage: complianceScore, weightedScore: (complianceScore * 15) / 100, subParameterScores: [],
              },
              {
                categoryId: 'responseTime', categoryName: 'Response Time', weightage: 10,
                enabled: true, earned: Math.round((responseScore * 10) / 100), maxPossible: 10,
                percentage: responseScore, weightedScore: (responseScore * 10) / 100, subParameterScores: [],
              },
            ];

            const cfValues = (q as any).customFieldValues || {};
            parsedCustomFields.forEach((cf: any) => {
              const fieldName = (cf.fieldName || cf.key || cf.label || cf.name || '').trim();
              if (!fieldName || fieldName.toLowerCase() === 'hghjjgh') return;
              const val = cfValues[`cf_${cf.id}`] ?? cfValues[cf.id] ?? cfValues[fieldName] ?? cfValues[fieldName.toLowerCase()];
              const hasVal = val != null && String(val).trim() !== '' && String(val).trim() !== 'false';
              const weight = Number(cf.weightage) || 10;
              categoryScores.push({
                categoryId: `cf_${cf.id}`,
                categoryName: fieldName,
                weightage: weight,
                enabled: true,
                earned: hasVal ? weight : 0,
                maxPossible: weight,
                percentage: hasVal ? 100 : 0,
                weightedScore: hasVal ? weight : 0,
                subParameterScores: [],
              });
            });

            const totalEarned = categoryScores.reduce((sum, c) => sum + (c.earned || 0), 0);
            const totalMax = categoryScores.reduce((sum, c) => sum + (c.maxPossible || 0), 0);
            const finalScore = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 80;

            return {
              q,
              categoryScores,
              finalScore,
            };
          }).sort((a, b) => b.finalScore - a.finalScore || a.q.totalPrice - b.q.totalPrice);

          const suppliers: EvalSupplierResult[] = scoredSuppliers.map(({ q, categoryScores, finalScore }, idx) => ({
            vendorId: String(q.vendorId),
            vendorName: q.vendorName,
            vendorEmail: q.vendorEmail,
            categoryScores,
            totalWeightedScore: finalScore,
            finalScore,
            rank: idx + 1,
            isRecommended: idx === 0,
          }));

          const totalSuppliers = suppliers.length;
          const averageScore = Math.round(suppliers.reduce((sum, s) => sum + s.finalScore, 0) / totalSuppliers);

          const categories = suppliers[0]?.categoryScores.map(c => ({
            id: c.categoryId,
            name: c.categoryName,
            weightage: c.weightage,
            enabled: c.enabled,
          })) || [];

          setEvalData({
            rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, rfqType: rfq.rfqType, status: rfq.status },
            categories,
            suppliers,
            summary: {
              totalSuppliers,
              recommendedVendor: suppliers[0] || null,
              averageScore,
            },
          });
        } else {
          setEvalData({
            rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, rfqType: rfq.rfqType, status: rfq.status },
            categories: [],
            suppliers: [],
            summary: { totalSuppliers: 0, recommendedVendor: null, averageScore: 0 },
          });
        }
      }
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Failed to load evaluation scores');
    } finally {
      setEvalLoading(false);
    }
  }, [rfq]);

  // Fetch evaluation data when tab switches to vendors or quotations tab
  useEffect(() => {
    if ((activeTab !== 'vendors' && activeTab !== 'quotations') || !rfq || evalData) return;
    loadEvalData();
  }, [activeTab, rfq?.id, rfq?.rfqType, loadEvalData, evalData]);

  // Subscribe to real-time evaluation score updates via SSE
  // When auto-scoring completes (vendor submits quotation), admin sees results instantly
  useEffect(() => {
    if (!rfq) return;
    const handler = (data: unknown) => {
      const payload = data as Record<string, unknown>;
      if (payload.rfqId === rfq.id) {
        loadEvalData();
      }
    };
    const unsub = sseClient.on('evaluation_scores_updated', handler);
    return unsub;
  }, [rfq?.id, loadEvalData]);

  const itemDefaultOrder = ALL_ITEM_COLUMNS.map((c) => c.key);
  const itemDefaultVisible = new Set(ALL_ITEM_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [itemColOrder, setItemColOrder] = useState<string[]>(itemDefaultOrder);
  const [itemVisibleKeys, setItemVisibleKeys] = useState<Set<string>>(itemDefaultVisible);
  const [showItemColPanel, setShowItemColPanel] = useState(false);
  const itemColBtnRef = useRef<HTMLButtonElement>(null);

  const visibleItemColumns = useMemo(
    () => itemColOrder
      .map((k) => ALL_ITEM_COLUMNS.find((c) => c.key === k)!)
      .filter((c) => c && itemVisibleKeys.has(c.key)),
    [itemColOrder, itemVisibleKeys],
  );

  const handleToggleItemColumn = useCallback((key: string) => {
    setItemVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleResetItemColumns = useCallback(() => {
    setItemColOrder(itemDefaultOrder);
    setItemVisibleKeys(new Set(itemDefaultVisible));
  }, [itemDefaultOrder, itemDefaultVisible]);

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const isPage = variant === 'page';
  const isOpen = !!rfq && modalState === 'open';
  const isExpanded = !!rfq && modalState === 'expanded';
  const isMinimized = !isPage && !!rfq && modalState === 'minimized';

  const { formatAmount, convert, companyDefaultCurrency } = useCurrency();
  const activeViewDisplayCurrency = viewDisplayCurrency || companyDefaultCurrency || DEFAULT_CURRENCY;

  const handleCompare = () => {
    if (!rfq) return;
    if (onCompareQuotations) {
      onCompareQuotations(rfq.rfqNumber);
    } else {
      navigate(`/quotations?rfq=${encodeURIComponent(rfq.rfqNumber)}`);
    }
  };

  useBodyScrollLock(!isPage && !!rfq);

  if (!rfq) return null;

  if (isPage) {
    return (
      <div className="w-full flex flex-col gap-6">
        {/* ── 1. RFQ PAGE HEADER ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-border/70 pb-5">
          <div className="flex items-start gap-3 min-w-0">
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              title="Back to RFQs"
              aria-label="Back to RFQs"
              className="shrink-0 mt-0.5 size-9 rounded-lg"
            >
              <ArrowLeft className="size-4" />
            </Button>

            <div className="flex flex-col gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{rfq.rfqNumber}</h1>
                <Badge tone={getStatusTone(rfq.status)}>
                  {STATUS_LABELS[rfq.status] || rfq.status}
                </Badge>
                {rfq.priority && (
                  <Badge tone={rfq.priority === 'Critical' || rfq.priority === 'High' ? 'danger' : rfq.priority === 'Medium' ? 'warning' : 'neutral'}>
                    <Tag className="size-3 mr-1" />
                    {rfq.priority}
                  </Badge>
                )}
                <Badge variant="secondary">
                  {rfq.rfqType === 'TENDER' ? 'Tender' : 'RFQ'}
                </Badge>
                {rfq.department && (
                  <Badge variant="outline">
                    <Building2 className="size-3 mr-1 text-muted-foreground" />
                    {rfq.department}
                  </Badge>
                )}
              </div>
              {rfq.title && (
                <p className="text-sm font-medium text-muted-foreground line-clamp-1">{rfq.title}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 bg-secondary/50 rounded-lg px-2.5 py-1 border border-border/60">
              <ArrowRightLeft className="size-3.5 text-muted-foreground" />
              <CurrencySelector
                value={activeViewDisplayCurrency}
                onChange={setViewDisplayCurrency}
                size="sm"
              />
              {viewDisplayCurrency && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground p-1 transition-colors"
                  onClick={() => setViewDisplayCurrency('')}
                  title="Reset to default currency"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>

            {(rfq.status === 'DRAFT' || rfq.status === 'APPROVED') && onSend && (
              <Button onClick={onSend} loading={sending}>
                <Send className="size-4 mr-1.5" /> Send to Vendors
              </Button>
            )}

            {enableSend && (rfq.status === 'DRAFT' || rfq.status === 'RETURNED' || (rfq.status === 'PENDING_APPROVAL' && String((rfq as any).createdBy || (rfq as any).creatorId || '') === String(user?.id || (user as any)?._id || ''))) && (
              <Button variant="outline" onClick={() => navigate(`/rfq/edit/${rfq.id}`)}>
                <PenLine className="size-4 mr-1.5" /> {rfq.status === 'RETURNED' ? 'Edit & Resubmit RFQ' : rfq.status === 'DRAFT' ? 'Edit Draft' : 'Edit RFQ'}
              </Button>
            )}
          </div>
        </div>

        {/* ── MESSAGES / NOTIFICATIONS ── */}
        {sendSuccess && (
          <MessageStrip type="success" onClose={onDismissSendSuccess} autoHideMs={4000}>
            {sendSuccess}
          </MessageStrip>
        )}
        {sendError && (
          <MessageStrip type="error" onClose={onDismissSendError} autoHideMs={5000}>
            {sendError}
          </MessageStrip>
        )}
        {approvalActionSuccess && (
          <MessageStrip type="success" onClose={() => setApprovalActionSuccess(null)} autoHideMs={4000}>
            {approvalActionSuccess}
          </MessageStrip>
        )}
        {approvalActionError && (
          <MessageStrip type="error" onClose={() => setApprovalActionError(null)} autoHideMs={5000}>
            {approvalActionError}
          </MessageStrip>
        )}

        {/* ── 2. PENDING APPROVAL INTERACTIVE CARD (If PENDING_APPROVAL) ── */}
        {rfq.status === 'PENDING_APPROVAL' && pendingApproval && pendingApproval.canAct && (
          <Card className="p-4 border-amber-500/30 bg-amber-500/[0.04]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-600">
                  <Clock className="size-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Action Required: Internal Approval</h4>
                  <p className="text-xs text-muted-foreground">
                    This RFQ is pending Level {pendingApproval.levelNumber || 1} approval.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCommentBox(showCommentBox === 'return' ? null : 'return')}>
                  <Undo2 className="size-3.5 mr-1" /> Return
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setShowCommentBox(showCommentBox === 'reject' ? null : 'reject')}>
                  <XCircle className="size-3.5 mr-1" /> Reject
                </Button>
                <Button size="sm" loading={approvalActionLoading} onClick={handleApproveRFQ}>
                  <CheckCircle2 className="size-3.5 mr-1" /> Approve
                </Button>
              </div>
            </div>
            {showCommentBox && (
              <div className="mt-3 border-t border-amber-500/20 pt-3">
                <textarea
                  className="w-full rounded-md border border-input bg-card p-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={2}
                  placeholder={showCommentBox === 'reject' ? 'Enter reason for rejection...' : 'Enter reason for returning RFQ...'}
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowCommentBox(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    variant={showCommentBox === 'reject' ? 'destructive' : 'default'}
                    loading={approvalActionLoading}
                    onClick={showCommentBox === 'reject' ? handleRejectRFQ : handleReturnRFQ}
                  >
                    Submit {showCommentBox === 'reject' ? 'Rejection' : 'Return'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── 3. COMPACT RFQ SUMMARY / METADATA CONTAINER ── */}
        <Card className="p-4 sm:p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-muted-foreground/70" />
                Closing Date
              </dt>
              <dd className="text-sm font-semibold text-foreground">
                {formatDate(rfq.closingDate)}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Banknote className="size-3.5 text-muted-foreground/70" />
                Currency
              </dt>
              <dd className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <CurrencyBadge currency={activeViewDisplayCurrency} size="sm" />
                <span>{activeViewDisplayCurrency}</span>
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="size-3.5 text-muted-foreground/70" />
                Created On
              </dt>
              <dd className="text-sm font-semibold text-foreground">
                {formatDate(rfq.createdAt)}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="size-3.5 text-muted-foreground/70" />
                Created By
              </dt>
              <dd className="text-sm font-semibold text-foreground truncate">
                {rfq.creator || '—'}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Package className="size-3.5 text-muted-foreground/70" />
                Total Items
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {rfq.itemCount}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Users className="size-3.5 text-muted-foreground/70" />
                Vendors Invited
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {rfq.vendorCount}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <FileText className="size-3.5 text-muted-foreground/70" />
                Quotations Received
              </dt>
              <dd className="text-sm font-semibold text-foreground tabular-nums">
                {rfq.quotationCount}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Banknote className="size-3.5 text-muted-foreground/70" />
                Total Estimate
              </dt>
              <dd className="text-sm font-semibold text-foreground">
                {rfq.totalEstimate || '—'}
              </dd>
            </div>
          </dl>
        </Card>

        {/* ── 4. INTEGRATED TABS BAR & CONTENT ── */}
        <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border/70 bg-secondary/30 px-3 pt-2 overflow-x-auto scrollbar-none">
            {[
              { key: 'info', label: 'Details', icon: FileText, count: null },
              { key: 'items', label: 'Items', icon: ClipboardList, count: rfq.lineItems.length },
              { key: 'vendors', label: 'Vendors', icon: Users, count: rfq.vendors.length },
              { key: 'quotations', label: 'Quotations', icon: FileText, count: rfq.quotationCount, highlight: rfq.quotationCount > 0 },
              { key: 'approvals', label: 'Approvals', icon: ShieldCheck, count: approvalChain?.totalLevels ?? null },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as any)}
                  className={cn(
                    'flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary bg-card rounded-t-lg'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-t-lg'
                  )}
                >
                  <Icon className="size-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span
                      className={cn(
                        'ml-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : tab.highlight
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── 5. ACTIVE TAB CONTENT SECTION ── */}
          <div className="p-4 sm:p-6">
            {/* Details Tab */}
            {activeTab === 'info' && (
              <div className="flex flex-col gap-6">
                {/* Description & Scope */}
                {rfq.description ? (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <FileText className="size-4 text-primary" />
                      Description & Scope
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed bg-secondary/20 rounded-xl p-4 border border-border/50 whitespace-pre-line">
                      {rfq.description}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic py-4">
                    No additional description provided for this request.
                  </div>
                )}

                {/* Bid Security Section */}
                {rfq.bidSecurityRequired && (
                  <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-secondary/10 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Shield className="size-4 text-primary" />
                      Bid Security Requirements
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Type</span>
                        <strong className="text-sm font-medium text-foreground">Bid Bond</strong>
                      </div>
                      {rfq.bidSecurityValueType === 'FIXED_AMOUNT' && rfq.bidSecurityValue != null && (
                        <div>
                          <span className="text-muted-foreground block">Required Value</span>
                          <strong className="text-sm font-medium text-foreground">
                            {rfq.bidSecurityCurrency || 'KES'} {Number(rfq.bidSecurityValue).toLocaleString('en-IN')}
                          </strong>
                        </div>
                      )}
                      {rfq.bidSecurityValueType === 'PERCENTAGE' && rfq.bidSecurityValue != null && (
                        <div>
                          <span className="text-muted-foreground block">Required Value</span>
                          <strong className="text-sm font-medium text-foreground">
                            {Number(rfq.bidSecurityValue)}% of Bid Value
                          </strong>
                        </div>
                      )}
                      {rfq.bidSecurityValidityValue != null && (
                        <div>
                          <span className="text-muted-foreground block">Required Validity</span>
                          <strong className="text-sm font-medium text-foreground">
                            {rfq.bidSecurityValidityValue} {rfq.bidSecurityValidityUnit === 'DAYS' ? 'Days' : ''}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Items Tab */}
            {activeTab === 'items' && (
              <div className="flex flex-col gap-4">
                <div className="overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border/70 bg-secondary/55 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      <tr>
                        {visibleItemColumns.map((col) => (
                          <th
                            key={col.key}
                            className={cn(
                              'px-4 py-3',
                              col.align === 'right' && 'text-right',
                              col.align === 'center' && 'text-center'
                            )}
                            style={{ width: ITEM_COL_WIDTHS[col.key] || 'auto' }}
                          >
                            {col.renderHeader ? col.renderHeader() : col.label}
                          </th>
                        ))}
                        <th className="w-10 px-2 py-3 text-center">
                          <div className="relative">
                            <button
                              ref={itemColBtnRef}
                              type="button"
                              className="p-1 rounded-md hover:bg-accent text-muted-foreground"
                              onClick={() => setShowItemColPanel((v) => !v)}
                              title="Customize columns"
                            >
                              <span className="flex gap-0.5"><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /></span>
                            </button>
                            {showItemColPanel && (
                              <ColumnCustomizer
                                columnOrder={itemColOrder}
                                visibleKeys={itemVisibleKeys}
                                allColumns={ALL_ITEM_COLUMNS}
                                onToggle={handleToggleItemColumn}
                                onReorder={setItemColOrder}
                                onReset={handleResetItemColumns}
                                onClose={() => setShowItemColPanel(false)}
                                anchorRef={itemColBtnRef}
                              />
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rfq.lineItems.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-accent/30 transition-colors">
                          {visibleItemColumns.map((col) => (
                            <td
                              key={col.key}
                              className={cn(
                                'px-4 py-3.5',
                                col.align === 'right' && 'text-right',
                                col.align === 'center' && 'text-center'
                              )}
                            >
                              {col.renderCell(item, idx, formatDate)}
                            </td>
                          ))}
                          <td />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vendors Tab */}
            {activeTab === 'vendors' && (
              <div className="flex flex-col gap-3">
                {rfq.vendors.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {rfq.vendors.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-border/70 bg-card hover:border-primary/30 transition-colors">
                        <span className={`rfq-modal__vendor-avatar rfq-modal__vendor-avatar--${v.avatarMod}`}>
                          {v.initials}
                        </span>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-semibold text-sm text-foreground truncate">{v.name}</span>
                          <span className="text-xs text-muted-foreground truncate">{v.email}</span>
                        </div>
                        {(v.score ?? evalData?.suppliers.find(s => s.vendorName === v.name)?.finalScore) != null && (
                          <Badge tone={v.score >= 80 ? 'success' : v.score >= 60 ? 'warning' : 'danger'}>
                            Score: {v.score ?? evalData?.suppliers.find(s => s.vendorName === v.name)?.finalScore}%
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border/80 text-muted-foreground">
                    <Users className="size-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">No vendors invited yet.</p>
                  </div>
                )}
              </div>
            )}

            {/* Quotations Tab */}
            {activeTab === 'quotations' && (
              <div className="flex flex-col gap-4">
                {(rfq.quotations?.length ?? 0) > 0 ? (
                  <div className="flex flex-col gap-3">
                    {rfq.quotations?.map((q, rankIdx) => (
                      <div key={q.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border/70 bg-card hover:border-primary/30 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-bold text-foreground">
                            {rankIdx === 0 ? <Trophy className="size-3.5 text-amber-500" /> : `#${rankIdx + 1}`}
                          </span>
                          <div>
                            <div className="font-semibold text-sm text-foreground">{q.vendorName}</div>
                            <div className="text-xs text-muted-foreground">{q.vendorEmail}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-base font-bold text-foreground">
                              {formatAmount(convert(q.totalPrice, q.currency || rfq.currency, activeViewDisplayCurrency), activeViewDisplayCurrency)}
                            </div>
                            <div className="text-xs text-muted-foreground">{q.leadTimeDays ? `${q.leadTimeDays} days lead` : 'Submitted'}</div>
                          </div>
                          <Badge tone={q.status === 'ACCEPTED' ? 'success' : q.status === 'REJECTED' ? 'danger' : 'neutral'}>
                            {QUOT_STATUS_LABELS[q.status] || q.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2">
                      <button type="button" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1" onClick={handleCompare}>
                        Compare all suppliers on Quotations page <ChevronRight className="size-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-border/80 text-muted-foreground">
                    <FileText className="size-8 mb-2 opacity-50" />
                    <p className="text-sm font-medium">No quotations received yet.</p>
                  </div>
                )}
              </div>
            )}

            {/* Approvals Tab */}
            {activeTab === 'approvals' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ShieldCheck className="size-4 text-primary" /> Approval History & Audit Trail
                  </h4>
                  {approvalChain?.totalLevels != null && (
                    <Badge variant="secondary">
                      Level {approvalChain.currentLevel || 1} of {approvalChain.totalLevels}
                    </Badge>
                  )}
                </div>

                {approvalChainLoading ? (
                  <div className="text-xs text-muted-foreground py-6 text-center">Loading approval chain...</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {((approvalChain?.history?.length ?? 0) > 0 ? approvalChain?.history : approvalChain?.levels || []).map((item: any, idx: number) => (
                      <div key={item.id || idx} className="p-3.5 rounded-xl border border-border/70 bg-card flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge tone={item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'danger' : 'warning'}>
                              Level {item.levelNumber} — {item.status}
                            </Badge>
                            <span className="font-semibold text-foreground">{item.requiredRole}</span>
                          </div>
                          <span className="text-muted-foreground">{item.actionAt ? formatDate(item.actionAt) : '—'}</span>
                        </div>
                        <div className="text-muted-foreground">
                          Action By: <strong className="text-foreground">{item.approverName || 'Pending'}</strong>
                        </div>
                        {item.comments && (
                          <div className="mt-1 p-2 rounded bg-secondary/50 italic text-foreground">
                            "{item.comments}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── View Payment Plan Modal ── */}
        {viewPlanQuotation && (
          <ViewPaymentPlanModal
            plan={viewPlanQuotation}
            onClose={() => setViewPlanQuotation(null)}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {!isPage && (isOpen || isExpanded) && (
        <div
          className={`rfq-modal-backdrop ${isExpanded ? 'rfq-modal-backdrop--expanded' : ''}`}
          onClick={onClose}
        />
      )}

      <div
        className={[
          'rfq-modal',
          isPage ? 'rfq-modal--page' : '',
          isPage ? 'rfq-modal--detail-page' : '',
          isOpen ? 'rfq-modal--open' : '',
          isExpanded ? 'rfq-modal--expanded' : '',
          isMinimized ? 'rfq-modal--minimized' : '',
        ].filter(Boolean).join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rfq-modal__drag-handle" />

        <div
          className="rfq-modal__header"
          onClick={isMinimized ? () => setModalState('open') : undefined}
          style={isMinimized ? { cursor: 'pointer' } : undefined}
        >
          <div className="rfq-modal__header-left">
            <div className="rfq-modal__page-heading">
              <span className="rfq-modal__rfq-num">{isPage ? rfq.rfqNumber : rfq.title}</span>
              {isPage && <span className="rfq-modal__page-title">{rfq.title}</span>}
            </div>
            {!isMinimized && (
              <span className={`rfq-badge rfq-badge--${rfq.status}`}>
                <span className="rfq-badge__dot" />
                {STATUS_LABELS[rfq.status] || rfq.status}
              </span>
            )}
            {isMinimized && (
              <span className="rfq-modal__minimized-title">{rfq.title}</span>
            )}
          </div>

          {!isMinimized && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', marginRight: 12 }}>
              <ArrowRightLeft size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <CurrencySelector
                value={activeViewDisplayCurrency}
                onChange={setViewDisplayCurrency}
                size="sm"
              />
              {viewDisplayCurrency && (
                <button
                  type="button"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-placeholder)', padding: 2,
                    display: 'flex', alignItems: 'center',
                    transition: 'color 0.15s',
                  }}
                  onClick={() => setViewDisplayCurrency('')}
                  title="Reset to default currency"
                  onMouseOver={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  onMouseOut={e => { e.currentTarget.style.color = 'var(--text-placeholder)'; }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          <div className="rfq-modal__window-controls" onClick={(e) => e.stopPropagation()}>
            {!isPage && (
              <button
                type="button"
                className="rfq-modal__wc-btn"
                title={isMinimized ? 'Restore' : 'Minimize'}
                onClick={() => setModalState(isMinimized ? 'open' : 'minimized')}
              >
                {isMinimized ? <ChevronUp size={14} /> : <Minus size={14} />}
              </button>
            )}
            {!isPage && !isMinimized && (
              <button
                type="button"
                className="rfq-modal__wc-btn"
                title={isExpanded ? 'Restore' : 'Expand'}
                onClick={() => setModalState(isExpanded ? 'open' : 'expanded')}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            {!isPage && <div className="rfq-modal__wc-divider" />}
            {isPage ? (
              <button type="button" className="rfq-modal__page-back" onClick={onClose}>
                <ArrowLeft size={16} /> Back to RFQs
              </button>
            ) : (
              <button type="button" className="rfq-modal__wc-btn rfq-modal__wc-btn--close" title="Close" onClick={onClose}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {!isMinimized && (
          <>
            <div className="rfq-modal__hero">
              {rfq.description && <p className="rfq-modal__description">{rfq.description}</p>}
              <div className="rfq-modal__hero-chips">
                <span className={`rfq-badge rfq-type-badge rfq-type-badge--${rfq.rfqType === 'TENDER' ? 'TENDER' : 'RFQ'}`}>
                  {rfq.rfqType === 'TENDER' ? 'Tender' : 'RFQ'}
                </span>
                <span className={`rfq-modal__priority rfq-modal__priority--${PRIORITY_CLASS[rfq.priority]}`}>
                  <Tag size={10} /> {rfq.priority}
                </span>
                <span className="rfq-modal__dept-chip">
                  <Building2 size={10} /> {rfq.department || '—'}
                </span>
              </div>
            </div>

            {isPage && (
              <section className="rfq-page__overview" aria-labelledby="rfq-overview-title">
                <div className="rfq-page__section-heading">
                  <div>
                    <h2 id="rfq-overview-title">RFQ Overview</h2>
                    <p>Key information and current RFQ activity at a glance.</p>
                  </div>
                </div>
                <div className="rfq-page__overview-grid">
                  {[
                    { icon: <CalendarDays size={15} />, label: 'Closing Date', value: formatDate(rfq.closingDate) },
                    { icon: <Banknote size={15} />, label: 'Currency', value: activeViewDisplayCurrency },
                    { icon: <CalendarDays size={15} />, label: 'Created On', value: formatDate(rfq.createdAt) },
                    { icon: <Users size={15} />, label: 'Created By', value: rfq.creator },
                    { icon: <Package size={15} />, label: 'Total Items', value: String(rfq.itemCount) },
                    { icon: <Users size={15} />, label: 'Vendors Invited', value: String(rfq.vendorCount) },
                    { icon: <FileText size={15} />, label: 'Quotations Received', value: String(rfq.quotationCount) },
                    { icon: <Banknote size={15} />, label: 'Total Estimate', value: rfq.totalEstimate },
                  ].map((item) => (
                    <div key={item.label} className="rfq-page__overview-card">
                      <span className="rfq-page__overview-icon">{item.icon}</span>
                      <div>
                        <span className="rfq-page__overview-label">{item.label}</span>
                        <strong className="rfq-page__overview-value">{item.value}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="rfq-modal__tabs">
              {(['info', 'items', 'vendors', 'quotations', 'approvals'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`rfq-modal__tab ${activeTab === tab ? 'rfq-modal__tab--active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'info' && <><FileText size={13} /> Details</>}
                  {tab === 'items' && <><ClipboardList size={13} /> Items <span className="rfq-modal__tab-count">{rfq.lineItems.length}</span></>}
                  {tab === 'vendors' && <><Users size={13} /> Vendors <span className="rfq-modal__tab-count">{rfq.vendors.length}</span></>}
                  {tab === 'quotations' && (
                    <>
                      <FileText size={13} /> Quotations
                      <span className={`rfq-modal__tab-count ${rfq.quotationCount > 0 ? 'rfq-modal__tab-count--highlight' : ''}`}>
                        {rfq.quotationCount}
                      </span>
                    </>
                  )}
                  {tab === 'approvals' && (
                    <>
                      <ShieldCheck size={13} /> Approvals
                      {approvalChain?.totalLevels != null && (
                        <span className="rfq-modal__tab-count">
                          {approvalChain.totalLevels}
                        </span>
                      )}
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className="rfq-modal__body">


              {activeTab === 'info' && (
                <div className="rfq-modal__info-panel">
                  {isPage && (
                    <div className="rfq-page__section-heading rfq-page__content-heading">
                      <div>
                        <h2><FileText size={17} /> RFQ Details</h2>
                        <p>Review the request context, commercial requirements, and estimate.</p>
                      </div>
                    </div>
                  )}
                  <div className="rfq-modal__info-grid">
                    {[
                      { icon: <CalendarDays size={13} />, label: 'Closing Date', value: formatDate(rfq.closingDate) },
                      { icon: <Banknote size={13} />, label: 'Currency', value: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{rfq.currency}{activeViewDisplayCurrency !== rfq.currency && <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>Viewing: {activeViewDisplayCurrency}</span>}</span> },
                      { icon: <CalendarDays size={13} />, label: 'Created On', value: formatDate(rfq.createdAt) },
                      { icon: <Users size={13} />, label: 'Created By', value: rfq.creator },
                      { icon: <Package size={13} />, label: 'Total Items', value: String(rfq.itemCount) },
                      { icon: <Users size={13} />, label: 'Vendors Invited', value: String(rfq.vendorCount) },
                      { icon: <FileText size={13} />, label: 'Quotations Received', value: String(rfq.quotationCount) },
                      { icon: <Banknote size={13} />, label: 'Total Estimate', value: rfq.totalEstimate },
                    ].map((item) => (
                      <div key={item.label} className="rfq-modal__info-item">
                        <span className="rfq-modal__info-label">{item.icon} {item.label}</span>
                        <span className="rfq-modal__info-value">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Bid Security Section ── */}
                  {rfq.bidSecurityRequired && (
                    <div className="rfq-modal__info-panel" style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Shield size={16} style={{ color: 'var(--primary-500)' }} />
                        <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>Bid Security Required</strong>
                      </div>
                      <div className="rfq-modal__info-grid" style={{ gap: 8 }}>
                        {rfq.bidSecurityType && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Type</span>
                            <span className="rfq-modal__info-value">Bid Bond</span>
                          </div>
                        )}
                        {rfq.bidSecurityValueType === 'FIXED_AMOUNT' && rfq.bidSecurityValue != null && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Required Value</span>
                            <span className="rfq-modal__info-value">
                              {rfq.bidSecurityCurrency || 'KES'} {Number(rfq.bidSecurityValue).toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                        {rfq.bidSecurityValueType === 'PERCENTAGE' && rfq.bidSecurityValue != null && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Required Value</span>
                            <span className="rfq-modal__info-value">{Number(rfq.bidSecurityValue)}% of Bid Value</span>
                          </div>
                        )}
                        {rfq.bidSecurityValidityValue != null && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Required Validity</span>
                            <span className="rfq-modal__info-value">
                              {rfq.bidSecurityValidityValue} {rfq.bidSecurityValidityUnit === 'DAYS' ? 'Days' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rfq-modal__estimate-bar">
                    <span className="rfq-modal__estimate-label">Total Estimate</span>
                    <span className="rfq-modal__estimate-value">{rfq.totalEstimate}</span>
                  </div>
                </div>
              )}

              {activeTab === 'items' && (
                <div className="rfq-modal__items-panel">
                  <div className="rfq-modal__items-table-wrap">
                    <table className="rfq-modal__items-table">
                      <colgroup>
                        {visibleItemColumns.map((col) => (
                          <col key={col.key} style={{ width: ITEM_COL_WIDTHS[col.key] || 'auto' }} />
                        ))}
                        <col style={{ width: '36px' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          {visibleItemColumns.map((col) => (
                            <th
                              key={col.key}
                              style={{ textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left' }}
                            >
                              {col.renderHeader ? col.renderHeader() : col.label}
                            </th>
                          ))}
                          <th className="rfq-modal__items-th-action">
                            <div className="rfq-table__col-btn-wrap">
                              <button
                                ref={itemColBtnRef}
                                type="button"
                                className={`rfq-table__col-btn ${showItemColPanel ? 'rfq-table__col-btn--active' : ''}`}
                                onClick={() => setShowItemColPanel((v) => !v)}
                                title="Customize columns"
                                aria-label="Customize columns"
                                aria-expanded={showItemColPanel}
                              >
                                <span /><span /><span />
                              </button>
                              {showItemColPanel && (
                                <ColumnCustomizer
                                  columnOrder={itemColOrder}
                                  visibleKeys={itemVisibleKeys}
                                  allColumns={ALL_ITEM_COLUMNS}
                                  onToggle={handleToggleItemColumn}
                                  onReorder={setItemColOrder}
                                  onReset={handleResetItemColumns}
                                  onClose={() => setShowItemColPanel(false)}
                                  anchorRef={itemColBtnRef}
                                />
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rfq.lineItems.map((item, idx) => (
                          <tr key={item.id}>
                            {visibleItemColumns.map((col) => (
                              <td
                                key={col.key}
                                style={{ textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left' }}
                              >
                                {col.renderCell(item, idx, formatDate)}
                              </td>
                            ))}
                            <td />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rfq-modal__items-mobile">
                    {rfq.lineItems.map((item, idx) => (
                      <div key={item.id} className="rfq-modal__item-card">
                        <span className="rfq-modal__row-num">{idx + 1}</span>
                        <div className="rfq-modal__item-card-body">
                          <div className="rfq-modal__item-card-name">{item.itemName || '—'}</div>
                          <div className="rfq-modal__item-card-desc">{item.description || '—'}</div>
                          <div className="rfq-modal__item-card-meta">
                            <span className="rfq-modal__unit-badge">{item.unit}</span>
                            <span className="rfq-modal__item-card-qty">× {item.quantity || '—'}</span>
                            {item.expectedDate && (
                              <span className="rfq-modal__item-card-date">
                                <CalendarDays size={11} /> {formatDate(item.expectedDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'vendors' && (
                <div className="rfq-modal__vendors-panel">
                  {rfq.vendors.length > 0 ? (
                    <div className="rfq-modal__vendors-list">
                      {rfq.vendors.map((v) => (
                        <div key={v.id} className="rfq-modal__vendor-row">
                          <span className={`rfq-modal__vendor-avatar rfq-modal__vendor-avatar--${v.avatarMod}`}>{v.initials}</span>
                          <div className="rfq-modal__vendor-info">
                            <span className="rfq-modal__vendor-name">{v.name}</span>
                            <span className="rfq-modal__vendor-email">{v.email}</span>
                          </div>
                          <span className="rfq-modal__vendor-score" style={{
                            color: v.score >= 80 ? '#16a34a' : v.score >= 60 ? '#ca8a04' : '#dc2626',
                          }}>
                            {(v.score ?? evalData?.suppliers.find(s => s.vendorName === v.name)?.finalScore) ? `${v.score ?? evalData?.suppliers.find(s => s.vendorName === v.name)?.finalScore}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rfq-modal__no-vendors">
                      <Users size={32} />
                      <p>No vendors invited yet.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'quotations' && (
                <div className="rfq-modal__quotations-panel">
                  {(rfq.quotations?.length ?? 0) > 0 ? (
                    <div className="rfq-modal__quotations-list">
                      {(() => {
                        // Sort quotations by score descending for ranking
                        const sortedQuotes = [...(rfq.quotations ?? [])].sort((a, b) => {
                          const scoreA = a.score ?? -1;
                          const scoreB = b.score ?? -1;
                          if (scoreB !== scoreA) return scoreB - scoreA;
                          return a.totalPrice - b.totalPrice; // tie-break by lower price
                        });
                        return sortedQuotes.map((q, rankIdx) => {
                        const initials = q.vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                        const avatarMod = String((q.vendorId % 6) + 1);
                        const isTopScorer = rankIdx === 0 && q.score != null;
                        return (
                          <div key={q.id} className="rfq-modal__quotation-row" style={isTopScorer ? {
                            background: 'rgba(245,158,11,0.04)',
                            border: '1px solid rgba(245,158,11,0.2)',
                            borderRadius: 'var(--radius-md)',
                          } : undefined}>
                            {/* Rank badge */}
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                              fontSize: 12, fontWeight: 800,
                              color: rankIdx === 0 ? '#92400e' : rankIdx === 1 ? '#4b5563' : rankIdx === 2 ? '#92400e' : '#6a6d70',
                              background: rankIdx === 0 ? 'rgba(245,158,11,0.15)' : rankIdx === 1 ? 'rgba(156,163,175,0.15)' : rankIdx === 2 ? 'rgba(217,119,6,0.12)' : 'transparent',
                              border: rankIdx <= 2 ? 'none' : '1px solid var(--border)',
                            }}>
                              {rankIdx === 0 ? <Trophy size={12} style={{ color: '#f59e0b' }} /> : `#${rankIdx + 1}`}
                            </span>
                            <span className={`rfq-modal__vendor-avatar rfq-modal__vendor-avatar--${avatarMod}`}>
                              {initials}
                            </span>
                            <div className="rfq-modal__quotation-info">
                              <span className="rfq-modal__vendor-name">{q.vendorName}</span>
                              <span className="rfq-modal__vendor-email">{q.vendorEmail}</span>
                              <span className="rfq-modal__quotation-meta">
                                Submitted {formatDate(q.submittedAt)}
                                {q.leadTimeDays != null && ` · ${q.leadTimeDays} days lead`}
                                {q.paymentTerms && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                    <span> · {q.paymentTerms}</span>
                                    {q.paymentPlanSnapshot && q.paymentPlanSnapshot.length > 0 && (
                                      <button
                                        type="button"
                                        title="View payment plan"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setViewPlanQuotation({
                                            name: q.paymentTerms || 'Payment Plan',
                                            milestones: q.paymentPlanSnapshot!.map((s, i) => ({
                                              id: `snap_${i}`,
                                              title: s.title,
                                              percentage: s.percentage,
                                            })),
                                          });
                                        }}
                                        style={{
                                          background: 'none', border: 'none',
                                          cursor: 'pointer', color: 'var(--text-secondary)',
                                          padding: 0, display: 'inline-flex',
                                          alignItems: 'center', verticalAlign: 'middle',
                                          transition: 'color 0.15s',
                                          marginLeft: 2,
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.color = 'var(--vendor-primary)'; }}
                                        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                      >
                                        <Eye size={13} />
                                      </button>
                                    )}
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="rfq-modal__quotation-right">
                              {/* Score badge */}
                              {(() => {
                                const scoreVal = (q.score != null && q.score > 0)
                                  ? Math.round(q.score <= 5 ? q.score * 20 : q.score)
                                  : evalData?.suppliers.find(s => s.vendorId === String(q.vendorId) || s.vendorName === q.vendorName)?.finalScore;
                                if (scoreVal == null) return null;
                                const rounded = Math.round(scoreVal);
                                const color = rounded >= 80 ? '#107e3e' : rounded >= 60 ? '#b45309' : '#dc2626';
                                const label = rounded >= 80 ? 'Excellent' : rounded >= 60 ? 'Good' : 'Needs improvement';
                                return (
                                  <span
                                    title={`Score: ${rounded}% — ${label}`}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                      fontSize: 12, fontWeight: 700, cursor: 'help',
                                      color,
                                      background: rounded >= 80 ? 'rgba(16,126,62,0.08)' : rounded >= 60 ? 'rgba(180,83,9,0.08)' : 'rgba(220,38,38,0.08)',
                                      padding: '2px 8px', borderRadius: 4, marginBottom: 4,
                                      border: `1px solid ${rounded >= 80 ? 'rgba(16,126,62,0.2)' : rounded >= 60 ? 'rgba(180,83,9,0.2)' : 'rgba(220,38,38,0.2)'}`,
                                      whiteSpace: 'nowrap',
                                      transition: 'transform 0.15s, box-shadow 0.15s',
                                    }}
                                  >
                                    <TrendingUp size={11} />
                                    Score: {rounded}%
                                  </span>
                                );
                              })()}
                              <span className="rfq-modal__quotation-price">
                                {formatAmount(convert(q.totalPrice, q.currency || rfq.currency, activeViewDisplayCurrency), activeViewDisplayCurrency)}
                                {activeViewDisplayCurrency !== (q.currency || rfq.currency) && (
                                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block' }}>
                                    Original: {formatAmount(q.totalPrice, q.currency || rfq.currency)}
                                  </span>
                                )}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                <CurrencyBadge currency={q.currency || rfq.currency} size="sm" />
                                <span className={`rfq-modal__quotation-status rfq-modal__quotation-status--${q.status.toLowerCase()}`}>
                                  {QUOT_STATUS_LABELS[q.status] || q.status}
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      });
                      })()}
                    </div>
                  ) : (
                    <div className="rfq-modal__no-vendors">
                      <FileText size={32} />
                      <p>No quotations received yet.</p>
                      <p className="rfq-modal__hint-text">Vendors will appear here after they submit from the portal.</p>
                    </div>
                  )}
                  {(rfq.quotations?.length ?? 0) > 0 && (
                    <button type="button" className="rfq-modal__compare-link" onClick={handleCompare}>
                      Compare all suppliers on Quotations page →
                    </button>
                  )}
                </div>
              )}

              {activeTab === 'approvals' && (
                <div className="rfq-modal__approvals-panel" style={{ padding: '4px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                      <ShieldCheck size={18} style={{ color: 'var(--primary-500)' }} />
                      Approval History & Audit Trail
                    </h4>
                    {approvalChain?.totalLevels != null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', background: 'var(--surface-hover)', padding: '4px 10px', borderRadius: 12 }}>
                        Level {approvalChain.currentLevel || 1} of {approvalChain.totalLevels}
                      </span>
                    )}
                  </div>

                  {approvalChainLoading ? (
                    <div style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '24px 0', textAlign: 'center' }}>Loading approval history...</div>
                  ) : (() => {
                    const displayList = (approvalChain?.history && approvalChain.history.length > 0)
                      ? approvalChain.history
                      : (approvalChain?.levels || []);
                    return displayList.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {displayList.map((item: any, idx: number) => {
                          const isApproved = item.status === 'APPROVED';
                          const isRejected = item.status === 'REJECTED';
                          const isReturned = item.status === 'RETURNED';
                          const isPending  = item.status === 'PENDING';

                          const statusColor = isApproved ? '#16a34a' : isRejected ? '#dc2626' : isReturned ? '#d97706' : isPending ? '#eab308' : '#9ca3af';
                          const statusBg    = isApproved ? 'rgba(22, 163, 74, 0.08)' : isRejected ? 'rgba(220, 38, 38, 0.08)' : isReturned ? 'rgba(217, 119, 6, 0.08)' : isPending ? 'rgba(234, 179, 8, 0.08)' : 'rgba(156, 163, 175, 0.08)';
                          const statusBorder = isApproved ? 'rgba(22, 163, 74, 0.2)' : isRejected ? 'rgba(220, 38, 38, 0.2)' : isReturned ? 'rgba(217, 119, 6, 0.2)' : isPending ? 'rgba(234, 179, 8, 0.2)' : 'rgba(156, 163, 175, 0.2)';

                          const statusLabel = item.status === 'NOT_STARTED'
                            ? (item.levelNumber === 1 ? 'Pending Approval' : `Awaiting Level ${item.levelNumber - 1}`)
                            : item.status;
                          const actionByText = item.approverName || (isApproved ? (rfq.creator || 'System') : isPending ? 'Awaiting Approval' : item.levelNumber === 1 ? 'Pending Approval' : `Pending Level ${item.levelNumber - 1}`);

                          return (
                            <div
                              key={item.id || item.levelNumber || idx}
                              style={{
                                padding: '14px 16px',
                                borderRadius: 'var(--radius-md)',
                                background: 'var(--surface-card)',
                                border: `1px solid ${statusBorder}`,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{
                                    fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                                    background: statusBg, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.3px',
                                  }}>
                                    Level {item.levelNumber} — {statusLabel}
                                  </span>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {item.requiredRole}
                                  </span>
                                </div>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                  {item.actionAt ? formatDate(item.actionAt) : item.createdAt ? formatDate(item.createdAt) : '—'}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                                <Users size={13} />
                                <span>Action By: <strong style={{ color: 'var(--text-primary)' }}>{actionByText}</strong></span>
                              </div>

                              {item.comments && (
                                <div style={{
                                  fontSize: 13, color: 'var(--text-primary)', background: 'var(--surface-hover)',
                                  padding: '8px 12px', borderRadius: 4, marginTop: 2, fontStyle: 'italic',
                                }}>
                                  "{item.comments}"
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{
                        fontSize: 14, color: 'var(--text-secondary)', padding: '24px', textAlign: 'center',
                        background: 'var(--surface-card)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)'
                      }}>
                        No approval history recorded yet.
                      </div>
                    );
                  })()}
                </div>
              )}




            </div>

            <div className="rfq-modal__footer">
              {loading && <p className="rfq-modal__hint">Loading RFQ details…</p>}
              {sendSuccess && (
                <MessageStrip type="success" compact className="sap-message-strip--flush" style={{ flex: 1 }} onClose={onDismissSendSuccess} autoHideMs={3000}>
                  {sendSuccess}
                </MessageStrip>
              )}
              {sendError && (
                <MessageStrip type="error" compact className="sap-message-strip--flush" style={{ flex: 1 }} onClose={onDismissSendError} autoHideMs={5000}>
                  {sendError}
                </MessageStrip>
              )}
              <button type="button" className="rfq-modal__btn rfq-modal__btn--secondary" onClick={onClose}>{isPage ? 'Back to RFQs' : 'Close'}</button>
              {enableSend && (rfq.status === 'DRAFT' || rfq.status === 'RETURNED' || (rfq.status === 'PENDING_APPROVAL' && String((rfq as any).createdBy || (rfq as any).creatorId || '') === String(user?.id || (user as any)?._id || ''))) && (
                <button
                  type="button"
                  className="rfq-modal__btn rfq-modal__btn--primary"
                  onClick={() => navigate(`/rfq/edit/${rfq.id}`)}
                >
                  <FileText size={15} /> {rfq.status === 'RETURNED' ? 'Edit & Resubmit RFQ' : rfq.status === 'DRAFT' ? 'Edit Draft' : 'Edit RFQ'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

        {/* ── View Payment Plan Modal ── */}
        {viewPlanQuotation && (
          <ViewPaymentPlanModal
            plan={viewPlanQuotation}
            onClose={() => setViewPlanQuotation(null)}
          />
        )}
    </>
  );
}
