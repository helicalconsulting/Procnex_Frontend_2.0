import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { sseClient } from '../../services/sseClient';
import { vendorPortalService, type PaymentPlan } from '../../services/vendorPortalService';
import { companySettingsService, type PaymentTerm } from '../../services/companySettingsService';
import type { RFQ, RFQCustomField } from '../../types';
import CustomPaymentPlanModal from '../../components/vendor/CustomPaymentPlanModal';
import ViewPaymentPlanModal from '../../components/vendor/ViewPaymentPlanModal';
import {
  FileText, Search, ChevronDown, Clock, Send, X, Calendar,
  CheckCircle2, AlertTriangle, RotateCcw, Plus, Check,
  Minus, Maximize2, Minimize2, ChevronUp, ChevronRight, Eye,
  Trash2, Pencil, Shield, Upload, Sliders, ClipboardList,
} from 'lucide-react';
import { CurrencySelector, CurrencyAmountInput, CurrencyBadge, useCurrency } from '../../components/shared/CurrencyMaster';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import { quotationService } from '../../services/quotationService';
import { rfqService } from '../../services/rfqService';
import { PREDEFINED_EVAL_CATEGORIES } from '../../mocks/rfqEvaluation.mock';
import '../../styles/vendor-portal.css';

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
  id: number;
  name: string;
  description: string;
  quantity: number;
  unit: string;
  expectedDate?: string;
}

