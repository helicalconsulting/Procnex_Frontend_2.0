import ColumnSettingsButton from '../../components/shared/ColumnSettingsButton';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Clock3,
  Eye,
  FileText,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
  CheckSquare,
  Filter,
  Send,
  Users,
  User,
  Building,
  Layers,
  Calendar,
  ExternalLink,
  ArrowRight,
  Check,
  UserCheck,
  GitMerge,
  Loader2,
} from 'lucide-react';
import { purchaseRequisitionService, type PurchaseRequisition } from '../../services/purchaseRequisitionService';
import { rfqService } from '../../services/rfqService';
import RFQDetailModal from '../../components/rfq/RFQDetailModal';
import type { RFQTableRow } from '../../types/viewModels';
import { companySettingsService } from '../../services/companySettingsService';
import { sseClient } from '../../services/sseClient';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import type { ColumnDef } from '../../hooks/columnPreferences';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import TablePagination from '../../components/shared/TablePagination';
import { cn } from '../../lib/utils';
import CreatePurchaseRequisitionModal from './CreatePurchaseRequisitionModal';
import PriorityBadge, { getPriorityStyles, normalizePriority } from '../../components/shared/PriorityBadge';
import '../../components/shared/ColumnCustomizer.css';

type ListPurchaseRequisition = PurchaseRequisition & { isStandalone?: boolean };
type StatusFilter = string | null;

const releasedStatuses = ['APPROVED', 'COMPLETED', 'SENT_TO_VENDOR', 'PO_CREATED'];

function getStatusLabel(status: string): string {
  const s = String(status || '').toUpperCase();
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Approved & Released',
    COMPLETED: 'Approved & Released',
    REJECTED: 'Rejected',
    CANCELLED: 'Rejected',
    RETURNED: 'Returned for Re-Review',
    RE_REVIEW: 'Returned for Re-Review',
    RETURN_FOR_RE_REVIEW: 'Returned for Re-Review',
    REVISION_REQUESTED: 'Returned for Re-Review',
    SENT_TO_VENDOR: 'Sent to Vendor',
    PO_CREATED: 'PO Created',
    IN_RFQ: 'In RFQ',
  };
  return labels[s] || status.replace(/_/g, ' ');
}

function getStatusTone(status: string): 'neutral' | 'warning' | 'success' | 'danger' | 'info' {
  const s = String(status || '').toUpperCase();
  if (s === 'DRAFT') return 'neutral';
  if (s === 'PENDING_APPROVAL') return 'warning';
  if (['RETURNED', 'RE_REVIEW', 'RETURN_FOR_RE_REVIEW', 'REVISION_REQUESTED'].includes(s)) return 'warning';
  if (['REJECTED', 'CANCELLED'].includes(s)) return 'danger';
  if (s === 'SENT_TO_VENDOR' || s === 'IN_RFQ') return 'info';
  return 'success';
}

function formatDate(value?: string): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isPOEditable(status?: string): boolean {
  const s = String(status || '').toUpperCase();
  return ['DRAFT', 'RETURNED', 'RE_REVIEW', 'RETURN_FOR_RE_REVIEW', 'REVISION_REQUESTED'].includes(s);
}

function isStandaloneDocument(requisition: ListPurchaseRequisition): boolean {
  const rfqId = (requisition.rfqId || '').toLowerCase();
  return Boolean(
    requisition.isStandalone ||
    !requisition.rfqId ||
    rfqId.startsWith('direct-po') ||
    rfqId.startsWith('rfq-direct') ||
    rfqId === 'direct-po-master-id' ||
    rfqId.includes('direct')
  );
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'prNumber', label: 'Requisition #', defaultVisible: true, required: true },
  { key: 'priority', label: 'Priority', defaultVisible: true },
  { key: 'department', label: 'Department', defaultVisible: true },
  { key: 'submittedToName', label: 'Assigned To', defaultVisible: true },
  { key: 'requesterName', label: 'Requester', defaultVisible: true },
  { key: 'items', label: 'Requested Items', defaultVisible: true },
  { key: 'conversionStatus', label: 'Next Step / Routing', defaultVisible: true },
  { key: 'poDate', label: 'Date', defaultVisible: true },
];

