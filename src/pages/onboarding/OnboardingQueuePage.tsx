import LandingTable, { type LandingColumn } from '../../components/shared/LandingTable';
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { createPortal } from 'react-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  procurementService,
  type DocumentSummary,
  type OnboardingVendor,
  type VendorDocument,
} from '../../services/procurementService';
import { sseClient } from '../../services/sseClient';
import { API_BASE } from '../../api/client';
import {
  CheckCircle2,
  XCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  Inbox,
  X,
  FileText,
  Eye,
  Building,
  Briefcase,
  Landmark,
  FilePenLine,
  Download,
  ShieldCheck,
  Calendar,
  Check,
  List,
  Search,
  AlertTriangle,
  FileCheck2,
  Tag,
  ExternalLink,
  Sparkles,
  Maximize2,
  Percent,
} from 'lucide-react';
import {
  calculateVendorMatchAnalysis,
  type VendorMatchAnalysis,
  type VendorMatchCandidate,
} from '../../utils/vendorMatching';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TablePagination } from '../../components/shared/TablePagination';
import { downloadDocument as _downloadDocument } from '../../utils/download';
import { useAuth } from '../../hooks/useAuth';
import { PageFrame, PageLead, MetricCard, EmptyState } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { TableSkeleton } from '../../components/shared/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';
import './OnboardingQueuePage.css';

type QueueStatus = 'pending' | 'approved' | 'rejected';

interface QueueRow {
  id: string | number;
  vendorNo: string;
  name: string;
  email: string;
  submittedDate: string;
  status: QueueStatus;
  rawStatus: string;
  isSubmitted: boolean;
  documentSummary: DocumentSummary;
  documents: VendorDocument[];
  phone?: string | null;
  contactPerson?: string | null;
  website?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankBranch?: string | null;
  onboardingNotes?: string | null;
  category?: string | null;
  supplierType?: string | null;
  location?: string | null;
  rejectionReason?: string | null;
}

function mapOnboardingVendor(v: OnboardingVendor): QueueRow {
  const st = (v.status || '').toUpperCase();
  const status: QueueStatus =
    st.includes('APPROVE') ? 'approved' : st.includes('REJECT') ? 'rejected' : 'pending';
  const isSubmitted = v.isSubmitted !== undefined
    ? v.isSubmitted
    : (st === 'PENDING_APPROVAL' || st === 'DOCUMENTS_SUBMITTED' || st.includes('APPROVE') || st.includes('REJECT'));
  const idStr = String(v.id || '');
  const rawVendorNo = (v as any).vendorNo || (v as any).supplierCode;
  let vendorNo: string;
  if (rawVendorNo && typeof rawVendorNo === 'string' && rawVendorNo.trim()) {
    vendorNo = rawVendorNo.startsWith('VND-') ? rawVendorNo.trim() : `VND-${rawVendorNo.trim()}`;
  } else if (idStr.startsWith('VND-')) {
    vendorNo = idStr;
  } else if (idStr.startsWith('reg_')) {
    vendorNo = `VND-${idStr.slice(-4)}`;
  } else if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
    vendorNo = `VND-${idStr.slice(-4).toUpperCase()}`;
  } else if (/^\d+$/.test(idStr)) {
    vendorNo = `VND-${idStr.padStart(4, '0')}`;
  } else if (idStr) {
    vendorNo = `VND-${idStr.slice(-4).toUpperCase()}`;
  } else {
    vendorNo = 'VND-0000';
  }

  return {
    id: v.id,
    vendorNo,
    name: v.name,
    email: v.email,
    submittedDate: new Date(v.submittedAt || Date.now()).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    status,
    rawStatus: v.status,
    isSubmitted,
    documentSummary: v.documentSummary || { required: 0, uploaded: 0, pending: 0, verified: 0, rejected: 0 },
    documents: v.documents || [],
    phone: v.phone ?? null,
    contactPerson: v.contactPerson ?? null,
    website: v.website ?? null,
    address: v.address ?? null,
    gstNumber: v.gstNumber ?? null,
    panNumber: v.panNumber ?? null,
    bankName: v.bankName ?? null,
    bankAccountNumber: v.bankAccountNumber ?? null,
    bankIfscCode: v.bankIfscCode ?? null,
    bankBranch: v.bankBranch ?? null,
    onboardingNotes: v.onboardingNotes ?? null,
    category: v.category ?? null,
    supplierType: v.supplierType ?? null,
    location: v.location ?? null,
    rejectionReason: v.rejectionReason ?? null,
  };
}

const STATUS_LABEL: Record<QueueStatus, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
};

function onboardingStatusTone(status: QueueStatus): 'warning' | 'success' | 'danger' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

function documentUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  return `${API_BASE.replace(/\/api$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

function viewDocument(url: string): void {
  const finalUrl = documentUrl(url);
  if (!finalUrl) return;
  if (finalUrl.startsWith('data:')) {
    try {
      const parts = finalUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return;
    } catch {
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
  }
  window.open(finalUrl, '_blank', 'noopener,noreferrer');
}

const SIGNED_DOC_CSS = `
  body {
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    padding: 48px 40px;
    line-height: 1.75;
    color: #334155;
    max-width: 820px;
    margin: 0 auto;
    background: #ffffff;
  }
  h1 {
    text-align: center;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: #0f172a;
    margin: 0 0 8px 0;
  }
  h2 {
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #0f172a;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 6px;
    margin-top: 26px;
    margin-bottom: 10px;
  }
  p {
    margin: 0 0 10px;
    font-size: 14.5px;
  }
  strong {
    color: #0f172a;
    font-weight: 600;
  }
  .parties {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px 20px;
    margin: 18px 0;
  }
  .parties p {
    margin: 6px 0;
  }
  .signature-block {
    display: flex;
    justify-content: space-between;
    gap: 32px;
    margin-top: 36px;
    padding-top: 24px;
    border-top: 1.5px solid #e2e8f0;
    clear: both;
  }
  .signature-side {
    width: 45%;
    float: left;
  }
  .signature-side:last-child {
    float: right;
  }
  .signature-line {
    border-top: 1px solid #cbd5e1;
    margin-top: 14px;
    padding-top: 6px;
    font-size: 12.5px;
    color: #475569;
  }
  .footer {
    margin-top: 36px;
    border-top: 1px solid #e2e8f0;
    padding-top: 14px;
    font-size: 12px;
    color: #94a3b8;
    text-align: center;
    font-style: italic;
  }
  img {
    max-width: 100%;
    height: auto;
  }
`;

function buildSignedDocHtml(docType: string, content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${docType} — Signed Agreement</title><style>${SIGNED_DOC_CSS}</style></head><body>${content}</body></html>`;
}

async function downloadDocument(docUrl: string, filename: string): Promise<void> {
  const finalUrl = documentUrl(docUrl);
  if (finalUrl.startsWith('data:')) {
    try {
      const parts = finalUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      return;
    } catch {
      // fallback to standard download
    }
  }
  return _downloadDocument(finalUrl, filename);
}

function downloadSignedDocument(doc: VendorDocument): void {
  const content = doc.contentSnapshot;
  if (content) {
    const fullHtml = buildSignedDocHtml(doc.documentType, content);
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.documentType.replace(/\s+/g, '_')}_Signed_Agreement.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    downloadDocument(doc.publicUrl, doc.documentType + '_' + doc.originalName);
  }
}

