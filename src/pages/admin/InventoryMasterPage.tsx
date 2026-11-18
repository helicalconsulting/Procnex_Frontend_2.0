import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Boxes,
  Plus,
  Download,
  Search,
  RotateCcw,
  Edit3,
  Trash2,
  Check,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  ClipboardList,
  Percent,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import {
  itemMasterService,
  type ItemMaster,
  type ItemMasterStats,
  type CreateItemMasterPayload,
  type ItemType,
  type ItemStatus,
} from '../../services/itemMasterService';
import { PageFrame, PageLead, MetricCard, EmptyState } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input, Select, Textarea } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
import { TablePagination, getPaginationPages } from '../../components/shared/TablePagination';
import { sseClient } from '../../services/sseClient';
import { cn } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { isAdmin } from '../../utils/rbac';
import { companySettingsService, type ItemClass } from '../../services/companySettingsService';
import ColumnSettingsButton from '../../components/shared/ColumnSettingsButton';
import ColumnCustomizer, { type ColDescriptor } from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import './InventoryMasterPage.css';

interface InventoryColumnDef extends ColDescriptor {
  defaultVisible?: boolean;
}

const INVENTORY_COLUMNS: InventoryColumnDef[] = [
  { key: 'itemCode', label: 'Item Code', required: true, defaultVisible: true },
  { key: 'itemName', label: 'Item Name', required: true, defaultVisible: true },
  { key: 'productClass', label: 'Product Class', defaultVisible: true },
  { key: 'uom', label: 'UoM', defaultVisible: false },
  { key: 'tax', label: 'Tax', defaultVisible: false },
  { key: 'availableForPr', label: 'PR', defaultVisible: true },
  { key: 'availableForRfq', label: 'RFQ', defaultVisible: true },
  { key: 'preferredSupplier', label: 'Preferred Supplier', defaultVisible: true },
  { key: 'stdPrice', label: 'Std Price', defaultVisible: true },
];

const DEFAULT_STATS: ItemMasterStats = {
  totalItems: 0,
  active: 0,
  pendingApproval: 0,
  availableForPr: 0,
  availableForRfq: 0,
  taxExempt: 0,
};

const ITEM_TYPES: ItemType[] = [
  'Fixed asset',
  'Non-stock / consumable',
  'Service',
  'Stock / Raw Material',
];

const TAX_TREATMENTS = [
  'Taxable 5%',
  'Taxable 16%',
  'Exempt',
  'Zero-rated',
  'Out of scope',
];

const CURRENCIES = ['AED', 'USD', 'EUR', 'INR', 'KES', 'SAR', 'GBP'];