export default function PurchaseRequisitionsListPage() {
  const navigate = useNavigate();
  const { hasPermission, roles: authRoles, user } = useAuth();
  const isAdmin = useMemo(() => {
    if (!authRoles || authRoles.length === 0) return false;
    return authRoles.some((r) => r === 'Super Admin' || r === 'Administrator' || r.toLowerCase().includes('admin'));
  }, [authRoles]);

  const canApprovePR = useMemo(() => {
    return (
      isAdmin ||
      hasPermission('Purchase Requisitions', 'canApprove') ||
      hasPermission('PO Creation', 'canApprove') ||
      hasPermission('Purchase Orders', 'canApprove')
    );
  }, [isAdmin, hasPermission]);

  const canCreateRequisition =
    isAdmin ||
    hasPermission('Purchase Requisitions', 'canCreate') ||
    hasPermission('Purchase Requisitions', 'canEdit') ||
    hasPermission('PO Creation', 'canCreate') ||
    hasPermission('PO Creation', 'canEdit') ||
    hasPermission('Purchase Orders', 'canCreate');

  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();

  const [requisitions, setRequisitions] = useState<ListPurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Action States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewingPr, setViewingPr] = useState<ListPurchaseRequisition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListPurchaseRequisition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedPrIds, setSelectedPrIds] = useState<string[]>([]);
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; link?: { text: string; url: string } } | null>(null);

  // RFQ Detail View Modal (Read-only view of converted RFQ)
  const [viewingRfq, setViewingRfq] = useState<RFQTableRow | null>(null);
  const [viewingRfqLoading, setViewingRfqLoading] = useState(false);
  const [loadingRfqId, setLoadingRfqId] = useState<string | null>(null);

  const handleOpenRfqView = useCallback(async (rfqId: string) => {
    if (!rfqId) return;
    setLoadingRfqId(rfqId);
    setViewingRfqLoading(true);
    try {
      const full = await rfqService.getById(rfqId);
      if (full) {
        setViewingRfq(full);
      } else {
        navigate(`/rfq/${encodeURIComponent(rfqId)}`);
      }
    } catch {
      navigate(`/rfq/${encodeURIComponent(rfqId)}`);
    } finally {
      setViewingRfqLoading(false);
      setLoadingRfqId(null);
    }
  }, [navigate]);

  // Conversion Modals
  const [showRfqModal, setShowRfqModal] = useState(false);
  const [rfqTitle, setRfqTitle] = useState('');
  const [rfqClosingDate, setRfqClosingDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [rfqDescription, setRfqDescription] = useState('');
  const [convertingRfq, setConvertingRfq] = useState(false);

  const [showPoModal, setShowPoModal] = useState(false);
  const [convertingPo, setConvertingPo] = useState(false);

  // Filters
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('search') || searchParams.get('q') || '');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [companyDepartments, setCompanyDepartments] = useState<string[]>([]);
  const [viewScopeTab, setViewScopeTab] = useState<'ALL' | 'ASSIGNED_TO_ME' | 'MY_REQUESTS'>(() => {
    return (isAdmin || canApprovePR) ? 'ALL' : 'MY_REQUESTS';
  });

  useEffect(() => {
    if (!isAdmin && !canApprovePR && viewScopeTab === 'ALL') {
      setViewScopeTab('MY_REQUESTS');
    }
  }, [isAdmin, canApprovePR, viewScopeTab]);

  const [selectedConversion, setSelectedConversion] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const s = searchParams.get('status')?.toUpperCase();
    if (s === 'DRAFT' || s === 'PENDING' || s === 'DRAFT_PENDING') return 'DRAFT_PENDING';
    if (s === 'APPROVED' || s === 'RELEASED') return 'APPROVED';
    if (s === 'REJECTED' || s === 'CANCELLED') return 'REJECTED';
    return null;
  });

  // Fetch departments from Company Settings
  useEffect(() => {
    companySettingsService
      .listDepartments()
      .then((deps) => {
        const names = Array.from(
          new Set(
            (deps || [])
              .filter((d) => d && d.isActive !== false && d.name?.trim())
              .map((d) => d.name.trim())
          )
        );
        if (names.length > 0) {
          setCompanyDepartments(names);
        }
      })
      .catch(() => {});
  }, []);

  // Requisitions visible to current user based on authority
  const baseRequisitionsForUser = useMemo(() => {
    const currentUserId = user?.id || (user as any)?._id;
    const currentUserEmail = (user?.email || '').toLowerCase().trim();
    const currentUserName = (user?.fullName || user?.username || '').toLowerCase().trim();

    return requisitions.filter((r) => {
      if (!r.prNumber) return false;
      // Admins and Approvers can see all company requisitions
      if (isAdmin || canApprovePR) return true;
      // Regular employees: only their own requests or requests submitted to them
      const isMine =
        (r.requesterId && String(r.requesterId) === String(currentUserId)) ||
        (r.requesterEmail && r.requesterEmail.toLowerCase().trim() === currentUserEmail) ||
        (r.requesterName && currentUserName && r.requesterName.toLowerCase().trim() === currentUserName);
      const isAssigned =
        r.submittedToUserId && String(r.submittedToUserId) === String(currentUserId);
      return isMine || isAssigned;
    });
  }, [requisitions, isAdmin, canApprovePR, user]);

  const departmentFilterOptions = useMemo(() => {
    const set = new Set<string>();
    companyDepartments.forEach((d) => set.add(d));
    baseRequisitionsForUser.forEach((r) => {
      if (r.department && r.department.trim()) set.add(r.department.trim());
    });
    const list = Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return ['All', ...list];
  }, [companyDepartments, baseRequisitionsForUser]);

  useEffect(() => {
    const q = searchParams.get('search') || searchParams.get('q');
    if (q !== null && q !== undefined) {
      setSearchTerm(q);
    }
  }, [searchParams]);

  // Column Customizer State
  const defaultOrder = useMemo(() => ALL_COLUMNS.map((c) => c.key), []);
  const defaultVisible = useMemo(() => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)), []);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(defaultVisible);
  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  const fetchRequisitions = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const list = await purchaseRequisitionService.list({ scope: 'requisitions' });
      setRequisitions((list || []).filter((r) => Boolean(r.prNumber)));
    } catch (err: any) {
      setError(err?.message || 'Failed to load purchase requisitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequisitions(true);

    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const handleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        fetchRequisitions(false);
      }, 300);
    };

    const unsubPrCreated = sseClient.on('pr_created', handleRefresh);
    const unsubPrUpdated = sseClient.on('pr_updated', handleRefresh);
    const unsubPrStatus = sseClient.on('pr_status_changed', handleRefresh);
    const unsubPrDeleted = sseClient.on('pr_deleted', handleRefresh);
    const unsubStatus = sseClient.on('po_status_changed', handleRefresh);
    const unsubCreated = sseClient.on('po_created', handleRefresh);
    const unsubUpdated = sseClient.on('po_updated', handleRefresh);
    const unsubPoDeleted = sseClient.on('po_deleted', handleRefresh);
    const unsubApprovalUpdated = sseClient.on('approval_updated', handleRefresh);
    const unsubApprovalChain = sseClient.on('approval_chain_complete', handleRefresh);
    const unsubApprovalLevel = sseClient.on('approval_level_complete', handleRefresh);
    const unsubApprovalInit = sseClient.on('approval_initiated', handleRefresh);

    window.addEventListener('heliflow:approval-updated', handleRefresh);
    window.addEventListener('heliflow:po-updated', handleRefresh);
    window.addEventListener('heliflow:pr-created', handleRefresh);
    window.addEventListener('heliflow:pr-updated', handleRefresh);
    window.addEventListener('heliflow:pr-deleted', handleRefresh);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('heliflow_sync');
      bc.onmessage = () => { handleRefresh(); };
    } catch {}

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubPrCreated();
      unsubPrUpdated();
      unsubPrStatus();
      unsubPrDeleted();
      unsubStatus();
      unsubCreated();
      unsubUpdated();
      unsubPoDeleted();
      unsubApprovalUpdated();
      unsubApprovalChain();
      unsubApprovalLevel();
      unsubApprovalInit();
      window.removeEventListener('heliflow:approval-updated', handleRefresh);
      window.removeEventListener('heliflow:po-updated', handleRefresh);
      window.removeEventListener('heliflow:pr-created', handleRefresh);
      window.removeEventListener('heliflow:pr-updated', handleRefresh);
      window.removeEventListener('heliflow:pr-deleted', handleRefresh);
      if (bc) bc.close();
    };
  }, [fetchRequisitions]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id || deleteTarget.rfqId;
    const deletedDocNumber = deleteTarget.prNumber || deleteTarget.poNumber;
    setDeleting(true);
    try {
      await purchaseRequisitionService.delete(targetId);
      setRequisitions((prev) => prev.filter((r) => r.id !== deleteTarget.id && r.rfqId !== deleteTarget.rfqId));
      setToast({ message: `Requisition ${deletedDocNumber || ''} was deleted successfully.`, type: 'success' });
      setDeleteTarget(null);

      window.dispatchEvent(new CustomEvent('heliflow:po-deleted', {
        detail: { poId: targetId, poNumber: deletedDocNumber },
      }));
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to delete document', type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  // Filtered List
  const filteredRequisitions = useMemo(() => {
    const currentUserId = user?.id || (user as any)?._id;
    const currentUserEmail = (user?.email || '').toLowerCase().trim();
    const currentUserName = (user?.fullName || user?.username || '').toLowerCase().trim();

    return baseRequisitionsForUser.filter((r) => {
      // Must be a real purchase requisition (has prNumber)
      if (!r.prNumber) return false;

      // View Scope Filter: All vs Assigned to Me vs My Requests
      if (viewScopeTab === 'ASSIGNED_TO_ME') {
        if (!r.submittedToUserId || String(r.submittedToUserId) !== String(currentUserId)) {
          return false;
        }
      } else if (viewScopeTab === 'MY_REQUESTS') {
        const isMine =
          (r.requesterId && String(r.requesterId) === String(currentUserId)) ||
          (r.requesterEmail && r.requesterEmail.toLowerCase().trim() === currentUserEmail) ||
          (r.requesterName && currentUserName && r.requesterName.toLowerCase().trim() === currentUserName);
        if (!isMine) return false;
      }

      // Department Filter
      if (selectedDept !== 'All') {
        const dept = (r.department || '').trim().toLowerCase();
        if (dept !== selectedDept.trim().toLowerCase()) return false;
      }

      // Conversion Status Filter
      if (selectedConversion !== 'All') {
        const conv = (r.conversionStatus || 'PENDING').toUpperCase();
        if (selectedConversion === 'PENDING') {
          if (conv !== 'PENDING' && r.status === 'PO_CREATED' && !r.prNumber) return false;
        } else if (conv !== selectedConversion) {
          return false;
        }
      }

      // Status Filter
      if (statusFilter && statusFilter !== 'ALL') {
        const s = String(r.status || '').toUpperCase();
        if (statusFilter === 'DRAFT_PENDING') {
          if (!['DRAFT', 'PENDING_APPROVAL', 'RETURNED', 'RE_REVIEW', 'RETURN_FOR_RE_REVIEW', 'REVISION_REQUESTED'].includes(s)) return false;
        } else if (statusFilter === 'APPROVED') {
          if (!releasedStatuses.includes(r.status) && !['APPROVED', 'RELEASED', 'SENT_TO_VENDOR'].includes(s)) return false;
        } else if (statusFilter === 'RETURNED') {
          if (!['RETURNED', 'RE_REVIEW', 'RETURN_FOR_RE_REVIEW', 'REVISION_REQUESTED'].includes(s)) return false;
        } else if (statusFilter === 'PENDING_APPROVAL') {
          if (!['PENDING_APPROVAL', 'PENDING'].includes(s)) return false;
        } else if (statusFilter === 'DRAFT') {
          if (s !== 'DRAFT') return false;
        } else if (statusFilter === 'REJECTED') {
          if (!['REJECTED', 'CANCELLED'].includes(s)) return false;
        } else {
          if (s !== statusFilter) return false;
        }
      }

      // Priority Filter
      if (priorityFilter !== 'All') {
        const pNorm = normalizePriority(r.priority);
        if (pNorm !== priorityFilter) return false;
      }

      // Search Filter
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const itemsText = Array.isArray(r.items)
        ? r.items.map((it: any) => `${it.itemName || ''} ${it.description || ''} ${it.requestedBy || ''}`).join(' ').toLowerCase()
        : '';

      return (
        (r.prNumber || '').toLowerCase().includes(term) ||
        (r.poNumber || '').toLowerCase().includes(term) ||
        (r.department || '').toLowerCase().includes(term) ||
        (r.requesterName || '').toLowerCase().includes(term) ||
        (r.submittedToName || '').toLowerCase().includes(term) ||
        (r.vendorName || '').toLowerCase().includes(term) ||
        (r.status || '').toLowerCase().includes(term) ||
        itemsText.includes(term)
      );
    });
  }, [baseRequisitionsForUser, selectedDept, viewScopeTab, selectedConversion, statusFilter, priorityFilter, searchTerm, user]);

  // Selected Requisitions Objects
  const selectedRequisitionItems = useMemo(() => {
    return requisitions.filter((r) => selectedPrIds.includes(String(r.id || r.rfqId)));
  }, [requisitions, selectedPrIds]);

  // Categorize selected items by their conversion/routing status
  const convertedToPoItems = useMemo(() => {
    return selectedRequisitionItems.filter(
      (r) =>
        r.conversionStatus === 'CONVERTED_TO_PO' ||
        Boolean(r.convertedToPoId) ||
        (r.status === 'PO_CREATED' && Boolean(r.poNumber))
    );
  }, [selectedRequisitionItems]);

  const convertedToRfqItems = useMemo(() => {
    return selectedRequisitionItems.filter(
      (r) =>
        r.conversionStatus === 'CONVERTED_TO_RFQ' ||
        Boolean(r.convertedToRfqId) ||
        r.status === 'IN_RFQ'
    );
  }, [selectedRequisitionItems]);

  const pendingConversionItems = useMemo(() => {
    return selectedRequisitionItems.filter(
      (r) =>
        (!r.conversionStatus || r.conversionStatus === 'PENDING') &&
        !r.convertedToPoId &&
        !r.convertedToRfqId &&
        r.status !== 'PO_CREATED' &&
        r.status !== 'IN_RFQ'
    );
  }, [selectedRequisitionItems]);

  const allSelectedConvertedToPo =
    selectedRequisitionItems.length > 0 &&
    convertedToPoItems.length === selectedRequisitionItems.length;

  const allSelectedConvertedToRfq =
    selectedRequisitionItems.length > 0 &&
    convertedToRfqItems.length === selectedRequisitionItems.length;

  const hasMixedSelection =
    selectedRequisitionItems.length > 0 &&
    !allSelectedConvertedToPo &&
    !allSelectedConvertedToRfq &&
    pendingConversionItems.length > 0 &&
    (convertedToPoItems.length > 0 || convertedToRfqItems.length > 0);

  const isOwnPr = useCallback(
    (pr: ListPurchaseRequisition) => {
      const currentUserId = user?.id || (user as any)?._id;
      const currentUserEmail = (user?.email || '').toLowerCase().trim();
      const currentUserName = (user?.fullName || user?.username || '').toLowerCase().trim();

      return Boolean(
        (pr.requesterId && String(pr.requesterId) === String(currentUserId)) ||
        (pr.requesterEmail && pr.requesterEmail.toLowerCase().trim() === currentUserEmail) ||
        (pr.requesterName && currentUserName && pr.requesterName.toLowerCase().trim() === currentUserName)
      );
    },
    [user]
  );

  const hasOwnRequisitionSelected = useMemo(() => {
    return selectedRequisitionItems.some((r) => isOwnPr(r));
  }, [selectedRequisitionItems, isOwnPr]);

  // Conversion Authority Check: Requesters cannot self-convert PRs; only assigned purchase user or Admin can convert
  const canConvertSelected = useMemo(() => {
    const itemsToCheck = pendingConversionItems.length > 0
      ? pendingConversionItems
      : selectedRequisitionItems.filter(
          (r) =>
            r.conversionStatus !== 'CONVERTED_TO_PO' &&
            !r.convertedToPoId &&
            r.status !== 'PO_CREATED'
        );
    if (itemsToCheck.length === 0) return false;

    // Separation of Duties: Requester cannot convert their own PR unless Super Admin
    if (!isAdmin && itemsToCheck.some((r) => isOwnPr(r))) {
      return false;
    }

    if (
      isAdmin ||
      hasPermission('Purchase Requisitions', 'canApprove') ||
      hasPermission('PO Creation', 'canApprove') ||
      hasPermission('Purchase Orders', 'canApprove') ||
      hasPermission('PO Creation', 'canCreate') ||
      hasPermission('Purchase Orders', 'canCreate')
    ) {
      return true;
    }
    const currentUserId = user?.id || (user as any)?._id;
    return itemsToCheck.every(
      (r) => r.submittedToUserId && String(r.submittedToUserId) === String(currentUserId)
    );
  }, [pendingConversionItems, selectedRequisitionItems, isAdmin, hasPermission, user, isOwnPr]);

  const canApproveForRfq = useMemo(() => {
    return (
      isAdmin ||
      hasPermission('Purchase Requisitions', 'canApprove') ||
      hasPermission('RFQ Management', 'canApprove')
    );
  }, [isAdmin, hasPermission]);

  const canConvertPrToRfq = useCallback(
    (pr: ListPurchaseRequisition) => {
      const isRfq = pr.conversionStatus === 'CONVERTED_TO_RFQ' || Boolean(pr.convertedToRfqId) || pr.status === 'IN_RFQ';
      const isPo = pr.conversionStatus === 'CONVERTED_TO_PO' || Boolean(pr.convertedToPoId) || pr.status === 'PO_CREATED';
      if (isRfq || isPo) return false;

      // Separation of Duties: Requester cannot convert their own PR unless Super Admin
      if (!isAdmin && isOwnPr(pr)) return false;

      return canApproveForRfq;
    },
    [isAdmin, isOwnPr, canApproveForRfq]
  );

  const canConvertPr = useCallback(
    (pr: ListPurchaseRequisition) => {
      const isRfq = pr.conversionStatus === 'CONVERTED_TO_RFQ' || Boolean(pr.convertedToRfqId) || pr.status === 'IN_RFQ';
      const isPo = pr.conversionStatus === 'CONVERTED_TO_PO' || Boolean(pr.convertedToPoId) || pr.status === 'PO_CREATED';
      if (isRfq || isPo) return false;

      // Separation of Duties: Requester cannot convert their own PR unless Super Admin
      if (!isAdmin && isOwnPr(pr)) return false;

      if (
        isAdmin ||
        hasPermission('Purchase Requisitions', 'canApprove') ||
        hasPermission('PO Creation', 'canApprove') ||
        hasPermission('Purchase Orders', 'canApprove') ||
        hasPermission('PO Creation', 'canCreate') ||
        hasPermission('Purchase Orders', 'canCreate')
      ) {
        return true;
      }
      const currentUserId = user?.id || (user as any)?._id;
      return Boolean(pr.submittedToUserId && String(pr.submittedToUserId) === String(currentUserId));
    },
    [isAdmin, isOwnPr, hasPermission, user]
  );

  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedDept, viewScopeTab, selectedConversion, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequisitions.length / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filteredRequisitions.slice((safePage - 1) * perPage, safePage * perPage);

  // Batch Selection
  const isAllSelected = useMemo(() => {
    if (paginated.length === 0) return false;
    return paginated.every((p) => selectedPrIds.includes(String(p.id || p.rfqId)));
  }, [paginated, selectedPrIds]);

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const pageIds = new Set(paginated.map((p) => String(p.id || p.rfqId)));
      setSelectedPrIds((prev) => prev.filter((id) => !pageIds.has(id)));
    } else {
      const newIds = paginated.map((p) => String(p.id || p.rfqId));
      setSelectedPrIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedPrIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Conversion Handlers — Navigate directly to RFQ / PO creation pages with pre-filled data
  const handleNavigateToCreateRfq = () => {
    const targetItems = pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems;
    if (targetItems.length === 0) return;
    const defaultTitle = `Consolidated RFQ for Requisitions: ${targetItems
      .map((r) => r.prNumber || r.id?.slice(-6))
      .filter(Boolean)
      .join(', ')}`;
    const rfqDepartment = targetItems[0]?.department || '';

    // Automatically fetch Description from selected PRs (leave blank if none)
    const prDescriptions = targetItems
      .map((r) => (r.description || r.internalNotes || r.specialInstructions || (r as any).justification || '').trim())
      .filter(Boolean);
    const resolvedDescription = prDescriptions.length > 0 ? Array.from(new Set(prDescriptions)).join('\n\n') : '';

    // Automatically fetch Date from selected PRs (deliveryDate, poDate, or createdAt)
    const prDate = targetItems.find((r) => r.deliveryDate)?.deliveryDate || targetItems[0]?.deliveryDate || targetItems[0]?.poDate || targetItems[0]?.createdAt;
    const resolvedDate = prDate ? new Date(prDate).toISOString().slice(0, 10) : '';

    const firstPriority = targetItems[0]?.priority ? (
      targetItems[0].priority === 'LOW' ? 'Low' :
      targetItems[0].priority === 'URGENT' || targetItems[0].priority === 'HIGH' ? 'High' : 'Medium'
    ) : undefined;

    const rawItems: any[] = [];
    targetItems.forEach((pr) => {
      const pItems = Array.isArray(pr.items) ? pr.items : [];
      const itemDate = pr.deliveryDate ? new Date(pr.deliveryDate).toISOString().slice(0, 10) : resolvedDate;
      pItems.forEach((it) => {
        rawItems.push({
          id: `item-${Date.now()}-${rawItems.length + 1}`,
          itemCode: it.itemCode || `ITEM-${String(rawItems.length + 1).padStart(3, '0')}`,
          itemName: it.itemName || it.description || 'Item',
          description: '',
          quantity: String(it.quantity || 1),
          unit: it.unit || 'pcs',
          expectedDate: it.expectedDate || itemDate || '',
        });
      });
    });

    const prefillData = {
      fromConsolidation: true,
      requisitionIds: targetItems.map((r) => String(r.id || r.rfqId)),
      prNumbers: targetItems.map((r) => r.prNumber || r.id).filter(Boolean),
      title: defaultTitle,
      department: rfqDepartment,
      description: '',
      closingDate: resolvedDate,
      date: resolvedDate,
      deliveryDate: resolvedDate,
      priority: firstPriority,
      items: rawItems,
    };

    try {
      sessionStorage.setItem('heliflow_consolidation_rfq', JSON.stringify(prefillData));
    } catch {}

    navigate('/rfq/create', { state: prefillData });
  };

  const handleNavigateToCreatePo = () => {
    const targetItems = pendingConversionItems.length > 0
      ? pendingConversionItems
      : selectedRequisitionItems.filter(
          (r) =>
            r.conversionStatus !== 'CONVERTED_TO_PO' &&
            !r.convertedToPoId &&
            r.status !== 'PO_CREATED'
        );
    if (targetItems.length === 0) return;
    const prNumbersString = targetItems
      .map((r) => r.prNumber || r.id)
      .filter(Boolean)
      .join(', ');
    const firstClass = (targetItems[0]?.items as any)?.[0]?.itemClass || 'General';

    const rawItems: any[] = [];
    targetItems.forEach((pr) => {
      const pItems = Array.isArray(pr.items) ? pr.items : [];
      pItems.forEach((it) => {
        rawItems.push({
          id: String(rawItems.length + 1),
          itemCode: it.itemCode || `ITEM-${String(rawItems.length + 1).padStart(3, '0')}`,
          itemName: it.itemName || it.description || 'Item',
          description: it.description?.trim() || '',
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'pcs',
          unitPrice: Number(it.unitPrice || it.estimatedPrice) || 0,
          taxPercent: 0,
        });
      });
    });

    const prefillData = {
      fromConsolidation: true,
      requisitionIds: targetItems.map((r) => String(r.id || r.rfqId)),
      prNumbers: prNumbersString,
      supplierType: firstClass,
      items: rawItems,
    };

    try {
      sessionStorage.setItem('heliflow_consolidation_po', JSON.stringify(prefillData));
    } catch {}

    const rfqId = targetItems.find((r) => r.convertedToRfqId)?.convertedToRfqId;
    const rfqParam = rfqId ? `?rfqId=${encodeURIComponent(rfqId)}` : '';
    navigate(`/procurement/create-purchase-order${rfqParam}`, { state: prefillData });
  };

  const handleCreateRfqForRequisition = (pr: ListPurchaseRequisition) => {
    const defaultTitle = `Consolidated RFQ for Requisitions: ${pr.prNumber || pr.id?.slice(-6) || ''}`;
    const rfqDepartment = pr.department || '';

    const prDate = pr.deliveryDate || pr.poDate || pr.createdAt;
    const resolvedDate = prDate ? new Date(prDate).toISOString().slice(0, 10) : '';

    const firstPriority = pr.priority ? (
      pr.priority === 'LOW' ? 'Low' :
      pr.priority === 'URGENT' || pr.priority === 'HIGH' ? 'High' : 'Medium'
    ) : undefined;

    const rawItems: any[] = [];
    const pItems = Array.isArray(pr.items) ? pr.items : [];
    const itemDate = pr.deliveryDate ? new Date(pr.deliveryDate).toISOString().slice(0, 10) : resolvedDate;
    pItems.forEach((it, idx) => {
      rawItems.push({
        id: `item-${Date.now()}-${idx + 1}`,
        itemCode: it.itemCode || `ITEM-${String(idx + 1).padStart(3, '0')}`,
        itemName: it.itemName || it.description || 'Item',
        description: '',
        quantity: String(it.quantity || 1),
        unit: it.unit || 'pcs',
        expectedDate: it.expectedDate || itemDate || '',
      });
    });

    const prefillData = {
      fromConsolidation: true,
      requisitionIds: [String(pr.id || pr.rfqId)],
      prNumbers: [pr.prNumber || pr.id].filter(Boolean),
      title: defaultTitle,
      department: rfqDepartment,
      description: '',
      closingDate: resolvedDate,
      date: resolvedDate,
      deliveryDate: resolvedDate,
      priority: firstPriority,
      items: rawItems,
    };

    try {
      sessionStorage.setItem('heliflow_consolidation_rfq', JSON.stringify(prefillData));
    } catch {}

    navigate('/rfq/create', { state: prefillData });
  };

  const handleCreatePoForRequisition = (pr: ListPurchaseRequisition) => {
    const pItems = Array.isArray(pr.items) ? pr.items : [];
    const rawItems: any[] = pItems.map((it: any, idx: number) => ({
      id: String(idx + 1),
      itemCode: it.itemCode || `ITEM-${String(idx + 1).padStart(3, '0')}`,
      itemName: it.itemName || it.description || 'Item',
      description: it.description?.trim() || '',
      quantity: Number(it.quantity) || 1,
      unit: it.unit || 'pcs',
      unitPrice: Number(it.unitPrice || it.estimatedPrice) || 0,
      taxPercent: 0,
    }));

    const prefillData = {
      fromConsolidation: true,
      requisitionIds: [String(pr.id || pr.rfqId)],
      prNumbers: pr.prNumber || pr.id || '',
      supplierType: (pr.items as any)?.[0]?.itemClass || 'General',
      items: rawItems,
    };

    try {
      sessionStorage.setItem('heliflow_consolidation_po', JSON.stringify(prefillData));
    } catch {}

    const rfqParam = pr.convertedToRfqId ? `?rfqId=${encodeURIComponent(pr.convertedToRfqId)}` : '';
    navigate(`/procurement/create-purchase-order${rfqParam}`, { state: prefillData });
  };

  // Auto-fetch Date and Description from selected PRs when RFQ modal opens
  useEffect(() => {
    if (showRfqModal) {
      const targetItems = pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems;
      if (targetItems.length > 0) {
        setRfqDescription('');

        const prDate = targetItems.find((r) => r.deliveryDate)?.deliveryDate || targetItems[0]?.deliveryDate || targetItems[0]?.poDate || targetItems[0]?.createdAt;
        if (prDate) {
          setRfqClosingDate(new Date(prDate).toISOString().slice(0, 10));
        }
      }
    }
  }, [showRfqModal, pendingConversionItems, selectedRequisitionItems]);

  const handleOpenRfqModal = () => {
    handleNavigateToCreateRfq();
  };

  const handleConfirmConvertToRfq = async () => {
    const targetItems = pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems;
    const idsToConvert = targetItems.map((r) => String(r.id || r.rfqId));
    if (idsToConvert.length === 0) return;
    setConvertingRfq(true);
    try {
      const res = await purchaseRequisitionService.convertToRFQ({
        requisitionIds: idsToConvert,
        title: rfqTitle,
        closingDate: rfqClosingDate,
        description: rfqDescription,
      });

      const rfqNumber = res.rfqNumber || res.rfq?.rfqNumber || 'New RFQ';
      const rfqId = res.rfq?.id;

      setToast({
        message: `Successfully floated RFQ #${rfqNumber} from ${idsToConvert.length} requisition(s)!`,
        type: 'success',
        link: rfqId ? { text: `View RFQ #${rfqNumber}`, url: `/rfq/${rfqId}` } : undefined,
      });

      setSelectedPrIds([]);
      setShowRfqModal(false);
      await fetchRequisitions();
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to convert requisitions to RFQ.', type: 'error' });
    } finally {
      setConvertingRfq(false);
    }
  };

  const handleConfirmConvertToPo = async () => {
    const targetItems = pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems;
    const idsToConvert = targetItems.map((r) => String(r.id || r.rfqId));
    if (idsToConvert.length === 0) return;
    setConvertingPo(true);
    try {
      const res = await purchaseRequisitionService.convertToDirectPO({
        requisitionIds: idsToConvert,
      });

      const poNumber = res.poNumber || res.po?.poNumber || 'New Direct PO';
      const poId = res.po?.id;

      setToast({
        message: `Successfully created Direct Purchase Order #${poNumber} from ${idsToConvert.length} requisition(s)!`,
        type: 'success',
        link: poId ? { text: `Open PO #${poNumber}`, url: `/procurement/create-purchase-order?id=${poId}` } : undefined,
      });

      setSelectedPrIds([]);
      setShowPoModal(false);
      await fetchRequisitions();
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to convert requisitions to Direct PO.', type: 'error' });
    } finally {
      setConvertingPo(false);
    }
  };

  const handleBatchDeleteConfirm = async () => {
    if (selectedPrIds.length === 0) return;
    setBatchDeleting(true);
    try {
      for (const id of selectedPrIds) {
        await purchaseRequisitionService.delete(id).catch(() => {});
      }
      setToast({ message: `Successfully deleted ${selectedPrIds.length} requisition(s).`, type: 'success' });
      setSelectedPrIds([]);
      setShowBatchDeleteModal(false);
      await fetchRequisitions();
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to delete selected items.', type: 'error' });
    } finally {
      setBatchDeleting(false);
    }
  };

  // Metrics based on user's scoped requisitions
  const pendingRoutingCount = useMemo(
    () =>
      baseRequisitionsForUser.filter(
        (r) => !r.conversionStatus || r.conversionStatus === 'PENDING'
      ).length,
    [baseRequisitionsForUser]
  );

  const convertedToRfqCount = useMemo(
    () => baseRequisitionsForUser.filter((r) => r.conversionStatus === 'CONVERTED_TO_RFQ').length,
    [baseRequisitionsForUser]
  );

  const convertedToPoCount = useMemo(
    () => baseRequisitionsForUser.filter((r) => r.conversionStatus === 'CONVERTED_TO_PO').length,
    [baseRequisitionsForUser]
  );

  const totalValue = useMemo(
    () =>
      baseRequisitionsForUser.reduce((acc, r) => {
        const amt = Number(r.grandTotal || r.totalAmount || 0);
        const fromCurr = r.currency || companyDefaultCurrency;
        return acc + (convert ? convert(amt, fromCurr, companyDefaultCurrency) : amt);
      }, 0),
    [baseRequisitionsForUser, convert, companyDefaultCurrency]
  );

  const visibleColumns = useMemo(
    () => columnOrder.map((k) => ALL_COLUMNS.find((c) => c.key === k)!).filter((c) => c && visibleKeys.has(c.key)),
    [columnOrder, visibleKeys]
  );

  const handleRowClick = (requisition: ListPurchaseRequisition) => {
    if (requisition.prNumber) {
      setViewingPr(requisition);
      return;
    }

    if (isStandaloneDocument(requisition)) {
      const documentId = requisition.convertedToPoId || requisition.id || requisition.rfqId || requisition.poNumber;
      navigate(`/procurement/create-purchase-order?id=${encodeURIComponent(documentId)}&mode=view`);
      return;
    }

    navigate(`/procurement/purchase-requisition/${encodeURIComponent(requisition.rfqId || requisition.id || requisition.poNumber)}?mode=view`, {
      state: { readOnly: true },
    });
  };

  if (loading) {
    return (
      <PageFrame>
        <div className="flex min-h-[52vh] items-center justify-center gap-3 text-sm text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          Loading purchase requisitions…
        </div>
      </PageFrame>
    );
  }

  if (error) {
    return (
      <PageFrame>
        <EmptyState
          icon={AlertTriangle}
          title="Purchase requisitions could not be loaded"
          description={error}
          action={<Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>}
        />
      </PageFrame>
    );
  }

  const metricClass = 'cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/55';

  return (
    <PageFrame>
      {toast && (
        <div className="mb-5">
          <MessageStrip type={toast.type} compact autoHideMs={6000} onClose={() => setToast(null)}>
            <div className="flex items-center justify-between gap-4 w-full">
              <span>{toast.message}</span>
              {toast.link && (
                <button
                  type="button"
                  onClick={() => navigate(toast.link!.url)}
                  className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  {toast.link.text} <ExternalLink className="size-3.5" />
                </button>
              )}
            </div>
          </MessageStrip>
        </div>
      )}

      {/* Page Header */}
      <PageLead
        title="Purchase Requisitions"
        description="Departmental requisitions prior to RFQ or Direct PO creation. Single or multi-user requests routed directly to purchase."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate('/procurement/purchase-requisitions/merge')}
              className="gap-1.5 shadow-xs border-primary/40 text-primary hover:bg-primary/5 font-semibold"
              title="Merge and consolidate multiple requisitions by User or by Item"
            >
              <GitMerge className="size-4" /> Merge Requisitions
            </Button>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="gap-1.5 shadow-sm"
              title="Raise a new item purchase requisition"
            >
              <Plus className="size-4" /> New Requisition
            </Button>
          </div>
        }
      />

      {/* Metric Cards matching Requisition lifecycle */}
      {baseRequisitionsForUser.length > 0 && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            role="button"
            tabIndex={0}
            aria-pressed={selectedConversion === 'All' && statusFilter === null}
            className={cn(metricClass, selectedConversion === 'All' && statusFilter === null && 'border-primary/40 bg-primary/[0.035]')}
            onClick={() => { setSelectedConversion('All'); setStatusFilter(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedConversion('All'); setStatusFilter(null); } }}
            icon={FileText}
            label="Total Requisitions"
            value={baseRequisitionsForUser.length}
            detail="Across all departments"
          />
          <MetricCard
            role="button"
            tabIndex={0}
            aria-pressed={selectedConversion === 'PENDING'}
            className={cn(metricClass, selectedConversion === 'PENDING' && 'border-amber-500/40 bg-amber-500/[0.035]')}
            onClick={() => setSelectedConversion((cur) => cur === 'PENDING' ? 'All' : 'PENDING')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedConversion((cur) => cur === 'PENDING' ? 'All' : 'PENDING'); }}
            icon={Clock3}
            label="Pending Routing"
            value={pendingRoutingCount}
            detail="Awaiting RFQ or PO creation"
            tone="warning"
          />
          <MetricCard
            role="button"
            tabIndex={0}
            aria-pressed={selectedConversion === 'CONVERTED_TO_RFQ'}
            className={cn(metricClass, selectedConversion === 'CONVERTED_TO_RFQ' && 'border-emerald-500/40 bg-emerald-500/[0.035]')}
            onClick={() => setSelectedConversion((cur) => cur === 'CONVERTED_TO_RFQ' ? 'All' : 'CONVERTED_TO_RFQ')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedConversion((cur) => cur === 'CONVERTED_TO_RFQ' ? 'All' : 'CONVERTED_TO_RFQ'); }}
            icon={Send}
            label="Converted to RFQ"
            value={convertedToRfqCount}
            detail="Bidding / Quote floated"
            tone="success"
          />
          <MetricCard
            role="button"
            tabIndex={0}
            aria-pressed={selectedConversion === 'CONVERTED_TO_PO'}
            className={cn(metricClass, selectedConversion === 'CONVERTED_TO_PO' && 'border-indigo-500/40 bg-indigo-500/[0.035]')}
            onClick={() => setSelectedConversion((cur) => cur === 'CONVERTED_TO_PO' ? 'All' : 'CONVERTED_TO_PO')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedConversion((cur) => cur === 'CONVERTED_TO_PO' ? 'All' : 'CONVERTED_TO_PO'); }}
            icon={ShoppingCart}
            label="Converted to Direct PO"
            value={convertedToPoCount}
            detail="Purchase order created"
            tone="violet"
          />
        </div>
      )}

      {/* Requisitions Action Banner (Workbench for Purchase Team) */}
      {selectedPrIds.length > 0 && (
        <div
          className={cn(
            "mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm animate-in fade-in",
            allSelectedConvertedToPo
              ? "border-indigo-500/40 bg-indigo-500/[0.08]"
              : allSelectedConvertedToRfq
              ? "border-emerald-500/40 bg-emerald-500/[0.08]"
              : hasMixedSelection
              ? "border-amber-500/40 bg-amber-500/[0.08]"
              : "border-primary/40 bg-primary/[0.06]"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "grid size-9 place-items-center rounded-lg shadow-xs",
                allSelectedConvertedToPo
                  ? "bg-indigo-600 text-white"
                  : allSelectedConvertedToRfq
                  ? "bg-emerald-600 text-white"
                  : hasMixedSelection
                  ? "bg-amber-600 text-white"
                  : "bg-primary text-primary-foreground"
              )}
            >
              {allSelectedConvertedToPo ? (
                <ShoppingCart className="size-5" />
              ) : allSelectedConvertedToRfq ? (
                <Send className="size-5" />
              ) : hasMixedSelection ? (
                <AlertTriangle className="size-5" />
              ) : (
                <CheckSquare className="size-5" />
              )}
            </div>
            <div>
              <div className="text-sm font-bold text-foreground flex items-center gap-2">
                {allSelectedConvertedToPo ? (
                  <>
                    <span>
                      {selectedRequisitionItems.length === 1
                        ? `Purchase Order Already Created (${selectedRequisitionItems[0].poNumber || 'PO Generated'})`
                        : `${selectedRequisitionItems.length} Requisitions Selected (All Have PO Created)`}
                    </span>
                    <Badge className="bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30 text-[11px]">
                      PO CREATED
                    </Badge>
                  </>
                ) : allSelectedConvertedToRfq ? (
                  <>
                    <span>
                      {selectedRequisitionItems.length === 1
                        ? `RFQ Floated for ${selectedRequisitionItems[0].prNumber || 'Requisition'}`
                        : `${selectedRequisitionItems.length} Requisitions Selected (In RFQ)`}
                    </span>
                    <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[11px]">
                      IN RFQ
                    </Badge>
                  </>
                ) : hasMixedSelection ? (
                  <span>
                    {selectedPrIds.length} Requisitions Selected ({pendingConversionItems.length} Pending, {convertedToPoItems.length + convertedToRfqItems.length} Already Converted)
                  </span>
                ) : selectedPrIds.length === 1 ? (
                  '1 Requisition Selected (Single Item Conversion)'
                ) : (
                  `${selectedPrIds.length} Requisitions Selected (Multi-Requisition Consolidation)`
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {allSelectedConvertedToPo ? (
                  selectedRequisitionItems.length === 1 ? (
                    <span>
                      A Purchase Order (<strong>{selectedRequisitionItems[0].poNumber || 'Created'}</strong>) has already been generated for this requisition. Conversion to Direct PO or RFQ is disabled.
                    </span>
                  ) : (
                    <span>
                      Purchase Orders have already been generated for all {selectedRequisitionItems.length} selected requisitions. Re-converting is not permitted.
                    </span>
                  )
                ) : allSelectedConvertedToRfq ? (
                  <span>
                    Active RFQ floated. You can review the RFQ or proceed to generate a Purchase Order.
                  </span>
                ) : hasMixedSelection ? (
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    ⚠️ {convertedToPoItems.length + convertedToRfqItems.length} of {selectedPrIds.length} requisition(s) already have PO/RFQ created. Only the {pendingConversionItems.length} pending requisition(s) will be converted.
                  </span>
                ) : selectedPrIds.length === 1 ? (
                  'Convert this individual requisition into a Direct PO or float an RFQ.'
                ) : (
                  'Consolidate multiple user requisitions for these items into a single Direct PO or float an RFQ.'
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allSelectedConvertedToPo ? (
              <>
                {selectedRequisitionItems.length === 1 && (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-xs"
                    onClick={() => {
                      const item = selectedRequisitionItems[0];
                      const docId = item.convertedToPoId || item.poNumber;
                      if (docId) navigate(`/procurement/create-purchase-order?id=${encodeURIComponent(docId)}`);
                    }}
                  >
                    <ShoppingCart className="size-4" /> Open Purchase Order ({selectedRequisitionItems[0].poNumber || 'View PO'}) <ExternalLink className="size-3.5 ml-0.5" />
                  </Button>
                )}
                {selectedRequisitionItems.length === 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-border/80"
                    onClick={() => setViewingPr(selectedRequisitionItems[0])}
                  >
                    <Eye className="size-4" /> View PR Details
                  </Button>
                )}
              </>
            ) : allSelectedConvertedToRfq ? (
              <>
                {selectedRequisitionItems.length === 1 && selectedRequisitionItems[0].convertedToRfqId && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={loadingRfqId === selectedRequisitionItems[0].convertedToRfqId}
                    className="gap-1.5 border-emerald-600/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-semibold"
                    onClick={() => handleOpenRfqView(selectedRequisitionItems[0].convertedToRfqId!)}
                  >
                    {loadingRfqId === selectedRequisitionItems[0].convertedToRfqId ? (
                      <Loader2 className="size-4 animate-spin text-emerald-600" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    View RFQ <ExternalLink className="size-3.5 ml-0.5" />
                  </Button>
                )}
                {selectedRequisitionItems.length === 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-border/80"
                    onClick={() => setViewingPr(selectedRequisitionItems[0])}
                  >
                    <Eye className="size-4" /> View PR Details
                  </Button>
                )}
              </>
            ) : canConvertSelected ? (
              <>
                {/* Option 2: RFQ float kiya jayega */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-emerald-600/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-semibold"
                  onClick={handleNavigateToCreateRfq}
                >
                  <Send className="size-4 text-emerald-600" />
                  {hasMixedSelection ? `Float RFQ (${pendingConversionItems.length})` : 'Float RFQ'}
                </Button>

                {/* Option 1: Direct PO */}
                <Button
                  size="sm"
                  className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                  onClick={handleNavigateToCreatePo}
                >
                  <ShoppingCart className="size-4" />
                  {hasMixedSelection ? `Direct PO (${pendingConversionItems.length})` : 'Direct PO'}
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-medium">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>
                  {hasOwnRequisitionSelected
                    ? `Separation of Duties: You are the requester of ${selectedRequisitionItems.filter(isOwnPr).map((r) => r.prNumber || 'PR').join(', ')}. A requester cannot convert their own requisition to a PO or RFQ. Routed to assigned purchase user (${Array.from(new Set(selectedRequisitionItems.map((r) => r.submittedToName).filter(Boolean))).join(', ') || 'Purchase Team'}).`
                    : `Authority Required: Only the assigned purchase user (${Array.from(new Set(selectedRequisitionItems.map((r) => r.submittedToName).filter(Boolean))).join(', ') || 'Assigned User'}) or Administrator can convert to PO / RFQ.`
                  }
                </span>
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={() => setSelectedPrIds([])}>
              Cancel
            </Button>

            {canCreateRequisition && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setShowBatchDeleteModal(true)}
              >
                <Trash2 className="size-4" /> Delete ({selectedPrIds.length})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      {baseRequisitionsForUser.length > 0 && (
        <div className="mb-5 space-y-3">
          {/* Department Pills matching whiteboard: Ops (D1), Sales (D2), Dev (D3), Test (D4) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <Building className="size-3.5" /> Dept:
              </span>
              {departmentFilterOptions.map((dept) => (
                <button
                  key={dept}
                  type="button"
                  onClick={() => setSelectedDept(dept)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full transition-all',
                    selectedDept === dept
                      ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                      : 'bg-muted/40 hover:bg-muted text-muted-foreground'
                  )}
                >
                  {dept}
                </button>
              ))}
            </div>

            {/* View Scope Selector: All vs Assigned to Me vs My Requests */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <Users className="size-3.5" /> View:
              </span>
              {(isAdmin || canApprovePR) && (
                <button
                  type="button"
                  onClick={() => setViewScopeTab('ALL')}
                  className={cn(
                    'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                    viewScopeTab === 'ALL'
                      ? 'bg-secondary text-secondary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  All Requisitions
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewScopeTab('ASSIGNED_TO_ME')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1',
                  viewScopeTab === 'ASSIGNED_TO_ME'
                    ? 'bg-secondary text-secondary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <UserCheck className="size-3 text-emerald-600" /> Assigned to Me
              </button>
              <button
                type="button"
                onClick={() => setViewScopeTab('MY_REQUESTS')}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1',
                  viewScopeTab === 'MY_REQUESTS'
                    ? 'bg-secondary text-secondary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <User className="size-3 text-primary" /> My Requests
              </button>
            </div>
          </div>

          {/* Search & Routing Status Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-xl">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 rounded-xl pl-10 pr-10 text-sm"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search PR#, requester, department, items, or vendor..."
                aria-label="Search purchase requisitions"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
              <div className="relative min-w-[155px]">
                <Clock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <select
                  className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-9 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                  value={priorityFilter}
                  onChange={(e) => {
                    setPriorityFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Filter by priority"
                >
                  <option value="All">All Priorities</option>
                  <option value="URGENT">Urgent</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div className="relative min-w-[190px]">
                <Filter size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <select
                  className="h-11 w-full appearance-none rounded-xl border border-input bg-card pl-10 pr-9 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                  value={selectedConversion}
                  onChange={(e) => {
                    setSelectedConversion(e.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Filter by conversion status"
                >
                  <option value="All">All Routing States</option>
                  <option value="PENDING">Pending Routing</option>
                  <option value="CONVERTED_TO_RFQ">Converted to RFQ</option>
                  <option value="CONVERTED_TO_PO">Converted to Direct PO</option>
                </select>
              </div>

              {(selectedDept !== 'All' || viewScopeTab !== 'ALL' || selectedConversion !== 'All' || priorityFilter !== 'All' || searchTerm || statusFilter) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedDept('All');
                    setViewScopeTab((isAdmin || canApprovePR) ? 'ALL' : 'MY_REQUESTS');
                    setSelectedConversion('All');
                    setPriorityFilter('All');
                    setStatusFilter(null);
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="h-11 rounded-xl px-3.5 text-sm"
                >
                  Reset filters
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Table or Empty State */}
      {baseRequisitionsForUser.length === 0 ? (
        <EmptyState
          className="mt-5"
          icon={FileText}
          title="No purchase requisitions yet"
          description="Create your first departmental item requisition to kickstart your procurement flow."
          action={
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus /> Create Requisition
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          {filteredRequisitions.length === 0 ? (
            <EmptyState
              className="m-4 min-h-64 border-0 shadow-none"
              icon={Search}
              title="No matching requisitions"
              description="Try adjusting your department, view, or routing status filters."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedDept('All');
                    setViewScopeTab('ALL');
                    setSelectedConversion('All');
                    setSearchTerm('');
                    setStatusFilter(null);
                  }}
                >
                  <X /> Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border/70 bg-muted/35 text-left text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                      <th className="w-11 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          disabled={!canCreateRequisition}
                          onChange={canCreateRequisition ? handleToggleSelectAll : undefined}
                          className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                        />
                      </th>
                      {visibleColumns.map((col) => (
                        <th
                          key={col.key}
                          className={cn('px-4 py-3', col.key === 'grandTotal' && 'text-right')}
                        >
                          {col.label}
                        </th>
                      ))}
                      <th className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span>Actions</span>
                          <div className="relative">
                            <ColumnSettingsButton ref={colBtnRef} open={showColPanel} onClick={() => setShowColPanel((v) => !v)} />

                            {showColPanel && (
                              <ColumnCustomizer
                                columnOrder={columnOrder}
                                visibleKeys={visibleKeys}
                                allColumns={ALL_COLUMNS}
                                onToggle={(key) => {
                                  setVisibleKeys((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    return next;
                                  });
                                }}
                                onReorder={setColumnOrder}
                                onReset={() => {
                                  setColumnOrder(defaultOrder);
                                  setVisibleKeys(new Set(defaultVisible));
                                }}
                                onClose={() => setShowColPanel(false)}
                                anchorRef={colBtnRef}
                              />
                            )}
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((requisition) => {
                      const idStr = String(requisition.id || requisition.rfqId);
                      const isSelected = selectedPrIds.includes(idStr);
                      const itemsList = Array.isArray(requisition.items) ? (requisition.items as any[]) : [];
                      const primaryItem = itemsList[0]?.itemName || itemsList[0]?.description || 'Items';
                      const itemsCount = itemsList.length;
                      const pStyles = getPriorityStyles(requisition.priority);
                      const isPoDone =
                        requisition.conversionStatus === 'CONVERTED_TO_PO' ||
                        Boolean(requisition.convertedToPoId) ||
                        (requisition.status === 'PO_CREATED' && Boolean(requisition.poNumber));
                      const isRfqDone =
                        requisition.conversionStatus === 'CONVERTED_TO_RFQ' ||
                        Boolean(requisition.convertedToRfqId) ||
                        requisition.status === 'IN_RFQ';

                      return (
                        <tr
                          key={idStr}
                          className={cn(
                            'group cursor-pointer border-b border-border/55 transition-colors last:border-0 hover:bg-accent/35',
                            pStyles.borderLeft,
                            isSelected && 'bg-primary/[0.04]'
                          )}
                          onClick={() => handleRowClick(requisition)}
                        >
                          <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!canCreateRequisition}
                              onChange={() => canCreateRequisition && handleToggleSelect(idStr)}
                              title={
                                requisition.conversionStatus === 'CONVERTED_TO_PO' || requisition.status === 'PO_CREATED'
                                  ? `PO already created (${requisition.poNumber || ''})`
                                  : requisition.conversionStatus === 'CONVERTED_TO_RFQ' || requisition.status === 'IN_RFQ'
                                  ? 'Already converted to RFQ'
                                  : undefined
                              }
                              className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                            />
                          </td>

                          {visibleColumns.map((col) => {

                            if (col.key === 'priority') {
                              return (
                                <td key="priority" className="px-4 py-4 whitespace-nowrap">
                                  <PriorityBadge priority={requisition.priority} size="md" />
                                </td>
                              );
                            }

                            if (col.key === 'prNumber') {
                              return (
                                <td key="prNumber" className="px-4 py-4 font-semibold text-primary">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                      <span>{requisition.prNumber || requisition.poNumber || 'PR Pending'}</span>
                                    </div>
                                    {isPoDone && (
                                      <div className="flex items-center gap-1">
                                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
                                          <ShoppingCart className="size-2.5" />
                                          {requisition.poNumber ? `PO: ${requisition.poNumber}` : 'PO Created'}
                                        </span>
                                      </div>
                                    )}
                                    {isRfqDone && (
                                      <div className="flex items-center gap-1">
                                        <span
                                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25 cursor-pointer hover:bg-emerald-500/20"
                                          onClick={(e) => {
                                            if (requisition.convertedToRfqId) {
                                              e.stopPropagation();
                                              handleOpenRfqView(requisition.convertedToRfqId);
                                            }
                                          }}
                                          title="Click to view RFQ"
                                        >
                                          {loadingRfqId === requisition.convertedToRfqId ? (
                                            <Loader2 className="size-2.5 animate-spin" />
                                          ) : (
                                            <Send className="size-2.5" />
                                          )}
                                          In RFQ
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            }
                            if (col.key === 'department') {
                              const dept = requisition.department || 'Dev';
                              return (
                                <td key="department" className="px-4 py-4">
                                  <Badge variant="outline" className="text-xs font-medium bg-muted/40">
                                    {dept}
                                  </Badge>
                                </td>
                              );
                            }
                            if (col.key === 'submittedToName') {
                              return (
                                <td key="submittedToName" className="px-4 py-4">
                                  {requisition.submittedToName ? (
                                    <Badge variant="outline" className="gap-1 text-xs font-medium border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                                      <UserCheck className="size-3.5 text-emerald-600" /> {requisition.submittedToName}
                                    </Badge>
                                  ) : (
                                    <span className="text-sm text-muted-foreground italic">Unassigned</span>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === 'requesterName') {
                              return (
                                <td key="requesterName" className="px-4 py-4 font-medium text-foreground">
                                  {requisition.requesterName || requisition.requisitioner || 'Requester'}
                                </td>
                              );
                            }
                            if (col.key === 'items') {
                              return (
                                <td key="items" className="max-w-[220px] truncate px-4 py-4 text-muted-foreground" title={primaryItem}>
                                  <span className="font-medium text-foreground">{primaryItem}</span>
                                  {itemsCount > 1 && (
                                    <span className="ml-1 text-xs text-muted-foreground">+{itemsCount - 1} more</span>
                                  )}
                                </td>
                              );
                            }
                            if (col.key === 'conversionStatus') {
                              if (isPoDone) {
                                const docId = requisition.convertedToPoId || requisition.poNumber;
                                return (
                                  <td key="conversionStatus" className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isRfqDone && (
                                        <Badge
                                          className="cursor-pointer gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-semibold px-2 py-0.5"
                                          onClick={() => requisition.convertedToRfqId && handleOpenRfqView(requisition.convertedToRfqId)}
                                          title="View linked RFQ"
                                        >
                                          {loadingRfqId === requisition.convertedToRfqId ? (
                                            <Loader2 className="size-3 animate-spin" />
                                          ) : (
                                            <Send className="size-3" />
                                          )}
                                          RFQ <ExternalLink className="size-2.5 ml-0.5 opacity-70" />
                                        </Badge>
                                      )}
                                      <Badge
                                        className="cursor-pointer gap-1.5 bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 text-xs font-semibold px-2.5 py-1"
                                        onClick={() => docId && navigate(`/procurement/create-purchase-order?id=${encodeURIComponent(docId)}`)}
                                        title={`Purchase Order ${requisition.poNumber || ''} created. Click to open PO.`}
                                      >
                                        <ShoppingCart className="size-3.5 text-indigo-500" />
                                        <span>{requisition.poNumber ? `PO: ${requisition.poNumber}` : 'PO Created'}</span>
                                        <ExternalLink className="size-3 ml-0.5 opacity-70" />
                                      </Badge>
                                    </div>
                                  </td>
                                );
                              }
                              if (isRfqDone) {
                                return (
                                  <td key="conversionStatus" className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <Badge
                                        className="cursor-pointer gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 text-xs font-semibold px-2.5 py-1"
                                        onClick={() => requisition.convertedToRfqId && handleOpenRfqView(requisition.convertedToRfqId)}
                                        title="Requisition converted to RFQ. Click to view RFQ."
                                      >
                                        {loadingRfqId === requisition.convertedToRfqId ? (
                                          <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                          <Send className="size-3.5" />
                                        )}
                                        In RFQ <ExternalLink className="size-3 ml-0.5 opacity-70" />
                                      </Badge>
                                    </div>
                                  </td>
                                );
                              }
                              return (
                                <td key="conversionStatus" className="px-4 py-4">
                                  <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400 text-xs">
                                    <Clock3 className="size-3.5" /> Pending Routing
                                  </Badge>
                                </td>
                              );
                            }
                            if (col.key === 'poDate') {
                              return <td key="poDate" className="px-4 py-4 text-muted-foreground">{formatDate(requisition.poDate || requisition.createdAt)}</td>;
                            }
                            if (col.key === 'grandTotal') {
                              const resolvedAmount =
                                Number(requisition.grandTotal || requisition.totalAmount || 0) ||
                                (itemsList.length > 0
                                  ? itemsList.reduce((s: number, it: any) => s + (Number(it.total || it.totalPrice || (Number(it.quantity || 1) * Number(it.unitPrice || it.estimatedPrice || 0))) || 0), 0)
                                  : 0);
                              return (
                                <td key="grandTotal" className="px-4 py-4 text-right font-semibold tabular-nums">
                                  {formatAmount(resolvedAmount, requisition.currency || companyDefaultCurrency)}
                                </td>
                              );
                            }
                            if (col.key === 'status') {
                              return (
                                <td key="status" className="px-4 py-4">
                                  <Badge tone={getStatusTone(requisition.status)}>
                                    {getStatusLabel(requisition.status)}
                                  </Badge>
                                </td>
                              );
                            }
                            return <td key={col.key} className="px-4 py-4">-</td>;
                          })}

                          <td className="px-5 py-4 text-center" onClick={(event) => event.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => handleRowClick(requisition)}
                                title="View Details"
                              >
                                <Eye className="size-4" />
                              </Button>

                              {!isRfqDone && !isPoDone && canConvertPrToRfq(requisition) && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400"
                                  onClick={() => handleCreateRfqForRequisition(requisition)}
                                  title="Create RFQ from Requisition"
                                >
                                  <Send className="size-4" />
                                </Button>
                              )}

                              {!isRfqDone && !isPoDone && canConvertPr(requisition) && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-indigo-600 hover:bg-indigo-500/10 hover:text-indigo-700 dark:text-indigo-400"
                                  onClick={() => handleCreatePoForRequisition(requisition)}
                                  title="Create Direct Purchase Order"
                                >
                                  <ShoppingCart className="size-4" />
                                </Button>
                              )}

                              {isPOEditable(requisition.status) && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={!canCreateRequisition}
                                  onClick={() => handleRowClick(requisition)}
                                  title="Edit requisition"
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon-sm"
                                disabled={!canCreateRequisition}
                                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => canCreateRequisition && setDeleteTarget(requisition)}
                                title="Delete requisition"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile View */}
              <div className="divide-y divide-border/65 lg:hidden">
                {paginated.map((requisition) => {
                  const itemsList = Array.isArray(requisition.items) ? (requisition.items as any[]) : [];
                  const primaryItem = itemsList[0]?.itemName || itemsList[0]?.description || 'Requisition items';
                  const isPoDone =
                    requisition.conversionStatus === 'CONVERTED_TO_PO' ||
                    Boolean(requisition.convertedToPoId) ||
                    (requisition.status === 'PO_CREATED' && Boolean(requisition.poNumber));
                  const isRfqDone =
                    requisition.conversionStatus === 'CONVERTED_TO_RFQ' ||
                    Boolean(requisition.convertedToRfqId) ||
                    requisition.status === 'IN_RFQ';

                  return (
                    <article key={requisition.id || requisition.rfqId} className="p-4 sm:p-5">
                      <button type="button" className="w-full text-left" onClick={() => handleRowClick(requisition)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-primary">
                              {requisition.prNumber || requisition.poNumber || 'Number pending'}
                            </p>
                            <p className="mt-1 truncate text-sm font-medium text-foreground">{primaryItem}</p>
                            <p className="text-xs text-muted-foreground">
                              {requisition.department || 'Dev'} • {requisition.requesterName || 'Requester'}
                            </p>
                          </div>
                          <Badge tone={getStatusTone(requisition.status)} className="shrink-0">
                            {getStatusLabel(requisition.status)}
                          </Badge>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Routing Status</dt>
                            <dd className="mt-1 font-medium">
                              {requisition.conversionStatus === 'CONVERTED_TO_RFQ'
                                ? 'In RFQ'
                                : requisition.conversionStatus === 'CONVERTED_TO_PO'
                                ? 'PO Created'
                                : 'Pending'}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Date</dt>
                            <dd className="mt-1 font-medium text-foreground">
                              {formatDate(requisition.poDate || requisition.createdAt)}
                            </dd>
                          </div>
                        </dl>
                      </button>
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => handleRowClick(requisition)}>
                          <Eye className="size-4" /> View
                        </Button>
                        {!isRfqDone && !isPoDone && canConvertPrToRfq(requisition) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 border-emerald-600/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-semibold"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreateRfqForRequisition(requisition);
                            }}
                          >
                            <Send className="size-4" /> Create RFQ
                          </Button>
                        )}
                        {!isRfqDone && !isPoDone && canConvertPr(requisition) && (
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreatePoForRequisition(requisition);
                            }}
                          >
                            <ShoppingCart className="size-4" /> Create PO
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={!canCreateRequisition}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => canCreateRequisition && setDeleteTarget(requisition)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <TablePagination
            currentPage={safePage}
            totalItems={filteredRequisitions.length}
            perPage={perPage}
            onPageChange={setCurrentPage}
          />
        </Card>
      )}

      {/* Create Requisition Modal */}
      <CreatePurchaseRequisitionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={(newPr) => {
          fetchRequisitions();
          setToast({
            message: `Purchase Requisition ${newPr.prNumber || ''} created successfully!`,
            type: 'success',
          });
        }}
      />

      {/* View Requisition Details Modal */}
      <Dialog open={Boolean(viewingPr)} onOpenChange={(open) => !open && setViewingPr(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          {viewingPr && (
            <>
              <DialogHeader className="pr-10">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                      <FileText className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-base font-bold">
                        {viewingPr.prNumber || viewingPr.poNumber || 'Purchase Requisition'}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground">
                        Raised on {formatDate(viewingPr.createdAt || viewingPr.poDate)} by {viewingPr.requesterName || 'Requester'}
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {viewingPr.department || 'Dev'}
                    </Badge>
                    <Badge tone={getStatusTone(viewingPr.status)}>
                      {getStatusLabel(viewingPr.status)}
                    </Badge>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-2 text-sm">
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                  <div>
                    <span className="text-muted-foreground block text-xs">Requested By</span>
                    <span className="font-semibold text-foreground flex items-center gap-1.5 mt-0.5 text-sm">
                      <User className="size-4 text-muted-foreground" /> {viewingPr.requesterName || 'Requester'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Department</span>
                    <span className="font-semibold text-foreground mt-0.5 block text-sm">{viewingPr.department || 'Dev'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Urgency / Priority</span>
                    <div className="mt-1">
                      <PriorityBadge priority={viewingPr.priority} size="md" />
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs">Required By</span>
                    <span className="font-semibold text-foreground mt-0.5 block text-sm">{formatDate(viewingPr.deliveryDate)}</span>
                  </div>
                  {viewingPr.submittedToName && (
                    <div className="col-span-2 sm:col-span-4 border-t border-border/50 pt-2.5 mt-1">
                      <span className="text-muted-foreground block text-xs">Submitted To (Target Approver)</span>
                      <span className="font-semibold text-primary flex items-center gap-1.5 mt-0.5 text-sm">
                        <UserCheck className="size-4" /> {viewingPr.submittedToName} {viewingPr.submittedToEmail ? `(${viewingPr.submittedToEmail})` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Conversion / Routing Status */}
                <div className="rounded-xl border border-border/70 bg-card p-3.5">
                  <span className="text-muted-foreground block text-xs font-medium mb-1.5">Procurement Routing Status:</span>
                  {viewingPr.conversionStatus === 'CONVERTED_TO_RFQ' ? (
                    <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 text-emerald-800 dark:text-emerald-300">
                      <div className="flex items-center gap-2">
                        <Send className="size-4 text-emerald-600" />
                        <span className="text-sm font-medium">This requisition has been floated into an RFQ for vendor quotations.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {viewingPr.convertedToRfqId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-semibold border-emerald-600 text-emerald-700 dark:text-emerald-300"
                            onClick={() => {
                              const rfqId = viewingPr.convertedToRfqId!;
                              setViewingPr(null);
                              handleOpenRfqView(rfqId);
                            }}
                          >
                            <Eye className="size-3.5 mr-1" /> View RFQ
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : viewingPr.conversionStatus === 'CONVERTED_TO_PO' ? (
                    <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 text-indigo-800 dark:text-indigo-300">
                      <div className="flex items-center gap-2">
                        <ShoppingCart className="size-4 text-indigo-600" />
                        <span className="text-sm font-medium">Direct Purchase Order generated from this requisition.</span>
                      </div>
                      {viewingPr.convertedToPoId && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-semibold border-indigo-600 text-indigo-700 dark:text-indigo-300"
                          onClick={() => {
                            setViewingPr(null);
                            navigate(`/procurement/create-purchase-order?id=${viewingPr.convertedToPoId}`);
                          }}
                        >
                          Open PO <ArrowRight className="size-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-800 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <Clock3 className="size-4 text-amber-600" />
                        <span className="text-sm font-medium">Pending Purchase Team Action: Ready to float RFQ or create Direct PO.</span>
                      </div>
                      {(() => {
                        const canConvertViewingPr =
                          isAdmin ||
                          hasPermission('Purchase Requisitions', 'canApprove') ||
                          hasPermission('PO Creation', 'canApprove') ||
                          hasPermission('Purchase Orders', 'canApprove') ||
                          (viewingPr.submittedToUserId && String(viewingPr.submittedToUserId) === String(user?.id));

                        if (canConvertViewingPr) {
                          return (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs font-semibold border-emerald-600/50 text-emerald-700 dark:text-emerald-300"
                                onClick={() => {
                                  setSelectedPrIds([viewingPr.id!]);
                                  setViewingPr(null);
                                  handleOpenRfqModal();
                                }}
                              >
                                <Send className="size-3.5 mr-1" /> Float RFQ
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs font-semibold"
                                onClick={() => {
                                  setSelectedPrIds([viewingPr.id!]);
                                  setViewingPr(null);
                                  setShowPoModal(true);
                                }}
                              >
                                <ShoppingCart className="size-3.5 mr-1" /> Direct PO
                              </Button>
                            </div>
                          );
                        }

                        return (
                          <span className="text-xs text-muted-foreground italic">
                            Assigned to {viewingPr.submittedToName || 'Purchase User'}. Conversion restricted to assignee.
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Items List */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Layers className="size-4 text-primary" /> Line Items ({viewingPr.items?.length || 0})
                  </h4>
                  <div className="rounded-xl border border-border/70 overflow-hidden">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/60 text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider">
                          <th className="p-3 pl-3.5">#</th>
                          <th className="p-3">Item Name & Details</th>
                          <th className="p-3 text-center">Qty</th>
                          {viewingPr.requisitionType === 'MULTI' && <th className="p-3">Requested By</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {(viewingPr.items || []).map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-accent/25">
                            <td className="p-3 pl-3.5 text-muted-foreground">{idx + 1}</td>
                            <td className="p-3">
                              <span className="font-semibold text-foreground block">{it.itemName || it.description}</span>
                              {it.description && it.itemName && (
                                <span className="text-xs text-muted-foreground block">{it.description}</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-medium">
                              {it.quantity} {it.unit || 'pcs'}
                            </td>
                            {viewingPr.requisitionType === 'MULTI' && (
                              <td className="p-3 text-muted-foreground">
                                {it.requestedBy || viewingPr.requesterName || '-'} ({it.department || viewingPr.department})
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Justification / Description */}
                {(viewingPr.description || viewingPr.specialInstructions || viewingPr.internalNotes) && (
                  <div className="rounded-lg bg-muted/30 p-3 border border-border/50">
                    <span className="text-xs font-semibold text-muted-foreground block mb-0.5">
                      Business Justification / Description:
                    </span>
                    <p className="text-sm text-foreground italic">
                      {viewingPr.description || viewingPr.specialInstructions || viewingPr.internalNotes}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2 border-t border-border/60">
                <Button variant="outline" onClick={() => setViewingPr(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Convert to RFQ Modal (Option 2: RFQ float kiya jayega) */}
      <Dialog open={showRfqModal} onOpenChange={(open) => !open && !convertingRfq && setShowRfqModal(false)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Send className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Float RFQ from Selected Requisitions</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Consolidate {(pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems).length} requisition(s) into a unified Request For Quotation (RFQ).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {hasMixedSelection && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                ⚠️ {convertedToPoItems.length + convertedToRfqItems.length} already converted requisition(s) were excluded. Only the {pendingConversionItems.length} pending requisition(s) will be included in this RFQ.
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">RFQ Title</label>
              <Input
                className="text-xs"
                value={rfqTitle}
                onChange={(e) => setRfqTitle(e.target.value)}
                placeholder="e.g. RFQ for Network Infrastructure Equipment"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">Quotation Closing Date</label>
              <Input
                type="date"
                className="text-xs"
                value={rfqClosingDate}
                onChange={(e) => setRfqClosingDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">RFQ Description</label>
              <textarea
                rows={2}
                className="w-full rounded-md border border-input bg-background p-2 text-xs shadow-xs focus:ring-1 focus:ring-primary outline-hidden"
                placeholder="Enter RFQ description (optional)..."
                value={rfqDescription}
                onChange={(e) => setRfqDescription(e.target.value)}
              />
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <span className="text-xs font-semibold text-muted-foreground block mb-1">
                Requisitions Being Consolidated ({(pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems).length}):
              </span>
              <ul className="space-y-1 text-xs">
                {(pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems).map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-foreground">
                    <span className="font-medium">{r.prNumber || r.poNumber || r.id} ({r.department})</span>
                    <span className="text-muted-foreground">
                      {Array.isArray(r.items) ? r.items.length : 0} items • {r.requesterName}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button variant="outline" onClick={() => setShowRfqModal(false)} disabled={convertingRfq}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConvertToRfq}
              disabled={convertingRfq}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {convertingRfq ? 'Creating RFQ…' : 'Confirm & Float RFQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert to Direct PO Modal (Option 1: Ya to Direct PO Banaya jayega) */}
      <Dialog open={showPoModal} onOpenChange={(open) => !open && !convertingPo && setShowPoModal(false)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShoppingCart className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Create Direct PO</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Consolidate {(pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems).length} requisition(s) into a Direct Purchase Order.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {hasMixedSelection && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-2.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                ⚠️ {convertedToPoItems.length + convertedToRfqItems.length} already converted requisition(s) were excluded. Only the {pendingConversionItems.length} pending requisition(s) will be included in this Purchase Order.
              </div>
            )}

            <p className="text-foreground">
              You are converting the following <strong>{(pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems).length}</strong> pending requisition(s) directly into a Purchase Order. Line items will be merged and prepared for order fulfillment.
            </p>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 max-h-48 overflow-y-auto">
              <span className="text-xs font-semibold text-muted-foreground block mb-1.5">
                Requisitions Included:
              </span>
              <ul className="space-y-1.5 text-xs">
                {(pendingConversionItems.length > 0 ? pendingConversionItems : selectedRequisitionItems).map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-foreground">
                    <span className="font-semibold text-primary">{r.prNumber || r.poNumber || r.id}</span>
                    <span className="text-muted-foreground">{r.department} • Requester: {r.requesterName}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border/50">
            <Button variant="outline" onClick={() => setShowPoModal(false)} disabled={convertingPo}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConvertToPo}
              disabled={convertingPo}
              className="gap-1.5 bg-primary text-primary-foreground"
            >
              {convertingPo ? 'Creating PO…' : 'Confirm & Create Direct PO'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Single Modal */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete purchase requisition?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.prNumber || deleteTarget?.poNumber || 'This requisition'} will be permanently removed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Any items or routing history linked to this requisition will be deleted.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" loading={deleting} onClick={handleDeleteConfirm}>Delete document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Delete Modal */}
      <Dialog open={showBatchDeleteModal} onOpenChange={(open) => { if (!open && !batchDeleting) setShowBatchDeleteModal(false); }}>
        <DialogContent>
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-xl bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <DialogTitle>Delete {selectedPrIds.length} selected document(s)?</DialogTitle>
            <DialogDescription>
              The selected {selectedPrIds.length} purchase document(s) will be permanently deleted from the database.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.055] p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            This batch operation is permanent and cannot be reversed.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDeleteModal(false)} disabled={batchDeleting}>Cancel</Button>
            <Button variant="destructive" loading={batchDeleting} onClick={handleBatchDeleteConfirm}>Delete {selectedPrIds.length} document(s)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RFQ Detail View Modal (Read-only inspection of converted RFQ) */}
      {viewingRfq && (
        <RFQDetailModal
          rfq={viewingRfq}
          onClose={() => setViewingRfq(null)}
          loading={viewingRfqLoading}
          readOnly={true}
        />
      )}
    </PageFrame>
  );
}
