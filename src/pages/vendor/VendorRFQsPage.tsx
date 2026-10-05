import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { sseClient } from '../../services/sseClient';
import { vendorPortalService, type PaymentPlan } from '../../services/vendorPortalService';
import { companySettingsService, type PaymentTerm } from '../../services/companySettingsService';
import type { RFQ, RFQCustomField, QuotationBidSecurity } from '../../types';
import CustomPaymentPlanModal from '../../components/vendor/CustomPaymentPlanModal';
import QuotationDetails from '../../components/vendor/QuotationDetails';
import { quoteDate } from '../../components/vendor/quotationFormatting';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  FileText, Search, ChevronDown, Clock, Send, X,
  CheckCircle2, AlertTriangle, RotateCcw, Plus,
  Minus, Maximize2, Minimize2, ChevronUp, ChevronRight, Eye,
  Trash2, Pencil, Shield, Upload, Sliders, ClipboardList,
} from 'lucide-react';
import { CurrencySelector, CurrencyAmountInput, useCurrency } from '../../components/shared/CurrencyMaster';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TablePagination } from '../../components/shared/TablePagination';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { FormSkeleton } from '../../components/shared/Skeleton';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';

import '../../styles/vendor-portal.css';
import '../../components/vendor/vendor-rfq-workspace.css';

// ─── Types ──────────────────────────────────────────────────

type RFQStatus = 'OPEN' | 'SUBMITTED' | 'CLOSED' | 'CANCELLED' | 'RETURNED';
type VquotModalState = 'open' | 'expanded' | 'minimized';

interface EvalCategoryInfo {
  id: string;
  name: string;
  weightage: number;
  enabled: boolean;
  subParameters: Array<{
    id: string;
    name: string;
    source: string;
    enabled: boolean;
    required: boolean;
    weightage: number;
    maxScore: number;
    description?: string;
  }>;
}

interface RFQItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  expectedDate?: string;
}

interface VendorRFQ {
  id: string;
  rfqNumber: string;
  title: string;
  description: string;
  status: RFQStatus;
  deadline: string;
  createdAt: string;
  items: RFQItem[];
  buyerCompany: string;
  department: string;
  rfqType?: 'RFQ' | 'TENDER' | 'CUSTOM';
  needsResubmit?: boolean;
  latestQuotationId?: string | null;
  customFields?: (Pick<RFQCustomField, 'id' | 'fieldName' | 'fieldType' | 'required'> & { weightage?: number })[];
  evaluationCategories?: EvalCategoryInfo[];
  // Bid Security fields (from RFQ)
  bidSecurityRequired?: boolean;
  bidBondRequired?: boolean;
  bidSecurityType?: string;
  bidSecurityValueType?: string;
  bidSecurityValue?: number;
  bidSecurityCurrency?: string;
  bidSecurityValidityValue?: number;
  bidSecurityValidityUnit?: string;
  // Buyer-set minimum requirements
  bidSecurityMinValue?: number;
  bidSecurityMinValidity?: number;
  bidBondMinValue?: number;
  bidBondMinValidity?: number;
}

function mapVendorRfq(r: RFQ & {
  hasSubmittedQuotation?: boolean;
  needsResubmit?: boolean;
  latestQuotationId?: string | null;
  latestQuotationStatus?: string | null;
  rfqType?: 'RFQ' | 'TENDER' | 'CUSTOM';
  evaluationCategories?: EvalCategoryInfo[];
  bidSecurityRequired?: boolean;
  bidBondRequired?: boolean;
  bidSecurityType?: string;
  bidSecurityValueType?: string;
  bidSecurityValue?: number;
  bidSecurityCurrency?: string;
  bidSecurityValidityValue?: number;
  bidSecurityValidityUnit?: string;
  bidSecurityMinValue?: number;
  bidSecurityMinValidity?: number;
  bidBondMinValue?: number;
  bidBondMinValidity?: number;
}): VendorRFQ {
  const ext = r as RFQ & { closingDate?: string; department?: string };
  const statusMap: Record<string, RFQStatus> = {
    SENT: 'OPEN',
    IN_PROGRESS: 'OPEN',
    QUOTATIONS_RECEIVED: 'OPEN',
    DRAFT: 'OPEN',
    CLOSED: 'CLOSED',
    CANCELLED: 'CANCELLED',
  };
  let status: RFQStatus = statusMap[r.status] || 'OPEN';
  if (r.hasSubmittedQuotation && !r.needsResubmit) status = 'SUBMITTED';
  if (r.needsResubmit) status = 'RETURNED';

  return {
    id: r.id,
    rfqNumber: r.rfqNumber,
    title: r.title,
    description: r.description || '',
    status,
    deadline: ext.closingDate?.slice(0, 10) || r.createdAt.slice(0, 10),
    createdAt: r.createdAt.slice(0, 10),
    items: (r.items || []).map((i) => ({
      id: i.id,
      name: i.itemName,
      description: i.description || '',
      quantity: Number(i.quantity),
      unit: i.unit || '—',
      expectedDate: i.expectedDate,
    })),
    buyerCompany: (r as any).buyerCompany || ext.department || '—',
    department: ext.department || '—',
    rfqType: r.rfqType || 'RFQ',
    needsResubmit: r.needsResubmit || false,
    customFields: (r.customFields || []).map((cf: any) => {
      let parsed: any = {};
      if (typeof cf.value === 'string' && cf.value.trim().startsWith('{')) {
        try { parsed = JSON.parse(cf.value); } catch {}
      }
      return {
        id: parsed.id || cf.id,
        fieldName: parsed.fieldName || cf.fieldName || cf.key,
        fieldType: parsed.fieldType || cf.fieldType || 'text',
        required: parsed.required ?? cf.required ?? false,
        weightage: parsed.weightage ?? cf.weightage ?? 0,
      };
    }),
    evaluationCategories: (r.evaluationCategories || []).map((cat: any) => ({
      id: cat.id || cat.name,
      name: cat.name,
      weightage: cat.weightage || 0,
      enabled: cat.enabled ?? true,
      subParameters: (cat.subParameters || []).map((sp: any) => ({
        id: sp.id || sp.name,
        name: sp.name,
        source: sp.source || 'custom',
        enabled: sp.enabled ?? true,
        required: sp.required ?? false,
        weightage: sp.weightage || 0,
        maxScore: sp.maxScore || 10,
        description: sp.description || '',
      })),
    })),
    bidSecurityRequired: r.bidSecurityRequired ?? false,
    bidBondRequired: r.bidBondRequired ?? false,
    bidSecurityType: r.bidSecurityType,
    bidSecurityValueType: r.bidSecurityValueType,
    bidSecurityValue: r.bidSecurityValue,
    bidSecurityCurrency: r.bidSecurityCurrency,
    bidSecurityValidityValue: r.bidSecurityValidityValue,
    bidSecurityValidityUnit: r.bidSecurityValidityUnit,
    bidSecurityMinValue: r.bidSecurityMinValue,
    bidSecurityMinValidity: r.bidSecurityMinValidity,
    bidBondMinValue: r.bidBondMinValue,
    bidBondMinValidity: r.bidBondMinValidity,
  };
}