interface VendorRFQ {
  id: number;
  rfqNumber: string;
  title: string;
  description: string;
  status: RFQStatus;
  deadline: string;
  createdAt: string;
  items: RFQItem[];
  buyerCompany: string;
  department: string;
  rfqType?: 'RFQ' | 'TENDER';
  needsResubmit?: boolean;
  latestQuotationId?: number | null;
  customFields?: RFQCustomField[];
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
  latestQuotationId?: number | null;
  latestQuotationStatus?: string | null;
  rfqType?: 'RFQ' | 'TENDER';
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

// ─── Component ──────────────────────────────────────────────

export default function VendorRFQsPage() {
  useAuth();
  const [searchParams] = useSearchParams();
  const { data: rfqs, loading, error, reload } = useServiceData(
    () => vendorPortalService.listRfqs().then((list) => list.map(mapVendorRfq)),
    [] as VendorRFQ[]
  );

  useEffect(() => {
    const rfqParam = searchParams.get('rfq');
    if (!rfqParam || rfqs.length === 0) return;
    const id = parseInt(rfqParam, 10);
    if (Number.isNaN(id)) return;
    setExpandedRFQ(id);
    const el = document.getElementById(`vrfq-card-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchParams, rfqs]);

  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();

  const [search, setSearch] = useState('');
  const [kpiFilter, setKpiFilter] = useState<RFQStatus | 'DEADLINE_SOON' | null>(null);
  const [expandedRFQ, setExpandedRFQ] = useState<number | null>(null);
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
  const [isSnapshotFullScreen, setIsSnapshotFullScreen] = useState(false);
  const [allSectionsExpanded, setAllSectionsExpanded] = useState(true);
  const [collapsedSnapshotSections, setCollapsedSnapshotSections] = useState<Record<string, boolean>>({});

  const toggleSnapshotSection = (key: string) => {
    setCollapsedSnapshotSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleAllSnapshotSections = (expand: boolean) => {
    setAllSectionsExpanded(expand);
    if (expand) {
      setCollapsedSnapshotSections({});
    } else {
      const collapsed: Record<string, boolean> = {
        'items': true,
        'security': true,
        'custom': true,
        'eval': true,
      };
      if (quotModal?.evaluationCategories) {
        quotModal.evaluationCategories.forEach((c: any, i: number) => {
          collapsed[`eval_cat_${c.id || i}`] = true;
        });
      }
      PREDEFINED_EVAL_CATEGORIES.forEach((c, i) => {
        collapsed[`eval_cat_${c.id || i}`] = true;
      });
      setCollapsedSnapshotSections(collapsed);
    }
  };

  // ── Bid Security — per-RFQ state to support multiple RFQ cards ──
  const [bidSecurityUploadingRfqId, setBidSecurityUploadingRfqId] = useState<number | null>(null);
  const [bidSecurityDocs, setBidSecurityDocs] = useState<Record<number, QuotationBidSecurity>>({});
  const [bidSecurityErrors, setBidSecurityErrors] = useState<Record<number, string>>({});

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
    deadlineSoon: rfqs.filter(r => r.status === 'OPEN' && new Date(r.deadline) < new Date(Date.now() + 3 * 86400000)).length,
  }), [rfqs]);

  // Filter
  const filtered = useMemo(() => {
    let list = rfqs;
    if (kpiFilter === 'DEADLINE_SOON') {
      list = list.filter(r => r.status === 'OPEN' && new Date(r.deadline) < new Date(Date.now() + 3 * 86400000));
    } else if (kpiFilter) {
      list = list.filter(r => r.status === kpiFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => r.rfqNumber.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
    }
    return list;
  }, [rfqs, kpiFilter, search]);

  // Deadline helper
  const getDeadlineInfo = (deadline: string) => {
    const diff = new Date(deadline).getTime() - Date.now();
    const days = Math.ceil(diff / 86400000);
    if (days < 0) return { text: 'Expired', cls: 'urgent' };
    if (days <= 2) return { text: `${days}d left`, cls: 'urgent' };
    if (days <= 5) return { text: `${days}d left`, cls: 'soon' };
    return { text: `${days}d left`, cls: 'normal' };
  };

  // Open quotation modal
  const openQuotModal = useCallback(async (rfq: VendorRFQ) => {
    let currentRfq = rfq;
    setQuotModal(currentRfq);
    setPreviousQuotation(null);
    setShowPreviousQuoteDetails(false);

    // Fetch RFQ details + existing quotation (if any) for pre-filling
    let myQuot: any = null;
    let allMyQuotes: any[] = [];
    try {
      const res = await vendorPortalService.getRfq(String(rfq.id));
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
            (cleanRfqNum && qRfqNum === cleanRfqNum) ||
            (qRfqId && cleanRfqNum.includes(qRfqId)) ||
            (qRfqNum && cleanRfqId.includes(qRfqNum))
          );
        });

        if (rfqQuots.length > 0) {
          allMyQuotes = [...rfqQuots].sort((a, b) => (b.versionNumber || 1) - (a.versionNumber || 1));
        } else if (myQuot) {
          allMyQuotes = [myQuot];
        }
      } catch {
        if (myQuot) allMyQuotes = [myQuot];
      }
    } catch (err) {
      console.warn('Failed to fetch existing quotation for pre-fill:', err);
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
            versionNumber: vNum,
            qNo: `Q${vNum}`,
          });
        });
        const latestReturnedVer = baseQuot.status === 'RETURNED'
          ? (versionHistory.length + 1)
          : (baseQuot.versionNumber || versionHistory.length + 1);

        fullList.push({
          ...baseQuot,
          versionNumber: latestReturnedVer,
          qNo: `Q${latestReturnedVer}`,
        });
      } else {
        // Only 1 quotation submitted so far by vendor, which was returned!
        // That single returned quotation is ALWAYS Q1!
        fullList.push({
          ...baseQuot,
          versionNumber: 1,
          qNo: 'Q1',
        });
      }

      // Sort descending by version number (latest returned first)
      fullList.sort((a: any, b: any) => (b.versionNumber || 1) - (a.versionNumber || 1));
    }

    setPreviousQuotationsList(fullList);
    if (fullList.length > 0) {
      setSelectedPrevVersionId(fullList[0].id);
    } else {
      setSelectedPrevVersionId(null);
    }

    const matchingQuot = myQuot || (allMyQuotes.length > 0 ? allMyQuotes[0] : null);
    const prevCustomValues = matchingQuot?.customFieldValues || {};

    const prices: Record<number, number> = {};
    const initCurrencies: Record<number, string> = {};
    currentRfq.items.forEach((item, idx) => {
      const qItem = matchingQuot?.items?.find((qi: any) => qi.rfqItemId === item.id || qi.id === item.id) || matchingQuot?.items?.[idx] || matchingQuot?.lineItems?.[idx];
      prices[idx] = qItem?.unitPrice ?? 0;
      initCurrencies[idx] = matchingQuot?.currency || companyDefaultCurrency;
    });
    setQuotPrices(prices);
    setItemCurrencies(initCurrencies);
    setQuotLeadTime(matchingQuot?.leadTimeDays ? String(matchingQuot.leadTimeDays) : (matchingQuot?.leadTime ? String(matchingQuot.leadTime) : ''));
    setQuotPayTerms(matchingQuot?.paymentTerms || defaultPayTerm);
    setVendorQuotationNumber(matchingQuot?.vendorQuotationNumber || `QTN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
    setSelectedPaymentPlanId(matchingQuot?.paymentPlanId || null);
    setQuotNotes(matchingQuot?.notes || matchingQuot?.vendorNotes || '');
    if (matchingQuot?.currency) setCurrency(matchingQuot.currency);
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
    setVquotModalState('open');
    setVquotModalState('open');
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

  const activePrevQuote = useMemo(() => {
    let target = previousQuotation;
    if (selectedPrevVersionId && previousQuotationsList.length > 0) {
      const found = previousQuotationsList.find((q) => String(q.id) === String(selectedPrevVersionId));
      if (found) target = found;
    }
    if (!target && quotModal && (quotModal.status === 'SUBMITTED' || isQuotReadOnly || (quotModal as any).quotationId || (quotModal as any).myQuotation)) {
      const mq = (quotModal as any).myQuotation || quotModal;
      target = {
        id: mq.quotationId || mq.id || String(quotModal.id),
        vendorQuotationNumber: vendorQuotationNumber || mq.vendorQuotationNumber || `QTN-${quotModal.rfqNumber?.replace(/^RFQ-?/i, '') || 'SUBMITTED'}`,
        currency: currency || mq.currency || 'KES',
        totalPrice: quotTotal || mq.totalPrice || mq.totalAmount || 0,
        totalAmount: quotTotal || mq.totalPrice || mq.totalAmount || 0,
        leadTimeDays: quotLeadTime || mq.leadTimeDays || mq.leadTime || 0,
        paymentTerms: quotPayTerms || mq.paymentTerms || 'Advance',
        submittedAt: mq.submittedAt || Date.now(),
        status: mq.status || 'SUBMITTED',
        items: quotModal.items?.map((item, idx) => ({
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: quotPrices[idx] !== undefined ? quotPrices[idx] : (item.unitPrice || 0),
          totalPrice: ((quotPrices[idx] !== undefined ? quotPrices[idx] : (item.unitPrice || 0)) * (item.quantity || 1)),
        })) || [],
        customFieldValues: { ...customFieldValues, ...evalParamValues },
        bidSecurityBondNumber: bidSecBondNumber || mq.bidSecurityBondNumber,
        bidSecurityIssuer: bidSecIssuer || mq.bidSecurityIssuer,
        bidSecurityValue: bidSecValue || mq.bidSecurityValue,
        bidSecurityCurrency: bidSecCurrency || mq.bidSecurityCurrency,
        bidSecurityValidityValue: bidSecValidityValue || mq.bidSecurityValidityValue,
      };
    }
    if (!target) return null;
    if (previousQuotationsList.length <= 1) {
      return {
        ...target,
        versionNumber: target.versionNumber || 1,
        qNo: target.qNo || `Q${target.versionNumber || 1}`,
      };
    }
    return target;
  }, [selectedPrevVersionId, previousQuotationsList, previousQuotation, quotModal, isQuotReadOnly, vendorQuotationNumber, currency, quotTotal, quotLeadTime, quotPayTerms, quotPrices, customFieldValues, evalParamValues, bidSecBondNumber, bidSecIssuer, bidSecValue, bidSecCurrency, bidSecValidityValue]);

  // Submit quotation (new or resubmit)
  const handleSubmitQuot = useCallback(async () => {
    if (!quotModal) return;
    setSubmitError(null);
    const leadDays = parseInt(quotLeadTime, 10);
    if (!leadDays || leadDays < 1) {
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
    if (items.some((i) => i.unitPrice <= 0)) {
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
  }, [quotModal, quotLeadTime, quotPrices, itemCurrencies, companyDefaultCurrency, convert, quotTotal, quotPayTerms, selectedPaymentPlanId, currency, reload, attachments, customFieldValues, evalParamValues, bidSecValueType, bidSecValue, bidSecCurrency, bidSecValidityValue, bidSecFile, bidSecBondNumber, bidSecIssuer, bidBondFile, bidBondNumber, bidBondIssuer, bidBondAmount, bidBondCurrency, bidBondIssueDate, bidBondExpiryDate, bidBondValidityValue, bidBondValidityUnit]);

  return (
    <PageFrame>
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
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
              onClick={() => setKpiFilter(isActive ? null : c.filter)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setKpiFilter(isActive ? null : c.filter); } }}
            />
          );
        })}
      </div>

      {/* ── Search Toolbar ──────────────────────────── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            type="text"
            placeholder="Search by RFQ number, title, or buyer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── RFQ List Cards ──────────────────────────── */}
      {loading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Loading RFQs…</Card>
      ) : filtered.length > 0 ? (
        <div className="flex flex-col gap-3.5">
          {filtered.map(rfq => {
            const isExpanded = expandedRFQ === rfq.id;
            const dl = getDeadlineInfo(rfq.deadline);
            const statusCfg = STATUS_MAP[rfq.status];

            return (
              <Card
                id={`vrfq-card-${rfq.id}`}
                key={rfq.id}
                className={cn(
                  'overflow-hidden transition-all duration-200 border-border/80 hover:border-primary/30',
                  isExpanded && 'ring-1 ring-primary/20 shadow-md'
                )}
              >
                {/* Header */}
                <div
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-accent/25 transition-colors"
                  onClick={() => setExpandedRFQ(isExpanded ? null : rfq.id)}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-foreground text-base">{rfq.rfqNumber}</span>
                      <Badge tone={statusCfg.tone}>
                        <span className="size-1.5 rounded-full bg-current" />
                        {statusCfg.label}
                      </Badge>
                      {rfq.rfqType === 'TENDER' && (
                        <Badge tone="info">Tender</Badge>
                      )}
                    </div>
                    <div className="text-sm font-medium text-muted-foreground truncate">
                      {rfq.title} <span className="text-muted-foreground/50">·</span> {rfq.buyerCompany}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {rfq.status === 'OPEN' && !rfq.needsResubmit && (
                      <Button
                        size="sm"
                        onClick={() => openQuotModal(rfq)}
                      >
                        <Send size={14} /> Submit Quote
                      </Button>
                    )}
                    {rfq.status === 'SUBMITTED' && !rfq.needsResubmit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openQuotModal(rfq)}
                      >
                        <Eye size={14} /> View Quote
                      </Button>
                    )}
                    {rfq.status === 'RETURNED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openQuotModal(rfq)}
                      >
                        <RotateCcw size={14} /> Resubmit Quote
                      </Button>
                    )}
                    {rfq.status === 'OPEN' && (
                      <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md', dl.cls === 'urgent' ? 'bg-destructive/10 text-destructive' : dl.cls === 'soon' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-secondary text-muted-foreground')}>
                        <Clock size={13} /> {dl.text}
                      </span>
                    )}
                    <span className="text-xs font-medium text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-md">
                      {rfq.items.length} {rfq.items.length === 1 ? 'item' : 'items'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setExpandedRFQ(isExpanded ? null : rfq.id)}
                      aria-label="Toggle RFQ details"
                    >
                      <ChevronDown className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-180')} />
                    </Button>
                  </div>
                </div>

                {/* Expanded Body */}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-card p-4 flex flex-col gap-4 text-sm">
                    {rfq.description && (
                      <p className="text-muted-foreground leading-relaxed">{rfq.description}</p>
                    )}

                    {/* Dates Highlight Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-muted/30 border border-border/70">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                          <Calendar size={18} />
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Created Date</div>
                          <div className="text-sm font-bold text-foreground">
                            {new Date(rfq.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                          <Clock size={18} />
                        </div>
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Closing / Deadline Date</div>
                          <div className="text-sm font-bold text-amber-600 dark:text-amber-400">
                            {new Date(rfq.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Required Items Modern Card Grid */}
                    <div className="flex flex-col gap-2.5">
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Required Items ({rfq.items.length})
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {rfq.items.map((item, idx) => (
                          <div key={idx} className="flex flex-col justify-between p-3.5 rounded-xl border border-border/70 bg-background/60 shadow-xs hover:border-primary/30 transition-all gap-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold text-foreground text-sm leading-snug">{item.name}</div>
                              <Badge tone="primary" className="tabular-nums font-bold text-xs shrink-0">
                                {item.quantity} {item.unit}
                              </Badge>
                            </div>
                            {item.description && (
                              <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{item.description}</div>
                            )}
                            <div className="pt-2 border-t border-border/40 flex items-center justify-between mt-auto">
                              <span className="text-[11px] font-medium text-muted-foreground">Expected Delivery:</span>
                              {item.expectedDate ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-md">
                                  <Calendar size={12} />
                                  {new Date(item.expectedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* ── Bid Security Required (Buyer requires it) ── */}
                    {rfq.bidSecurityRequired && (
                      <div className="p-3 rounded-xl bg-primary/[0.04] border border-primary/15 flex items-center gap-3">
                        <Shield size={16} className="text-primary shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            Bid Security Required
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Vendor must provide: amount, type, validity & document when submitting quotation
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Bid Bond Required (Buyer requires it) ── */}
                    {rfq.bidBondRequired && (
                      <div className="p-3 rounded-xl bg-primary/[0.04] border border-primary/15 flex items-center gap-3">
                        <Shield size={16} className="text-primary shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            Bid Bond Required
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Vendor must provide: bond number, issuer, amount, dates & document when submitting quotation
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/50">
                      {rfq.status === 'OPEN' && !rfq.needsResubmit && (
                        <Button onClick={() => openQuotModal(rfq)}>
                          <Send size={14} /> Submit Quotation
                        </Button>
                      )}
                      {rfq.status === 'RETURNED' && (
                        <div className="flex items-center gap-3">
                          <Badge tone="warning">
                            <RotateCcw size={13} /> Returned for Revision — Resubmit Required
                          </Badge>
                          <Button onClick={() => openQuotModal(rfq)}>
                            <RotateCcw size={14} /> Resubmit Quotation
                          </Button>
                        </div>
                      )}
                      {rfq.status === 'SUBMITTED' && !rfq.needsResubmit && (
                        <div className="flex items-center gap-3">
                          <Badge tone="success">
                            <CheckCircle2 size={13} /> Quotation Already Submitted
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={FileText}
          title="No RFQs Found"
          description={search ? "Try adjusting your search criteria." : "No RFQs have been assigned to your company yet."}
          action={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button> : undefined}
        />
      )}

        {/* ── Custom Payment Plan Modal ── */}
        {showCustomPlanModal && (
          <CustomPaymentPlanModal
            editPlan={editPlan}
            onClose={() => {
              setShowCustomPlanModal(false);
              setEditPlan(null);
            }}
            onSaved={(plan) => {
              // If editing, replace the existing plan in the list; if creating, prepend
              setCustomPlans(prev => {
                const exists = prev.find(p => p.id === plan.id);
                if (exists) {
                  return prev.map(p => p.id === plan.id ? plan : p);
                }
                return [plan, ...prev];
              });
              setSelectedPaymentPlanId(plan.id);
              setQuotPayTerms(plan.name);
              setEditPlan(null);
            }}
          />
        )}

        {/* ── View Payment Plan Modal (read-only) ── */}
        {showViewPlanModal && selectedCustomPlan && (
          <ViewPaymentPlanModal
            plan={{
              name: selectedCustomPlan.name,
              milestones: selectedCustomPlan.milestones.map(m => ({
                id: m.id,
                title: m.title,
                percentage: m.percentage,
              })),
            }}
            onClose={() => setShowViewPlanModal(false)}
          />
        )}

        {/* ── Delete Payment Plan Confirmation ── */}
        {deleteConfirmPlanId && (() => {
          const planToDelete = customPlans.find(p => p.id === deleteConfirmPlanId);
          if (!planToDelete) return null;
          return createPortal(
            <div className="vquot-modal-backdrop custom-plan-modal-backdrop" onClick={() => !isDeleting && setDeleteConfirmPlanId(null)} style={{ zIndex: 999998 }}>
              <div
                className="custom-plan-modal"
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 400,
                  maxWidth: 'calc(100vw - 40px)',
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xl, 16px)',
                  boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 999999,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div className="vquot-modal__header" style={{ cursor: 'default' }}>
                  <div className="vquot-modal__header-left">
                    <span style={{ color: 'var(--danger-500, #bb0000)', display: 'flex' }}><Trash2 size={14} /></span>
                    <span className="vquot-modal__header-title">Delete Payment Plan</span>
                  </div>
                  <div className="vquot-modal__window-controls">
                    <button type="button" className="vquot-modal__wc-btn vquot-modal__wc-btn--close" title="Close" onClick={() => !isDeleting && setDeleteConfirmPlanId(null)} disabled={isDeleting}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ padding: '20px 24px' }}>
                  <p style={{ fontSize: 15, color: 'var(--text-primary)', margin: 0 }}>
                    Are you sure you want to delete <strong>{planToDelete.name}</strong>?
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
                    This action cannot be undone. The payment plan will be removed from your account.
                  </p>
                  {deleteError && (
                    <div style={{
                      marginTop: 12, padding: '8px 12px', borderRadius: 6,
                      background: 'rgba(187,0,0,0.08)', border: '1px solid rgba(187,0,0,0.2)',
                      color: '#bb0000', fontSize: 14,
                    }}>
                      {deleteError}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 24px', borderTop: '1px solid var(--border)' }}>
                  <button
                    className="vendor-btn vendor-btn--secondary"
                    onClick={() => setDeleteConfirmPlanId(null)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                  <button
                    className="vendor-btn vendor-btn--primary"
                    style={{ background: isDeleting ? undefined : 'linear-gradient(135deg, #bb0000, #dc2626)' }}
                    disabled={isDeleting}
                    onClick={async () => {
                      setIsDeleting(true);
                      setDeleteError(null);
                      try {
                        await vendorPortalService.deletePaymentPlan(deleteConfirmPlanId);
                        setCustomPlans(prev => prev.filter(p => p.id !== deleteConfirmPlanId));
                        if (selectedPaymentPlanId === deleteConfirmPlanId) {
                          setSelectedPaymentPlanId(null);
                          setQuotPayTerms(paymentTerms.length > 0 ? paymentTerms[0].name : '');
                        }
                        setDeleteConfirmPlanId(null);
                      } catch (e) {
                        setDeleteError(e instanceof Error ? e.message : 'Failed to delete payment plan');
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                  >
                    <Trash2 size={14} /> {isDeleting ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          );
        })()}

        {/* ── Submit Quotation Modal (Gmail-style) ──── */}

        {quotModal && (
          <>
            {/* Backdrop only when not minimized */}
            {!isVquotMinimized && (
              <div
                className={`vquot-modal-backdrop ${isVquotExpanded ? 'vquot-modal-backdrop--expanded' : ''}`}
                onClick={() => setQuotModal(null)}
              />
            )}

            <div
              className={[
                'vquot-modal',
                isVquotOpen ? 'vquot-modal--open' : '',
                isVquotExpanded ? 'vquot-modal--expanded' : '',
                isVquotMinimized ? 'vquot-modal--minimized' : '',
              ].filter(Boolean).join(' ')}
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
                  <span className="vquot-modal__header-title">{quotModalTitle}</span>
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
                    onClick={() => setQuotModal(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Body — hidden when minimized */}
              {!isVquotMinimized && (
                <div className="vquot-modal__body">
                  {/* RFQ Title in Bold at Top */}
                  <div style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    padding: '0 0 12px',
                    marginBottom: 12,
                    borderBottom: '1px solid var(--border)',
                    lineHeight: 1.4,
                  }}>
                    {quotModal.title}
                  </div>

                  {/* ── Submitted Quotation Read-Only Banner ── */}
                  {isQuotReadOnly && (
                    <div className="vquot-modal__previous-banner" style={{ borderLeftColor: '#107e3e', background: 'rgba(16,126,62,0.06)' }}>
                      <div className="vquot-modal__previous-banner-header" style={{ alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="vquot-modal__previous-banner-title" style={{ color: '#107e3e' }}>
                            <CheckCircle2 size={16} />
                            <span>Quotation Submitted (Ref #{vendorQuotationNumber || 'SUBMITTED'})</span>
                          </div>
                          <div className="vquot-modal__previous-banner-hint" style={{ color: 'var(--text-secondary)' }}>
                            This quotation has been submitted to the buyer and is read-only.
                          </div>
                        </div>
                        {activePrevQuote && (
                          <button
                            type="button"
                            className="vquot-modal__previous-toggle-btn"
                            onClick={() => setShowPreviousQuoteDetails(true)}
                          >
                            <Eye size={13} />
                            View Snapshot
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── SAP Fiori Style Revision Request & Previous Submission Snapshot ── */}
                  {activePrevQuote && quotModal.needsResubmit && (
                    <div className="vquot-modal__previous-banner">
                      <div className="vquot-modal__previous-banner-header" style={{ alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="vquot-modal__previous-banner-title">
                            <RotateCcw size={16} />
                            <span>
                              Quotation Revision Request (SAP Reference #{activePrevQuote.vendorQuotationNumber || activePrevQuote.id?.slice?.(-6)?.toUpperCase() || 'PREV'})
                            </span>
                          </div>

                          {(activePrevQuote.returnComment || activePrevQuote.returnReason) && (
                            <div className="vquot-modal__previous-banner-comment">
                              <strong>💬 Buyer Feedback / Return Reason:</strong> "{activePrevQuote.returnComment || activePrevQuote.returnReason}"
                            </div>
                          )}

                          <div className="vquot-modal__previous-banner-hint">
                            ✓ Viewing returned <strong>Q{activePrevQuote.versionNumber || 1} reference values</strong> ({activePrevQuote.currency || 'KES'} {Number(activePrevQuote.totalPrice || 0).toLocaleString()}). Update parameter values below to submit <strong>Q{(activePrevQuote.versionNumber || 1) + 1}</strong>.
                          </div>
                        </div>

                        {/* Dropdown Selector for Previous Versions */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                          {previousQuotationsList.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <label style={{ fontSize: 12, fontWeight: 700, color: '#0284c7', whiteSpace: 'nowrap' }}>
                                Version:
                              </label>
                              <select
                                value={selectedPrevVersionId || activePrevQuote.id || ''}
                                onChange={(e) => setSelectedPrevVersionId(e.target.value)}
                                style={{
                                  padding: '4px 10px',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  border: '1px solid rgba(14, 165, 233, 0.4)',
                                  background: 'var(--surface-card, #1e293b)',
                                  color: 'var(--text-primary, #f8fafc)',
                                  cursor: 'pointer',
                                  outline: 'none',
                                }}
                              >
                                {previousQuotationsList.map((pq, idx) => {
                                  const vNum = (previousQuotationsList.length === 1) ? 1 : (pq.versionNumber || (previousQuotationsList.length - idx));
                                  const qPill = `Q${vNum}`;
                                  const refStr = pq.vendorQuotationNumber ? ` (${pq.vendorQuotationNumber})` : '';
                                  const isLatest = idx === 0;
                                  return (
                                    <option key={pq.id || idx} value={pq.id}>
                                      {qPill}{refStr} {isLatest ? '— Latest Returned' : `— Version ${vNum}`}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                          )}

                          <button
                            type="button"
                            className="vquot-modal__previous-toggle-btn"
                            onClick={() => setShowPreviousQuoteDetails(true)}
                          >
                            <Eye size={13} />
                            View Snapshot
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Separate Popup Overlay Modal for Version Snapshot (Portaled to document.body) ── */}
                  {showPreviousQuoteDetails && activePrevQuote && createPortal(
                        <div
                          className={`vquot-snapshot-modal-overlay ${isSnapshotFullScreen ? 'vquot-snapshot-modal-overlay--fullscreen' : ''}`}
                          style={{ zIndex: 999990 }}
                          onClick={() => setShowPreviousQuoteDetails(false)}
                        >
                          <div
                            className={`vquot-snapshot-modal-content ${isSnapshotFullScreen ? 'vquot-snapshot-modal-content--fullscreen' : ''}`}
                            style={{ zIndex: 999995 }}
                            onClick={e => e.stopPropagation()}
                          >
                            {/* Popup Header */}
                            <div className="vquot-snapshot-modal-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{
                                  width: 38, height: 38, borderRadius: 8,
                                  background: 'rgba(14, 165, 233, 0.18)', color: '#38bdf8',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontWeight: 800, fontSize: 15, border: '1px solid rgba(14, 165, 233, 0.3)',
                                }}>
                                  {activePrevQuote.qNo || `Q${activePrevQuote.versionNumber || 1}`}
                                </div>
                                <div>
                                  <div style={{ fontSize: 17, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    Quotation Snapshot — {activePrevQuote.qNo || `Q${activePrevQuote.versionNumber || 1}`}
                                    {activePrevQuote.vendorQuotationNumber && (
                                      <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.75 }}>
                                        (Ref: {activePrevQuote.vendorQuotationNumber})
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                                    Submitted: {new Date(activePrevQuote.submittedAt || Date.now()).toLocaleDateString('en-IN')}
                                    {activePrevQuote.status && ` · Status: ${activePrevQuote.status}`}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => toggleAllSnapshotSections(!allSectionsExpanded)}
                                  style={{
                                    background: 'rgba(14, 165, 233, 0.15)', border: '1px solid rgba(14, 165, 233, 0.3)', color: '#38bdf8',
                                    cursor: 'pointer', padding: '5px 12px', borderRadius: 6,
                                    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
                                    transition: 'all 0.15s ease'
                                  }}
                                  title={allSectionsExpanded ? "Collapse All Sections" : "Expand All Sections"}
                                >
                                  <span>{allSectionsExpanded ? '▲ Collapse All' : '▼ Expand All'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setShowPreviousQuoteDetails(false)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444',
                                    cursor: 'pointer', width: 28, height: 28, borderRadius: 6,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}
                                  title="Close Snapshot"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* Popup Body */}
                            <div className="vquot-snapshot-modal-body">
                              {/* Buyer Revision Feedback Notice */}
                              {(activePrevQuote.returnReason || activePrevQuote.returnComment) && (
                                <div style={{
                                  padding: '12px 16px', borderRadius: 10,
                                  background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(14, 165, 233, 0.04) 100%)',
                                  border: '1px solid rgba(14, 165, 233, 0.35)', color: '#38bdf8', fontSize: 14,
                                  display: 'flex', gap: 10, alignItems: 'flex-start'
                                }}>
                                  <span style={{ fontSize: 17, marginTop: 1 }}>💬</span>
                                  <div>
                                    <strong style={{ display: 'block', marginBottom: 2 }}>Buyer Revision Request Feedback:</strong>
                                    "{activePrevQuote.returnReason || activePrevQuote.returnComment}"
                                  </div>
                                </div>
                              )}

                              {/* 📦 Section 1: Item Pricing Matrix & Commercial Summary */}
                              {(() => {
                                const isCollapsed = !!collapsedSnapshotSections['items'];
                                const rawItems = (activePrevQuote?.items && activePrevQuote.items.length > 0)
                                  ? activePrevQuote.items
                                  : (activePrevQuote?.lineItems && activePrevQuote.lineItems.length > 0)
                                  ? activePrevQuote.lineItems
                                  : (quotModal?.items && quotModal.items.length > 0)
                                  ? quotModal.items
                                  : [];
                                const displayItems = rawItems.length > 0
                                  ? rawItems
                                  : [{ name: quotModal?.title || 'Primary Line Item', quantity: 1, unit: 'pcs', unitPrice: Number(activePrevQuote?.totalPrice || 3), totalPrice: Number(activePrevQuote?.totalPrice || 3) }];
                                const displayTotalPrice = activePrevQuote?.totalPrice ?? activePrevQuote?.totalAmount ?? quotModal?.totalPrice ?? quotTotal ?? 3;
                                const displayLeadTime = activePrevQuote?.leadTimeDays ?? activePrevQuote?.leadTime ?? quotModal?.leadTimeDays ?? quotLeadTime ?? 6;
                                const displayPaymentTerms = activePrevQuote?.paymentTerms ?? quotModal?.paymentTerms ?? quotPayTerms ?? 'Advance';
                                const displayPaymentPlan = activePrevQuote?.paymentPlanSnapshot || activePrevQuote?.paymentPlan;

                                return (
                                  <div className="vquot-snapshot-section">
                                    <div 
                                      className="vquot-snapshot-section-title"
                                      onClick={() => toggleSnapshotSection('items')}
                                      style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    >
                                      <span>Item Pricing Matrix</span>
                                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 'normal' }}>
                                        {isCollapsed ? '▼ Show Details' : '▲ Hide Details'}
                                      </span>
                                    </div>
                                    {!isCollapsed && (
                                      <>
                                        <div className="vquot-snapshot-summary-bar" style={{ borderTop: 'none', borderBottom: '1px solid var(--border, #e2e8f0)', padding: 14 }}>
                                          <div className="vquot-snapshot-summary-item">
                                            <span className="vquot-snapshot-summary-label">Total Quotation Value</span>
                                            <span className="vquot-snapshot-summary-val" style={{ color: '#0a6ed1', fontFamily: 'monospace', fontSize: 16 }}>
                                              {activePrevQuote?.currency || 'KES'} {Number(displayTotalPrice).toLocaleString()}
                                            </span>
                                          </div>
                                          <div className="vquot-snapshot-summary-item">
                                            <span className="vquot-snapshot-summary-label">Lead Time</span>
                                            <span className="vquot-snapshot-summary-val">{displayLeadTime} Days</span>
                                          </div>
                                          <div className="vquot-snapshot-summary-item">
                                            <span className="vquot-snapshot-summary-label">Payment Terms</span>
                                            <span className="vquot-snapshot-summary-val">{displayPaymentTerms}</span>
                                            {displayPaymentPlan && Array.isArray(displayPaymentPlan) && displayPaymentPlan.length > 0 && (
                                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                                                {displayPaymentPlan.map((m: any, i: number) => (
                                                  <span key={i} className="vquot-snapshot-badge-val" style={{ fontSize: 12, padding: '2px 8px' }}>
                                                    {m.title || m.name || `Milestone ${i+1}`}: {m.percentage}%
                                                  </span>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>

                                        <div className="vquot-snapshot-modal-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                                          <table className="vquot-snapshot-modal-table">
                                            <thead>
                                              <tr>
                                                <th style={{ textAlign: 'left', padding: '10px 14px' }}>Item</th>
                                                <th style={{ textAlign: 'center', padding: '10px 14px' }}>Qty</th>
                                                <th style={{ textAlign: 'right', padding: '10px 14px' }}>Unit Price</th>
                                                <th style={{ textAlign: 'right', padding: '10px 14px' }}>Line Total</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {displayItems.map((line: any, idx: number) => {
                                                const itemName = line.name || line.itemName || quotModal?.items?.[idx]?.name || `Line Item ${idx+1}`;
                                                const itemQty = line.quantity || quotModal?.items?.[idx]?.quantity || 1;
                                                const itemUnit = line.unit || quotModal?.items?.[idx]?.unit || '';
                                                const uPrice = Number(line.unitPrice ?? quotPrices[idx] ?? line.totalPrice ?? displayTotalPrice) || 0;
                                                const lTotal = Number(line.totalPrice || line.lineTotal || uPrice * itemQty) || uPrice;
                                                return (
                                                  <tr key={line.id || idx}>
                                                    <td style={{ fontWeight: '500', padding: '10px 14px' }}>{itemName}</td>
                                                    <td style={{ textAlign: 'center', padding: '10px 14px' }}>{itemQty} {itemUnit}</td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', padding: '10px 14px' }}>{activePrevQuote?.currency || 'KES'} {uPrice.toLocaleString()}</td>
                                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '700', color: '#10b981', padding: '10px 14px' }}>{activePrevQuote?.currency || 'KES'} {lTotal.toLocaleString()}</td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* 🛡️ Section 2: Bid Security & Bid Bond Details (Only rendered if required in RFQ or provided by vendor) */}
                              {(() => {
                                const isBidSecurityRequired =
                                  quotModal?.bidSecurityRequired === true ||
                                  activePrevQuote?.bidSecurityRequired === true ||
                                  (quotModal?.rfq && (quotModal.rfq as any)?.bidSecurityRequired === true);

                                const hasBidSecurityValues = !!(
                                  (activePrevQuote?.bidSecurityValue !== undefined && activePrevQuote?.bidSecurityValue !== null) ||
                                  activePrevQuote?.bidSecurityBondNumber ||
                                  activePrevQuote?.bidSecurityIssuer ||
                                  activePrevQuote?.bidBondNumber ||
                                  activePrevQuote?.bidBondIssuer ||
                                  activePrevQuote?.bidSecurityValidityValue
                                );

                                if (!isBidSecurityRequired && !hasBidSecurityValues) return null;

                                const isCollapsed = !!collapsedSnapshotSections['security'];
                                const valType = activePrevQuote?.bidSecurityValueType || quotModal?.bidSecurityValueType || 'FIXED_AMOUNT';
                                const val = activePrevQuote?.bidSecurityValue ?? quotModal?.bidSecurityValue ?? quotModal?.bidSecurityMinValue;
                                const valCurr = activePrevQuote?.bidSecurityCurrency || activePrevQuote?.currency || quotModal?.bidSecurityCurrency || 'KES';
                                const valDays = activePrevQuote?.bidSecurityValidityValue ?? quotModal?.bidSecurityValidityValue ?? quotModal?.bidSecurityMinValidity;
                                const bondNo = activePrevQuote?.bidSecurityBondNumber || activePrevQuote?.bidBondNumber || '—';
                                const issuer = activePrevQuote?.bidSecurityIssuer || activePrevQuote?.bidBondIssuer || '—';

                                return (
                                  <div className="vquot-snapshot-section">
                                    <div 
                                      className="vquot-snapshot-section-title vquot-snapshot-section-title--security"
                                      onClick={() => toggleSnapshotSection('security')}
                                      style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    >
                                      <span>🛡️ Bid Security & Guarantees ({activePrevQuote?.qNo || 'Previous Version'})</span>
                                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 'normal' }}>
                                        {isCollapsed ? '▼ Show Details' : '▲ Hide Details'}
                                      </span>
                                    </div>
                                    {!isCollapsed && (
                                      <div className="vquot-snapshot-grid">
                                        <div className="vquot-snapshot-kv-card">
                                          <div className="vquot-snapshot-kv-label">
                                            <span className="vquot-snapshot-kv-cat-tag">Bid Security</span>
                                            Value Type
                                          </div>
                                          <div className="vquot-snapshot-kv-val">
                                            {valType === 'PERCENTAGE' ? 'Percentage' : 'Fixed Amount'}
                                          </div>
                                        </div>
                                        <div className="vquot-snapshot-kv-card">
                                          <div className="vquot-snapshot-kv-label">
                                            <span className="vquot-snapshot-kv-cat-tag">Bid Security</span>
                                            Value / Amount
                                          </div>
                                          <div className="vquot-snapshot-kv-val" style={{ fontFamily: 'monospace', color: '#10b981' }}>
                                            {val !== undefined && val !== null ? `${valCurr} ${Number(val).toLocaleString()}` : '—'}
                                          </div>
                                        </div>
                                        <div className="vquot-snapshot-kv-card">
                                          <div className="vquot-snapshot-kv-label">
                                            <span className="vquot-snapshot-kv-cat-tag">Bid Security</span>
                                            Validity Period
                                          </div>
                                          <div className="vquot-snapshot-kv-val">
                                            {valDays !== undefined && valDays !== null ? `${valDays} Days` : '—'}
                                          </div>
                                        </div>
                                        <div className="vquot-snapshot-kv-card">
                                          <div className="vquot-snapshot-kv-label">
                                            <span className="vquot-snapshot-kv-cat-tag">Bid Security</span>
                                            Bond # / Ref
                                          </div>
                                          <div className="vquot-snapshot-kv-val">
                                            {bondNo}
                                          </div>
                                        </div>
                                        <div className="vquot-snapshot-kv-card">
                                          <div className="vquot-snapshot-kv-label">
                                            <span className="vquot-snapshot-kv-cat-tag">Bid Security</span>
                                            Issuer / Bank
                                          </div>
                                          <div className="vquot-snapshot-kv-val">
                                            {issuer}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* 📋 Section 3: Additional Information / Custom Fields */}
                              {((quotModal.customFields && quotModal.customFields.length > 0) || (activePrevQuote.customFieldValues && Object.keys(activePrevQuote.customFieldValues).length > 0)) && (() => {
                                const isCollapsed = !!collapsedSnapshotSections['custom'];
                                const allCfMap = new Map<string, { label: string; value: any }>();
                                (quotModal.customFields || []).forEach((cf: any) => {
                                  const k = cf.id || cf.fieldName || cf.name;
                                  const label = cf.fieldName || cf.name || cf.label || k;
                                  const val = activePrevQuote.customFieldValues?.[cf.id] ?? activePrevQuote.customFieldValues?.[cf.fieldName] ?? activePrevQuote.customFieldValues?.[cf.name] ?? activePrevQuote[cf.id] ?? activePrevQuote[cf.fieldName] ?? activePrevQuote[cf.name];
                                  if (val !== undefined && val !== null && val !== '') {
                                    allCfMap.set(k, { label, value: val });
                                  }
                                });
                                if (activePrevQuote.customFieldValues) {
                                  Object.entries(activePrevQuote.customFieldValues).forEach(([k, val]) => {
                                    if (!k.startsWith('eval_') && !allCfMap.has(k) && val !== undefined && val !== null && val !== '') {
                                      const fieldObj = (quotModal.customFields || []).find((cf: any) => cf.id === k || cf.name === k || cf.fieldName === k);
                                      const label = fieldObj?.fieldName || fieldObj?.name || (fieldObj as any)?.label || k;
                                      allCfMap.set(k, { label, value: val });
                                    }
                                  });
                                }

                                if (allCfMap.size === 0) return null;

                                return (
                                  <div className="vquot-snapshot-section">
                                    <div 
                                      className="vquot-snapshot-section-title vquot-snapshot-section-title--custom"
                                      onClick={() => toggleSnapshotSection('custom')}
                                      style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    >
                                      <span>📋 Custom Parameters Snapshot</span>
                                      <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 'normal' }}>
                                        {isCollapsed ? '▼ Show Details' : '▲ Hide Details'}
                                      </span>
                                    </div>
                                    {!isCollapsed && (
                                      <div className="vquot-snapshot-grid">
                                        {Array.from(allCfMap.entries()).map(([k, item]) => {
                                          const strVal = String(item.value);
                                          const isMuted = strVal === '—' || strVal === 'null' || strVal === 'undefined';
                                          return (
                                            <div key={k} className="vquot-snapshot-kv-card">
                                              <div className="vquot-snapshot-kv-label">
                                                {item.label}
                                              </div>
                                              <div className="vquot-snapshot-kv-val">
                                                <span className={`vquot-snapshot-badge-val ${isMuted ? 'vquot-snapshot-badge-val--muted' : ''}`}>
                                                  {strVal}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* 📊 Section 4: Tender Evaluation Categories & Parameters (Only rendered if defined on RFQ or submitted) */}
                              {(() => {
                                const customEvalCats = quotModal.evaluationCategories || (quotModal.rfq as any)?.evaluationCategories || [];
                                const evalVals = activePrevQuote.evalParamValues || activePrevQuote.customFieldValues || activePrevQuote.evaluationParamValues || activePrevQuote;

                                let evalCategoriesToRender: any[] = [];
                                if (Array.isArray(customEvalCats) && customEvalCats.length > 0) {
                                  evalCategoriesToRender = customEvalCats;
                                } else if (evalVals && typeof evalVals === 'object') {
                                  evalCategoriesToRender = PREDEFINED_EVAL_CATEGORIES.map((c) => {
                                    const activeSubParams = c.subParameters.filter((sp: any) => {
                                      const val = evalVals[sp.id] ?? evalVals[`eval_${sp.id}`] ?? evalVals[sp.name] ?? evalVals[`eval_${sp.name}`];
                                      return val !== undefined && val !== null && val !== '' && val !== '—';
                                    });
                                    return { ...c, subParameters: activeSubParams };
                                  }).filter((c) => c.subParameters.length > 0);
                                }

                                if (evalCategoriesToRender.length === 0) return null;

                                const renderedSpIds = new Set<string>();

                                const catIconMap: Record<string, string> = {
                                  'business requirements': '💼',
                                  'supplier prequalification': '🔍',
                                  'technical evaluation': '⚙️',
                                  'commercial parameters': '💰',
                                  'delivery parameters': '🚚',
                                  'quality parameters': '🛡️',
                                  'contractual parameters': '📜',
                                  'esg parameters': '🌱',
                                  'vendor performance history': '⭐',
                                };

                                return (
                                  <>
                                    {evalCategoriesToRender.filter((cat: any) => cat.enabled !== false).map((cat: any, catIdx: number) => {
                                      const catKey = `eval_cat_${cat.id || catIdx}`;
                                      const isCatCollapsed = !!collapsedSnapshotSections[catKey];
                                      const icon = catIconMap[cat.name?.toLowerCase?.()?.trim?.() || ''] || '📊';
                                      const subParams = (cat.subParameters || []).filter((sp: any) => sp.enabled !== false);
                                      if (subParams.length === 0) return null;

                                      return (
                                        <div key={cat.id || catIdx} className="vquot-snapshot-section">
                                          <div 
                                            className="vquot-snapshot-section-title vquot-snapshot-section-title--eval"
                                            onClick={() => toggleSnapshotSection(catKey)}
                                            style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                          >
                                            <span>{icon} {cat.name} ({subParams.length} Parameters)</span>
                                            <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 'normal' }}>
                                              {isCatCollapsed ? '▼ Show Category' : '▲ Hide Category'}
                                            </span>
                                          </div>
                                          {!isCatCollapsed && (
                                            <div className="vquot-snapshot-grid">
                                              {subParams.map((sp: any, spIdx: number) => {
                                                renderedSpIds.add(sp.id);
                                                renderedSpIds.add(`eval_${sp.id}`);
                                                if (sp.name) {
                                                  renderedSpIds.add(sp.name);
                                                  renderedSpIds.add(`eval_${sp.name}`);
                                                }
                                                const val = evalVals[sp.id] ?? evalVals[`eval_${sp.id}`] ?? evalVals[sp.name] ?? evalVals[`eval_${sp.name}`] ?? '—';
                                                const strVal = String(val);
                                                const isMuted = strVal === '—' || strVal === 'null' || strVal === 'undefined';

                                                return (
                                                  <div key={sp.id || spIdx} className="vquot-snapshot-kv-card">
                                                    <div className="vquot-snapshot-kv-label">
                                                      <span className="vquot-snapshot-kv-cat-tag">{cat.name}</span>
                                                      <span>{sp.name || sp.id}</span>
                                                    </div>
                                                    <div className="vquot-snapshot-kv-val">
                                                      <span className={`vquot-snapshot-badge-val ${isMuted ? 'vquot-snapshot-badge-val--muted' : ''}`}>
                                                        {strVal}
                                                      </span>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}

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

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div className="vquot-modal__field">
                      <label className="vquot-modal__label">Vendor Quote Ref No</label>
                      <input className="vquot-modal__input" type="text" placeholder="e.g. QTN-2026-001" value={vendorQuotationNumber} onChange={e => setVendorQuotationNumber(e.target.value)} disabled={isQuotReadOnly} />
                    </div>
                    <div className="vquot-modal__field">
                      <label className="vquot-modal__label">Lead Time (days) *</label>
                      <input className="vquot-modal__input" type="number" placeholder="e.g. 14" value={quotLeadTime} onChange={e => setQuotLeadTime(e.target.value)} disabled={isQuotReadOnly} />
                    </div>
                    <div className="vquot-modal__field">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <label className="vquot-modal__label" style={{ marginBottom: 0 }}>Payment Terms</label>
                        {!isQuotReadOnly && (
                          <button
                            type="button"
                            onClick={() => setShowCustomPlanModal(true)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              background: 'none', border: 'none',
                              color: 'var(--vendor-primary, #0a6ed1)', fontSize: 13, fontWeight: 600,
                              cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
                            }}
                          >
                            <Plus size={12} /> Custom Payment Plan
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                        <select
                          className="vquot-modal__input"
                          value={selectedPaymentPlanId ? `custom_${selectedPaymentPlanId}` : quotPayTerms}
                          disabled={isQuotReadOnly}
                          onChange={e => {
                            const val = e.target.value;
                            if (val.startsWith('custom_')) {
                              const planId = val.replace('custom_', '');
                              const plan = customPlans.find((p) => p.id === planId);
                              if (plan) {
                                setSelectedPaymentPlanId(plan.id);
                                setQuotPayTerms(plan.name);
                              }
                            } else {
                              setSelectedPaymentPlanId(null);
                              setQuotPayTerms(val);
                            }
                          }}
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          {/* Standard Terms */}
                          <optgroup label="Standard Terms">
                            {paymentTerms.map((term) => (
                              <option key={term.id} value={term.name}>{term.name}</option>
                            ))}
                          </optgroup>
                          {/* Custom Payment Plans */}
                          {customPlans.length > 0 && (
                            <optgroup label="Custom Payment Plans">
                              {customPlans.map((plan) => (
                                <option key={plan.id} value={`custom_${plan.id}`}>{plan.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                        {/* Eye icon — only for custom plans */}
                        {selectedCustomPlan && (
                          <>
                            {/* Edit button */}
                            <button
                              type="button"
                              title="Edit payment plan"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditPlan(selectedCustomPlan);
                                setShowCustomPlanModal(true);
                              }}
                              style={{
                                flexShrink: 0,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 3,
                                transition: 'color 0.15s, background 0.15s',
                              }}
                              onMouseOver={e => {
                                e.currentTarget.style.color = 'var(--vendor-primary)';
                                e.currentTarget.style.background = 'rgba(10,110,209,0.08)';
                              }}
                              onMouseOut={e => {
                                e.currentTarget.style.color = 'var(--text-secondary)';
                                e.currentTarget.style.background = 'none';
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            {/* View button */}
                            <button
                              type="button"
                              title="View payment plan"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowViewPlanModal(true);
                              }}
                              style={{
                                flexShrink: 0,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 3,
                                transition: 'color 0.15s, background 0.15s',
                              }}
                              onMouseOver={e => {
                                e.currentTarget.style.color = 'var(--vendor-primary)';
                                e.currentTarget.style.background = 'rgba(10,110,209,0.08)';
                              }}
                              onMouseOut={e => {
                                e.currentTarget.style.color = 'var(--text-secondary)';
                                e.currentTarget.style.background = 'none';
                              }}
                            >
                              <Eye size={14} />
                            </button>
                            <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />
                            {/* Delete button */}
                            <button
                              type="button"
                              title="Delete payment plan"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDeleteConfirmPlanId(selectedCustomPlan.id);
                              }}
                              style={{
                                flexShrink: 0,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                padding: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 3,
                                transition: 'color 0.15s, background 0.15s',
                              }}
                              onMouseOver={e => {
                                e.currentTarget.style.color = 'var(--danger-500, #bb0000)';
                                e.currentTarget.style.background = 'rgba(187,0,0,0.08)';
                              }}
                              onMouseOut={e => {
                                e.currentTarget.style.color = 'var(--text-secondary)';
                                e.currentTarget.style.background = 'none';
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
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
                                value={String(customFieldValues[cf.id] || '')}
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
                    <label className="vquot-modal__label">Notes / Remarks</label>
                    <textarea className="vquot-modal__textarea" placeholder="Any additional notes, conditions, or remarks..." value={quotNotes} onChange={e => setQuotNotes(e.target.value)} disabled={isQuotReadOnly} />
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
                                size="sm"
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
                                size="xs"
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
                              value={bidBondIssueDate}
                              onChange={(e) => setBidBondIssueDate(e.target.value)}
                              disabled={isQuotReadOnly}
                            />
                          </div>
                          <div className="vquot-modal__field">
                            <label className="vquot-modal__label">Expiry *</label>
                            <input
                              className="vquot-modal__input"
                              type="date"
                              value={bidBondExpiryDate}
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
                </div>
              )}

              {!isVquotMinimized && submitError && (
                <MessageStrip type="error" compact style={{ margin: '0 16px 12px' }}>
                  {submitError}
                </MessageStrip>
              )}
              {!isVquotMinimized && !isQuotReadOnly && (
                <div className="vquot-modal__footer">
                  <button className="vendor-btn vendor-btn--secondary" onClick={() => setQuotModal(null)}>Cancel</button>
                  <button
                    className="vendor-btn vendor-btn--primary"
                    disabled={submitting || quotTotal <= 0 || !quotLeadTime}
                    onClick={handleSubmitQuot}
                  >
                    <Send size={15} /> {submitting ? 'Submitting…' : (quotModal.needsResubmit ? 'Resubmit Quotation' : 'Submit Quotation')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
    </PageFrame>
  );
}
