import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { quotationService } from '../../services/quotationService';
import { rfqService, isRfqDeleted } from '../../services/rfqService';
import { sseClient } from '../../services/sseClient';
import { toNumber } from '../../api/normalize';
import { apiRequest } from '../../api/client';
import type { Quotation, QuotationBidSecurity } from '../../types';
import {
  Search, ClipboardList, FileText, Clock, CheckCircle2, XCircle,
  Eye, ThumbsUp, ThumbsDown, ChevronDown, ChevronLeft, ChevronRight,
  TrendingDown, TrendingUp,
  Crown, GitCompareArrows, ArrowDownNarrowWide, X, RotateCcw,
  MessageSquare, AlertTriangle, ArrowRightLeft, Shield, Check, X as XIcon,
  Maximize2, Minimize2, Minus, ChevronUp, BarChart3, Loader2, LayoutGrid, LayoutList,
  Download, FileCheck, ShoppingCart, GitBranch,
} from 'lucide-react';
import { downloadDocument } from '../../utils/download';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import RFQDetailModal from '../../components/rfq/RFQDetailModal';
import ViewPaymentPlanModal from '../../components/vendor/ViewPaymentPlanModal';
import '../../components/shared/ColumnCustomizer.css';
import type { RFQTableRow } from '../../types/viewModels';
import { MessageStrip, type MessageStripType } from '../../components/shared/MessageStrip';
import { CurrencyBadge, CurrencySelector, useCurrency, DEFAULT_CURRENCY } from '../../components/shared/CurrencyMaster';
import VendorComparisonCharts from '../../components/rfq/VendorComparisonCharts';
import PostAwardModal from '../../components/contracts/PostAwardModal';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
import ContractTemplateSelectModal from '../../components/contracts/ContractTemplateSelectModal';

import type { EvalCategory } from '../../types/rfqEvaluation';
import type { RFQEvaluationData } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { isL2OrHigherUser } from '../../utils/rbac';
import { CreatorLevelPromptModal } from '../../components/shared/CreatorLevelPromptModal';
import './QuotationsPage.css';

// ─── Types ────────────────────────────────────────────────────

type QuotStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'SHORTLISTED' | 'RETURNED';

interface QuotationAttachment {
  id: number;
  originalName: string;
  publicUrl: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

interface MockQuotation {
  id: number | string; rfqId: number | string; rfqNumber: string; rfqTitle?: string; vendorName: string; vendorEmail: string;
  vendorInitials: string; avatarMod: string; totalPrice: string;
  totalPriceNum: number; currency?: string; leadTimeDays: number; paymentTerms: string;
  paymentPlanSnapshot?: Array<{ title: string; percentage: number }> | null;
  score: number; status: QuotStatus; submittedAt: string; itemCount: number;
  recommendationScore?: number; isRecommended?: boolean; recommendationReason?: string;
  attachments?: QuotationAttachment[];
  returnReason?: string | null;
  currentLevelRole?: string | null;
  finalLevelRole?: string | null;
  isChainComplete?: boolean;
  rfqApprovalStartPoint?: string;
  rfqCreatedBy?: number | string;
  isFinalApprover?: boolean;
  hasPO?: boolean;
  hasContract?: boolean;
  postAwardDecision?: string;
  // Versioning & Vendor Quotation Number fields
  versionNumber?: number;
  qNo?: string;
  vendorQuotationNumber?: string;
  parentQuotationId?: string;
  isLatestVersion?: boolean;
  versionHistory?: any[];
}

interface QuotColDef {
  key: string;
  label: string;
  required?: boolean;
}

const ALL_QUOT_COLS: QuotColDef[] = [
  { key: 'vendor',       label: 'Vendor',        required: true },
  { key: 'qNo',          label: 'Q.No'         },
  { key: 'totalPrice',   label: 'Total Price'  },
  { key: 'leadTime',     label: 'Lead Time'    },
  { key: 'paymentTerms', label: 'Payment Terms'},
  { key: 'score',        label: 'Score'        },
  { key: 'itemCount',    label: 'Items'        },
  { key: 'status',       label: 'Status'       },
  { key: 'submittedAt',  label: 'Submitted'    },
  { key: 'actions',      label: 'Actions',     required: true },
];

// ─── Listing table columns (main page — approvals-style) ────────

interface ListingRenderCtx {
  formatDate: (d: string) => string;
  formatAmount: (amount: number, currency: string) => string;
  convertPrice: (amount: number, fromCurrency: string) => { converted: number; original: number };
  activeDisplayCurrency: string;
  displayCurrency: string;
  openRfqDetail: (rfqId: number, rfqNumber: string) => void;
  onViewPlan: (plan: { name: string; milestones: Array<{ id: string; title: string; percentage: number }> }) => void;
}

interface ListingColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (q: MockQuotation, ctx: ListingRenderCtx) => React.ReactNode;
}

const ALL_LISTING_COLUMNS: ListingColumnDef[] = [
  {
    key: 'vendor', label: 'Vendor', defaultVisible: true, required: true, width: '220px',
    render: (q) => (
      <div className="quot-listing-table__vendor">
        <span className={`quot-listing-table__avatar quot-listing-table__avatar--${q.avatarMod}`}>{q.vendorInitials}</span>
        <div className="quot-listing-table__vendor-info">
          <span className="quot-listing-table__vendor-name">{q.vendorName}</span>
          <span className="quot-listing-table__vendor-email">{q.vendorEmail}</span>
        </div>
      </div>
    ),
  },
  {
    key: 'version', label: 'Version', defaultVisible: true, width: '90px',
    render: (q) => {
      const displayQ = q.qNo || (q.versionNumber ? `Q${q.versionNumber}` : 'Q1');
      return (
        <span
          className={`quot-compare__qno-pill ${
            q.status === 'RETURNED'
              ? 'quot-compare__qno-pill--returned'
              : q.versionNumber && q.versionNumber > 1
              ? 'quot-compare__qno-pill--latest'
              : 'quot-compare__qno-pill--history'
          }`}
          title={`Quotation Version: ${displayQ}`}
        >
          {displayQ}
        </span>
      );
    },
  },
  {
    key: 'rfq', label: 'RFQ', defaultVisible: true, width: '140px',
    render: (q, ctx) => (
      <button
        type="button"
        className="quot-listing-table__rfq quot-listing-table__rfq--btn"
        onClick={(e) => { e.stopPropagation(); ctx.openRfqDetail(q.rfqId, q.rfqNumber); }}
        title="View RFQ details"
      >
        {q.rfqNumber}
      </button>
    ),
  },
  {
    key: 'totalPrice', label: 'Total Price', defaultVisible: true, width: '130px', align: 'right',
    render: (q, ctx) => {
      const { converted, original } = ctx.convertPrice(q.totalPriceNum, q.currency || DEFAULT_CURRENCY);
      const isConverted = ctx.displayCurrency && ctx.displayCurrency !== (q.currency || DEFAULT_CURRENCY);
      return (
        <span className="quot-listing-table__amount" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
          {ctx.formatAmount(converted, ctx.activeDisplayCurrency || q.currency || DEFAULT_CURRENCY)}
          {isConverted && (
            <span className="quot-compare__converted-hint" title={`Original: ${ctx.formatAmount(original, q.currency || DEFAULT_CURRENCY)}`}>
              ~{ctx.formatAmount(original, q.currency || DEFAULT_CURRENCY)}
            </span>
          )}
        </span>
      );
    },
  },
  {
    key: 'leadTime', label: 'Lead Time', defaultVisible: true, width: '100px',
    render: (q) => <span className="quot-listing-table__text">{q.leadTimeDays} days</span>,
  },
  {
    key: 'paymentTerms', label: 'Payment Terms', defaultVisible: true, width: '160px',
    render: (q) => (
      <span className="quot-listing-table__text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.paymentTerms}</span>
    ),
  },
  {
    key: 'score', label: 'Score', defaultVisible: true, width: '130px', align: 'center',
    render: (q, _ctx) => {
      const rawScore = q.recommendationScore ?? q.score ?? 0;
      const displayScore = Math.min(100, Math.max(0, Math.round(rawScore)));
      const scoreClass = getScoreClass(displayScore);
      return (
        <div className="quot-score" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 90 }}>
          <div className="quot-score__bar" style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-elevated)', overflow: 'hidden' }}>
            <div className={`quot-score__fill quot-score__fill--${scoreClass}`} style={{ width: `${displayScore}%`, height: '100%', borderRadius: 3 }} />
          </div>
          <span className="quot-score__value" style={{ fontWeight: 600, fontSize: 14, minWidth: 32, textAlign: 'right' }}>{displayScore}%</span>
        </div>
      );
    },
  },
  {
    key: 'itemCount', label: 'Items', defaultVisible: true, width: '70px', align: 'center',
    render: (q) => <span className="quot-listing-table__text">{q.itemCount}</span>,
  },
  {
    key: 'status', label: 'Status', defaultVisible: true, width: '130px',
    render: (q) => (
      <div className="quot-listing-table__status-cell">
        {q.returnReason && getDisplayStatus(q) !== 'ACCEPTED' && getDisplayStatus(q) !== 'REJECTED' && (
          <span className="quot-listing-table__return-chip" title={q.returnReason}>
            <RotateCcw size={10} /> Returned
          </span>
        )}
        <span className={`quot-badge quot-badge--${getDisplayStatus(q)}`}>{STATUS_LABELS[getDisplayStatus(q)]}</span>
      </div>
    ),
  },
  {
    key: 'submittedAt', label: 'Submitted', defaultVisible: true, width: '110px',
    render: (q, ctx) => <span className="quot-listing-table__date">{ctx.formatDate(q.submittedAt)}</span>,
  },
  {
    key: 'currency', label: 'Currency', defaultVisible: false, width: '90px',
    render: (q) => q.currency ? <CurrencyBadge currency={q.currency} size="sm" /> : <span className="quot-listing-table__text">—</span>,
  },
  {
    key: 'returnReason', label: 'Return Reason', defaultVisible: false, width: '160px',
    render: (q) => (
      <span className="quot-listing-table__text quot-listing-table__text--truncate" title={q.returnReason || ''}>
        {q.returnReason || '—'}
      </span>
    ),
  },
];

/** Sum totalPrice for selected line items only (saved selection or all items if none saved). */
function computeSelectedTotalPrice(q: Quotation): number {
  const items = q.items || [];
  if (items.length === 0) return toNumber(q.totalPrice);

  const selectedItemIds = q.selectedItemIds;
  const selectedIds = new Set(
    selectedItemIds && selectedItemIds.length > 0
      ? selectedItemIds
      : items.map((i) => i.id),
  );

  return items
    .filter((i) => selectedIds.has(i.id))
    .reduce((sum, i) => sum + toNumber(i.totalPrice), 0);
}

function mapQuotationToRow(q: Quotation): MockQuotation {
  const vendor = q.vendor;
  const name = vendor?.name || 'Unknown';
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const rfqObj = (q as Quotation & { rfq?: { rfqNumber?: string; title?: string } }).rfq;
  const rfqNumber = rfqObj?.rfqNumber || (q as any).rfqNumber || `RFQ-${q.rfqId}`;
  const rfqTitle = rfqObj?.title || rfqNumber;
  const rawScore = q.score ?? 0;
  const score = rawScore <= 5 ? Math.round(rawScore * 20) : Math.round(rawScore);
  const price = computeSelectedTotalPrice(q);
  const vNum = (q as any).versionNumber || (q as any).version_number || (q as any).version || undefined;
  const qNumber = (vNum && vNum > 1) ? `Q${vNum}` : ((q as any).qNo || (q as any).quotationNumber || (vNum ? `Q${vNum}` : undefined));
  return {
    id: q.id,
    rfqId: q.rfqId,
    rfqNumber,
    rfqTitle,
    rfqApprovalStartPoint: (rfqObj as any)?.rfqApprovalStartPoint || (q as any).rfqApprovalStartPoint || null,
    quotationApprovalMode: (rfqObj as any)?.quotationApprovalMode || (q as any).quotationApprovalMode || null,
    quotationXUserRole: (rfqObj as any)?.quotationXUserRole || (q as any).quotationXUserRole || null,
    currentLevelRole: (q as any).currentLevelRole || null,
    finalLevelRole: (q as any).finalLevelRole || null,
    rfqCreatedBy: (rfqObj as any)?.createdBy || (q as any).rfqCreatedBy || (q as any).createdBy || null,
    vendorId: q.vendorId || vendor?.id || (q as any).vendor_id,
    vendorName: name,
    vendorEmail: vendor?.email || '',
    vendorInitials: initials,
    avatarMod: String((q.vendorId % 6) + 1),
    totalPrice: price.toLocaleString('en-IN'),
    totalPriceNum: price,
    currency: q.currency,
    leadTimeDays: q.leadTimeDays ?? 0,
    paymentTerms: q.paymentTerms || '—',
    paymentPlanSnapshot: (q as any).paymentPlanSnapshot || null,
    customFieldValues: (q as any).customFieldValues || (q as any).custom_field_values || {},
    score,
    status: ((q.status === 'APPROVED' ? 'ACCEPTED' : q.status) as QuotStatus) || 'SUBMITTED',
    submittedAt: String(q.submittedAt).slice(0, 10),
    itemCount: q.items?.length ?? 0,
    attachments: (q as Quotation & { attachments?: QuotationAttachment[] }).attachments,
    returnReason: (q as Quotation & { returnComment?: string | null }).returnComment || null,
    userAction: (q as any).userAction || null,
    isFinalApprover: typeof (q as any).isFinalApprover === 'boolean'
      ? (q as any).isFinalApprover
      : (((rfqObj as any)?.quotationApprovalMode || (q as any).quotationApprovalMode) !== 'FULL_CHAIN'),
    isChainComplete: typeof (q as any).isChainComplete === 'boolean'
      ? (q as any).isChainComplete
      : (((rfqObj as any)?.quotationApprovalMode || (q as any).quotationApprovalMode) !== 'FULL_CHAIN' || q.status === 'ACCEPTED' || q.status === 'APPROVED'),
    hasPO: Boolean((q as any).hasPO),
    hasContract: Boolean((q as any).hasContract),
    postAwardDecision: (q as any).postAwardDecision || (rfqObj as any)?.postAwardDecision || null,
    qNo: qNumber,
    versionNumber: vNum,
    vendorQuotationNumber: (q as any).vendorQuotationNumber || (q as any).quotationNumber || (q as any).vendorQuoteNumber,
    versionHistory: (q as any).versionHistory || (q as any).version_history || [],
  };
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review',
  APPROVED_L1: 'Approved', ACCEPTED: 'Accepted', REJECTED: 'Rejected',
  SHORTLISTED: 'Shortlisted', RETURNED: 'Returned',
};

function getScoreClass(s: number) { return s >= 80 ? 'high' : s >= 60 ? 'mid' : 'low'; }

function checkIsDirectXMode(q: any): boolean {
  if (!q) return false;
  const quotMode = q.quotationApprovalMode || q.rfq?.quotationApprovalMode;

  // If Quotation Approval Mode is FULL_CHAIN, it is always multi-level chain mode
  if (quotMode === 'FULL_CHAIN') return false;

  // If Quotation Approval Mode is DIRECT_X_ONLY
  if (quotMode === 'DIRECT_X_ONLY') return true;

  const rfqStart = q.rfqApprovalStartPoint || q.rfq?.rfqApprovalStartPoint;
  if (rfqStart === 'MULTILEVEL') return false;
  if (rfqStart === 'ORIGINATOR') return true;

  // Default to false (multi-level mode) so unknown/missing mode doesn't bypass approvals
  return false;
}

/**
 * Returns the status to DISPLAY for the current user.
 * Instantly reflects user actions (Accept/Reject/Return) on the comparison tab and table.
 */
function getDisplayStatus(q: MockQuotation): QuotStatus {
  if (q.status === 'ACCEPTED') return 'ACCEPTED';
  if (q.status === 'REJECTED') return 'REJECTED';
  if (q.status === 'RETURNED') return 'RETURNED';
  if (q.status === 'UNDER_REVIEW' && q.userAction === 'APPROVED_L1') return 'APPROVED_L1' as any;
  if (q.userAction === 'APPROVED' && (q.isChainComplete ?? true)) return 'ACCEPTED';
  if (q.userAction === 'APPROVED' && q.isChainComplete === false) return 'APPROVED_L1' as any;
  if (q.userAction === 'REJECTED') return 'REJECTED';
  if (q.userAction === 'RETURNED') return 'RETURNED';
  return q.status;
}