export const InventoryMasterPage: React.FC = () => {
  const { hasPermission, roles } = useAuth();
  const isUserAdmin = isAdmin(roles);
  const canCreateItem = isUserAdmin || hasPermission('Inventory & Item Master', 'canCreate');
  const canApproveItem = isUserAdmin || hasPermission('Inventory & Item Master', 'canApprove');

  // State
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [companyItemClasses, setCompanyItemClasses] = useState<ItemClass[]>([]);
  const [stats, setStats] = useState<ItemMasterStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Column Customizer State
  const defaultOrder = useMemo(() => INVENTORY_COLUMNS.map((c) => c.key), []);
  const defaultVisible = useMemo(() => new Set(INVENTORY_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)), []);

  const STORAGE_KEY = 'inventory-master-table-columns-v4';
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.order)) {
          const filtered = parsed.order.filter((k: string) => defaultOrder.includes(k));
          if (filtered.length > 0) return [...new Set([...filtered, ...defaultOrder])];
        }
      }
    } catch {}
    return defaultOrder;
  });

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.visible)) {
          return new Set(parsed.visible.filter((k: string) => defaultOrder.includes(k)));
        }
      }
    } catch {}
    return defaultVisible;
  });

  const [showColPanel, setShowColPanel] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          order: columnOrder,
          visible: Array.from(visibleKeys),
        })
      );
    } catch {}
  }, [columnOrder, visibleKeys]);

  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => visibleKeys.has(k)),
    [columnOrder, visibleKeys]
  );

  const handleToggleColumn = useCallback((key: string) => {
    const col = INVENTORY_COLUMNS.find((c) => c.key === key);
    if (!col || col.required) return;
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleResetColumns = useCallback(() => {
    setColumnOrder(defaultOrder);
    setVisibleKeys(new Set(defaultVisible));
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('column-preferences-inventory-master-table');
      localStorage.removeItem('column-preferences-inventory-master-table-v2');
    } catch {}
  }, [defaultOrder, defaultVisible]);

  // Load Item Classes from Company Settings
  useEffect(() => {
    let isMounted = true;
    const loadItemClasses = () => {
      companySettingsService
        .listItemClasses(false)
        .then((classes) => {
          if (isMounted && Array.isArray(classes)) {
            setCompanyItemClasses(classes);
          }
        })
        .catch(() => {});
    };

    loadItemClasses();

    const handleClassesChange = () => {
      loadItemClasses();
    };

    window.addEventListener('itemClassesChanged', handleClassesChange);
    return () => {
      isMounted = false;
      window.removeEventListener('itemClassesChanged', handleClassesChange);
    };
  }, []);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedTax, setSelectedTax] = useState<string>('ALL');
  const [selectedPr, setSelectedPr] = useState<string>('ALL');
  const [selectedRfq, setSelectedRfq] = useState<string>('ALL');

  // Pagination & Sorting
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startItem = totalItems === 0 ? 0 : (safePage - 1) * limit + 1;
  const endItem = Math.min(safePage * limit, totalItems);

  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Form State
  const [formData, setFormData] = useState<CreateItemMasterPayload>({
    itemCode: '',
    itemName: '',
    description: '',
    itemType: 'Non-stock / consumable',
    productClass: '',
    categoryHierarchy: '',
    uom: 'EA',
    taxRate: 5.0,
    taxTreatment: 'Taxable 5%',
    isTaxExempt: false,
    availableForPr: true,
    availableForRfq: true,
    preferredSupplierName: '',
    standardPrice: 0,
    currency: 'AED',
    status: 'ACTIVE',
    brand: '',
    partNumber: '',
    hsnSacCode: '',
    currentStock: 0,
    minStock: 0,
    warehouseName: '',
  });

  // Load Data
  const fetchData = useCallback(async (showLoadingSpinner: boolean = true) => {
    try {
      if (showLoadingSpinner) {
        setLoading(true);
      }
      const [listRes, statsRes] = await Promise.all([
        itemMasterService.list({
          search: searchTerm,
          itemType: selectedType,
          productClass: selectedClass,
          status: selectedStatus,
          taxTreatment: selectedTax,
          availableForPr: selectedPr === 'ALL' ? undefined : selectedPr === 'true',
          availableForRfq: selectedRfq === 'ALL' ? undefined : selectedRfq === 'true',
          page,
          limit,
          sortBy: 'itemCode',
          sortOrder,
        }),
        itemMasterService.getStats(),
      ]);

      setItems(listRes.items || []);
      setTotalItems(listRes.total || 0);
      setStats(statsRes);
    } catch (err: any) {
      if (showLoadingSpinner) {
        setFeedback({ type: 'error', text: err?.message || 'Failed to load inventory items' });
      }
    } finally {
      if (showLoadingSpinner) {
        setLoading(false);
      }
    }
  }, [searchTerm, selectedType, selectedClass, selectedStatus, selectedTax, selectedPr, selectedRfq, page, limit, sortOrder]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Real-time SSE event subscriptions & Cross-tab sync
  useEffect(() => {
    sseClient.connect();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleLiveEvent = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchData(false);
      }, 300);
    };

    const unsubCreated = sseClient.on('item_master_created', handleLiveEvent);
    const unsubUpdated = sseClient.on('item_master_updated', handleLiveEvent);
    const unsubDeleted = sseClient.on('item_master_deleted', handleLiveEvent);
    const unsubInventory = sseClient.on('inventory_updated', handleLiveEvent);

    // Cross-tab synchronization via custom window event & BroadcastChannel
    window.addEventListener('heliflow:inventory-updated', handleLiveEvent);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('heliflow_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'inventory_updated' || event.data?.type?.startsWith('item_master_')) {
          handleLiveEvent();
        }
      };
    } catch {}

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
      unsubInventory();
      window.removeEventListener('heliflow:inventory-updated', handleLiveEvent);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, [fetchData]);

  // Auto-dismiss toast feedback notification
  useEffect(() => {
    if (!feedback) return;
    const duration = feedback.type === 'error' ? 4000 : 3000;
    const timer = setTimeout(() => {
      setFeedback(null);
    }, duration);
    return () => clearTimeout(timer);
  }, [feedback]);

  // Distinct Product Classes for filter dropdown & modal selection (from Company Settings + current items)
  const productClasses = useMemo(() => {
    const set = new Set<string>();
    // 1. Add active item classes from Company Settings
    companyItemClasses.forEach((ic) => {
      if (ic.name?.trim()) set.add(ic.name.trim());
    });
    // 2. Also preserve any existing productClass from loaded catalog items
    items.forEach((it) => {
      if (it.productClass?.trim()) set.add(it.productClass.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [companyItemClasses, items]);

  // Reset Filters
  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedType('ALL');
    setSelectedClass('ALL');
    setSelectedStatus('ALL');
    setSelectedTax('ALL');
    setSelectedPr('ALL');
    setSelectedRfq('ALL');
    setPage(1);
  };

  // Toggle selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(items.map((i) => i.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      await itemMasterService.exportCsv();
      setFeedback({ type: 'success', text: 'CSV export started successfully' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to export CSV' });
    } finally {
      setExporting(false);
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    if (!canCreateItem) return;
    setModalMode('create');
    setEditingId(null);
    setFormData({
      itemCode: '',
      itemName: '',
      description: '',
      itemType: 'Non-stock / consumable',
      productClass: '',
      categoryHierarchy: '',
      uom: 'EA',
      taxRate: 5.0,
      taxTreatment: 'Taxable 5%',
      isTaxExempt: false,
      availableForPr: true,
      availableForRfq: true,
      preferredSupplierName: '',
      standardPrice: 0,
      currency: 'AED',
      status: canApproveItem ? 'ACTIVE' : 'PENDING_APPROVAL',
      brand: '',
      partNumber: '',
      hsnSacCode: '',
      currentStock: 0,
      minStock: 0,
      warehouseName: '',
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item: ItemMaster) => {
    if (!canCreateItem) return;
    setModalMode('edit');
    setEditingId(item.id);
    setFormData({
      itemCode: item.itemCode,
      itemName: item.itemName,
      description: item.description || '',
      itemType: item.itemType,
      productClass: item.productClass || '',
      categoryHierarchy: item.categoryHierarchy || '',
      uom: item.uom,
      taxRate: item.taxRate,
      taxTreatment: item.taxTreatment,
      isTaxExempt: item.isTaxExempt,
      availableForPr: item.availableForPr,
      availableForRfq: item.availableForRfq,
      preferredSupplierName: item.preferredSupplierName || '',
      standardPrice: item.standardPrice,
      currency: item.currency,
      status: item.status,
      brand: item.brand || '',
      partNumber: item.partNumber || '',
      hsnSacCode: item.hsnSacCode || '',
      currentStock: item.currentStock,
      minStock: item.minStock || 0,
      warehouseName: item.warehouseName || '',
    });
    setIsModalOpen(true);
  };

  // Auto Generate Code Helper
  const handleAutoGenerateCode = () => {
    const type = formData.itemType || 'Non-stock / consumable';
    let prefix = 'NSK';
    if (type.toLowerCase().includes('asset')) prefix = 'AST';
    else if (type.toLowerCase().includes('service')) prefix = 'SRV';
    else if (type.toLowerCase().includes('stock') || type.toLowerCase().includes('raw')) prefix = 'STK';

    const randNum = Math.floor(10000 + Math.random() * 90000);
    setFormData((prev) => ({ ...prev, itemCode: `${prefix}-${randNum}` }));
  };

  // Notify cross-tab and local sync
  const notifyLocalSync = (action: string) => {
    window.dispatchEvent(new CustomEvent('heliflow:inventory-updated', { detail: { action } }));
    try {
      const bc = new BroadcastChannel('heliflow_sync');
      bc.postMessage({ type: 'inventory_updated', action });
      bc.close();
    } catch {}
  };

  // Save Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.itemName?.trim()) {
      setFeedback({ type: 'error', text: 'Item Name is required' });
      return;
    }

    try {
      setSaving(true);
      if (modalMode === 'create') {
        await itemMasterService.create(formData);
        setFeedback({ type: 'success', text: `Item "${formData.itemName}" created successfully` });
        notifyLocalSync('create');
      } else if (modalMode === 'edit' && editingId) {
        await itemMasterService.update(editingId, formData);
        setFeedback({ type: 'success', text: `Item "${formData.itemName}" updated successfully` });
        notifyLocalSync('update');
      }
      setIsModalOpen(false);
      fetchData(false);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to save item' });
    } finally {
      setSaving(false);
    }
  };

  // Delete Single Item
  const handleDeleteItem = async (item: ItemMaster) => {
    if (!canCreateItem) return;
    if (!window.confirm(`Are you sure you want to delete item "${item.itemCode} - ${item.itemName}"?`)) {
      return;
    }
    try {
      await itemMasterService.delete(item.id);
      setFeedback({ type: 'success', text: `Item ${item.itemCode} deleted` });
      notifyLocalSync('delete');
      fetchData(false);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to delete item' });
    }
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (!canCreateItem) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected items permanently?`)) {
      return;
    }
    try {
      await itemMasterService.bulkDelete(selectedIds);
      setFeedback({ type: 'success', text: `${selectedIds.length} items deleted successfully` });
      setSelectedIds([]);
      notifyLocalSync('bulk_delete');
      fetchData(false);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to delete items' });
    }
  };

  // Badge class helper for Item Type
  const renderTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t.includes('asset')) {
      return <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/20">Fixed asset</span>;
    }
    if (t.includes('consumable') || t.includes('non-stock')) {
      return <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground border border-border/60">Non-stock / consumable</span>;
    }
    if (t.includes('service')) {
      return <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-violet-500/10 text-violet-600 dark:text-violet-300 border border-violet-500/20">Service</span>;
    }
    return <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-300 border border-teal-500/20">Stock / Raw Material</span>;
  };

  // Format currency
  const formatPrice = (price: number, currency: string) => {
    return (
      new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(price || 0) + ` ${currency}`
    );
  };

  const hasActiveFilters = Boolean(
    searchTerm ||
    selectedType !== 'ALL' ||
    selectedClass !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    selectedTax !== 'ALL' ||
    selectedPr !== 'ALL' ||
    selectedRfq !== 'ALL'
  );

  return (
    <PageFrame className="w-full min-w-0 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        <span>P2P Suite Masters</span>
        <span>/</span>
        <span className="text-primary font-semibold">Inventory & Item Master</span>
      </div>

      {/* Page Lead Header */}
      <PageLead
        title="Item master"
        description="Every item that can be requisitioned, sourced, ordered or stocked."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={handleExportCsv}
              disabled={exporting}
            >
              <Download className="size-4" />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </Button>
            {canCreateItem && (
              <Button
                type="button"
                onClick={handleOpenCreateModal}
              >
                <Plus className="size-4" />
                New item
              </Button>
            )}
          </div>
        }
      />

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3 rounded-xl border text-sm shadow-xs transition-all duration-300 animate-in fade-in slide-in-from-top-2',
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-700 dark:text-emerald-300'
              : 'bg-destructive/10 border-destructive/25 text-destructive'
          )}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 className="size-5" /> : <AlertCircle className="size-5" />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-md transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* 6 Metric KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          label="Total Items"
          value={stats.totalItems}
          icon={Boxes}
          tone="primary"
        />

        <MetricCard
          label="Active"
          value={stats.active}
          icon={CheckCircle2}
          tone="success"
        />

        <MetricCard
          label="Pending Approval"
          value={stats.pendingApproval}
          icon={Clock}
          tone="warning"
        />

        <MetricCard
          label="Available for PR"
          value={stats.availableForPr}
          icon={FileText}
          tone="cyan"
        />

        <MetricCard
          label="Available for RFQ"
          value={stats.availableForRfq}
          icon={ClipboardList}
          tone="violet"
        />

        <MetricCard
          label="Tax Exempt"
          value={stats.taxExempt}
          icon={Percent}
          tone="primary"
        />
      </div>

      {/* Filter Toolbar Card */}
      <Card className="p-3 sm:p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Code, name, brand, part no., HSN/SAC"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="h-10 pl-9.5 text-xs sm:text-sm bg-background"
            />
          </div>

          <Select
            className="h-10 min-w-[140px] text-xs sm:text-sm bg-background w-auto"
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Item type (All)</option>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <Select
            className="h-10 min-w-[140px] text-xs sm:text-sm bg-background w-auto"
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Product class (All)</option>
            {productClasses.map((cls) => (
              <option key={cls} value={cls}>
                {cls}
              </option>
            ))}
          </Select>

          <Select
            className="h-10 min-w-[130px] text-xs sm:text-sm bg-background w-auto"
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Status (All)</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING_APPROVAL">Pending approval</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </Select>

          <Select
            className="h-10 min-w-[140px] text-xs sm:text-sm bg-background w-auto"
            value={selectedTax}
            onChange={(e) => {
              setSelectedTax(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">Tax treatment (All)</option>
            {TAX_TREATMENTS.map((tax) => (
              <option key={tax} value={tax}>
                {tax}
              </option>
            ))}
          </Select>

          <Select
            className="h-10 min-w-[110px] text-xs sm:text-sm bg-background w-auto"
            value={selectedPr}
            onChange={(e) => {
              setSelectedPr(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">For PR (All)</option>
            <option value="true">PR: Yes</option>
            <option value="false">PR: No</option>
          </Select>

          <Select
            className="h-10 min-w-[110px] text-xs sm:text-sm bg-background w-auto"
            value={selectedRfq}
            onChange={(e) => {
              setSelectedRfq(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">For RFQ (All)</option>
            <option value="true">RFQ: Yes</option>
            <option value="false">RFQ: No</option>
          </Select>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 gap-1.5"
              onClick={handleClearFilters}
              title="Reset all filters"
            >
              <RotateCcw className="size-3.5" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Bulk action banner */}
      {canCreateItem && selectedIds.length > 0 && (
        <div className="flex items-center justify-between p-3 px-4 rounded-xl bg-primary/10 border border-primary/20 text-xs sm:text-sm text-primary font-medium">
          <div>
            <strong>{selectedIds.length}</strong> {selectedIds.length === 1 ? 'item' : 'items'} selected
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleBulkDelete}
            >
              <Trash2 className="size-3.5" />
              Delete Selected
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-background"
              onClick={() => setSelectedIds([])}
            >
              Deselect All
            </Button>
          </div>
        </div>
      )}

      {/* Data Table Card */}
      <Card className="overflow-hidden shadow-xs border-border">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-muted-foreground gap-3">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <span className="text-sm font-medium">Loading items...</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            className="m-6 border-0 shadow-none"
            icon={Boxes}
            title="No items found"
            description={hasActiveFilters ? "Try adjusting your search criteria or clearing filters." : "Create your first catalog item to get started."}
            action={
              hasActiveFilters ? (
                <Button variant="outline" onClick={handleClearFilters}>
                  <RotateCcw className="size-4" /> Reset filters
                </Button>
              ) : canCreateItem ? (
                <Button onClick={handleOpenCreateModal}>
                  <Plus className="size-4" /> New item
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground select-none">
                    <th className="w-10 px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={handleSelectAll}
                        className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                      />
                    </th>
                    {visibleColumns.map((colKey) => {
                      if (colKey === 'itemCode') {
                        return (
                          <th
                            key="itemCode"
                            className="px-4 py-3 cursor-pointer hover:text-foreground transition-colors"
                            onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                          >
                            Item code {sortOrder === 'asc' ? '↑' : '↓'}
                          </th>
                        );
                      }
                      if (colKey === 'itemName') return <th key="itemName" className="px-4 py-3">Item name</th>;
                      if (colKey === 'productClass') return <th key="productClass" className="px-4 py-3">Product class</th>;
                      if (colKey === 'uom') return <th key="uom" className="px-4 py-3">UoM</th>;
                      if (colKey === 'tax') return <th key="tax" className="px-4 py-3">Tax</th>;
                      if (colKey === 'availableForPr') return <th key="availableForPr" className="px-4 py-3 text-center">PR</th>;
                      if (colKey === 'availableForRfq') return <th key="availableForRfq" className="px-4 py-3 text-center">RFQ</th>;
                      if (colKey === 'preferredSupplier') return <th key="preferredSupplier" className="px-4 py-3">Preferred supplier</th>;
                      if (colKey === 'stdPrice') return <th key="stdPrice" className="px-4 py-3 text-right">Std price</th>;
                      return null;
                    })}
                    <th className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Actions</span>
                        <div className="relative inline-flex">
                          <ColumnSettingsButton
                            ref={colBtnRef}
                            open={showColPanel}
                            onClick={() => setShowColPanel((v) => !v)}
                          />
                          {showColPanel && (
                            <ColumnCustomizer
                              columnOrder={columnOrder}
                              visibleKeys={visibleKeys}
                              allColumns={INVENTORY_COLUMNS}
                              onToggle={handleToggleColumn}
                              onReorder={setColumnOrder}
                              onReset={handleResetColumns}
                              onClose={() => setShowColPanel(false)}
                              anchorRef={colBtnRef}
                            />
                          )}
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {items.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    const isTaxExempt = item.isTaxExempt || item.taxTreatment?.toLowerCase().includes('exempt');

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'hover:bg-muted/30 transition-colors',
                          isSelected && 'bg-primary/5 dark:bg-primary/10'
                        )}
                      >
                        <td className="px-4 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(item.id)}
                            className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                          />
                        </td>

                        {visibleColumns.map((colKey) => {
                          if (colKey === 'itemCode') {
                            return (
                              <td key="itemCode" className="px-4 py-3.5">
                                <div className="flex flex-col gap-1 items-start">
                                  <span className="font-mono text-sm font-semibold text-primary tracking-tight">
                                    {item.itemCode}
                                  </span>
                                  {renderTypeBadge(item.itemType)}
                                </div>
                              </td>
                            );
                          }
                          if (colKey === 'itemName') {
                            return (
                              <td key="itemName" className="px-4 py-3.5 max-w-[280px]">
                                <div className="text-sm font-medium text-foreground leading-snug">
                                  {item.itemName}
                                </div>
                                {item.description && (
                                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1" title={item.description}>
                                    {item.description}
                                  </div>
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'productClass') {
                            return (
                              <td key="productClass" className="px-4 py-3.5">
                                <div className="text-sm text-foreground font-normal">
                                  {item.productClass || '—'}
                                </div>
                                {item.categoryHierarchy && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {item.categoryHierarchy}
                                  </div>
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'uom') {
                            return (
                              <td key="uom" className="px-4 py-3.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted/70 text-muted-foreground">
                                  {item.uom || 'EA'}
                                </span>
                              </td>
                            );
                          }
                          if (colKey === 'tax') {
                            return (
                              <td key="tax" className="px-4 py-3.5">
                                {isTaxExempt ? (
                                  <Badge tone="success" className="min-h-0 h-5 px-2 py-0 text-[11px] font-medium">
                                    Exempt
                                  </Badge>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {item.taxTreatment || `Taxable ${item.taxRate}%`}
                                  </span>
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'availableForPr') {
                            return (
                              <td key="availableForPr" className="px-4 py-3.5 text-center">
                                {item.availableForPr ? (
                                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                    <Check className="size-3.5" strokeWidth={2.5} />
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground font-bold">—</span>
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'availableForRfq') {
                            return (
                              <td key="availableForRfq" className="px-4 py-3.5 text-center">
                                {item.availableForRfq ? (
                                  <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                                    <Check className="size-3.5" strokeWidth={2.5} />
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground font-bold">—</span>
                                )}
                              </td>
                            );
                          }
                          if (colKey === 'preferredSupplier') {
                            return (
                              <td key="preferredSupplier" className="px-4 py-3.5">
                                <span className="text-sm text-foreground truncate max-w-[180px] inline-block" title={item.preferredSupplierName || '—'}>
                                  {item.preferredSupplierName || '—'}
                                </span>
                              </td>
                            );
                          }
                          if (colKey === 'stdPrice') {
                            return (
                              <td key="stdPrice" className="px-4 py-3.5 text-right text-sm font-semibold tabular-nums text-foreground">
                                {formatPrice(item.standardPrice, item.currency)}
                              </td>
                            );
                          }
                          return null;
                        })}

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-center">
                          {canCreateItem ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="size-8"
                                title="Edit item"
                                onClick={() => handleOpenEditModal(item)}
                              >
                                <Edit3 className="size-4 text-muted-foreground hover:text-foreground" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="size-8 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                                title="Delete item"
                                onClick={() => handleDeleteItem(item)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Pagination Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 px-4 border-t border-border/70 bg-card/50 text-xs text-muted-foreground select-none">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Showing <strong className="text-foreground">{startItem}–{endItem}</strong> of{' '}
                  <strong className="text-foreground">{totalItems}</strong> items
                </span>
                <div className="flex items-center gap-1.5 pl-2 sm:border-l border-border/70">
                  <span>Per page:</span>
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-7 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                  title="First page"
                >
                  <ChevronsLeft className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title="Previous page"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>

                <div className="flex items-center gap-1 px-1">
                  {getPaginationPages(safePage, totalPages).map((p, idx) =>
                    typeof p === 'number' ? (
                      <Button
                        key={p}
                        type="button"
                        variant={safePage === p ? 'default' : 'ghost'}
                        size="icon-sm"
                        className={cn(
                          'h-7 min-w-7 px-2 text-xs font-medium',
                          safePage === p && 'bg-primary text-primary-foreground font-semibold shadow-xs'
                        )}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ) : (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground select-none">
                        …
                      </span>
                    )
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title="Next page"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-7 w-7"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  title="Last page"
                >
                  <ChevronsRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Dialog Modal for Create / Edit Item */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalMode === 'create' ? '+ New Inventory Item' : `Edit Item (${formData.itemCode})`}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveItem} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Item Code */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Item Code</label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Leave blank or click Auto"
                    value={formData.itemCode || ''}
                    onChange={(e) => setFormData({ ...formData, itemCode: e.target.value })}
                    className="h-10 text-xs sm:text-sm font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 text-xs px-3"
                    onClick={handleAutoGenerateCode}
                  >
                    Auto
                  </Button>
                </div>
              </div>

              {/* Item Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Item Type</label>
                <Select
                  value={formData.itemType}
                  onChange={(e) => setFormData({ ...formData, itemType: e.target.value as ItemType })}
                  className="h-10 text-xs sm:text-sm"
                >
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Item Name */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Item Name <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. Dell Latitude 5540 15'' i7 32GB"
                  value={formData.itemName}
                  onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Description */}
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Description</label>
                <Textarea
                  rows={2}
                  placeholder="Detailed item specification or workstation usage notes..."
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="min-h-16 text-xs sm:text-sm"
                />
              </div>

              {/* Product Class */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Product Class</label>
                <Select
                  value={formData.productClass || ''}
                  onChange={(e) => setFormData({ ...formData, productClass: e.target.value })}
                  className="h-10 text-xs sm:text-sm bg-background"
                >
                  <option value="">Select product class</option>
                  {productClasses.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                  {formData.productClass && !productClasses.includes(formData.productClass) && (
                    <option value={formData.productClass}>{formData.productClass}</option>
                  )}
                </Select>
              </div>

              {/* Category Hierarchy */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Category Hierarchy</label>
                <Input
                  type="text"
                  placeholder="e.g. Hardware > Laptops"
                  value={formData.categoryHierarchy || ''}
                  onChange={(e) => setFormData({ ...formData, categoryHierarchy: e.target.value })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              {/* UoM */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Unit of Measure (UoM)</label>
                <Select
                  value={formData.uom}
                  onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                  className="h-10 text-xs sm:text-sm"
                >
                  <option value="EA">EA (Each)</option>
                  <option value="BOX">BOX</option>
                  <option value="KG">KG</option>
                  <option value="LTR">LTR</option>
                  <option value="SET">SET</option>
                  <option value="MONTH">MONTH</option>
                  <option value="YEAR">YEAR</option>
                </Select>
              </div>

              {/* Preferred Supplier Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Preferred Supplier</label>
                <Input
                  type="text"
                  placeholder="e.g. Dell Direct MEA"
                  value={formData.preferredSupplierName || ''}
                  onChange={(e) => setFormData({ ...formData, preferredSupplierName: e.target.value })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Standard Price */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Standard Price</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.standardPrice}
                  onChange={(e) => setFormData({ ...formData, standardPrice: parseFloat(e.target.value) || 0 })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Currency */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Currency</label>
                <Select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="h-10 text-xs sm:text-sm"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Tax Treatment */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Tax Treatment</label>
                <Select
                  value={formData.taxTreatment}
                  onChange={(e) => {
                    const val = e.target.value;
                    const isExempt = val.toLowerCase().includes('exempt') || val.toLowerCase().includes('zero');
                    setFormData({
                      ...formData,
                      taxTreatment: val,
                      isTaxExempt: isExempt,
                      taxRate: isExempt ? 0 : formData.taxRate,
                    });
                  }}
                  className="h-10 text-xs sm:text-sm"
                >
                  {TAX_TREATMENTS.map((tax) => (
                    <option key={tax} value={tax}>
                      {tax}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Tax Rate % */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Tax Rate (%)</label>
                <Input
                  type="number"
                  step="0.1"
                  disabled={formData.isTaxExempt}
                  value={formData.taxRate}
                  onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Brand & Part No */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Brand / Manufacturer</label>
                <Input
                  type="text"
                  placeholder="e.g. Dell, Apple, Steelcase"
                  value={formData.brand || ''}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Part / Model Number</label>
                <Input
                  type="text"
                  placeholder="e.g. LAT-5540-X1"
                  value={formData.partNumber || ''}
                  onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Current Stock */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Current Stock</label>
                <Input
                  type="number"
                  value={formData.currentStock || 0}
                  onChange={(e) => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })}
                  className="h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Status</label>
                <Select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as ItemStatus })}
                  className="h-10 text-xs sm:text-sm"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING_APPROVAL">Pending approval</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>
              </div>

              {/* Checkboxes for PR and RFQ */}
              <div className="sm:col-span-2 pt-2">
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.availableForPr}
                      onChange={(e) => setFormData({ ...formData, availableForPr: e.target.checked })}
                      className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                    />
                    <span>Available for Purchase Requisition (PR)</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.availableForRfq}
                      onChange={(e) => setFormData({ ...formData, availableForRfq: e.target.checked })}
                      className="size-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                    />
                    <span>Available for Request for Quotation (RFQ)</span>
                  </label>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t border-border/70">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
              >
                {saving ? 'Saving...' : modalMode === 'create' ? 'Create item' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
};

export default InventoryMasterPage;
