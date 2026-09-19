import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isVendor } from '../../utils/rbac';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { grnService, type GoodsReceivedNote } from '../../services/grnService';
import { invoiceService, type APInvoice } from '../../services/invoiceService';
import { companySettingsService } from '../../services/companySettingsService';
import { apiRequest } from '../../api/client';
import {
  ArrowLeft,
  Receipt,
  Plus,
  Trash2,
  Save,
  Send,
  Upload,
  Calendar,
  Building2,
  ShoppingCart,
  FileText,
  Paperclip,
  X,
  CreditCard,
  Tag,
  PackageCheck,
  Printer,
  Clock,
  Search,
  Eye,
  Pencil
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import '../../components/purchase-orders/PurchaseOrderDocument.css';
import './CreatePurchaseInvoicePage.css';

interface LineItem {
  id: number | string;
  itemCode: string;
  itemName: string;
  description: string;
  poQty: number;
  grnQty: number;
  supplierQty: number | '';
  unitPrice: number | '';
  taxPercent: number;
}

interface VendorOption {
  id: string;
  name: string;
  email: string;
  category: string;
}

export default function CreatePurchaseInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poIdParam = searchParams.get('poId');
  const grnIdParam = searchParams.get('grnId');
  const modeParam = searchParams.get('mode');

  const { roles, hasPermission } = useAuth();
  const canCreateInvoice =
    hasPermission('Create Purchase Invoice', 'canCreate') ||
    hasPermission('Purchase Invoice', 'canCreate') ||
    hasPermission('Invoices', 'canCreate') ||
    hasPermission('Accounts Payable', 'canCreate');
  const { companyDefaultCurrency, formatAmount } = useCurrency();
  const { companyName, companyPhone, companyEmail, logoUrl } = useBranding();

  // Vendor Role Redirect to Vendor Create Invoice Page
  useEffect(() => {
    if (isVendor(roles)) {
      navigate(`/vendor/create-invoice${window.location.search}`, { replace: true });
    }
  }, [roles, navigate]);

  // Main Page View Mode: List / Overview Table vs Entry Form
  const [isCreating, setIsCreating] = useState<boolean>(() => Boolean(poIdParam || grnIdParam || modeParam));
  const [creationMode, setCreationMode] = useState<'linked' | 'manual' | null>(() => {
    if (modeParam === 'manual') return 'manual';
    if (modeParam === 'linked' || poIdParam || grnIdParam) return 'linked';
    return null;
  });
  const [showModeModal, setShowModeModal] = useState<boolean>(false);

  // Invoices list for management table
  const { data: invoicesList, loading: invoicesLoading, refetch: refetchInvoices } = useServiceData(
    () => invoiceService.list(),
    [] as APInvoice[],
    []
  );

  // Search & Filter State for Invoice Management Table
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<APInvoice | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load vendors list
  const { data: vendorsList } = useServiceData(
    () =>
      vendorService.list().then((rows) =>
        rows.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          category: v.category,
        }))
      ),
    [] as VendorOption[],
    []
  );

  // Load Purchase Orders
  const { data: poData } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );
  const poList = poData.orders || [];

  // Load departments
  const { data: departments } = useServiceData(
    () => companySettingsService.listDepartments().then((deps) => deps.map((d) => d.name)),
    [] as string[],
    []
  );

  // Cascade State: Supplier -> PO -> GRN
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [selectedPoId, setSelectedPoId] = useState<string>(() => poIdParam || '');
  const [selectedGrnId, setSelectedGrnId] = useState<string>(() => grnIdParam || '');
  const [grnOptions, setGrnOptions] = useState<GoodsReceivedNote[]>([]);
  const [invoiceOptions, setInvoiceOptions] = useState<APInvoice[]>([]);

  // Form Details
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');

  useEffect(() => {
    if (isCreating && !invoiceNumber) {
      companySettingsService
        .generateNextSequence('INVOICE')
        .then((res) => {
          if (res?.formattedCode) setInvoiceNumber(res.formattedCode);
        })
        .catch(() => {});
    }
  }, [isCreating, invoiceNumber]);

  const [vendorName, setVendorName] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentTerms, setPaymentTerms] = useState<string>('Net 30');
  const [department, setDepartment] = useState<string>('');
  const [currency, setCurrency] = useState<string>(companyDefaultCurrency);
  const [notes, setNotes] = useState<string>('');

  // Line items state with 3-Quantity matching (PO Qty, GRN Qty, Supplier Qty)
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: 1, itemCode: 'ITM-001', itemName: '', description: '', poQty: 0, grnQty: 0, supplierQty: 1, unitPrice: '', taxPercent: 18 },
  ]);

  // Attachments state
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

  // UI state
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Combine vendors from Vendor API and Purchase Orders so Supplier List is NEVER empty
  const allSuppliers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; category?: string }>();

    (vendorsList || []).forEach((v) => {
      const name = v.name || (v as any).companyName || (v as any).vendorName;
      if (name) {
        const id = String(v.id || name);
        map.set(id, { id, name, category: v.category || 'Vendor' });
      }
    });

    (poList || []).forEach((po) => {
      const vId = po.vendorId || po.vendor?.id;
      const vName = po.vendor?.name || po.vendor?.companyName || po.vendorName;
      if (vName) {
        const id = String(vId || vName);
        if (!map.has(id)) {
          map.set(id, { id, name: vName, category: 'Supplier' });
        }
      }
    });

    return Array.from(map.values());
  }, [vendorsList, poList]);

  // Filter POs by selected Vendor
  const availablePOs = useMemo(() => {
    if (!selectedVendorId) return poList;

    const targetSupplier = allSuppliers.find(
      (s) =>
        String(s.id).toLowerCase() === String(selectedVendorId).toLowerCase() ||
        s.name.toLowerCase() === String(selectedVendorId).toLowerCase()
    );
    const targetName = (targetSupplier?.name || selectedVendorId).toLowerCase();
    const targetId = String(selectedVendorId).toLowerCase();

    return poList.filter((po) => {
      const pVendorId = String(po.vendorId || po.vendor?.id || '').toLowerCase();
      const pVendorName = String(po.vendor?.name || '').toLowerCase();

      return (
        (pVendorId && pVendorId === targetId) ||
        (pVendorName && (pVendorName === targetName || targetName.includes(pVendorName) || pVendorName.includes(targetName)))
      );
    });
  }, [poList, selectedVendorId, allSuppliers]);

  // Selected PO details
  const selectedPO = useMemo(() => {
    return poList.find(
      (po) => String(po.id) === String(selectedPoId) || String(po.poNumber) === String(selectedPoId)
    );
  }, [poList, selectedPoId]);

  const finalLogoUrl = logoUrl || selectedPO?.companyLogoUrl || defaultHeliflowLogo;

  // Human-readable PO Number formatter
  const displayPoNumber = useMemo(() => {
    if (selectedPO?.poNumber) return selectedPO.poNumber;
    const matchInList = poList.find(
      (p) => String(p.id) === String(selectedPoId) || String(p.poNumber) === String(selectedPoId)
    );
    if (matchInList?.poNumber) return matchInList.poNumber;

    const matchInGrn = grnOptions.find(
      (g) =>
        String(g.poId) === String(selectedPoId) ||
        String(g.purchaseOrder?.id) === String(selectedPoId) ||
        String(g.purchaseOrder?.poNumber) === String(selectedPoId)
    );
    if (matchInGrn?.purchaseOrder?.poNumber) return matchInGrn.purchaseOrder.poNumber;

    if (poIdParam && poIdParam.startsWith('PO-')) return poIdParam;
    if (selectedPoId && selectedPoId.startsWith('PO-')) return selectedPoId;

    if (selectedPoId && /^[0-9a-fA-F]{24}$/.test(selectedPoId)) {
      return `PO-${selectedPoId.slice(-6).toUpperCase()}`;
    }

    return selectedPoId || 'Select Purchase Order';
  }, [selectedPO, poList, selectedPoId, grnOptions, poIdParam]);

  // Human-readable Dispatch Note / Invoice Number formatter
  const displayGrnNumber = useMemo(() => {
    const cleanGrnId = selectedGrnId.replace(/^grn_/, '').replace(/^inv_/, '');
    const matchInGrn = grnOptions.find(
      (g) => String(g.id) === String(cleanGrnId) || String(g.grnNumber) === String(cleanGrnId)
    );
    if (matchInGrn?.grnNumber) {
      const formattedNum = matchInGrn.grnNumber.replace(/^GRN-/, 'DN-');
      return `Dispatch Note: ${formattedNum}`;
    }

    const matchInInv = invoiceOptions.find(
      (i) => String(i.id) === String(cleanGrnId) || String(i.invoiceNumber) === String(cleanGrnId)
    );
    if (matchInInv?.invoiceNumber) return `Invoice: ${matchInInv.invoiceNumber}`;

    if (grnIdParam && (grnIdParam.startsWith('GRN-') || grnIdParam.startsWith('DN-') || grnIdParam.startsWith('INV-')))
      return grnIdParam.replace(/^GRN-/, 'DN-');
    if (cleanGrnId && (cleanGrnId.startsWith('GRN-') || cleanGrnId.startsWith('DN-') || cleanGrnId.startsWith('INV-')))
      return cleanGrnId.replace(/^GRN-/, 'DN-');

    if (cleanGrnId && /^[0-9a-fA-F]{24}$/.test(cleanGrnId)) {
      return `Ref: ${cleanGrnId.slice(-6).toUpperCase()}`;
    }

    return selectedGrnId || 'Select Dispatch Note or Vendor Invoice';
  }, [grnOptions, invoiceOptions, selectedGrnId, grnIdParam]);

  // Pre-fill query params if present
  useEffect(() => {
    if (poIdParam) {
      const foundPO = poList.find(
        (p) => String(p.id) === String(poIdParam) || String(p.poNumber) === String(poIdParam)
      );
      if (foundPO) {
        setSelectedPoId(String(foundPO.id));
        if (foundPO.vendorId) setSelectedVendorId(String(foundPO.vendorId));
        if (foundPO.vendor?.name) setVendorName(foundPO.vendor.name);
      } else {
        setSelectedPoId(poIdParam);
      }
    }
  }, [poIdParam, poList]);

  // Pre-select GRN / Vendor Invoice once grnOptions / invoiceOptions load
  useEffect(() => {
    if (grnIdParam && (grnOptions.length > 0 || invoiceOptions.length > 0)) {
      const matchGrn = grnOptions.find(
        (g) => String(g.id) === String(grnIdParam) || String(g.grnNumber) === String(grnIdParam)
      );
      if (matchGrn) {
        setSelectedGrnId(`grn_${matchGrn.id}`);
      } else {
        const matchInv = invoiceOptions.find(
          (i) => String(i.id) === String(grnIdParam) || String(i.invoiceNumber) === String(grnIdParam)
        );
        if (matchInv) {
          setSelectedGrnId(`inv_${matchInv.id}`);
        } else {
          setSelectedGrnId(grnIdParam);
        }
      }
    }
  }, [grnIdParam, grnOptions, invoiceOptions]);

  // Fetch GRNs & Vendor Invoices strictly linked to the selected PO
  useEffect(() => {
    if (!selectedPoId) {
      setGrnOptions([]);
      setInvoiceOptions([]);
      return;
    }

    const foundPO = poList.find(
      (p) => String(p.id) === String(selectedPoId) || String(p.poNumber) === String(selectedPoId)
    );
    const targetId = foundPO ? String(foundPO.id) : selectedPoId;
    const targetPoNum = foundPO?.poNumber || selectedPoId;

    grnService
      .getByPO(targetId)
      .then((grns) => {
        if (grns && grns.length > 0) {
          setGrnOptions(grns);
        } else if (targetPoNum && targetPoNum !== targetId) {
          grnService
            .getByPO(targetPoNum)
            .then((grns2) => {
              setGrnOptions(grns2 || []);
            })
            .catch(() => setGrnOptions([]));
        } else {
          grnService
            .list({ limit: 100 })
            .then((res) => {
              const list = res.grns || [];
              const matched = list.filter(
                (g) =>
                  String(g.poId) === String(targetId) ||
                  String(g.poId) === String(targetPoNum) ||
                  String(g.purchaseOrder?.id) === String(targetId) ||
                  String(g.purchaseOrder?.poNumber) === String(targetPoNum)
              );
              setGrnOptions(matched);
            })
            .catch(() => setGrnOptions([]));
        }
      })
      .catch(() => {
        setGrnOptions([]);
      });

    invoiceService
      .list({ poId: targetId })
      .then((invs) => {
        if (invs && invs.length > 0) {
          setInvoiceOptions(invs);
        } else if (targetPoNum && targetPoNum !== targetId) {
          invoiceService
            .list({ poId: targetPoNum })
            .then((invs2) => {
              setInvoiceOptions(invs2 || []);
            })
            .catch(() => setInvoiceOptions([]));
        } else {
          invoiceService
            .list()
            .then((allInvs) => {
              const matched = (allInvs || []).filter(
                (inv) =>
                  String(inv.poId) === String(targetId) ||
                  String(inv.poId) === String(targetPoNum) ||
                  String(inv.poNumber) === String(targetId) ||
                  String(inv.poNumber) === String(targetPoNum)
              );
              setInvoiceOptions(matched);
            })
            .catch(() => setInvoiceOptions([]));
        }
      })
      .catch(() => setInvoiceOptions([]));

    if (foundPO) {
      if (foundPO.vendorId) setSelectedVendorId(String(foundPO.vendorId));
      if (foundPO.vendor?.name) setVendorName(foundPO.vendor.name);

      if (foundPO.items && foundPO.items.length > 0) {
        const totalVal = Number(foundPO.totalAmount || 0);
        setLineItems(
          foundPO.items.map((item: any, idx: number) => {
            const qty = Math.max(1, Number(item.quantity || 1));
            let unitPrice = Number(item.unitPrice || 0);
            if (!unitPrice && totalVal > 0) {
              unitPrice = Number((totalVal / (foundPO.items.length || 1) / qty).toFixed(2));
            }
            let rawName = item.itemName || item.name || item.description || '';
            if (!rawName || rawName.startsWith('Items for PO')) {
              rawName = foundPO.rfq?.title || `Line Item ${idx + 1}`;
            }
            return {
              id: `po_item_${idx}_${Date.now()}`,
              itemCode: item.itemCode || `ITM-00${idx + 1}`,
              itemName: rawName,
              description: item.description || '',
              poQty: qty,
              grnQty: qty,
              supplierQty: qty,
              unitPrice: unitPrice,
              taxPercent: 18,
            };
          })
        );
      }
    }
  }, [selectedPoId, poList]);

  // When selected GRN or Vendor Invoice changes, populate form & item details
  useEffect(() => {
    if (!selectedGrnId) return;

    const foundPO = poList.find(
      (p) => String(p.id) === String(selectedPoId) || String(p.poNumber) === String(selectedPoId)
    );

    const resolveItemsForSelection = (foundInv: any, foundGRN: any, poObj: any) => {
      const activeGRN = foundGRN || (grnOptions && grnOptions.length > 0 ? grnOptions[0] : null);
      const totalPOValue = Number(poObj?.totalAmount || foundInv?.amount || 0);

      if (activeGRN && activeGRN.items && activeGRN.items.length > 0) {
        return activeGRN.items.map((gi: any, idx: number) => {
          const poMatch = poObj?.items?.[idx] || poObj?.rfq?.items?.[idx] || poObj?.rfq?.selectedQuotation?.items?.[idx];
          const poQty = Math.max(1, Number(gi.orderedQty || poMatch?.quantity || 1));
          const grnQty = Math.max(1, Number(gi.receivedQty ?? gi.acceptedQty ?? 1));

          let unitPrice = Number(poMatch?.unitPrice || gi.unitPrice || (foundInv?.amount ? foundInv.amount / grnQty : 0));
          if (!unitPrice && totalPOValue > 0) {
            unitPrice = Number((totalPOValue / (activeGRN.items.length || 1) / grnQty).toFixed(2));
          }

          let rawItemName = gi.itemName || poMatch?.itemName || poMatch?.name || poMatch?.description || '';
          if (!rawItemName || rawItemName.startsWith('Items for PO') || rawItemName.startsWith('Line Item')) {
            rawItemName = poObj?.rfq?.title || poMatch?.itemName || `Line Item ${idx + 1}`;
          }

          return {
            id: gi.id || `grn_item_${idx}_${Date.now()}`,
            itemCode: gi.itemCode || poMatch?.itemCode || `ITM-${String(idx + 1).padStart(3, '0')}`,
            itemName: rawItemName,
            description: gi.remarks || poMatch?.description || '',
            poQty: poQty,
            grnQty: grnQty,
            supplierQty: grnQty,
            unitPrice: unitPrice,
            taxPercent: 18,
          };
        });
      }

      const poItems = poObj?.items || poObj?.rfq?.items || poObj?.rfq?.selectedQuotation?.items;
      if (poItems && poItems.length > 0) {
        return poItems.map((item: any, idx: number) => {
          const qty = Math.max(1, Number(item.quantity || item.orderedQty || 1));
          let price = Number(item.unitPrice || (foundInv?.amount ? foundInv.amount / qty : 0));
          if (!price && totalPOValue > 0) {
            price = Number((totalPOValue / (poItems.length || 1) / qty).toFixed(2));
          }
          let rawItemName = item.itemName || item.name || item.description || '';
          if (!rawItemName || rawItemName.startsWith('Items for PO')) {
            rawItemName = poObj?.rfq?.title || `Line Item ${idx + 1}`;
          }
          return {
            id: `po_item_${idx}_${Date.now()}`,
            itemCode: item.itemCode || `ITM-${String(idx + 1).padStart(3, '0')}`,
            itemName: rawItemName,
            description: item.description || '',
            poQty: qty,
            grnQty: qty,
            supplierQty: qty,
            unitPrice: price,
            taxPercent: 18,
          };
        });
      }

      if (totalPOValue > 0) {
        const titleName = poObj?.rfq?.title || (poObj?.poNumber ? `Order Items (${poObj.poNumber})` : 'Vendor Tax Invoice Item');
        return [
          {
            id: `inv_item_fallback_${Date.now()}`,
            itemCode: 'ITM-001',
            itemName: titleName,
            description: 'Vendor Invoice Line Item',
            poQty: 1,
            grnQty: 1,
            supplierQty: 1,
            unitPrice: totalPOValue,
            taxPercent: 18,
          },
        ];
      }

      return null;
    };

    if (
      selectedGrnId.startsWith('inv_') ||
      invoiceOptions.some((i) => `inv_${i.id}` === selectedGrnId || String(i.invoiceNumber) === String(selectedGrnId))
    ) {
      const invId = selectedGrnId.replace('inv_', '');
      const foundInv = invoiceOptions.find(
        (i) => String(i.id) === String(invId) || String(i.invoiceNumber) === String(invId) || String(i.invoiceNumber) === String(selectedGrnId)
      );
      if (foundInv) {
        if (foundInv.invoiceNumber) setInvoiceNumber(foundInv.invoiceNumber);
        if (foundInv.submittedAt || foundInv.invoiceDate) {
          const dateVal = foundInv.submittedAt || foundInv.invoiceDate;
          setInvoiceDate(typeof dateVal === 'string' ? dateVal.slice(0, 10) : new Date(dateVal).toISOString().slice(0, 10));
        }
        if (foundInv.dueDate) {
          const dueVal = foundInv.dueDate;
          setDueDate(typeof dueVal === 'string' ? dueVal.slice(0, 10) : new Date(dueVal).toISOString().slice(0, 10));
        }
        if (foundInv.paymentTerms) setPaymentTerms(foundInv.paymentTerms);
        if (foundInv.department) setDepartment(foundInv.department);

        const foundGRN =
          grnOptions.find((g) => String(g.id) === String(foundInv.grnId) || String(g.grnNumber) === String(foundInv.grnId)) ||
          (grnOptions && grnOptions[0]);

        const resolved = resolveItemsForSelection(foundInv, foundGRN, foundPO);
        if (resolved) {
          setLineItems(resolved);
        }
      }
    } else {
      const rawGrnId = selectedGrnId.replace('grn_', '');
      const foundGRN = grnOptions.find(
        (g) => String(g.id) === String(rawGrnId) || String(g.grnNumber) === String(rawGrnId) || String(g.id) === String(selectedGrnId)
      );

      const resolved = resolveItemsForSelection(null, foundGRN, foundPO);
      if (resolved) {
        setLineItems(resolved);
      }
    }
  }, [selectedGrnId, grnOptions, invoiceOptions, poList, selectedPoId]);

  // Handle vendor selection change
  const handleVendorSelect = (vId: string) => {
    setSelectedVendorId(vId);
    setSelectedPoId('');
    setSelectedGrnId('');
    const found = allSuppliers.find((v) => String(v.id) === String(vId) || v.name === vId);
    if (found) {
      setVendorName(found.name);
    }
  };

  // Add Line Item
  const handleAddLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        itemCode: `ITM-00${prev.length + 1}`,
        itemName: '',
        description: '',
        poQty: 0,
        grnQty: 0,
        supplierQty: 1,
        unitPrice: '',
        taxPercent: 18,
      },
    ]);
  }, []);

  // Remove Line Item
  const handleRemoveLineItem = useCallback((id: number | string) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  // Update Line Item
  const handleUpdateLineItem = useCallback((id: number | string, field: keyof LineItem, value: any) => {
    setLineItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }, []);

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    lineItems.forEach((item) => {
      const qty = typeof item.supplierQty === 'number' ? item.supplierQty : 0;
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      const lineSubtotal = qty * price;
      const lineTax = lineSubtotal * ((item.taxPercent || 0) / 100);

      subtotal += lineSubtotal;
      totalTax += lineTax;
    });

    const grandTotal = subtotal + totalTax;
    return { subtotal, totalTax, grandTotal };
  }, [lineItems]);

  // File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((file, idx) => ({
        id: `att_${Date.now()}_${idx}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
      }));
      setAttachments((prev) => [...prev, ...newFiles]);
    }
  };

  const handleRemoveAttachment = (attId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  // Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (!invoiceNumber.trim()) {
      setErrorMsg('Invoice Number is required.');
      return false;
    }
    if (!selectedVendorId && !vendorName.trim()) {
      setErrorMsg('Please select a Supplier.');
      return false;
    }
    if (!selectedPoId && creationMode === 'linked') {
      setErrorMsg('Please select a linked Purchase Order (PO Selection).');
      return false;
    }
    const validItems = lineItems.filter(
      (item) => item.itemName.trim() && typeof item.supplierQty === 'number' && item.supplierQty > 0
    );
    if (validItems.length === 0) {
      setErrorMsg('Please add at least one line item with a valid item name and supplier quantity.');
      return false;
    }
    return true;
  };

  // Submission
  const submitInvoiceToAPI = async (isDraft: boolean) => {
    if (!validateForm()) return;

    if (isDraft) setSavingDraft(true);
    else setSubmitting(true);

    setErrorMsg(null);

    try {
      const selectedPOObj = poList.find((p) => String(p.id) === String(selectedPoId));

      await apiRequest('/invoices/manual', {
        method: 'POST',
        body: JSON.stringify({
          invoiceNumber,
          vendorId: selectedVendorId || selectedPOObj?.vendorId,
          poId: selectedPoId || null,
          grnId: selectedGrnId || null,
          invoiceDate,
          dueDate,
          paymentTerms,
          department,
          currency,
          amount: calculations.grandTotal,
          comments: notes,
          isDraft,
          lineItems,
        }),
      });

      if (isDraft) {
        setSuccessMsg(`Invoice #${invoiceNumber} saved as draft successfully.`);
      } else {
        setSuccessMsg(`Purchase Invoice #${invoiceNumber} submitted for approval successfully! Workflow initiated.`);
      }

      setTimeout(() => navigate('/accounts-payable'), 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit Purchase Invoice.');
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  // Render List View if not creating
  if (!isCreating) {
    const draftAndPendingCount = invoicesList.filter(
      (r) => r.status === 'DRAFT' || r.status === 'PENDING' || r.status === 'PENDING_APPROVAL'
    ).length;
    const activeCount = invoicesList.filter((r) => r.status === 'APPROVED' || r.status === 'PAID').length;
    const rejectedCount = invoicesList.filter((r) => r.status === 'REJECTED' || r.status === 'CANCELLED').length;
    const totalValue = invoicesList.reduce((acc, r) => acc + (r.amount || 0), 0);

    const filteredInvoices = invoicesList.filter((inv) => {
      if (statusFilter === 'DRAFT_PENDING') {
        if (!['DRAFT', 'PENDING', 'PENDING_APPROVAL'].includes(inv.status)) return false;
      } else if (statusFilter === 'APPROVED') {
        if (!['APPROVED', 'PAID'].includes(inv.status)) return false;
      } else if (statusFilter === 'REJECTED') {
        if (!['REJECTED', 'CANCELLED'].includes(inv.status)) return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (inv.invoiceNumber || '').toLowerCase().includes(term) ||
        (inv.vendorName || '').toLowerCase().includes(term) ||
        (inv.poNumber || '').toLowerCase().includes(term) ||
        (inv.status || '').toLowerCase().includes(term)
      );
    });

    const isAllSelected = filteredInvoices.length > 0 && filteredInvoices.every((inv) => selectedInvoiceIds.includes(String(inv.id)));

    const handleSelectAll = () => {
      if (isAllSelected) {
        setSelectedInvoiceIds([]);
      } else {
        setSelectedInvoiceIds(filteredInvoices.map((inv) => String(inv.id)));
      }
    };

    const handleToggleSelect = (id: string) => {
      setSelectedInvoiceIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    };

    return (
      <div className="cpi-page">
        {/* Notifications */}
        {errorMsg && (
          <MessageStrip type="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </MessageStrip>
        )}
        {successMsg && (
          <MessageStrip type="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </MessageStrip>
        )}

        {/* Header - Clean transparent header matching Purchase Orders page */}
        <div className="cpi-page-header">
          <div className="cpi-header-main">
            <div className="cpi-header-top-row">
              <h1 className="cpi-header-title">Purchase Invoice Entry & Management</h1>
              <div className="cpi-header-actions">
                <button
                  className="cpi-btn cpi-btn--primary"
                  onClick={() => {
                    if (!poIdParam && !grnIdParam) {
                      setSelectedVendorId('');
                      setSelectedPoId('');
                      setSelectedGrnId('');
                      setVendorName('');
                    }
                    setShowModeModal(true);
                  }}
                >
                  <Plus size={16} /> New Invoice
                </button>
              </div>
            </div>
            <p className="cpi-header-subtitle">Manage purchase invoices, vendor bill entries, and 3-way matching approvals</p>
          </div>
        </div>

        {/* 4 KPI Summary Cards Grid matching Purchase Orders page */}
        <div className="cpi-kpi-grid">
          {/* Card 1: Total Documents */}
          <div
            className={`cpi-kpi-card cpi-kpi-card--clickable ${statusFilter === null ? 'cpi-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter(null)}
          >
            <div className="cpi-kpi-icon" style={{ background: 'rgba(10, 110, 209, 0.1)', color: '#0a6ed1' }}>
              <FileText size={22} />
            </div>
            <div className="cpi-kpi-info">
              <span className="cpi-kpi-value">{invoicesList.length}</span>
              <span className="cpi-kpi-label">TOTAL DOCUMENTS</span>
              <span className="cpi-kpi-subtext">Across every approval state</span>
            </div>
          </div>

          {/* Card 2: Needs Attention / Draft & Pending */}
          <div
            className={`cpi-kpi-card cpi-kpi-card--clickable ${statusFilter === 'DRAFT_PENDING' ? 'cpi-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'DRAFT_PENDING' ? null : 'DRAFT_PENDING'))}
          >
            <div className="cpi-kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
              <Clock size={22} />
            </div>
            <div className="cpi-kpi-info">
              <span className="cpi-kpi-value">{draftAndPendingCount}</span>
              <span className="cpi-kpi-label">NEEDS ATTENTION</span>
              <span className="cpi-kpi-subtext">Draft and pending approval</span>
            </div>
          </div>

          {/* Card 3: Approved & Released */}
          <div
            className={`cpi-kpi-card cpi-kpi-card--clickable ${statusFilter === 'APPROVED' ? 'cpi-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'APPROVED' ? null : 'APPROVED'))}
          >
            <div className="cpi-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
              <PackageCheck size={22} />
            </div>
            <div className="cpi-kpi-info">
              <span className="cpi-kpi-value">{activeCount}</span>
              <span className="cpi-kpi-label">APPROVED & RELEASED</span>
              <span className="cpi-kpi-subtext">Ready or sent to a vendor</span>
            </div>
          </div>

          {/* Card 4: Total Volume */}
          <div className="cpi-kpi-card">
            <div className="cpi-kpi-icon" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
              <CreditCard size={22} />
            </div>
            <div className="cpi-kpi-info">
              <span className="cpi-kpi-value cpi-kpi-value--mono">
                {formatAmount(totalValue, companyDefaultCurrency)}
              </span>
              <span className="cpi-kpi-label">TOTAL VOLUME</span>
              <span className="cpi-kpi-subtext">Value across listed documents</span>
            </div>
          </div>
        </div>

        {/* Toolbar: Search Bar & Batch Delete Action Bar */}
        <div className="cpi-toolbar">
          <div className="cpi-search-box">
            <Search size={16} className="cpi-search-icon" />
            <input
              type="text"
              className="cpi-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoice number, vendor, status..."
            />
            {searchTerm && (
              <button type="button" className="cpi-search-clear" onClick={() => setSearchTerm('')}>
                <X size={15} />
              </button>
            )}
          </div>

          {selectedInvoiceIds.length > 0 && (
            <div className="cpi-batch-bar">
              <span className="cpi-batch-count">{selectedInvoiceIds.length} invoice(s) selected</span>
              <button className="cpi-btn cpi-btn--danger cpi-btn--sm" onClick={() => setShowBulkDeleteModal(true)}>
                <Trash2 size={14} /> Delete Selected
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoiceIds([])}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Data Table */}
        {invoicesList.length === 0 ? (
          <div className="cpi-empty-state">
            <div className="cpi-empty-icon">
              <Receipt size={28} />
            </div>
            <h3>No Purchase Invoices Found</h3>
            <p>Click the <strong>"+ New Invoice"</strong> button above to record a new vendor purchase invoice entry.</p>
          </div>
        ) : (
          <div className="cpi-table-card">
            <div className="cpi-table-wrap">
              <table className="cpi-table">
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleSelectAll}
                        style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--primary-500, #0a6ed1)' }}
                        title="Select all invoices"
                      />
                    </th>
                    <th style={{ width: 160 }}>INVOICE NUMBER</th>
                    <th style={{ width: 200 }}>VENDOR</th>
                    <th style={{ width: 140 }}>INVOICE DATE</th>
                    <th style={{ width: 110 }}>CURRENCY</th>
                    <th style={{ width: 150, textAlign: 'right' }}>GRAND TOTAL</th>
                    <th style={{ width: 160 }}>STATUS</th>
                    <th style={{ width: 130, textAlign: 'center' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv) => {
                    const invIdStr = String(inv.id);
                    const isSelected = selectedInvoiceIds.includes(invIdStr);
                    return (
                      <tr key={inv.id} className={isSelected ? 'cpi-table-row--selected' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(invIdStr)}
                            style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--primary-500, #0a6ed1)' }}
                          />
                        </td>
                        <td>
                          <span className="cpi-code-link">{inv.invoiceNumber}</span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{inv.vendorName || '—'}</td>
                        <td>{inv.submittedAt || inv.dueDate || '—'}</td>
                        <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{companyDefaultCurrency}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                          {formatAmount(inv.amount, companyDefaultCurrency)}
                        </td>
                        <td>
                          <span className={`cpi-badge cpi-badge--${inv.status || 'PENDING'}`}>
                            {inv.status || 'Pending'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button
                              className="cpi-action-icon-btn"
                              onClick={() => {
                                if (inv.poNumber) setSelectedPoId(inv.poNumber);
                                setCreationMode('linked');
                                setIsCreating(true);
                              }}
                              title="View Invoice Entry"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              className="cpi-action-icon-btn"
                              onClick={() => {
                                if (inv.poNumber) setSelectedPoId(inv.poNumber);
                                setCreationMode('linked');
                                setIsCreating(true);
                              }}
                              title="Edit Invoice Entry"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="cpi-action-icon-btn cpi-action-icon-btn--delete"
                              onClick={() => setDeleteTarget(inv)}
                              title="Delete Invoice Entry"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Single Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="cpi-modal-backdrop" onClick={() => setDeleteTarget(null)}>
            <div className="cpi-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="cpi-modal-header">
                <h3 className="cpi-modal-title" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trash2 size={20} /> Delete Purchase Invoice?
                </h3>
                <button className="cpi-modal-close" onClick={() => setDeleteTarget(null)}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ margin: '8px 0' }}>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>
                  Are you sure you want to delete invoice <strong>{deleteTarget.invoiceNumber}</strong>?
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  This action cannot be undone and will remove the document permanently.
                </p>
              </div>
              <div className="cpi-modal-actions">
                <button className="cpi-btn cpi-btn--outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                  Cancel
                </button>
                <button
                  className="cpi-btn cpi-btn--danger"
                  disabled={deleting}
                  onClick={async () => {
                    if (!deleteTarget) return;
                    const targetId = deleteTarget.id;
                    const invNum = deleteTarget.invoiceNumber;
                    setDeleteTarget(null);
                    setDeleting(true);
                    try {
                      await apiRequest(`/invoices/${targetId}`, { method: 'DELETE' }).catch(() => {});
                      refetchInvoices();
                      setSuccessMsg(`Purchase Invoice #${invNum} deleted successfully.`);
                    } catch (err: any) {
                      setErrorMsg(err?.message || 'Failed to delete invoice.');
                    } finally {
                      setDeleting(false);
                    }
                  }}
                >
                  {deleting ? 'Deleting...' : 'Delete Invoice'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Delete Modal */}
        {showBulkDeleteModal && (
          <div className="cpi-modal-backdrop" onClick={() => setShowBulkDeleteModal(false)}>
            <div className="cpi-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="cpi-modal-header">
                <h3 className="cpi-modal-title" style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trash2 size={20} /> Delete {selectedInvoiceIds.length} Selected Invoices?
                </h3>
                <button className="cpi-modal-close" onClick={() => setShowBulkDeleteModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ margin: '8px 0' }}>
                <p style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>
                  Are you sure you want to delete <strong>{selectedInvoiceIds.length} purchase invoices</strong>?
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  This action will permanently delete all selected invoice records.
                </p>
              </div>
              <div className="cpi-modal-actions">
                <button className="cpi-btn cpi-btn--outline" onClick={() => setShowBulkDeleteModal(false)} disabled={deleting}>
                  Cancel
                </button>
                <button
                  className="cpi-btn cpi-btn--danger"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await Promise.all(
                        selectedInvoiceIds.map((id) => apiRequest(`/invoices/${id}`, { method: 'DELETE' }).catch(() => {}))
                      );
                      refetchInvoices();
                      setSuccessMsg(`${selectedInvoiceIds.length} purchase invoices deleted successfully.`);
                      setSelectedInvoiceIds([]);
                    } catch (err: any) {
                      setErrorMsg(err?.message || 'Failed to delete selected invoices.');
                    } finally {
                      setDeleting(false);
                      setShowBulkDeleteModal(false);
                    }
                  }}
                >
                  {deleting ? 'Deleting...' : `Delete ${selectedInvoiceIds.length} Invoices`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Creation Mode Modal */}
        {showModeModal && (
          <div className="cpi-modal-backdrop">
            <div className="cpi-modal-box" style={{ maxWidth: 580 }}>
              <div className="cpi-modal-header">
                <div>
                  <h3 className="cpi-modal-title">Select Purchase Invoice Creation Method</h3>
                  <p className="cpi-modal-sub">Choose how you want to create this purchase invoice entry</p>
                </div>
                <button className="cpi-modal-close" onClick={() => setShowModeModal(false)}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '8px 0' }}>
                {/* Option 1: Link with Vendor Dispatch Note / Invoice */}
                <div
                  className="cpi-mode-option cpi-mode-option--selected"
                  onClick={() => {
                    if (!poIdParam && !grnIdParam) {
                      setSelectedVendorId('');
                      setSelectedPoId('');
                      setSelectedGrnId('');
                      setVendorName('');
                    }
                    setCreationMode('linked');
                    setIsCreating(true);
                    setShowModeModal(false);
                  }}
                >
                  <div className="cpi-mode-icon">
                    <PackageCheck size={26} />
                  </div>
                  <div>
                    <div className="cpi-mode-title">Link with Vendor Dispatch Note / Invoice</div>
                    <div className="cpi-mode-desc">
                      Select from vendor-submitted Dispatch Notes or Invoices linked to Purchase Orders for automated 3-way quantity matching.
                    </div>
                  </div>
                </div>

                {/* Option 2: Direct Manual Invoice */}
                <div
                  className="cpi-mode-option"
                  onClick={() => {
                    if (!poIdParam && !grnIdParam) {
                      setSelectedVendorId('');
                      setSelectedPoId('');
                      setSelectedGrnId('');
                      setVendorName('');
                    }
                    setCreationMode('manual');
                    setIsCreating(true);
                    setShowModeModal(false);
                  }}
                >
                  <div className="cpi-mode-icon cpi-mode-icon--green">
                    <Receipt size={26} />
                  </div>
                  <div>
                    <div className="cpi-mode-title">✏️ Create Custom / Direct Manual Invoice</div>
                    <div className="cpi-mode-desc">
                      Create a custom purchase invoice directly without requiring a vendor dispatch note cascade reference.
                    </div>
                  </div>
                </div>
              </div>

              <div className="cpi-modal-actions">
                <button className="cpi-btn cpi-btn--outline" onClick={() => setShowModeModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Render Entry Form View
  return (
    <div className="cpi-page">
      {/* Notifications */}
      {errorMsg && (
        <MessageStrip type="error" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </MessageStrip>
      )}
      {successMsg && <MessageStrip type="success">{successMsg}</MessageStrip>}

      {/* Header */}
      <div className="cpi-page-header">
        <div className="cpi-header-left">
          <button className="cpi-back-btn" onClick={() => setIsCreating(false)} title="Back" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="cpi-header-main">
            <div className="cpi-header-top-row">
              <h1 className="cpi-header-title">Create Purchase Invoice Entry</h1>
              <div className="cpi-header-actions">
                <button type="button" className="cpi-btn cpi-btn--outline" onClick={() => setShowModeModal(true)}>
                  <Receipt size={15} /> Switch Mode
                </button>
                <button type="button" className="cpi-btn cpi-btn--outline" onClick={() => window.print()}>
                  <Printer size={15} /> Print Document
                </button>
                <button
                  className="cpi-btn cpi-btn--outline"
                  onClick={() => submitInvoiceToAPI(true)}
                  disabled={savingDraft || submitting || !canCreateInvoice}
                  title={!canCreateInvoice ? 'Admin permission required to save draft purchase invoices.' : undefined}
                >
                  <Save size={15} /> {savingDraft ? 'Saving…' : 'Save Draft'}
                </button>
                <button
                  className="cpi-btn cpi-btn--primary"
                  onClick={() => submitInvoiceToAPI(false)}
                  disabled={savingDraft || submitting || !canCreateInvoice}
                  title={!canCreateInvoice ? 'Admin permission required to submit purchase invoices.' : undefined}
                >
                  <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Invoice for Approval'}
                </button>
              </div>
            </div>
            <p className="cpi-header-subtitle">
              {creationMode === 'manual'
                ? 'Custom manual invoice creation mode (Cascade Reference Bypassed)'
                : 'Enter vendor invoice with 3-way quantity matching & Approval Workflow'}
            </p>
          </div>
        </div>
      </div>

      {/* Form Content */}
      <div className="cpi-form-body">
        {/* Section 01: Supplier, PO & Dispatch Note Cascade Selection */}
        {creationMode === 'linked' && (
          <div className="cpi-section">
            <div className="cpi-section-header">
              <div className="cpi-section-header-left">
                <span className="cpi-section-badge">01</span>
                <div>
                  <h3 className="cpi-section-title">Supplier, PO & Dispatch Note Selection Cascade</h3>
                  <span className="cpi-section-hint">Hierarchical reference selection</span>
                </div>
              </div>
            </div>

            <div className="cpi-form-grid">
              {/* 1. Supplier Selection */}
              <div className="cpi-field">
                <label>
                  1. SUPPLIER SELECTION <span className="required">*</span>
                </label>
                <select value={selectedVendorId} onChange={(e) => handleVendorSelect(e.target.value)}>
                  <option value="">-- Select Supplier (e.g. Telematics) --</option>
                  {allSuppliers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.category || 'Supplier'})
                    </option>
                  ))}
                </select>
                <span className="cpi-field__sub">Filters available Purchase Orders</span>
              </div>

              {/* 2. PO Selection */}
              <div className="cpi-field">
                <label>
                  2. PO SELECTION <span className="required">*</span>
                </label>
                <select
                  value={selectedPoId}
                  onChange={(e) => {
                    setSelectedPoId(e.target.value);
                    setSelectedGrnId('');
                  }}
                >
                  {!selectedVendorId ? (
                    <option value="">-- Select Supplier First or Pick PO --</option>
                  ) : availablePOs.length === 0 ? (
                    <option value="">-- No Purchase Orders for Selected Supplier --</option>
                  ) : (
                    <option value="">-- Select Linked PO --</option>
                  )}
                  {availablePOs.map((po) => (
                    <option key={po.id} value={po.id}>
                      {po.poNumber} — {formatAmount(po.totalAmount, currency)}
                    </option>
                  ))}
                  {selectedPoId && !availablePOs.some((po) => String(po.id) === String(selectedPoId)) && (
                    <option value={selectedPoId}>{displayPoNumber}</option>
                  )}
                </select>
                <span className="cpi-field__sub">Auto-loads PO items & linked Dispatch Notes</span>
              </div>

              {/* 3. Dispatch Note / Vendor Invoice Selection */}
              <div className="cpi-field">
                <label>3. DISPATCH NOTE / VENDOR INVOICE SELECTION</label>
                <select value={selectedGrnId} onChange={(e) => setSelectedGrnId(e.target.value)} disabled={!selectedPoId}>
                  {!selectedPoId ? (
                    <option value="">-- Select Purchase Order First --</option>
                  ) : grnOptions.length === 0 && invoiceOptions.length === 0 ? (
                    <option value="">-- Direct PO Billing (No Linked Dispatch Note / Invoice) --</option>
                  ) : (
                    <option value="">-- Select Linked Dispatch Note or Vendor Invoice --</option>
                  )}
                  {grnOptions.length > 0 && (
                    <optgroup label="📄 Dispatch Notes">
                      {grnOptions.map((g) => (
                        <option key={`grn_${g.id}`} value={`grn_${g.id}`}>
                          Dispatch Note: {g.grnNumber ? g.grnNumber.replace(/^GRN-/, 'DN-') : 'DN'} (Received:{' '}
                          {new Date(g.receivedDate).toLocaleDateString()})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {invoiceOptions.length > 0 && (
                    <optgroup label="🧾 Vendor Invoices">
                      {invoiceOptions.map((inv) => (
                        <option key={`inv_${inv.id}`} value={`inv_${inv.id}`}>
                          Invoice: {inv.invoiceNumber} — Ksh {inv.amount ? inv.amount.toLocaleString() : '0'} (
                          {inv.submittedAt || inv.dueDate || 'Recent'})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {selectedGrnId &&
                    !grnOptions.some((g) => String(g.id) === String(selectedGrnId) || `grn_${g.id}` === selectedGrnId) &&
                    !invoiceOptions.some((i) => String(i.id) === String(selectedGrnId) || `inv_${i.id}` === selectedGrnId) && (
                      <option value={selectedGrnId}>{displayGrnNumber}</option>
                    )}
                </select>
                <span className="cpi-field__sub">Auto-populates items from Dispatch Note or Vendor Invoice</span>
              </div>
            </div>
          </div>
        )}

        {/* Section 02: Invoice Meta & Dates */}
        <div className="cpi-section">
          <div className="cpi-section-header">
            <div className="cpi-section-header-left">
              <span className="cpi-section-badge">{creationMode === 'manual' ? '01' : '02'}</span>
              <div>
                <h3 className="cpi-section-title">Invoice Dates & Details</h3>
              </div>
            </div>
          </div>

          <div className={`cpi-form-grid ${creationMode === 'manual' ? 'cpi-form-grid--4' : 'cpi-form-grid--4'}`}>
            {creationMode === 'manual' && (
              <div className="cpi-field">
                <label>
                  SUPPLIER / VENDOR <span className="required">*</span>
                </label>
                <select value={selectedVendorId} onChange={(e) => handleVendorSelect(e.target.value)}>
                  <option value="">-- Select Supplier --</option>
                  {allSuppliers.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.category || 'Supplier'})
                    </option>
                  ))}
                </select>
                <span className="cpi-field__sub">Select supplier for manual entry</span>
              </div>
            )}

            <div className="cpi-field">
              <label>
                INVOICE NUMBER <span className="required">*</span>
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-0042"
              />
              <span className="cpi-field__sub">Vendor invoice reference</span>
            </div>

            <div className="cpi-field">
              <label>
                INVOICE DATE <span className="required">*</span>
              </label>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>

            <div className="cpi-field">
              <label>
                DUE DATE <span className="required">*</span>
              </label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="cpi-field">
              <label>PAYMENT TERMS</label>
              <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                <option value="Immediate">Immediate</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 03: Line Items Listing & 3-Quantity Matching */}
        <div className="cpi-section">
          <div className="cpi-section-header">
            <div className="cpi-section-header-left">
              <span className="cpi-section-badge">{creationMode === 'manual' ? '02' : '03'}</span>
              <div>
                <h3 className="cpi-section-title">Items Listing & 3-Quantity Matching</h3>
              </div>
            </div>
            <button type="button" className="cpi-btn cpi-btn--outline cpi-btn--sm" onClick={handleAddLineItem}>
              <Plus size={14} /> Add Line Item
            </button>
          </div>

          <div className="cpi-items-table-wrap">
            <table className="cpi-items-table">
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Item Name / Description *</th>
                  <th style={{ width: '100px' }} className="cpi-th--po">
                    PO Quantity
                  </th>
                  <th style={{ width: '100px' }} className="cpi-th--grn">
                    Dispatch Qty
                  </th>
                  <th style={{ width: '120px' }} className="cpi-th--supplier">
                    Supplier Qty *
                  </th>
                  <th style={{ width: '130px' }}>Unit Price ({currency})</th>
                  <th style={{ width: '80px' }}>Tax %</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Total ({currency})</th>
                  <th style={{ width: '44px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => {
                  const qty = typeof item.supplierQty === 'number' ? item.supplierQty : 0;
                  const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                  const lineTotal = qty * price * (1 + (item.taxPercent || 0) / 100);

                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          className="cpi-table-input"
                          placeholder="Item description..."
                          value={item.itemName}
                          onChange={(e) => handleUpdateLineItem(item.id, 'itemName', e.target.value)}
                        />
                      </td>
                      <td style={{ background: 'rgba(10, 110, 209, 0.03)' }}>
                        <span className="cpi-qty-chip cpi-qty-chip--po">{item.poQty}</span>
                      </td>
                      <td style={{ background: 'rgba(16, 185, 129, 0.03)' }}>
                        <span className="cpi-qty-chip cpi-qty-chip--grn">{item.grnQty}</span>
                      </td>
                      <td style={{ background: 'rgba(234, 179, 8, 0.04)' }}>
                        <input
                          type="number"
                          min="1"
                          className="cpi-table-input cpi-table-input--supplier-qty"
                          value={item.supplierQty}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'supplierQty',
                              e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1)
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="cpi-table-input"
                          placeholder="0.00"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'unitPrice',
                              e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0)
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="cpi-table-input"
                          value={item.taxPercent}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'taxPercent',
                              Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                            )
                          }
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                        {formatAmount(lineTotal, currency)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="cpi-action-icon-btn cpi-action-icon-btn--delete"
                          onClick={() => handleRemoveLineItem(item.id)}
                          disabled={lineItems.length <= 1}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 04 & 05: Remarks, Attachments & Totals Split Grid */}
        <div className="cpi-split-grid">
          <div className="cpi-section">
            <div className="cpi-section-header">
              <div className="cpi-section-header-left">
                <span className="cpi-section-badge">{creationMode === 'manual' ? '03' : '04'}</span>
                <div>
                  <h3 className="cpi-section-title">Remarks & Attachments</h3>
                </div>
              </div>
            </div>

            <div className="cpi-field">
              <label>INTERNAL NOTES FOR APPROVERS</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes for finance approvers regarding quantity discrepancies or invoice details..."
              />
            </div>

            <div className="cpi-field">
              <label>ATTACH VENDOR INVOICE PDF</label>
              <label className="cpi-dropzone">
                <Upload size={28} className="cpi-dropzone-icon" />
                <div className="cpi-dropzone-title">CLICK TO UPLOAD PHYSICAL VENDOR BILL PDF</div>
                <div className="cpi-dropzone-sub">Drag and drop your invoice PDF here, or click to browse files</div>
                <input type="file" multiple accept=".pdf,.png,.jpg" onChange={handleFileUpload} hidden />
              </label>

              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        fontSize: 14,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Paperclip size={15} style={{ color: 'var(--primary-500, #0a6ed1)' }} />
                        <span style={{ fontWeight: 600 }}>{att.name}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>({att.size})</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="cpi-totals-card">
            <div className="cpi-section-header" style={{ paddingBottom: 10, marginBottom: 4 }}>
              <div className="cpi-section-header-left">
                <span className="cpi-section-badge">{creationMode === 'manual' ? '04' : '05'}</span>
                <div>
                  <h3 className="cpi-section-title">Final Value & Workflow</h3>
                </div>
              </div>
            </div>

            <div className="cpi-field">
              <label>CURRENCY</label>
              <CurrencySelector value={currency} onChange={setCurrency} />
            </div>

            <div className="cpi-totals-row">
              <span>Subtotal</span>
              <span>{formatAmount(calculations.subtotal, currency)}</span>
            </div>
            <div className="cpi-totals-row">
              <span>Total Tax</span>
              <span>{formatAmount(calculations.totalTax, currency)}</span>
            </div>

            <div className="cpi-totals-divider" />

            <div className="cpi-totals-grand">
              <span>Final Value</span>
              <span className="cpi-totals-grand-val">{formatAmount(calculations.grandTotal, currency)}</span>
            </div>

            <div className="cpi-workflow-notice">
              <PackageCheck size={18} />
              <span>Triggers AccountsPayable Approval Workflow</span>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                className="cpi-btn cpi-btn--primary"
                style={{ width: '100%', padding: '12px 20px', fontSize: 15 }}
                onClick={() => submitInvoiceToAPI(false)}
                disabled={savingDraft || submitting}
              >
                <Send size={16} /> {submitting ? 'Submitting…' : 'Submit Purchase Invoice'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Official Printable Document Container */}
      <div className="grn-print-document po-document">
        <div className="po-doc__header">
          <div className="po-doc__header-left">
            <img src={finalLogoUrl} alt={companyName || 'Procnex'} className="po-doc__logo" />
            <div className="po-doc__company-info">
              <h1 className="po-doc__company-name">
                {companyName && !companyName.includes('Procnex') ? companyName : 'Procnex'}
              </h1>
              <p className="po-doc__company-detail">
                {selectedPO?.companyAddress || selectedPO?.shipToAddress || '232,Sahukara Bareilly 232'}
              </p>
              <p className="po-doc__company-detail">
                Phone: {companyPhone || selectedPO?.companyPhone || '+918272811866'} &nbsp;|&nbsp; Email:{' '}
                {companyEmail || selectedPO?.companyEmail || 'nischalagarwal674@gmail.com'}
              </p>
              <p className="po-doc__company-detail">{selectedPO?.companyWebsite || 'www.procnex.com'}</p>
            </div>
          </div>
          <div className="po-doc__header-right">
            <div className="po-doc__title-block">
              <span className="po-doc__title-label" style={{ color: '#0a2342' }}>
                TAX INVOICE
              </span>
              <span className="po-doc__title-po-num">{invoiceNumber}</span>
            </div>
            <table className="po-doc__meta-table">
              <tbody>
                <tr>
                  <td className="po-doc__meta-label">Invoice Date</td>
                  <td className="po-doc__meta-value">{invoiceDate}</td>
                </tr>
                <tr>
                  <td className="po-doc__meta-label">Due Date</td>
                  <td className="po-doc__meta-value">{dueDate}</td>
                </tr>
                <tr>
                  <td className="po-doc__meta-label">PO Number</td>
                  <td className="po-doc__meta-value">{displayPoNumber}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="po-doc__divider" />

        <div className="po-doc__parties">
          <div className="po-doc__party-box">
            <h3 className="po-doc__party-heading">VENDOR / SUPPLIER</h3>
            <p className="po-doc__party-name">{vendorName || selectedPO?.vendor?.name || selectedPO?.vendorName || 'Embedded'}</p>
            <p className="po-doc__party-detail">
              Contact: {selectedPO?.vendor?.contactPerson || selectedPO?.vendorContactPerson || 'Nischal Agarwal'}
            </p>
            <p className="po-doc__party-detail">
              Address: {selectedPO?.vendor?.address || selectedPO?.vendorAddress || '232,Sahukara Bareilly 232'}
            </p>
            <p className="po-doc__party-detail">
              Phone: {selectedPO?.vendor?.phone || selectedPO?.vendorPhone || '+918272811866'}
            </p>
            <p className="po-doc__party-detail">
              Email: {selectedPO?.vendor?.email || selectedPO?.vendorEmail || 'nischalagarwal674@gmail.com'}
            </p>
            <p className="po-doc__party-detail">
              GST/VAT: {selectedPO?.vendor?.gstVat || selectedPO?.vendorGstVat || 'VAT60707070706'}
            </p>
          </div>
          <div className="po-doc__party-box">
            <h3 className="po-doc__party-heading">BILL TO (BUYER / CLIENT)</h3>
            <p className="po-doc__party-name">{companyName && !companyName.includes('Procnex') ? companyName : 'Procnex'}</p>
            <p className="po-doc__party-detail">Warehouse: {selectedPO?.shipToWarehouse || 'Central Warehouse'}</p>
            <p className="po-doc__party-detail">
              Address: {selectedPO?.shipToAddress || '232,Sahukara Bareilly 232'}
            </p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.shipToContact || 'Nischal Agarwal'}</p>
            <p className="po-doc__party-detail">
              Phone: {companyPhone || selectedPO?.shipToPhone || '+918272811866'}
            </p>
          </div>
        </div>

        <div className="po-doc__info-grid">
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">PO Reference</span>
            <span className="po-doc__info-value">{displayPoNumber}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Linked Dispatch Note / Invoice</span>
            <span className="po-doc__info-value">{displayGrnNumber}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Payment Terms</span>
            <span className="po-doc__info-value">{paymentTerms}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Invoice Date</span>
            <span className="po-doc__info-value">{invoiceDate}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Due Date</span>
            <span className="po-doc__info-value">{dueDate}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Status</span>
            <span className="po-doc__info-value">SUBMITTED FOR APPROVAL</span>
          </div>
        </div>

        <div className="po-doc__table-wrap">
          <table className="po-doc__items-table">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="po-doc__th--no">#</th>
                <th className="po-doc__th--desc">Description</th>
                <th className="po-doc__th--qty">PO Qty</th>
                <th className="po-doc__th--qty">Sup Qty</th>
                <th className="po-doc__th--price">Unit Price</th>
                <th className="po-doc__th--tax">Tax %</th>
                <th className="po-doc__th--disc">Disc %</th>
                <th className="po-doc__th--total">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => {
                const supQty = typeof item.supplierQty === 'number' ? item.supplierQty : 0;
                const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                const lineTotal = supQty * price * (1 + (item.taxPercent || 0) / 100);

                return (
                  <tr key={item.id}>
                    <td className="po-doc__td--no">{index + 1}</td>
                    <td className="po-doc__td--desc">{item.itemName || item.description || 'Line Item'}</td>
                    <td className="po-doc__td--qty">{item.poQty}</td>
                    <td className="po-doc__td--qty">{supQty}</td>
                    <td className="po-doc__td--price">{formatAmount(price, currency)}</td>
                    <td className="po-doc__td--tax">{item.taxPercent}%</td>
                    <td className="po-doc__td--disc">—</td>
                    <td className="po-doc__td--total">{formatAmount(lineTotal, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="po-doc__totals">
          <div className="po-doc__totals-table">
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Subtotal</span>
              <span className="po-doc__total-value">{formatAmount(calculations.subtotal, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Discount</span>
              <span className="po-doc__total-value">{formatAmount(0, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-row">Tax Total</span>
              <span className="po-doc__total-value">{formatAmount(calculations.totalTax, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Shipping Charges</span>
              <span className="po-doc__total-value">{formatAmount(0, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Other Charges</span>
              <span className="po-doc__total-value">{formatAmount(0, currency)}</span>
            </div>
            <div className="po-doc__total-divider" />
            <div className="po-doc__total-row po-doc__total-row--grand">
              <span className="po-doc__total-label po-doc__total-label--grand">Grand Total</span>
              <span className="po-doc__total-value po-doc__total-value--grand">
                {formatAmount(calculations.grandTotal, currency)}
              </span>
            </div>
          </div>
        </div>

        <div className="po-doc__divider" />
        <div className="po-doc__notes">
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Purchase Invoice Notes</h4>
            <p className="po-doc__notes-text">
              {notes || '3-way quantity matching verified. Invoice entered for Accounts Payable approval.'}
            </p>
          </div>
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Approval & Payment Terms</h4>
            <p className="po-doc__notes-text">
              Payment will be scheduled upon L2 Accounts Payable approval under agreed payment terms ({paymentTerms}).
            </p>
          </div>
        </div>

        <div className="po-doc__footer">
          <div className="po-doc__footer-divider" />
          <p className="po-doc__footer-text">
            {companyName}
            {companyPhone && <span> &nbsp;|&nbsp; Phone: {companyPhone}</span>}
            {companyEmail && <span> &nbsp;|&nbsp; Email: {companyEmail}</span>}
          </p>
        </div>
      </div>

      {/* Creation Mode Modal (Rendered in Entry Form View for 'Switch Mode' Button) */}
      {showModeModal && (
        <div className="cpi-modal-backdrop" onClick={() => setShowModeModal(false)}>
          <div className="cpi-modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div className="cpi-modal-header">
              <div>
                <h3 className="cpi-modal-title">Select Purchase Invoice Creation Method</h3>
                <p className="cpi-modal-sub">Choose how you want to create this purchase invoice entry</p>
              </div>
              <button className="cpi-modal-close" onClick={() => setShowModeModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '8px 0' }}>
              {/* Option 1: Link with Vendor Dispatch Note / Invoice */}
              <div
                className={`cpi-mode-option ${creationMode === 'linked' ? 'cpi-mode-option--selected' : ''}`}
                onClick={() => {
                  if (!poIdParam && !grnIdParam) {
                    setSelectedVendorId('');
                    setSelectedPoId('');
                    setSelectedGrnId('');
                    setVendorName('');
                  }
                  setCreationMode('linked');
                  setIsCreating(true);
                  setShowModeModal(false);
                }}
              >
                <div className="cpi-mode-icon">
                  <PackageCheck size={26} />
                </div>
                <div>
                  <div className="cpi-mode-title">Link with Vendor Dispatch Note / Invoice</div>
                  <div className="cpi-mode-desc">
                    Select from vendor-submitted Dispatch Notes or Invoices linked to Purchase Orders for automated 3-way quantity matching.
                  </div>
                </div>
              </div>

              {/* Option 2: Direct Manual Invoice */}
              <div
                className={`cpi-mode-option ${creationMode === 'manual' ? 'cpi-mode-option--selected' : ''}`}
                onClick={() => {
                  if (!poIdParam && !grnIdParam) {
                    setSelectedVendorId('');
                    setSelectedPoId('');
                    setSelectedGrnId('');
                    setVendorName('');
                  }
                  setCreationMode('manual');
                  setIsCreating(true);
                  setShowModeModal(false);
                }}
              >
                <div className="cpi-mode-icon cpi-mode-icon--green">
                  <Receipt size={26} />
                </div>
                <div>
                  <div className="cpi-mode-title">✏️ Create Custom / Direct Manual Invoice</div>
                  <div className="cpi-mode-desc">
                    Create a custom purchase invoice directly without requiring a vendor dispatch note cascade reference.
                  </div>
                </div>
              </div>
            </div>

            <div className="cpi-modal-actions">
              <button className="cpi-btn cpi-btn--outline" onClick={() => setShowModeModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
