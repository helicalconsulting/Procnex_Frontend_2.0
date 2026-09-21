import { useState, useMemo, useCallback, useEffect } from 'react';
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
  Filter,
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
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
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
  id: number;
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
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    submittedDate: new Date(v.submittedAt).toLocaleDateString('en-IN', {
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
  if (url.startsWith('http')) return url;
  return `${API_BASE.replace(/\/api$/, '')}${url}`;
}

const SIGNED_DOC_CSS = `body{font-family:Inter,'Segoe UI',Arial,sans-serif;padding:40px;line-height:1.7;color:#1a2332;max-width:800px;margin:0 auto}img{max-width:100%}h1,h2,h3{color:#0a1e3a}.signature-block{margin-top:32px;padding-top:20px;border-top:2px solid #e1e5eb}.parties{background:#f8fafc;padding:16px 20px;border-radius:8px;border:1px solid #e1e5eb;margin:16px 0}`;

function buildSignedDocHtml(docType: string, content: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${docType} — Signed Agreement</title><style>${SIGNED_DOC_CSS}</style></head><body>${content}</body></html>`;
}

async function downloadDocument(docUrl: string, filename: string): Promise<void> {
  return _downloadDocument(documentUrl(docUrl), filename);
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
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<QueueRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveTarget, setApproveTarget] = useState<QueueRow | null>(null);
  const [approveMessage, setApproveMessage] = useState('');
  const [documentTarget, setDocumentTarget] = useState<QueueRow | null>(null);
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [snapshotTarget, setSnapshotTarget] = useState<QueueRow | null>(null);
  const [snapshotData, setSnapshotData] = useState<Record<string, unknown> | null>(null);
  const [signedPreviewDoc, setSignedPreviewDoc] = useState<VendorDocument | null>(null);
  useBodyScrollLock(!!(approveTarget || rejectTarget || documentTarget || snapshotTarget || signedPreviewDoc));
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sseClient.connect();

    const unsub1 = sseClient.on('notification', () => reload());
    const unsub2 = sseClient.on('vendor_onboarding_accepted', () => reload());
    const unsub3 = sseClient.on('vendor_onboarding_documents_submitted', () => reload());

    const pollTimer = setInterval(() => reload(), 30_000);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      clearInterval(pollTimer);
    };
  }, [reload]);

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
        await procurementService.approveVendor(row.id, message);
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
      await procurementService.rejectVendor(rejectTarget.id, reason);
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
    setDocuments(row.documents);
    setActionError(null);
    try {
      const result = await procurementService.getVendorDocuments(row.id);
      setDocuments(result.documents || []);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load vendor documents');
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
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                  'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
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

      {/* Search & Filter Toolbar matching RFQ Page */}
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

        <div className="flex items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
          <div className="flex items-center gap-1.5 rounded-xl border border-input bg-card p-1.5 h-11 shadow-xs">
            <Filter size={14} className="ml-1.5 text-muted-foreground shrink-0" />
            {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={cn(
                  'px-3 py-1 text-xs font-semibold rounded-lg transition-colors',
                  activeFilter === f
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                )}
                onClick={() => setActiveFilter(f)}
              >
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Card matching RFQ Page */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : paginated.length > 0 ? (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/75 bg-muted/45 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3.5">Vendor</th>
                    <th className="px-5 py-3.5">Email</th>
                    <th className="px-5 py-3.5">Submitted</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paginated.map((req) => (
                    <tr key={req.id} className="transition-colors hover:bg-accent/35">
                      <td className="px-5 py-3.5 font-bold text-foreground">{req.name}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <Mail size={13} className="shrink-0" />
                          {req.email}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{req.submittedDate}</td>
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
                                    const data = await procurementService.getVendorProfile(req.id);
                                    setSnapshotData(data);
                                  } catch {
                                    setSnapshotData(null);
                                  } finally {
                                    setSnapshotLoading(false);
                                  }
                                }}
                                title="View profile snapshot"
                              >
                                <Eye className="size-3.5" /> Profile
                              </Button>
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
                                  const data = await procurementService.getVendorProfile(req.id);
                                  setSnapshotData(data);
                                } catch {
                                  setSnapshotData(null);
                                } finally {
                                  setSnapshotLoading(false);
                                }
                              }}
                              title="View profile snapshot"
                            >
                              <Eye className="size-3.5" /> Profile
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
              </table>
            </div>

            {/* Mobile View matching RFQ Page */}
            <div className="divide-y divide-border/65 lg:hidden">
              {paginated.map((req) => (
                <article key={req.id} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-bold text-foreground">{req.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                        <Mail size={13} className="shrink-0" />
                        {req.email}
                      </p>
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
                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openDocuments(req)}>
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
                          const data = await procurementService.getVendorProfile(req.id);
                          setSnapshotData(data);
                        } catch {
                          setSnapshotData(null);
                        } finally {
                          setSnapshotLoading(false);
                        }
                      }}
                    >
                      <Eye className="size-3.5" /> Profile
                    </Button>
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
              (search || activeFilter !== 'pending') ? (
                <Button variant="outline" onClick={() => { setSearch(''); setActiveFilter('all'); }}>
                  <X className="size-4" /> Clear filters
                </Button>
              ) : undefined
            }
          />
        )}
      </Card>

      {/* Pagination matching RFQ Page */}
      {filtered.length > perPage && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/65 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
              <Button
                key={page}
                variant={safePage === page ? 'default' : 'ghost'}
                size="icon-sm"
                onClick={() => setCurrentPage(page)}
                aria-label={`Page ${page}`}
              >
                {page}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={safePage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

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
                                {doc.rejectionReason && <div className="text-[11px] text-destructive italic">{doc.rejectionReason}</div>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => window.open(documentUrl(doc.publicUrl), '_blank', 'noopener,noreferrer')}
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
                                  onClick={() => window.open(documentUrl(doc.publicUrl), '_blank', 'noopener,noreferrer')}
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
                  <DialogTitle>{snapshotTarget.name}</DialogTitle>
                  <DialogDescription>Onboarding Profile Snapshot</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="max-h-[65vh] overflow-y-auto pr-1 py-2">
              {snapshotLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading vendor details…</div>
              ) : snapshotData ? (
                <div className="space-y-5">
                  {/* Company Details */}
                  <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary border-b border-border/50 pb-2">
                      <Briefcase className="size-4" /> Company Details
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div><div className="text-muted-foreground font-medium">Company Name</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.name || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">Email</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.email || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">Phone</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.phone || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">Contact Person</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.contactPerson || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">Category</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.category || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">Location</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.location || '—')}</div></div>
                      <div><div className="text-muted-foreground font-medium">Website</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.website || '—')}</div></div>
                      <div className="sm:col-span-2"><div className="text-muted-foreground font-medium">Address</div><div className="font-semibold text-foreground mt-0.5">{String(snapshotData.address || '—')}</div></div>
                    </div>
                  </div>

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
                            return (
                              <div key={idx}>
                                <div className="text-muted-foreground font-medium">{f.label}</div>
                                <div className="font-semibold text-foreground mt-0.5">{val || <span className="text-muted-foreground italic">Not filled</span>}</div>
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

                  {/* NDA/MNDA Agreement */}
                  {snapshotData.ndaMndaDocument ? (() => {
                    const nda = snapshotData.ndaMndaDocument as Record<string, unknown>;
                    const docType = String(nda.documentType || '');
                    const signedBy = nda.signedBy ? String(nda.signedBy) : null;
                    const signedAt = nda.signedAt ? new Date(String(nda.signedAt)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
                    const viewUrl = nda.viewUrl ? String(nda.viewUrl) : null;
                    return (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 border-b border-emerald-500/20 pb-2">
                          <ShieldCheck className="size-4" /> NDA/MNDA Agreement
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div><div className="text-muted-foreground font-medium">Document Type</div><div className="font-semibold text-foreground mt-0.5">{docType === 'MNDA' ? 'MNDA Agreement' : 'NDA Agreement'}</div></div>
                          <div><div className="text-muted-foreground font-medium">Status</div><div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">✓ Signed</div></div>
                          {signedBy && <div><div className="text-muted-foreground font-medium">Signed By</div><div className="font-semibold text-foreground mt-0.5">{signedBy}</div></div>}
                          {signedAt && <div><div className="text-muted-foreground font-medium">Signed On</div><div className="font-semibold text-foreground mt-0.5">{signedAt}</div></div>}
                        </div>
                        <div className="pt-2">
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                            onClick={() => {
                              const contentSnap = String(nda.contentSnapshot || '');
                              if (contentSnap) {
                                setSignedPreviewDoc({
                                  id: String(nda.id || ''),
                                  vendorId: snapshotTarget?.id || '',
                                  documentType: docType === 'MNDA' ? 'MNDA' : 'NDA',
                                  originalName: `${docType === 'MNDA' ? 'MNDA' : 'NDA'} Signed Agreement`,
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
                                });
                              } else if (viewUrl) {
                                window.open(documentUrl(viewUrl), '_blank', 'noopener,noreferrer');
                              }
                            }}
                          >
                            <Eye className="size-4" /> View Signed Agreement
                          </Button>
                        </div>
                      </div>
                    );
                  })() : null}

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
            <DialogFooter>
              <Button variant="outline" onClick={() => { setSnapshotTarget(null); setSnapshotData(null); }}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* Signed Agreement Preview Modal */}
      {signedPreviewDoc && createPortal(
        <div className="oq-signed-modal-backdrop" onClick={() => setSignedPreviewDoc(null)}>
          <div className="oq-signed-modal" onClick={(e) => e.stopPropagation()}>
            <div className="oq-signed-modal__header">
              <div className="oq-signed-modal__header-left">
                <div className="oq-signed-modal__header-icon">
                  <ShieldCheck size={22} />
                </div>
                <div className="oq-signed-modal__header-info">
                  <div className="oq-signed-modal__header-top">
                    <h3 className="oq-signed-modal__title">
                      {signedPreviewDoc.documentType === 'MNDA' ? 'Mutual Non-Disclosure Agreement' : 'Non-Disclosure Agreement'}
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

            <div className="oq-signed-modal__body">
              <div className="oq-signed-modal__canvas">
                <div
                  className="oq-signed-modal__content"
                  dangerouslySetInnerHTML={{ __html: signedPreviewDoc.contentSnapshot || '' }}
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

