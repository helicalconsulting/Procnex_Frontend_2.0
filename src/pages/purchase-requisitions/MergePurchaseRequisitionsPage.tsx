import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronDown,
  ChevronRight,
  Filter,
  Eye,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { purchaseRequisitionService, type PurchaseRequisition } from '../../services/purchaseRequisitionService';
import { itemMasterService, type ItemMaster } from '../../services/itemMasterService';
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
import { consolidateLineItems } from '../../utils/consolidation';
import { cn } from '../../lib/utils';

type MergeMode = 'USER' | 'ITEM';

interface RequisitionClassSlice {
  sliceId: string;
  prId: string;
  prNumber: string;
  pr: PurchaseRequisition;
  itemClass: string;
  items: Array<{
    raw: any;
    itemCode: string;
    itemName: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    preferredSupplierId?: string;
    preferredSupplierName?: string;
    itemClass: string;
  }>;
  sliceTotal: number;
  canProcess: boolean;
  isOwn: boolean;
}

interface PoSplitGroup {
  supplierKey: string;
  supplierId?: string;
  supplierName: string;
  isPreferred: boolean;
  supplierCategory?: string;
  currency: string;
  totalAmount: number;
  items: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    sourcePrNumber?: string;
    sourcePrId?: string;
  }>;
  sourcePrNumbers: string[];
  sourceRequisitionIds: string[];
}