const STATUS_MAP: Record<RFQStatus, { label: string; tone: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
  OPEN: { label: 'Pending Response', tone: 'warning' },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
  CLOSED: { label: 'Closed', tone: 'info' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  RETURNED: { label: 'Returned', tone: 'danger' },
};

const deadlineTime = (date: string) => new Date(`${date}T23:59:59`).getTime();
const dueSoon = (rfq: VendorRFQ) => ['OPEN', 'RETURNED'].includes(rfq.status) && deadlineTime(rfq.deadline) >= Date.now() && deadlineTime(rfq.deadline) <= Date.now() + 3 * 86400000;

// ─── Component ──────────────────────────────────────────────

export default function VendorRFQsPage() {
  const [searchParams] = useSearchParams();
  const { data: rfqs, loading, error, reload } = useServiceData(
    () => vendorPortalService.listRfqs().then((list) => list.map(mapVendorRfq)),
    [] as VendorRFQ[]
  );

  useEffect(() => {
    const rfqParam = searchParams.get('rfq');
    const searchParam = searchParams.get('search');
    if (searchParam) {
      setSearch(searchParam);
    }
    if (!rfqParam || rfqs.length === 0) return;
    const match = rfqs.find(rfq => String(rfq.id) === rfqParam || rfq.rfqNumber === rfqParam);
    if (!match) return;
    setExpandedRFQ(match.id);
    setPage(Math.floor(rfqs.indexOf(match) / 10) + 1);
    const el = document.getElementById(`vrfq-card-${match.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchParams, rfqs]);

  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteLoadError, setQuoteLoadError] = useState<string | null>(null);
  const quoteRequest = useRef(0);
  const quotePanelRef = useRef<HTMLDivElement>(null);
  const [kpiFilter, setKpiFilter] = useState<RFQStatus | 'DEADLINE_SOON' | null>(null);
  const [expandedRFQ, setExpandedRFQ] = useState<string | null>(null);
  const [returnToast, setReturnToast] = useState<string | null>(null);
  const [quotModal, setQuotModal] = useState<VendorRFQ | null>(null);
  const [quotPrices, setQuotPrices] = useState<Record<number, number>>({});
  const [quotModalTitle, setQuotModalTitle] = useState('Submit Quotation');
  const [quotLeadTime, setQuotLeadTime] = useState('');
  // ── Payment terms fetched dynamically from Company Settings ──
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const paymentTermsFetched = useRef(false);
  useEffect(() => {
    if (paymentTermsFetched.current) return;
    paymentTermsFetched.current = true;
    companySettingsService.listPaymentTerms().then((terms) => {
      setPaymentTerms(terms.filter((t) => t.isActive));
    }).catch(() => {
      // Fall back to empty — the dropdown will show a placeholder
    });
  }, []);
  const defaultPayTerm = paymentTerms.length > 0 ? paymentTerms[0].name : '';

  // ── Custom Payment Plans ──
  const [customPlans, setCustomPlans] = useState<PaymentPlan[]>([]);
  const [showCustomPlanModal, setShowCustomPlanModal] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [editPlan, setEditPlan] = useState<PaymentPlan | null>(null);
  const [showViewPlanModal, setShowViewPlanModal] = useState(false);
  const [selectedPaymentPlanId, setSelectedPaymentPlanId] = useState<string | null>(null);
  const [deleteConfirmPlanId, setDeleteConfirmPlanId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset deleteError when opening a new delete dialog
  useEffect(() => {
    if (deleteConfirmPlanId) setDeleteError(null);
  }, [deleteConfirmPlanId]);

  // Escape key to close delete confirmation
  useEffect(() => {
    if (!deleteConfirmPlanId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) setDeleteConfirmPlanId(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [deleteConfirmPlanId, isDeleting]);
  const customPlansFetched = useRef(false);
  useEffect(() => {
    if (customPlansFetched.current) return;
    customPlansFetched.current = true;
    vendorPortalService.listPaymentPlans().then((plans) => {
      setCustomPlans(plans);
    }).catch(() => {});
  }, []);

  // Find the currently selected custom plan object
  const selectedCustomPlan = useMemo(() => {
    if (!selectedPaymentPlanId) return null;
    return customPlans.find((p) => p.id === selectedPaymentPlanId) || null;
  }, [customPlans, selectedPaymentPlanId]);

  const [quotPayTerms, setQuotPayTerms] = useState(defaultPayTerm);
  const [vendorQuotationNumber, setVendorQuotationNumber] = useState('');
  const [quotNotes, setQuotNotes] = useState('');
  // ── Custom field values (for Simple RFQ) ──
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | number>>({});
  // ── Evaluation parameter values (for Custom RFQ — vendor fills info, not scores) ──
  const [evalParamValues, setEvalParamValues] = useState<Record<string, string>>({});
  // ── Expanded evaluation categories (accordion) ──
  const [expandedEvalCats, setExpandedEvalCats] = useState<Set<string>>(new Set());

  const [currency, setCurrency] = useState(companyDefaultCurrency);
  // Keep local currency state in sync when company default changes from context
  useEffect(() => {
    setCurrency(companyDefaultCurrency);
  }, [companyDefaultCurrency]);
  // ── Per-item currencies (each item has its own independent currency) ──
  const [itemCurrencies, setItemCurrencies] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [vquotModalState, setVquotModalState] = useState<VquotModalState>('open');
  const isVquotOpen = vquotModalState === 'open';
  const isVquotExpanded = vquotModalState === 'expanded';
  const isVquotMinimized = vquotModalState === 'minimized';

  // ── Previous Submission Pre-fill & Snapshot Comparison ──
  const [previousQuotation, setPreviousQuotation] = useState<any | null>(null);
  const [previousQuotationsList, setPreviousQuotationsList] = useState<any[]>([]);
  const [selectedPrevVersionId, setSelectedPrevVersionId] = useState<string | number | null>(null);
  const [showPreviousQuoteDetails, setShowPreviousQuoteDetails] = useState(false);
  // ── Bid Security — per-RFQ state to support multiple RFQ cards ──
  const [, setBidSecurityUploadingRfqId] = useState<string | null>(null);
  const [, setBidSecurityDocs] = useState<Record<string, QuotationBidSecurity>>({});
  const [, setBidSecurityErrors] = useState<Record<string, string>>({});

  // ── Bid Security — vendor input fields for modal ──
  const [bidSecValueType, setBidSecValueType] = useState<'FIXED_AMOUNT' | 'PERCENTAGE'>('FIXED_AMOUNT');
  const [bidSecValue, setBidSecValue] = useState('');
  const [bidSecCurrency, setBidSecCurrency] = useState(companyDefaultCurrency || 'KES');
  const [bidSecValidityValue, setBidSecValidityValue] = useState('');
  const [bidSecValidityUnit, setBidSecValidityUnit] = useState<'DAYS' | ''>('DAYS');
  const [bidSecFile, setBidSecFile] = useState<File | null>(null);
  // Bid Security — additional fields (bond number, issuer)
  const [bidSecBondNumber, setBidSecBondNumber] = useState('');
  const [bidSecIssuer, setBidSecIssuer] = useState('');

  // ── Bid Bond — vendor input fields for modal ──
  const [bidBondFile, setBidBondFile] = useState<File | null>(null);
  const [bidBondUploadError, setBidBondUploadError] = useState<string | null>(null);
  const [bidBondNumber, setBidBondNumber] = useState('');
  const [bidBondIssuer, setBidBondIssuer] = useState('');
  const [bidBondAmount, setBidBondAmount] = useState('');
  const [bidBondCurrency, setBidBondCurrency] = useState(companyDefaultCurrency || 'KES');
  const [bidBondIssueDate, setBidBondIssueDate] = useState('');
  const [bidBondExpiryDate, setBidBondExpiryDate] = useState('');
  const [bidBondValidityValue, setBidBondValidityValue] = useState('');
  const [bidBondValidityUnit, setBidBondValidityUnit] = useState<'DAYS' | ''>('DAYS');

  // ── SSE real-time reload: when vendor notification arrives, refresh data ──
  useEffect(() => {
    const handleNotification = (data: unknown) => {
      const notif = data as { type?: string };
      if (notif?.type === 'QUOTATION_RETURNED' || notif?.type === 'QUOTATION_APPROVED' || notif?.type === 'QUOTATION_REJECTED') {
        reload();
      }
    };
    const unsub = sseClient.on('vendor_notification', handleNotification);
    return unsub;
  }, [reload]);

  // ── Toast for returned quotations — only on initial load ──
  const shownReturnToast = useRef(false);
  useEffect(() => {
    if (shownReturnToast.current) return;
    const returned = rfqs.filter(r => r.status === 'RETURNED');
    if (returned.length > 0) {
      shownReturnToast.current = true;
      const msg = returned.length === 1
        ? `📋 Quotation for ${returned[0].rfqNumber} has been returned for revision. Please review feedback and resubmit.`
        : `📋 ${returned.length} quotations have been returned for revision. Please review feedback and resubmit.`;
      setReturnToast(msg);
    }
  }, [rfqs]);


  // Summary
  const summary = useMemo(() => ({
    total: rfqs.length,
    open: rfqs.filter(r => r.status === 'OPEN').length,
    submitted: rfqs.filter(r => r.status === 'SUBMITTED').length,
    returned: rfqs.filter(r => r.status === 'RETURNED').length,
    deadlineSoon: rfqs.filter(dueSoon).length,
  }), [rfqs]);

  // Filter
  const filtered = useMemo(() => {
    let list = rfqs;
    if (kpiFilter === 'DEADLINE_SOON') {
      list = list.filter(dueSoon);
    } else if (kpiFilter) {
      list = list.filter(r => r.status === kpiFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(r => [r.rfqNumber, r.title, r.buyerCompany, ...r.items.map(item => item.name)].some(value => value.toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => sortBy === 'deadline' ? deadlineTime(a.deadline) - deadlineTime(b.deadline) : sortBy === 'action' ? Number(!['OPEN', 'RETURNED'].includes(a.status)) - Number(!['OPEN', 'RETURNED'].includes(b.status)) || deadlineTime(a.deadline) - deadlineTime(b.deadline) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rfqs, kpiFilter, search, sortBy]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visibleRfqs = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Deadline helper
  const getDeadlineInfo = (deadline: string) => {
    const diff = deadlineTime(deadline) - Date.now();
    const days = Math.ceil(diff / 86400000);
    if (diff < 0) return { text: 'Expired', cls: 'urgent' };
    if (days <= 1) return { text: 'Closes today', cls: 'urgent' };
    if (days <= 5) return { text: `${days}d left`, cls: 'soon' };
    return { text: `${days}d left`, cls: 'normal' };
  };

  // Open quotation modal
  const openQuotModal = useCallback(async (rfq: VendorRFQ) => {
    const requestId = ++quoteRequest.current;
    let currentRfq = rfq;
    setQuoteLoading(true); setQuoteLoadError(null); setSubmitError(null);
    setQuotModalTitle(rfq.status === 'SUBMITTED' ? 'View Quotation' : rfq.needsResubmit ? 'Resubmit Quotation' : 'Submit Quotation');
    setVquotModalState('open');
    setShowCustomPlanModal(false); setShowViewPlanModal(false); setEditPlan(null); setDeleteConfirmPlanId(null);
    setPreviousQuotationsList([]);
    setQuotModal(currentRfq);
    setPreviousQuotation(null);
    setShowPreviousQuoteDetails(false);

    // Fetch RFQ details + existing quotation (if any) for pre-filling
    let myQuot: any = null;
    let allMyQuotes: any[] = [];
    try {
      const res = await vendorPortalService.getRfq(String(rfq.id));
      if (requestId !== quoteRequest.current) return;
      if (res?.rfq) {
        currentRfq = { ...mapVendorRfq(res.rfq), status: rfq.status, needsResubmit: rfq.needsResubmit };
        setQuotModal(currentRfq);
      }
      if (res?.myQuotation) {
        myQuot = res.myQuotation;
        setPreviousQuotation(myQuot);
      }
      try {
        const allQuotations = await vendorPortalService.listQuotations();
        const cleanRfqId = String(rfq.id).toLowerCase().trim().replace(/^rfq-?/i, '');
        const cleanRfqNum = (rfq.rfqNumber || '').toLowerCase().trim().replace(/^rfq-?/i, '');

        const rfqQuots = allQuotations.filter((q: any) => {
          const qRfqId = String(q.rfqId || q.rfq?.id || '').toLowerCase().trim().replace(/^rfq-?/i, '');
          const qRfqNum = String(q.rfqNumber || q.rfq?.rfqNumber || '').toLowerCase().trim().replace(/^rfq-?/i, '');
          return (
            (cleanRfqId && qRfqId === cleanRfqId) ||
            (cleanRfqNum && qRfqNum === cleanRfqNum)
          );
        });

        if (rfqQuots.length > 0) {
          allMyQuotes = [...rfqQuots].sort((a, b) => (b.versionNumber || 1) - (a.versionNumber || 1));
          if (myQuot) {
            const enriched = allMyQuotes.find(q => String(q.id) === String(myQuot.id));
            if (enriched) myQuot = { ...enriched, ...myQuot, items: enriched.items?.length ? enriched.items : myQuot.items };
          }
        } else if (myQuot) {
          allMyQuotes = [myQuot];
        }
      } catch {
        if (myQuot) allMyQuotes = [myQuot];
      }
    } catch {
      if (requestId !== quoteRequest.current) return;
      setQuoteLoadError('Unable to load quotation details. Please close this window and try again.');
      setQuoteLoading(false);
      return;
    }

    if (requestId !== quoteRequest.current) return;
    // Bid documents use a separate vendor endpoint. Keep the submitted values together
    // for the read view and pre-fill, without borrowing them for historical snapshots.
    if (myQuot?.id && (currentRfq.bidSecurityRequired || currentRfq.bidBondRequired)) {
      const security = await vendorPortalService.getBidSecurity(String(myQuot.id));
      if (requestId !== quoteRequest.current) return;
      if (security) myQuot = {
        ...myQuot,
        bidSecurityValueType: security.bidSecurityValueType, bidSecurityValue: security.bidSecurityValue,
        bidSecurityCurrency: security.bidSecurityCurrency, bidSecurityValidityValue: security.bidSecurityValidityValue,
        bidSecurityValidityUnit: security.bidSecurityValidityUnit, bidSecurityBondNumber: security.bondNumber,
        bidSecurityIssuer: security.issuer, bidSecurityDocumentUrl: security.publicUrl,
        bidBondNumber: security.bondNumber, bidBondIssuer: security.issuer, bidBondAmount: security.bondAmount,
        bidBondCurrency: security.bondCurrency, bidBondIssueDate: security.issueDate, bidBondExpiryDate: security.expiryDate,
        bidBondValidityValue: security.bidBondValidityValue, bidBondValidityUnit: security.bidBondValidityUnit,
        bidBondDocumentUrl: security.publicUrl,
      };
    }
    const fullList: any[] = [];
    if (allMyQuotes.length > 0 || myQuot) {
      const baseQuot = myQuot || allMyQuotes[0] || {};
      const versionHistory = Array.isArray(baseQuot.versionHistory) ? baseQuot.versionHistory : [];

      if (versionHistory.length > 0) {
        versionHistory.forEach((vh: any, idx: number) => {
          const vNum = vh.versionNumber || (idx + 1);
          fullList.push({
            ...vh,
            snapshotKey: `history-${vNum}-${idx}`,
            versionNumber: vNum,
            qNo: `Q${vNum}`,
          });
        });
        const latestReturnedVer = baseQuot.status === 'RETURNED'
          ? (versionHistory.length + 1)
          : (baseQuot.versionNumber || versionHistory.length + 1);

        fullList.push({
          ...baseQuot,
          snapshotKey: 'latest',
          versionNumber: latestReturnedVer,
          qNo: `Q${latestReturnedVer}`,
        });
      } else {
        // Preserve the version reported by the service, even without stored history.
        fullList.push({
          ...baseQuot,
          snapshotKey: 'latest',
          versionNumber: baseQuot.versionNumber || 1,
          qNo: `Q${baseQuot.versionNumber || 1}`,
        });
      }

      // Sort descending by version number (latest returned first)
      fullList.sort((a: any, b: any) => (b.versionNumber || 1) - (a.versionNumber || 1));
    }

    setPreviousQuotationsList(fullList);
    if (fullList.length > 0) {
      setSelectedPrevVersionId(fullList[0].snapshotKey);
    } else {
      setSelectedPrevVersionId(null);
    }

    const matchingQuot = myQuot || (allMyQuotes.length > 0 ? allMyQuotes[0] : null);
    if (matchingQuot) setPreviousQuotation(matchingQuot);
    if (!matchingQuot && rfq.status === 'SUBMITTED') setQuoteLoadError('The submitted quotation could not be retrieved. Please close this window and try again.');
    const prevCustomValues = matchingQuot?.customFieldValues || {};

    const prices: Record<number, number> = {};
    const initCurrencies: Record<number, string> = {};
    currentRfq.items.forEach((item, idx) => {
      const qItem = matchingQuot?.items?.find((qi: any) => qi.rfqItemId === item.id || qi.id === item.id) || matchingQuot?.items?.[idx] || matchingQuot?.lineItems?.[idx];
      prices[idx] = qItem?.unitPrice ?? 0;
      initCurrencies[idx] = qItem?.currency || matchingQuot?.currency || companyDefaultCurrency;
    });
    setQuotPrices(prices);
    setItemCurrencies(initCurrencies);
    setQuotLeadTime(matchingQuot?.leadTimeDays ? String(matchingQuot.leadTimeDays) : (matchingQuot?.leadTime ? String(matchingQuot.leadTime) : ''));
    setQuotPayTerms(matchingQuot?.paymentTerms || defaultPayTerm);
    setVendorQuotationNumber(matchingQuot?.vendorQuotationNumber || `QTN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setSelectedPaymentPlanId(matchingQuot?.paymentPlanId || null);
    setQuotNotes(matchingQuot?.notes || matchingQuot?.vendorNotes || '');
    setCurrency(matchingQuot?.currency || companyDefaultCurrency);
    setAttachments([]);

    // Initialize custom field values
    const initCustomValues: Record<string, string | number> = {};
    (currentRfq.customFields || []).forEach((cf) => {
      initCustomValues[cf.id] = prevCustomValues[cf.id] ?? prevCustomValues[cf.fieldName] ?? '';
    });
    setCustomFieldValues(initCustomValues);

    // Initialize evaluation parameter values
    const initEvalValues: Record<string, string> = {};
    (currentRfq.evaluationCategories || []).forEach((cat) => {
      (cat.subParameters || []).filter(p => p.enabled !== false).forEach((sp) => {
        const prevVal = prevCustomValues[`eval_${sp.id}`] || prevCustomValues[sp.id] || '';
        initEvalValues[sp.id] = String(prevVal);
      });
    });
    setEvalParamValues(initEvalValues);

    // All categories collapsed by default — vendor clicks to expand
    setExpandedEvalCats(new Set());

    // Pre-fill bid security & bid bond format fields from previous quotation (if available) or RFQ default
    const prevBNo = myQuot?.bidSecurityBondNumber || myQuot?.bidBondNumber || '';
    const prevIssuer = myQuot?.bidSecurityIssuer || myQuot?.bidBondIssuer || '';
    const prevVal = myQuot?.bidSecurityValue ?? myQuot?.bidBondAmount ?? currentRfq.bidSecurityMinValue ?? '';
    const prevValDays = myQuot?.bidSecurityValidityValue ?? myQuot?.bidBondValidityValue ?? currentRfq.bidSecurityMinValidity ?? '';

    setBidSecValueType(
      (myQuot?.bidSecurityValueType || currentRfq.bidSecurityValueType as 'FIXED_AMOUNT' | 'PERCENTAGE') || 'FIXED_AMOUNT'
    );
    setBidSecValue(prevVal ? String(prevVal) : '');
    setBidSecCurrency(myQuot?.bidSecurityCurrency || currentRfq.bidSecurityCurrency || companyDefaultCurrency || 'KES');
    setBidSecValidityValue(prevValDays ? String(prevValDays) : '');
    setBidSecValidityUnit((myQuot?.bidSecurityValidityUnit || currentRfq.bidSecurityValidityUnit as 'DAYS' | '') || 'DAYS');
    setBidSecFile(null);
    setBidSecBondNumber(prevBNo);
    setBidSecIssuer(prevIssuer);
    setBidBondFile(null);
    setBidBondUploadError(null);
    setBidBondNumber(prevBNo);
    setBidBondIssuer(prevIssuer);
    setBidBondAmount(prevVal ? String(prevVal) : '');
    setBidBondCurrency(myQuot?.bidBondCurrency || currentRfq.bidSecurityCurrency || companyDefaultCurrency || 'KES');
    setBidBondIssueDate(myQuot?.bidBondIssueDate || '');
    setBidBondExpiryDate(myQuot?.bidBondExpiryDate || '');
    setBidBondValidityValue(prevValDays ? String(prevValDays) : '');
    setBidBondValidityUnit((myQuot?.bidBondValidityUnit as 'DAYS' | '') || 'DAYS');
    // Also reset card-body bid security upload state to prevent stale loading indicator
    setBidSecurityUploadingRfqId(prev => prev === currentRfq.id ? null : prev);
    setBidSecurityErrors(prev => { const n = { ...prev }; delete n[currentRfq.id]; return n; });
    if (currentRfq.status === 'SUBMITTED' && !currentRfq.needsResubmit) {
      setQuotModalTitle('View Quotation');
    } else if (currentRfq.needsResubmit) {
      setQuotModalTitle('Resubmit Quotation');
    } else {
      setQuotModalTitle('Submit Quotation');
    }
    setQuoteLoading(false);
  }, [companyDefaultCurrency, defaultPayTerm]);

  // Calculate total — convert each item from its per-item currency to the quotation currency before summing
  const quotTotal = useMemo(() => {
    if (!quotModal) return 0;
    return quotModal.items.reduce((sum, item, idx) => {
      const itemCurrency = itemCurrencies[idx] || companyDefaultCurrency;
      const lineTotal = item.quantity * (quotPrices[idx] || 0);
      return sum + convert(lineTotal, itemCurrency, currency);
    }, 0);
  }, [quotModal, quotPrices, itemCurrencies, companyDefaultCurrency, currency, convert]);

  const isQuotReadOnly = Boolean(quotModal?.status === 'SUBMITTED' && !quotModal?.needsResubmit);

  const activePrevQuote = previousQuotationsList.find(q => q.snapshotKey === selectedPrevVersionId) || previousQuotation;
  const closeQuote = () => { if (submitting || isDeleting || showCustomPlanModal) return; quoteRequest.current += 1; setQuotModal(null); };
  useDialogFocus(quotePanelRef, Boolean(quotModal && !isVquotMinimized), () => {
    if (submitting || isDeleting || planSaving) return;
    if (showCustomPlanModal) { setShowCustomPlanModal(false); setEditPlan(null); }
    else if (deleteConfirmPlanId) setDeleteConfirmPlanId(null);
    else if (showViewPlanModal) setShowViewPlanModal(false);
    else closeQuote();
  });

  // Submit quotation (new or resubmit)
  const handleSubmitQuot = useCallback(async () => {
    if (!quotModal || submitting || isQuotReadOnly || quoteLoading || quoteLoadError) return;
    setSubmitError(null);
    const leadDays = Number(quotLeadTime);
    if (!Number.isInteger(leadDays) || leadDays < 1) {
      setSubmitError('Enter a valid lead time in days.');
      return;
    }
    const items = quotModal.items.map((item, idx) => {
      const unitPrice = quotPrices[idx] || 0;
      const itemCurrency = itemCurrencies[idx] || companyDefaultCurrency;
      // Convert unit price and line total from per-item currency to quotation currency
      const convertedUnitPrice = convert(unitPrice, itemCurrency, currency);
      const convertedLineTotal = item.quantity * convertedUnitPrice;
      return {
        rfqItemId: item.id,
        unitPrice: convertedUnitPrice,
        totalPrice: convertedLineTotal,
      };
    });
    if (items.some((i) => !Number.isFinite(i.unitPrice) || i.unitPrice <= 0)) {
      setSubmitError('Enter a unit price for every line item.');
      return;
    }

    // ── Validate required evaluation parameters (Custom RFQ) ──
    if ((quotModal.rfqType === 'TENDER' || quotModal.rfqType === 'CUSTOM') && quotModal.evaluationCategories?.length) {
      const missingRequired: string[] = [];
      for (const cat of quotModal.evaluationCategories) {
        if (!cat.enabled) continue;
        for (const sp of cat.subParameters) {
          if (!sp.enabled || !sp.required) continue;
          const val = evalParamValues[sp.id];
          if (!val || val.trim() === '') {
            missingRequired.push(`${sp.name} (${cat.name})`);
          }
        }
      }
      if (missingRequired.length > 0) {
        const msg = missingRequired.length === 1
          ? `Please fill the required evaluation parameter: ${missingRequired[0]}`
          : `Please fill all ${missingRequired.length} required evaluation parameters before submitting`;
        setSubmitError(msg);
        return;
      }
    }

    // ── Validate required custom fields (Simple RFQ) ──
    if (quotModal.customFields?.length) {
      const missingRequired: string[] = [];
      for (const cf of quotModal.customFields) {
        if (!cf.required) continue;
        const val = customFieldValues[cf.id];
        const strVal = val != null ? String(val).trim() : '';
        if (!strVal) {
          missingRequired.push(cf.fieldName);
        }
      }
      if (missingRequired.length > 0) {
        const msg = missingRequired.length === 1
          ? `Please fill the required field: ${missingRequired[0]}`
          : `Please fill all ${missingRequired.length} required fields before submitting`;
        setSubmitError(msg);
        return;
      }
    }

    setSubmitting(true);
    try {
      // Build custom field values payload (only non-empty values)
      const hasCustomFields = quotModal.customFields && quotModal.customFields.length > 0;
      const cfPayload = hasCustomFields
        ? Object.fromEntries(
            Object.entries(customFieldValues).filter(([, v]) => v !== '' && v !== null && v !== undefined)
          )
        : undefined;
      // Include evaluation parameter values for Custom RFQ (vendor-filled info)
      const hasEvalValues = (quotModal.rfqType === 'TENDER' || quotModal.rfqType === 'CUSTOM') && Object.values(evalParamValues).some(v => v.trim() !== '');
      const evalPayload = hasEvalValues
        ? Object.fromEntries(
            Object.entries(evalParamValues).filter(([, v]) => v.trim() !== '').map(([key, val]) => [`eval_${key}`, val])
          )
        : undefined;
      const mergedCustomFieldValues = cfPayload || evalPayload
        ? { ...(cfPayload || {}), ...(evalPayload || {}) }
        : undefined;
      // Build bid security & bid bond payload
      const bidSecurityPayload = quotModal.bidSecurityRequired ? {
        bidSecurityValueType: bidSecValueType,
        bidSecurityValue: bidSecValue ? parseFloat(bidSecValue) : undefined,
        bidSecurityCurrency: bidSecValueType === 'FIXED_AMOUNT' ? bidSecCurrency : undefined,
        bidSecurityValidityValue: bidSecValidityValue ? parseInt(bidSecValidityValue, 10) : undefined,
        bidSecurityValidityUnit: bidSecValidityValue ? 'DAYS' : undefined,
        // Additional bid security fields: bond number, issuer
        bidBondNumber: bidSecBondNumber || undefined,
        bidBondIssuer: bidSecIssuer || undefined,
      } : undefined;

      const bidBondPayload = quotModal.bidBondRequired ? {
        bidBondNumber,
        bidBondIssuer,
        bidBondAmount: bidBondAmount ? parseFloat(bidBondAmount) : undefined,
        bidBondCurrency,
        bidBondIssueDate: bidBondIssueDate || undefined,
        bidBondExpiryDate: bidBondExpiryDate || undefined,
        bidBondValidityValue: bidBondValidityValue ? parseInt(bidBondValidityValue, 10) : undefined,
        bidBondValidityUnit: bidBondValidityValue ? 'DAYS' : undefined,
      } : undefined;

      const submitPayload = {
        totalPrice: quotTotal,
        leadTimeDays: leadDays,
        paymentTerms: quotPayTerms,
        paymentPlanId: selectedPaymentPlanId || undefined,
        currency,
        vendorQuotationNumber: vendorQuotationNumber.trim() || undefined,
        items,
        customFieldValues: mergedCustomFieldValues,
        ...(bidSecurityPayload || {}),
        ...(bidBondPayload || {}),
      };
      const rfqId = quotModal.id; // Store before modal is cleared

      let quotationId: string | undefined;
      // Determine which bid document file (if any) to attach — hoisted to this scope
      // so it's accessible both inside and after the if/else blocks
      const bidDocFile = quotModal.needsResubmit
        ? (bidBondFile || undefined)
        : (bidBondFile || bidSecFile || undefined);

      if (quotModal.needsResubmit) {
        const result = await vendorPortalService.resubmitQuotation(
          rfqId,
          submitPayload,
          bidDocFile
        );
        if (result && 'id' in result) {
          quotationId = result.id;
        }
      } else {
        const result = await vendorPortalService.submitQuotation(
          rfqId,
          submitPayload,
          attachments.length > 0 ? attachments : undefined,
          bidDocFile
        );
        if (result && 'id' in result) {
          quotationId = result.id;
        }
      }

      // ── If bid bond was uploaded, fetch its status to update card body ──
      // Do this before clearing modal / reloading to avoid race conditions
      if (bidDocFile && quotationId) {
        try {
          const doc = await vendorPortalService.getBidSecurity(quotationId);
          if (doc) {
            setBidSecurityDocs(prev => ({ ...prev, [rfqId]: doc }));
          }
        } catch {
          // Non-blocking — document was saved server-side, will show on next page load
        }
      }

      setQuotModal(null);
      reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit quotation');
    } finally {
      setSubmitting(false);
    }
  }, [vendorQuotationNumber, submitting, isQuotReadOnly, quoteLoading, quoteLoadError, quotModal, quotLeadTime, quotPrices, itemCurrencies, companyDefaultCurrency, convert, quotTotal, quotPayTerms, selectedPaymentPlanId, currency, reload, attachments, customFieldValues, evalParamValues, bidSecValueType, bidSecValue, bidSecCurrency, bidSecValidityValue, bidSecFile, bidSecBondNumber, bidSecIssuer, bidBondFile, bidBondNumber, bidBondIssuer, bidBondAmount, bidBondCurrency, bidBondIssueDate, bidBondExpiryDate, bidBondValidityValue, bidBondValidityUnit]);

  return (
    <PageFrame className="rfq-workspace">
      {error && <MessageStrip type="error">{error}</MessageStrip>}
      {returnToast && (
        <MessageStrip type="warning" onClose={() => setReturnToast(null)} autoHideMs={8000}>
          {returnToast}
        </MessageStrip>
      )}

      {/* ── Page Lead Header ────────────────────────── */}
      <PageLead
        title="My RFQ Assignments"
        description="Manage and respond to RFQs assigned to your company"
      />

      {/* ── KPI Metric Cards ────────────────────────── */}
      <div className="rfq-metrics mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          { icon: ClipboardList, tone: 'primary' as const, value: summary.total, label: 'Total Assigned', detail: 'All time', filter: null as RFQStatus | 'DEADLINE_SOON' | null },
          { icon: Clock, tone: 'warning' as const, value: summary.open, label: 'Pending Response', detail: 'Awaiting quotation', filter: 'OPEN' as RFQStatus },
          { icon: RotateCcw, tone: 'danger' as const, value: summary.returned, label: 'Returned', detail: 'Resubmission needed', filter: 'RETURNED' as RFQStatus },
          { icon: CheckCircle2, tone: 'success' as const, value: summary.submitted, label: 'Submitted', detail: 'Quotation sent', filter: 'SUBMITTED' as RFQStatus },
          { icon: AlertTriangle, tone: 'danger' as const, value: summary.deadlineSoon, label: 'Deadline Soon', detail: 'Within 3 days', filter: 'DEADLINE_SOON' as RFQStatus | 'DEADLINE_SOON' },
        ].map((c) => {
          const isActive = c.filter === null ? !kpiFilter : kpiFilter === c.filter;
          return (
            <MetricCard
              key={c.label}
              icon={c.icon}
              tone={c.tone}
              value={c.value}
              label={c.label}
              detail={c.detail}
              className={cn(
                'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                isActive &&
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
              )}
              onClick={() => { setKpiFilter(isActive ? null : c.filter); setPage(1); }}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKpiFilter(isActive ? null : c.filter); setPage(1); } }}
            />
          );
        })}
      </div>

      <div className="rfq-toolbar">
        <div className="rfq-toolbar__search">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 rounded-xl pl-10" type="search" aria-label="Search RFQs" placeholder="Search RFQ, title, buyer, or item…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="rfq-toolbar__actions text-sm">
          <span className="rfq-muted" role="status">{filtered.length} of {rfqs.length} RFQs</span>
          {(search || kpiFilter) && <button className="rfq-details-link" onClick={() => { setSearch(''); setKpiFilter(null); setPage(1); }}>Clear filters</button>}
          <label className="rfq-muted" htmlFor="rfq-sort">Sort by</label>
          <select id="rfq-sort" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="deadline">Closing date</option><option value="action">Needs response</option></select>
        </div>
      </div>
      {loading ? <Card className="p-8 text-center text-sm text-muted-foreground" role="status">Loading RFQs…</Card> : filtered.length ? (
        <section className="rfq-register" aria-label="RFQ assignments">
          <div className="rfq-register__head text-xs" aria-hidden="true"><span>RFQ / Buyer</span><span>Status</span><span>Required items</span><span>Closing date</span><span>Actions</span></div>
          {visibleRfqs.map(rfq => {
            const expanded = expandedRFQ === rfq.id;
            const status = STATUS_MAP[rfq.status];
            const deadline = getDeadlineInfo(rfq.deadline);
            return <article className="rfq-register__entry" id={`vrfq-card-${rfq.id}`} key={rfq.id} data-expanded={expanded} aria-label={rfq.rfqNumber}>
              <div className="rfq-register__row">
                <div className="rfq-register__identity"><span className="text-base font-bold">{rfq.rfqNumber}</span><span className="text-sm font-medium">{rfq.title}</span><span className="text-xs rfq-muted">{rfq.buyerCompany}{rfq.rfqType === 'TENDER' ? ' · Tender' : ''}</span></div>
                <div><Badge className="rfq-status-badge" data-rfq-status={rfq.status} tone={status.tone}><span className="size-1.5 rounded-full bg-current" />{status.label}</Badge></div>
                <div className="rfq-register__items"><strong className="text-sm">{rfq.items.length} {rfq.items.length === 1 ? 'item' : 'items'}</strong><span className="text-xs rfq-muted" title={rfq.items.map(item => item.name).join(', ')}>{rfq.items.slice(0, 2).map(item => item.name).join(', ')}{rfq.items.length > 2 ? ` +${rfq.items.length - 2} more` : ''}</span></div>
                <div className="rfq-register__dates"><span className="text-sm font-semibold">{quoteDate(rfq.deadline)}</span><span className={cn('text-xs', ['OPEN', 'RETURNED'].includes(rfq.status) ? `rfq-deadline--${deadline.cls}` : 'rfq-muted')}>{['OPEN', 'RETURNED'].includes(rfq.status) ? deadline.text : `Created ${quoteDate(rfq.createdAt)}`}</span></div>
                <div className="rfq-register__actions">
                  {rfq.status === 'OPEN' && <Button size="sm" onClick={() => openQuotModal(rfq)}><Send size={14} /> Submit Quote</Button>}
                  {rfq.status === 'SUBMITTED' && <Button variant="outline" size="sm" onClick={() => openQuotModal(rfq)}><Eye size={14} /> View Quote</Button>}
                  {rfq.status === 'RETURNED' && <Button size="sm" onClick={() => openQuotModal(rfq)}><RotateCcw size={14} /> Resubmit Quote</Button>}
                  <button className="rfq-details-link text-xs" aria-expanded={expanded} aria-controls={`rfq-details-${rfq.id}`} onClick={() => setExpandedRFQ(expanded ? null : rfq.id)}>{expanded ? 'Hide requirements' : 'View requirements'}<ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} /></button>
                </div>
              </div>
              {expanded && <div className="rfq-register__details text-sm" id={`rfq-details-${rfq.id}`}>
                <div className="rfq-section-heading"><strong>Requirements · {rfq.title}</strong><span className="text-xs rfq-muted">Created {quoteDate(rfq.createdAt)}</span></div>
                {rfq.description && <p className="rfq-muted">{rfq.description}</p>}
                <div className="rfq-table-scroll" tabIndex={0} role="region" aria-label={`Required items for ${rfq.rfqNumber}`}><table className="rfq-pricing-table"><thead><tr><th scope="col">Item / Description</th><th scope="col">Quantity</th><th scope="col">Expected delivery</th></tr></thead><tbody>{rfq.items.map(item => <tr key={item.id}><td><strong>{item.name}</strong>{item.description && <p className="text-xs rfq-muted">{item.description}</p>}</td><td>{item.quantity} {item.unit}</td><td>{quoteDate(item.expectedDate)}</td></tr>)}</tbody></table></div>
                {(rfq.bidSecurityRequired || rfq.bidBondRequired) && <div className="flex items-center gap-2 rfq-muted"><Shield size={16} />{[rfq.bidSecurityRequired && 'Bid security required', rfq.bidBondRequired && 'Bid bond required'].filter(Boolean).join(' · ')}</div>}
              </div>}
            </article>;
          })}
          <TablePagination
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
            onPageChange={setPage}
            totalItems={filtered.length}
            perPage={PAGE_SIZE}
            className="mt-4"
          />
        </section>
      ) : <EmptyState icon={FileText} title="No RFQs Found" description={search || kpiFilter ? 'No assignments match these filters.' : 'No RFQs have been assigned to your company yet.'} action={search || kpiFilter ? <Button variant="outline" size="sm" onClick={() => { setSearch(''); setKpiFilter(null); setPage(1); }}>Clear filters</Button> : undefined} />}

        {/* ── Submit Quotation Modal (Gmail-style) ──── */}

        {quotModal && createPortal(
          <>
            {/* Backdrop only when not minimized */}
            {!isVquotMinimized && (
              <div
                className={`vquot-modal-backdrop ${isVquotExpanded ? 'vquot-modal-backdrop--expanded' : ''}`}
                onClick={closeQuote}
              />
            )}

            <div
              className={[
                'vquot-modal rfq-quote-window',
                isVquotOpen ? 'vquot-modal--open' : '',
                isVquotExpanded ? 'vquot-modal--expanded' : '',
                isVquotMinimized ? 'vquot-modal--minimized' : '',
              ].filter(Boolean).join(' ')}
              ref={quotePanelRef} role="dialog" aria-modal={!isVquotMinimized || undefined} aria-labelledby="quotation-window-title" tabIndex={-1}
              onClick={e => e.stopPropagation()}
            >
              {/* Header with Gmail-style window controls */}
              <div
                className="vquot-modal__header"
                onClick={isVquotMinimized ? () => setVquotModalState('open') : undefined}
                style={isVquotMinimized ? { cursor: 'pointer' } : undefined}
              >
                <div className="vquot-modal__header-left">
                  <span className="vquot-modal__header-icon"><Send size={14} /></span>
                  <span id="quotation-window-title" className="vquot-modal__header-title">{quotModalTitle}</span>
                  {!isVquotMinimized && (
                    <span className="vquot-modal__header-rfq">{quotModal.rfqNumber}</span>
                  )}
                  {isVquotMinimized && (
                    <span className="vquot-modal__minimized-title">{quotModal.rfqNumber} · {quotModal.title}</span>
                  )}
                </div>

                <div className="vquot-modal__window-controls" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="vquot-modal__wc-btn"
                    title={isVquotMinimized ? 'Restore' : 'Minimize'}
                    disabled={planSaving}
                    onClick={() => setVquotModalState(isVquotMinimized ? 'open' : 'minimized')}
                  >
                    {isVquotMinimized ? <ChevronUp size={14} /> : <Minus size={14} />}
                  </button>
                  {!isVquotMinimized && (
                    <button
                      type="button"
                      className="vquot-modal__wc-btn"
                      title={isVquotExpanded ? 'Restore' : 'Expand'}
                      onClick={() => setVquotModalState(isVquotExpanded ? 'open' : 'expanded')}
                    >
                      {isVquotExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>
                  )}
                  <div className="vquot-modal__wc-divider" />
                  <button
                    type="button"
                    className="vquot-modal__wc-btn vquot-modal__wc-btn--close"
                    title="Close"
                    disabled={submitting || isDeleting || showCustomPlanModal}
                    onClick={closeQuote}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Body — hidden when minimized */}
              {!isVquotMinimized && (
                <div className="vquot-modal__body">
                  <div className="rfq-quote-context"><strong className="text-base">{quotModal.title}</strong><span className="text-xs rfq-muted">{quotModal.buyerCompany} · Closes {quoteDate(quotModal.deadline)}</span></div>
                  {quoteLoading ? <FormSkeleton fields={4} /> : quoteLoadError ? <MessageStrip type="error">{quoteLoadError}</MessageStrip> : <>
                  {isQuotReadOnly && previousQuotation && <>
                    <div className={cn("rfq-quote-status", previousQuotation.status === 'REJECTED' && "rfq-quote-status--rejected")}>{previousQuotation.status === 'REJECTED' ? <X size={18} /> : <CheckCircle2 size={18} />}<div><strong className="vquot-modal__item-name">Quotation submitted · {previousQuotation.status || 'Submitted'}</strong><p className="text-xs">Submitted {quoteDate(previousQuotation.submittedAt)} · This quotation is read-only.</p></div></div>
                  </>}
                  {quotModal.needsResubmit && activePrevQuote && <div className="rfq-quote-status rfq-quote-status--returned"><RotateCcw size={18} /><div><strong>Revision requested</strong><p className="text-sm">{activePrevQuote.returnComment || activePrevQuote.returnReason || 'Review the previous submission and update your quotation below.'}</p></div></div>}
                  {activePrevQuote && <details className="rfq-inline-snapshot" open={showPreviousQuoteDetails} onToggle={event => setShowPreviousQuoteDetails(event.currentTarget.open)}>
                    <summary className="vquot-modal__label"><span className="flex items-center gap-2"><Eye size={15} />{showPreviousQuoteDetails ? 'Hide Snapshot' : 'View Snapshot'} · Submission history</span><ChevronDown size={16} /></summary>
                    <div className="rfq-inline-snapshot__body">
                      <div className="rfq-section-heading"><div><strong className="vquot-modal__item-name">Quotation Snapshot — {activePrevQuote.qNo || 'Q1'}</strong><p className="text-xs rfq-muted">Submitted {quoteDate(activePrevQuote.submittedAt)} · {activePrevQuote.status || 'Submitted'}</p></div>
                        {previousQuotationsList.length > 1 && <label className="vquot-modal__label">Version <select className="vquot-modal__input" aria-label="Snapshot version" value={selectedPrevVersionId || ''} onChange={e => setSelectedPrevVersionId(e.target.value)}>{previousQuotationsList.map(pq => <option key={pq.snapshotKey} value={pq.snapshotKey}>{pq.qNo} · {pq.vendorQuotationNumber || 'Submitted quotation'}</option>)}</select></label>}
                      </div>
                      <QuotationDetails key={activePrevQuote.snapshotKey || activePrevQuote.id} quote={activePrevQuote} rfq={quotModal} formatAmount={formatAmount} />
                    </div>
                  </details>}
                  {isQuotReadOnly && previousQuotation && <QuotationDetails quote={previousQuotation} rfq={quotModal} formatAmount={formatAmount} />}
                  {!isQuotReadOnly && <>
                  <div className="vrfq-card__items-title">Item Pricing</div>
                  <div className="vquot-modal__items">
                    {quotModal.items.map((item, idx) => (
                      <div key={idx} className="vquot-modal__item">
                        <div>
                          <div className="vquot-modal__item-name">{item.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{item.description}</div>
                        </div>
                        <div className="vquot-modal__item-qty">{item.quantity} {item.unit}</div>
                        <CurrencyAmountInput
                          amount={quotPrices[idx] || ''}
                          currency={itemCurrencies[idx] || companyDefaultCurrency}
                          onAmountChange={(val) => setQuotPrices(prev => ({ ...prev, [idx]: val === '' ? 0 : val as number }))}
                          onCurrencyChange={(code) => setItemCurrencies(prev => ({ ...prev, [idx]: code }))}
                          placeholder="Unit price"
                          min={0}
                          disabled={isQuotReadOnly}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="vquot-modal__total">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="vquot-modal__total-label">Total Quotation Value</span>
                      <CurrencySelector value={currency} onChange={setCurrency} size="sm" disabled={isQuotReadOnly} />
                    </div>
                    <span className="vquot-modal__total-value">{formatAmount(quotTotal, currency)}</span>
                  </div>

                  <div className="rfq-commercial-fields">
                    <div className="vquot-modal__field">
                      <label className="vquot-modal__label" htmlFor="quote-reference">Vendor Quote Ref No</label>
                      <input id="quote-reference" className="vquot-modal__input" value={vendorQuotationNumber} onChange={e => setVendorQuotationNumber(e.target.value)} />
                    </div>
                    <div className="vquot-modal__field">
                      <label className="vquot-modal__label" htmlFor="quote-lead-time">Lead Time (days) *</label>
                      <input id="quote-lead-time" className="vquot-modal__input" type="number" min="1" step="1" placeholder="e.g. 14" value={quotLeadTime} onChange={e => setQuotLeadTime(e.target.value)} />
                    </div>
                    <div className="vquot-modal__field rfq-payment-field">
                      <label className="vquot-modal__label" htmlFor="quote-payment-terms">Payment Terms</label>
                      <div className="rfq-payment-controls">
                        <select id="quote-payment-terms" disabled={planSaving} className="vquot-modal__input" value={selectedPaymentPlanId ? `custom_${selectedPaymentPlanId}` : quotPayTerms} onChange={e => {
                          const value = e.target.value;
                          setShowViewPlanModal(false); setDeleteConfirmPlanId(null); setShowCustomPlanModal(false);
                          if (value.startsWith('custom_')) {
                            const plan = customPlans.find(p => p.id === value.slice(7));
                            if (plan) { setSelectedPaymentPlanId(plan.id); setQuotPayTerms(plan.name); }
                          } else { setSelectedPaymentPlanId(null); setQuotPayTerms(value); }
                        }}>
                          {!quotPayTerms && <option value="">Select payment terms</option>}
                          <optgroup label="Standard Terms">{paymentTerms.map(term => <option key={term.id} value={term.name}>{term.name}</option>)}</optgroup>
                          {!!customPlans.length && <optgroup label="Custom Payment Plans">{customPlans.map(plan => <option key={plan.id} value={`custom_${plan.id}`}>{plan.name}</option>)}</optgroup>}
                        </select>
                        {selectedCustomPlan && <div className="rfq-plan-actions">
                          <button type="button" className="rfq-icon-button" disabled={planSaving} title="Edit payment plan" aria-label="Edit payment plan" onClick={() => { setEditPlan(selectedCustomPlan); setShowCustomPlanModal(true); setShowViewPlanModal(false); setDeleteConfirmPlanId(null); }}><Pencil size={14} /></button>
                          <button type="button" className="rfq-icon-button" disabled={planSaving} title="View payment plan" aria-label="View payment plan" aria-expanded={showViewPlanModal} onClick={() => { setShowViewPlanModal(!showViewPlanModal); setShowCustomPlanModal(false); setDeleteConfirmPlanId(null); }}><Eye size={14} /></button>
                          <button type="button" className="rfq-icon-button rfq-icon-button--danger" disabled={planSaving} title="Delete payment plan" aria-label="Delete payment plan" onClick={() => { setDeleteConfirmPlanId(selectedCustomPlan.id); setShowCustomPlanModal(false); setShowViewPlanModal(false); }}><Trash2 size={14} /></button>
                        </div>}
                        <button type="button" className="rfq-secondary-action text-xs" disabled={planSaving} aria-expanded={showCustomPlanModal} onClick={() => { setEditPlan(null); setShowCustomPlanModal(true); setShowViewPlanModal(false); setDeleteConfirmPlanId(null); }}><Plus size={14} /> Create Custom Payment Plan</button>
                      </div>
                      {showCustomPlanModal && <CustomPaymentPlanModal key={editPlan?.id || 'new'} embedded onSavingChange={setPlanSaving} editPlan={editPlan} onClose={() => { setShowCustomPlanModal(false); setEditPlan(null); }} onSaved={plan => {
                        setCustomPlans(plans => plans.some(p => p.id === plan.id) ? plans.map(p => p.id === plan.id ? plan : p) : [plan, ...plans]);
                        setSelectedPaymentPlanId(plan.id); setQuotPayTerms(plan.name);
                      }} />}
                      {showViewPlanModal && selectedCustomPlan && <section className="rfq-read-section" aria-label="Payment plan details"><div className="rfq-read-section__body"><div className="rfq-section-heading"><strong className="vquot-modal__label">{selectedCustomPlan.name}</strong><button type="button" className="rfq-icon-button" aria-label="Close payment plan details" onClick={() => setShowViewPlanModal(false)}><X size={14} /></button></div><ol className="rfq-payment-milestones text-sm">{selectedCustomPlan.milestones.map(m => <li key={m.id}><span>{m.title}</span><strong>{m.percentage}%</strong></li>)}</ol></div></section>}
                      {deleteConfirmPlanId && <section className="rfq-delete-confirm text-sm" aria-label="Delete payment plan confirmation">
                        <strong>Delete {selectedCustomPlan?.name}?</strong><span className="rfq-muted">This removes the saved plan from your account and cannot be undone.</span>
                        {deleteError && <p className="rfq-error" role="alert">{deleteError}</p>}
                        <div className="flex justify-end gap-2"><button className="vendor-btn vendor-btn--secondary" disabled={isDeleting} onClick={() => setDeleteConfirmPlanId(null)}>Keep plan</button><button className="vendor-btn vendor-btn--secondary" disabled={isDeleting} onClick={async () => {
                          setIsDeleting(true); setDeleteError(null);
                          try {
                            await vendorPortalService.deletePaymentPlan(deleteConfirmPlanId);
                            setCustomPlans(plans => plans.filter(p => p.id !== deleteConfirmPlanId));
                            setSelectedPaymentPlanId(null); setQuotPayTerms(defaultPayTerm); setDeleteConfirmPlanId(null);
                          } catch (e) { setDeleteError(e instanceof Error ? e.message : 'Failed to delete payment plan'); }
                          finally { setIsDeleting(false); }
                        }}>{isDeleting ? 'Deleting…' : 'Delete plan'}</button></div>
                      </section>}
                    </div>
                  </div>

                      {/* ── Custom Fields (Simple RFQ) ──────── */}
                  {quotModal.customFields && quotModal.customFields.filter(cf => (cf.weightage && cf.weightage > 0) || cf.required).length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                        Additional Information
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {quotModal.customFields.filter(cf => (cf.weightage && cf.weightage > 0) || cf.required).map((cf) => (

                          <div key={cf.id} className="vquot-modal__field">
                            <label className="vquot-modal__label">
                              {cf.fieldName}
                              {cf.required && <span style={{ color: 'var(--danger-500)', marginLeft: 2 }}>*</span>}
                            </label>
                            {cf.fieldType === 'date' ? (
                              <input
                                className="vquot-modal__input"
                                type="date"
                                value={customFieldValues[cf.id] ? String(customFieldValues[cf.id]).slice(0, 10) : ''}
                                onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [cf.id]: e.target.value }))}
                                disabled={isQuotReadOnly}
                              />
                            ) : cf.fieldType === 'attachment' ? (
                              <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 0' }}>
                                Please attach the required document using the attachments section below.
                              </div>
                            ) : (
                              <input
                                className="vquot-modal__input"
                                type="text"
                                placeholder={`Enter ${cf.fieldName.toLowerCase()}`}
                                value={customFieldValues[cf.id] != null ? String(customFieldValues[cf.id]) : ''}
                                onChange={(e) => setCustomFieldValues(prev => ({ ...prev, [cf.id]: e.target.value }))}
                                disabled={isQuotReadOnly}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Evaluation Parameters Input (Tender / Custom RFQ) ──────── */}
                  {(quotModal.rfqType === 'TENDER' || quotModal.rfqType === 'CUSTOM') && quotModal.evaluationCategories && quotModal.evaluationCategories.length > 0 && (
                    <div className="vquot-eval-section">
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: 5,
                          background: 'rgba(10, 110, 209, 0.1)',
                          color: 'var(--primary-600, #0a6ed1)',
                          fontSize: 13, fontWeight: 700,
                        }}>
                          <Sliders size={13} />
                        </span>
                        Evaluation Parameters
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>— fill required parameter information</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {quotModal.evaluationCategories.filter(c => c.enabled !== false).map((cat) => {
                          const isExpanded = expandedEvalCats.has(cat.id);
                          const filledCount = (cat.subParameters || []).filter(p => p.enabled !== false && evalParamValues[p.id]?.trim()).length;
                          const totalCount = (cat.subParameters || []).filter(p => p.enabled !== false).length;
                          return (
                            <div key={cat.id} className={`vquot-eval-category ${isExpanded ? 'vquot-eval-category--expanded' : ''}`}>
                              <button
                                type="button"
                                className="vquot-eval-category__head"
                                onClick={() => {
                                  setExpandedEvalCats(prev => {
                                    const next = new Set(prev);
                                    if (next.has(cat.id)) next.delete(cat.id);
                                    else next.add(cat.id);
                                    return next;
                                  });
                                }}
                              >
                                <div className="vquot-eval-category__head-left">
                                  <span className={`vquot-eval-category__chevron ${isExpanded ? 'vquot-eval-category__chevron--open' : ''}`}>
                                    <ChevronRight size={14} />
                                  </span>
                                  <span className="vquot-eval-category__name">{cat.name}</span>
                                </div>
                                <div className="vquot-eval-category__head-right">
                                  {!isExpanded && filledCount > 0 && (
                                    <span className="vquot-eval-category__count">{filledCount}/{totalCount} filled</span>
                                  )}
                                  <span className="vquot-eval-category__weight">{cat.weightage}% weight</span>
                                </div>
                              </button>
                              <div className={`vquot-eval-params ${isExpanded ? 'vquot-eval-params--open' : ''}`}>
                                <div className="vquot-eval-params__inner">
                                {(cat.subParameters || []).filter(p => p.enabled !== false).map((sp) => (
                                  <div key={sp.id} className="vquot-eval-param-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <span className="vquot-eval-param-name">{sp.name}</span>
                                      {sp.required && <span className="vquot-eval-param-required">*</span>}
                                      {sp.description && (
                                        <span className="vquot-eval-param-hint" title={sp.description}>ⓘ</span>
                                      )}
                                    </div>
                                    <input
                                      type="text"
                                      className="vquot-eval-input"
                                      placeholder={sp.description || `Provide ${sp.name.toLowerCase()} details`}
                                      value={evalParamValues[sp.id] ?? ''}
                                      onChange={(e) => setEvalParamValues(prev => ({ ...prev, [sp.id]: e.target.value }))}
                                      disabled={isQuotReadOnly}
                                    />
                                  </div>
                                ))}
                                </div>
                              </div>
                            </div>
                          )})}
                      </div>
                    </div>
                  )}

                  <div className="vquot-modal__field">
                    <label className="vquot-modal__label" htmlFor="quote-notes">Notes / Remarks</label>
                    <textarea id="quote-notes" className="vquot-modal__textarea" placeholder="Any additional notes, conditions, or remarks..." value={quotNotes} onChange={e => setQuotNotes(e.target.value)} disabled={isQuotReadOnly} />
                  </div>

                  {/* ── Bid Security Section (Vendor Inputs) ── */}
                  {quotModal.bidSecurityRequired && (
                    <div className="vquot-section">
                      <div className="vquot-section-card">
                        <div className="vquot-section-header">
                          <Shield size={16} className="vquot-section-header__icon" />
                          <div>
                            <div className="vquot-section-header__title">Bid Security Details</div>
                            <div className="vquot-section-header__sub">Required by buyer — provide your bid security information</div>
                          </div>
                        </div>

                        {/* ── Buyer requirement hints ── */}
                        {(quotModal.bidSecurityValue != null || quotModal.bidSecurityMinValue != null || quotModal.bidSecurityValidityValue != null || quotModal.bidSecurityMinValidity != null) && (
                          <div style={{
                            padding: '8px 12px', background: 'rgba(10,110,209,0.06)',
                            border: '1px solid rgba(10,110,209,0.15)', borderRadius: 'var(--radius-sm)',
                            marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
                            fontSize: 13, color: 'var(--primary-600, #0a6ed1)',
                          }}>
                            <span style={{ fontWeight: 600, marginRight: 4 }}>ℹ Buyer Requirement:</span>
                            {(quotModal.bidSecurityValue != null || quotModal.bidSecurityMinValue != null) && (
                              <span>
                                Min. Value: <strong>{quotModal.bidSecurityValue ?? quotModal.bidSecurityMinValue}{quotModal.bidSecurityValueType === 'PERCENTAGE' ? '%' : ` ${quotModal.bidSecurityCurrency || 'KES'}`}</strong>
                              </span>
                            )}
                            {(quotModal.bidSecurityValidityValue != null || quotModal.bidSecurityMinValidity != null) && (
                              <span>
                                Min. Validity: <strong>{quotModal.bidSecurityValidityValue ?? quotModal.bidSecurityMinValidity} days</strong>
                              </span>
                            )}
                          </div>
                        )}

                        <div className="vquot-modal__field">
                          <label className="vquot-modal__label">Value Type *</label>
                          <select
                            className="vquot-modal__input"
                            value={bidSecValueType}
                            onChange={(e) => setBidSecValueType(e.target.value as 'FIXED_AMOUNT' | 'PERCENTAGE')}
                            disabled={isQuotReadOnly}
                          >
                            <option value="FIXED_AMOUNT">Fixed Amount</option>
                            <option value="PERCENTAGE">Percentage</option>
                          </select>
                        </div>

                        <div className="vquot-modal__field">
                          <label className="vquot-modal__label">Value *</label>
                          {bidSecValueType === 'FIXED_AMOUNT' ? (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                className="vquot-modal__input"
                                type="number"
                                min="1"
                                placeholder="e.g. 100000"
                                value={bidSecValue}
                                onChange={(e) => setBidSecValue(e.target.value)}
                                disabled={isQuotReadOnly}
                                style={{ flex: 1 }}
                              />
                              <CurrencySelector
                                value={bidSecCurrency}
                                onChange={setBidSecCurrency}
                                size="md"
                                disabled={isQuotReadOnly}
                                style={{ minWidth: 150 }}
                              />
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <input
                                className="vquot-modal__input"
                                type="number"
                                min="0.1"
                                max="100"
                                step="0.1"
                                placeholder="e.g. 2"
                                value={bidSecValue}
                                onChange={(e) => setBidSecValue(e.target.value)}
                                disabled={isQuotReadOnly}
                                style={{ flex: 1 }}
                              />
                              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', flexShrink: 0 }}>%</span>
                            </div>
                          )}
                          {/* ⚠ Warning: Bid Security value below minimum */}
                          {quotModal?.bidSecurityMinValue != null && bidSecValue && parseFloat(bidSecValue) < quotModal.bidSecurityMinValue && bidSecValueType === 'FIXED_AMOUNT' && (
                            <div className="vquot-warning">
                              ⚠ Warning: Minimum bid security value required is {quotModal.bidSecurityMinValue}. Your entered value ({parseFloat(bidSecValue)}) is below the minimum.
                            </div>
                          )}
                        </div>

                        <div className="vquot-modal__field">
                          <label className="vquot-modal__label">Validity *</label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              className="vquot-modal__input"
                              type="number"
                              min="1"
                              placeholder="e.g. 90"
                              value={bidSecValidityValue}
                              onChange={(e) => setBidSecValidityValue(e.target.value)}
                              disabled={isQuotReadOnly}
                              style={{ flex: 1 }}
                            />
                            <select
                              className="vquot-modal__input"
                              value={bidSecValidityUnit}
                              onChange={(e) => setBidSecValidityUnit(e.target.value as 'DAYS')}
                              disabled={isQuotReadOnly}
                              style={{ width: 100, flexShrink: 0 }}
                            >
                              <option value="DAYS">Days</option>
                            </select>
                          </div>
                          {/* ⚠ Warning: Bid Security validity below minimum */}
                          {quotModal?.bidSecurityMinValidity != null && bidSecValidityValue && parseInt(bidSecValidityValue) < quotModal.bidSecurityMinValidity && (
                            <div className="vquot-warning">
                              ⚠ Warning: Minimum bid security validity required is {quotModal.bidSecurityMinValidity} days. Your entered value ({parseInt(bidSecValidityValue)}) is below the minimum.
                            </div>
                          )}
                        </div>

                        {/* ── Bond Number & Issuer (under Bid Security) ── */}
                        <div className="vquot-bond-sub">
                          <div className="vquot-bond-sub__title">Bond Details</div>
                          <div className="vquot-bond-sub__grid">
                            <div className="vquot-modal__field">
                              <label className="vquot-modal__label">Bond #</label>
                              <input
                                className="vquot-modal__input"
                                type="text"
                                placeholder="BB-001"
                                value={bidSecBondNumber}
                                onChange={(e) => setBidSecBondNumber(e.target.value)}
                                disabled={isQuotReadOnly}
                              />
                            </div>
                            <div className="vquot-modal__field">
                              <label className="vquot-modal__label">Issuer</label>
                              <input
                                className="vquot-modal__input"
                                type="text"
                                placeholder="KCB"
                                value={bidSecIssuer}
                                onChange={(e) => setBidSecIssuer(e.target.value)}
                                disabled={isQuotReadOnly}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Document Upload */}
                        <div className="vquot-modal__field" style={{ marginTop: 10 }}>
                          <label className="vquot-modal__label">Document (Optional)</label>
                          <div className="vquot-file-upload">
                            {bidSecFile ? (
                              <div className="vquot-file-upload__preview">
                                <FileText size={16} className="vquot-file-upload__preview-icon" />
                                <span className="vquot-file-upload__preview-name">{bidSecFile.name}</span>
                                <span className="vquot-file-upload__preview-size">
                                  {bidSecFile.size > 1024 * 1024
                                    ? (bidSecFile.size / (1024 * 1024)).toFixed(1) + ' MB'
                                    : (bidSecFile.size / 1024).toFixed(0) + ' KB'}
                                </span>
                                {!isQuotReadOnly && (
                                  <button
                                    className="vquot-file-upload__remove-btn"
                                    onClick={() => setBidSecFile(null)}
                                    title="Remove file"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : null}
                            {!isQuotReadOnly && (
                              <label
                                className={`vquot-file-btn${bidSecFile ? ' vquot-file-btn--active' : ''}`}
                              >
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      if (file.size > 10 * 1024 * 1024) {
                                        setBidBondUploadError('File size must be less than 10 MB');
                                        return;
                                      }
                                      setBidSecFile(file);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                                <Upload size={14} className="vquot-file-btn__icon" />
                                {bidSecFile ? 'Change File' : 'Choose File'}
                              </label>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Bid Bond Section (Vendor Inputs) ── */}
                  {quotModal.bidBondRequired && (
                    <div className="vquot-section">
                      <div className="vquot-section-card">
                        <div className="vquot-section-header">
                          <Shield size={16} className="vquot-section-header__icon" />
                          <div>
                            <div className="vquot-section-header__title">Bid Bond Details</div>
                            <div className="vquot-section-header__sub">Required by buyer — provide your bid bond information</div>
                          </div>
                        </div>

                        {/* ── Buyer requirement hints ── */}
                        {(quotModal.bidBondMinValue != null || quotModal.bidBondMinValidity != null) && (
                          <div style={{
                            padding: '8px 12px', background: 'rgba(10,110,209,0.06)',
                            border: '1px solid rgba(10,110,209,0.15)', borderRadius: 'var(--radius-sm)',
                            marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
                            fontSize: 13, color: 'var(--primary-600, #0a6ed1)',
                          }}>
                            <span style={{ fontWeight: 600, marginRight: 4 }}>ℹ Buyer Requirement:</span>
                            {quotModal.bidBondMinValue != null && (
                              <span>
                                Min. Amount: <strong>{quotModal.bidBondMinValue} {quotModal.bidSecurityCurrency || 'KES'}</strong>
                              </span>
                            )}
                            {quotModal.bidBondMinValidity != null && (
                              <span>
                                Min. Validity: <strong>{quotModal.bidBondMinValidity} days</strong>
                              </span>
                            )}
                          </div>
                        )}

                        <div className="vquot-bidbond-grid">
                          <div className="vquot-modal__field">
                            <label className="vquot-modal__label">Bond # *</label>
                            <input
                              className="vquot-modal__input"
                              type="text"
                              placeholder="e.g. BB-001"
                              value={bidBondNumber}
                              onChange={(e) => setBidBondNumber(e.target.value)}
                              disabled={isQuotReadOnly}
                            />
                          </div>
                          <div className="vquot-modal__field">
                            <label className="vquot-modal__label">Issuer / Bank *</label>
                            <input
                              className="vquot-modal__input"
                              type="text"
                              placeholder="e.g. KCB"
                              value={bidBondIssuer}
                              onChange={(e) => setBidBondIssuer(e.target.value)}
                              disabled={isQuotReadOnly}
                            />
                          </div>
                          <div className="vquot-modal__field">
                            <label className="vquot-modal__label">Bond Amount *</label>
                            <div className="vquot-currency-row">
                              <input
                                className="vquot-modal__input"
                                type="number"
                                min="1"
                                placeholder="500000"
                                value={bidBondAmount}
                                onChange={(e) => setBidBondAmount(e.target.value)}
                                disabled={isQuotReadOnly}
                              />
                              <CurrencySelector
                                value={bidBondCurrency}
                                onChange={setBidBondCurrency}
                                size="md"
                                disabled={isQuotReadOnly}
                              />
                            </div>
                            {/* ⚠ Warning: Bid Bond amount below minimum */}
                            {quotModal?.bidBondMinValue != null && bidBondAmount && parseFloat(bidBondAmount) < quotModal.bidBondMinValue && (
                              <div className="vquot-warning">
                                ⚠ Warning: Minimum bid bond amount required is {quotModal.bidBondMinValue}. Your entered value ({parseFloat(bidBondAmount)}) is below the minimum.
                              </div>
                            )}
                          </div>
                          <div className="vquot-modal__field">
                            <label className="vquot-modal__label">Issue *</label>
                            <input
                              className="vquot-modal__input"
                              type="date"
                              value={bidBondIssueDate ? String(bidBondIssueDate).slice(0, 10) : ''}
                              onChange={(e) => setBidBondIssueDate(e.target.value)}
                              disabled={isQuotReadOnly}
                            />
                          </div>
                          <div className="vquot-modal__field">
                            <label className="vquot-modal__label">Expiry *</label>
                            <input
                              className="vquot-modal__input"
                              type="date"
                              value={bidBondExpiryDate ? String(bidBondExpiryDate).slice(0, 10) : ''}
                              onChange={(e) => setBidBondExpiryDate(e.target.value)}
                              disabled={isQuotReadOnly}
                            />
                          </div>
                          <div className="vquot-modal__field">
                            <label className="vquot-modal__label">Validity</label>
                            <div className="vquot-validity-row">
                              <input
                                className="vquot-modal__input"
                                type="number"
                                min="1"
                                placeholder="90"
                                value={bidBondValidityValue}
                                onChange={(e) => setBidBondValidityValue(e.target.value)}
                                disabled={isQuotReadOnly}
                              />
                              <select
                                className="vquot-modal__input"
                                value={bidBondValidityUnit}
                                onChange={(e) => setBidBondValidityUnit(e.target.value as 'DAYS')}
                                disabled={isQuotReadOnly}
                              >
                                <option value="DAYS">Days</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* ⚠ Warning: Check validity based on issue/expiry dates */}
                        {quotModal?.bidBondMinValidity != null && bidBondIssueDate && bidBondExpiryDate && (() => {
                          const issue = new Date(bidBondIssueDate);
                          const expiry = new Date(bidBondExpiryDate);
                          if (issue && expiry && expiry > issue) {
                            const diffDays = Math.round((expiry.getTime() - issue.getTime()) / 86400000);
                            if (diffDays < quotModal.bidBondMinValidity!) {
                              return (
                                <div className="vquot-warning">
                                  ⚠ Warning: Minimum bid bond validity required is {quotModal.bidBondMinValidity} days. Current validity ({diffDays} days) is below the minimum.
                                </div>
                              );
                            }
                          }
                          return null;
                        })()}

                        {/* Document Upload */}
                        <div className="vquot-modal__field" style={{ marginTop: 10 }}>
                          <label className="vquot-modal__label">Document (Optional)</label>
                          <div className="vquot-file-upload">
                            {bidBondFile ? (
                              <div className="vquot-file-upload__preview">
                                <FileText size={16} className="vquot-file-upload__preview-icon" />
                                <span className="vquot-file-upload__preview-name">{bidBondFile.name}</span>
                                <span className="vquot-file-upload__preview-size">
                                  {bidBondFile.size > 1024 * 1024
                                    ? (bidBondFile.size / (1024 * 1024)).toFixed(1) + ' MB'
                                    : (bidBondFile.size / 1024).toFixed(0) + ' KB'}
                                </span>
                                {!isQuotReadOnly && (
                                  <button
                                    className="vquot-file-upload__remove-btn"
                                    onClick={() => { setBidBondFile(null); setBidBondUploadError(null); }}
                                    title="Remove file"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ) : null}
                            {!isQuotReadOnly && (
                              <label
                                className={`vquot-file-btn${bidBondFile ? ' vquot-file-btn--active' : ''}`}
                              >
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  style={{ display: 'none' }}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      if (file.size > 10 * 1024 * 1024) {
                                        setBidBondUploadError('File size must be less than 10 MB');
                                        return;
                                      }
                                      setBidBondFile(file);
                                      setBidBondUploadError(null);
                                    }
                                    e.target.value = '';
                                  }}
                                />
                                <Upload size={14} className="vquot-file-btn__icon" />
                                {bidBondFile ? 'Change File' : 'Choose File'}
                              </label>
                            )}
                            {bidBondUploadError && (
                              <div className="vquot-file-upload__error">
                                {bidBondUploadError}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── File Attachments ────────────────── */}
                  <div className="vquot-modal__field">
                    <label className="vquot-modal__label">Attachments (optional)</label>
                    <div className="vquot-file-upload">
                      {attachments.length > 0 && (
                        <div className="vquot-file-upload__list">
                          {attachments.map((file, idx) => (
                            <div key={idx} className="vquot-file-upload__preview">
                              <FileText size={16} className="vquot-file-upload__preview-icon" />
                              <span className="vquot-file-upload__preview-name">{file.name}</span>
                              <span className="vquot-file-upload__preview-size">
                                {file.size > 1024 * 1024
                                  ? (file.size / (1024 * 1024)).toFixed(1) + ' MB'
                                  : (file.size / 1024).toFixed(0) + ' KB'}
                              </span>
                              <button
                                className="vquot-file-upload__remove-btn"
                                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {!isQuotReadOnly && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <label className="vquot-file-upload__trigger">
                            <input
                              type="file"
                              multiple
                              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.xls,.csv,.txt"
                              style={{ display: 'none' }}
                              onChange={e => {
                                const files = Array.from(e.target.files || []);
                                setAttachments(prev => [...prev, ...files]);
                                e.target.value = '';
                              }}
                            />
                            <Upload size={14} className="vquot-file-upload__icon" />
                            Choose Files
                          </label>
                          <span className="vquot-file-upload__hint">
                            PDF, JPG, PNG, DOCX, XLSX (max 5 files)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  </>}
                  </>}
                </div>
              )}

              {!isVquotMinimized && submitError && (
                <MessageStrip type="error" compact style={{ margin: '0 16px 12px' }}>
                  {submitError}
                </MessageStrip>
              )}
              {!isVquotMinimized && !quoteLoading && !quoteLoadError && !isQuotReadOnly && !showCustomPlanModal && (
                <div className="vquot-modal__footer">
                  <button className="vendor-btn vendor-btn--secondary" disabled={submitting || isDeleting || showCustomPlanModal} onClick={closeQuote}>Cancel</button>
                  <button
                    className="vendor-btn vendor-btn--primary"
                    disabled={submitting || quotTotal <= 0 || !quotLeadTime || showCustomPlanModal || !!deleteConfirmPlanId}
                    onClick={handleSubmitQuot}
                  >
                    <Send size={15} /> {submitting ? 'Submitting…' : (quotModal.needsResubmit ? 'Resubmit Quotation' : 'Submit Quotation')}
                  </button>
                </div>
              )}
            </div>
          </>, document.body
        )}
    </PageFrame>
  );
}
