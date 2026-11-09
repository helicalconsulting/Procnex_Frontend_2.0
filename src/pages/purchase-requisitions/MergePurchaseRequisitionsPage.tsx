import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  User,
  Users,
  Package,
  Boxes,
  ShoppingCart,
  Send,
  CheckSquare,
  Square,
  AlertTriangle,
  Clock3,
  ExternalLink,
  Layers,
  Sparkles,
  Building,
  Check,
  ChevronRight,
  Filter,
  Eye,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { purchaseRequisitionService, type PurchaseRequisition } from '../../services/purchaseRequisitionService';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { EmptyState, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';

type MergeMode = 'USER' | 'ITEM';

interface ConsolidatedItemSummary {
  itemName: string;
  itemClass: string;
  totalQuantity: number;
  unit: string;
  avgEstimatedPrice: number;
  totalEstimated: number;
  requestedByUsers: string[];
  prNumbers: string[];
}

export default function MergePurchaseRequisitionsPage() {
  const navigate = useNavigate();
  const { user, roles: authRoles, hasPermission } = useAuth();
  const { formatAmount, companyDefaultCurrency } = useCurrency();

  const isAdmin = useMemo(() => {
    if (!authRoles || authRoles.length === 0) return false;
    return authRoles.some((r) => r === 'Super Admin' || r === 'Administrator' || r.toLowerCase().includes('admin'));
  }, [authRoles]);

  const currentUserId = user?.id || (user as any)?._id;
  const currentUserEmail = (user?.email || '').toLowerCase().trim();
  const currentUserName = (user?.fullName || user?.username || '').toLowerCase().trim();

  const isOwnPr = useCallback(
    (r: PurchaseRequisition) => {
      return Boolean(
        (r.requesterId && String(r.requesterId) === String(currentUserId)) ||
        (r.requesterEmail && r.requesterEmail.toLowerCase().trim() === currentUserEmail) ||
        (r.requesterName && currentUserName && r.requesterName.toLowerCase().trim() === currentUserName)
      );
    },
    [currentUserId, currentUserEmail, currentUserName]
  );

  const canUserProcessPr = useCallback(
    (r: PurchaseRequisition) => {
      // In corporate procurement, a requester can NEVER convert their own request to PO/RFQ
      if (isOwnPr(r)) return false;

      // Admins or users with approve permissions can process
      if (
        isAdmin ||
        hasPermission('Purchase Requisitions', 'canApprove') ||
        hasPermission('PO Creation', 'canApprove') ||
        hasPermission('Purchase Orders', 'canApprove')
      ) {
        return true;
      }

      // Otherwise, user must be the assigned purchase user (submittedToUserId)
      return Boolean(r.submittedToUserId && String(r.submittedToUserId) === String(currentUserId));
    },
    [isAdmin, hasPermission, isOwnPr, currentUserId]
  );

  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; link?: { text: string; url: string } } | null>(null);

  // Strategy Mode: User-wise or Item-wise
  const [mergeMode, setMergeMode] = useState<MergeMode>('USER');

  // Search Terms
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  // Selected User for Mode 1
  const [selectedUserKey, setSelectedUserKey] = useState<string | null>(null);
  // Selected Category filter for Mode 1
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Selected Item / Class for Mode 2
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);

  // Selected PR IDs for merging
  const [selectedPrIds, setSelectedPrIds] = useState<string[]>([]);

  // Modals
  const [showRfqModal, setShowRfqModal] = useState(false);
  const [rfqTitle, setRfqTitle] = useState('');
  const [rfqClosingDate, setRfqClosingDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [convertingRfq, setConvertingRfq] = useState(false);

  const [showPoModal, setShowPoModal] = useState(false);
  const [convertingPo, setConvertingPo] = useState(false);

  // Fetch pending requisitions
  const fetchRequisitions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await purchaseRequisitionService.list({ scope: 'requisitions' });
      // Only keep real requisitions that are pending routing
      const valid = (list || []).filter(
        (r) =>
          Boolean(r.prNumber) &&
          (!r.conversionStatus || r.conversionStatus === 'PENDING') &&
          !r.convertedToPoId &&
          !r.convertedToRfqId &&
          r.status !== 'PO_CREATED' &&
          r.status !== 'IN_RFQ'
      );
      setRequisitions(valid);
    } catch (err: any) {
      setError(err?.message || 'Failed to load purchase requisitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequisitions();
  }, [fetchRequisitions]);

  // Distinct Requesters / Users having pending PRs
  const uniqueUsers = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        email?: string;
        department?: string;
        isMine: boolean;
        prs: PurchaseRequisition[];
      }
    >();

    requisitions.forEach((r) => {
      const name = r.requesterName || r.requisitioner || 'Requester';
      const key = (r.requesterId || r.requesterEmail || name).toLowerCase().trim();
      const isMine = isOwnPr(r);

      if (!map.has(key)) {
        map.set(key, {
          key,
          name,
          email: r.requesterEmail,
          department: r.department || 'General',
          isMine,
          prs: [],
        });
      }
      map.get(key)!.prs.push(r);
    });

    return Array.from(map.values()).sort((a, b) => b.prs.length - a.prs.length);
  }, [requisitions, isOwnPr]);

  // Filtered Users by search
  const filteredUsers = useMemo(() => {
    if (!userSearchTerm.trim()) return uniqueUsers;
    const term = userSearchTerm.toLowerCase();
    return uniqueUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        (u.department || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term)
    );
  }, [uniqueUsers, userSearchTerm]);

  // Auto-select first user if none selected
  useEffect(() => {
    if (mergeMode === 'USER' && !selectedUserKey && uniqueUsers.length > 0) {
      // Prioritize users that are NOT own requests so buyer sees incoming requests first
      const firstActionable = uniqueUsers.find((u) => !u.isMine) || uniqueUsers[0];
      setSelectedUserKey(firstActionable.key);
    }
  }, [mergeMode, selectedUserKey, uniqueUsers]);

  // Selected User Object
  const currentUserObj = useMemo(() => {
    return uniqueUsers.find((u) => u.key === selectedUserKey) || null;
  }, [uniqueUsers, selectedUserKey]);

  // Distinct Categories / Item Classes for Selected User
  const currentUserCategories = useMemo(() => {
    if (!currentUserObj) return ['ALL'];
    const set = new Set<string>();
    currentUserObj.prs.forEach((pr) => {
      const items = Array.isArray(pr.items) ? pr.items : [];
      items.forEach((it: any) => {
        const cls = it.itemClass || it.category || 'General';
        if (cls) set.add(cls);
      });
    });
    return ['ALL', ...Array.from(set)];
  }, [currentUserObj]);

  // PRs of Selected User filtered by Category
  const userFilteredPrs = useMemo(() => {
    if (!currentUserObj) return [];
    if (selectedCategoryFilter === 'ALL') return currentUserObj.prs;

    return currentUserObj.prs.filter((pr) => {
      const items = Array.isArray(pr.items) ? pr.items : [];
      return items.some((it: any) => {
        const cls = it.itemClass || it.category || 'General';
        return cls.toLowerCase() === selectedCategoryFilter.toLowerCase();
      });
    });
  }, [currentUserObj, selectedCategoryFilter]);

  // Distinct Items across all PRs for Mode 2
  const uniqueItems = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        itemName: string;
        itemClass: string;
        totalQty: number;
        unit: string;
        prs: { pr: PurchaseRequisition; item: any }[];
      }
    >();

    requisitions.forEach((pr) => {
      const items = Array.isArray(pr.items) ? pr.items : [];
      items.forEach((it: any) => {
        const name = (it.itemName || it.description || 'Item').trim();
        const key = name.toLowerCase();
        const qty = Number(it.quantity) || 1;
        const cls = it.itemClass || it.category || 'General';
        const unit = it.unit || 'pcs';

        if (!map.has(key)) {
          map.set(key, {
            key,
            itemName: name,
            itemClass: cls,
            totalQty: 0,
            unit,
            prs: [],
          });
        }
        const entry = map.get(key)!;
        entry.totalQty += qty;
        entry.prs.push({ pr, item: it });
      });
    });

    return Array.from(map.values()).sort((a, b) => b.prs.length - a.prs.length);
  }, [requisitions]);

  // Filtered Items by search for Mode 2
  const filteredItems = useMemo(() => {
    if (!itemSearchTerm.trim()) return uniqueItems;
    const term = itemSearchTerm.toLowerCase();
    return uniqueItems.filter(
      (it) =>
        it.itemName.toLowerCase().includes(term) ||
        it.itemClass.toLowerCase().includes(term)
    );
  }, [uniqueItems, itemSearchTerm]);

  // Auto-select first item if none selected in Mode 2
  useEffect(() => {
    if (mergeMode === 'ITEM' && !selectedItemKey && uniqueItems.length > 0) {
      setSelectedItemKey(uniqueItems[0].key);
    }
  }, [mergeMode, selectedItemKey, uniqueItems]);

  // Selected Item Object for Mode 2
  const currentItemObj = useMemo(() => {
    return uniqueItems.find((it) => it.key === selectedItemKey) || null;
  }, [uniqueItems, selectedItemKey]);

  // Selected Requisition Objects
  const selectedRequisitionItems = useMemo(() => {
    return requisitions.filter((r) => selectedPrIds.includes(String(r.id || r.rfqId)));
  }, [requisitions, selectedPrIds]);

  // Can convert selected PRs: must have authority and CANNOT be user's own request
  const canConvertSelected = useMemo(() => {
    if (selectedRequisitionItems.length === 0) return false;
    return selectedRequisitionItems.every((r) => canUserProcessPr(r));
  }, [selectedRequisitionItems, canUserProcessPr]);

  // Consolidation line items breakdown
  const consolidatedSummary = useMemo(() => {
    const map = new Map<string, ConsolidatedItemSummary>();
    let totalEst = 0;

    selectedRequisitionItems.forEach((pr) => {
      const items = Array.isArray(pr.items) ? pr.items : [];
      items.forEach((it: any) => {
        const name = (it.itemName || it.description || 'Item').trim();
        const key = name.toLowerCase();
        const qty = Number(it.quantity) || 1;
        const price = Number(it.unitPrice || it.estimatedPrice) || 0;
        const lineTotal = qty * price;
        totalEst += lineTotal;

        if (!map.has(key)) {
          map.set(key, {
            itemName: name,
            itemClass: it.itemClass || it.category || 'General',
            totalQuantity: 0,
            unit: it.unit || 'pcs',
            avgEstimatedPrice: price,
            totalEstimated: 0,
            requestedByUsers: [],
            prNumbers: [],
          });
        }
        const itemObj = map.get(key)!;
        itemObj.totalQuantity += qty;
        itemObj.totalEstimated += lineTotal;
        const userLabel = `${it.requestedBy || pr.requesterName} (${pr.department || 'General'})`;
        if (!itemObj.requestedByUsers.includes(userLabel)) {
          itemObj.requestedByUsers.push(userLabel);
        }
        const prLabel = pr.prNumber || pr.poNumber || pr.id;
        if (!itemObj.prNumbers.includes(prLabel)) {
          itemObj.prNumbers.push(prLabel);
        }
      });
    });

    return {
      items: Array.from(map.values()),
      grandTotal: totalEst,
    };
  }, [selectedRequisitionItems]);

  // Toggle selection
  const handleToggleSelect = (pr: PurchaseRequisition) => {
    const id = String(pr.id || pr.rfqId);
    if (!canUserProcessPr(pr)) {
      if (isOwnPr(pr)) {
        setToast({
          message: `You are the requester of ${pr.prNumber || 'this PR'}. A requester cannot convert their own requisition to a PO/RFQ. It has been routed to ${pr.submittedToName || 'the assigned purchase officer'}.`,
          type: 'error',
        });
      } else {
        setToast({
          message: `Only the assigned purchase officer (${pr.submittedToName || 'Assignee'}) or Administrator can convert ${pr.prNumber || 'this PR'}.`,
          type: 'error',
        });
      }
      return;
    }

    setSelectedPrIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllVisible = (prsList: PurchaseRequisition[]) => {
    const actionablePrs = prsList.filter((p) => canUserProcessPr(p));
    const actionableIds = actionablePrs.map((p) => String(p.id || p.rfqId));
    if (actionableIds.length === 0) {
      setToast({
        message: 'None of the visible requisitions can be converted by you (you are either the requester or not the assigned purchase officer).',
        type: 'error',
      });
      return;
    }
    const allIn = actionableIds.every((id) => selectedPrIds.includes(id));
    if (allIn) {
      setSelectedPrIds((prev) => prev.filter((id) => !actionableIds.includes(id)));
    } else {
      setSelectedPrIds((prev) => Array.from(new Set([...prev, ...actionableIds])));
    }
  };

  // Conversion Handlers — Navigate directly to RFQ / PO creation pages with pre-filled consolidated data
  const handleNavigateToCreateRfq = () => {
    if (selectedPrIds.length === 0) return;
    const defaultTitle = `Consolidated RFQ for Requisitions: ${selectedRequisitionItems
      .map((r) => r.prNumber || r.id?.slice(-6))
      .filter(Boolean)
      .join(', ')}`;
    const rfqDepartment = selectedRequisitionItems[0]?.department || '';
    const consolidatedItems = consolidatedSummary.items.map((it, idx) => ({
      id: `item-${Date.now()}-${idx + 1}`,
      itemCode: `ITEM-${String(idx + 1).padStart(3, '0')}`,
      itemName: it.itemName,
      description: `Consolidated from ${it.prNumbers.join(', ')} (Requested by: ${it.requestedByUsers.join('; ')})`,
      quantity: String(it.totalQuantity),
      unit: it.unit || 'pcs',
      expectedDate: '',
    }));

    const prefillData = {
      fromConsolidation: true,
      requisitionIds: selectedPrIds,
      prNumbers: selectedRequisitionItems.map((r) => r.prNumber || r.id).filter(Boolean),
      title: defaultTitle,
      department: rfqDepartment,
      items: consolidatedItems,
    };

    try {
      sessionStorage.setItem('heliflow_consolidation_rfq', JSON.stringify(prefillData));
    } catch {}

    navigate('/rfq/create', { state: prefillData });
  };

  const handleNavigateToCreatePo = () => {
    if (selectedPrIds.length === 0) return;
    const prNumbersString = selectedRequisitionItems
      .map((r) => r.prNumber || r.id)
      .filter(Boolean)
      .join(', ');
    const firstClass = selectedRequisitionItems[0]?.items?.[0]?.itemClass || 'General';
    const consolidatedItems = consolidatedSummary.items.map((it, idx) => ({
      id: String(idx + 1),
      itemCode: `ITEM-${String(idx + 1).padStart(3, '0')}`,
      itemName: it.itemName,
      description: `Consolidated from ${it.prNumbers.join(', ')} (Requested by: ${it.requestedByUsers.join('; ')})`,
      quantity: it.totalQuantity,
      unit: it.unit || 'pcs',
      unitPrice: it.avgEstimatedPrice,
      taxPercent: 0,
    }));

    const prefillData = {
      fromConsolidation: true,
      requisitionIds: selectedPrIds,
      prNumbers: prNumbersString,
      supplierType: firstClass,
      items: consolidatedItems,
    };

    try {
      sessionStorage.setItem('heliflow_consolidation_po', JSON.stringify(prefillData));
    } catch {}

    navigate('/procurement/create-purchase-order', { state: prefillData });
  };

  const handleOpenRfqModal = () => {
    handleNavigateToCreateRfq();
  };

  const handleConfirmConvertToRfq = async () => {
    if (selectedPrIds.length === 0) return;
    setConvertingRfq(true);
    try {
      const res = await purchaseRequisitionService.convertToRFQ({
        requisitionIds: selectedPrIds,
        title: rfqTitle,
        closingDate: rfqClosingDate,
      });

      const rfqNumber = res.rfqNumber || res.rfq?.rfqNumber || 'New RFQ';
      const rfqId = res.rfq?.id;

      setToast({
        message: `Successfully floated consolidated RFQ #${rfqNumber} from ${selectedPrIds.length} requisition(s)!`,
        type: 'success',
        link: rfqId ? { text: `Open RFQ #${rfqNumber}`, url: `/rfq/edit/${rfqId}` } : undefined,
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
    if (selectedPrIds.length === 0) return;
    setConvertingPo(true);
    try {
      const res = await purchaseRequisitionService.convertToDirectPO({
        requisitionIds: selectedPrIds,
      });

      const poNumber = res.poNumber || res.po?.poNumber || 'New Direct PO';
      const poId = res.po?.id;

      setToast({
        message: `Successfully created Direct Purchase Order #${poNumber} consolidating ${selectedPrIds.length} requisition(s)!`,
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/procurement/purchase-requisitions')}
            className="gap-1.5"
            title="Return to Purchase Requisitions list"
          >
            <ArrowLeft className="size-4" /> Back to Requisitions
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              Merge Purchase Requisitions
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                Consolidation Workbench
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Consolidate multiple user requisitions into a single unified RFQ or Direct Purchase Order.
            </p>
          </div>
        </div>

        {/* Merge Strategy Selector */}
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-muted/30 p-1">
          <span className="text-xs font-bold text-muted-foreground pl-2 pr-1">Merge By:</span>
          <button
            type="button"
            onClick={() => {
              setMergeMode('USER');
              setSelectedCategoryFilter('ALL');
            }}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5',
              mergeMode === 'USER'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <User className="size-3.5" /> 1. User (Requester)
          </button>
          <button
            type="button"
            onClick={() => setMergeMode('ITEM')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5',
              mergeMode === 'ITEM'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Package className="size-3.5" /> 2. Item / Product Class
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[45vh] items-center justify-center gap-3 text-sm text-muted-foreground">
          <div className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          Loading pending requisitions for consolidation…
        </div>
      ) : error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Could not load requisitions"
          description={error}
          action={<Button variant="outline" onClick={fetchRequisitions}>Retry</Button>}
        />
      ) : requisitions.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No pending requisitions to merge"
          description="All purchase requisitions have already been converted to PO or RFQ. Create a new requisition to start merging."
          action={
            <Button onClick={() => navigate('/procurement/purchase-requisitions')}>
              View Requisitions List
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* ========================================================================= */}
          {/* MODE 1: MERGE BY USER (Requester-centric)                                 */}
          {/* ========================================================================= */}
          {mergeMode === 'USER' && (
            <div className="space-y-5">
              {/* User Selector Card */}
              <Card className="p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="size-4 text-primary" /> Select Requester / User
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Pick a user to view their requisitions, filter by Product Class, and consolidate matching items.
                    </p>
                  </div>

                  {/* Search user by name */}
                  <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Type name (e.g. Jai, Ashu)…"
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="h-9 pl-8 text-xs rounded-lg"
                    />
                  </div>
                </div>

                {/* Horizontal scrollable user list */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 border-t border-border/50">
                  {filteredUsers.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic py-2">
                      No requesters matching &quot;{userSearchTerm}&quot;
                    </span>
                  ) : (
                    filteredUsers.map((u) => {
                      const isSelected = selectedUserKey === u.key;
                      return (
                        <button
                          key={u.key}
                          type="button"
                          onClick={() => {
                            setSelectedUserKey(u.key);
                            setSelectedCategoryFilter('ALL');
                          }}
                          className={cn(
                            'shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 border',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-muted/30 border-border/70 hover:bg-muted/60 text-foreground'
                          )}
                        >
                          <div
                            className={cn(
                              'size-6 rounded-full grid place-items-center text-[11px] font-bold',
                              isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
                            )}
                          >
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="text-left">
                            <span className="font-semibold flex items-center gap-1.5">
                              {u.name}
                              {u.isMine && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[9.5px] py-0 px-1 border-amber-500/40',
                                    isSelected ? 'bg-amber-400/20 text-amber-100 border-amber-300/40' : 'text-amber-600 dark:text-amber-400 bg-amber-500/10'
                                  )}
                                >
                                  You (Requester)
                                </Badge>
                              )}
                            </span>
                            <span
                              className={cn(
                                'text-[10px] block',
                                isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                              )}
                            >
                              {u.department} • {u.prs.length} PR{u.prs.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* Separation of Duties Notice if current user is the requester */}
              {currentUserObj?.isMine && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-800 dark:text-amber-300">
                  <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <span className="font-semibold block">Separation of Duties (Requester Authority Restricted):</span>
                    <span>
                      You are the requester of these requisitions. Requesters cannot convert their own requests into a Purchase Order or RFQ. These requisitions have been routed to assigned purchase officers ({Array.from(new Set(currentUserObj.prs.map((p) => p.submittedToName).filter(Boolean))).join(', ') || 'Purchase Team'}) for processing.
                    </span>
                  </div>
                </div>
              )}

              {/* User PRs Content */}
              {currentUserObj && (
                <div className="space-y-4">
                  {/* Category Filter Pills (Product Class Filter) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 border border-border/60 rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                        <Filter className="size-3.5" /> Item Class:
                      </span>
                      {currentUserCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setSelectedCategoryFilter(cat)}
                          className={cn(
                            'px-3 py-1 text-xs font-medium rounded-full transition-all',
                            selectedCategoryFilter === cat
                              ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                          )}
                        >
                          {cat === 'ALL' ? 'All Classes' : cat}
                        </button>
                      ))}
                    </div>

                    {/* Batch select visible button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAllVisible(userFilteredPrs)}
                      className="text-xs h-8 gap-1.5"
                    >
                      {userFilteredPrs.length > 0 &&
                      userFilteredPrs.filter(canUserProcessPr).every((pr) => selectedPrIds.includes(String(pr.id || pr.rfqId)))
                        ? 'Deselect All'
                        : `Select All Actionable (${userFilteredPrs.filter(canUserProcessPr).length})`}
                    </Button>
                  </div>

                  {/* PR Cards Grid */}
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {userFilteredPrs.map((pr) => {
                      const idStr = String(pr.id || pr.rfqId);
                      const isSelected = selectedPrIds.includes(idStr);
                      const itemsList = Array.isArray(pr.items) ? pr.items : [];
                      const primaryClass = itemsList[0]?.itemClass || itemsList[0]?.category || 'General';
                      const canProcess = canUserProcessPr(pr);
                      const isOwn = isOwnPr(pr);

                      return (
                        <div
                          key={idStr}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleToggleSelect(pr)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') handleToggleSelect(pr);
                          }}
                          className={cn(
                            'rounded-xl border p-4 text-left transition-all relative',
                            !canProcess
                              ? 'opacity-85 bg-muted/20 border-border/60 cursor-not-allowed'
                              : isSelected
                              ? 'border-primary bg-primary/[0.05] ring-1 ring-primary/40 shadow-xs cursor-pointer'
                              : 'border-border/70 bg-card hover:border-primary/40 hover:bg-muted/20 cursor-pointer'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2.5">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-primary">
                                  {pr.prNumber || pr.poNumber || 'PR'}
                                </span>
                                <Badge variant="outline" className="text-[10.5px] font-medium bg-muted/30">
                                  {primaryClass}
                                </Badge>
                              </div>
                              <span className="text-xs text-muted-foreground block mt-0.5">
                                {pr.department} • Requester: {pr.requesterName}
                              </span>
                              {isOwn ? (
                                <Badge
                                  variant="outline"
                                  className="mt-1 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium"
                                >
                                  Requested by You • Route to: {pr.submittedToName || 'Purchase Officer'}
                                </Badge>
                              ) : !canProcess ? (
                                <Badge
                                  variant="outline"
                                  className="mt-1 text-[10px] bg-muted text-muted-foreground border-border font-medium"
                                >
                                  Assigned to: {pr.submittedToName || 'Purchase Officer'}
                                </Badge>
                              ) : null}
                            </div>

                            {!canProcess ? (
                              <div
                                className="size-5 rounded grid place-items-center border border-border/50 bg-muted/50 text-muted-foreground shrink-0"
                                title={
                                  isOwn
                                    ? `You are the requester. Routed to ${pr.submittedToName || 'purchase officer'} for conversion.`
                                    : `Only ${pr.submittedToName || 'assigned purchase officer'} can convert.`
                                }
                              >
                                <Lock className="size-3 text-muted-foreground" />
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  'size-5 rounded grid place-items-center border transition-colors shrink-0',
                                  isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-border/80 bg-background'
                                )}
                              >
                                {isSelected && <Check className="size-3.5" />}
                              </div>
                            )}
                          </div>

                          {/* Items Breakdown inside card */}
                          <div className="space-y-1.5 border-t border-border/50 pt-2.5 my-2 text-xs">
                            {itemsList.map((it: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-muted-foreground">
                                <span className="font-medium text-foreground truncate max-w-[170px]" title={it.itemName}>
                                  {it.itemName || it.description}
                                </span>
                                <span className="tabular-nums">
                                  {it.quantity} {it.unit || 'pcs'}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Est Total */}
                          <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                            <span className="text-muted-foreground">Est. Total:</span>
                            <span className="font-bold text-foreground tabular-nums">
                              {formatAmount(
                                Number(pr.grandTotal || pr.totalAmount || 0),
                                pr.currency || companyDefaultCurrency
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* MODE 2: MERGE BY ITEM (Product / Category-centric across all users)        */}
          {/* ========================================================================= */}
          {mergeMode === 'ITEM' && (
            <div className="space-y-5">
              {/* Item Selector Card */}
              <Card className="p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Boxes className="size-4 text-primary" /> Select Item / Product Demand
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Pick a requested item to aggregate requisitions across all departments (Ops, Sales, Dev, Test).
                    </p>
                  </div>

                  {/* Search item by name */}
                  <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Type item name (e.g. Wi-Fi, Laptop)…"
                      value={itemSearchTerm}
                      onChange={(e) => setItemSearchTerm(e.target.value)}
                      className="h-9 pl-8 text-xs rounded-lg"
                    />
                  </div>
                </div>

                {/* Horizontal scrollable items catalogue */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 border-t border-border/50">
                  {filteredItems.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic py-2">
                      No items matching &quot;{itemSearchTerm}&quot;
                    </span>
                  ) : (
                    filteredItems.map((item) => {
                      const isSelected = selectedItemKey === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedItemKey(item.key)}
                          className={cn(
                            'shrink-0 px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 border',
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                              : 'bg-muted/30 border-border/70 hover:bg-muted/60 text-foreground'
                          )}
                        >
                          <div
                            className={cn(
                              'size-6 rounded-full grid place-items-center text-[11px] font-bold',
                              isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
                            )}
                          >
                            <Package className="size-3.5" />
                          </div>
                          <div className="text-left">
                            <span className="font-semibold block truncate max-w-[150px]">{item.itemName}</span>
                            <span
                              className={cn(
                                'text-[10px] block',
                                isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                              )}
                            >
                              {item.totalQty} {item.unit} • {item.prs.length} Requisitions
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </Card>

              {/* Item Cross-User Breakdown */}
              {currentItemObj && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between bg-muted/20 border border-border/60 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        Matching Requisitions for: <strong>{currentItemObj.itemName}</strong>
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {currentItemObj.itemClass}
                      </Badge>
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                        Total Demand: {currentItemObj.totalQty} {currentItemObj.unit}
                      </Badge>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleSelectAllVisible(currentItemObj.prs.map((p) => p.pr))
                      }
                      className="text-xs h-8 gap-1.5"
                    >
                      {currentItemObj.prs.length > 0 &&
                      currentItemObj.prs.filter((p) => canUserProcessPr(p.pr)).every((p) => selectedPrIds.includes(String(p.pr.id || p.pr.rfqId)))
                        ? 'Deselect All'
                        : `Select All Actionable (${currentItemObj.prs.filter((p) => canUserProcessPr(p.pr)).length})`}
                    </Button>
                  </div>

                  {/* Cross-User Table */}
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border/70 bg-muted/35 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="w-11 px-4 py-3 text-center">Select</th>
                            <th className="px-4 py-3">Requester & Dept</th>
                            <th className="px-4 py-3">Requisition #</th>
                            <th className="px-4 py-3 text-center">Demanded Qty</th>
                            <th className="px-4 py-3 text-right">Est. Unit Price</th>
                            <th className="px-4 py-3 text-right pr-5">Est. Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {currentItemObj.prs.map(({ pr, item }) => {
                            const idStr = String(pr.id || pr.rfqId);
                            const isSelected = selectedPrIds.includes(idStr);
                            const qty = Number(item.quantity) || 1;
                            const unitPrice = Number(item.unitPrice || item.estimatedPrice) || 0;
                            const lineTotal = qty * unitPrice;
                            const canProcess = canUserProcessPr(pr);
                            const isOwn = isOwnPr(pr);

                            return (
                              <tr
                                key={idStr}
                                onClick={() => handleToggleSelect(pr)}
                                className={cn(
                                  'transition-colors',
                                  !canProcess
                                    ? 'opacity-85 bg-muted/15 cursor-not-allowed'
                                    : 'hover:bg-accent/30 cursor-pointer',
                                  isSelected && 'bg-primary/[0.04]'
                                )}
                              >
                                <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                                  {!canProcess ? (
                                    <div
                                      className="inline-flex size-5 items-center justify-center rounded border border-border/50 bg-muted/50 text-muted-foreground"
                                      title={
                                        isOwn
                                          ? `You are the requester. Routed to ${pr.submittedToName || 'purchase officer'} for conversion.`
                                          : `Only ${pr.submittedToName || 'assigned purchase officer'} can convert.`
                                      }
                                    >
                                      <Lock className="size-3 text-muted-foreground" />
                                    </div>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleSelect(pr)}
                                      className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                                    />
                                  )}
                                </td>
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="size-7 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0">
                                      {(pr.requesterName || 'R').charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                                        {pr.requesterName || 'Requester'}
                                        {isOwn && (
                                          <Badge
                                            variant="outline"
                                            className="text-[9.5px] py-0 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 font-medium"
                                          >
                                            You
                                          </Badge>
                                        )}
                                      </span>
                                      <span className="text-xs text-muted-foreground block">
                                        {pr.department || 'General'}
                                        {isOwn && pr.submittedToName && (
                                          <span className="text-[11px] text-amber-600 dark:text-amber-400 ml-1.5">
                                            • Route: {pr.submittedToName}
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 font-semibold text-primary">
                                  {pr.prNumber || pr.poNumber}
                                </td>
                                <td className="px-4 py-3.5 text-center font-bold text-foreground">
                                  {qty} {item.unit || 'pcs'}
                                </td>
                                <td className="px-4 py-3.5 text-right font-medium tabular-nums text-muted-foreground">
                                  {formatAmount(unitPrice, pr.currency || companyDefaultCurrency)}
                                </td>
                                <td className="px-4 py-3.5 text-right pr-5 font-bold tabular-nums text-foreground">
                                  {formatAmount(lineTotal, pr.currency || companyDefaultCurrency)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* FLOATING ACTION WORKBENCH (Bottom bar when PRs are selected)             */}
          {/* ========================================================================= */}
          {selectedPrIds.length > 0 && (
            <div className="sticky bottom-4 z-20 rounded-2xl border border-primary/40 bg-card/95 backdrop-blur-md p-4 shadow-xl animate-in fade-in slide-in-from-bottom-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                    <CheckSquare className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span>{selectedPrIds.length} Requisition(s) Selected for Consolidation</span>
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                        {consolidatedSummary.items.length} Unique Item(s)
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                      <span>
                        Combined Value:{' '}
                        <strong className="text-foreground">
                          {formatAmount(consolidatedSummary.grandTotal, companyDefaultCurrency)}
                        </strong>
                      </span>
                      <span>•</span>
                      <span className="truncate max-w-md">
                        PRs: {selectedRequisitionItems.map((r) => r.prNumber || r.id).join(', ')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Conversion Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPrIds([])}
                    className="text-xs"
                  >
                    Deselect All
                  </Button>

                  {canConvertSelected ? (
                    <>
                      {/* Option 2: Float RFQ */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNavigateToCreateRfq}
                        className="gap-1.5 border-emerald-600/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 font-semibold"
                      >
                        <Send className="size-4 text-emerald-600" /> Float RFQ ({selectedPrIds.length} PRs)
                      </Button>

                      {/* Option 1: Direct PO */}
                      <Button
                        size="sm"
                        onClick={handleNavigateToCreatePo}
                        className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs"
                      >
                        <ShoppingCart className="size-4" /> Create Direct PO ({selectedPrIds.length} PRs)
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400 font-medium">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      <span>
                        Authority Required: Requesters cannot convert their own requisitions. Only the assigned purchase user or Administrator can convert to PO / RFQ.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Float RFQ Modal */}
      <Dialog open={showRfqModal} onOpenChange={(open) => !open && !convertingRfq && setShowRfqModal(false)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                <Send className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Float Consolidated RFQ</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Consolidating {selectedPrIds.length} requisition(s) into a unified Request For Quotation.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1 block">RFQ Title</label>
              <Input
                className="text-xs"
                value={rfqTitle}
                onChange={(e) => setRfqTitle(e.target.value)}
                placeholder="e.g. Bulk Procurement for IT Infrastructure"
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

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 max-h-48 overflow-y-auto">
              <span className="text-xs font-semibold text-muted-foreground block mb-1.5">
                Consolidated Item Quantities ({consolidatedSummary.items.length}):
              </span>
              <ul className="space-y-1.5 text-xs">
                {consolidatedSummary.items.map((it, idx) => (
                  <li key={idx} className="flex items-center justify-between text-foreground">
                    <span className="font-semibold text-primary">{it.itemName} ({it.itemClass})</span>
                    <span className="text-muted-foreground">
                      <strong>{it.totalQuantity} {it.unit}</strong> • from {it.requestedByUsers.length} requester(s)
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
              {convertingRfq ? 'Floating RFQ…' : 'Confirm & Float RFQ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct PO Modal */}
      <Dialog open={showPoModal} onOpenChange={(open) => !open && !convertingPo && setShowPoModal(false)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShoppingCart className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Create Consolidated Direct PO</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Consolidating {selectedPrIds.length} requisition(s) directly into a Purchase Order.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-foreground">
              You are converting <strong>{selectedPrIds.length}</strong> requisition(s) into a Direct Purchase Order. Matching items will be merged and prepared for order fulfillment.
            </p>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 max-h-48 overflow-y-auto">
              <span className="text-xs font-semibold text-muted-foreground block mb-1.5">
                Consolidated Item Quantities ({consolidatedSummary.items.length}):
              </span>
              <ul className="space-y-1.5 text-xs">
                {consolidatedSummary.items.map((it, idx) => (
                  <li key={idx} className="flex items-center justify-between text-foreground">
                    <span className="font-semibold text-primary">{it.itemName} ({it.itemClass})</span>
                    <span className="text-muted-foreground">
                      <strong>{it.totalQuantity} {it.unit}</strong> • {formatAmount(it.totalEstimated, companyDefaultCurrency)}
                    </span>
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
    </PageFrame>
  );
}