function computeStandardVendorScores(group: MockQuotation[], q: MockQuotation, customFields: any[] = [], fullQuot: any = null) {
  const prices = group.map((item) => item.totalPriceNum).filter((v) => v > 0);
  const leads = group.map((item) => item.leadTimeDays).filter((v) => v > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const minLead = leads.length ? Math.min(...leads) : 0;

  const priceScore = minPrice && q.totalPriceNum > 0 ? Math.round((minPrice / q.totalPriceNum) * 100) : 80;
  const leadScore = minLead && q.leadTimeDays > 0 ? Math.round((minLead / q.leadTimeDays) * 100) : 80;
  const ratingScore = 80;
  const complianceScore = 100;
  const responseScore = 90;

  const categoryScores: any[] = [
    { categoryName: 'Pricing (Commercials)', weightage: 45, earned: Math.round((priceScore * 45) / 100), maxPossible: 45 },
    { categoryName: 'Delivery / Lead Time', weightage: 15, earned: Math.round((leadScore * 15) / 100), maxPossible: 15 },
    { categoryName: 'Vendor Rating', weightage: 15, earned: Math.round((ratingScore * 15) / 100), maxPossible: 15 },
    { categoryName: 'Compliance & Documents', weightage: 15, earned: Math.round((complianceScore * 15) / 100), maxPossible: 15 },
    { categoryName: 'Response Time', weightage: 10, earned: Math.round((responseScore * 10) / 100), maxPossible: 10 },
  ];

  const cfValues = (fullQuot as any)?.customFieldValues || (q as any)?.customFieldValues || {};
  const cFields = customFields.length > 0 ? customFields : (q as any)?.rfq?.customFields || [];
  if (Array.isArray(cFields) && cFields.length > 0) {
    cFields.forEach((rawCf: any) => {
      let cf = rawCf;
      if (rawCf?.value && typeof rawCf.value === 'string') {
        try { cf = { ...rawCf, ...JSON.parse(rawCf.value) }; } catch {}
      }
      const fieldName = (cf.fieldName || cf.key || cf.label || cf.name || '').trim();
      if (!fieldName || fieldName.toLowerCase() === 'hghjjgh') return;
      const val = cfValues[`cf_${cf.id}`] ?? cfValues[cf.id] ?? cfValues[fieldName] ?? cfValues[fieldName.toLowerCase()];
      const hasVal = val != null && String(val).trim() !== '' && String(val).trim() !== 'false';
      const weight = Number(cf.weightage) || 10;
      categoryScores.push({
        categoryName: fieldName,
        weightage: weight,
        earned: hasVal ? weight : 0,
        maxPossible: weight,
      });
    });
  }

  const totalEarnedPoints = categoryScores.reduce((acc, c) => acc + (c.earned || 0), 0);
  const totalMaxPoints = categoryScores.reduce((acc, c) => acc + (c.maxPossible || 0), 0);
  const calculatedScore = totalMaxPoints > 0
    ? Math.round((totalEarnedPoints / totalMaxPoints) * 100)
    : Math.round(priceScore * 0.45 + leadScore * 0.15 + complianceScore * 0.15 + ratingScore * 0.15 + responseScore * 0.10);

  const finalScore = calculatedScore;

  return {
    priceScore,
    leadScore,
    ratingScore,
    complianceScore,
    responseScore,
    calculatedScore,
    finalScore,
  };
}

function scoreQuotationGroup(group: MockQuotation[], customFields: any[] = []): MockQuotation[] {
  if (!group.length) return group;

  const scored = group.map((q) => {
    const { finalScore } = computeStandardVendorScores(group, q, customFields, q);
    const recommendationScore = finalScore;
    const effectiveScore = finalScore;

    const prices = group.map((item) => item.totalPriceNum).filter((v) => v > 0);
    const leads = group.map((item) => item.leadTimeDays).filter((v) => v > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const minLead = leads.length ? Math.min(...leads) : 0;

    const reasons: string[] = [];
    if (finalScore >= 80) reasons.push('strong evaluation score');
    if (q.totalPriceNum === minPrice && minPrice > 0) reasons.push('lowest price');
    if (q.leadTimeDays === minLead && minLead > 0) reasons.push('fastest lead time');
    if (!reasons.length) reasons.push('balanced price and delivery');

    return {
      ...q,
      score: effectiveScore,
      recommendationScore,
      recommendationReason: reasons.join(', '),
    };
  }).sort((a, b) =>
    (b.recommendationScore || 0) - (a.recommendationScore || 0)
    || a.totalPriceNum - b.totalPriceNum
    || a.leadTimeDays - b.leadTimeDays
  );

  return scored.map((q, index) => ({ ...q, isRecommended: index === 0 && scored.length > 1 }));
}

// ─── Action Modal Types ───────────────────────────────────────

type ModalType = 'view' | 'accept' | 'reject' | 'return' | null;

interface ActiveModal {
  type: ModalType;
  quotation: MockQuotation;
}

// ═══════════════════════════════════════════════════════════════
// Enhanced View Modal — 4 Sections (Vendor Details / Items / Docs / Evaluation)
// ═══════════════════════════════════════════════════════════════

type ViewTab = 'vendor' | 'paymentTerms' | 'authorization' | 'items' | 'documents' | 'evaluation' | 'history';
type EvalTabState = {
  loading: boolean;
  error: string | null;
  data: {
    finalScore: number;
    rank: number;
    isRecommended: boolean;
    totalWeightedScore: number;
    categoryScores: Array<{
      categoryName: string;
      weightage: number;
      earned: number;
      maxPossible: number;
      percentage: number;
      weightedScore: number;
      subParameterScores: Array<{ subParameterName: string; maxScore: number; score: number }>;
    }>;
  } | null;
};
type ModalViewState = 'open' | 'expanded' | 'minimized';

function ViewQuotationModal({
  quotation: q,
  onClose,
  onSelectionSaved,
  allQuotations = [],
}: {
  quotation: MockQuotation;
  onClose: () => void;
  onSelectionSaved?: () => void;
  allQuotations?: MockQuotation[];
}) {
  const [modalViewState, setModalViewState] = useState<ModalViewState>('open');
  const isOpen = modalViewState === 'open';
  const isExpanded = modalViewState === 'expanded';
  const isMinimized = modalViewState === 'minimized';

  const [activeTab, setActiveTab] = useState<ViewTab>('vendor');
  const [fullQuot, setFullQuot] = useState<any>(null);
  const [evalTabState, setEvalTabState] = useState<EvalTabState>({ loading: false, error: null, data: null });
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [savingSelection, setSavingSelection] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [bidSecurityDoc, setBidSecurityDoc] = useState<QuotationBidSecurity | null>(null);
  const [bidSecurityLoading, setBidSecurityLoading] = useState(false);
  const { formatAmount, convert, companyDefaultCurrency } = useCurrency();
  const [viewDisplayCurrency, setViewDisplayCurrency] = useState<string>('');
  const activeViewDisplayCurrency = viewDisplayCurrency || companyDefaultCurrency || DEFAULT_CURRENCY;

  // Fetch full quotation data including items and RFQ details
  useEffect(() => {
    const fetchData = async () => {
      const qItems = (q as any).items || [];
      if (Array.isArray(qItems) && qItems.length > 0) {
        setSelectedItems(new Set(qItems.map((i: any) => i.id || i.rfqItemId || String(i.itemName))));
      }
      try {
        const numId = typeof q.id === 'number' ? q.id : parseInt(String(q.id).replace(/\D/g, ''), 10);
        if (!isNaN(numId) && numId > 0 && !String(q.id).includes('-v')) {
          const data = await quotationService.getById(numId);
          if (data) {
            setFullQuot(data);
            const prevSelected: string[] = (data as any).selectedItemIds || [];
            if (prevSelected.length > 0) {
              setSelectedItems(new Set(prevSelected));
            } else if (data.items && data.items.length > 0) {
              setSelectedItems(new Set(data.items.map((i: any) => i.id)));
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch quotation details:', err);
      }
    };
    fetchData();
  }, [q.id]);

  // Build a map of rfqItemId → item name from the RFQ data
  const itemNameMap = useMemo(() => {
    const map = new Map<number, { name: string; qty: number; unit: string }>();
    if (fullQuot?.rfq?.items) {
      fullQuot.rfq.items.forEach((item: any) => {
        map.set(item.id, { name: item.itemName, qty: item.quantity, unit: item.unit || '—' });
      });
    }
    return map;
  }, [fullQuot]);

  // Toggle item selection
  const toggleItem = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
    setSaveMsg(null);
  }, []);

  // Save selection to backend
  const saveSelection = useCallback(async () => {
    setSavingSelection(true);
    setSaveMsg(null);
    try {
      await quotationService.updateSelectedItems(q.id, Array.from(selectedItems));
      setSaveMsg('Selection saved successfully!');
      onSelectionSaved?.();
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (err) {
      setSaveMsg('Failed to save selection. Please try again.');
      console.error('Failed to save selected items:', err);
    } finally {
      setSavingSelection(false);
    }
  }, [q.id, selectedItems, onSelectionSaved]);

  const vendor = fullQuot?.vendor || { name: q.vendorName, email: q.vendorEmail };
  const rfq = fullQuot?.rfq || { rfqNumber: q.rfqNumber, title: '', description: '', priority: '', department: '' };
  const items = fullQuot?.items || (q as any).items || [];
  const attachments = fullQuot?.attachments || q.attachments || [];
  const defCur = q.currency || DEFAULT_CURRENCY;
  // Only convert when user explicitly selected a display currency (not when falling back to company default)
  const isConverting = viewDisplayCurrency !== '' && viewDisplayCurrency !== defCur;
  const displayCur = isConverting ? viewDisplayCurrency : defCur;

  const selectedTotal = useMemo(() => {
    if (items.length > 0 && selectedItems.size > 0) {
      const sum = items
        .filter((i: { id: string }) => selectedItems.has(i.id))
        .reduce((sum: number, i: { totalPrice: number }) => sum + Number(i.totalPrice || 0), 0);
      if (sum > 0) return sum;
    }
    const rawPrice = q.totalPriceNum ?? q.totalPrice ?? 0;
    return typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0);
  }, [items, selectedItems, q.totalPriceNum, q.totalPrice]);
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  function getCustomFieldValue(cf: any, cfValues: Record<string, any>, fullQuot: any): any {
    if (!cf) return undefined;
    const combined: Record<string, any> = {
      ...(fullQuot || {}),
      ...(fullQuot?.customFieldValues || {}),
      ...(fullQuot?.evalParamValues || {}),
      ...(fullQuot?.evaluationParamValues || {}),
      ...(cfValues || {}),
    };

    const idStr = cf.id ? String(cf.id) : '';
    const keyStr = cf.key ? String(cf.key) : '';
    const fieldNameStr = cf.fieldName ? String(cf.fieldName) : '';
    const nameStr = cf.name ? String(cf.name) : '';
    const labelStr = cf.label ? String(cf.label) : '';

    const keysToTry = [
      idStr,
      keyStr,
      fieldNameStr,
      nameStr,
      labelStr,
      `custom_${idStr}`,
      `eval_${idStr}`,
      `param_${idStr}`,
      `cf_${idStr}`,
    ].filter(Boolean);

    for (const k of keysToTry) {
      if (combined[k] !== undefined && combined[k] !== null && String(combined[k]).trim() !== '') {
        return combined[k];
      }
    }

    // Case-insensitive lookup on keys
    const targetNames = [fieldNameStr, nameStr, labelStr, keyStr].filter(Boolean).map(s => s.toLowerCase().trim());
    for (const [k, v] of Object.entries(combined)) {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        const lowerK = k.toLowerCase().trim();
        if (targetNames.includes(lowerK) || targetNames.some(t => lowerK.includes(t) || t.includes(lowerK))) {
          return v;
        }
      }
    }

    // Fallback: If quotation is submitted by vendor, custom parameters are provided
    if (fullQuot && (fullQuot.status === 'SUBMITTED' || fullQuot.status === 'ACCEPTED' || Number(fullQuot.totalPriceNum || fullQuot.totalPrice || 0) > 0)) {
      return 'Provided';
    }

    return undefined;
  }

  // Regular attachments only (bid security/bond documents shown separately in Authorization tab)
  // Filter out any attachment matching the bid security doc to prevent duplicates
  const combinedDocs = useMemo(() => {
    if (!bidSecurityDoc) return [...attachments];
    return attachments.filter(
      (a: any) =>
        a.publicUrl !== bidSecurityDoc.publicUrl &&
        a.originalName !== bidSecurityDoc.originalName
    );
  }, [attachments, bidSecurityDoc]);

  // Reset evalTabState when a different quotation is opened
  useEffect(() => {
    setEvalTabState({ loading: false, error: null, data: null });
  }, [q.id]);

  // Fetch evaluation data when evaluation tab is active
  useEffect(() => {
    if (activeTab !== 'evaluation' || evalTabState.data || evalTabState.loading) return;
    // Wait for fullQuot to load first so we can read the correct rfqType
    if (!fullQuot && !q) return;
    const fetchEval = async () => {
      setEvalTabState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const targetRfqId = fullQuot?.rfqId || fullQuot?.rfq?.id || q.rfqId;
        const rfqId = targetRfqId ? String(targetRfqId) : '';

        const competingGroup = (allQuotations || []).filter(
          item => String(item.rfqId || (item as any).rfq?.id) === String(targetRfqId) || item.rfqNumber === q.rfqNumber
        );
        const groupForScoring = competingGroup.some(item => item.id === q.id)
          ? competingGroup
          : [...competingGroup, q];
        const cfValues = (fullQuot as any)?.customFieldValues || (q as any)?.customFieldValues || {};

        // Determine RFQ details
        let rfqData = fullQuot?.rfq;
        // Re-fetch RFQ details only if rfqType is missing from the embedded rfq data
        if (rfqId && (!rfqData || !rfqData.rfqType)) {
          try {
            const rfqDetails = await rfqService.getById(rfqId);
            if (rfqDetails) rfqData = rfqDetails as any;
          } catch (e) {
            console.warn('Failed to fetch RFQ by ID in ViewQuotationModal:', e);
          }
        }

        const rfqType = rfqData?.rfqType || 'RFQ';
        const evalCats = rfqData?.evaluationCategories || [];
        // isTender is determined ONLY by rfqType — not by presence of evaluationCategories
        const isTender = rfqType === 'TENDER' || rfqType === 'CUSTOM';

        // Attempt backend API evaluation scores fetch for current (latest) version RFQs
        let vendorData: any = null;
        if (rfqId && (q.isLatestVersion ?? true)) {
          try {
            const data = (await rfqService.getEvaluationScores(rfqId)) as any;
            if (data?.suppliers && Array.isArray(data.suppliers)) {
              const vendorId = fullQuot?.vendorId || fullQuot?.vendor?.id || q.vendorId;
              vendorData = data.suppliers.find(
                (s: any) =>
                  (vendorId && String(s.vendorId) === String(vendorId)) ||
                  (s.vendorName && q.vendorName && s.vendorName.toLowerCase() === q.vendorName.toLowerCase()) ||
                  (s.vendorEmail && q.vendorEmail && s.vendorEmail.toLowerCase() === q.vendorEmail.toLowerCase())
              );
            }
          } catch (e) {
            console.warn('getEvaluationScores API failed, using client evaluation builder:', e);
          }
        }

        if (vendorData) {
          // Compute price and lead time scores for the target quotation (q / fullQuot) relative to competing group
          const prices = groupForScoring.map(item => item.totalPriceNum || (parseFloat(String(item.totalPrice).replace(/[^0-9.]/g, '')) || 0)).filter(v => v > 0);
          const leads = groupForScoring.map(item => item.leadTimeDays).filter(v => v > 0);
          const minPrice = prices.length ? Math.min(...prices) : 0;
          const minLead = leads.length ? Math.min(...leads) : 0;

          const rawQPrice = (q as any).totalPriceNum ?? (q as any).totalPrice;
          let targetPrice = rawQPrice != null && rawQPrice > 0
            ? (typeof rawQPrice === 'number' ? rawQPrice : (parseFloat(String(rawQPrice).replace(/[^0-9.]/g, '')) || 0))
            : Number(fullQuot?.totalPriceNum || fullQuot?.totalPrice || 0);
          if (targetPrice <= 0 && !(q.isLatestVersion ?? true)) {
            targetPrice = Math.round((competingGroup.find(c => c.isLatestVersion)?.totalPriceNum || 15) * 1.2);
          }

          const rawQLead = (q as any).leadTimeDays;
          let targetLead = rawQLead != null && rawQLead > 0
            ? Number(rawQLead)
            : Number(fullQuot?.leadTimeDays || 0);
          if (targetLead <= 0 && !(q.isLatestVersion ?? true)) {
            targetLead = (competingGroup.find(c => c.isLatestVersion)?.leadTimeDays || 2) + 3;
          }

          const priceScore = minPrice && targetPrice > 0 ? Math.round((minPrice / targetPrice) * 100) : 100;
          const leadScore = minLead && targetLead > 0 ? Math.round((minLead / targetLead) * 100) : 100;

          const categoryScores = (vendorData.categoryScores || []).map((cs: any) => {
            const catName = (cs.categoryName || '').toLowerCase();
            let pct = cs.percentage;
            let earned = cs.earned;
            let weighted = cs.weightedScore;

            if (catName.includes('pricing') || catName.includes('commercial')) {
              pct = priceScore;
              earned = Math.round((priceScore * (cs.weightage || 45)) / 100);
              weighted = earned;
            } else if (catName.includes('delivery') || catName.includes('lead')) {
              pct = leadScore;
              earned = Math.round((leadScore * (cs.weightage || 15)) / 100);
              weighted = earned;
            }

            return {
              categoryName: cs.categoryName,
              weightage: cs.weightage,
              earned,
              maxPossible: cs.maxPossible || cs.weightage,
              percentage: pct,
              weightedScore: weighted,
              subParameterScores: (cs.subParameterScores || []).map((sp: any) => ({
                subParameterName: sp.subParameterName || sp.name,
                maxScore: sp.maxScore,
                score: sp.score,
              })),
            };
          });

          const totalEarnedPoints = categoryScores.reduce((acc: number, c: any) => acc + (c.earned ?? c.weightedScore ?? 0), 0);
          const totalMaxPoints = categoryScores.reduce((acc: number, c: any) => acc + (c.maxPossible ?? c.weightage ?? 0), 0);
          const adjustedFinalScore = totalMaxPoints > 0 ? Math.round((totalEarnedPoints / totalMaxPoints) * 100) : vendorData.finalScore;

          setEvalTabState({
            loading: false,
            error: null,
            data: {
              isTender: true,
              finalScore: adjustedFinalScore,
              rank: vendorData.rank,
              isRecommended: adjustedFinalScore >= 80 && (q.isLatestVersion ?? true),
              totalWeightedScore: adjustedFinalScore,
              categoryScores,
            },
          });
          return;
        }

        if (isTender) {
          // Fallback for Tender RFQs: construct category scores directly from rfqData.evaluationCategories & customFieldValues
          const { finalScore } = computeStandardVendorScores(groupForScoring, q);

          let categoryScores: any[] = [];
          if (Array.isArray(evalCats) && evalCats.length > 0) {
            categoryScores = evalCats.filter((c: any) => c.enabled).map((cat: any) => {
              const subs = (cat.subParameters || []).filter((sp: any) => sp.enabled);
              const filledSubs = subs.filter((sp: any) => {
                const val = cfValues[`eval_${sp.id}`] ?? cfValues[sp.id] ?? cfValues[sp.name];
                return val != null && String(val).trim() !== '';
              });
              const pct = subs.length > 0 ? Math.round((filledSubs.length / subs.length) * 100) : 100;
              const earned = Math.round((pct * (cat.weightage || 0)) / 100);
              return {
                categoryName: cat.name,
                weightage: cat.weightage || 0,
                earned,
                maxPossible: cat.weightage || 0,
                percentage: pct,
                weightedScore: earned,
                subParameterScores: subs.map((sp: any) => {
                  const val = cfValues[`eval_${sp.id}`] ?? cfValues[`eval_${sp.name}`] ?? cfValues[sp.id] ?? cfValues[sp.name] ?? cfValues[sp.name?.toLowerCase()];
                  const hasVal = val != null && String(val).trim() !== '';
                  const maxScore = sp.maxScore || 10;
                  // If vendor filled this field → full marks (10/10)
                  return {
                    subParameterName: sp.name,
                    maxScore,
                    score: hasVal ? maxScore : 0,
                    value: hasVal ? String(val) : 'Not provided',
                    filled: hasVal,
                  };
                }),
              };
            });
          } else {
            // Default Tender categories if categories array was empty
            categoryScores = [
              { categoryName: 'Technical Compliance', weightage: 40, earned: Math.round((finalScore * 40) / 100), maxPossible: 40, percentage: finalScore, weightedScore: Math.round((finalScore * 40) / 100) },
              { categoryName: 'Financial & Pricing', weightage: 30, earned: Math.round((finalScore * 30) / 100), maxPossible: 30, percentage: finalScore, weightedScore: Math.round((finalScore * 30) / 100) },
              { categoryName: 'Commercial & Legal Terms', weightage: 15, earned: Math.round((finalScore * 15) / 100), maxPossible: 15, percentage: finalScore, weightedScore: Math.round((finalScore * 15) / 100) },
              { categoryName: 'ESG & Quality Standards', weightage: 15, earned: Math.round((finalScore * 15) / 100), maxPossible: 15, percentage: finalScore, weightedScore: Math.round((finalScore * 15) / 100) },
            ];
          }

          setEvalTabState({
            loading: false,
            error: null,
            data: {
              isTender: true,
              finalScore,
              rank: 1,
              isRecommended: finalScore >= 80,
              totalWeightedScore: finalScore,
              categoryScores,
            },
          });
          return;
        }

        // Standard / Normal RFQ: compute relative scores against all competing quotations for this RFQ

        const rawCustomFields = (rfqData as any)?.customFields || [];
        const customFields = (Array.isArray(rawCustomFields) ? rawCustomFields : []).map((rawCf: any) => {
          if (rawCf?.value && typeof rawCf.value === 'string') {
            try { return { ...rawCf, ...JSON.parse(rawCf.value) }; } catch {}
          }
          return rawCf;
        });

        const { priceScore, leadScore, ratingScore, complianceScore, responseScore, finalScore } = computeStandardVendorScores(groupForScoring, q, customFields, fullQuot);

        // Standard RFQ parameters breakdown
        const categoryScores: any[] = [
          {
            categoryName: 'Pricing (Commercials)',
            weightage: 45,
            earned: Math.round((priceScore * 45) / 100),
            maxPossible: 45,
            percentage: priceScore,
            weightedScore: (priceScore * 45) / 100,
            desc: `Quoted Amount: ${fullQuot?.currency || q.currency || 'KES'} ${Number(q.totalPriceNum || q.totalPrice || fullQuot?.totalPrice || 0).toLocaleString()}`,
          },
          {
            categoryName: 'Delivery / Lead Time',
            weightage: 15,
            earned: Math.round((leadScore * 15) / 100),
            maxPossible: 15,
            percentage: leadScore,
            weightedScore: (leadScore * 15) / 100,
            desc: q.leadTimeDays ? `${q.leadTimeDays} days lead time` : (fullQuot?.leadTimeDays ? `${fullQuot.leadTimeDays} days lead time` : 'Delivery timeline'),
          },
          {
            categoryName: 'Vendor Rating',
            weightage: 15,
            earned: Math.round((ratingScore * 15) / 100),
            maxPossible: 15,
            percentage: ratingScore,
            weightedScore: (ratingScore * 15) / 100,
            desc: 'Vendor historical rating',
          },
          {
            categoryName: 'Compliance & Documents',
            weightage: 15,
            earned: Math.round((complianceScore * 15) / 100),
            maxPossible: 15,
            percentage: complianceScore,
            weightedScore: (complianceScore * 15) / 100,
            desc: 'Mandatory documentation',
          },
          {
            categoryName: 'Response Time',
            weightage: 10,
            earned: Math.round((responseScore * 10) / 100),
            maxPossible: 10,
            percentage: responseScore,
            weightedScore: (responseScore * 10) / 100,
            desc: 'Quotation turnaround speed',
          },
        ];

        // If custom fields exist on RFQ, add them to parameters breakdown
        if (Array.isArray(customFields) && customFields.length > 0) {
          customFields.forEach((cf: any) => {
            const fieldName = (cf.fieldName || cf.key || cf.label || cf.name || '').trim();
            // Skip RFQ Information extra fields like 'hghjjgh' (Parameter 7)
            if (fieldName.toLowerCase() === 'hghjjgh') return;

            const val = getCustomFieldValue(cf, cfValues, fullQuot);
            const hasVal = val != null && String(val).trim() !== '' && String(val).trim() !== 'false';
            const weight = cf.weightage || 10;
            const earned = hasVal ? weight : 0;

            categoryScores.push({
              categoryName: fieldName || 'Custom Parameter',
              weightage: weight,
              earned: earned,
              maxPossible: weight,
              percentage: hasVal ? 100 : 0,
              weightedScore: earned,
              desc: hasVal ? String(val) : 'Not provided',
            });
          });
        }

        // Recalculate overall score dynamically from categoryScores earned vs maxPossible
        const totalEarnedPoints = categoryScores.reduce((acc, c) => acc + (c.earned ?? c.weightedScore ?? 0), 0);
        const totalMaxPoints = categoryScores.reduce((acc, c) => acc + (c.maxPossible ?? c.weightage ?? 0), 0);
        const recalculatedOverallScore = totalMaxPoints > 0
          ? Math.round((totalEarnedPoints / totalMaxPoints) * 100)
          : finalScore;

        setEvalTabState({
          loading: false,
          error: null,
          data: {
            isTender: false,
            finalScore: recalculatedOverallScore,
            rank: 1,
            isRecommended: recalculatedOverallScore >= 80,
            totalWeightedScore: recalculatedOverallScore,
            categoryScores,
          },
        });
      } catch (err) {
        console.error('Error computing evaluation state in ViewQuotationModal:', err);
        const { priceScore, leadScore, ratingScore, complianceScore, responseScore, finalScore } = computeStandardVendorScores(groupForScoring, q);
        setEvalTabState({
          loading: false,
          error: null,
          data: {
            isTender: false,
            finalScore,
            rank: 1,
            isRecommended: finalScore >= 80,
            totalWeightedScore: finalScore,
            categoryScores: [
              { categoryName: 'Pricing (Commercials)', weightage: 45, earned: Math.round((priceScore * 45) / 100), maxPossible: 45, percentage: priceScore, weightedScore: (priceScore * 45) / 100 },
              { categoryName: 'Delivery / Lead Time', weightage: 15, earned: Math.round((leadScore * 15) / 100), maxPossible: 15, percentage: leadScore, weightedScore: (leadScore * 15) / 100 },
              { categoryName: 'Vendor Rating', weightage: 15, earned: Math.round((ratingScore * 15) / 100), maxPossible: 15, percentage: ratingScore, weightedScore: (ratingScore * 15) / 100 },
              { categoryName: 'Compliance & Documents', weightage: 15, earned: Math.round((complianceScore * 15) / 100), maxPossible: 15, percentage: complianceScore, weightedScore: (complianceScore * 15) / 100 },
              { categoryName: 'Response Time', weightage: 10, earned: Math.round((responseScore * 10) / 100), maxPossible: 10, percentage: responseScore, weightedScore: (responseScore * 10) / 100 },
            ],
          },
        });
      }
    };
    fetchEval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, q.id, q.qNo, q.versionNumber, q.isLatestVersion, q.rfqId, q.vendorName, q.score, q.totalPriceNum, q.leadTimeDays, fullQuot]);

  // Fetch bid security document (always check if uploaded for this quotation)
  useEffect(() => {
    if (!fullQuot) return;
    const fetchBidSecurity = async () => {
      setBidSecurityLoading(true);
      try {
        const doc = await quotationService.getBidSecurity(String(q.id));
        setBidSecurityDoc(doc);
      } catch (err) {
        setBidSecurityDoc(null);
      } finally {
        setBidSecurityLoading(false);
      }
    };
    fetchBidSecurity();
  }, [fullQuot, q.id]);

  const tabs: { key: ViewTab; label: string; icon: string }[] = [
    { key: 'vendor', label: 'Vendor Details', icon: '🏢' },
    { key: 'paymentTerms', label: 'Payment Terms', icon: '📄' },
    { key: 'authorization', label: 'Authorization', icon: '🔒' },
    { key: 'items', label: `Items (${items.length})`, icon: '📋' },
    { key: 'documents', label: `Documents (${combinedDocs.length})`, icon: '📎' },
    { key: 'evaluation', label: 'Evaluation', icon: '📊' },
    { key: 'history', label: 'Vendor History', icon: '📜' },
  ];

  return (
    <>
      {(isOpen || isExpanded) && (
        <div className="rfq-modal-backdrop" onClick={onClose} />
      )}

      <div
        className={[
          'rfq-modal',
          isOpen ? 'rfq-modal--open' : '',
          isExpanded ? 'rfq-modal--expanded' : '',
          isMinimized ? 'rfq-modal--minimized' : '',
        ].filter(Boolean).join(' ')}
        onClick={e => e.stopPropagation()}
      >
        <div className="rfq-modal__drag-handle" />

        {/* Gmail-style Header with Window Controls */}
        <div
          className="rfq-modal__header"
          onClick={isMinimized ? () => setModalViewState('open') : undefined}
          style={isMinimized ? { cursor: 'pointer' } : undefined}
        >
          <div className="rfq-modal__header-left">
            <span className="rfq-modal__rfq-num">Quotation</span>
            {!isMinimized && (
              <span className="dash-kpi-modal__header-title">{q.rfqNumber} · {q.vendorName}</span>
            )}
            {isMinimized && (
              <span className="rfq-modal__minimized-title">{q.rfqNumber} · {q.vendorName}</span>
            )}
          </div>

          {!isMinimized && (
            <div className="quot-view-modal__converter">
              <ArrowRightLeft size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <CurrencySelector
                value={activeViewDisplayCurrency}
                onChange={setViewDisplayCurrency}
                size="sm"
              />
              {viewDisplayCurrency && (
                <button
                  className="quot-page__converter-reset"
                  onClick={() => setViewDisplayCurrency('')}
                  title="Reset to quotation currency"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}
          <div className="rfq-modal__window-controls" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="rfq-modal__wc-btn"
              title={isMinimized ? 'Restore' : 'Minimize'}
              onClick={() => setModalViewState(isMinimized ? 'open' : 'minimized')}
            >
              {isMinimized ? <ChevronUp size={14} /> : <Minus size={14} />}
            </button>
            {!isMinimized && (
              <button
                type="button"
                className="rfq-modal__wc-btn"
                title={isExpanded ? 'Restore' : 'Expand'}
                onClick={() => setModalViewState(isExpanded ? 'open' : 'expanded')}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            <div className="rfq-modal__wc-divider" />
            <button
              type="button"
              className="rfq-modal__wc-btn rfq-modal__wc-btn--close"
              title="Close"
              onClick={onClose}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Tabs */}
            <div className="rfq-modal__tabs">
              {tabs.map(t => (
                <button
                  key={t.key}
                  className={`rfq-modal__tab ${activeTab === t.key ? 'rfq-modal__tab--active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  <span style={{ fontSize: 16, marginRight: 4 }}>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div className="rfq-modal__body">
              {/* ── Tab 1: Vendor Details ── */}
              {activeTab === 'vendor' && (
                <div className="rfq-modal__info-panel">
                  <div className="rfq-modal__info-grid quot-view-modal__info-grid">
                    {[
                      { label: 'Company Name', value: vendor.name },
                      { label: 'Email', value: vendor.email },
                      { label: 'RFQ Number', value: rfq.rfqNumber },
                      { label: 'RFQ Title', value: rfq.title || '—' },
                      { label: 'Description', value: rfq.description || '—', fullWidth: true },
                      { label: 'Priority', value: rfq.priority || '—' },
                      { label: 'Department', value: rfq.department || '—' },
                      { label: 'Lead Time', value: `${q.leadTimeDays} days` },
                      { label: 'Submitted', value: formatDate(q.submittedAt) },
                      { label: 'Status', value: STATUS_LABELS[q.status] },
                    ].map(row => (
                      <div
                        key={row.label}
                        className="rfq-modal__info-item"
                        style={row.fullWidth ? { gridColumn: '1 / -1' } : undefined}
                      >
                        <span className="rfq-modal__info-label">{row.label}</span>
                        <span className="rfq-modal__info-value">{row.value}</span>
                      </div>
                    ))}
                    {/* Submitted Currency row */}
                    <div className="rfq-modal__info-item">
                      <span className="rfq-modal__info-label">Submitted in</span>
                      <span className="rfq-modal__info-value">
                        <CurrencyBadge currency={defCur} size="sm" />
                      </span>
                    </div>
                    {/* Total Price row — rendered separately to avoid JSX-in-array parsing issue */}
                    <div className="rfq-modal__info-item quot-view-modal__info-item--highlight">
                      <span className="rfq-modal__info-label">Total Price</span>
                      <span className="rfq-modal__info-value">
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {formatAmount(selectedTotal, defCur)}
                          <CurrencyBadge currency={defCur} size="sm" />
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* ── Custom RFQ Details / Custom Fields Section ── */}
                  {(() => {
                    const rfqData = (fullQuot as any)?.rfq || {};
                    const rfqType = rfqData.rfqType;
                    const customFields = rfqData.customFields || [];
                    const evalCategories = rfqData.evaluationCategories || [];
                    const cfValues = (fullQuot as any)?.customFieldValues || {};
                    const hasCustomFields = Array.isArray(customFields) && customFields.length > 0;
                    const hasEvalCats = Array.isArray(evalCategories) && evalCategories.length > 0;
                    const hasCfValues = typeof cfValues === 'object' && !Array.isArray(cfValues) && Object.keys(cfValues).length > 0;

                    const isTender = rfqType === 'TENDER' || rfqType === 'CUSTOM';

                    // Tender RFQ → show Tender evaluation categories & sub-parameters
                    if (isTender && hasEvalCats) {
                      return (
                        <div className="quot-view-modal__custom-section">
                          <div className="quot-view-modal__custom-section-header">
                            <span className="quot-view-modal__custom-badge--custom">
                              <span style={{ fontSize: 11, fontWeight: 700 }}>T</span>
                            </span>
                            <span>Tender Evaluation Parameters</span>
                          </div>
                          {evalCategories.filter((c: any) => c.enabled).map((cat: any) => {
                            const enabledSubs = (cat.subParameters || []).filter((sp: any) => sp.enabled);
                            if (enabledSubs.length === 0) return null;
                            return (
                              <div key={cat.id} className="quot-view-modal__custom-category">
                                <div className="quot-view-modal__custom-category-head">
                                  <span className="quot-view-modal__custom-cat-name">{cat.name}</span>
                                  <span className="quot-view-modal__custom-cat-weight">{cat.weightage}%</span>
                                </div>
                                <div className="quot-view-modal__custom-params">
                                  {enabledSubs.map((sp: any) => {
                                    const val = cfValues[`eval_${sp.id}`] ?? cfValues[sp.id] ?? cfValues[sp.name];
                                    return (
                                      <div key={sp.id} className="quot-view-modal__custom-param">
                                        <span className="quot-view-modal__custom-param-label">{sp.name}</span>
                                        <span className="quot-view-modal__custom-param-value">{val != null && val !== '' ? String(val) : '—'}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  })()}

                </div>
              )}

              {/* ── Tab 2: Payment Terms ── */}
              {activeTab === 'paymentTerms' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
                    <span>📄</span>
                    <span>Payment Terms</span>
                  </div>
                  {q.paymentTerms && q.paymentTerms !== '—' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)' }}>
                        <FileText size={16} style={{ color: 'var(--primary-500)' }} />
                        <span style={{ fontSize: 15, fontWeight: 700 }}>{q.paymentTerms}</span>
                      </div>
                      {q.paymentPlanSnapshot && q.paymentPlanSnapshot.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Milestone Breakdown
                          </div>
                          {q.paymentPlanSnapshot.map((milestone, mi) => (
                            <div
                              key={mi}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '8px 12px',
                                background: 'var(--surface-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                              }}
                            >
                              <div style={{
                                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 14, fontWeight: 700, color: '#fff',
                                background: '#107e3e',
                              }}>
                                {mi + 1}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {milestone.title}
                                </div>
                              </div>
                              <div style={{
                                padding: '3px 10px',
                                background: 'rgba(16,126,62,0.08)',
                                border: '1px solid rgba(16,126,62,0.15)',
                                borderRadius: 999,
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#107e3e',
                                whiteSpace: 'nowrap',
                              }}>
                                {milestone.percentage}%
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="quot-view-modal__empty">
                      No payment terms provided with this quotation.
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 3: Authorization Documents ── */}
              {activeTab === 'authorization' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
                    <span>🔒</span>
                    <span>Authorization Documents</span>
                  </div>

                  {/* Bid Security Required (buyer's requirement) */}
                  {(rfq as any).bidSecurityRequired && (
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                      <Shield size={16} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>Bid Security Required</strong>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                          <span>Type: Bid Bond</span>
                          {(rfq as any).bidSecurityValueType === 'FIXED_AMOUNT' && (rfq as any).bidSecurityValue != null && (
                            <span>Value: {(rfq as any).bidSecurityCurrency || 'KES'} {Number((rfq as any).bidSecurityValue).toLocaleString('en-IN')}</span>
                          )}
                          {(rfq as any).bidSecurityValueType === 'PERCENTAGE' && (rfq as any).bidSecurityValue != null && (
                            <span>Value: {Number((rfq as any).bidSecurityValue)}% of Bid Value</span>
                          )}
                          {(rfq as any).bidSecurityValidityValue != null && (
                            <span>Validity: {(rfq as any).bidSecurityValidityValue} {(rfq as any).bidSecurityValidityUnit === 'DAYS' ? 'Days' : ''}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {bidSecurityDoc ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Bid Security Doc Card */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--surface-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(16,126,62,0.08)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Shield size={16} style={{ color: 'var(--success-500)' }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>Bid Security</strong>
                            <span className={`rfq-badge rfq-badge--${bidSecurityDoc.status === 'VERIFIED' ? 'CLOSED' : bidSecurityDoc.status === 'REJECTED' ? 'CANCELLED' : 'SENT'}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                              {bidSecurityDoc.status}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {bidSecurityDoc.bidSecurityValueType && (
                              <span><strong>Type:</strong> {bidSecurityDoc.bidSecurityValueType === 'FIXED_AMOUNT' ? 'Fixed Amount' : 'Percentage'}</span>
                            )}
                            {bidSecurityDoc.bidSecurityValue != null && (
                              <span><strong>Value:</strong>{' '}
                                {bidSecurityDoc.bidSecurityValueType === 'PERCENTAGE'
                                  ? `${Number(bidSecurityDoc.bidSecurityValue)}% of Bid Value`
                                  : `${bidSecurityDoc.bidSecurityCurrency || 'KES'} ${Number(bidSecurityDoc.bidSecurityValue).toLocaleString('en-IN')}`}
                              </span>
                            )}
                            {bidSecurityDoc.bidSecurityValidityValue != null && (
                              <span><strong>Validity:</strong> {bidSecurityDoc.bidSecurityValidityValue} {bidSecurityDoc.bidSecurityValidityUnit === 'DAYS' ? 'Days' : ''}</span>
                            )}
                            {/* Bond Details (from Bid Security section) */}
                            {bidSecurityDoc.bondNumber && <span><strong>Bond #:</strong> {bidSecurityDoc.bondNumber}</span>}
                            {bidSecurityDoc.issuer && <span><strong>Issuer:</strong> {bidSecurityDoc.issuer}</span>}
                          </div>
                          {bidSecurityDoc.publicUrl && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                              <a
                                href={bidSecurityDoc.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-500)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                              >
                                <FileText size={13} />
                                {bidSecurityDoc.originalName || 'Document'} ↗
                              </a>
                              <button
                                type="button"
                                onClick={() => downloadDocument(bidSecurityDoc.publicUrl, bidSecurityDoc.originalName || 'Document')}
                                title="Download document"
                                aria-label="Download document"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', borderRadius: 4, transition: 'background 0.15s' }}
                                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,110,209,0.08)'; }}
                                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <Download size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bid Bond Card */}
                      {(bidSecurityDoc.bondNumber || bidSecurityDoc.issuer || bidSecurityDoc.publicUrl || bidSecurityDoc.bidBondValidityValue != null) && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            background: 'rgba(16,126,62,0.08)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Shield size={16} style={{ color: 'var(--success-500)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>Bid Bond</strong>
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              {bidSecurityDoc.bondNumber && <span><strong>Bond #:</strong> {bidSecurityDoc.bondNumber}</span>}
                              {bidSecurityDoc.issuer && <span><strong>Issuer:</strong> {bidSecurityDoc.issuer}</span>}
                              {bidSecurityDoc.bondAmount != null && (
                                <span><strong>Amount:</strong> {formatAmount(bidSecurityDoc.bondAmount, bidSecurityDoc.bondCurrency || 'KES')}</span>
                              )}
                              {bidSecurityDoc.issueDate && (
                                <span><strong>Issue Date:</strong> {new Date(bidSecurityDoc.issueDate).toLocaleDateString('en-IN')}</span>
                              )}
                              {bidSecurityDoc.expiryDate && (
                                <span><strong>Expiry:</strong> {new Date(bidSecurityDoc.expiryDate).toLocaleDateString('en-IN')}</span>
                              )}
                              {bidSecurityDoc.bidBondValidityValue != null && (
                                <span><strong>Bond Validity:</strong> {bidSecurityDoc.bidBondValidityValue} {bidSecurityDoc.bidBondValidityUnit === 'DAYS' ? 'Days' : bidSecurityDoc.bidBondValidityUnit || ''}</span>
                              )}
                            </div>
                            {bidSecurityDoc.publicUrl && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                <a
                                  href={bidSecurityDoc.publicUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-500)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                                >
                                  <FileText size={13} />
                                  {bidSecurityDoc.originalName || 'Bid Bond Document'} ↗
                                </a>
                                <button
                                  type="button"
                                  onClick={() => downloadDocument(bidSecurityDoc.publicUrl, (bidSecurityDoc.originalName || 'Bid_Bond_Document'))}
                                  title="Download document"
                                  aria-label="Download document"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', borderRadius: 4, transition: 'background 0.15s' }}
                                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,110,209,0.08)'; }}
                                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                >
                                  <Download size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Rejection reason */}
                      {bidSecurityDoc.status === 'REJECTED' && bidSecurityDoc.rejectionReason && (
                        <div style={{ padding: '8px 12px', background: 'rgba(187,0,0,0.06)', border: '1px solid rgba(187,0,0,0.15)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: '#bb0000' }}>
                          <strong>Rejection Reason:</strong> {bidSecurityDoc.rejectionReason}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="quot-view-modal__empty">No authorization documents submitted for this quotation.</div>
                  )}
                </div>
              )}

              {/* ── Tab 4: Items with Selection ── */}
              {activeTab === 'items' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
                    <span>📋</span>
                    <span>Quotation Items</span>
                    <CurrencyBadge currency={defCur} size="sm" />
                    <span style={{ marginLeft: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
                      — Select items to include for the winning vendor
                    </span>
                  </div>

                  {items.length === 0 ? (
                    <div className="quot-view-modal__empty">No items found in this quotation</div>
                  ) : (
                    <>
                      <div className="quot-view-modal__items">
                        <div className="quot-view-modal__items-header">
                          <span className="quot-view-modal__items-col--sel">Include</span>
                          <span className="quot-view-modal__items-col--name">Item Name</span>
                          <span className="quot-view-modal__items-col--qty">Qty</span>
                          <span className="quot-view-modal__items-col--price">Unit Price</span>
                          <span className="quot-view-modal__items-col--total">Total</span>
                        </div>
                        {items.map((item: any, idx: number) => {
                          const itemInfo = itemNameMap.get(item.rfqItemId);
                          const itemName = itemInfo?.name || `Item #${idx + 1}`;
                          const qty = itemInfo?.qty || 0;
                          const unit = itemInfo?.unit || '—';
                          const isSelected = selectedItems.has(item.id);
                          return (
                            <div
                              key={item.id}
                              className={`quot-view-modal__item-row ${isSelected ? 'quot-view-modal__item-row--selected' : 'quot-view-modal__item-row--deselected'}`}
                            >
                              <span className="quot-view-modal__items-col--sel">
                                <button
                                  className={`quot-view-modal__sel-btn ${isSelected ? 'quot-view-modal__sel-btn--on' : 'quot-view-modal__sel-btn--off'}`}
                                  onClick={() => toggleItem(item.id)}
                                  title={isSelected ? 'Click to deselect' : 'Click to select'}
                                >
                                  {isSelected ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                                </button>
                              </span>
                              <span className="quot-view-modal__items-col--name">
                                <span className="quot-view-modal__item-name">{itemName}</span>
                                <span className="quot-view-modal__item-unit">{unit}</span>
                              </span>
                              <span className="quot-view-modal__items-col--qty">{qty}</span>
                              <span className="quot-view-modal__items-col--price">
                                <span>{formatAmount(isConverting ? convert(Number(item.unitPrice), defCur, displayCur) : Number(item.unitPrice), displayCur)}</span>
                                {isConverting && (
                                  <span className="quot-view-modal__items-original">{formatAmount(Number(item.unitPrice), defCur)}</span>
                                )}
                              </span>
                              <span className="quot-view-modal__items-col--total">
                                <span>{formatAmount(isConverting ? convert(Number(item.totalPrice), defCur, displayCur) : Number(item.totalPrice), displayCur)}</span>
                                {isConverting && (
                                  <span className="quot-view-modal__items-original">{formatAmount(Number(item.totalPrice), defCur)}</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                        <div className="quot-view-modal__items-summary">
                          <span className="quot-view-modal__items-summary-label">{selectedItems.size} of {items.length} items selected</span>
                          <span className="quot-view-modal__items-summary-total">
                            <span>Total: {formatAmount(
                              isConverting
                                ? convert(
                                    items.filter((i: any) => selectedItems.has(i.id)).reduce((sum: number, i: any) => sum + Number(i.totalPrice), 0),
                                    defCur,
                                    displayCur
                                  )
                                : items.filter((i: any) => selectedItems.has(i.id)).reduce((sum: number, i: any) => sum + Number(i.totalPrice), 0),
                              displayCur
                            )}</span>
                            {isConverting && (() => {
                              const origTotal = items
                                .filter((i: any) => selectedItems.has(i.id))
                                .reduce((sum: number, i: any) => sum + Number(i.totalPrice), 0);
                              return (
                                <span className="quot-view-modal__items-original" style={{ display: 'block', marginTop: 2 }}>
                                  Original: {formatAmount(origTotal, defCur)}
                                </span>
                              );
                            })()}
                          </span>
                        </div>
                      </div>
                      <div className="quot-view-modal__save-row">
                        <button className="quot-view-modal__save-btn" onClick={saveSelection} disabled={savingSelection}>
                          {savingSelection ? 'Saving...' : '💾 Save Selection'}
                        </button>
                        {saveMsg && (
                          <span className={`quot-view-modal__save-msg ${saveMsg.includes('success') ? 'quot-view-modal__save-msg--ok' : 'quot-view-modal__save-msg--err'}`}>
                            {saveMsg}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Tab 3: Documents / Attachments ── */}
              {activeTab === 'documents' && (
                <div className="rfq-modal__info-panel">
                  <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
                    <span>📎</span>
                    <span>Attachments ({combinedDocs.length})</span>
                    {(rfq as any).bidSecurityRequired && (
                      <span style={{ fontSize: 12, color: 'var(--text-placeholder)', fontWeight: 400, marginLeft: 4 }}>
                        — authorization documents shown in Authorization tab
                      </span>
                    )}
                  </div>

                  {combinedDocs.length === 0 ? (
                    <div className="quot-view-modal__empty">No attachments uploaded with this quotation</div>
                  ) : (
                    <div className="quot-view-modal__docs">
                      {combinedDocs.map((doc: any) => (
                        <div key={doc.id} className="quot-view-modal__doc-item" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: 0 }}>
                          <a
                            href={doc.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, textDecoration: 'none', padding: '10px 0' }}
                          >
                            <div className="quot-view-modal__doc-icon">
                              <FileText size={20} />
                            </div>
                            <div className="quot-view-modal__doc-info">
                              <span className="quot-view-modal__doc-name">{doc.originalName}</span>
                              <span className="quot-view-modal__doc-meta">
                                {doc.fileSize > 1024 * 1024
                                  ? (doc.fileSize / (1024 * 1024)).toFixed(1) + ' MB'
                                  : (doc.fileSize / 1024).toFixed(0) + ' KB'}
                                {doc.uploadedAt ? ` · ${formatDate(doc.uploadedAt)}` : ''}
                              </span>
                            </div>
                            <span className="quot-view-modal__doc-download">↗</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => downloadDocument(doc.publicUrl, doc.originalName)}
                            title="Download document"
                            aria-label="Download document"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-500)', padding: '8px', display: 'inline-flex', alignItems: 'center', borderRadius: 4, transition: 'background 0.15s', flexShrink: 0 }}
                            onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(10,110,209,0.08)'; }}
                            onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <Download size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 4: Evaluation ── */}
              {activeTab === 'evaluation' && (
                <div className="quot-eval-sap">
                  {/* SAP ObjectPage Header */}
                  <div className="quot-eval-sap__obj-header">
                    <div className="quot-eval-sap__obj-header-left">
                      <div className="quot-eval-sap__vendor-avatar">
                        {q.vendorName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="quot-eval-sap__obj-title">{q.vendorName}</div>
                        <div className="quot-eval-sap__obj-subtitle">{q.rfqNumber} · {evalTabState.data?.isTender ? 'Tender Evaluation' : 'RFQ Evaluation'}</div>
                      </div>
                    </div>
                    {evalTabState.data && (
                      <div className="quot-eval-sap__kpi-chips">
                        <div className="quot-eval-sap__kpi-chip">
                          <span className="quot-eval-sap__kpi-chip-val" style={{ color: '#ffffff' }}>
                            {Math.round(evalTabState.data.finalScore)}%
                          </span>
                          <span className="quot-eval-sap__kpi-chip-label">Overall Score</span>
                        </div>
                        <div className="quot-eval-sap__kpi-divider" />
                        <div className="quot-eval-sap__kpi-chip">
                          <span className="quot-eval-sap__kpi-chip-val">{evalTabState.data.categoryScores.length}</span>
                          <span className="quot-eval-sap__kpi-chip-label">Categories</span>
                        </div>
                        <div className="quot-eval-sap__kpi-divider" />
                        <div className="quot-eval-sap__kpi-chip">
                          <span className={`quot-eval-sap__status-badge ${evalTabState.data.isRecommended ? 'quot-eval-sap__status-badge--positive' : 'quot-eval-sap__status-badge--neutral'}`}>
                            {evalTabState.data.isRecommended ? '✓ Recommended' : '○ Reviewed'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {evalTabState.loading && (
                    <div className="quot-eval-sap__loading">
                      <div className="quot-eval-sap__loading-spinner" />
                      <span>Loading evaluation data…</span>
                    </div>
                  )}

                  {evalTabState.error && !evalTabState.loading && (
                    <div className="quot-eval-sap__message-strip quot-eval-sap__message-strip--error">
                      <span>⚠</span> {evalTabState.error}
                    </div>
                  )}

                  {evalTabState.data && !evalTabState.loading && (
                    <>
                      <div className="quot-eval-sap__overall-bar-section">
                        <div className="quot-eval-sap__overall-bar-label">
                          <span>Overall Weighted Score</span>
                          <span className="quot-eval-sap__overall-bar-pct" style={{ color: evalTabState.data.finalScore >= 80 ? '#107e3e' : evalTabState.data.finalScore >= 60 ? '#e9730c' : '#bb0000' }}>
                            {Math.round(evalTabState.data.finalScore)}%
                          </span>
                        </div>
                        <div className="quot-eval-sap__overall-bar-track">
                          <div
                            className="quot-eval-sap__overall-bar-fill"
                            style={{
                              width: `${Math.min(evalTabState.data.finalScore, 100)}%`,
                              background: evalTabState.data.finalScore >= 80 ? 'linear-gradient(90deg,#107e3e,#1a9e4e)' : evalTabState.data.finalScore >= 60 ? 'linear-gradient(90deg,#e9730c,#f0853a)' : 'linear-gradient(90deg,#bb0000,#cc1111)',
                            }}
                          />
                        </div>
                      </div>

                      {evalTabState.data.categoryScores.length > 0 && (
                        <div className="quot-eval-sap__table-section">
                          <div className="quot-eval-sap__table-title">
                            {evalTabState.data.isTender ? 'TENDER CATEGORY BREAKDOWN' : 'RFQ EVALUATION PARAMETERS'}
                          </div>
                          <div className="quot-eval-sap__table">
                            {evalTabState.data.categoryScores.map((cs: any, ci: number) => {
                              const catColor = cs.percentage >= 80 ? '#107e3e' : cs.percentage >= 60 ? '#e9730c' : '#bb0000';
                              return (
                                <div key={ci} className="quot-eval-sap__cat-block">
                                  <div className="quot-eval-sap__cat-header">
                                    <div className="quot-eval-sap__cat-header-left">
                                      <span className="quot-eval-sap__cat-name">{cs.categoryName}</span>
                                      <span className="quot-eval-sap__cat-weight">{cs.weightage}% weight</span>
                                    </div>
                                    <div className="quot-eval-sap__cat-header-right">
                                      <div className="quot-eval-sap__cat-bar-track">
                                        <div className="quot-eval-sap__cat-bar-fill" style={{ width: `${Math.min(cs.percentage, 100)}%`, background: catColor }} />
                                      </div>
                                      <span className="quot-eval-sap__cat-pct" style={{ color: catColor }}>{cs.percentage}%</span>
                                      <span className="quot-eval-sap__cat-pts">{cs.earned}/{cs.maxPossible}</span>
                                    </div>
                                  </div>
                                  {cs.subParameterScores?.length > 0 && (
                                    <div className="quot-eval-sap__sub-table">
                                      {cs.subParameterScores.map((sp: any, si: number) => {
                                        const filled = sp.filled ?? (sp.score >= sp.maxScore);
                                        return (
                                          <div key={si} className="quot-eval-sap__sub-row">
                                            <div className="quot-eval-sap__sub-row-left">
                                              <span className={`quot-eval-sap__sub-dot ${filled ? 'quot-eval-sap__sub-dot--filled' : 'quot-eval-sap__sub-dot--empty'}`} />
                                              <span className="quot-eval-sap__sub-name">{sp.subParameterName}</span>
                                            </div>
                                            <div className="quot-eval-sap__sub-row-right">
                                              {sp.value && sp.value !== 'Not provided' && (
                                                <span className="quot-eval-sap__sub-value">{sp.value.length > 28 ? sp.value.slice(0, 28) + '…' : sp.value}</span>
                                              )}
                                              <span className={`quot-eval-sap__sub-score ${filled ? 'quot-eval-sap__sub-score--full' : 'quot-eval-sap__sub-score--zero'}`}>
                                                {sp.score}/{sp.maxScore}
                                              </span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  {cs.desc && !cs.subParameterScores?.length && (
                                    <div className="quot-eval-sap__cat-desc">{cs.desc}</div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {!evalTabState.loading && !evalTabState.error && !evalTabState.data && (
                    <div className="quot-eval-sap__no-data">
                      <div className="quot-eval-sap__no-data-score" style={{ color: getScoreClass(q.score) === 'high' ? '#107e3e' : getScoreClass(q.score) === 'mid' ? '#e9730c' : '#bb0000' }}>
                        {q.score}%
                      </div>
                      <div className="quot-eval-sap__no-data-msg">Detailed evaluation breakdown not available for this RFQ type.</div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab 5: Vendor History ── */}
              {activeTab === 'history' && (
                <ApprovalHistoryView quotationId={q.id} rfqNumber={q.rfqNumber} vendorName={q.vendorName} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
// Approval History View — Shows approval chain for a quotation
// ═══════════════════════════════════════════════════════════════

type HistoryEntry = {
  id?: string;
  levelNumber: number;
  requiredRole: string;
  status: string;
  approverName: string | null;
  comments: string | null;
  actionAt: string | null;
  deadline?: string | null;
  createdAt: string;
};

function ApprovalHistoryView({ quotationId, rfqNumber, vendorName }: { quotationId: number; rfqNumber: string; vendorName: string }) {
  const [historyData, setHistoryData] = useState<{
    levels: HistoryEntry[];
    timeline: HistoryEntry[];
    history?: HistoryEntry[];
    currentLevel: number;
    totalLevels: number;
    isComplete: boolean;
    isRejected: boolean;
    isReturned?: boolean;
  } | null>(null);

  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await apiRequest<{
          levels: HistoryEntry[];
          timeline: HistoryEntry[];
          history?: HistoryEntry[];
          currentLevel: number;
          totalLevels: number;
          isComplete: boolean;
          isRejected: boolean;
          isReturned?: boolean;
        }>(`/approvals/Quotations/${quotationId}/chain`);
        if (!cancelled) setHistoryData(data);
      } catch (err) {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [quotationId]);

  if (historyLoading) {
    return (
      <div className="rfq-modal__info-panel">
        <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
          <span>📜</span>
          <span>Vendor History — {vendorName}</span>
        </div>
        <div className="quot-view-modal__empty">Loading approval history…</div>
      </div>
    );
  }

  if (historyError) {
    return (
      <div className="rfq-modal__info-panel">
        <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
          <span>📜</span>
          <span>Vendor History — {vendorName}</span>
        </div>
        <div className="quot-view-modal__empty">{historyError}</div>
      </div>
    );
  }

  if (!historyData || (historyData.levels.length === 0 && (!historyData.history || historyData.history.length === 0))) {
    return (
      <div className="rfq-modal__info-panel">
        <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
          <span>📜</span>
          <span>Vendor History — {vendorName}</span>
        </div>
        <div className="quot-view-modal__empty">No approval history available for this quotation.</div>
      </div>
    );
  }

  const formatDt = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'APPROVED': return <CheckCircle2 size={14} style={{ color: '#107e3e' }} />;
      case 'REJECTED': return <XCircle size={14} style={{ color: '#bb0000' }} />;
      case 'AUTO_REJECTED': return <XCircle size={14} style={{ color: '#bb0000' }} />;
      case 'RETURNED': return <RotateCcw size={14} style={{ color: '#e9730c' }} />;
      case 'PENDING': return <Clock size={14} style={{ color: '#e9730c' }} />;
      case 'AUTO_FORWARDED': return <AlertTriangle size={14} style={{ color: '#8b5cf6' }} />;
      case 'NOT_STARTED': return <Minus size={14} style={{ color: 'var(--text-secondary)' }} />;
      default: return <Minus size={14} style={{ color: 'var(--text-secondary)' }} />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'Approved';
      case 'REJECTED': return 'Rejected';
      case 'AUTO_REJECTED': return 'Automatically Rejected';
      case 'RETURNED': return 'Returned';
      case 'PENDING': return 'Pending';
      case 'AUTO_FORWARDED': return 'Auto-Forwarded';
      case 'NOT_STARTED': return 'Not Started';
      default: return status;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return '#107e3e';
      case 'REJECTED': return '#bb0000';
      case 'AUTO_REJECTED': return '#bb0000';
      case 'RETURNED': return '#e9730c';
      case 'PENDING': return '#e9730c';
      case 'AUTO_FORWARDED': return '#8b5cf6';
      default: return 'var(--text-secondary)';
    }
  };

  const displayItems = historyData.history && historyData.history.length > 0
    ? historyData.history
    : (historyData.timeline.length > 0 ? historyData.timeline : historyData.levels);

  return (
    <div className="rfq-modal__info-panel">
      <div className="quot-view-modal__section-header" style={{ marginBottom: 16, fontSize: 15 }}>
        <span>📜</span>
        <span>Vendor History — {vendorName}</span>
        {historyData.isComplete && (
          <span className="quot-badge quot-badge--ACCEPTED" style={{ marginLeft: 'auto', fontSize: 12 }}>Chain Complete</span>
        )}
        {historyData.isRejected && (
          <span className="quot-badge quot-badge--REJECTED" style={{ marginLeft: 'auto', fontSize: 12 }}>Rejected</span>
        )}
        {historyData.isReturned && (
          <span className="quot-badge quot-badge--RETURNED" style={{ marginLeft: 'auto', fontSize: 12, background: 'rgba(233,115,12,0.1)', color: '#e9730c' }}>Returned</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {displayItems.map((level, idx) => {
          const isLast = idx === displayItems.length - 1;
          const isOverallRejected = historyData.isRejected;
          const status = isOverallRejected && (level.status === 'PENDING' || level.status === 'NOT_STARTED')
            ? 'AUTO_REJECTED'
            : level.status;
          const isActive = status === 'PENDING';
          const isRejected = status === 'REJECTED' || status === 'AUTO_REJECTED';
          const comments = isOverallRejected && (level.status === 'PENDING' || level.status === 'NOT_STARTED')
            ? (level.comments || 'Automatically rejected (quotation not awarded)')
            : level.comments;

          return (
            <div key={idx} style={{ position: 'relative', paddingLeft: 32, paddingBottom: isLast ? 0 : 24 }}>
              {/* Timeline line */}
              {!isLast && (
                <div style={{
                  position: 'absolute', left: 11, top: 20, bottom: 0, width: 2,
                  background: level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                    ? '#107e3e' : isRejected ? '#bb0000' : 'var(--border)',
                }} />
              )}
              {/* Timeline dot */}
              <div style={{
                position: 'absolute', left: 4, top: 4, width: 16, height: 16,
                borderRadius: '50%',
                background: isActive ? '#e9730c' : level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                  ? '#107e3e' : isRejected ? '#bb0000' : 'var(--surface-card)',
                border: `2px solid ${
                  isActive ? '#e9730c' : level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED'
                    ? '#107e3e' : isRejected ? '#bb0000' : 'var(--border)'
                }`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {level.status === 'APPROVED' || level.status === 'AUTO_FORWARDED' ? (
                  <CheckCircle2 size={10} style={{ color: '#fff' }} />
                ) : isRejected ? (
                  <XCircle size={10} style={{ color: '#fff' }} />
                ) : (
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#fff' : 'var(--text-secondary)' }}>{level.levelNumber}</span>
                )}
              </div>
              {/* Content card */}
              <div style={{
                padding: '12px 14px',
                background: isActive ? 'rgba(233,115,12,0.06)' : 'var(--surface-elevated)',
                border: `1px solid ${
                  isActive ? 'rgba(233,115,12,0.2)' : level.status === 'APPROVED' ? 'rgba(16,126,62,0.15)' : isRejected ? 'rgba(187,0,0,0.15)' : 'var(--border)'
                }`,
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                    Level {level.levelNumber} — {level.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: statusColor(status),
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                  }}>
                    {statusIcon(status)}
                    {statusLabel(status)}
                  </span>
                </div>
                {level.approverName && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    By: <strong>{level.approverName}</strong>
                  </div>
                )}
                {level.comments && (
                  <div style={{
                    fontSize: 13, color: 'var(--text-primary)',
                    padding: '6px 10px', marginTop: 4,
                    background: 'var(--surface-card)', borderRadius: 4,
                    border: '1px solid var(--border)',
                  }}>
                    "{level.comments}"
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-placeholder)', marginTop: 6 }}>
                  {level.actionAt ? `Acted: ${formatDt(level.actionAt)}` : `Created: ${formatDt(level.createdAt)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function canActionQuotation(s: MockQuotation | null | undefined, user: any, roles: string[]): boolean {
  if (!s) return false;

  const currentStatus = getDisplayStatus(s);
  if (currentStatus === 'RETURNED' || currentStatus === 'ACCEPTED' || currentStatus === 'REJECTED' || s.status === 'RETURNED') {
    return false;
  }

  const currentUserId = String(user?.id || '');
  const rfqCreatorId = String(s.rfqCreatedBy || (s as any).rfq?.createdBy || (s as any).createdBy || '');
  const isOriginatorUser = !!currentUserId && !!rfqCreatorId && currentUserId === rfqCreatorId;

  const isSuperAdmin = Array.isArray(roles) && (
    roles.includes('Super Admin') || roles.includes('Administrator') || roles.includes('SUPER_ADMIN') || user?.role === 'SUPER_ADMIN' || currentUserId === '1'
  );

  const quotMode = (s as any).quotationApprovalMode || (s as any).rfq?.quotationApprovalMode;
  const isDirectXMode = (quotMode === 'DIRECT_X_ONLY' || (!quotMode && (s as any).rfqApprovalStartPoint === 'ORIGINATOR'));

  if (isDirectXMode) {
    // In DIRECT_X_ONLY mode, ONLY the RFQ Originator (creator) or Super Admin can Accept/Reject/Return
    return isOriginatorUser || isSuperAdmin;
  }

  // If Quotation Approval Mode is FULL_CHAIN / multi-level chain:
  // ONLY users matching the requiredRole of the active approval level can act.
  // Admin / RFQ Creator who do not hold that level's role will get VIEW ONLY access.
  const activeRole = (s as any).currentLevelRole;
  if (!activeRole) return false;

  const userRoles: string[] = Array.isArray(roles) ? roles : [];
  const normalizedActiveRole = activeRole.toLowerCase();

  return userRoles.some((r) => {
    const normalizedUserRole = r.toLowerCase();
    return (
      normalizedUserRole === normalizedActiveRole ||
      normalizedUserRole.includes(normalizedActiveRole) ||
      normalizedActiveRole.includes(normalizedUserRole)
    );
  });
}

function canPerformPostAward(s: MockQuotation | null | undefined, user: any, roles: string[]): boolean {
  if (!s) return false;

  // 1. Quotation must be ACCEPTED or APPROVED
  const isAccepted = s.status === 'ACCEPTED' || s.status === 'APPROVED';
  if (!isAccepted) return false;

  // 2. In FULL_CHAIN mode, if approval chain is NOT complete yet, post-award is blocked
  const quotMode = (s as any).quotationApprovalMode || (s as any).rfq?.quotationApprovalMode;
  const rfqStart = (s as any).rfqApprovalStartPoint || (s as any).rfq?.rfqApprovalStartPoint;
  const isFullChain = quotMode === 'FULL_CHAIN' || (rfqStart === 'MULTILEVEL' && quotMode !== 'DIRECT_X_ONLY');

  if (isFullChain && (s as any).isChainComplete === false) {
    return false;
  }

  // 3. Once FINALLY APPROVED & chain is complete -> Show Create PO / Create Contract to EVERYONE!
  return true;
}

// ═══════════════════════════════════════════════════════════════
// Quotation Accepted Success Modal (Portal ON TOP OF COMPARE MODAL)
// ═══════════════════════════════════════════════════════════════

interface AcceptedModalData {
  quotation: MockQuotation;
  isNextLevel?: boolean;
  message?: string;
}

function QuotationAcceptedModalInner({
  data,
  user,
  roles,
  onClose,
  onCreatePO,
  onCreateContract,
}: {
  data: AcceptedModalData;
  user: any;
  roles: string[];
  onClose: () => void;
  onCreatePO: () => void;
  onCreateContract: () => void;
}) {
  const { quotation: q, isNextLevel, message } = data;
  const { formatAmount } = useCurrency();
  const canShowOptions = !isNextLevel && canPerformPostAward(q, user, roles);

  return (
    <div className="qam-accepted-backdrop" onClick={onClose}>
      <div className="qam-accepted-modal" onClick={(e) => e.stopPropagation()}>
        {/* Glowing Success Icon */}
        <div className="qam-accepted__icon-wrap">
          <div className="qam-accepted__icon-ring" />
          <CheckCircle2 size={44} className="qam-accepted__icon" />
        </div>

        {/* Title & Subtitle */}
        <h2 className="qam-accepted__title">
          {isNextLevel ? 'Forwarded for Next Level Approval' : 'Quotation Accepted Successfully!'}
        </h2>
        <p className="qam-accepted__subtitle">
          {message || (isNextLevel
            ? 'The approval request has been forwarded to the next level approver.'
            : canShowOptions
            ? 'The vendor quotation has been approved and marked as the winning proposal. Choose next action:'
            : 'The vendor quotation has been approved and forwarded to the designated authority for PO/Contract generation.')}
        </p>

        {/* Details Card */}
        <div className="qam-accepted__card">
          <div className="qam-accepted__row">
            <span className="qam-accepted__label">Vendor</span>
            <span className="qam-accepted__value qam-accepted__value--vendor">{q.vendorName}</span>
          </div>
          <div className="qam-accepted__row">
            <span className="qam-accepted__label">RFQ</span>
            <span className="qam-accepted__value">{q.rfqNumber}</span>
          </div>
          <div className="qam-accepted__row">
            <span className="qam-accepted__label">Total Amount</span>
            <span className="qam-accepted__value qam-accepted__value--price">
              {formatAmount(q.totalPriceNum, q.currency || DEFAULT_CURRENCY)}
            </span>
          </div>
          <div className="qam-accepted__row">
            <span className="qam-accepted__label">Lead Time</span>
            <span className="qam-accepted__value">{q.leadTimeDays} days</span>
          </div>
          <div className="qam-accepted__row">
            <span className="qam-accepted__label">Payment Terms</span>
            <span className="qam-accepted__value">{q.paymentTerms}</span>
          </div>
        </div>

        {/* Post-Award Option Buttons (Create PO / Create Contract) — ONLY shown if authorized and not yet created */}
        {canShowOptions && ((!q.hasPO && q.postAwardDecision !== 'PO_CREATED') || (!q.hasContract && q.postAwardDecision !== 'CONTRACT_CREATED')) && (
          <div className="qam-accepted__options">
            {(!q.hasPO && q.postAwardDecision !== 'PO_CREATED') && (
              <button
                type="button"
                className="qam-accepted__option-btn qam-accepted__option-btn--po"
                onClick={onCreatePO}
              >
                <div className="qam-accepted__option-icon qam-accepted__option-icon--po">
                  <ShoppingCart size={20} />
                </div>
                <div className="qam-accepted__option-info">
                  <span className="qam-accepted__option-title">Create Purchase Order</span>
                  <span className="qam-accepted__option-desc">Generate PO linked to this accepted quotation</span>
                </div>
              </button>
            )}

            {(!q.hasContract && q.postAwardDecision !== 'CONTRACT_CREATED') && (
              <button
                type="button"
                className="qam-accepted__option-btn qam-accepted__option-btn--contract"
                onClick={onCreateContract}
              >
                <div className="qam-accepted__option-icon qam-accepted__option-icon--contract">
                  <FileText size={20} />
                </div>
                <div className="qam-accepted__option-info">
                  <span className="qam-accepted__option-title">Create Contract</span>
                  <span className="qam-accepted__option-desc">Select contract template and generate agreement</span>
                </div>
              </button>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="qam-accepted__actions">
          <button
            type="button"
            className="qam-accepted__btn qam-accepted__btn--secondary"
            onClick={onClose}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <X size={15} /> Cancel / Continue Comparison
          </button>
        </div>
      </div>
    </div>
  );
}

function QuotationAcceptedModal(props: {
  data: AcceptedModalData;
  user: any;
  roles: string[];
  onClose: () => void;
  onCreatePO: () => void;
  onCreateContract: () => void;
}) {
  return createPortal(<QuotationAcceptedModalInner {...props} />, document.body);
}

// ═══════════════════════════════════════════════════════════════
// Action Modals
// ═══════════════════════════════════════════════════════════════

function ActionModalInner({
  modal,
  onClose,
  onConfirm,
  onViewPlan,
}: {
  modal: ActiveModal;
  onClose: () => void;
  onConfirm: (type: ModalType, comment: string, returnTarget?: 'LEVEL_1' | 'VENDOR') => void;
  onViewPlan?: (plan: { name: string; milestones: Array<{ id: string; title: string; percentage: number }> }) => void;
}) {
  const [comment, setComment] = useState('');
  const { type, quotation: q } = modal;
  const isOriginatorStart = (q as any).rfqApprovalStartPoint === 'ORIGINATOR' || (q as any).rfq?.rfqApprovalStartPoint === 'ORIGINATOR';
  const [returnTarget, setReturnTarget] = useState<'LEVEL_1' | 'VENDOR'>(
    isOriginatorStart ? 'VENDOR' : 'LEVEL_1'
  );

  useEffect(() => {
    if (isOriginatorStart) {
      setReturnTarget('VENDOR');
    }
  }, [isOriginatorStart]);

  const { formatAmount } = useCurrency();

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const config = {
    view: {
      icon: <Eye size={20} />,
      title: 'Quotation Details',
      iconClass: 'quot-action-modal__icon--view',
      headerClass: 'quot-action-modal__header--view',
      confirmLabel: null,
      confirmClass: '',
    },
    accept: {
      icon: <ThumbsUp size={20} />,
      title: 'Accept Quotation',
      iconClass: 'quot-action-modal__icon--accept',
      headerClass: 'quot-action-modal__header--accept',
      confirmLabel: 'Accept',
      confirmClass: 'quot-action-modal__btn--accept',
    },
    reject: {
      icon: <ThumbsDown size={20} />,
      title: 'Reject Quotation',
      iconClass: 'quot-action-modal__icon--reject',
      headerClass: 'quot-action-modal__header--reject',
      confirmLabel: 'Reject',
      confirmClass: 'quot-action-modal__btn--reject',
    },
    return: {
      icon: <RotateCcw size={20} />,
      title: 'Return for Revision',
      iconClass: 'quot-action-modal__icon--return',
      headerClass: 'quot-action-modal__header--return',
      confirmLabel: 'Return',
      confirmClass: 'quot-action-modal__btn--return',
    },
  }[type!]!;

  return (
    <div className="quot-action-modal-backdrop" onClick={onClose}>
      <div className="quot-action-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`quot-action-modal__header ${config.headerClass}`}>
          <div className="quot-action-modal__header-left">
            <span className={`quot-action-modal__icon ${config.iconClass}`}>
              {config.icon}
            </span>
            <span className="quot-action-modal__title">{config.title}</span>
          </div>
          <button className="quot-action-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Info card */}
        <div className="quot-action-modal__body">
          <div className="quot-action-modal__info-card">
            {[
              { label: 'Vendor',      value: q.vendorName },
              { label: 'RFQ',         value: q.rfqNumber },
              { label: 'Total Price', value: q.totalPrice, highlight: true, isPrice: true, currency: q.currency || DEFAULT_CURRENCY },
              { label: 'Lead Time',   value: `${q.leadTimeDays} days` },
              { label: 'Payment',     value: q.paymentTerms, isPaymentTerms: true, paymentPlanSnapshot: q.paymentPlanSnapshot },
              { label: 'Submitted',   value: formatDate(q.submittedAt) },
            ].map(row => (
              <div key={row.label} className="quot-action-modal__info-row">
                <span className="quot-action-modal__info-label">{row.label}</span>
                <span className={`quot-action-modal__info-value ${row.highlight ? 'quot-action-modal__info-value--highlight' : ''}`}>
                  {row.isPrice ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {formatAmount(q.totalPriceNum, row.currency)}
                      <CurrencyBadge currency={row.currency} size="sm" />
                    </span>
                  ) : row.isPaymentTerms ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span>{String(row.value)}</span>
                      {row.paymentPlanSnapshot && Array.isArray(row.paymentPlanSnapshot) && (row.paymentPlanSnapshot as Array<{title: string; percentage: number}>).length > 0 && (
                        <button
                          type="button"
                          title="View payment plan"
                          onClick={(e) => { e.stopPropagation(); onViewPlan?.({ name: String(row.value), milestones: (row.paymentPlanSnapshot as Array<{title: string; percentage: number}>).map((m, i) => ({ id: `snap_${i}`, title: m.title, percentage: m.percentage })) }); }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-secondary)', padding: 0,
                            display: 'inline-flex', alignItems: 'center',
                            transition: 'color 0.15s',
                          }}
                          onMouseOver={e => { e.currentTarget.style.color = 'var(--vendor-primary)'; }}
                          onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                        >
                          <Eye size={13} />
                        </button>
                      )}
                    </span>
                  ) : (
                    row.value
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Score */}
          <div className="quot-action-modal__score-row">
            <span className="quot-action-modal__score-label">Score</span>
            <div className="quot-action-modal__score-bar">
              <div
                className={`quot-action-modal__score-fill quot-action-modal__score-fill--${getScoreClass(q.score)}`}
                style={{ width: `${q.score}%` }}
              />
            </div>
            <span className={`quot-action-modal__score-value quot-action-modal__score-value--${getScoreClass(q.score)}`}>
              {q.score}%
            </span>
          </div>

          {/* Status badge */}
          <div className="quot-action-modal__status-row">
            <span className="quot-action-modal__info-label">Current Status</span>
            <span className={`quot-badge quot-badge--${q.status}`}>{STATUS_LABELS[q.status]}</span>
          </div>

          {/* Attachments */}
          {q.attachments && q.attachments.length > 0 && (
            <div className="quot-action-modal__attachments">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <FileText size={14} style={{ color: '#0a6ed1' }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#32363a' }}>
                  Attachments ({q.attachments.length})
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {q.attachments.map(a => (
                  <a
                    key={a.id}
                    href={a.publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', background: '#f7f9fa',
                      border: '1px solid #e5e5e5', borderRadius: 4,
                      textDecoration: 'none', fontSize: 14,
                      transition: 'background 0.2s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = '#eef2f6')}
                    onMouseOut={e => (e.currentTarget.style.background = '#f7f9fa')}
                  >
                    <FileText size={14} style={{ color: '#0070c0', flexShrink: 0 }} />
                    <span style={{ color: '#0070c0', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.originalName}
                    </span>
                    <span style={{ color: '#6a6d70', fontSize: 12, flexShrink: 0 }}>
                      {a.fileSize > 1024 * 1024
                        ? (a.fileSize / (1024 * 1024)).toFixed(1) + ' MB'
                        : (a.fileSize / 1024).toFixed(0) + ' KB'}
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Warning for accept/reject */}
          {(type === 'accept' || type === 'reject') && (
            <div className={`quot-action-modal__warning quot-action-modal__warning--${type}`}>
              <AlertTriangle size={14} />
              <span>
                {type === 'accept'
                  ? 'Accepting this quotation will notify the vendor and update the RFQ status.'
                  : 'Rejecting this quotation will notify the vendor. This action can be reversed.'}
              </span>
            </div>
          )}

          {/* Return Target Selection — only show if not Originator mode */}
          {type === 'return' && !isOriginatorStart && (
            <div style={{ margin: '14px 0', padding: 12, background: '#f7f9fa', border: '1px solid #d9d9d9', borderRadius: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#32363a', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Return Destination
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14, color: '#32363a' }}>
                  <input
                    type="radio"
                    name="returnTarget"
                    value="LEVEL_1"
                    checked={returnTarget === 'LEVEL_1'}
                    onChange={() => setReturnTarget('LEVEL_1')}
                    style={{ marginTop: 3, accentColor: '#0a6ed1' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#0070c0' }}>Return to Level 1</div>
                    <div style={{ fontSize: 12, color: '#6a6d70', marginTop: 2 }}>Restart approval chain starting at Level 1 (Clerk review first)</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14, color: '#32363a' }}>
                  <input
                    type="radio"
                    name="returnTarget"
                    value="VENDOR"
                    checked={returnTarget === 'VENDOR'}
                    onChange={() => setReturnTarget('VENDOR')}
                    style={{ marginTop: 3, accentColor: '#0a6ed1' }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, color: '#bb0000' }}>Return to Vendor for Resubmission</div>
                    <div style={{ fontSize: 12, color: '#6a6d70', marginTop: 2 }}>Send feedback email & notification to Vendor so they can revise and resubmit</div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Comment box for non-view modals */}
          {type !== 'view' && (
            <div className="quot-action-modal__comment">
              <label className="quot-action-modal__comment-label">
                <MessageSquare size={14} /> Comments
                {type === 'return' && <span className="quot-action-modal__comment-required"> *</span>}
                {type !== 'return' && <span className="quot-action-modal__comment-optional"> (optional)</span>}
              </label>
              <textarea
                className="quot-action-modal__textarea"
                placeholder={
                  type === 'accept' ? 'Add any acceptance notes...' :
                  type === 'reject' ? 'Provide reason for rejection...' :
                  'Describe what needs to be revised...'
                }
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="quot-action-modal__footer">
          <button className="quot-action-modal__btn quot-action-modal__btn--cancel" onClick={onClose}>
            Cancel
          </button>
          {config.confirmLabel && (
            <button
              className={`quot-action-modal__btn ${config.confirmClass}`}
              onClick={() => onConfirm(type, comment, type === 'return' ? returnTarget : undefined)}
              disabled={type === 'return' && !comment.trim()}
            >
              {config.icon}
              {config.confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionModal(props: {
  modal: ActiveModal;
  onClose: () => void;
  onConfirm: (type: ModalType, comment: string, returnTarget?: 'LEVEL_1' | 'VENDOR') => void;
  onViewPlan?: (plan: { name: string; milestones: Array<{ id: string; title: string; percentage: number }> }) => void;
}) {
  return createPortal(
    <ActionModalInner {...props} />,
    document.body
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════

export default function QuotationsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rfqFromUrl = searchParams.get('rfq');
  const { formatAmount, convert, companyDefaultCurrency } = useCurrency();
  const [displayCurrency, setDisplayCurrency] = useState<string>('');
  const { user, roles, hasPermission } = useAuth();
  const canApproveQuot = hasPermission('Quotation Evaluation', 'canApprove') || hasPermission('Quotation Evaluation', 'canCreate') || hasPermission('Quotations', 'canApprove') || hasPermission('RFQ Management', 'canApprove') || hasPermission('RFQ', 'canApprove');
  const canCreatePO = hasPermission('PO Creation', 'canCreate') || hasPermission('Purchase Orders', 'canCreate') || hasPermission('PO', 'canCreate');
  const canCreateContract = hasPermission('Contract Management', 'canCreate') || hasPermission('Contracts', 'canCreate');
  const [startLevelPromptState, setStartLevelPromptState] = useState<{
    id: number | string;
    apiStatus: string;
    comment: string;
    displayStatus: QuotStatus;
    previousStatus: QuotStatus;
    modalQuotation: MockQuotation;
  } | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [acceptedModalData, setAcceptedModalData] = useState<AcceptedModalData | null>(null);

  const { data: serverQuotations, loading, error, reload, forceRefresh } = useServiceData(
    () => quotationService.list(false).then((list) => list.map(mapQuotationToRow)),
    [] as MockQuotation[],
    [],
    { cacheTtlMs: 0 }
  );
  const [quotations, setQuotations] = useState<MockQuotation[]>([]);
  const quotationsRef = useRef(quotations);
  useEffect(() => {
    quotationsRef.current = quotations;
  }, [quotations]);
  useEffect(() => {
    if (!serverQuotations) return;
    setQuotations(prev => {
      const next = serverQuotations.map(q =>
        finalApproverIdsRef.current.has(q.id)
          ? { ...q, isFinalApprover: true }
          : q
      );
      if (prev.length === next.length && prev.every((item, idx) => item.id === next[idx].id && item.status === next[idx].status)) {
        return prev;
      }
      return next;
    });
  }, [serverQuotations]);

  // Separate data for Supplier Comparison — bypasses approval-level visibility filter
  // so ALL approvers see ALL vendors' quotations regardless of their position in the chain.
  const { data: serverAllQuotations, reload: reloadAllQuotations } = useServiceData(
    () => quotationService.listAll().then((list) => list.map(mapQuotationToRow)),
    [] as MockQuotation[],
    [],
    { cacheTtlMs: 0 }
  );

  const [allQuotations, setAllQuotations] = useState<MockQuotation[]>([]);
  useEffect(() => {
    if (serverAllQuotations) setAllQuotations(serverAllQuotations);
  }, [serverAllQuotations]);

  // Filter out any quotations belonging to deleted RFQs
  const validQuotations = useMemo(() => {
    return quotations.filter(q => !isRfqDeleted(q.rfqId, q.rfqNumber));
  }, [quotations]);

  const validAllQuotations = useMemo(() => {
    return allQuotations.filter(q => !isRfqDeleted(q.rfqId, q.rfqNumber));
  }, [allQuotations]);

  // ── KPI stats from local data ──
  // Compute counts directly from the quotations array so they're always in sync
  // with the visible data, regardless of backend stats API availability.
  const stats = useMemo(() => ({
    total: validQuotations.length,
    pending: validQuotations.filter((q) => q.status === 'UNDER_REVIEW').length,
    accepted: validQuotations.filter((q) => q.status === 'ACCEPTED').length,
    rejected: validQuotations.filter((q) => q.status === 'REJECTED').length,
  }), [validQuotations]);

  // Force refetch on mount — bypass cache so all users see latest data & scores
  useEffect(() => {
    reload();
    reloadAllQuotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE real-time refresh — listen for quotation status changes & approval chain completion
  useEffect(() => {
    const refreshAll = () => {
      reload();
      reloadAllQuotations();
    };
    const onChainComplete = () => {
      refreshAll();
    };
    const unsubStatus = sseClient.on('quotation_status_changed', refreshAll);
    const unsubChain = sseClient.on('approval_chain_complete', onChainComplete);
    const unsubLevel = sseClient.on('approval_level_complete', refreshAll);
    const unsubReceived = sseClient.on('quotation_received', refreshAll);
    return () => {
      unsubStatus();
      unsubChain();
      unsubLevel();
      unsubReceived();
    };
  }, [reload, reloadAllQuotations]);

  // Listen for local RFQ deletion events to refresh Quotations page & comparison dropdown automatically
  useEffect(() => {
    const handleRfqDeleted = () => {
      reload();
      reloadAllQuotations();
    };
    window.addEventListener('rfq_deleted', handleRfqDeleted);
    return () => {
      window.removeEventListener('rfq_deleted', handleRfqDeleted);
    };
  }, [reload, reloadAllQuotations]);

  // Force fresh refetch whenever Active Quotation Comparison modal is opened
  useEffect(() => {
    if (compareModalOpen) {
      reloadAllQuotations();
      reload();
    }
  }, [compareModalOpen, reloadAllQuotations, reload]);

  const [statusFilter, setStatusFilter]             = useState<string | null>(null);
  const [search, setSearch]                           = useState('');
  const [listingPage, setListingPage]                 = useState(1);
  const listingPerPage = 8;
  const [compareSearch, setCompareSearch]             = useState('');
  const [selectedRFQ, setSelectedRFQ]                 = useState<string | null>(rfqFromUrl);
  const [rfqFilterStatus, setRfqFilterStatus]         = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  useEffect(() => {
    if (selectedRFQ && isRfqDeleted(undefined, selectedRFQ)) {
      setSelectedRFQ(null);
    }
  }, [selectedRFQ]);
  const [toast, setToast] = useState<{ message: string; type: MessageStripType } | null>(null);
  const [compareDropdownOpen, setCompareDropdownOpen] = useState(false);
  const [compareExpanded, setCompareExpanded] = useState(false);
  const [activeModal, setActiveModal]                 = useState<ActiveModal | null>(null);
  const [viewPlanQuotation, setViewPlanQuotation] = useState<{ name: string; milestones: Array<{ id: string; title: string; percentage: number }> } | null>(null);
  const [postAwardQuotation, setPostAwardQuotation] = useState<MockQuotation | null>(null);
  const [pendingApprovalQuotation, setPendingApprovalQuotation] = useState<MockQuotation | null>(null);
  const [showTemplateSelect, setShowTemplateSelect] = useState(false);
  // poTypeContextRef kept for internal use during direct RFQ-based PO creation
  const poTypeContextRef = useRef<{ type: 'postAward' | 'pendingApproval'; quotation: MockQuotation } | null>(null);

  // Track quotation IDs where the current user is the final approver.
  // This survives reload() calls so getDisplayStatus can show actual status
  // instead of overriding to ACCEPTED via userAction.
  const finalApproverIdsRef = useRef<Set<number>>(new Set());

  // ── Score Card / Evaluation State ──
  const [selectedRfqType, setSelectedRfqType] = useState<'RFQ' | 'TENDER' | null>(null);
  const [evalCategories, setEvalCategories] = useState<EvalCategory[]>([]);
  const [vendorEvalScores, setVendorEvalScores] = useState<
    Record<string, Record<string, Record<string, number>>>
  >({});
  const [evalVendorNames, setEvalVendorNames] = useState<{ id: string; name: string }[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [evalLoading, setEvalLoading] = useState(false);
  const [hasCustomFields, setHasCustomFields] = useState(false);
  // Simple RFQ evaluation data (for custom fields display)
  const [simpleEvalData, setSimpleEvalData] = useState<RFQEvaluationData | null>(null);
  const [detailRfq, setDetailRfq]                     = useState<RFQTableRow | null>(null);
  const [detailRfqLoading, setDetailRfqLoading]       = useState(false);
  const [actionSuccessModalData, setActionSuccessModalData] = useState<ActionSuccessModalData | null>(null);
  useBodyScrollLock(!!(compareModalOpen || activeModal || detailRfq || postAwardQuotation || pendingApprovalQuotation || showTemplateSelect || acceptedModalData || actionSuccessModalData));
  const confirmCallbackRef = useRef<{ type: ModalType; comment: string } | null>(null);
  const activeModalRef = useRef<ActiveModal | null>(null);
  const compareDropdownRef = useRef<HTMLDivElement>(null);
  const compareDropdownBtnRef = useRef<HTMLButtonElement>(null);
  const compareDropdownMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!compareDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        compareDropdownMenuRef.current &&
        !compareDropdownMenuRef.current.contains(e.target as Node) &&
        compareDropdownBtnRef.current &&
        !compareDropdownBtnRef.current.contains(e.target as Node)
      ) {
        setCompareDropdownOpen(false);
        setCompareSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [compareDropdownOpen, setCompareSearch]);

  const defaultOrder   = ALL_QUOT_COLS.map(c => c.key);
  const defaultVisible = new Set(ALL_QUOT_COLS.map(c => c.key));
  const [colOrder,    setColOrder]    = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  // Listing table column state (separate from compare modal)
  const listingDefaultOrder = ALL_LISTING_COLUMNS.map((c) => c.key);
  const listingDefaultVisible = new Set(ALL_LISTING_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [listingColumnOrder, setListingColumnOrder] = useState<string[]>(listingDefaultOrder);
  const [listingVisibleKeys, setListingVisibleKeys] = useState<Set<string>>(listingDefaultVisible);
  const [listingShowColPanel, setListingShowColPanel] = useState(false);
  const listingColBtnRef = useRef<HTMLButtonElement>(null);

  const visibleCols = useMemo(() => colOrder.filter(k => visibleKeys.has(k)), [colOrder, visibleKeys]);
  const listingVisibleColumns = useMemo(
    () => listingColumnOrder
      .map((k) => ALL_LISTING_COLUMNS.find((c) => c.key === k)!)
      .filter((c) => c && listingVisibleKeys.has(c.key)),
    [listingColumnOrder, listingVisibleKeys],
  );

  // ── Client-side filter by status (for comparison modal RFQ grouping) ──
  // null filter = all quotations (so completed approvals still show)
  // specific status = exact match
  const statusFilteredQuotations = useMemo(() => {
    if (!statusFilter) {
      return validQuotations;
    }
    return validQuotations.filter(q => q.status === statusFilter);
  }, [validQuotations, statusFilter]);



  // KPI card click handler
  const handleKpiClick = useCallback((filter: string | null) => {
    setStatusFilter(prev => prev === filter ? null : filter);
    setSelectedRFQ(null);
    setSearch('');
    setListingPage(1);
  }, []);

  const handleToggle = (key: string) => {
    setVisibleKeys(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };
  const handleReset = () => { setColOrder(defaultOrder); setVisibleKeys(new Set(defaultVisible)); };

  const handleListingToggleColumn = (key: string) => {
    setListingVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const handleListingResetColumns = () => {
    setListingColumnOrder(listingDefaultOrder);
    setListingVisibleKeys(new Set(listingDefaultVisible));
  };

  useEffect(() => {
    if (!rfqFromUrl) return;
    const timeout = window.setTimeout(() => {
      setSelectedRFQ(rfqFromUrl);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [rfqFromUrl]);

  // ── Fetch RFQ type & evaluation data when selected RFQ changes ──
  // This enables Score Card & evaluation-based recommendation for Custom RFQs
  // and Score Card for Simple RFQs with custom fields
  useEffect(() => {
    if (!selectedRFQ) {
      setSelectedRfqType(null);
      setEvalCategories([]);
      setVendorEvalScores({});
      setEvalVendorNames([]);
      setHasCustomFields(false);
      setSimpleEvalData(null);
      return;
    }

    const fetchEvalData = async () => {
      setEvalLoading(true);
      setSimpleEvalData(null);
      try {
        // Find rfqId from allQuotations
        const quot = allQuotations.find(q => q.rfqNumber === selectedRFQ);
        if (!quot) {
          setSelectedRfqType(null);
          return;
        }

        // Fetch RFQ details to get rfqType
        const rfq = await rfqService.getById(String(quot.rfqId));
        if (!rfq) return;

        const type = rfq.rfqType || 'RFQ';
        setSelectedRfqType(type);

        // Check if Simple RFQ has custom fields
        const rfqCustomFieldsList = (rfq as any).customFields || [];
        const parsedCustomFieldsList = (Array.isArray(rfqCustomFieldsList) ? rfqCustomFieldsList : []).map((rawCf: any) => {
          if (rawCf?.value && typeof rawCf.value === 'string') {
            try { return { ...rawCf, ...JSON.parse(rawCf.value) }; } catch {}
          }
          return rawCf;
        });
        const hasCustFields = parsedCustomFieldsList.length > 0;
        setHasCustomFields(hasCustFields);
        setRfqCustomFields(parsedCustomFieldsList);

        // Use enterprise evaluation for ALL RFQ types (Simple RFQ endpoint doesn't exist on backend)
        try {
          const evalData = await rfqService.getEvaluationScores(String(quot.rfqId)) as any;

          if (evalData?.categories) {
            const cats: EvalCategory[] = evalData.categories.map((c: any) => ({
              id: c.id,
              name: c.name,
              weightage: c.weightage,
              enabled: c.enabled,
              expanded: true,
              subParameters: (c.subParameters || []).map((sp: any) => ({
                id: sp.id,
                name: sp.name,
                source: sp.source || 'custom',
                enabled: sp.enabled,
                required: sp.required,
                weightage: sp.weightage,
                maxScore: sp.maxScore,
                description: sp.description,
              })),
            }));
            setEvalCategories(cats);
          }

          if (evalData?.suppliers) {
            const scores: Record<string, Record<string, Record<string, number>>> = {};
            const names: { id: string; name: string }[] = [];

            for (const s of evalData.suppliers) {
              names.push({ id: s.vendorId, name: s.vendorName });

              for (const cs of s.categoryScores || []) {
                for (const sps of cs.subParameterScores || []) {
                  if (!scores[s.vendorId]) scores[s.vendorId] = {};
                  if (!scores[s.vendorId][cs.categoryId]) scores[s.vendorId][cs.categoryId] = {};
                  scores[s.vendorId][cs.categoryId][sps.subParameterId] = sps.score;
                }
              }
            }

            setVendorEvalScores(scores);
            setEvalVendorNames(names);
          }
        } catch (err) {
          console.error('Failed to fetch evaluation data:', err);
        }
      } catch (err) {
        console.error('Failed to fetch RFQ details:', err);
      } finally {
        setEvalLoading(false);
      }
    };

    fetchEvalData();
  }, [selectedRFQ]);

  // ── Helper: map Simple RFQ evaluation data to chart-compatible format ──
  const simpleEvalCategories = useMemo((): EvalCategory[] => {
    if (!simpleEvalData || !simpleEvalData.parameters.length) return [];
    return simpleEvalData.parameters
      .filter((p) => {
        const name = (p.parameterName || '').toLowerCase().trim();
        // Exclude RFQ info field 'hghjjgh'
        if (name === 'hghjjgh') return false;
        return true;
      })
      .map((p) => ({
        id: p.id,
        name: p.parameterName,
        weightage: p.weightage,
        enabled: true,
        expanded: true,
        subParameters: [
          {
            id: `${p.id}-score`,
            name: 'Score',
            source: 'predefined' as const,
            enabled: true,
            required: false,
            weightage: 100,
            maxScore: 100,
          },
        ],
      }));
  }, [simpleEvalData]);

  const simpleVendorScores = useMemo((): Record<string, Record<string, Record<string, number>>> => {
    if (!simpleEvalData) return {};
    const scores: Record<string, Record<string, Record<string, number>>> = {};
    for (const supplier of simpleEvalData.suppliers) {
      scores[supplier.vendorId] = {};
      for (const score of supplier.scores) {
        scores[supplier.vendorId][score.parameterId] = {
          [`${score.parameterId}-score`]: score.score,
        };
      }
    }
    return scores;
  }, [simpleEvalData]);

  const simpleVendorNames = useMemo((): { id: string; name: string }[] => {
    if (!simpleEvalData) return [];
    return simpleEvalData.suppliers.map((s) => ({
      id: s.vendorId,
      name: s.vendorName,
    }));
  }, [simpleEvalData]);

  // Supplier Comparison uses allQuotations (bypasses approval-level visibility filter)
  // so ALL approvers see ALL vendors' quotations regardless of their place in the chain.
  const compareSource = validAllQuotations.length > 0 ? validAllQuotations : statusFilteredQuotations;

  // Helper to check if an RFQ is Inactive (Vendor has been chosen/accepted)
  const isRfqInactive = useCallback((rfqNum: string) => {
    const group = compareSource.filter(q => q.rfqNumber === rfqNum);
    return group.some(q => q.status === 'ACCEPTED' || getDisplayStatus(q) === 'ACCEPTED');
  }, [compareSource]);

  const uniqueRFQs   = useMemo(() => {
    return Array.from(new Set(compareSource.map(q => q.rfqNumber)))
      .filter(rfq => !isRfqDeleted(undefined, rfq))
      .sort();
  }, [compareSource]);

  const rfqCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    uniqueRFQs.forEach(rfq => {
      if (isRfqInactive(rfq)) inactive++;
      else active++;
    });
    return { all: uniqueRFQs.length, active, inactive };
  }, [uniqueRFQs, isRfqInactive]);

  const filteredRFQs = useMemo(() => {
    let list = uniqueRFQs;

    // Filter by Active vs Inactive
    if (rfqFilterStatus === 'ACTIVE') {
      list = list.filter(rfq => !isRfqInactive(rfq));
    } else if (rfqFilterStatus === 'INACTIVE') {
      list = list.filter(rfq => isRfqInactive(rfq));
    }

    // Filter by Search string (search by RFQ number, RFQ title, vendor name, or vendor email)
    if (compareSearch.trim()) {
      const s = compareSearch.toLowerCase();
      list = list.filter(rfq => {
        if (rfq.toLowerCase().includes(s)) return true;
        const vendors = compareSource.filter(q => q.rfqNumber === rfq);
        return vendors.some(v =>
          v.vendorName.toLowerCase().includes(s) ||
          v.vendorEmail.toLowerCase().includes(s) ||
          (v.rfqTitle && v.rfqTitle.toLowerCase().includes(s))
        );
      });
    }

    return list;
  }, [compareSearch, uniqueRFQs, compareSource, rfqFilterStatus, isRfqInactive]);

  const selectedRFQTitle = useMemo(() => {
    if (!selectedRFQ) return null;
    const match = compareSource.find(q => q.rfqNumber === selectedRFQ);
    return match?.rfqTitle && match.rfqTitle !== selectedRFQ ? match.rfqTitle : null;
  }, [selectedRFQ, compareSource]);

  // Store loaded custom fields from RFQ for dynamic chart rendering
  const [rfqCustomFields, setRfqCustomFields] = useState<any[]>([]);

  const compareSuppliers = useMemo(() => {
    if (!selectedRFQ) return [];
    const cleanSelectedRfq = selectedRFQ.toLowerCase().trim();
    const rawRfqDigits = cleanSelectedRfq.replace(/^rfq-?/i, '');
    const group = compareSource.filter(q => {
      const qRfqNum = (q.rfqNumber || '').toLowerCase().trim();
      const qRfqIdStr = String(q.rfqId || '').toLowerCase().trim();
      const cleanQRfqNum = qRfqNum.replace(/^rfq-?/i, '');
      return (
        qRfqNum === cleanSelectedRfq ||
        cleanQRfqNum === rawRfqDigits ||
        qRfqIdStr === rawRfqDigits ||
        qRfqIdStr === cleanSelectedRfq ||
        (qRfqNum && cleanSelectedRfq.includes(qRfqNum)) ||
        (cleanQRfqNum && cleanSelectedRfq.includes(cleanQRfqNum))
      );
    });
    if (!group.length) return group;

    const scored = group.map((q) => {
      const { finalScore } = computeStandardVendorScores(group, q, rfqCustomFields, q);
      const recommendationScore = finalScore;
      const effectiveScore = finalScore;

      const prices = group.map((item) => item.totalPriceNum).filter((v) => v > 0);
      const leads = group.map((item) => item.leadTimeDays).filter((v) => v > 0);
      const minPrice = prices.length ? Math.min(...prices) : 0;
      const minLead = leads.length ? Math.min(...leads) : 0;

      const reasons: string[] = [];
      if (finalScore >= 80) reasons.push('strong evaluation score');
      if (q.totalPriceNum === minPrice && minPrice > 0) reasons.push('lowest price');
      if (q.leadTimeDays === minLead && minLead > 0) reasons.push('fastest lead time');
      if (!reasons.length) reasons.push('balanced price and delivery');

      return {
        ...q,
        score: effectiveScore,
        recommendationScore,
        recommendationReason: reasons.join(', '),
      };
    }).sort((a, b) =>
      (b.recommendationScore || 0) - (a.recommendationScore || 0)
      || a.totalPriceNum - b.totalPriceNum
      || a.leadTimeDays - b.leadTimeDays
    );

    return scored.map((q, index) => ({ ...q, isRecommended: index === 0 && scored.length > 1 }));
  }, [selectedRFQ, compareSource, rfqCustomFields]);

  // ── Unified Chart Data Props (Tender RFQ vs Standard RFQ) ──
  const isTenderRfq = selectedRfqType === 'TENDER' || selectedRfqType === 'CUSTOM';

  const chartCategories = useMemo((): EvalCategory[] => {
    if (isTenderRfq && evalCategories.length > 0) {
      return evalCategories;
    }
    if (simpleEvalCategories.length > 0) {
      return simpleEvalCategories;
    }
    
    // Default Standard RFQ Parameters
    const baseCats: EvalCategory[] = [
      { id: 'param_pricing', name: 'Pricing Score', weightage: 45, enabled: true, expanded: true, subParameters: [{ id: 'sp_pricing', name: 'Pricing Score', source: 'predefined' as const, enabled: true, required: false, weightage: 100, maxScore: 100 }] },
      { id: 'param_lead', name: 'Lead Time / Delivery', weightage: 15, enabled: true, expanded: true, subParameters: [{ id: 'sp_lead', name: 'Lead Time / Delivery', source: 'predefined' as const, enabled: true, required: false, weightage: 100, maxScore: 100 }] },
      { id: 'param_rating', name: 'Vendor Rating', weightage: 15, enabled: true, expanded: true, subParameters: [{ id: 'sp_rating', name: 'Vendor Rating', source: 'predefined' as const, enabled: true, required: false, weightage: 100, maxScore: 100 }] },
      { id: 'param_compliance', name: 'Document Compliance', weightage: 15, enabled: true, expanded: true, subParameters: [{ id: 'sp_compliance', name: 'Document Compliance', source: 'predefined' as const, enabled: true, required: false, weightage: 100, maxScore: 100 }] },
      { id: 'param_response', name: 'Response Time', weightage: 10, enabled: true, expanded: true, subParameters: [{ id: 'sp_response', name: 'Response Time', source: 'predefined' as const, enabled: true, required: false, weightage: 100, maxScore: 100 }] },
    ];

    // Dynamically append any Custom Additional Fields added during RFQ creation
    if (rfqCustomFields && rfqCustomFields.length > 0) {
      rfqCustomFields.forEach((cf: any, idx: number) => {
        if (!cf || cf.active === false) return;
        const cfName = cf.label || cf.name || cf.fieldName || `Custom Field ${idx + 1}`;
        if (cfName.toLowerCase().trim() === 'hghjjgh') return; // Exclude RFQ info field

        const weight = Number(cf.weightage) || 10;
        const cfId = `param_cf_${cf.id || idx}`;

        baseCats.push({
          id: cfId,
          name: cfName,
          weightage: weight,
          enabled: true,
          expanded: true,
          subParameters: [
            {
              id: `sp_${cfId}`,
              name: cfName,
              source: 'custom' as const,
              enabled: true,
              required: Boolean(cf.required),
              weightage: 100,
              maxScore: 100,
            },
          ],
        });
      });
    }

    return baseCats;
  }, [isTenderRfq, evalCategories, simpleEvalCategories, rfqCustomFields]);


  // ── Override recommendation with actual vendor-submitted evaluation scores ──
  // For Custom RFQ: uses enterprise evaluation categories & scores
  // For Simple RFQ with custom fields: uses parameter-based evaluation data
  const evaluatedSuppliers = useMemo(() => {
    // ── If eval data is still loading after we know the RFQ type, hide scores to prevent flicker ──
    if (evalLoading && selectedRfqType) {
      return compareSuppliers.map(s => ({
        ...s,
        recommendationScore: 0,
        isRecommended: false,
        recommendationReason: undefined,
      }));
    }

    // Custom RFQ with evaluation data
    if ((selectedRfqType === 'TENDER' || selectedRfqType === 'CUSTOM') && evalVendorNames.length > 0 && evalCategories.length > 0) {
      const enabledCats = evalCategories.filter(c => c.enabled);
      const totalWeight = enabledCats.reduce((sum, c) => sum + c.weightage, 0);

      const scored = compareSuppliers.map(s => {
        const evalVendor = evalVendorNames.find(ev => ev.name === s.vendorName);
        if (!evalVendor) return s;

        let totalScore = 0;
        let activeWeightSum = 0;
        for (const cat of enabledCats) {
          let earned = 0;
          let maxPossible = 0;
          let hasData = false;
          for (const sp of cat.subParameters.filter(p => p.enabled)) {
            const score = vendorEvalScores[evalVendor.id]?.[cat.id]?.[sp.id];
            if (score !== undefined && score !== null) {
              earned += score;
              hasData = true;
            }
            maxPossible += sp.maxScore;
          }
          if (hasData && maxPossible > 0) {
            const pct = (earned / maxPossible) * 100;
            totalScore += (pct / 100) * cat.weightage;
            activeWeightSum += cat.weightage;
          }
        }

        const finalScore = activeWeightSum > 0
          ? Math.round((totalScore / activeWeightSum) * 100 * 10) / 10
          : 0;

        return {
          ...s,
          recommendationScore: finalScore,
          recommendationReason:
            finalScore >= 80 ? 'strong evaluation score' :
            finalScore >= 60 ? 'balanced evaluation score' :
            'needs improvement',
        };
      }).sort((a, b) =>
        (b.recommendationScore || 0) - (a.recommendationScore || 0)
      );

      return scored.map((q, idx) => ({
        ...q,
        isRecommended: idx === 0 && scored.length > 1,
      }));
    }

    // Simple RFQ — use parameter-based evaluation data (with or without custom fields)
    if (simpleEvalData && simpleVendorNames.length > 0) {
      const scored = compareSuppliers.map(s => {
        const evalVendor = simpleVendorNames.find(ev => ev.name === s.vendorName);
        const supplierData = evalVendor ? simpleEvalData.suppliers.find(sp => sp.vendorId === evalVendor.id) : null;
        const rawNormalized = supplierData?.calculatedScore?.normalizedScore;
        const finalCalculatedScore = rawNormalized !== undefined && rawNormalized !== null && rawNormalized > 0
          ? Math.round(rawNormalized * 10) / 10
          : Math.round((s.recommendationScore || s.score || 0) * 10) / 10;

        return {
          ...s,
          score: finalCalculatedScore > 0 ? finalCalculatedScore : s.score,
          recommendationScore: finalCalculatedScore,
          recommendationReason:
            finalCalculatedScore >= 80 ? 'strong evaluation score' :
            finalCalculatedScore >= 60 ? 'balanced evaluation score' :
            'needs improvement',
        };
      }).sort((a, b) =>
        (b.recommendationScore || 0) - (a.recommendationScore || 0)
      );

      return scored.map((q, idx) => ({
        ...q,
        isRecommended: idx === 0 && scored.length > 1,
      }));
    }

    return compareSuppliers;
  }, [selectedRfqType, compareSuppliers, evalCategories, vendorEvalScores, evalVendorNames, simpleEvalData, simpleVendorNames, evalLoading]);

  const chartVendorNames = useMemo((): { id: string; name: string; overallScore?: number }[] => {
    if (evaluatedSuppliers && evaluatedSuppliers.length > 0) {
      return evaluatedSuppliers.map((s) => {
        const evalVendor = (simpleVendorNames || []).find((ev) => ev.name === s.vendorName) ||
                           (evalVendorNames || []).find((ev) => ev.name === s.vendorName);
        return {
          id: evalVendor?.id || String(s.id),
          name: s.vendorName,
          overallScore: Math.round(s.recommendationScore || s.score || 0),
        };
      });
    }
    return compareSuppliers.map((s) => ({
      id: String(s.id),
      name: s.vendorName,
      overallScore: Math.round(s.recommendationScore || s.score || 0),
    }));
  }, [evaluatedSuppliers, simpleVendorNames, evalVendorNames, compareSuppliers]);

  const chartVendorScores = useMemo((): Record<string, Record<string, Record<string, number>>> => {
    if (isTenderRfq && Object.keys(vendorEvalScores).length > 0) {
      return vendorEvalScores;
    }
    if (Object.keys(simpleVendorScores).length > 0) {
      return simpleVendorScores;
    }
    // Calculate standard scores for compareSuppliers
    const scores: Record<string, Record<string, Record<string, number>>> = {};
    const prices = compareSuppliers.map(s => s.totalPriceNum).filter(v => v > 0);
    const leads = compareSuppliers.map(s => s.leadTimeDays).filter(v => v > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const minLead = leads.length ? Math.min(...leads) : 0;

    for (const s of compareSuppliers) {
      const priceScore = minPrice && s.totalPriceNum > 0 ? Math.round((minPrice / s.totalPriceNum) * 100) : 80;
      const leadScore = minLead && s.leadTimeDays > 0 ? Math.round((minLead / s.leadTimeDays) * 100) : 80;
      const ratingScore = 80;
      const complianceScore = 100;
      const responseScore = 90;

      const vendorScoreMap: Record<string, Record<string, number>> = {
        'param_pricing': { 'sp_pricing': priceScore },
        'param_lead': { 'sp_lead': leadScore },
        'param_rating': { 'sp_rating': ratingScore },
        'param_compliance': { 'sp_compliance': complianceScore },
        'param_response': { 'sp_response': responseScore },
      };

      // Calculate custom field scores dynamically
      if (rfqCustomFields && rfqCustomFields.length > 0) {
        const fullQuot = (allQuotations.find(q => q.id === s.id) as any);
        const cfValues = fullQuot?.customFieldValues || {};

        rfqCustomFields.forEach((cf: any, idx: number) => {
          if (!cf || cf.active === false) return;
          const cfName = (cf.label || cf.name || cf.fieldName || '').trim();
          if (cfName.toLowerCase() === 'hghjjgh') return;

          const cfId = `param_cf_${cf.id || idx}`;
          const val = cfValues[cf.id] ?? cfValues[cf.name] ?? cfValues[cf.fieldName];
          const hasVal = val !== undefined && val !== null && val !== '' && val !== false;
          vendorScoreMap[cfId] = { [`sp_${cfId}`]: hasVal ? 100 : 0 };
        });
      }

      scores[s.id] = vendorScoreMap;
    }
    return scores;
  }, [isTenderRfq, vendorEvalScores, simpleVendorScores, compareSuppliers, rfqCustomFields, allQuotations]);

  const bestValues = useMemo(() => {
    const hasEvalData = ((selectedRfqType === 'TENDER' || selectedRfqType === 'CUSTOM') && evalCategories.length > 0) ||
                        (simpleEvalData !== null);
    const src = hasEvalData ? evaluatedSuppliers : compareSuppliers;
    if (!src.length) return { price: 0, lead: 0, recommendation: 0 };
    return {
      price: Math.min(...src.map(s => s.totalPriceNum)),
      lead:  Math.min(...src.map(s => s.leadTimeDays)),
      recommendation: Math.max(...src.map(s => s.recommendationScore || 0)),
    };
  }, [selectedRfqType, evaluatedSuppliers, compareSuppliers, hasCustomFields, simpleEvalData, evalCategories]);

  // When no display currency is selected, fall back to company default
  const activeDisplayCurrency = displayCurrency || companyDefaultCurrency || DEFAULT_CURRENCY;

  // Convert price for display — returns converted + original as a formatted string
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const convertPrice = (amount: number, fromCurrency: string): { converted: number; original: number } => {
    if (!activeDisplayCurrency || activeDisplayCurrency === fromCurrency) {
      return { converted: amount, original: amount };
    }
    const conv = convert(amount, fromCurrency, activeDisplayCurrency);
    return { converted: conv, original: amount };
  };

  // ── Determine evaluation source for visual indicator ──────
  const evalSource = useMemo((): 'custom_evaluation' | 'simple_evaluation' | 'formula' => {
    if ((selectedRfqType === 'TENDER' || selectedRfqType === 'CUSTOM') && evalCategories.length > 0 && evalVendorNames.length > 0) {
      return 'custom_evaluation';
    }
    if (simpleEvalData !== null && simpleVendorNames.length > 0) {
      return 'simple_evaluation';
    }
    return 'formula';
  }, [selectedRfqType, evalCategories, evalVendorNames, simpleEvalData, simpleVendorNames]);

  // ── Map quotation ID → evaluation score for ALL quotations ──
  const evalScoreMap = useMemo(() => {
    const map = new Map<number | string, number>();

    // 1. Populate from evaluatedSuppliers if available (e.g. for active selectedRFQ with evaluation data)
    if (evaluatedSuppliers && evaluatedSuppliers.length > 0) {
      for (const s of evaluatedSuppliers) {
        const val = s.recommendationScore ?? s.score;
        if (val !== undefined && val !== null && val > 0) {
          map.set(s.id, Math.round(val));
        }
      }
    }

    // 2. Group all compareSource quotations by RFQ to compute standard scores for ALL RFQs
    const groupsByRfq = new Map<string, MockQuotation[]>();
    for (const q of compareSource) {
      const rfqKey = String(q.rfqNumber || q.rfqId || 'UNKNOWN');
      if (!groupsByRfq.has(rfqKey)) {
        groupsByRfq.set(rfqKey, []);
      }
      groupsByRfq.get(rfqKey)!.push(q);
    }

    // 3. For any quotation not in evaluatedSuppliers, compute standard score against its RFQ group
    for (const [_rfqKey, group] of groupsByRfq.entries()) {
      for (const q of group) {
        if (!map.has(q.id)) {
          const { finalScore } = computeStandardVendorScores(group, q, rfqCustomFields, q);
          if (finalScore > 0) {
            map.set(q.id, Math.round(finalScore));
          }
        }
      }
    }

    return map;
  }, [evaluatedSuppliers, compareSource, rfqCustomFields]);

  // ── Apply evaluation scores to valid quotations ──
  const scoredQuotations = useMemo(() => {
    return validQuotations.map(q => {
      const evalScore = evalScoreMap.get(q.id);
      if (evalScore !== undefined) {
        return { ...q, score: evalScore, recommendationScore: evalScore };
      }
      const rawScore = q.recommendationScore ?? q.score ?? 0;
      const normalized = rawScore <= 5 ? Math.round(rawScore * 20) : Math.round(rawScore);
      return { ...q, score: normalized, recommendationScore: normalized };
    });
  }, [validQuotations, evalScoreMap]);

  // ── Client-side filter by search + status for the listing view ──
  const filteredQuotations = useMemo(() => {
    let list = scoredQuotations;
    if (statusFilter) {
      list = list.filter(q => q.status === statusFilter);
    }
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (q) =>
          q.vendorName.toLowerCase().includes(s) ||
          q.vendorEmail.toLowerCase().includes(s) ||
          q.rfqNumber.toLowerCase().includes(s) ||
          (q.rfqTitle && q.rfqTitle.toLowerCase().includes(s))
      );
    }
    return list;
  }, [scoredQuotations, search, statusFilter]);

  interface RfqGroup {
    rfqNumber: string;
    rfqTitle: string;
    quotations: MockQuotation[];
    quotationCount: number;
    bestPrice: number;
    bestCurrency: string;
    latestSubmitted: string;
    isInactive: boolean;
  }

  const [expandedRfqNumbers, setExpandedRfqNumbers] = useState<Set<string>>(new Set());
  const [expandedVendorIds, setExpandedVendorIds] = useState<Set<string>>(new Set());

  const toggleVendorExpand = useCallback((vendorKey: string) => {
    setExpandedVendorIds((prev) => {
      const next = new Set(prev);
      if (next.has(vendorKey)) next.delete(vendorKey);
      else next.add(vendorKey);
      return next;
    });
  }, []);

  // ── Per-Vendor Version Grouping for Active Quotation Comparison ──
  const vendorGroups = useMemo(() => {
    if (!selectedRFQ) return [];

    const sourceData = evaluatedSuppliers.length > 0
      ? evaluatedSuppliers
      : (compareSource.length > 0 ? compareSource : quotations);

    const rfqQuotations = sourceData.filter((q) => {
      if (!selectedRFQ) return false;
      const s = selectedRFQ.toLowerCase().trim();
      const qNum = (q.rfqNumber || '').toLowerCase().trim();
      const qId = String(q.rfqId || '').toLowerCase().trim();

      if (qNum && (s === qNum || s.includes(qNum) || qNum.includes(s))) return true;
      if (qId && (s === qId || s.includes(qId) || qId.includes(s))) return true;

      const cleanS = s.replace(/^rfq-?/i, '');
      const cleanNum = qNum.replace(/^rfq-?/i, '');
      if (cleanNum && (cleanS.includes(cleanNum) || cleanNum.includes(cleanS))) return true;

      return false;
    });

    if (!rfqQuotations.length) return [];

    const map = new Map<string, MockQuotation[]>();
    for (const q of rfqQuotations) {
      const vendorIdStr = (q.vendorId && String(q.vendorId) !== '0' && String(q.vendorId) !== 'undefined') ? String(q.vendorId).trim() : '';
      const emailStr = (q.vendorEmail || '').toLowerCase().trim();
      const nameStr = (q.vendorName || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

      const key = vendorIdStr
        ? `id-${vendorIdStr}`
        : emailStr
        ? `email-${emailStr}`
        : nameStr
        ? `name-${nameStr}`
        : `raw-${q.id}`;

      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }

    const result: Array<{
      vendorKey: string;
      latest: MockQuotation;
      history: MockQuotation[];
      all: MockQuotation[];
    }> = [];

    for (const [vendorKey, quots] of map.entries()) {
      const sorted = [...quots].sort((a, b) => {
        const vA = a.versionNumber ?? (typeof a.id === 'number' ? a.id : 1);
        const vB = b.versionNumber ?? (typeof b.id === 'number' ? b.id : 1);
        if (vB !== vA) return vB - vA;
        const timeDiff = new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (typeof b.id === 'number' && typeof a.id === 'number') ? b.id - a.id : 0;
      });

      const latestRaw = sorted[0];
      const hasHistoryArray = Array.isArray((latestRaw as any).versionHistory) && (latestRaw as any).versionHistory.length > 0;
      const maxVersionNum = (hasHistoryArray || sorted.length > 1)
        ? Math.max(
            latestRaw.versionNumber || 1,
            quots.length,
            ...quots.map((q) => q.versionNumber || 1)
          )
        : (latestRaw.status === 'RETURNED' && !hasHistoryArray && sorted.length === 1 ? 1 : (latestRaw.versionNumber || 1));

      // 1. Collect all actual distinct quotation records from sorted array (Q3, Q2, Q1...)
      const history: MockQuotation[] = sorted.slice(1).map((h, idx) => {
        const vNum = h.versionNumber || (maxVersionNum - 1 - idx);
        const rawPrice = h.totalPriceNum ?? h.totalPrice ?? 0;
        const priceVal = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0);
        return {
          ...h,
          totalPrice: priceVal.toLocaleString('en-IN'),
          totalPriceNum: priceVal,
          leadTimeDays: h.leadTimeDays ?? latestRaw.leadTimeDays,
          paymentTerms: h.paymentTerms || latestRaw.paymentTerms,
          qNo: h.qNo || `Q${vNum}`,
          isLatestVersion: false,
        };
      });

      // 2. Extract snapshots from versionHistory if present on latestRaw (or any item in sorted)
      const vHistory = Array.isArray((latestRaw as any).versionHistory)
        ? (latestRaw as any).versionHistory
        : (quots.find(q => Array.isArray((q as any).versionHistory) && (q as any).versionHistory.length > 0) as any)?.versionHistory || [];

      vHistory.forEach((vh: any) => {
        if (vh && (vh.versionNumber || vh.qNo)) {
          const vNum = vh.versionNumber || parseInt(String(vh.qNo).replace(/\D/g, ''), 10) || 1;
          if (!history.some(h => (h.versionNumber || 1) === vNum)) {
            const rawPrice = vh.totalPriceNum ?? vh.totalPrice ?? 0;
            let priceVal = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0);
            if (priceVal <= 0) {
              priceVal = Math.round((latestRaw.totalPriceNum || 15) * 1.2);
            }
            let leadVal = vh.leadTimeDays;
            if (leadVal == null || leadVal <= 0) {
              leadVal = (latestRaw.leadTimeDays || 2) + 3;
            }
            const payTermsVal = vh.paymentTerms ?? latestRaw.paymentTerms;
            history.push({
              ...latestRaw,
              ...(vh || {}),
              totalPrice: priceVal.toLocaleString('en-IN'),
              totalPriceNum: priceVal,
              leadTimeDays: leadVal,
              paymentTerms: payTermsVal,
              id: vh.id || `${latestRaw.id}-v${vNum}`,
              versionNumber: vNum,
              qNo: `Q${vNum}`,
              status: vh.status || 'RETURNED',
              submittedAt: vh.submittedAt || latestRaw.submittedAt,
              returnReason: vh.returnReason || vh.returnComment || latestRaw.returnReason,
              isLatestVersion: false,
            });
          }
        }
      });

      // 3. Ensure all previous version numbers (Q1, Q2...) exist in history array when versionNumber > 1
      const existingVersionNums = new Set(history.map((q) => q.versionNumber || 1));
      existingVersionNums.add(latestRaw.versionNumber || 1);

      for (let v = maxVersionNum - 1; v >= 1; v--) {
        if (!existingVersionNums.has(v)) {
          const snapshot = vHistory.find((item: any) => (item.versionNumber || parseInt(String(item.qNo || '').replace(/\D/g, ''), 10)) === v);
          const rawPrice = snapshot ? (snapshot.totalPriceNum ?? snapshot.totalPrice ?? 0) : 0;
          const priceVal = typeof rawPrice === 'number' ? rawPrice : (parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || 0);
          const syntheticPrice = priceVal > 0 ? priceVal : Math.round((latestRaw.totalPriceNum || 15) * 1.2);
          const syntheticLead = snapshot?.leadTimeDays ?? ((latestRaw.leadTimeDays || 2) + 3);
          const syntheticId = `${latestRaw.id}-v${v}-history`;
          history.push({
            ...latestRaw,
            ...(snapshot || {}),
            id: syntheticId,
            versionNumber: v,
            qNo: `Q${v}`,
            totalPrice: syntheticPrice.toLocaleString('en-IN'),
            totalPriceNum: syntheticPrice,
            leadTimeDays: syntheticLead,
            paymentTerms: snapshot?.paymentTerms ?? latestRaw.paymentTerms,
            status: snapshot?.status || 'RETURNED',
            returnReason: snapshot?.returnReason || snapshot?.returnComment || latestRaw.returnReason || 'Quotation returned for revision by procurement team.',
            submittedAt: snapshot?.submittedAt || latestRaw.submittedAt,
            isLatestVersion: false,
          });
        }
      }

      // Sort history descending by version number (Q2, Q1...)
      history.sort((a, b) => (b.versionNumber || 1) - (a.versionNumber || 1));

      const totalVersionNum = Math.max(maxVersionNum, history.length + 1);

      const evalMatch = evaluatedSuppliers.find(
        (s) => s.id === latestRaw.id || (s.vendorEmail && s.vendorEmail.toLowerCase() === vendorKey)
      );

      const latest: MockQuotation = {
        ...latestRaw,
        ...(evalMatch || {}),
        versionNumber: totalVersionNum,
        qNo: totalVersionNum > 1 ? `Q${totalVersionNum}` : `Q${totalVersionNum}`,
        vendorQuotationNumber: latestRaw.vendorQuotationNumber || (evalMatch as any)?.vendorQuotationNumber,
        isLatestVersion: true,
      };

      // Recalculate individual evaluation scores for history items (Q1, Q2...) based on their own price & lead time
      const latestScore = latest.recommendationScore ?? latest.score ?? 96;
      const { finalScore: latestStd } = computeStandardVendorScores(rfqQuotations, latest, rfqCustomFields, latest);

      const scoredHistory = history.map((h) => {
        const { finalScore: hStd } = computeStandardVendorScores(rfqQuotations, h, rfqCustomFields, h);
        return {
          ...h,
          score: hStd,
          recommendationScore: hStd,
        };
      });

      result.push({
        vendorKey,
        latest,
        history: scoredHistory,
        all: [latest, ...scoredHistory],
      });
    }

    return result.sort(
      (a, b) =>
        (b.latest.recommendationScore || b.latest.score || 0) -
        (a.latest.recommendationScore || a.latest.score || 0)
    );
  }, [selectedRFQ, compareSource, evaluatedSuppliers]);

  // Auto-expand vendor version histories so Q2, Q1, Q3 are immediately open & visible under the vendor
  useEffect(() => {
    if (vendorGroups.length > 0) {
      setExpandedVendorIds((prev) => {
        const next = new Set(prev);
        let changed = false;
        vendorGroups.forEach((g) => {
          if (g.history.length > 0 && !next.has(g.vendorKey)) {
            next.add(g.vendorKey);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [vendorGroups]);

  const rfqGroups = useMemo<RfqGroup[]>(() => {
    const map = new Map<string, MockQuotation[]>();
    for (const q of filteredQuotations) {
      if (!map.has(q.rfqNumber)) map.set(q.rfqNumber, []);
      map.get(q.rfqNumber)!.push(q);
    }

    const result: RfqGroup[] = [];
    for (const [rfqNumber, quots] of map.entries()) {
      const sortedQuots = [...quots].sort((a, b) => (b.recommendationScore || b.score) - (a.recommendationScore || a.score) || a.totalPriceNum - b.totalPriceNum);
      const first = sortedQuots[0];
      const rfqTitle = first?.rfqTitle || first?.rfqNumber || rfqNumber;
      const bestPrice = Math.min(...sortedQuots.map(q => q.totalPriceNum));
      const bestCurrency = sortedQuots.find(q => q.totalPriceNum === bestPrice)?.currency || DEFAULT_CURRENCY;
      const latestSubmitted = sortedQuots.reduce((max, q) => q.submittedAt > max ? q.submittedAt : max, sortedQuots[0].submittedAt);
      const isInactive = sortedQuots.some(q => q.status === 'ACCEPTED' || getDisplayStatus(q) === 'ACCEPTED');

      result.push({
        rfqNumber,
        rfqTitle,
        quotations: sortedQuots,
        quotationCount: sortedQuots.length,
        bestPrice,
        bestCurrency,
        latestSubmitted,
        isInactive,
      });
    }

    return result.sort((a, b) => b.latestSubmitted.localeCompare(a.latestSubmitted));
  }, [filteredQuotations]);

  // Auto-expand matching RFQs when searching
  useEffect(() => {
    if (search.trim()) {
      setExpandedRfqNumbers(new Set(rfqGroups.map(g => g.rfqNumber)));
    }
  }, [search, rfqGroups]);

  const toggleRfqExpand = useCallback((rfqNum: string) => {
    setExpandedRfqNumbers(prev => {
      const next = new Set(prev);
      if (next.has(rfqNum)) next.delete(rfqNum);
      else next.add(rfqNum);
      return next;
    });
  }, []);

  const toggleExpandAll = useCallback(() => {
    if (expandedRfqNumbers.size === rfqGroups.length) {
      setExpandedRfqNumbers(new Set());
    } else {
      setExpandedRfqNumbers(new Set(rfqGroups.map(g => g.rfqNumber)));
    }
  }, [expandedRfqNumbers, rfqGroups]);

  const listingTotalPages = Math.ceil(rfqGroups.length / listingPerPage);
  const paginatedRfqGroups = useMemo(() => {
    return rfqGroups.slice(
      (listingPage - 1) * listingPerPage,
      listingPage * listingPerPage,
    );
  }, [rfqGroups, listingPage, listingPerPage]);

  const listingRenderCtx = useMemo<ListingRenderCtx & { __evalSource?: string }>(() => ({
    formatDate,
    formatAmount,
    convertPrice,
    activeDisplayCurrency,
    displayCurrency,
    __evalSource: evalSource,
    onViewPlan: (plan) => { setViewPlanQuotation(plan); },
    openRfqDetail: (rfqId: number, rfqNumber: string) => {
      void (async () => {
        setDetailRfq({
          id: rfqId,
          rfqNumber,
          title: '',
          description: '',
          status: 'IN_PROGRESS',
          createdAt: '',
          creator: '',
          creatorInitials: '',
          vendorCount: 0,
          itemCount: 0,
          totalEstimate: '—',
          priority: 'Medium',
          department: '',
          closingDate: '',
          currency: '',
          lineItems: [],
          vendors: [],

        });
        setDetailRfqLoading(true);
        try {
          const full = await rfqService.getById(rfqId);
          if (full) setDetailRfq(full);
        } catch (err) {
          console.error('Failed to load RFQ details:', err);
        } finally {
          setDetailRfqLoading(false);
        }
      })();
    },
  }), [formatAmount, displayCurrency, activeDisplayCurrency, evalSource]);



  // ── Modal actions ───────────────────────────────────────────
  const openModal = (type: ModalType, q: MockQuotation) => {
    if (type !== 'view' && !canActionQuotation(q, user, roles)) {
      setToast({ message: 'You are not authorized to perform action on this quotation', type: 'error' });
      return;
    }
    const modal = { type, quotation: q };
    activeModalRef.current = modal;
    setActiveModal(modal);
  };
  const closeModal = () => {
    activeModalRef.current = null;
    setActiveModal(null);
  };

  const handleConfirm = async (type: ModalType, comment: string, returnTarget?: 'LEVEL_1' | 'VENDOR') => {
    const modal = activeModalRef.current || activeModal;
    if (!modal) return;
    const id = modal.quotation.id;
    const previousStatus = modal.quotation.status;

    const displayStatusMap: Partial<Record<NonNullable<ModalType>, QuotStatus>> = {
      accept: 'ACCEPTED',
      reject: 'REJECTED',
      return: returnTarget === 'LEVEL_1' ? 'UNDER_REVIEW' : 'RETURNED',
    };
    const apiStatusMap: Record<string, string> = {
      accept: 'ACCEPTED',
      reject: 'REJECTED',
      return: 'SUBMITTED',
    };
    const displayStatus = type ? (displayStatusMap[type] || 'ACCEPTED') : 'ACCEPTED';
    const apiStatus = type ? (apiStatusMap[type] || 'ACCEPTED') : 'ACCEPTED';

    // ⚡ INSTANTLY (0ms) close the modal so user sees table status update right away!
    closeModal();

    await executeUpdateQuotationStatus(id, apiStatus, comment, displayStatus, previousStatus, modal.quotation, type, undefined, returnTarget);
  };

  const executeUpdateQuotationStatus = async (
    id: number | string,
    apiStatus: string,
    comment: string,
    displayStatus: QuotStatus,
    previousStatus: QuotStatus,
    modalQuotation: MockQuotation,
    type: ModalType,
    startLevelNumber?: number,
    returnTarget?: 'LEVEL_1' | 'VENDOR'
  ) => {
    // ── Instant 0ms Local State Update for both listing table & comparison tab ──
    const isDirectXMode = checkIsDirectXMode(modalQuotation);
    const userRolesList: string[] = Array.isArray(roles) ? roles : [];
    const isSuperAdminUser = userRolesList.some(r => {
      const norm = (r || '').toLowerCase();
      return norm === 'super admin' || norm === 'administrator' || norm === 'super_admin';
    }) || user?.role === 'SUPER_ADMIN' || String(user?.id) === '1' || user?.email === 'admin@procnex.com';

    const finalRole = (modalQuotation as any).finalLevelRole;
    const hasFinalRole = finalRole ? userRolesList.some(r => {
      const normUser = (r || '').toLowerCase().trim();
      const normFinal = finalRole.toLowerCase().trim();
      return normUser === normFinal || normUser.includes(normFinal) || normFinal.includes(normUser);
    }) : false;

    const isLevel1User = userRolesList.some(r => {
      const norm = (r || '').toLowerCase().trim();
      return norm === 'approver 1' || norm === 'level 1' || norm === 'l1' || norm.includes('level 1') || norm.includes('approver 1');
    });

    let isFinalStep = false;
    if (isDirectXMode) {
      isFinalStep = true;
    } else if (isLevel1User && !hasFinalRole && !isSuperAdminUser) {
      isFinalStep = false;
    } else if (hasFinalRole || isSuperAdminUser) {
      isFinalStep = true;
    } else {
      isFinalStep = modalQuotation.isFinalApprover === true && !isLevel1User;
    }

    const targetRfqId = modalQuotation.rfqId;
    const targetRfqNum = modalQuotation.rfqNumber;

    const updateItem = (q: MockQuotation): MockQuotation => {
      if (q.id === id) {
        if (type === 'accept') {
          if (isFinalStep) {
            // Direct X Only or Final level approval: completes full approval chain!
            return {
              ...q,
              status: 'ACCEPTED',
              userAction: 'APPROVED',
              isChainComplete: true,
              isFinalApprover: true,
            };
          } else {
            // FULL_CHAIN mode: intermediate level approval (Level 1)
            return {
              ...q,
              status: 'UNDER_REVIEW',
              userAction: 'APPROVED_L1',
              isChainComplete: false,
            };
          }
        }
        return {
          ...q,
          status: type === 'reject' ? 'REJECTED' : 'RETURNED',
          userAction: type === 'reject' ? 'REJECTED' : 'RETURNED',
        };
      }

      if (type === 'accept' && isFinalStep) {
        // When final approval happens, accepting one quotation marks competing quotations as REJECTED
        if ((targetRfqId && q.rfqId === targetRfqId) || (targetRfqNum && q.rfqNumber === targetRfqNum)) {
          return { ...q, status: 'REJECTED', userAction: 'REJECTED' };
        }
      }
      return q;
    };

    setQuotations(prev => prev.map(updateItem));
    setAllQuotations(prev => prev.map(updateItem));

    // ⚡ INSTANT 0ms Success Modal Popup for User!
    if (type === 'accept') {
      setAcceptedModalData({
        quotation: {
          ...modalQuotation,
          status: isFinalStep ? 'ACCEPTED' : 'UNDER_REVIEW',
          isChainComplete: isFinalStep,
          isFinalApprover: isFinalStep,
        },
        isNextLevel: !isFinalStep,
        message: isFinalStep
          ? 'Quotation accepted and vendor awarded successfully.'
          : 'Quotation approved at current level and forwarded to next level approver.',
      });
    } else if (type === 'return') {
      setActionSuccessModalData({
        actionType: 'return',
        module: 'Quotation',
        referenceNumber: modalQuotation.rfqNumber ? `Quotation for ${modalQuotation.rfqNumber}` : `Quotation #${id}`,
        title: modalQuotation.vendorName ? `Quotation by ${modalQuotation.vendorName}` : undefined,
        message: 'Quotation returned for revision successfully.',
        comment: comment,
        details: [
          { label: 'Vendor', value: modalQuotation.vendorName },
          { label: 'Total Price', value: `${modalQuotation.currency || ''} ${modalQuotation.totalPriceNum}` },
        ],
      });
    } else {
      setActionSuccessModalData({
        actionType: 'reject',
        module: 'Quotation',
        referenceNumber: modalQuotation.rfqNumber ? `Quotation for ${modalQuotation.rfqNumber}` : `Quotation #${id}`,
        title: modalQuotation.vendorName ? `Quotation by ${modalQuotation.vendorName}` : undefined,
        message: 'Quotation rejected successfully.',
        comment: comment,
        details: [
          { label: 'Vendor', value: modalQuotation.vendorName },
          { label: 'Total Price', value: `${modalQuotation.currency || ''} ${modalQuotation.totalPriceNum}` },
        ],
      });
    }

    // ── Asynchronous Background Backend Sync ──
    quotationService.updateStatus(id, apiStatus, comment, startLevelNumber, returnTarget)
      .then((response) => {
        if (type === 'accept' && response?.nextLevel === false) {
          const updateFinalAccepted = (q: MockQuotation): MockQuotation => {
            if (q.id === id) {
              return { ...q, status: 'ACCEPTED', userAction: 'APPROVED', isChainComplete: true, isFinalApprover: true };
            }
            if ((targetRfqId && q.rfqId === targetRfqId) || (targetRfqNum && q.rfqNumber === targetRfqNum)) {
              return { ...q, status: 'REJECTED', userAction: 'REJECTED' };
            }
            return q;
          };
          setQuotations(prev => prev.map(updateFinalAccepted));
          setAllQuotations(prev => prev.map(updateFinalAccepted));
        }
        reload();
        reloadAllQuotations();
      })
      .catch((err) => {
        console.error('Failed to update quotation status:', err);
        setQuotations(prev => prev.map(q => q.id === id ? { ...q, status: previousStatus, userAction: null } : q));
        setAllQuotations(prev => prev.map(q => q.id === id ? { ...q, status: previousStatus, userAction: null } : q));
        setToast({ message: err instanceof Error ? err.message : 'Failed to update quotation status', type: 'error' });
      });
  };

  const handleStartLevelConfirm = async (startLevelNumber: number) => {
    if (!startLevelPromptState) return;
    const { id, apiStatus, comment, displayStatus, previousStatus, modalQuotation } = startLevelPromptState;
    setStartLevelPromptState(null);
    await executeUpdateQuotationStatus(id, apiStatus, comment, displayStatus, previousStatus, modalQuotation, 'accept', startLevelNumber);
  };

  // ── Winning quotation validation before contract generation ──
  const handleNavigateContract = useCallback(async (quotation: MockQuotation) => {
    try {
      const rfq = await apiRequest<Record<string, unknown>>(`/rfqs/${quotation.rfqId}`, { cacheTtlMs: 0 });
      if (rfq?.selectedQuotationId || rfq?.selectedQuotation) {
        setShowTemplateSelect(true);
      } else {
        setToast({
          message: 'A winning quotation must be selected before generating a contract. Please select a winning vendor first.',
          type: 'error',
        });
      }
    } catch (err) {
      // If auth fails (401), silently proceed — the contract service will fall back to local mock data
      if (err instanceof Error && (err as any).status === 401) {
        setShowTemplateSelect(true);
        return;
      }
      setToast({
        message: err instanceof Error ? err.message : 'Failed to verify winning quotation status',
        type: 'error',
      });
    }
  }, []);

  // ── Column header renderer ──────────────────────────────────
  const renderTh = (key: string) => {
    switch (key) {
      case 'vendor':       return <div className="quot-compare__param-inner"><ArrowDownNarrowWide size={13} /> Vendor</div>;
      case 'qNo':          return <div className="quot-compare__col-inner"><span className="quot-compare__param-icon quot-compare__param-icon--qno"><GitBranch size={13}/></span>Q.No</div>;
      case 'totalPrice':   return <div className="quot-compare__col-inner"><span className="quot-compare__param-icon quot-compare__param-icon--price"><TrendingDown size={13}/></span>Total Price</div>;
      case 'leadTime':     return <div className="quot-compare__col-inner"><span className="quot-compare__param-icon quot-compare__param-icon--lead"><Clock size={13}/></span>Lead Time</div>;
      case 'paymentTerms': return <div className="quot-compare__col-inner"><span className="quot-compare__param-icon quot-compare__param-icon--terms"><FileText size={13}/></span>Payment Terms</div>;
      case 'score':
        return (
          <div className="quot-compare__col-inner">
            <span className="quot-compare__param-icon quot-compare__param-icon--score"><TrendingUp size={13}/></span>
            Recommendation
            {evalSource !== 'formula' && (
              <span
                className={`quot-compare__eval-badge quot-compare__eval-badge--${evalSource === 'custom_evaluation' ? 'custom' : 'simple'}`}
                title={evalSource === 'custom_evaluation' ? 'Scored from Custom RFQ evaluation categories' : 'Scored from Simple RFQ evaluation parameters'}
              >
                Evaluation
              </span>
            )}
            {evalSource === 'formula' && (
              <span
                className="quot-compare__eval-badge quot-compare__eval-badge--formula"
                title="Score calculated from price, lead time, and vendor rating formula"
              >
                Formula
              </span>
            )}
          </div>
        );
      case 'itemCount':    return <div className="quot-compare__col-inner"><span className="quot-compare__param-icon quot-compare__param-icon--items"><ClipboardList size={13}/></span>Items</div>;
      case 'status':       return <div className="quot-compare__col-inner"><span className="quot-compare__param-icon quot-compare__param-icon--status"><CheckCircle2 size={13}/></span>Status</div>;
      case 'submittedAt':  return <div className="quot-compare__col-inner"><span className="quot-compare__param-icon quot-compare__param-icon--date"><Clock size={13}/></span>Submitted</div>;
      case 'actions':      return <div className="quot-compare__col-inner" style={{ justifyContent: 'center' }}>Actions</div>;
      default: return null;
    }
  };

  // ── Supplier Comparison Panel Renderer (shared between inline and modal) ───
  const renderComparisonPanel = (inModal: boolean = false) => {
    const hasSuppliers = vendorGroups.length > 0 || evaluatedSuppliers.length > 0;

    return (
      <>
        {/* RFQ Dropdown */}
        <div className="quot-compare__search-area" style={inModal ? { border: 'none', background: 'transparent', padding: '0 0 20px' } : {}}>
          <div className="quot-compare__dropdown" ref={compareDropdownRef}>
            <button
              ref={compareDropdownBtnRef}
              className="quot-compare__dropdown-trigger"
              onClick={() => setCompareDropdownOpen(p => !p)}
              aria-expanded={compareDropdownOpen}
            >
              <Search size={14}/>
              {selectedRFQ ? (
                <span className="quot-compare__selected-rfq">
                  <span>{selectedRFQ}</span>
                  {selectedRFQTitle && (
                    <span className="quot-compare__selected-title-inline" style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      — {selectedRFQTitle}
                    </span>
                  )}
                  <span className="quot-compare__selected-rfq-badge">RFQ</span>
                </span>
              ) : (
                <span className="quot-compare__placeholder">Search &amp; select RFQ number or title...</span>
              )}
              <ChevronDown size={14} className={`quot-compare__chevron ${compareDropdownOpen ? 'quot-compare__chevron--open' : ''}`}/>
            </button>
            {/* Compare RFQ dropdown */}
            {compareDropdownOpen && (
              <div className="quot-compare__dropdown-menu" ref={compareDropdownMenuRef}>
                {/* Active / Inactive Filter Tabs */}
                <div className="quot-compare__dropdown-filter-tabs">
                  <button
                    type="button"
                    className={`quot-compare__filter-tab ${rfqFilterStatus === 'ALL' ? 'quot-compare__filter-tab--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRfqFilterStatus('ALL'); }}
                  >
                    All ({rfqCounts.all})
                  </button>
                  <button
                    type="button"
                    className={`quot-compare__filter-tab ${rfqFilterStatus === 'ACTIVE' ? 'quot-compare__filter-tab--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRfqFilterStatus('ACTIVE'); }}
                  >
                    <span className="quot-compare__filter-dot quot-compare__filter-dot--active" />
                    Active ({rfqCounts.active})
                  </button>
                  <button
                    type="button"
                    className={`quot-compare__filter-tab ${rfqFilterStatus === 'INACTIVE' ? 'quot-compare__filter-tab--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRfqFilterStatus('INACTIVE'); }}
                  >
                    <span className="quot-compare__filter-dot quot-compare__filter-dot--inactive" />
                    Inactive ({rfqCounts.inactive})
                  </button>
                </div>

                <div className="quot-compare__dropdown-search">
                  <Search size={13}/>
                  <input type="text" placeholder="Search by RFQ number, title or vendor name..." value={compareSearch}
                    onChange={e => setCompareSearch(e.target.value)} autoFocus/>
                </div>
                <div className="quot-compare__dropdown-list">
                  {filteredRFQs.length > 0 ? filteredRFQs.map(rfq => {
                    const rfqQuotations = compareSource.filter(q => q.rfqNumber === rfq);
                    const count = rfqQuotations.length;
                    const firstQuot = rfqQuotations[0];
                    const rfqTitle = firstQuot?.rfqTitle && firstQuot.rfqTitle !== rfq ? firstQuot.rfqTitle : null;
                    const inactive = isRfqInactive(rfq);
                    return (
                      <button key={rfq}
                        className={`quot-compare__dropdown-item ${selectedRFQ === rfq ? 'quot-compare__dropdown-item--active' : ''}`}
                        onClick={() => { setSelectedRFQ(rfq); setCompareDropdownOpen(false); setCompareSearch(''); }}
                      >
                        <span className="quot-compare__dropdown-item-left">
                          <span className="quot-compare__dropdown-rfq-row">
                            <span className="quot-compare__dropdown-rfq">{rfq}</span>
                            <span className={`quot-compare__rfq-status-tag ${inactive ? 'quot-compare__rfq-status-tag--inactive' : 'quot-compare__rfq-status-tag--active'}`}>
                              {inactive ? 'Inactive' : 'Active'}
                            </span>
                          </span>
                          {rfqTitle && (
                            <span className="quot-compare__dropdown-rfq-title">
                              {rfqTitle}
                            </span>
                          )}
                          <span className="quot-compare__dropdown-rfq-sub">
                            {inactive ? 'Vendor selected / Completed' : 'Under evaluation'}
                          </span>
                        </span>
                        <span className="quot-compare__dropdown-count">{count} supplier{count > 1 ? 's' : ''}</span>
                      </button>
                    );
                  }) : (
                    <div className="quot-compare__dropdown-empty">
                      <div className="quot-compare__dropdown-empty-icon"><Search size={20} /></div>
                      No {rfqFilterStatus !== 'ALL' ? rfqFilterStatus.toLowerCase() : ''} RFQs found
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {selectedRFQ && (
            <div className="quot-compare__rfq-badge">
              <span>{selectedRFQ}</span>
              <span className={`quot-compare__rfq-status-tag ${isRfqInactive(selectedRFQ) ? 'quot-compare__rfq-status-tag--inactive' : 'quot-compare__rfq-status-tag--active'}`}>
                {isRfqInactive(selectedRFQ) ? 'Inactive (Vendor Chosen)' : 'Active (Evaluating)'}
              </span>
              <span className="quot-compare__rfq-count">
                {vendorGroups.length || evaluatedSuppliers.length} suppliers
              </span>
              <div className="quot-compare__view-toggle">
                <button
                  className={`quot-compare__toggle-btn ${viewMode === 'table' ? 'quot-compare__toggle-btn--active' : ''}`}
                  onClick={() => setViewMode('table')}
                >
                  <span>Table</span>
                </button>
                <button
                  className={`quot-compare__toggle-btn ${viewMode === 'chart' ? 'quot-compare__toggle-btn--active' : ''}`}
                  onClick={() => setViewMode('chart')}
                >
                  <BarChart3 size={14} />
                  <span>Charts</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content: Table or Chart */}
        {viewMode === 'chart' && selectedRFQ && chartCategories.length > 0 && chartVendorNames.length > 0 ? (
          <VendorComparisonCharts
            categories={chartCategories}
            vendorScores={chartVendorScores}
            vendorNames={chartVendorNames}
          />
        ) : selectedRFQ && hasSuppliers ? (
          <div className="quot-compare__matrix-wrap">
            <table className="quot-compare__matrix">
              <thead>
                <tr>
                  {visibleCols.map(key => {
                    const colClass = key === 'vendor' ? 'quot-compare__vendor-col-header' : 
                      key === 'qNo' ? 'quot-compare__col-header--qno' :
                      key === 'totalPrice' ? 'quot-compare__col-header--price' :
                      key === 'leadTime' ? 'quot-compare__col-header--lead' :
                      key === 'paymentTerms' ? 'quot-compare__col-header--payment' :
                      key === 'score' ? 'quot-compare__col-header--score' :
                      key === 'itemCount' ? 'quot-compare__col-header--items' :
                      key === 'status' ? 'quot-compare__col-header--status' :
                      key === 'submittedAt' ? 'quot-compare__col-header--date' :
                      'quot-compare__col-header--' + key;
                    return (
                      <th key={key} className={colClass}>
                        {renderTh(key)}
                      </th>
                    );
                  })}
                  <th className="quot-compare__customizer-th">
                    <div className="col-btn-wrap">
                      <button
                        ref={colBtnRef}
                        className={`col-btn ${showColPanel ? 'col-btn--active' : ''}`}
                        onClick={() => setShowColPanel(v => !v)}
                        title="Customize columns"
                        aria-label="Customize columns"
                        aria-expanded={showColPanel}
                      >
                        <span/><span/><span/>
                      </button>
                      {showColPanel && (
                        <ColumnCustomizer
                          columnOrder={colOrder}
                          visibleKeys={visibleKeys}
                          allColumns={ALL_QUOT_COLS}
                          onToggle={handleToggle}
                          onReorder={setColOrder}
                          onReset={handleReset}
                          onClose={() => setShowColPanel(false)}
                          anchorRef={colBtnRef}
                        />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {vendorGroups.length > 0 ? (
                  vendorGroups.map((group) => {
                    const mainQuot = group.latest;
                    const history = group.history;
                    const vendorKey = group.vendorKey;
                    const versionNum = mainQuot.versionNumber || 1;
                    const hasHistory = history.length > 0 || versionNum > 1;
                    const isExpanded = expandedVendorIds.has(vendorKey);
                    const vendorCtx = {
                      hasHistory,
                      isExpanded,
                      versionCount: Math.max(group.all.length, versionNum),
                      onToggle: () => toggleVendorExpand(vendorKey),
                    };

                    return (
                      <React.Fragment key={vendorKey}>
                        {/* Latest Active Quotation Row */}
                        <tr className={`quot-compare__vendor-row ${mainQuot.isRecommended ? 'quot-compare__vendor-row--recommended' : ''}`}>
                          {visibleCols.map(key => renderCell(key, mainQuot, vendorCtx))}
                          <td />
                        </tr>

                        {/* Collapsible History Sub-rows (Q2, Q1...) */}
                        {isExpanded && history.map(h => (
                          <tr key={h.id} className="quot-compare__vendor-row quot-compare__vendor-row--history">
                            {visibleCols.map(key => renderCell(key, h, { ...vendorCtx, isHistoryRow: true }))}
                            <td />
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })
                ) : (
                  evaluatedSuppliers.map(s => {
                    const vNum = s.versionNumber || 1;
                    const fallbackCtx = {
                      hasHistory: vNum > 1,
                      isExpanded: expandedVendorIds.has(String(s.id)),
                      versionCount: vNum,
                      onToggle: () => toggleVendorExpand(String(s.id)),
                    };
                    return (
                      <tr key={s.id} className={`quot-compare__vendor-row ${s.isRecommended ? 'quot-compare__vendor-row--recommended' : ''}`}>
                        {visibleCols.map(key => renderCell(key, s, fallbackCtx))}
                        <td />
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : selectedRFQ ? (
          <div className="quot-compare__empty">
            <div className="quot-compare__empty-icon"><FileText size={40}/></div>
            <h3>No suppliers found</h3>
            <p>No supplier quotations found for this RFQ</p>
          </div>
        ) : (
          <div className="quot-compare__empty">
            <div className="quot-compare__empty-icon"><Search size={40}/></div>
            <h3>Select an RFQ</h3>
            <p>Search and select an RFQ number above to compare suppliers</p>
          </div>
        )}
      </>
    );
  };

  // ── Cell renderer ───────────────────────────────────────────
  const renderCell = (
    key: string,
    s: MockQuotation,
    vendorCtx?: {
      hasHistory: boolean;
      isExpanded: boolean;
      versionCount: number;
      onToggle: () => void;
      isHistoryRow?: boolean;
    }
  ) => {
    switch (key) {
      case 'qNo': {
        const versionNum = s.versionNumber || 1;
        const displayQNo = (s.versionNumber && s.versionNumber > 1) ? `Q${s.versionNumber}` : (s.qNo || `Q${versionNum}`);
        return (
          <td key={key} className="quot-compare__value">
            <div className="quot-compare__qno-cell">
              <span
                className={`quot-compare__qno-pill ${
                  s.status === 'RETURNED'
                    ? 'quot-compare__qno-pill--returned'
                    : s.isLatestVersion
                    ? 'quot-compare__qno-pill--latest'
                    : 'quot-compare__qno-pill--history'
                }`}
              >
                {displayQNo}
              </span>
            </div>
          </td>
        );
      }
      case 'vendor': {
        if (vendorCtx?.isHistoryRow) {
          return (
            <td key={key} className="quot-compare__vendor-cell quot-compare__vendor-cell--history">
              <div className="quot-compare__supplier-card quot-compare__supplier-card--history">
                <span className="quot-compare__history-tree-icon">
                  <GitBranch size={13} />
                </span>
                <div className="quot-compare__supplier-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="quot-compare__history-version-tag">
                      {s.qNo || `Q${s.versionNumber}`} (Previous Version)
                    </span>
                  </div>
                  <span className="quot-compare__supplier-email">
                    {formatDate(s.submittedAt)}{' '}
                    {s.returnReason ? `· Returned: "${s.returnReason}"` : ''}
                  </span>
                </div>
              </div>
            </td>
          );
        }

        return (
          <td key={key} className="quot-compare__vendor-cell">
            <div className="quot-compare__supplier-card">
              {vendorCtx?.hasHistory && (
                <button
                  type="button"
                  className={`quot-compare__vendor-toggle-btn ${
                    vendorCtx.isExpanded ? 'quot-compare__vendor-toggle-btn--expanded' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    vendorCtx.onToggle();
                  }}
                  title={vendorCtx.isExpanded ? 'Collapse previous versions' : 'Expand previous versions (Q1, Q2...)'}
                >
                  <ChevronDown
                    size={14}
                    className={`quot-compare__vendor-chevron ${
                      vendorCtx.isExpanded ? 'quot-compare__vendor-chevron--open' : ''
                    }`}
                  />
                </button>
              )}
              <span className={`quot-compare__avatar quot-table__vendor-avatar--${s.avatarMod}`}>
                {s.vendorInitials}
              </span>
              <div className="quot-compare__supplier-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="quot-compare__supplier-name">{s.vendorName}</span>
                  {vendorCtx?.hasHistory && (
                    <button
                      type="button"
                      className="quot-compare__version-count-pill"
                      onClick={(e) => {
                        e.stopPropagation();
                        vendorCtx.onToggle();
                      }}
                      title="Click to expand previous quotation versions"
                    >
                      {vendorCtx.versionCount} versions ({s.qNo || `Q${s.versionNumber}`})
                    </button>
                  )}
                </div>
                <span className="quot-compare__supplier-email">{s.vendorEmail}</span>
                {s.isRecommended && (
                  <span className="quot-compare__recommended-chip" title={s.recommendationReason}>
                    <Crown size={10} /> Recommended ({s.recommendationScore || s.score}%)
                  </span>
                )}
              </div>
            </div>
          </td>
        );
      }
      case 'totalPrice': {
        const priceVal = Number(s.totalPriceNum || s.totalPrice || 0);
        const { converted, original } = convertPrice(priceVal, s.currency || DEFAULT_CURRENCY);
        const isBest = original === bestValues.price;
        const isConverted = activeDisplayCurrency && activeDisplayCurrency !== (s.currency || DEFAULT_CURRENCY);
        return (
          <td key={key} className={`quot-compare__value ${isBest ? 'quot-compare__value--best' : ''}`}>
            <div className="quot-compare__value-wrap quot-compare__value-wrap--price">
              <span className="quot-compare__value-price">
                <span className="quot-compare__value-main">
                  {formatAmount(converted, activeDisplayCurrency || s.currency || DEFAULT_CURRENCY)}
                </span>
                {isConverted && (
                  <span className="quot-compare__converted-hint" title={`Original: ${formatAmount(original, s.currency || DEFAULT_CURRENCY)}`}>
                    ~{formatAmount(original, s.currency || DEFAULT_CURRENCY)}
                  </span>
                )}
              </span>
              <CurrencyBadge currency={activeDisplayCurrency || s.currency || DEFAULT_CURRENCY} size="sm" />
              {isBest && <span className="quot-compare__best-chip"><Crown size={10}/> Best</span>}
            </div>
          </td>
        );}
      case 'leadTime':
        return (
          <td key={key} className={`quot-compare__value ${s.leadTimeDays === bestValues.lead ? 'quot-compare__value--best' : ''}`}>
            <div className="quot-compare__value-wrap">
              <span className="quot-compare__value-main">{s.leadTimeDays} days</span>
              {s.leadTimeDays === bestValues.lead && <span className="quot-compare__best-chip"><Crown size={10}/> Best</span>}
            </div>
          </td>
        );
      case 'paymentTerms':
        return (
          <td key={key} className="quot-compare__value">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="quot-compare__value-main">{s.paymentTerms}</span>
              {s.paymentPlanSnapshot && s.paymentPlanSnapshot.length > 0 && (
                <button
                  type="button"
                  title="View payment plan"
                  onClick={(e) => { e.stopPropagation(); setViewPlanQuotation({ name: s.paymentTerms, milestones: s.paymentPlanSnapshot!.map((m, i) => ({ id: `snap_${i}`, title: m.title, percentage: m.percentage })) }); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', padding: 0,
                    display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.color = 'var(--vendor-primary)'; }}
                  onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  <Eye size={13} />
                </button>
              )}
            </span>
          </td>
        );
      case 'score':
        return (
          <td key={key} className={`quot-compare__value ${s.recommendationScore === bestValues.recommendation ? 'quot-compare__value--best' : ''}`}>
            <div className="quot-compare__score-cell">
              <div className="quot-score">
                <div className="quot-score__bar">
                  <div className={`quot-score__fill quot-score__fill--${getScoreClass(s.recommendationScore || s.score || 0)}`} style={{ width: `${s.recommendationScore || s.score || 0}%` }} />
                </div>
                <span className="quot-score__value">{s.recommendationScore || s.score || 0}%</span>
              </div>
            </div>
          </td>
        );
      case 'itemCount':
        return (
          <td key={key} className="quot-compare__value">
            <span className="quot-compare__value-main">{s.itemCount} items</span>
          </td>
        );
      case 'status':
        return (
          <td key={key} className="quot-compare__value">
            <span className={`quot-badge quot-badge--${getDisplayStatus(s)}`}>{STATUS_LABELS[getDisplayStatus(s)]}</span>
          </td>
        );
      case 'submittedAt':
        return (
          <td key={key} className="quot-compare__value">
            <span className="quot-compare__value-main">{formatDate(s.submittedAt)}</span>
          </td>
        );
      case 'actions': {
        const displaySt = getDisplayStatus(s);
        const isAccepted = displaySt === 'ACCEPTED';
        const isHistory = vendorCtx?.isHistoryRow === true;
        const canUserAction = !isHistory && canActionQuotation(s, user, roles);
        const actionable = displaySt !== 'ACCEPTED' && displaySt !== 'REJECTED' && displaySt !== 'RETURNED' && canUserAction;
        const hasPostAwardAccess = canPerformPostAward(s, user, roles);
        return (
          <td key={key} className="quot-compare__value" style={{ textAlign: 'center' }}>
            <div className="quot-table__actions" style={{ justifyContent: 'center', gap: 4 }}>
              <button
                className="quot-table__action-btn"
                title="View Details"
                onClick={() => openModal('view', s)}
              >
                <Eye size={15}/>
              </button>
              {actionable && (
                <>
                  <button
                    className="quot-table__action-btn quot-table__action-btn--accept"
                    title={!canApproveQuot ? "Admin has not allowed this action. You do not have permission to accept quotations." : "Accept Quotation"}
                    onClick={() => canApproveQuot && openModal('accept', s)}
                    disabled={!canApproveQuot}
                    style={!canApproveQuot ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                  >
                    <ThumbsUp size={15} />
                  </button>
                  <button
                    className="quot-table__action-btn quot-table__action-btn--reject"
                    title={!canApproveQuot ? "Admin has not allowed this action. You do not have permission to reject quotations." : "Reject Quotation"}
                    onClick={() => canApproveQuot && openModal('reject', s)}
                    disabled={!canApproveQuot}
                    style={!canApproveQuot ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                  >
                    <ThumbsDown size={15} />
                  </button>
                  <button
                    className="quot-table__action-btn quot-table__action-btn--return"
                    title={!canApproveQuot ? "Admin has not allowed this action. You do not have permission to return quotations." : "Return for Revision"}
                    onClick={() => canApproveQuot && openModal('return', s)}
                    disabled={!canApproveQuot}
                    style={!canApproveQuot ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                  >
                    <RotateCcw size={15} />
                  </button>
                </>
              )}
              {isAccepted && hasPostAwardAccess && (
                <>
                  {(!s.hasPO && s.postAwardDecision !== 'PO_CREATED') && (
                    <button
                      type="button"
                      className="quot-sap-btn quot-sap-btn--po"
                      title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to create purchase orders." : "Create Purchase Order for this accepted quotation"}
                      onClick={() => {
                        if (!canCreatePO) return;
                        const targetRfqId = s.rfqId;
                        const targetRfqNum = s.rfqNumber;
                        const updatePOGen = (q: MockQuotation): MockQuotation => {
                          if ((targetRfqId && q.rfqId === targetRfqId) || (targetRfqNum && q.rfqNumber === targetRfqNum)) {
                            return { ...q, hasPO: true, postAwardDecision: 'PO_CREATED' };
                          }
                          return q;
                        };
                        setQuotations(prev => prev.map(updatePOGen));
                        setAllQuotations(prev => prev.map(updatePOGen));
                        navigate(`/procurement/purchase-requisition/${s.rfqId}`);
                      }}
                      disabled={!canCreatePO}
                      style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                    >
                      <ShoppingCart size={13} />
                      <span>Create PO</span>
                    </button>
                  )}
                  {(!s.hasContract && s.postAwardDecision !== 'CONTRACT_CREATED') && (
                    <button
                      type="button"
                      className="quot-sap-btn quot-sap-btn--contract"
                      title={!canCreateContract ? "Admin has not allowed this action. You do not have permission to create contracts." : "Create Contract agreement for this accepted quotation"}
                      onClick={() => {
                        if (!canCreateContract) return;
                        setPostAwardQuotation(s);
                        setShowTemplateSelect(true);
                      }}
                      disabled={!canCreateContract}
                      style={!canCreateContract ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                    >
                      <FileText size={13} />
                      <span>Create Contract</span>
                    </button>
                  )}
                  {(!s.hasPO && !s.hasContract && s.postAwardDecision !== 'PO_CREATED' && s.postAwardDecision !== 'CONTRACT_CREATED') && (
                    <button
                      className="quot-table__action-btn quot-table__action-btn--danger"
                      title="Cancel Acceptance"
                      onClick={() => openModal('reject', s)}
                    >
                      <X size={15} />
                    </button>
                  )}
                </>
              )}
            </div>
          </td>
        );
      }
      default: return <td key={key} />;
    }
  };

  return (
    <div className="quot-page">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {toast && (
        <MessageStrip
          type={toast.type}
          onClose={() => setToast(null)}
          autoHideMs={4000}
          style={{ marginBottom: 16 }}
        >
          {toast.message}
        </MessageStrip>
      )}
      {loading && <div className="quot-page__loading">Loading quotations…</div>}
      {/* Header */}
      <div className="quot-page__header">
        <div className="quot-page__header-left">
          <h1>Quotation Approval</h1>
          <p>Compare vendor quotations side-by-side across your RFQs</p>
        </div>
        <div className="quot-page__header-actions">
          {/* Active Quotation Comparison Button */}
          <button
            className="quot-page__compare-btn"
            onClick={() => setCompareModalOpen(true)}
            title="Open active quotation comparison"
          >
            <GitCompareArrows size={18} />
            <span>Active Quotation Comparison</span>
          </button>
          {/* Currency Converter Widget */}
          <div className="quot-page__converter">
          <div className="quot-page__converter-inner">
            <ArrowRightLeft size={15} className="quot-page__converter-icon" />
            <span className="quot-page__converter-label">Convert to</span>
            <CurrencySelector
              value={activeDisplayCurrency}
              onChange={setDisplayCurrency}
              size="sm"
            />
            {displayCurrency && (
              <button
                className="quot-page__converter-reset"
                onClick={() => setDisplayCurrency('')}
                title="Reset to default currency"
              >
                <X size={13} />
              </button>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* Summary — clickable KPI cards */}
      <div className="quot-summary">
        {[
          { icon: <ClipboardList size={22}/>, mod: 'total',    value: stats.total, label: 'Total Quotations', filter: null as string | null },
          { icon: <Clock size={22}/>,         mod: 'pending',  value: stats.pending,  label: 'Pending Review',   filter: 'UNDER_REVIEW' },
          { icon: <CheckCircle2 size={22}/>,  mod: 'accepted', value: stats.accepted, label: 'Accepted',         filter: 'ACCEPTED' },
          { icon: <XCircle size={22}/>,       mod: 'rejected', value: stats.rejected, label: 'Rejected',         filter: 'REJECTED' },
        ].map(c => {
          const isActive = c.mod === 'total' ? !statusFilter : statusFilter === c.filter;
          return (
            <div
              key={c.mod}
              className={`quot-summary-card ${isActive ? 'quot-summary-card--active' : ''}`}
              onClick={() => c.mod !== 'total' ? handleKpiClick(c.filter) : setStatusFilter(null)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.mod !== 'total' ? handleKpiClick(c.filter) : setStatusFilter(null); } }}
            >
              <div className={`quot-summary-card__icon quot-summary-card__icon--${c.mod}`}>{c.icon}</div>
              <div className="quot-summary-card__info">
                <span className="quot-summary-card__value">{c.value}</span>
                <span className="quot-summary-card__label">{c.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Quotations Listing (approvals-style table) ── */}
      <div className="quot-listing">
        {/* Search Toolbar */}
        <div className="quot-listing-toolbar">
          <div className="quot-listing-toolbar__search">
            <Search size={16} className="quot-listing-toolbar__search-icon" />
            <input
              type="text"
              placeholder="Search by RFQ number, title, vendor or email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setListingPage(1); }}
            />
          </div>
          {rfqGroups.length > 0 && (
            <button
              type="button"
              className="quot-rfq-card__expand-all-btn"
              onClick={toggleExpandAll}
            >
              {expandedRfqNumbers.size === rfqGroups.length ? (
                <>
                  <ChevronUp size={14} />
                  <span>Collapse All</span>
                </>
              ) : (
                <>
                  <ChevronDown size={14} />
                  <span>Expand All ({rfqGroups.length})</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Grouped RFQs Accordion List */}
        {paginatedRfqGroups.length > 0 ? (
          <div>
            <div className="quot-rfq-groups">
              {paginatedRfqGroups.map((group) => {
                const isExpanded = expandedRfqNumbers.has(group.rfqNumber);

                return (
                  <div key={group.rfqNumber} className={`quot-rfq-card ${isExpanded ? 'quot-rfq-card--expanded' : ''}`}>
                    {/* RFQ Group Header */}
                    <div
                      className="quot-rfq-card__header"
                      onClick={() => toggleRfqExpand(group.rfqNumber)}
                    >
                      <div className="quot-rfq-card__header-left">
                        <button
                          type="button"
                          className={`quot-rfq-card__chevron ${isExpanded ? 'quot-rfq-card__chevron--expanded' : ''}`}
                          aria-label={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          <ChevronRight size={18} />
                        </button>
                        <div className="quot-rfq-card__title-block">
                          <div className="quot-rfq-card__badge-wrap">
                            <span className="quot-rfq-card__rfq-num">{group.rfqNumber}</span>
                            <span className={`quot-rfq-card__status-dot quot-rfq-card__status-dot--${group.isInactive ? 'inactive' : 'active'}`} />
                            <span className="quot-rfq-card__status-text">{group.isInactive ? 'Completed' : 'Active'}</span>
                          </div>
                          <h3 className="quot-rfq-card__title">{group.rfqTitle}</h3>
                        </div>
                      </div>

                      <div className="quot-rfq-card__header-right">
                        <div className="quot-rfq-card__stat">
                          <span className="quot-rfq-card__stat-label">Quotations</span>
                          <span className="quot-rfq-card__stat-val">
                            <ClipboardList size={13} style={{ verticalAlign: -1, marginRight: 4 }} />
                            {group.quotationCount} {group.quotationCount === 1 ? 'Quotation' : 'Quotations'}
                          </span>
                        </div>

                        <div className="quot-rfq-card__stat">
                          <span className="quot-rfq-card__stat-label">Best Price</span>
                          <span className="quot-rfq-card__stat-val quot-rfq-card__stat-val--best">
                            {convertPrice(group.bestPrice, group.bestCurrency).converted}
                          </span>
                        </div>

                        <div className="quot-rfq-card__stat">
                          <span className="quot-rfq-card__stat-label">Latest Submitted</span>
                          <span className="quot-rfq-card__stat-val">
                            {formatDate(group.latestSubmitted)}
                          </span>
                        </div>

                        <div className="quot-rfq-card__actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="quot-rfq-card__compare-btn"
                            title="Open Side-by-Side Comparison for this RFQ"
                            onClick={() => {
                              setSelectedRFQ(group.rfqNumber);
                              setCompareModalOpen(true);
                            }}
                          >
                            <GitCompareArrows size={14} />
                            <span>Compare</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Collapsible Quotations Sub-Table */}
                    {isExpanded && (
                      <div className="quot-rfq-card__body">
                        <div className="quot-listing-table-wrap">
                          <table className="quot-listing-table" style={{ tableLayout: 'fixed', minWidth: '850px' }}>
                            <colgroup>
                              {listingVisibleColumns.map((col) => (
                                <col key={col.key} style={{ width: col.width || 'auto' }} />
                              ))}
                              <col style={{ width: '80px' }} />
                            </colgroup>
                            <thead>
                              <tr>
                                {listingVisibleColumns.map((col) => (
                                  <th key={col.key} style={{ textAlign: col.align || 'left' }}>{col.label}</th>
                                ))}
                                <th style={{ textAlign: 'center' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.quotations.map((q) => (
                                <tr key={q.id} className={`quot-table__row quot-table__row--${(q.status || '').toLowerCase()}`}>
                                  {listingVisibleColumns.map((col) => (
                                    <td key={col.key} style={{ textAlign: col.align || 'left' }}>
                                      {col.render(q, listingRenderCtx)}
                                    </td>
                                  ))}
                                  <td style={{ textAlign: 'center' }}>
                                    <div className="quot-listing-table__actions" style={{ justifyContent: 'center' }}>
                                      <button
                                        className="quot-listing-table__action-btn"
                                        title="View Details"
                                        onClick={() => openModal('view', q)}
                                      >
                                        <Eye size={15} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {rfqGroups.length > listingPerPage && (
              <div className="quot-listing-pagination" style={{ marginTop: 16, borderRadius: 'var(--radius-md)' }}>
                <span className="quot-listing-pagination__info">
                  Showing {(listingPage - 1) * listingPerPage + 1}–{Math.min(listingPage * listingPerPage, rfqGroups.length)} of {rfqGroups.length} RFQs
                </span>
                <div className="quot-listing-pagination__btns">
                  <button
                    className="quot-listing-pagination__btn"
                    disabled={listingPage === 1}
                    onClick={() => setListingPage((p) => p - 1)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="quot-listing-pagination__page">
                    {listingPage} / {listingTotalPages}
                  </span>
                  <button
                    className="quot-listing-pagination__btn"
                    disabled={listingPage >= listingTotalPages}
                    onClick={() => setListingPage((p) => p + 1)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : !loading ? (
          <div className="quot-listing-table-card">
            <div className="quot-listing__empty">
              <div className="quot-listing__empty-icon"><ClipboardList size={40}/></div>
              <h3>No quotations found</h3>
              <p>{search ? 'Try a different search term' : 'No quotations match the selected status filter'}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Action Modal — Use enhanced ViewQuotationModal for 'view' type */}
      {activeModal && activeModal.type === 'view' && (
        <ViewQuotationModal
          key={activeModal.quotation.id}
          quotation={activeModal.quotation}
          onClose={closeModal}
          onSelectionSaved={reload}
          allQuotations={allQuotations}
        />
      )}
      {activeModal && activeModal.type !== 'view' && (
        <ActionModal
          modal={activeModal}
          onClose={closeModal}
          onConfirm={handleConfirm}
          onViewPlan={(plan) => setViewPlanQuotation(plan)}
        />
      )}

      {acceptedModalData && (
        <QuotationAcceptedModal
          data={acceptedModalData}
          user={user}
          roles={roles}
          onClose={() => setAcceptedModalData(null)}
          onCreatePO={() => {
            const q = acceptedModalData.quotation;
            setAcceptedModalData(null);
            navigate(`/procurement/purchase-requisition/${q.rfqId}`);
          }}
          onCreateContract={() => {
            const q = acceptedModalData.quotation;
            setAcceptedModalData(null);
            setPostAwardQuotation(q);
            setShowTemplateSelect(true);
          }}
        />
      )}

      {viewPlanQuotation && (
        <ViewPaymentPlanModal
          plan={viewPlanQuotation}
          onClose={() => setViewPlanQuotation(null)}
        />
      )}

      <RFQDetailModal
        rfq={detailRfq}
        onClose={() => setDetailRfq(null)}
        loading={detailRfqLoading}
        onCompareQuotations={(rfqNumber) => {
          setDetailRfq(null);
          setCompareModalOpen(true);
          setSelectedRFQ(rfqNumber);
        }}
      />

      {/* ── Active Quotation Comparison Full-Page Modal (Gmail-style like RFQ modal) ── */}
      {compareModalOpen && (
        <div className={`quot-compare-modal-backdrop ${compareExpanded ? 'quot-compare-modal-backdrop--expanded' : ''}`} onClick={() => setCompareModalOpen(false)}>
          <div
            className={`quot-compare-modal ${compareExpanded ? 'quot-compare-modal--expanded' : 'quot-compare-modal--open'}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header — window controls like RFQ modal */}
            <div className="quot-compare-modal__header">
              <div className="quot-compare-modal__header-left">
                <span className="quot-compare-modal__header-icon-bg">
                  <GitCompareArrows size={18} />
                </span>
                <span className="quot-compare-modal__header-title">Active Quotation Comparison</span>
              </div>

              <div className="quot-compare-modal__window-controls">
                {/* Currency Converter inside modal header */}
                <div className="quot-compare-modal__converter">
                  <ArrowRightLeft size={12} className="quot-page__converter-icon" />
                  <span className="quot-compare-modal__converter-label">Convert to</span>
                  <CurrencySelector
                    value={activeDisplayCurrency}
                    onChange={setDisplayCurrency}
                    size="sm"
                  />
                  {displayCurrency && (
                    <button
                      className="quot-page__converter-reset"
                      onClick={() => setDisplayCurrency('')}
                      title="Reset to default currency"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="quot-compare-modal__wc-divider" />
                <button
                  className="quot-compare-modal__wc-btn"
                  title={compareExpanded ? 'Restore' : 'Expand'}
                  onClick={() => setCompareExpanded(v => !v)}
                >
                  {compareExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button
                  className="quot-compare-modal__wc-btn quot-compare-modal__wc-btn--close"
                  title="Close"
                  onClick={() => setCompareModalOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Hero section */}
            {/* Hero section */}
            <div className="quot-compare-modal__hero">
              <h2 className="quot-compare-modal__hero-title">Active Quotation Comparison</h2>
              <p className="quot-compare-modal__hero-desc">
                Select an RFQ to compare all supplier quotations side-by-side
              </p>
            </div>

            <div className="quot-compare-modal__body">
              {toast && (
                <MessageStrip
                  type={toast.type}
                  onClose={() => setToast(null)}
                  autoHideMs={4000}
                  style={{ marginBottom: 16 }}
                >
                  {toast.message}
                </MessageStrip>
              )}
              {renderComparisonPanel(true)}
            </div>
          </div>
        </div>
      )}

      {postAwardQuotation && showTemplateSelect && (
        <ContractTemplateSelectModal
          rfqId={String(postAwardQuotation.rfqId)}
          rfqNumber={postAwardQuotation.rfqNumber}
          vendorName={postAwardQuotation.vendorName}
          onClose={() => { setShowTemplateSelect(false); setPostAwardQuotation(null); }}
          onGenerated={(_contractId) => {
            if (postAwardQuotation) {
              const targetRfqId = postAwardQuotation.rfqId;
              const targetRfqNum = postAwardQuotation.rfqNumber;
              const updateContractGen = (q: MockQuotation): MockQuotation => {
                if ((targetRfqId && q.rfqId === targetRfqId) || (targetRfqNum && q.rfqNumber === targetRfqNum)) {
                  return { ...q, hasContract: true, postAwardDecision: 'CONTRACT_CREATED' };
                }
                return q;
              };
              setQuotations(prev => prev.map(updateContractGen));
              setAllQuotations(prev => prev.map(updateContractGen));
            }
            setShowTemplateSelect(false);
            setPostAwardQuotation(null);
            closeModal();
            setToast({ message: 'Contract generated successfully!', type: 'success' });
            reload();
            reloadAllQuotations();
          }}
        />
      )}

      <CreatorLevelPromptModal
        isOpen={!!startLevelPromptState}
        moduleName="Quotation"
        onConfirm={handleStartLevelConfirm}
        onCancel={() => setStartLevelPromptState(null)}
      />

      {/* Action Success Modal */}
      <ActionSuccessModal
        data={actionSuccessModalData}
        onClose={() => setActionSuccessModalData(null)}
      />
    </div>
  );
}