interface RfqSplitGroup {
  categoryKey: string;
  categoryName: string;
  items: Array<{
    id: string;
    itemCode: string;
    itemName: string;
    itemClass: string;
    description: string;
    quantity: string;
    unit: string;
    expectedDate: string;
    preferredSupplierId?: string;
    preferredSupplierName?: string;
    sourcePrNumber?: string;
    sourcePrId?: string;
  }>;
  preferredSuppliers: string[];
  sourcePrNumbers: string[];
  sourceRequisitionIds: string[];
}

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
  const { formatAmount, companyDefaultCurrency, convert } = useCurrency();

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
  const [inventoryItems, setInventoryItems] = useState<ItemMaster[]>([]);
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

  // Selected Category filter for Mode 2
  const [selectedItemModeCategoryFilter, setSelectedItemModeCategoryFilter] = useState<string>('ALL');

  // Selected Item / Class for Mode 2
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);

  // Selected Slice IDs for merging (distributed by Item Class in Mode 1, or by item in Mode 2)
  const [selectedSliceIds, setSelectedSliceIds] = useState<string[]>([]);

  // Split Modals State
  const [showSplitPoModal, setShowSplitPoModal] = useState(false);
  const [poSplitGroups, setPoSplitGroups] = useState<PoSplitGroup[]>([]);
  const [showSplitRfqModal, setShowSplitRfqModal] = useState(false);
  const [rfqSplitGroups, setRfqSplitGroups] = useState<RfqSplitGroup[]>([]);

  // Legacy direct convert Modals (kept for fallback)
  const [showRfqModal, setShowRfqModal] = useState(false);
  const [rfqTitle, setRfqTitle] = useState('');
  const [rfqClosingDate, setRfqClosingDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  );
  const [rfqDescription, setRfqDescription] = useState('');
  const [convertingRfq, setConvertingRfq] = useState(false);

  const [showPoModal, setShowPoModal] = useState(false);
  const [convertingPo, setConvertingPo] = useState(false);

  // Dropdown States & Refs for compact selector UI
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setIsUserDropdownOpen(false);
      }
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node)) {
        setIsItemDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsUserDropdownOpen(false);
        setIsItemDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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

  useEffect(() => {
    itemMasterService
      .list({ limit: 1000 })
      .then((res) => {
        setInventoryItems(res.items || []);
      })
      .catch(() => {});
  }, []);

  const resolveItemInfo = useCallback(
    (it: any, prCurrency?: string) => {
      const code = (it.itemCode || '').trim().toLowerCase();
      const name = (it.itemName || it.description || '').trim().toLowerCase();

      const matched = inventoryItems.find(
        (inv) =>
          (code && inv.itemCode && inv.itemCode.toLowerCase() === code) ||
          (name && inv.itemName && inv.itemName.toLowerCase() === name)
      );

      const preferredSupplierId =
        it.preferredSupplierId ||
        it.preferredSupplier?.id ||
        (matched?.preferredSupplierId ? String(matched.preferredSupplierId) : undefined) ||
        undefined;

      const preferredSupplierName =
        it.preferredSupplierName ||
        it.preferredSupplier?.name ||
        (typeof it.preferredSupplier === 'string' ? it.preferredSupplier : undefined) ||
        (matched?.preferredSupplierName ? String(matched.preferredSupplierName) : undefined) ||
        undefined;

      const itemClass = (
        it.itemClass ||
        it.category ||
        matched?.productClass ||
        'General'
      ).trim();

      const targetCurrency = (prCurrency || companyDefaultCurrency || 'USD').trim().toUpperCase();

      let unitPrice = 0;
      if (it.unitPrice && Number(it.unitPrice) > 0) {
        unitPrice = Number(it.unitPrice);
      } else if (it.estimatedPrice && Number(it.estimatedPrice) > 0) {
        unitPrice = Number(it.estimatedPrice);
      } else if (matched?.standardPrice !== undefined) {
        const itemCurrency = (matched.currency || companyDefaultCurrency || 'AED').trim().toUpperCase();
        const basePrice = Number(matched.standardPrice);
        if (itemCurrency && targetCurrency && itemCurrency !== targetCurrency) {
          const convertedVal = convert(basePrice, itemCurrency, targetCurrency);
          unitPrice = Math.round(convertedVal * 100) / 100;
        } else {
          unitPrice = basePrice;
        }
      }

      const unit = it.unit || matched?.uom || 'pcs';

      return {
        matched,
        preferredSupplierId,
        preferredSupplierName,
        itemClass,
        unitPrice,
        unit,
        targetCurrency,
      };
    },
    [inventoryItems, companyDefaultCurrency, convert]
  );

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

  // Reset category filter and selections when requester changes
  useEffect(() => {
    setSelectedCategoryFilter('ALL');
    setSelectedSliceIds([]);
  }, [selectedUserKey, mergeMode]);

  // Selected User Object
  const currentUserObj = useMemo(() => {
    return uniqueUsers.find((u) => u.key === selectedUserKey) || null;
  }, [uniqueUsers, selectedUserKey]);

  // ── DISTRIBUTE REQUISITIONS BY ITEM CLASS (Mode 1: USER) ──
  // A PR containing multiple items across different item classes is partitioned into class slices
  const userPrSlices = useMemo(() => {
    if (!currentUserObj) return [];
    const slices: RequisitionClassSlice[] = [];

    currentUserObj.prs.forEach((pr) => {
      const prId = String(pr.id || pr.rfqId);
      const prNumber = pr.prNumber || pr.poNumber || 'PR';
      const items = Array.isArray(pr.items)
        ? pr.items
        : typeof pr.items === 'string'
        ? (() => {
            try {
              return JSON.parse(pr.items);
            } catch {
              return [];
            }
          })()
        : [];

      if (items.length === 0) {
        const fallbackClass = (pr.department || 'General').trim();
        slices.push({
          sliceId: `${prId}:::${fallbackClass.toLowerCase()}`,
          prId,
          prNumber,
          pr,
          itemClass: fallbackClass,
          items: [],
          sliceTotal: 0,
          canProcess: canUserProcessPr(pr),
          isOwn: isOwnPr(pr),
        });
        return;
      }

      // Group items of this PR by resolved itemClass
      const classMap = new Map<string, { itemClass: string; items: any[]; sliceTotal: number }>();

      items.forEach((it: any) => {
        const info = resolveItemInfo(it, pr.currency);
        const resolvedClass = info.itemClass || pr.department || 'General';
        const classKey = resolvedClass.trim().toLowerCase();
        const qty = Number(it.quantity) || 1;
        const lineTotal = qty * info.unitPrice;

        const resolvedItem = {
          raw: it,
          itemCode: it.itemCode || info.matched?.itemCode || '',
          itemName: it.itemName || it.description || info.matched?.itemName || 'Item',
          description: it.description?.trim() || '',
          quantity: qty,
          unit: info.unit,
          unitPrice: info.unitPrice,
          totalPrice: lineTotal,
          preferredSupplierId: info.preferredSupplierId,
          preferredSupplierName: info.preferredSupplierName,
          itemClass: resolvedClass,
        };

        if (!classMap.has(classKey)) {
          classMap.set(classKey, {
            itemClass: resolvedClass,
            items: [resolvedItem],
            sliceTotal: lineTotal,
          });
        } else {
          const entry = classMap.get(classKey)!;
          entry.items.push(resolvedItem);
          entry.sliceTotal += lineTotal;
        }
      });

      classMap.forEach((entry, classKey) => {
        slices.push({
          sliceId: `${prId}:::${classKey}`,
          prId,
          prNumber,
          pr,
          itemClass: entry.itemClass,
          items: entry.items,
          sliceTotal: entry.sliceTotal,
          canProcess: canUserProcessPr(pr),
          isOwn: isOwnPr(pr),
        });
      });
    });

    return slices;
  }, [currentUserObj, resolveItemInfo, canUserProcessPr, isOwnPr]);

  // Distinct Categories / Item Classes across all slices of Selected User
  const currentUserCategories = useMemo(() => {
    if (!currentUserObj || userPrSlices.length === 0) return ['ALL'];
    const set = new Set<string>();
    userPrSlices.forEach((slice) => {
      if (slice.itemClass) set.add(slice.itemClass);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [currentUserObj, userPrSlices]);

  // Requisition Slices of Selected User filtered by Category
  const userFilteredSlices = useMemo(() => {
    if (selectedCategoryFilter === 'ALL') return userPrSlices;
    return userPrSlices.filter(
      (slice) => slice.itemClass.toLowerCase() === selectedCategoryFilter.toLowerCase()
    );
  }, [userPrSlices, selectedCategoryFilter]);

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
      const items = Array.isArray(pr.items)
        ? pr.items
        : typeof pr.items === 'string'
        ? (() => {
            try {
              return JSON.parse(pr.items);
            } catch {
              return [];
            }
          })()
        : [];

      items.forEach((it: any) => {
        const info = resolveItemInfo(it, pr.currency);
        const name = (it.itemName || it.description || info.matched?.itemName || 'Item').trim();
        const key = name.toLowerCase();
        const qty = Number(it.quantity) || 1;
        const cls = info.itemClass || 'General';
        const unit = info.unit || 'pcs';

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
  }, [requisitions, resolveItemInfo]);

  // Distinct Item Classes across all Demanded Items for Mode 2
  const allMode2ItemClasses = useMemo(() => {
    if (uniqueItems.length === 0) return ['ALL'];
    const set = new Set<string>();
    uniqueItems.forEach((it) => {
      if (it.itemClass) set.add(it.itemClass);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [uniqueItems]);

  // Items matching selected item class in Mode 2
  const mode2CategoryItems = useMemo(() => {
    if (selectedItemModeCategoryFilter === 'ALL') {
      return uniqueItems;
    }
    return uniqueItems.filter(
      (it) => it.itemClass.toLowerCase() === selectedItemModeCategoryFilter.toLowerCase()
    );
  }, [uniqueItems, selectedItemModeCategoryFilter]);

  // Filtered Items by Item Class and search for Mode 2 dropdown
  const filteredItems = useMemo(() => {
    if (!itemSearchTerm.trim()) return mode2CategoryItems;
    const term = itemSearchTerm.toLowerCase();
    return mode2CategoryItems.filter(
      (it) =>
        it.itemName.toLowerCase().includes(term) ||
        it.itemClass.toLowerCase().includes(term)
    );
  }, [mode2CategoryItems, itemSearchTerm]);

  // Auto-select in Mode 2 when items load or when category filter changes
  useEffect(() => {
    if (mergeMode === 'ITEM') {
      const candidates =
        selectedItemModeCategoryFilter === 'ALL'
          ? uniqueItems
          : uniqueItems.filter(
              (it) => it.itemClass.toLowerCase() === selectedItemModeCategoryFilter.toLowerCase()
            );

      if (candidates.length > 0) {
        if (selectedItemKey === 'ALL') {
          return;
        }
        const stillValid = candidates.some((it) => it.key === selectedItemKey);
        if (!stillValid) {
          setSelectedItemKey(candidates[0].key);
        }
      } else {
        setSelectedItemKey(null);
      }
    }
  }, [mergeMode, selectedItemModeCategoryFilter, uniqueItems, selectedItemKey]);

  // Selected Item Object for Mode 2 (if a single item is selected)
  const currentItemObj = useMemo(() => {
    if (!selectedItemKey || selectedItemKey === 'ALL') return null;
    return uniqueItems.find((it) => it.key === selectedItemKey) || null;
  }, [uniqueItems, selectedItemKey]);

  // Active items to display/consolidate in Mode 2
  const mode2ActiveItems = useMemo(() => {
    if (selectedItemKey === 'ALL') {
      return mode2CategoryItems;
    }
    return currentItemObj ? [currentItemObj] : [];
  }, [selectedItemKey, mode2CategoryItems, currentItemObj]);

  // Flattened Mode 2 Demands for table rendering and action selection
  const mode2AllPrRows = useMemo(() => {
    const rows: {
      pr: PurchaseRequisition;
      item: any;
      itemObj: typeof uniqueItems[0];
      sliceKey: string;
    }[] = [];

    mode2ActiveItems.forEach((itObj) => {
      itObj.prs.forEach(({ pr, item }) => {
        const prId = String(pr.id || pr.rfqId);
        rows.push({
          pr,
          item,
          itemObj: itObj,
          sliceKey: `mode2:::${prId}:::${itObj.key}`,
        });
      });
    });

    return rows;
  }, [mode2ActiveItems]);

  // Selected Requisition Slices Objects (Mode 1)
  const selectedSlices = useMemo(() => {
    return userPrSlices.filter((s) => selectedSliceIds.includes(s.sliceId));
  }, [userPrSlices, selectedSliceIds]);

  // Can convert selected slices: must have authority and CANNOT be user's own request
  const canConvertSelected = useMemo(() => {
    if (mergeMode === 'USER') {
      if (selectedSlices.length === 0) return false;
      return selectedSlices.every((s) => s.canProcess);
    } else {
      const selectedRows = mode2AllPrRows.filter((r) =>
        selectedSliceIds.includes(r.sliceKey)
      );
      if (selectedRows.length === 0) return false;
      return selectedRows.every((r) => canUserProcessPr(r.pr));
    }
  }, [mergeMode, selectedSlices, mode2AllPrRows, selectedSliceIds, canUserProcessPr]);

  // Distinct PR Numbers involved in current selection
  const distinctPrNumbers = useMemo(() => {
    if (mergeMode === 'USER') {
      return Array.from(new Set(selectedSlices.map((s) => s.prNumber)));
    } else {
      const selectedRows = mode2AllPrRows.filter((r) =>
        selectedSliceIds.includes(r.sliceKey)
      );
      return Array.from(new Set(selectedRows.map((r) => r.pr.prNumber || r.pr.poNumber || r.pr.id)));
    }
  }, [mergeMode, selectedSlices, mode2AllPrRows, selectedSliceIds]);

  // Distinct PR IDs involved in current selection
  const selectedPrIds = useMemo(() => {
    if (mergeMode === 'USER') {
      return Array.from(new Set(selectedSlices.map((s) => s.prId).filter(Boolean)));
    } else {
      const selectedRows = mode2AllPrRows.filter((r) =>
        selectedSliceIds.includes(r.sliceKey)
      );
      return Array.from(new Set(selectedRows.map((r) => String(r.pr.id || r.pr.rfqId)).filter(Boolean)));
    }
  }, [mergeMode, selectedSlices, mode2AllPrRows, selectedSliceIds]);

  // Consolidation line items breakdown
  const consolidatedSummary = useMemo(() => {
    const map = new Map<string, ConsolidatedItemSummary>();
    let totalEst = 0;

    if (mergeMode === 'USER') {
      selectedSlices.forEach((slice) => {
        slice.items.forEach((it) => {
          const key = it.itemName.toLowerCase().trim();
          const lineTotal = it.totalPrice;
          totalEst += lineTotal;

          if (!map.has(key)) {
            map.set(key, {
              itemName: it.itemName,
              itemClass: it.itemClass,
              totalQuantity: 0,
              unit: it.unit,
              avgEstimatedPrice: it.unitPrice,
              totalEstimated: 0,
              requestedByUsers: [],
              prNumbers: [],
            });
          }
          const itemObj = map.get(key)!;
          itemObj.totalQuantity += it.quantity;
          itemObj.totalEstimated += lineTotal;
          const userLabel = `${slice.pr.requesterName} (${slice.pr.department || 'General'})`;
          if (!itemObj.requestedByUsers.includes(userLabel)) {
            itemObj.requestedByUsers.push(userLabel);
          }
          if (!itemObj.prNumbers.includes(slice.prNumber)) {
            itemObj.prNumbers.push(slice.prNumber);
          }
        });
      });
    } else {
      // In Mode 2, aggregate selected demands across active items
      const selectedRows = mode2AllPrRows.filter((r) =>
        selectedSliceIds.includes(r.sliceKey)
      );
      selectedRows.forEach(({ pr, item, itemObj }) => {
        const info = resolveItemInfo(item, pr.currency);
        const qty = Number(item.quantity) || 1;
        const lineTotal = qty * info.unitPrice;
        totalEst += lineTotal;

        const key = itemObj.itemName.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, {
            itemName: itemObj.itemName,
            itemClass: info.itemClass || itemObj.itemClass,
            totalQuantity: 0,
            unit: info.unit,
            avgEstimatedPrice: info.unitPrice,
            totalEstimated: 0,
            requestedByUsers: [],
            prNumbers: [],
          });
        }
        const summaryEntry = map.get(key)!;
        summaryEntry.totalQuantity += qty;
        summaryEntry.totalEstimated += lineTotal;
        const userLabel = `${pr.requesterName} (${pr.department || 'General'})`;
        if (!summaryEntry.requestedByUsers.includes(userLabel)) {
          summaryEntry.requestedByUsers.push(userLabel);
        }
        const prLabel = pr.prNumber || pr.poNumber || pr.id;
        if (!summaryEntry.prNumbers.includes(prLabel)) {
          summaryEntry.prNumbers.push(prLabel);
        }
      });
    }

    return {
      items: Array.from(map.values()),
      grandTotal: totalEst,
    };
  }, [mergeMode, selectedSlices, mode2AllPrRows, selectedSliceIds, resolveItemInfo]);

  // Toggle selection for Mode 1 (Class Slices)
  const handleToggleSelectSlice = (slice: RequisitionClassSlice) => {
    if (!slice.canProcess) {
      if (slice.isOwn) {
        setToast({
          message: `You are the requester of ${slice.prNumber}. A requester cannot convert their own requisition to a PO/RFQ. It has been routed to ${slice.pr.submittedToName || 'the assigned purchase officer'}.`,
          type: 'error',
        });
      } else {
        setToast({
          message: `Only the assigned purchase officer (${slice.pr.submittedToName || 'Assignee'}) or Administrator can convert ${slice.prNumber}.`,
          type: 'error',
        });
      }
      return;
    }

    setSelectedSliceIds((prev) =>
      prev.includes(slice.sliceId) ? prev.filter((i) => i !== slice.sliceId) : [...prev, slice.sliceId]
    );
  };

  // Toggle selection for Mode 2 (Item-level PR demand)
  const handleToggleSelectMode2 = (pr: PurchaseRequisition, itemKey: string) => {
    const sliceKey = `mode2:::${String(pr.id || pr.rfqId)}:::${itemKey}`;
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
    setSelectedSliceIds((prev) =>
      prev.includes(sliceKey) ? prev.filter((id) => id !== sliceKey) : [...prev, sliceKey]
    );
  };

  const handleSelectAllVisible = (slicesList: RequisitionClassSlice[]) => {
    const actionableSlices = slicesList.filter((s) => s.canProcess);
    const actionableIds = actionableSlices.map((s) => s.sliceId);
    if (actionableIds.length === 0) {
      setToast({
        message: 'None of the visible requisitions can be converted by you (you are either the requester or not the assigned purchase officer).',
        type: 'error',
      });
      return;
    }
    const allIn = actionableIds.every((id) => selectedSliceIds.includes(id));
    if (allIn) {
      setSelectedSliceIds((prev) => prev.filter((id) => !actionableIds.includes(id)));
    } else {
      setSelectedSliceIds((prev) => Array.from(new Set([...prev, ...actionableIds])));
    }
  };

  const handleSelectAllVisibleMode2 = () => {
    const actionable = mode2AllPrRows.filter((r) => canUserProcessPr(r.pr));
    const actionableIds = actionable.map((r) => r.sliceKey);
    if (actionableIds.length === 0) {
      setToast({
        message: 'None of the visible requisitions can be converted by you (you are either the requester or not the assigned purchase officer).',
        type: 'error',
      });
      return;
    }
    const allIn = actionableIds.every((id) => selectedSliceIds.includes(id));
    if (allIn) {
      setSelectedSliceIds((prev) => prev.filter((id) => !actionableIds.includes(id)));
    } else {
      setSelectedSliceIds((prev) => Array.from(new Set([...prev, ...actionableIds])));
    }
  };

  // ── RFQ / PO Conversion Handlers ──
  const proceedToCreateRfqForGroup = useCallback(
    (group?: RfqSplitGroup, isCombined = false) => {
      const rawItemsToUse = isCombined || !group
        ? rfqSplitGroups.flatMap((g) => g.items)
        : group.items;

      const itemsToUse = consolidateLineItems(rawItemsToUse);

      const targetCategory = isCombined
        ? rfqSplitGroups[0]?.categoryName || 'Consolidated'
        : group?.categoryName || 'General';

      const sourcePrNums = isCombined
        ? Array.from(new Set(rfqSplitGroups.flatMap((g) => g.sourcePrNumbers)))
        : group?.sourcePrNumbers || [];

      const sourcePrIds = isCombined
        ? Array.from(new Set(rfqSplitGroups.flatMap((g) => g.sourceRequisitionIds)))
        : group?.sourceRequisitionIds || [];

      const defaultTitle = isCombined
        ? `Consolidated RFQ for Requisitions: ${sourcePrNums.join(', ')}`
        : `RFQ for ${targetCategory}: ${sourcePrNums.join(', ')}`;

      const rfqDepartment = selectedSlices[0]?.pr.department || '';
      const resolvedDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const prefillData = {
        fromConsolidation: true,
        requisitionIds: sourcePrIds,
        prNumbers: sourcePrNums,
        title: defaultTitle,
        department: rfqDepartment,
        itemClass: targetCategory,
        description: '',
        closingDate: resolvedDate,
        date: resolvedDate,
        deliveryDate: resolvedDate,
        priority: 'Medium',
        items: itemsToUse,
      };

      try {
        sessionStorage.setItem('heliflow_consolidation_rfq', JSON.stringify(prefillData));
      } catch {}

      setShowSplitRfqModal(false);
      navigate('/rfq/create', { state: prefillData });
    },
    [rfqSplitGroups, selectedSlices, navigate]
  );

  const proceedToCreatePoForGroup = useCallback(
    (group: PoSplitGroup) => {
      const defaultCurrency = group.currency || companyDefaultCurrency || 'USD';
      const prNumbersString = group.sourcePrNumbers.join(', ');

      const formattedItems = consolidateLineItems(group.items).map((it, idx) => ({
        id: String(idx + 1),
        itemCode: it.itemCode,
        itemName: it.itemName,
        description: it.description || '',
        quantity: it.quantity,
        unit: it.unit || 'pcs',
        unitPrice: it.unitPrice,
        taxPercent: 0,
        itemClass: group.supplierCategory || 'General',
        preferredSupplierName: group.supplierName,
        preferredSupplierId: group.supplierId,
      }));

      const prefillData = {
        fromConsolidation: true,
        requisitionIds: group.sourceRequisitionIds,
        prNumbers: prNumbersString,
        itemClass: group.supplierCategory || 'General',
        supplierType: group.supplierCategory || 'General',
        supplierName: group.supplierName,
        supplierId: group.supplierId,
        currency: defaultCurrency,
        items: formattedItems,
      };

      try {
        sessionStorage.setItem('heliflow_consolidation_po', JSON.stringify(prefillData));
      } catch {}

      setShowSplitPoModal(false);
      navigate('/procurement/create-purchase-order', { state: prefillData });
    },
    [companyDefaultCurrency, navigate]
  );

  const handleNavigateToCreateRfq = () => {
    if (selectedSliceIds.length === 0) return;

    // Analyze categories across selected slices/demands
    const groupMap = new Map<string, RfqSplitGroup>();

    if (mergeMode === 'USER') {
      selectedSlices.forEach((slice) => {
        slice.items.forEach((it, idx) => {
          const category = slice.itemClass || it.itemClass || 'General';
          const catKey = category.toLowerCase().trim();
          const prNumber = slice.prNumber;
          const prId = slice.prId;

          const rawItem = {
            id: `item-${Date.now()}-${idx + 1}`,
            itemCode: it.itemCode || `ITEM-${String(idx + 1).padStart(3, '0')}`,
            itemName: it.itemName || it.description || 'Item',
            itemClass: category,
            description: it.description || '',
            quantity: String(it.quantity || 1),
            unit: it.unit || 'pcs',
            expectedDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
            preferredSupplierId: it.preferredSupplierId,
            preferredSupplierName: it.preferredSupplierName,
            sourcePrNumber: prNumber,
            sourcePrId: prId,
          };

          if (!groupMap.has(catKey)) {
            groupMap.set(catKey, {
              categoryKey: catKey,
              categoryName: category,
              items: [rawItem],
              preferredSuppliers: it.preferredSupplierName ? [it.preferredSupplierName] : [],
              sourcePrNumbers: prNumber ? [prNumber] : [],
              sourceRequisitionIds: prId ? [prId] : [],
            });
          } else {
            const grp = groupMap.get(catKey)!;
            grp.items = consolidateLineItems([...grp.items, rawItem]);
            if (it.preferredSupplierName && !grp.preferredSuppliers.includes(it.preferredSupplierName)) {
              grp.preferredSuppliers.push(it.preferredSupplierName);
            }
            if (prNumber && !grp.sourcePrNumbers.includes(prNumber)) {
              grp.sourcePrNumbers.push(prNumber);
            }
            if (prId && !grp.sourceRequisitionIds.includes(prId)) {
              grp.sourceRequisitionIds.push(prId);
            }
          }
        });
      });
    } else {
      const selectedRows = mode2AllPrRows.filter((r) =>
        selectedSliceIds.includes(r.sliceKey)
      );
      selectedRows.forEach(({ pr, item, itemObj }, idx) => {
        const info = resolveItemInfo(item, pr.currency);
        const category = info.itemClass || itemObj.itemClass || 'General';
        const catKey = category.toLowerCase().trim();
        const prNumber = pr.prNumber || pr.poNumber || pr.id;
        const prId = String(pr.id || pr.rfqId);

        const rawItem = {
          id: `item-${Date.now()}-${idx + 1}`,
          itemCode: item.itemCode || info.matched?.itemCode || `ITEM-${String(idx + 1).padStart(3, '0')}`,
          itemName: itemObj.itemName,
          itemClass: category,
          description: item.description || '',
          quantity: String(item.quantity || 1),
          unit: info.unit || 'pcs',
          expectedDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          preferredSupplierId: info.preferredSupplierId,
          preferredSupplierName: info.preferredSupplierName,
          sourcePrNumber: prNumber,
          sourcePrId: prId,
        };

        if (!groupMap.has(catKey)) {
          groupMap.set(catKey, {
            categoryKey: catKey,
            categoryName: category,
            items: [rawItem],
            preferredSuppliers: info.preferredSupplierName ? [info.preferredSupplierName] : [],
            sourcePrNumbers: prNumber ? [prNumber] : [],
            sourceRequisitionIds: prId ? [prId] : [],
          });
        } else {
          const grp = groupMap.get(catKey)!;
          grp.items = consolidateLineItems([...grp.items, rawItem]);
          if (info.preferredSupplierName && !grp.preferredSuppliers.includes(info.preferredSupplierName)) {
            grp.preferredSuppliers.push(info.preferredSupplierName);
          }
          if (prNumber && !grp.sourcePrNumbers.includes(prNumber)) {
            grp.sourcePrNumbers.push(prNumber);
          }
          if (prId && !grp.sourceRequisitionIds.includes(prId)) {
            grp.sourceRequisitionIds.push(prId);
          }
        }
      });
    }

    const groups = Array.from(groupMap.values());
    if (groups.length <= 1) {
      proceedToCreateRfqForGroup(groups[0]);
    } else {
      setRfqSplitGroups(groups);
      setShowSplitRfqModal(true);
    }
  };

  const handleNavigateToCreatePo = () => {
    if (selectedSliceIds.length === 0) return;

    // Analyze preferred suppliers across selected slices/demands
    const groupMap = new Map<string, PoSplitGroup>();

    if (mergeMode === 'USER') {
      selectedSlices.forEach((slice) => {
        slice.items.forEach((it) => {
          const supplierName = it.preferredSupplierName || slice.pr.vendorName || 'Unassigned Supplier';
          const supplierKey = supplierName.toLowerCase().trim();
          const prNumber = slice.prNumber;
          const prId = slice.prId;
          const qty = Number(it.quantity) || 1;
          const unitPrice = Number(it.unitPrice) || 0;
          const lineTotal = qty * unitPrice;

          const rawItem = {
            id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            itemCode: it.itemCode || 'ITEM',
            itemName: it.itemName || it.description || 'Item',
            description: it.description || '',
            quantity: qty,
            unit: it.unit || 'pcs',
            unitPrice,
            sourcePrNumber: prNumber,
            sourcePrId: prId,
          };

          if (!groupMap.has(supplierKey)) {
            groupMap.set(supplierKey, {
              supplierKey,
              supplierId: it.preferredSupplierId,
              supplierName,
              isPreferred: Boolean(it.preferredSupplierName),
              supplierCategory: slice.itemClass,
              currency: slice.pr.currency || companyDefaultCurrency || 'USD',
              totalAmount: lineTotal,
              items: [rawItem],
              sourcePrNumbers: prNumber ? [prNumber] : [],
              sourceRequisitionIds: prId ? [prId] : [],
            });
          } else {
            const grp = groupMap.get(supplierKey)!;
            grp.items = consolidateLineItems([...grp.items, rawItem]);
            grp.totalAmount = grp.items.reduce(
              (sum, itm) => sum + (Number(itm.quantity) || 0) * (Number(itm.unitPrice) || 0),
              0
            );
            if (prNumber && !grp.sourcePrNumbers.includes(prNumber)) {
              grp.sourcePrNumbers.push(prNumber);
            }
            if (prId && !grp.sourceRequisitionIds.includes(prId)) {
              grp.sourceRequisitionIds.push(prId);
            }
          }
        });
      });
    } else {
      const selectedRows = mode2AllPrRows.filter((r) =>
        selectedSliceIds.includes(r.sliceKey)
      );
      selectedRows.forEach(({ pr, item, itemObj }) => {
        const info = resolveItemInfo(item, pr.currency);
        const supplierName = info.preferredSupplierName || pr.vendorName || 'Unassigned Supplier';
        const supplierKey = supplierName.toLowerCase().trim();
        const prNumber = pr.prNumber || pr.poNumber || pr.id;
        const prId = String(pr.id || pr.rfqId);
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(info.unitPrice) || 0;
        const lineTotal = qty * unitPrice;

        const rawItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          itemCode: item.itemCode || info.matched?.itemCode || 'ITEM',
          itemName: itemObj.itemName,
          description: item.description || '',
          quantity: qty,
          unit: info.unit || 'pcs',
          unitPrice,
          sourcePrNumber: prNumber,
          sourcePrId: prId,
        };

        if (!groupMap.has(supplierKey)) {
          groupMap.set(supplierKey, {
            supplierKey,
            supplierId: info.preferredSupplierId,
            supplierName,
            isPreferred: Boolean(info.preferredSupplierName),
            supplierCategory: info.itemClass || itemObj.itemClass,
            currency: pr.currency || companyDefaultCurrency || 'USD',
            totalAmount: lineTotal,
            items: [rawItem],
            sourcePrNumbers: prNumber ? [prNumber] : [],
            sourceRequisitionIds: prId ? [prId] : [],
          });
        } else {
          const grp = groupMap.get(supplierKey)!;
          grp.items = consolidateLineItems([...grp.items, rawItem]);
          grp.totalAmount = grp.items.reduce(
            (sum, itm) => sum + (Number(itm.quantity) || 0) * (Number(itm.unitPrice) || 0),
            0
          );
          if (prNumber && !grp.sourcePrNumbers.includes(prNumber)) {
            grp.sourcePrNumbers.push(prNumber);
          }
          if (prId && !grp.sourceRequisitionIds.includes(prId)) {
            grp.sourceRequisitionIds.push(prId);
          }
        }
      });
    }

    const groups = Array.from(groupMap.values());
    if (groups.length <= 1) {
      proceedToCreatePoForGroup(groups[0]);
    } else {
      setPoSplitGroups(groups);
      setShowSplitPoModal(true);
    }
  };

  // Auto-fetch Date and Description from selected PRs when RFQ modal opens
  useEffect(() => {
    if (showRfqModal && selectedSlices.length > 0) {
      setRfqDescription('');

      const prDate =
        selectedSlices.find((s) => s.pr.deliveryDate)?.pr.deliveryDate ||
        selectedSlices[0]?.pr.deliveryDate ||
        selectedSlices[0]?.pr.poDate ||
        selectedSlices[0]?.pr.createdAt;
      if (prDate) {
        setRfqClosingDate(new Date(prDate).toISOString().slice(0, 10));
      }
    }
  }, [showRfqModal, selectedSlices]);

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
        description: rfqDescription,
      });

      const rfqNumber = res.rfqNumber || res.rfq?.rfqNumber || 'New RFQ';
      const rfqId = res.rfq?.id;

      setToast({
        message: `Successfully floated consolidated RFQ #${rfqNumber} from ${selectedPrIds.length} requisition(s)!`,
        type: 'success',
        link: rfqId ? { text: `View RFQ #${rfqNumber}`, url: `/rfq/${rfqId}` } : undefined,
      });

      setSelectedSliceIds([]);
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

      setSelectedSliceIds([]);
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
            onClick={() => {
              setMergeMode('ITEM');
              setSelectedItemModeCategoryFilter('ALL');
            }}
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
              <Card className="p-4 relative z-30">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="size-4 text-primary" /> Select Requester / User
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Pick a user to view their requisitions, filter by Product Class, and consolidate matching items.
                    </p>
                  </div>

                  {/* Dropdown for Requester */}
                  <div className="relative w-full md:w-80 lg:w-96 shrink-0" ref={userDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserDropdownOpen((prev) => !prev);
                        setIsItemDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full min-h-[46px] px-3.5 py-2 rounded-xl border transition-all flex items-center justify-between gap-3 text-left shadow-xs cursor-pointer',
                        isUserDropdownOpen
                          ? 'border-primary ring-2 ring-primary/20 bg-accent/30'
                          : 'border-border/80 bg-card hover:bg-muted/40 hover:border-primary/40'
                      )}
                      aria-haspopup="listbox"
                      aria-expanded={isUserDropdownOpen}
                    >
                      {currentUserObj ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-7 rounded-full bg-primary/10 text-primary font-bold text-xs grid place-items-center shrink-0">
                            {currentUserObj.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-foreground truncate max-w-[150px] sm:max-w-[180px]">
                                {currentUserObj.name}
                              </span>
                              {currentUserObj.isMine && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] py-0 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 shrink-0"
                                >
                                  You
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10.5px] text-muted-foreground block truncate">
                              {currentUserObj.department} • {currentUserObj.prs.length} PR{currentUserObj.prs.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <User className="size-4" />
                          <span>Select a requester...</span>
                        </div>
                      )}
                      <ChevronDown
                        className={cn(
                          'size-4 text-muted-foreground transition-transform duration-200 shrink-0',
                          isUserDropdownOpen && 'rotate-180'
                        )}
                      />
                    </button>

                    {/* Popover Menu */}
                    {isUserDropdownOpen && (
                      <div className="absolute right-0 left-0 md:left-auto md:w-96 top-full mt-1.5 rounded-xl bg-card border border-border shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {/* Search Input inside Dropdown */}
                        <div className="p-2.5 border-b border-border/60 bg-muted/20">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <Input
                              type="text"
                              autoFocus
                              placeholder="Search requester name, dept, email..."
                              value={userSearchTerm}
                              onChange={(e) => setUserSearchTerm(e.target.value)}
                              className="h-8 pl-8 pr-2.5 text-xs bg-background rounded-lg border-border/70 focus-visible:ring-1"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>

                        {/* List of Requesters */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-border/40 py-1">
                          {filteredUsers.length === 0 ? (
                            <div className="px-4 py-5 text-xs text-muted-foreground text-center italic">
                              No requesters matching &quot;{userSearchTerm}&quot;
                            </div>
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
                                    setIsUserDropdownOpen(false);
                                  }}
                                  className={cn(
                                    'w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer',
                                    isSelected
                                      ? 'bg-primary/10 text-primary'
                                      : 'hover:bg-muted/60 text-foreground'
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className={cn(
                                        'size-7 rounded-full grid place-items-center text-xs font-bold shrink-0',
                                        isSelected
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-primary/10 text-primary'
                                      )}
                                    >
                                      {u.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn('text-xs truncate max-w-[180px]', isSelected ? 'font-bold' : 'font-medium')}>
                                          {u.name}
                                        </span>
                                        {u.isMine && (
                                          <Badge
                                            variant="outline"
                                            className="text-[9px] py-0 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                                          >
                                            You
                                          </Badge>
                                        )}
                                      </div>
                                      <span className="text-[10px] text-muted-foreground block truncate">
                                        {u.department} • {u.prs.length} PR{u.prs.length > 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  </div>
                                  {isSelected && <Check className="size-4 text-primary shrink-0" />}
                                </button>
                              );
                            })
                          )}
                        </div>

                        {/* Footer Info */}
                        <div className="px-3.5 py-2 border-t border-border/50 bg-muted/15 text-[10.5px] text-muted-foreground flex items-center justify-between">
                          <span>{uniqueUsers.length} requester{uniqueUsers.length !== 1 ? 's' : ''} with active PRs</span>
                          {userSearchTerm && <span>{filteredUsers.length} found</span>}
                        </div>
                      </div>
                    )}
                  </div>
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
                  {/* Category Filter Dropdown (Product Class Filter) */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 border border-border/60 rounded-xl p-3">
                    <div className="flex items-center gap-2.5">
                      <label htmlFor="item-class-filter-select" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
                        <Filter className="size-3.5 text-primary" /> Item Class:
                      </label>
                      <select
                        id="item-class-filter-select"
                        value={selectedCategoryFilter}
                        onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                        className="h-8 min-w-[190px] rounded-lg border border-input bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                        aria-label="Filter by Item Class"
                      >
                        {currentUserCategories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat === 'ALL' ? 'All Classes' : cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Batch select visible button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSelectAllVisible(userFilteredSlices)}
                      className="text-xs h-8 gap-1.5"
                    >
                      {userFilteredSlices.length > 0 &&
                      userFilteredSlices.filter((s) => s.canProcess).every((s) => selectedSliceIds.includes(s.sliceId))
                        ? 'Deselect All'
                        : `Select All Actionable (${userFilteredSlices.filter((s) => s.canProcess).length})`}
                    </Button>
                  </div>

                  {/* PR Cards Grid - Distributed by Item Class */}
                  <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                    {userFilteredSlices.map((slice) => {
                      const isSelected = selectedSliceIds.includes(slice.sliceId);
                      const canProcess = slice.canProcess;
                      const isOwn = slice.isOwn;

                      return (
                        <div
                          key={slice.sliceId}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleToggleSelectSlice(slice)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') handleToggleSelectSlice(slice);
                          }}
                          className={cn(
                            'rounded-xl border p-4 text-left transition-all relative flex flex-col justify-between',
                            !canProcess
                              ? 'opacity-85 bg-muted/20 border-border/60 cursor-not-allowed'
                              : isSelected
                              ? 'border-primary bg-primary/[0.05] ring-1 ring-primary/40 shadow-xs cursor-pointer'
                              : 'border-border/70 bg-card hover:border-primary/40 hover:bg-muted/20 cursor-pointer'
                          )}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-3 mb-2.5">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-bold text-primary">
                                    {slice.prNumber}
                                  </span>
                                  <Badge variant="outline" className="text-[10.5px] font-medium bg-muted/30">
                                    {slice.itemClass}
                                  </Badge>
                                </div>
                                <span className="text-xs text-muted-foreground block mt-0.5">
                                  {slice.pr.department} • Requester: {slice.pr.requesterName}
                                </span>
                                {isOwn ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-medium"
                                  >
                                    Requested by You • Route to: {slice.pr.submittedToName || 'Purchase Officer'}
                                  </Badge>
                                ) : !canProcess ? (
                                  <Badge
                                    variant="outline"
                                    className="mt-1 text-[10px] bg-muted text-muted-foreground border-border font-medium"
                                  >
                                    Assigned to: {slice.pr.submittedToName || 'Purchase Officer'}
                                  </Badge>
                                ) : null}
                              </div>

                              {!canProcess ? (
                                <div
                                  className="size-5 rounded grid place-items-center border border-border/50 bg-muted/50 text-muted-foreground shrink-0"
                                  title={
                                    isOwn
                                      ? `You are the requester. Routed to ${slice.pr.submittedToName || 'purchase officer'} for conversion.`
                                      : `Only ${slice.pr.submittedToName || 'assigned purchase officer'} can convert.`
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

                            {/* Items Breakdown inside card (specific to this itemClass) */}
                            <div className="space-y-1.5 border-t border-border/50 pt-2.5 my-2 text-xs">
                              {slice.items.map((it: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-muted-foreground">
                                  <div className="min-w-0 pr-2">
                                    <span className="font-medium text-foreground truncate block max-w-[170px]" title={it.itemName}>
                                      {it.itemName}
                                    </span>
                                    {it.preferredSupplierName && (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 block truncate">
                                        ★ {it.preferredSupplierName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="tabular-nums font-medium block">
                                      {it.quantity} {it.unit}
                                    </span>
                                    {it.unitPrice > 0 && (
                                      <span className="text-[10px] text-muted-foreground block">
                                        {formatAmount(it.totalPrice, companyDefaultCurrency)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {slice.sliceTotal > 0 && (
                            <div className="pt-2 mt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Est. Total</span>
                              <span className="font-semibold text-foreground">
                                {formatAmount(slice.sliceTotal, companyDefaultCurrency)}
                              </span>
                            </div>
                          )}
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
              <Card className="p-4 relative z-30">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Boxes className="size-4 text-primary" /> Select Item / Product Demand
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Pick a requested item to aggregate requisitions across all departments.
                    </p>
                  </div>

                  {/* Dropdowns: Item Class Filter + Item Selector */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full lg:w-auto">
                    {/* Item Class Dropdown */}
                    <div className="flex items-center gap-2">
                      <label htmlFor="mode2-item-class-select" className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 whitespace-nowrap cursor-pointer">
                        <Filter className="size-3.5 text-primary" /> Item Class:
                      </label>
                      <select
                        id="mode2-item-class-select"
                        value={selectedItemModeCategoryFilter}
                        onChange={(e) => setSelectedItemModeCategoryFilter(e.target.value)}
                        className="h-[46px] min-w-[170px] rounded-xl border border-input bg-card px-3 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-accent/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 cursor-pointer"
                        aria-label="Filter by Item Class"
                      >
                        {allMode2ItemClasses.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat === 'ALL' ? 'All Classes' : cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Dropdown for Item */}
                    <div className="relative w-full sm:w-80 lg:w-96 shrink-0" ref={itemDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsItemDropdownOpen((prev) => !prev);
                        setIsUserDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full min-h-[46px] px-3.5 py-2 rounded-xl border transition-all flex items-center justify-between gap-3 text-left shadow-xs cursor-pointer',
                        isItemDropdownOpen
                          ? 'border-primary ring-2 ring-primary/20 bg-accent/30'
                          : 'border-border/80 bg-card hover:bg-muted/40 hover:border-primary/40'
                      )}
                      aria-haspopup="listbox"
                      aria-expanded={isItemDropdownOpen}
                    >
                      {selectedItemKey === 'ALL' ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-7 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
                            <Boxes className="size-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-foreground truncate max-w-[150px] sm:max-w-[180px]">
                                All Items
                              </span>
                              <Badge variant="outline" className="text-[9.5px] py-0 px-1 bg-muted/40 shrink-0">
                                {selectedItemModeCategoryFilter === 'ALL' ? 'All Classes' : selectedItemModeCategoryFilter}
                              </Badge>
                            </div>
                            <span className="text-[10.5px] text-muted-foreground block truncate">
                              {mode2CategoryItems.length} Item{mode2CategoryItems.length !== 1 ? 's' : ''} • {mode2AllPrRows.length} Demand{mode2AllPrRows.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      ) : currentItemObj ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="size-7 rounded-full bg-primary/10 text-primary grid place-items-center shrink-0">
                            <Package className="size-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-foreground truncate max-w-[150px] sm:max-w-[180px]">
                                {currentItemObj.itemName}
                              </span>
                              <Badge variant="outline" className="text-[9.5px] py-0 px-1 bg-muted/40 shrink-0">
                                {currentItemObj.itemClass}
                              </Badge>
                            </div>
                            <span className="text-[10.5px] text-muted-foreground block truncate">
                              {currentItemObj.totalQty} {currentItemObj.unit} • {currentItemObj.prs.length} Requisition{currentItemObj.prs.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <Package className="size-4" />
                          <span>Select an item...</span>
                        </div>
                      )}
                      <ChevronDown
                        className={cn(
                          'size-4 text-muted-foreground transition-transform duration-200 shrink-0',
                          isItemDropdownOpen && 'rotate-180'
                        )}
                      />
                    </button>

                    {/* Popover Menu */}
                    {isItemDropdownOpen && (
                      <div className="absolute right-0 left-0 md:left-auto md:w-96 top-full mt-1.5 rounded-xl bg-card border border-border shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                        {/* Search Input inside Dropdown */}
                        <div className="p-2.5 border-b border-border/60 bg-muted/20">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <Input
                              type="text"
                              autoFocus
                              placeholder="Search item name or class..."
                              value={itemSearchTerm}
                              onChange={(e) => setItemSearchTerm(e.target.value)}
                              className="h-8 pl-8 pr-2.5 text-xs bg-background rounded-lg border-border/70 focus-visible:ring-1"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>

                        {/* List of Items */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-border/40 py-1">
                          {/* "All Items" Option at top */}
                          {mode2CategoryItems.length > 0 &&
                            (!itemSearchTerm.trim() || 'all items'.includes(itemSearchTerm.toLowerCase())) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedItemKey('ALL');
                                  setIsItemDropdownOpen(false);
                                }}
                                className={cn(
                                  'w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer bg-muted/10',
                                  selectedItemKey === 'ALL'
                                    ? 'bg-primary/10 text-primary'
                                    : 'hover:bg-muted/60 text-foreground'
                                )}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div
                                    className={cn(
                                      'size-7 rounded-full grid place-items-center shrink-0',
                                      selectedItemKey === 'ALL'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-primary/10 text-primary'
                                    )}
                                  >
                                    <Boxes className="size-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn('text-xs truncate max-w-[180px]', selectedItemKey === 'ALL' ? 'font-bold' : 'font-medium')}>
                                        All Items
                                      </span>
                                      <Badge variant="outline" className="text-[9.5px] py-0 px-1 bg-muted/40">
                                        {selectedItemModeCategoryFilter === 'ALL' ? 'All Classes' : selectedItemModeCategoryFilter}
                                      </Badge>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground block truncate">
                                      {mode2CategoryItems.length} Demanded Items • All Demands
                                    </span>
                                  </div>
                                </div>
                                {selectedItemKey === 'ALL' && <Check className="size-4 text-primary shrink-0" />}
                              </button>
                            )}

                          {filteredItems.length === 0 ? (
                            <div className="px-4 py-5 text-xs text-muted-foreground text-center italic">
                              No items matching &quot;{itemSearchTerm}&quot;
                            </div>
                          ) : (
                            filteredItems.map((item) => {
                              const isSelected = selectedItemKey === item.key;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => {
                                    setSelectedItemKey(item.key);
                                    setIsItemDropdownOpen(false);
                                  }}
                                  className={cn(
                                    'w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-2.5 transition-colors cursor-pointer',
                                    isSelected
                                      ? 'bg-primary/10 text-primary'
                                      : 'hover:bg-muted/60 text-foreground'
                                  )}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div
                                      className={cn(
                                        'size-7 rounded-full grid place-items-center shrink-0',
                                        isSelected
                                          ? 'bg-primary text-primary-foreground'
                                          : 'bg-primary/10 text-primary'
                                      )}
                                    >
                                      <Package className="size-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn('text-xs truncate max-w-[180px]', isSelected ? 'font-bold' : 'font-medium')}>
                                          {item.itemName}
                                        </span>
                                        <Badge variant="outline" className="text-[9.5px] py-0 px-1 bg-muted/40">
                                          {item.itemClass}
                                        </Badge>
                                      </div>
                                      <span className="text-[10px] text-muted-foreground block truncate">
                                        {item.totalQty} {item.unit} • {item.prs.length} Requisition{item.prs.length > 1 ? 's' : ''}
                                      </span>
                                    </div>
                                  </div>
                                  {isSelected && <Check className="size-4 text-primary shrink-0" />}
                                </button>
                              );
                            })
                          )}
                        </div>

                        {/* Footer Info */}
                        <div className="px-3.5 py-2 border-t border-border/50 bg-muted/15 text-[10.5px] text-muted-foreground flex items-center justify-between">
                          <span>{uniqueItems.length} demanded item{uniqueItems.length !== 1 ? 's' : ''}</span>
                          {itemSearchTerm && <span>{filteredItems.length} found</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>

              {/* Item Cross-User Breakdown */}
              {(selectedItemKey === 'ALL' || currentItemObj) && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between bg-muted/20 border border-border/60 rounded-xl p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">
                        Matching Requisitions for:{' '}
                        <strong>
                          {selectedItemKey === 'ALL' ? 'All Items' : currentItemObj?.itemName}
                        </strong>
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {selectedItemKey === 'ALL'
                          ? selectedItemModeCategoryFilter === 'ALL'
                            ? 'All Classes'
                            : selectedItemModeCategoryFilter
                          : currentItemObj?.itemClass}
                      </Badge>
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                        {selectedItemKey === 'ALL'
                          ? `${mode2CategoryItems.length} Unique Items • ${mode2AllPrRows.length} Demands`
                          : `Total Demand: ${currentItemObj?.totalQty} ${currentItemObj?.unit}`}
                      </Badge>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAllVisibleMode2}
                      className="text-xs h-8 gap-1.5"
                    >
                      {mode2AllPrRows.length > 0 &&
                      mode2AllPrRows
                        .filter((p) => canUserProcessPr(p.pr))
                        .every((p) => selectedSliceIds.includes(p.sliceKey))
                        ? 'Deselect All'
                        : `Select All Actionable (${mode2AllPrRows.filter((p) => canUserProcessPr(p.pr)).length})`}
                    </Button>
                  </div>

                  {/* Cross-User Table */}
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border/70 bg-muted/35 text-left text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <th className="w-11 px-4 py-3 text-center">Select</th>
                            {selectedItemKey === 'ALL' && <th className="px-4 py-3">Item / Product</th>}
                            <th className="px-4 py-3">Requester & Dept</th>
                            <th className="px-4 py-3">Requisition #</th>
                            <th className="px-4 py-3 text-right pr-6">Demanded Qty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {mode2AllPrRows.length === 0 ? (
                            <tr>
                              <td colSpan={selectedItemKey === 'ALL' ? 5 : 4} className="px-4 py-8 text-center text-xs text-muted-foreground italic">
                                No matching requisition demands found.
                              </td>
                            </tr>
                          ) : (
                            mode2AllPrRows.map(({ pr, item, itemObj, sliceKey }) => {
                              const isSelected = selectedSliceIds.includes(sliceKey);
                              const qty = Number(item.quantity) || 1;
                              const canProcess = canUserProcessPr(pr);
                              const isOwn = isOwnPr(pr);

                              return (
                                <tr
                                  key={sliceKey}
                                  onClick={() => handleToggleSelectMode2(pr, itemObj.key)}
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
                                        onChange={() => handleToggleSelectMode2(pr, itemObj.key)}
                                        className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                                      />
                                    )}
                                  </td>
                                  {selectedItemKey === 'ALL' && (
                                    <td className="px-4 py-3.5">
                                      <div className="flex items-center gap-2">
                                        <div className="size-6 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
                                          <Package className="size-3" />
                                        </div>
                                        <div>
                                          <span className="font-semibold text-xs text-foreground block">
                                            {itemObj.itemName}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {itemObj.itemClass}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                  )}
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
                                  <td className="px-4 py-3.5 text-right pr-6 font-bold text-foreground">
                                    {qty} {item.unit || 'pcs'}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* FLOATING ACTION WORKBENCH (Bottom bar when PR Slices are selected)        */}
          {/* ========================================================================= */}
          {selectedSliceIds.length > 0 && (
            <div className="sticky bottom-4 z-20 rounded-2xl border border-primary/40 bg-card/95 backdrop-blur-md p-4 shadow-xl animate-in fade-in slide-in-from-bottom-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                    <CheckSquare className="size-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground flex items-center gap-2">
                      <span>{selectedSliceIds.length} Requisition Item Class Slice(s) Selected</span>
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
                      {distinctPrNumbers.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-md">
                            PRs: {distinctPrNumbers.join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Conversion Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSliceIds([])}
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
                        <Send className="size-4 text-emerald-600" /> Float RFQ ({selectedSliceIds.length})
                      </Button>

                      {/* Option 1: Direct PO */}
                      <Button
                        size="sm"
                        onClick={handleNavigateToCreatePo}
                        className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs"
                      >
                        <ShoppingCart className="size-4" /> Create Direct PO ({selectedSliceIds.length})
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

      {/* Split PO by Preferred Supplier Modal */}
      <Dialog open={showSplitPoModal} onOpenChange={(open) => !open && setShowSplitPoModal(false)}>
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <ShoppingCart className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Split Purchase Order by Preferred Supplier</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  The selected requisition items have different preferred suppliers. ERP business logic requires 1 PO per supplier. Select a supplier group to generate its PO:
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            {poSplitGroups.map((group, idx) => (
              <Card key={`${group.supplierKey}-${idx}`} className="p-4 border rounded-xl hover:border-primary/50 transition-all bg-card/60 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {group.supplierName}
                      </span>
                      {group.isPreferred && (
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 text-[11px] font-medium">
                          ★ Preferred Supplier
                        </Badge>
                      )}
                      {group.supplierCategory && (
                        <Badge variant="outline" className="text-[11px] bg-muted/40 font-normal">
                          {group.supplierCategory}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{group.items.length} item{group.items.length > 1 ? 's' : ''}</span>
                      {group.totalAmount > 0 && (
                        <>
                          <span>•</span>
                          <span>Est. Total: <strong className="text-foreground">{formatAmount(group.totalAmount, group.currency || companyDefaultCurrency)}</strong></span>
                        </>
                      )}
                      {group.sourcePrNumbers.length > 0 && (
                        <>
                          <span>•</span>
                          <span>PR: {group.sourcePrNumbers.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 font-medium"
                    onClick={() => proceedToCreatePoForGroup(group)}
                  >
                    <ShoppingCart className="size-4" />
                    Create PO for {group.supplierName}
                  </Button>
                </div>

                {/* Items Preview Table */}
                <div className="mt-2.5 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left">
                        <th className="pb-1 font-medium">Item Code</th>
                        <th className="pb-1 font-medium">Item Name</th>
                        <th className="pb-1 text-right font-medium">Qty</th>
                        <th className="pb-1 text-right font-medium">Unit Price</th>
                        <th className="pb-1 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {group.items.map((it: any, iIdx: number) => (
                        <tr key={it.id || iIdx} className="hover:bg-muted/40">
                          <td className="py-1 font-mono text-muted-foreground">{it.itemCode}</td>
                          <td className="py-1 font-medium text-foreground">{it.itemName}</td>
                          <td className="py-1 text-right">{it.quantity} {it.unit}</td>
                          <td className="py-1 text-right">{formatAmount(it.unitPrice, group.currency || companyDefaultCurrency)}</td>
                          <td className="py-1 text-right font-semibold text-foreground">
                            {formatAmount(it.quantity * it.unitPrice, group.currency || companyDefaultCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between items-center gap-2 pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              Total {poSplitGroups.length} supplier group{poSplitGroups.length > 1 ? 's' : ''} detected
            </div>
            <Button variant="outline" onClick={() => setShowSplitPoModal(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split RFQ by Category Modal */}
      <Dialog open={showSplitRfqModal} onOpenChange={(open) => !open && setShowSplitRfqModal(false)}>
        <DialogContent className="sm:max-w-[760px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Layers className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Category-wise Split for RFQ</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  The selected requisition items span across multiple categories. Floating category-specific RFQs invites targeted, qualified suppliers. Select a category below to create an RFQ:
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            {rfqSplitGroups.map((group, idx) => (
              <Card key={`${group.categoryKey}-${idx}`} className="p-4 border rounded-xl hover:border-primary/50 transition-all bg-card/60 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {group.categoryName}
                      </span>
                      <Badge variant="secondary" className="bg-primary/10 text-primary border border-primary/20 text-[11px] font-medium">
                        Category
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{group.items.length} item{group.items.length > 1 ? 's' : ''}</span>
                      {group.preferredSuppliers.length > 0 && (
                        <>
                          <span>•</span>
                          <span>Preferred: <strong className="text-foreground">{group.preferredSuppliers.join(', ')}</strong></span>
                        </>
                      )}
                      {group.sourcePrNumbers.length > 0 && (
                        <>
                          <span>•</span>
                          <span>PR: {group.sourcePrNumbers.join(', ')}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs shrink-0 font-medium"
                    onClick={() => proceedToCreateRfqForGroup(group)}
                  >
                    <Send className="size-4" />
                    Create RFQ for {group.categoryName}
                  </Button>
                </div>

                {/* Items Preview Table */}
                <div className="mt-2.5 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left">
                        <th className="pb-1 font-medium">Item Code</th>
                        <th className="pb-1 font-medium">Item Name</th>
                        <th className="pb-1 text-right font-medium">Qty</th>
                        <th className="pb-1 font-medium">Preferred Supplier</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {group.items.map((it: any, iIdx: number) => (
                        <tr key={it.id || iIdx} className="hover:bg-muted/40">
                          <td className="py-1 font-mono text-muted-foreground">{it.itemCode}</td>
                          <td className="py-1 font-medium text-foreground">{it.itemName}</td>
                          <td className="py-1 text-right">{it.quantity} {it.unit}</td>
                          <td className="py-1 text-muted-foreground">
                            {it.preferredSupplierName ? (
                              <span className="text-amber-700 dark:text-amber-400 font-medium">★ {it.preferredSupplierName}</span>
                            ) : (
                              <span className="text-muted-foreground/60">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>

          <DialogFooter className="flex justify-end items-center gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => setShowSplitRfqModal(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