export default function OnboardingQueuePage() {
  const { hasPermission } = useAuth();
  const canApproveOnboarding = hasPermission('Onboarding Queue', 'canApprove');
  const { data: requests, loading, error, reload } = useServiceData(
    () => procurementService.getOnboardingQueue().then((list) => list.map(mapOnboardingVendor)),
    [] as QueueRow[]
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<QueueRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveTarget, setApproveTarget] = useState<QueueRow | null>(null);
  const [approveMessage, setApproveMessage] = useState('');
  const [documentTarget, setDocumentTarget] = useState<QueueRow | null>(null);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [snapshotTarget, setSnapshotTarget] = useState<QueueRow | null>(null);
  const [snapshotData, setSnapshotData] = useState<Record<string, unknown> | null>(null);
  const [signedPreviewDoc, setSignedPreviewDoc] = useState<VendorDocument | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<{ row: QueueRow; analysis: VendorMatchAnalysis } | null>(null);
  const [masterVendors, setMasterVendors] = useState<VendorMatchCandidate[]>([]);
  const signedModalBodyRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  useBodyScrollLock(!!(approveTarget || rejectTarget || documentTarget || snapshotTarget || signedPreviewDoc || analysisTarget));
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Load master vendors pool on mount for live duplication matching
  useEffect(() => {
    let isMounted = true;
    procurementService.searchVendors('')
      .then((results) => {
        if (!isMounted || !results) return;
        setMasterVendors(
          results.map((v) => ({
            id: v.id,
            companyName: v.name,
            contactEmail: v.email,
            contactPhone: v.phone || v.contactPhone || undefined,
            contactPerson: v.contactPerson || undefined,
            status: v.status,
          }))
        );
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Compute live match% and duplication analysis across all queue vendors
  const matchAnalyses = useMemo(() => {
    const map = new Map<string | number, VendorMatchAnalysis>();
    const queueCandidates: VendorMatchCandidate[] = requests.map((r) => ({
      id: r.id,
      vendorNo: r.vendorNo,
      companyName: r.name,
      contactEmail: r.email,
      contactPerson: r.contactPerson,
      contactPhone: r.phone,
      category: r.category,
      supplierType: r.supplierType,
      status: r.status,
    }));

    const allCandidates: VendorMatchCandidate[] = [...masterVendors, ...queueCandidates];

    requests.forEach((req) => {
      const analysis = calculateVendorMatchAnalysis(
        {
          id: req.id,
          vendorNo: req.vendorNo,
          name: req.name,
          email: req.email,
          phone: req.phone,
          contactPerson: req.contactPerson,
          category: req.category,
          supplierType: req.supplierType,
          status: req.status,
        },
        allCandidates
      );
      map.set(req.id, analysis);
    });

    return map;
  }, [requests, masterVendors]);

  // Immediately focus the preview modal body and handle immediate capture-phase wheel scrolling
  useEffect(() => {
    if (!signedPreviewDoc) return;

    const raf = requestAnimationFrame(() => {
      signedModalBodyRef.current?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSignedPreviewDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Capture-phase wheel listener on window:
    // When parent Radix Dialogs are open, react-remove-scroll intercepts wheel events on document
    // and calls preventDefault(). Intercepting at window level (capture phase) allows us to scroll
    // signedModalBodyRef with 0ms delay and prevent cancellation.
    const handleWheelCapture = (e: WheelEvent) => {
      const bodyEl = signedModalBodyRef.current;
      const container = modalContainerRef.current;
      if (!bodyEl) return;

      const target = e.target as Node | null;
      if (
        (container && target && (container === target || container.contains(target))) ||
        (target && (target as Element).classList?.contains('oq-signed-modal-portal-overlay')) ||
        (target && (target as Element).classList?.contains('oq-signed-modal-backdrop')) ||
        (target && (target as Element).classList?.contains('oq-signed-modal-wrapper'))
      ) {
        bodyEl.scrollTop += e.deltaY;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener('wheel', handleWheelCapture, { capture: true, passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheelCapture, { capture: true });
    };
  }, [signedPreviewDoc]);

  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || searchParams.get('q') || '';
  const [search, setSearch] = useState(initialSearch);
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(() => {
    return (searchParams.get('filter') as any) || (initialSearch ? 'all' : 'pending');
  });

  useEffect(() => {
    const q = searchParams.get('search') || searchParams.get('q');
    if (q !== null && q !== undefined) {
      setSearch(q);
      setActiveFilter('all');
    }
  }, [searchParams]);
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedReload = useCallback(() => {
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
    }
    reloadTimerRef.current = setTimeout(() => {
      reload();
    }, 250);
  }, [reload]);

  useEffect(() => {
    sseClient.connect();

    // Specific vendor onboarding and lifecycle SSE events
    const unsubNotification = sseClient.on('notification', debouncedReload);
    const unsubAccepted = sseClient.on('vendor_onboarding_accepted', debouncedReload);
    const unsubDocs = sseClient.on('vendor_onboarding_documents_submitted', debouncedReload);
    const unsubRegistered = sseClient.on('vendor_registered', debouncedReload);
    const unsubApproved = sseClient.on('vendor_approved', debouncedReload);
    const unsubRejected = sseClient.on('vendor_rejected', debouncedReload);
    const unsubDocVerified = sseClient.on('vendor_document_verified', debouncedReload);
    const unsubDocRejected = sseClient.on('vendor_document_rejected', debouncedReload);
    const unsubUpdated = sseClient.on('vendor_updated', debouncedReload);
    const unsubQueueUpdated = sseClient.on('vendor_queue_updated', debouncedReload);

    // Catch-all for any vendor or onboarding related SSE broadcast
    const unsubAny = sseClient.onAny((data: any) => {
      if (!data) return;
      const type = String(data?.type || data?.event || '').toLowerCase();
      const mod = String(data?.module || data?.entityType || '').toLowerCase();
      const title = String(data?.title || '').toLowerCase();
      const msg = String(data?.message || '').toLowerCase();
      if (
        type.includes('vendor') ||
        type.includes('onboarding') ||
        mod.includes('vendor') ||
        mod.includes('onboarding') ||
        title.includes('vendor') ||
        msg.includes('vendor') ||
        Boolean(data?.vendorId || data?.vendorNo)
      ) {
        debouncedReload();
      }
    });

    // Cross-tab and window event synchronization
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'heliflow_vendor_registrations') {
        debouncedReload();
      }
    };
    const handleWindowVendorEvent = () => debouncedReload();

    window.addEventListener('storage', handleStorage);
    window.addEventListener('vendor_registered', handleWindowVendorEvent);
    window.addEventListener('vendor_queue_updated', handleWindowVendorEvent);
    window.addEventListener('heliflow:vendor-updated', handleWindowVendorEvent);
    window.addEventListener('heliflow:sse-event', handleWindowVendorEvent);

    const pollTimer = setInterval(() => reload(), 30_000);

    return () => {
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
      }
      unsubNotification();
      unsubAccepted();
      unsubDocs();
      unsubRegistered();
      unsubApproved();
      unsubRejected();
      unsubDocVerified();
      unsubDocRejected();
      unsubUpdated();
      unsubQueueUpdated();
      unsubAny();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('vendor_registered', handleWindowVendorEvent);
      window.removeEventListener('vendor_queue_updated', handleWindowVendorEvent);
      window.removeEventListener('heliflow:vendor-updated', handleWindowVendorEvent);
      window.removeEventListener('heliflow:sse-event', handleWindowVendorEvent);
      clearInterval(pollTimer);
    };
  }, [debouncedReload, reload]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    requests.forEach((r) => c[r.status]++);
    return c;
  }, [requests]);

  const filtered = useMemo(() => {
    let list = requests;
    if (activeFilter !== 'all') {
      list = list.filter((r) => r.status === activeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.vendorNo || '').toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.contactPerson || '').toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, activeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, search]);

  const handleApprove = useCallback(
    async (row: QueueRow, message?: string) => {
      setActionError(null);
      setActionSuccess(null);
      setBusyId(row.id);
      try {
        await procurementService.approveVendor(String(row.id), message, {
          email: row.email,
          name: row.name,
          phone: row.phone || undefined,
          contactPerson: row.contactPerson || undefined,
          category: row.category || undefined,
          supplierType: row.supplierType || undefined,
          onboardingNotes: row.onboardingNotes || undefined,
        });
        setActionSuccess(
          `${row.name} approved. Password setup email sent to ${row.email}.`
        );
        reload();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Failed to approve vendor');
      } finally {
        setBusyId(null);
      }
    },
    [reload]
  );

  const openApproveModal = useCallback((row: QueueRow) => {
    setApproveTarget(row);
    setApproveMessage('');
    setActionError(null);
  }, []);

  const handleApproveConfirm = useCallback(async () => {
    if (!approveTarget) return;
    await handleApprove(approveTarget, approveMessage.trim() || undefined);
    setApproveTarget(null);
    setApproveMessage('');
  }, [approveTarget, approveMessage, handleApprove]);

  const handleRejectConfirm = useCallback(async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setActionError('Rejection reason must be at least 5 characters.');
      return;
    }
    setActionError(null);
    setActionSuccess(null);
    setBusyId(rejectTarget.id);
    try {
      await procurementService.rejectVendor(String(rejectTarget.id), reason, {
        email: rejectTarget.email,
        name: rejectTarget.name,
      });
      setActionSuccess(`${rejectTarget.name} rejected.`);
      setRejectTarget(null);
      setRejectReason('');
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reject vendor');
    } finally {
      setBusyId(null);
    }
  }, [rejectTarget, rejectReason, reload]);

  const openDocuments = useCallback(async (row: QueueRow) => {
    setDocumentTarget(row);
    setDocuments(row.documents || []);
    setActionError(null);
    try {
      const result = await procurementService.getVendorDocuments(row.id);
      if (result?.documents && result.documents.length > 0) {
        setDocuments(result.documents);
      }
    } catch (err) {
      if (!row.documents || row.documents.length === 0) {
        setActionError(err instanceof Error ? err.message : 'Failed to load vendor documents');
      }
    }
  }, []);

  return (
    <PageFrame>
      {error && <MessageStrip type="error" className="mb-4">{error}</MessageStrip>}
      {actionError && (
        <MessageStrip type="error" onClose={() => setActionError(null)} autoHideMs={5000} className="mb-4">
          {actionError}
        </MessageStrip>
      )}
      {actionSuccess && (
        <MessageStrip
          type="success"
          onClose={() => setActionSuccess(null)}
          autoHideMs={5000}
          className="mb-4"
        >
          {actionSuccess}
        </MessageStrip>
      )}

      {/* Header matching RFQ Page style */}
      <PageLead
        title="Onboarding Queue"
        description="Approve suppliers to activate their account and email them a secure password setup link."
      />

      {/* Metric Cards Grid matching RFQ Page style */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Filter requests by status">
        {[
          { icon: Clock, tone: 'warning' as const, value: counts.pending, label: 'Pending Review', detail: 'Awaiting review', filter: 'pending' as const },
          { icon: CheckCircle2, tone: 'success' as const, value: counts.approved, label: 'Approved', detail: 'Accounts activated', filter: 'approved' as const },
          { icon: XCircle, tone: 'danger' as const, value: counts.rejected, label: 'Rejected', detail: 'Requests declined', filter: 'rejected' as const },
          { icon: Building2, tone: 'primary' as const, value: requests.length, label: 'Total Requests', detail: 'All vendor requests', filter: 'all' as const },
        ].map((c) => {
          const isActive = activeFilter === c.filter;
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
                  'card-selected border-[var(--card-glow-border)] shadow-[var(--card-glow-shadow)] bg-[var(--card-glow-bg)]'
              )}
              onClick={() => setActiveFilter(c.filter)}
              role="button"
              tabIndex={0}
              aria-pressed={isActive}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveFilter(c.filter);
                }
              }}
            />
          );
        })}
      </div>

      {/* Search combines with the selected metric-card status filter. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10 pr-10"
            type="text"
            placeholder="Search by vendor name, email, contact..."
            aria-label="Search onboarding requests"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch('');
                setCurrentPage(1);
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Table Card matching RFQ Page */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} columnWidths={['120px', '200px', '130px', '180px', '130px', '140px', '160px']} />
        ) : paginated.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <LandingTable key="onboarding-queue" preferenceKey="onboarding-queue" columns={ONBOARDING_QUEUE_COLUMNS} className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/75 bg-muted/45 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3.5">Vendor #</th>
                    <th className="px-5 py-3.5">Name</th>
                    <th className="px-5 py-3.5">P.No.</th>
                    <th className="px-5 py-3.5">Email</th>
                    <th className="px-5 py-3.5">Match %</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paginated.map((req) => (
                    <tr key={req.id} className="transition-colors hover:bg-accent/35">
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-primary whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                          {req.vendorNo}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-foreground">{req.name}</td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap text-xs font-mono">
                        {req.phone || '—'}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Mail size={13} className="shrink-0" />
                          {req.email}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {(() => {
                          const analysis = matchAnalyses.get(req.id) || {
                            score: 0,
                            duplicationRisk: 'LOW' as const,
                            matchedVendor: null,
                            isMultiVendorMatch: false,
                            multiVendorSummary: '',
                            breakdown: {
                              name: { score: 0, weight: 0.4 },
                              email: { score: 0, weight: 0.4 },
                              person: { score: 0, weight: 0.1 },
                              phone: { score: 0, weight: 0.1 },
                            },
                            totalCandidatesScanned: 0,
                          };

                          const isHigh = analysis.duplicationRisk === 'HIGH';
                          const isMed = analysis.duplicationRisk === 'MEDIUM';

                          return (
                            <button
                              type="button"
                              className={cn(
                                'oq-match-pill group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer select-none',
                                isHigh && 'bg-rose-500/10 text-rose-600 border border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-500/60 shadow-xs',
                                isMed && 'bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/60 shadow-xs',
                                !isHigh && !isMed && 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/60 shadow-xs'
                              )}
                              onClick={() => setAnalysisTarget({ row: req, analysis })}
                              title="Click to view full match & duplication analysis"
                            >
                              {isHigh ? (
                                <AlertTriangle className="size-3.5 shrink-0 text-rose-600" />
                              ) : isMed ? (
                                <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                              ) : (
                                <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" />
                              )}
                              <span className="font-bold">{analysis.score}%</span>
                              <span className="text-[11px] font-medium opacity-80">Match</span>
                              <ExternalLink className="size-3 opacity-50 group-hover:opacity-100 transition-opacity ml-0.5" />
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={onboardingStatusTone(req.status)} className="gap-1.5 font-semibold">
                          <span className="size-1.5 rounded-full bg-current" />
                          {req.status === 'pending' && !req.isSubmitted ? 'Awaiting submission' : STATUS_LABEL[req.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {req.status === 'pending' ? (() => {
                          const hasDocs = req.documentSummary.uploaded + req.documentSummary.verified + req.documentSummary.rejected > 0;
                          const isAwaitingDocs = req.documentSummary.required > 0 && !hasDocs;
                          const notSubmitted = !req.isSubmitted;
                          const notSubmittedTitle = notSubmitted ? 'Vendor has not submitted onboarding form yet' : undefined;
                          return (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                                onClick={async () => {
                                  setSnapshotTarget(req);
                                  setSnapshotLoading(true);
                                  setSnapshotData(null);
                                  try {
                                    const data = await procurementService.getVendorProfile(String(req.id));
                                    setSnapshotData(data);
                                  } catch {
                                    setSnapshotData(null);
                                  } finally {
                                    setSnapshotLoading(false);
                                  }
                                }}
                                title="View registration application"
                              >
                                <Eye className="size-3.5" />
                                <span>View</span>
                              </Button>
                              {hasDocs && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1.5"
                                  onClick={() => openDocuments(req)}
                                >
                                  <FileText className="size-3.5" /> Docs
                                </Button>
                              )}
                              {notSubmitted ? (
                                <Badge tone="neutral" className="gap-1 text-[11px] font-normal">
                                  <Clock className="size-3" /> Form in progress
                                </Badge>
                              ) : isAwaitingDocs ? (
                                <Badge tone="info" className="gap-1 text-[11px] font-normal">
                                  <FileText className="size-3" /> Awaiting docs
                                </Badge>
                              ) : null}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 border-rose-500/30 gap-1.5"
                                disabled={busyId === req.id || notSubmitted || !canApproveOnboarding}
                                title={!canApproveOnboarding ? 'Admin has not allowed this action. You do not have permission to reject onboarding requests.' : notSubmittedTitle}
                                onClick={() => {
                                  if (!canApproveOnboarding) return;
                                  setActionError(null);
                                  setRejectTarget(req);
                                  setRejectReason('');
                                }}
                              >
                                <XCircle className="size-3.5" /> Reject
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={busyId === req.id || notSubmitted || !canApproveOnboarding}
                                title={!canApproveOnboarding ? 'Admin has not allowed this action. You do not have permission to approve onboarding requests.' : notSubmittedTitle}
                                onClick={() => {
                                  if (!canApproveOnboarding) return;
                                  openApproveModal(req);
                                }}
                              >
                                <CheckCircle2 className="size-3.5" />
                                {busyId === req.id ? 'Working…' : 'Approve'}
                              </Button>
                            </div>
                          );
                        })() : req.status === 'approved' ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                              onClick={() => openDocuments(req)}
                            >
                              <FileText className="size-3.5" /> Docs
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                                onClick={async () => {
                                setSnapshotTarget(req);
                                setSnapshotLoading(true);
                                setSnapshotData(null);
                                try {
                                  const data = await procurementService.getVendorProfile(String(req.id));
                                  setSnapshotData(data);
                                } catch {
                                  setSnapshotData(null);
                                } finally {
                                  setSnapshotLoading(false);
                                }
                              }}
                              title="View registration application"
                            >
                              <Eye className="size-3.5" /> View
                            </Button>
                          </div>
                        ) : req.status === 'rejected' ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                              onClick={() => openDocuments(req)}
                            >
                              <FileText className="size-3.5" /> Docs
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1.5"
                              onClick={async () => {
                                setSnapshotTarget(req);
                                setSnapshotLoading(true);
                                setSnapshotData(null);
                                try {
                                  const data = await procurementService.getVendorProfile(String(req.id));
                                  setSnapshotData(data);
                                } catch {
                                  setSnapshotData(null);
                                } finally {
                                  setSnapshotLoading(false);
                                }
                              }}
                              title="View registration application"
                            >
                              <Eye className="size-3.5" /> View
                            </Button>
                            {req.rejectionReason && (
                              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={req.rejectionReason}>
                                {req.rejectionReason.length > 35
                                  ? req.rejectionReason.slice(0, 35) + '…'
                                  : req.rejectionReason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </LandingTable>
            </div>

            {/* Mobile View matching RFQ Page */}
            <div className="divide-y divide-border/65 lg:hidden">
              {paginated.map((req) => (
                <article key={req.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold">
                          {req.vendorNo}
                        </span>
                        <p className="truncate text-base font-bold text-foreground">{req.name}</p>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                        <Mail size={13} className="shrink-0" />
                        {req.email}
                      </p>
                      {req.phone && (
                        <p className="text-xs text-muted-foreground font-mono">
                          P.No: {req.phone}
                        </p>
                      )}
                      {(() => {
                        const analysis = matchAnalyses.get(req.id) || {
                          score: 0,
                          duplicationRisk: 'LOW' as const,
                          matchedVendor: null,
                          isMultiVendorMatch: false,
                          multiVendorSummary: '',
                          breakdown: {
                            name: { score: 0, weight: 0.4 },
                            email: { score: 0, weight: 0.4 },
                            person: { score: 0, weight: 0.1 },
                            phone: { score: 0, weight: 0.1 },
                          },
                          totalCandidatesScanned: 0,
                        };

                        const isHigh = analysis.duplicationRisk === 'HIGH';
                        const isMed = analysis.duplicationRisk === 'MEDIUM';

                        return (
                          <div className="pt-1">
                            <button
                              type="button"
                              className={cn(
                                'oq-match-pill group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer select-none',
                                isHigh && 'bg-rose-500/10 text-rose-600 border border-rose-500/30',
                                isMed && 'bg-amber-500/10 text-amber-600 border border-amber-500/30',
                                !isHigh && !isMed && 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                              )}
                              onClick={() => setAnalysisTarget({ row: req, analysis })}
                              title="Click to view full match & duplication analysis"
                            >
                              {isHigh ? (
                                <AlertTriangle className="size-3.5 shrink-0 text-rose-600" />
                              ) : isMed ? (
                                <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                              ) : (
                                <ShieldCheck className="size-3.5 shrink-0 text-emerald-600" />
                              )}
                              <span className="font-bold">{analysis.score}%</span>
                              <span className="text-[11px] font-medium opacity-80">Match Analysis</span>
                              <ExternalLink className="size-3 opacity-60 ml-0.5" />
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    <Badge tone={onboardingStatusTone(req.status)} className="shrink-0 gap-1 font-semibold">
                      <span className="size-1.5 rounded-full bg-current" />
                      {req.status === 'pending' && !req.isSubmitted ? 'Awaiting submission' : STATUS_LABEL[req.status]}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-2.5">
                    <span>Submitted: <strong>{req.submittedDate}</strong></span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-border/50">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={async () => {
                        setSnapshotTarget(req);
                        setSnapshotLoading(true);
                        setSnapshotData(null);
                        try {
                          const data = await procurementService.getVendorProfile(String(req.id));
                          setSnapshotData(data);
                        } catch {
                          setSnapshotData(null);
                        } finally {
                          setSnapshotLoading(false);
                        }
                      }}
                    >
                      <Eye className="size-3.5" /> View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => {
                        const analysis = matchAnalyses.get(req.id);
                        if (analysis) setAnalysisTarget({ row: req, analysis });
                      }}
                    >
                      <Sparkles className="size-3.5" /> Match %
                    </Button>
                    {req.documents.length > 0 && (
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openDocuments(req)}>
                        <FileText className="size-3.5" /> Docs
                      </Button>
                    )}
                    {req.status === 'pending' && canApproveOnboarding && req.isSubmitted && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs text-rose-600 border-rose-500/30 gap-1.5"
                          disabled={busyId === req.id}
                          onClick={() => {
                            setActionError(null);
                            setRejectTarget(req);
                            setRejectReason('');
                          }}
                        >
                          <XCircle className="size-3.5" /> Reject
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 text-white gap-1.5"
                          disabled={busyId === req.id}
                          onClick={() => openApproveModal(req)}
                        >
                          <CheckCircle2 className="size-3.5" /> Approve
                        </Button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            className="m-4 min-h-64 border-0 shadow-none"
            icon={Search}
            title="No onboarding requests found"
            description={search ? 'Try adjusting your search query or clear the active filter.' : `No ${activeFilter === 'all' ? '' : activeFilter} vendors in the queue.`}
            action={
              (search || activeFilter !== 'all') ? (
                <Button variant="outline" onClick={() => { setSearch(''); setActiveFilter('all'); }}>
                  <X className="size-4" /> Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* Pagination */}
      <TablePagination
        currentPage={safePage}
        totalItems={filtered.length}
        perPage={perPage}
        onPageChange={setCurrentPage}
      />

      {/* Approve Modal */}
      <Dialog open={Boolean(approveTarget)} onOpenChange={(open) => { if (!open) setApproveTarget(null); }}>
        {approveTarget && (
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <DialogTitle>Approve {approveTarget.name}?</DialogTitle>
              <DialogDescription>
                Vendor will be approved and a password setup email will be sent to <strong>{approveTarget.email}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5 py-2">
              <label className="text-xs font-semibold text-foreground" htmlFor="approve-message">
                Custom Message <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="approve-message"
                className="min-h-24 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
                value={approveMessage}
                onChange={(e) => setApproveMessage(e.target.value)}
                placeholder="e.g. Welcome aboard! We look forward to working with you..."
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={busyId === approveTarget.id || !canApproveOnboarding}
                title={!canApproveOnboarding ? 'You do not have permission to approve onboarding requests.' : 'Approve & Send Email'}
                onClick={handleApproveConfirm}
              >
                {busyId === approveTarget.id ? 'Approving…' : 'Approve & Send Email'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Reject Modal */}
      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => { if (!open) setRejectTarget(null); }}>
        {rejectTarget && (
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
                <XCircle className="size-5" />
              </div>
              <DialogTitle>Reject {rejectTarget.name}?</DialogTitle>
              <DialogDescription>
                Please specify the reason for rejecting this vendor application.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-1.5 py-2">
              <label className="text-xs font-semibold text-foreground" htmlFor="reject-reason">
                Reason for rejection <span className="text-destructive">*</span>
              </label>
              <textarea
                id="reject-reason"
                className="min-h-24 w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this vendor was not approved (min. 5 characters)…"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={busyId === rejectTarget.id || rejectReason.trim().length < 5 || !canApproveOnboarding}
                title={!canApproveOnboarding ? 'You do not have permission to reject onboarding requests.' : 'Confirm rejection'}
                onClick={handleRejectConfirm}
              >
                {busyId === rejectTarget.id ? 'Rejecting…' : 'Confirm rejection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Documents Modal */}
      <Dialog open={Boolean(documentTarget)} onOpenChange={(open) => { if (!open) setDocumentTarget(null); }}>
        {documentTarget && (
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="size-5" />
                </div>
                <div>
                  <DialogTitle>{documentTarget.name}</DialogTitle>
                  <DialogDescription>Uploaded Documents</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4 py-2">
              {documents.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">No documents uploaded yet.</div>
              ) : (() => {
                const regularDocs = documents.filter(d => d.documentType !== 'NDA' && d.documentType !== 'MNDA');
                const signedDocs = documents.filter(d => d.documentType === 'NDA' || d.documentType === 'MNDA');
                return (
                  <>
                    {regularDocs.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Uploaded Documents ({regularDocs.length})
                        </div>
                        {regularDocs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between rounded-xl border border-border/60 bg-accent/20 p-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="size-5 text-primary shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-foreground truncate">{doc.documentType}</div>
                                <div className="text-[12px] text-muted-foreground truncate">{doc.originalName}</div>
                                {(doc.issueDate || doc.expiryDate || doc.expirationDate || doc.issuedAuthority || doc.issuingAuthority) && (
                                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground mt-1">
                                    {doc.issueDate && (
                                      <span>Issue: <strong className="text-foreground font-medium">{String(doc.issueDate).slice(0, 10)}</strong></span>
                                    )}
                                    {(doc.expiryDate || doc.expirationDate) && (
                                      <span>Expiry: <strong className="text-foreground font-medium">{String(doc.expiryDate || doc.expirationDate).slice(0, 10)}</strong></span>
                                    )}
                                    {(doc.issuedAuthority || doc.issuingAuthority) && (
                                      <span>Authority: <strong className="text-foreground font-medium">{doc.issuedAuthority || doc.issuingAuthority}</strong></span>
                                    )}
                                  </div>
                                )}
                                {doc.rejectionReason && <div className="text-[11px] text-destructive italic">{doc.rejectionReason}</div>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => viewDocument(doc.publicUrl)}
                                title="View document"
                              >
                                <Eye className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => downloadDocument(doc.publicUrl, doc.originalName)}
                                title="Download document"
                              >
                                <Download className="size-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {signedDocs.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <ShieldCheck className="size-4" /> Signed Agreements ({signedDocs.length})
                        </div>
                        {signedDocs.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-foreground truncate">{doc.documentType}</div>
                                <div className="text-[12px] text-emerald-600 dark:text-emerald-400 font-semibold">✓ Signed</div>
                                {doc.signedBy && <div className="text-[11px] text-muted-foreground">by {doc.signedBy}</div>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {doc.contentSnapshot ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setSignedPreviewDoc(doc)}
                                  title="Preview signed agreement"
                                >
                                  <Eye className="size-4" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => viewDocument(doc.publicUrl)}
                                  title="View signed agreement"
                                >
                                  <Eye className="size-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => downloadSignedDocument(doc)}
                                title="Download signed agreement"
                              >
                                <Download className="size-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDocumentTarget(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ── Vendor Match & Duplication Full Analysis Pop-Out Modal ── */}
      <Dialog
        open={Boolean(analysisTarget)}
        onOpenChange={(open) => {
          if (!open) setAnalysisTarget(null);
        }}
      >
        {analysisTarget && (() => {
          const { row: targetRow, analysis } = analysisTarget;
          const isHigh = analysis.duplicationRisk === 'HIGH';
          const isMed = analysis.duplicationRisk === 'MEDIUM';
          const isLow = !isHigh && !isMed;

          return (
            <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-border bg-background sm:rounded-2xl shadow-2xl">
              {/* Header */}
              <DialogHeader className="p-6 border-b border-border/80 bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className={cn(
                      'grid size-12 shrink-0 place-items-center rounded-2xl border transition-colors',
                      isHigh && 'bg-rose-500/15 border-rose-500/30 text-rose-600',
                      isMed && 'bg-amber-500/15 border-amber-500/30 text-amber-600',
                      isLow && 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600'
                    )}>
                      {isHigh ? <AlertTriangle className="size-6" /> : isMed ? <AlertTriangle className="size-6" /> : <ShieldCheck className="size-6" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <DialogTitle className="text-xl font-bold text-foreground">
                          {targetRow.name}
                        </DialogTitle>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold">
                          {targetRow.vendorNo}
                        </span>
                        <Badge tone={onboardingStatusTone(targetRow.status)} className="capitalize font-semibold text-xs gap-1">
                          <span className="size-1.5 rounded-full bg-current" />
                          {targetRow.status}
                        </Badge>
                      </div>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        Live Database Duplication Scan • Evaluated against {analysis.totalCandidatesScanned} master & queue records
                      </DialogDescription>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Score & Risk Rating Hero Banner */}
                <div className={cn(
                  'flex items-center justify-between p-5 rounded-xl border transition-all',
                  isHigh && 'bg-rose-500/10 border-rose-500/25',
                  isMed && 'bg-amber-500/10 border-amber-500/25',
                  isLow && 'bg-emerald-500/10 border-emerald-500/25'
                )}>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {analysis.matchedVendor ? 'Vendor Duplication Match' : 'Duplication Risk Rating'}
                    </div>
                    <div className={cn(
                      'text-3xl font-extrabold mt-1 tracking-tight',
                      isHigh && 'text-rose-600',
                      isMed && 'text-amber-600',
                      isLow && 'text-emerald-600'
                    )}>
                      {analysis.score}%
                      <span className="text-sm font-semibold ml-2 opacity-90">
                        {isHigh ? 'HIGH RISK' : isMed ? 'MEDIUM RISK' : 'LOW RISK (UNIQUE)'}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-foreground mt-1">
                      {analysis.matchedVendor ? (
                        analysis.isMultiVendorMatch && analysis.multiVendorSummary ? (
                          <span>Matched multiple records: <strong>{analysis.multiVendorSummary}</strong></span>
                        ) : (
                          <span>Top duplicate candidate: <strong>{analysis.matchedVendor.name}</strong></span>
                        )
                      ) : (
                        <span>0% Duplication Risk · Clean & unique vendor credentials</span>
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    'size-14 rounded-2xl flex items-center justify-center border shrink-0',
                    isHigh && 'bg-rose-500/20 text-rose-600 border-rose-500/40',
                    isMed && 'bg-amber-500/20 text-amber-600 border-amber-500/40',
                    isLow && 'bg-emerald-500/20 text-emerald-600 border-emerald-500/40'
                  )}>
                    {isHigh ? <AlertTriangle size={28} /> : isMed ? <AlertTriangle size={28} /> : <ShieldCheck size={28} />}
                  </div>
                </div>

                {/* Cross-Vendor Conflict Alert */}
                {analysis.isMultiVendorMatch && (
                  <div className="flex items-start gap-3 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-sm text-foreground">
                    <AlertTriangle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-rose-700 dark:text-rose-400">Cross-Vendor Match Conflict:</strong> Company Name matches <strong>"{analysis.breakdown.name.matchedVendor}"</strong> ({analysis.breakdown.name.score}%), while Vendor Email matches <strong>"{analysis.breakdown.email.matchedVendor}"</strong> ({analysis.breakdown.email.score}%). Review both entries carefully.
                    </div>
                  </div>
                )}

                {/* 4-Factor Weighted Breakdown Grid */}
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2.5">
                    Priority-Weighted Factor Breakdown
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Company Name */}
                    <div className="p-3.5 rounded-xl border border-border bg-card shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">Company Name</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 font-semibold">Weight 40%</span>
                        </div>
                        <span className={cn(
                          'text-xs font-bold',
                          analysis.breakdown.name.score >= 60 ? 'text-rose-600' : analysis.breakdown.name.score > 0 ? 'text-amber-600' : 'text-emerald-600'
                        )}>
                          {analysis.breakdown.name.score}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Target: <span className="text-foreground font-medium">{targetRow.name}</span>
                      </div>
                      {analysis.breakdown.name.matchedVendor && (
                        <div className="text-xs text-muted-foreground truncate">
                          Matched: <span className="text-foreground font-medium">{analysis.breakdown.name.matchedVendor}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground italic border-t border-border/50 pt-1.5">
                        {analysis.breakdown.name.explanation}
                      </div>
                    </div>

                    {/* Email */}
                    <div className="p-3.5 rounded-xl border border-border bg-card shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">Vendor Email</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 font-semibold">Weight 40%</span>
                        </div>
                        <span className={cn(
                          'text-xs font-bold',
                          analysis.breakdown.email.score >= 60 ? 'text-rose-600' : analysis.breakdown.email.score > 0 ? 'text-amber-600' : 'text-emerald-600'
                        )}>
                          {analysis.breakdown.email.score}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Target: <span className="text-foreground font-medium">{targetRow.email}</span>
                      </div>
                      {analysis.breakdown.email.matchedValue && (
                        <div className="text-xs text-muted-foreground truncate">
                          Matched: <span className="text-foreground font-medium">{analysis.breakdown.email.matchedValue}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground italic border-t border-border/50 pt-1.5">
                        {analysis.breakdown.email.explanation}
                      </div>
                    </div>

                    {/* Contact Person */}
                    <div className="p-3.5 rounded-xl border border-border bg-card shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">Contact Person</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">Weight 10%</span>
                        </div>
                        <span className={cn(
                          'text-xs font-bold',
                          analysis.breakdown.person.score >= 60 ? 'text-rose-600' : analysis.breakdown.person.score > 0 ? 'text-amber-600' : 'text-emerald-600'
                        )}>
                          {analysis.breakdown.person.score}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Target: <span className="text-foreground font-medium">{targetRow.contactPerson || '—'}</span>
                      </div>
                      {analysis.breakdown.person.matchedValue && (
                        <div className="text-xs text-muted-foreground truncate">
                          Matched: <span className="text-foreground font-medium">{analysis.breakdown.person.matchedValue}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground italic border-t border-border/50 pt-1.5">
                        {analysis.breakdown.person.explanation}
                      </div>
                    </div>

                    {/* Phone Number */}
                    <div className="p-3.5 rounded-xl border border-border bg-card shadow-2xs space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-foreground">Phone Number</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">Weight 10%</span>
                        </div>
                        <span className={cn(
                          'text-xs font-bold',
                          analysis.breakdown.phone.score >= 60 ? 'text-rose-600' : analysis.breakdown.phone.score > 0 ? 'text-amber-600' : 'text-emerald-600'
                        )}>
                          {analysis.breakdown.phone.score}%
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Target: <span className="text-foreground font-medium">{targetRow.phone || '—'}</span>
                      </div>
                      {analysis.breakdown.phone.matchedValue && (
                        <div className="text-xs text-muted-foreground truncate">
                          Matched: <span className="text-foreground font-medium">{analysis.breakdown.phone.matchedValue}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground italic border-t border-border/50 pt-1.5">
                        {analysis.breakdown.phone.explanation}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Side-by-Side Comparison (if a match exists) */}
                {analysis.matchedVendor && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="bg-muted/40 px-4 py-2.5 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Candidate Comparison
                    </div>
                    <div className="divide-y divide-border/60 text-xs">
                      <div className="grid grid-cols-2 p-3 bg-muted/15 font-semibold text-muted-foreground">
                        <div>Current Queue Record</div>
                        <div>Matched Database Record</div>
                      </div>
                      <div className="grid grid-cols-2 p-3 gap-2">
                        <div>
                          <div className="text-[11px] text-muted-foreground">Company Name</div>
                          <div className="font-bold text-foreground text-sm">{targetRow.name}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground">Matched Company Name</div>
                          <div className="font-bold text-foreground text-sm">{analysis.matchedVendor.name}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 p-3 gap-2">
                        <div>
                          <div className="text-[11px] text-muted-foreground">Email</div>
                          <div className="font-medium text-foreground">{targetRow.email}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground">Matched Email</div>
                          <div className="font-medium text-foreground">{analysis.matchedVendor.email || '—'}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 p-3 gap-2">
                        <div>
                          <div className="text-[11px] text-muted-foreground">Phone</div>
                          <div className="font-mono text-foreground">{targetRow.phone || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground">Matched Phone</div>
                          <div className="font-mono text-foreground">{analysis.matchedVendor.phone || '—'}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 p-3 gap-2">
                        <div>
                          <div className="text-[11px] text-muted-foreground">Contact Person</div>
                          <div className="text-foreground">{targetRow.contactPerson || '—'}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-muted-foreground">Matched Contact Person</div>
                          <div className="text-foreground">{analysis.matchedVendor.contactPerson || '—'}</div>
                        </div>
                      </div>
                      {analysis.matchedVendor.vendorNo && (
                        <div className="grid grid-cols-2 p-3 gap-2">
                          <div>
                            <div className="text-[11px] text-muted-foreground">Vendor #</div>
                            <div className="font-mono font-bold text-primary">{targetRow.vendorNo}</div>
                          </div>
                          <div>
                            <div className="text-[11px] text-muted-foreground">Matched Vendor #</div>
                            <div className="font-mono font-bold text-primary">{analysis.matchedVendor.vendorNo}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Queue Status Notice */}
                <div className="p-3.5 rounded-xl border border-border bg-muted/20 text-xs flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-foreground">Current Queue Status: </span>
                    <Badge tone={onboardingStatusTone(targetRow.status)} className="capitalize text-xs font-semibold ml-1">
                      {targetRow.status}
                    </Badge>
                    <span className="text-muted-foreground ml-2">
                      {targetRow.status === 'pending'
                        ? isHigh
                          ? '• Caution: High duplicate score detected. Verify records before approving.'
                          : '• Pending review by procurement officer.'
                        : targetRow.status === 'approved'
                          ? '• Vendor has already been approved in the system.'
                          : '• Vendor registration was rejected.'}
                    </span>
                  </div>
                  <div className="text-muted-foreground shrink-0">
                    Docs: <strong>{targetRow.documentSummary.uploaded}/{targetRow.documentSummary.required || 7}</strong>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <DialogFooter className="p-4 border-t border-border bg-muted/25 flex flex-row items-center justify-between sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const req = targetRow;
                    setAnalysisTarget(null);
                    setSnapshotTarget(req);
                    setSnapshotLoading(true);
                    setSnapshotData(null);
                    procurementService.getVendorProfile(String(req.id))
                      .then((d) => setSnapshotData(d))
                      .catch(() => setSnapshotData(null))
                      .finally(() => setSnapshotLoading(false));
                  }}
                  className="gap-1.5"
                >
                  <Eye className="size-3.5" /> View Registration Form
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setAnalysisTarget(null)}
                >
                  Close Analysis
                </Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>

      {/* Vendor Profile Snapshot Modal */}
      <Dialog open={Boolean(snapshotTarget)} onOpenChange={(open) => { if (!open) { setSnapshotTarget(null); setSnapshotData(null); } }}>
        {snapshotTarget && (
          <DialogContent className="sm:max-w-[680px]">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building className="size-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle>{snapshotTarget.name}</DialogTitle>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-bold">
                      {snapshotTarget.vendorNo}
                    </span>
                  </div>
                  <DialogDescription>
                    Vendor Registration Application • Submitted {snapshotTarget.submittedDate}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="max-h-[65vh] overflow-y-auto pr-1 py-2">
              {snapshotLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading vendor details…</div>
              ) : snapshotData ? (
                <div className="space-y-5">
                  {/* 1. Supplier Details Section */}
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary border-b border-border/50 pb-2">
                      <Building2 className="size-4" /> Supplier Details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground font-medium">Company Name</div>
                        <div className="font-semibold text-foreground mt-0.5">
                          {String(snapshotData.name || snapshotTarget.name || '—')}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-medium">Vendor Email</div>
                        <div className="font-semibold text-foreground mt-0.5">
                          {String(snapshotData.email || snapshotTarget.email || '—')}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-medium">Contact Person</div>
                        <div className="font-semibold text-foreground mt-0.5">
                          {String(snapshotData.contactPerson || snapshotTarget.contactPerson || '—')}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-medium">Phone Number (P.No.)</div>
                        <div className="font-semibold text-foreground mt-0.5 font-mono">
                          {String(snapshotData.phone || snapshotTarget.phone || '—')}
                        </div>
                      </div>
                      {snapshotData.website ? (
                        <div>
                          <div className="text-muted-foreground font-medium">Website</div>
                          <div className="font-semibold text-foreground mt-0.5">{String(snapshotData.website)}</div>
                        </div>
                      ) : null}
                      {snapshotData.location ? (
                        <div>
                          <div className="text-muted-foreground font-medium">Location</div>
                          <div className="font-semibold text-foreground mt-0.5">{String(snapshotData.location)}</div>
                        </div>
                      ) : null}
                      {snapshotData.address ? (
                        <div className="sm:col-span-2">
                          <div className="text-muted-foreground font-medium">Address</div>
                          <div className="font-semibold text-foreground mt-0.5">{String(snapshotData.address)}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* 2. Supplier Information Section */}
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary border-b border-border/50 pb-2">
                      <Tag className="size-4" /> Supplier Information
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-muted-foreground font-medium">Vendor Category</div>
                        <div className="font-semibold text-foreground mt-0.5">
                          {String(snapshotData.category || snapshotTarget.category || '—')}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground font-medium">Supplier Type</div>
                        <div className="font-semibold text-foreground mt-0.5">
                          {String(snapshotData.supplierType || snapshotTarget.supplierType || '—')}
                        </div>
                      </div>
                      {snapshotData.onboardingNotes ? (
                        <div className="sm:col-span-2">
                          <div className="text-muted-foreground font-medium">Notes / Business Description</div>
                          <div className="font-semibold text-foreground mt-0.5 whitespace-pre-wrap">
                            {String(snapshotData.onboardingNotes)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* 3. Uploaded Registration Documents */}
                  {(() => {
                    const rawDocs = (snapshotData.documents as Array<Record<string, unknown>>) ||
                      (snapshotTarget.documents as Array<Record<string, unknown>>) || [];

                    const submittedDocs = rawDocs.filter((d) => {
                      const hasContent = Boolean(
                        d.publicUrl ||
                        d.dataUrl ||
                        d.contentSnapshot ||
                        d.fileName ||
                        d.originalName
                      );
                      const status = String(d.status || '').toUpperCase();
                      return hasContent && status !== 'NOT_SUBMITTED' && status !== 'MISSING';
                    });

                    return (
                      <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                        <div className="flex items-center justify-between border-b border-border/50 pb-2">
                          <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary">
                            <FileCheck2 className="size-4" /> Uploaded Registration Documents
                          </div>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {submittedDocs.length} {submittedDocs.length === 1 ? 'document' : 'documents'} submitted
                          </span>
                        </div>

                        {submittedDocs.length === 0 ? (
                          <div className="py-6 text-center text-xs text-muted-foreground bg-muted/15 rounded-lg border border-dashed border-border/70">
                            No documents submitted by vendor
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {submittedDocs.map((doc, idx) => {
                              const rawType = String(doc.label || doc.documentType || doc.type || '').trim();
                              const title = rawType
                                ? rawType.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                                : `Document ${idx + 1}`;
                              const fileName = String(doc.originalName || doc.fileName || `${title}.pdf`);
                              const fileUrl = String(doc.publicUrl || doc.dataUrl || '');
                              const isSigned = Boolean(doc.contentSnapshot || doc.signedBy);

                              return (
                                <div
                                  key={String(doc.id || idx)}
                                  className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 text-xs flex flex-col justify-between space-y-2.5 transition-shadow hover:shadow-xs"
                                >
                                  <div>
                                    <div className="flex items-center justify-between gap-1.5">
                                      <span className="font-bold text-foreground truncate" title={title}>
                                        {title}
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 shrink-0">
                                        <Check size={11} /> {isSigned ? 'Signed' : 'Uploaded'}
                                      </span>
                                    </div>
                                    {fileName && (
                                      <p className="mt-1 text-[11px] text-foreground/80 truncate font-mono" title={fileName}>
                                        {fileName}
                                      </p>
                                    )}
                                    {doc.signedBy && (
                                      <p className="text-[10px] text-muted-foreground mt-0.5">
                                        Signed by {String(doc.signedBy)}
                                      </p>
                                    )}
                                  </div>

                                  {fileUrl ? (
                                    <div className="pt-1 flex items-center gap-1.5">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 flex-1 text-[11px] gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        onClick={() => viewDocument(fileUrl)}
                                      >
                                        <Eye className="size-3" /> View Document
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        className="h-7 w-7 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/15"
                                        onClick={() => downloadDocument(fileUrl, fileName)}
                                        title="Download Document"
                                      >
                                        <Download className="size-3.5" />
                                      </Button>
                                    </div>
                                  ) : doc.contentSnapshot ? (
                                    <div className="pt-1">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 w-full text-[11px] gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                        onClick={() => setSignedPreviewDoc(doc as any)}
                                      >
                                        <Eye className="size-3" /> Preview Signed
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mandatory Information */}
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 border-b border-border/50 pb-2">
                      <FileText className="size-4" /> Mandatory Information
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div><div className="text-muted-foreground font-medium">{String(snapshotData.gstNumberLabel || 'VAT Number')}</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.gstNumber || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">{String(snapshotData.panNumberLabel || 'PIN Number')}</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.panNumber || '—')}</div></div>
                      {snapshotData.mandatoryCustomFields && Array.isArray(snapshotData.mandatoryCustomFields) && snapshotData.mandatoryCustomFields.length > 0 && (
                        (snapshotData.mandatoryCustomFields as Array<{ id: string; label: string }>).map((cf) => (
                          <div key={cf.id}>
                            <div className="text-muted-foreground font-medium">{cf.label}</div>
                            <div className="font-semibold text-foreground mt-0.5">
                              {snapshotData.customFieldValues && (snapshotData.customFieldValues as Record<string, string>)[cf.id]
                                ? String((snapshotData.customFieldValues as Record<string, string>)[cf.id])
                                : '—'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Bank Details */}
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border-b border-border/50 pb-2">
                      <Landmark className="size-4" /> Bank Details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div><div className="text-muted-foreground font-medium">Bank Name</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.bankName || '—')}</div></div>
                      <div>
                        <div className="text-muted-foreground font-medium">Account Number</div>
                        <div className="font-semibold text-foreground mt-0.5">
                          {snapshotData.bankAccountNumber ? (
                            <span className="font-mono">
                              {'\u25CF'.repeat(8)}{String(snapshotData.bankAccountNumber).slice(-4)}
                            </span>
                          ) : '—'}
                        </div>
                      </div>
                      <div><div className="text-muted-foreground font-medium">IFSC / Routing Code</div><div className="font-semibold text-foreground mt-0.5 font-mono">{String(snapshotData.bankIfscCode || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">Branch</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.bankBranch || '—')}</div></div>
                    </div>
                  </div>

                  {/* Additional / Custom Fields */}
                  {((snapshotData.flexiFields && Array.isArray(snapshotData.flexiFields) && snapshotData.flexiFields.length > 0) ||
                    (snapshotData.flexiFieldValues && Object.keys(snapshotData.flexiFieldValues as Record<string, string>).length > 0)) && (
                    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                      <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border-b border-border/50 pb-2">
                        <List className="size-4" /> Additional / Custom Fields
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {snapshotData.flexiFields && Array.isArray(snapshotData.flexiFields) && snapshotData.flexiFields.length > 0 ? (
                          (snapshotData.flexiFields as Array<{ fieldKey?: string; label: string; fieldType?: string }>).map((f, idx) => {
                            const key = f.fieldKey || f.label;
                            const flexiVals = (snapshotData.flexiFieldValues as Record<string, string>) || {};
                            const val = flexiVals[key] ?? flexiVals[f.label] ?? flexiVals[f.fieldKey || ''];
                            const isAttachment = (f.fieldType === 'attachment' || f.fieldType === 'file') || (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/api/')));
                            const isCheckbox = f.fieldType === 'checkbox';
                            const isDate = f.fieldType === 'date';
                            return (
                              <div key={idx}>
                                <div className="text-muted-foreground font-medium">{f.label}</div>
                                <div className="font-semibold text-foreground mt-0.5">
                                  {isAttachment && val ? (
                                    <a href={val} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                      View Attachment
                                    </a>
                                  ) : isCheckbox && val ? (
                                    val === 'Yes' || val === 'true' ? '✓ Yes' : '✗ No'
                                  ) : isDate && val && !isNaN(new Date(val).getTime()) ? (
                                    new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                  ) : (
                                    val || <span className="text-muted-foreground italic">Not filled</span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          Object.entries(snapshotData.flexiFieldValues as Record<string, string>).map(([key, val], idx) => (
                            <div key={idx}>
                              <div className="text-muted-foreground font-medium">{key}</div>
                              <div className="font-semibold text-foreground mt-0.5">{val || <span className="text-muted-foreground italic">Not filled</span>}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* NDA/MNDA Agreement(s) */}
                  {(() => {
                    const signedDocsList: Array<Record<string, unknown>> =
                      Array.isArray(snapshotData.ndaMndaDocuments) && snapshotData.ndaMndaDocuments.length > 0
                        ? (snapshotData.ndaMndaDocuments as Array<Record<string, unknown>>)
                        : snapshotData.ndaMndaDocument
                        ? [snapshotData.ndaMndaDocument as Record<string, unknown>]
                        : [];

                    if (signedDocsList.length === 0) return null;

                    return signedDocsList.map((nda, index) => {
                      const rawDocType = String(nda.documentType || nda.selectedDocType || '');
                      const isMnda = rawDocType === 'MNDA' || rawDocType.toUpperCase().includes('MUTUAL');
                      const isNda = rawDocType === 'NDA' || rawDocType.toUpperCase().includes('NON-DISCLOSURE');
                      const docTitle = isMnda ? 'MNDA Agreement' : isNda ? 'NDA Agreement' : `${rawDocType} Agreement`;
                      const cardHeader = signedDocsList.length > 1 ? docTitle.toUpperCase() : 'NDA/MNDA AGREEMENT';
                      const signedBy = nda.signedBy ? String(nda.signedBy) : null;
                      const signedAt = nda.signedAt
                        ? new Date(String(nda.signedAt)).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })
                        : null;
                      const viewUrl = nda.viewUrl ? String(nda.viewUrl) : null;
                      const contentSnap = String(nda.contentSnapshot || '');

                      return (
                        <div
                          key={String(nda.id || index)}
                          className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                              <ShieldCheck className="size-4" /> {cardHeader}
                            </div>
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              ✓ Signed
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="text-muted-foreground font-medium">Document Type</div>
                              <div className="font-semibold text-foreground mt-0.5">{docTitle}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground font-medium">Status</div>
                              <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">✓ Signed</div>
                            </div>
                            {signedBy && (
                              <div>
                                <div className="text-muted-foreground font-medium">Signed By</div>
                                <div className="font-semibold text-foreground mt-0.5">{signedBy}</div>
                              </div>
                            )}
                            {signedAt && (
                              <div>
                                <div className="text-muted-foreground font-medium">Signed On</div>
                                <div className="font-semibold text-foreground mt-0.5">{signedAt}</div>
                              </div>
                            )}
                          </div>
                          <div className="pt-2">
                            <Button
                              variant="default"
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                              onClick={() => {
                                if (contentSnap) {
                                  setSignedPreviewDoc({
                                    id: String(nda.id || ''),
                                    vendorId: snapshotTarget?.id || '',
                                    documentType: (isMnda ? 'MNDA' : isNda ? 'NDA' : rawDocType) as any,
                                    originalName: `${docTitle} (Signed)`,
                                    fileName: '',
                                    publicUrl: viewUrl || '',
                                    mimeType: 'text/html',
                                    fileSize: 0,
                                    status: 'VERIFIED',
                                    uploadedAt: String(nda.signedAt || ''),
                                    verifiedById: null,
                                    verifiedAt: null,
                                    rejectionReason: null,
                                    contentSnapshot: contentSnap,
                                    signedBy: signedBy || 'Vendor Representative',
                                    signedAt: String(nda.signedAt || ''),
                                    companySignatoryName: (nda.companySignatoryName as string) || null,
                                    companySignedAt: (nda.companySignedAt as string) || null,
                                    vendorSignatoryName: (nda.vendorSignatoryName as string) || signedBy || null,
                                    vendorSignedAt: (nda.vendorSignedAt as string) || (nda.signedAt as string) || null,
                                  });
                                } else if (viewUrl) {
                                  viewDocument(viewUrl);
                                }
                              }}
                            >
                              <Eye className="size-4" /> View Signed Agreement
                            </Button>
                          </div>
                        </div>
                      );
                    });
                  })()}

                  {/* Notes */}
                  {snapshotData.onboardingNotes && String(snapshotData.onboardingNotes).trim() ? (
                    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
                      <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 border-b border-border/50 pb-2">
                        <FilePenLine className="size-4" /> Notes
                      </div>
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                        {String(snapshotData.onboardingNotes)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-center py-8 text-sm text-muted-foreground">No profile data available for this vendor.</div>
              )}
            </div>
            <DialogFooter className="flex flex-row items-center justify-between sm:justify-between w-full pt-3 border-t border-border/60">
              <div className="flex items-center gap-2">
                {snapshotTarget.status === 'pending' && canApproveOnboarding && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-rose-600 hover:bg-rose-500/10 border-rose-500/30 gap-1.5"
                      onClick={() => {
                        const target = snapshotTarget;
                        setSnapshotTarget(null);
                        setSnapshotData(null);
                        setActionError(null);
                        setRejectTarget(target);
                        setRejectReason('');
                      }}
                    >
                      <XCircle className="size-3.5" /> Reject Application
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                      onClick={() => {
                        const target = snapshotTarget;
                        setSnapshotTarget(null);
                        setSnapshotData(null);
                        openApproveModal(target);
                      }}
                    >
                      <CheckCircle2 className="size-3.5" /> Approve Vendor
                    </Button>
                  </>
                )}
                {snapshotTarget.status === 'approved' && (
                  <Badge tone="success" className="gap-1 font-semibold text-xs">
                    <CheckCircle2 className="size-3.5" /> Vendor Approved
                  </Badge>
                )}
                {snapshotTarget.status === 'rejected' && (
                  <Badge tone="danger" className="gap-1 font-semibold text-xs">
                    <XCircle className="size-3.5" /> Vendor Rejected
                  </Badge>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => { setSnapshotTarget(null); setSnapshotData(null); }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Signed Agreement Preview Modal */}
      {signedPreviewDoc && createPortal(
        <div
          className="oq-signed-modal-portal-overlay"
          onClick={() => setSignedPreviewDoc(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${signedPreviewDoc.documentType} Signed Agreement`}
        >
          <div
            ref={modalContainerRef}
            className="oq-signed-modal"
            onClick={(e) => e.stopPropagation()}
          >

                <div className="oq-signed-modal__header">
                  <div className="oq-signed-modal__header-left">
                    <div className="oq-signed-modal__header-icon">
                      <ShieldCheck size={22} />
                    </div>
                    <div className="oq-signed-modal__header-info">
                      <div className="oq-signed-modal__header-top">
                        <h3 className="oq-signed-modal__title">
                          {signedPreviewDoc.documentType === 'MNDA' || signedPreviewDoc.documentType?.toUpperCase().includes('MUTUAL')
                            ? 'Mutual Non-Disclosure Agreement'
                            : signedPreviewDoc.documentType === 'NDA' || signedPreviewDoc.documentType?.toUpperCase().includes('NON-DISCLOSURE')
                            ? 'Non-Disclosure Agreement'
                            : `${signedPreviewDoc.documentType} Agreement`}
                        </h3>
                        <span className="oq-signed-modal__status-badge">
                          <Check size={12} />
                          Signed
                        </span>
                      </div>
                      <div className="oq-signed-modal__meta">
                        <Calendar size={12} />
                        <div className="oq-signed-modal__meta-signers">
                          <span className="oq-signed-modal__meta-signer">
                            <span className="oq-signed-modal__meta-signer-party">Company</span>
                            <span>{signedPreviewDoc.companySignatoryName || 'Company Representative'}</span>
                            {signedPreviewDoc.companySignedAt && (
                              <span className="oq-signed-modal__meta-signer-date">
                                {new Date(signedPreviewDoc.companySignedAt).toLocaleDateString('en-IN', {
                                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            )}
                          </span>
                          <span className="oq-signed-modal__meta-sep">|</span>
                          <span className="oq-signed-modal__meta-signer">
                            <span className="oq-signed-modal__meta-signer-party">Vendor</span>
                            <span>{signedPreviewDoc.vendorSignatoryName || signedPreviewDoc.signedBy || 'Vendor Representative'}</span>
                            {(signedPreviewDoc.vendorSignedAt || signedPreviewDoc.signedAt) && (
                              <span className="oq-signed-modal__meta-signer-date">
                                {new Date(signedPreviewDoc.vendorSignedAt || signedPreviewDoc.signedAt!).toLocaleDateString('en-IN', {
                                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="oq-signed-modal__header-actions">
                    <button
                      type="button"
                      className="oq-signed-modal__btn-download"
                      onClick={() => {
                        if (signedPreviewDoc.contentSnapshot) {
                          const fullHtml = buildSignedDocHtml(signedPreviewDoc.documentType, signedPreviewDoc.contentSnapshot);
                          const blob = new Blob([fullHtml], { type: 'text/html' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${signedPreviewDoc.documentType.replace(/\s+/g, '_')}_Signed_Agreement.html`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }
                      }}
                    >
                      <Download size={14} />
                      Download
                    </button>
                    <button
                      type="button"
                      className="oq-signed-modal__btn-close"
                      onClick={() => setSignedPreviewDoc(null)}
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div
                  ref={signedModalBodyRef}
                  tabIndex={-1}
                  className="oq-signed-modal__body"
                >
                  <div className="oq-signed-modal__canvas">
                    <div
                      className="oq-signed-modal__content"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(signedPreviewDoc.contentSnapshot || '', {
                          ADD_ATTR: ['style', 'target', 'data-sig-container'],
                        }),
                      }}
                    />
                  </div>
                </div>
          </div>
        </div>,
        document.body
      )}
    </PageFrame>
  );
}


const ONBOARDING_QUEUE_COLUMNS: LandingColumn[] = [
  { key: 'vendorNo', label: 'Vendor #', defaultVisible: true, required: true },
  { key: 'name', label: 'Name', defaultVisible: true, required: true },
  { key: 'phone', label: 'P.No.', defaultVisible: true },
  { key: 'email', label: 'Email', defaultVisible: true },
  { key: 'matchScore', label: 'Match %', defaultVisible: true },
  { key: 'status', label: 'Status', defaultVisible: true },
  { key: 'actions', label: 'Actions', defaultVisible: true, pinned: 'end' },
];
