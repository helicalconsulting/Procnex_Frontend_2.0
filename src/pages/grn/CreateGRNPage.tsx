import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useServiceData } from '../../hooks/useServiceData';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { purchaseRequisitionService } from '../../services/purchaseRequisitionService';
import { grnService, type GRNItemPayload } from '../../services/grnService';
import { invoiceService } from '../../services/invoiceService';
import { dispatchNoteService, type DispatchNote } from '../../services/dispatchNoteService';
import { companySettingsService, type Warehouse } from '../../services/companySettingsService';
import { apiRequest, invalidateApiCache } from '../../api/client';
import {
  ArrowLeft,
  Truck,
  PackageCheck,
  Send,
  Upload,
  Paperclip,
  X,
  Printer,
  Zap,
  Settings2,
  FileText,
  Sparkles,
  Plus,
  Trash2,
  Building2,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ActionSendingOverlay from '../../components/shared/ActionSendingOverlay';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useSuccessModal } from '../../context/SuccessModalContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Textarea } from '../../components/ui/input';
import { PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import { PrintGRNModal } from '../../components/grn/PrintGRNModal';

interface LineItemState {
  id: string;
  itemName: string;
  orderedQty: number;
  receivedQty: number | '';
  acceptedQty: number | '';
  rejectedQty: number | '';
  unitPrice: number;
  unit: string;
  remarks: string;
}

// Safe string helper defined at top-level scope before component mounts
function safeStr(val: any): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return val.poNumber || val.id || val.name || '';
  return '';
}

export default function CreateGRNPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showSuccess } = useSuccessModal();
  const { roles = [], user } = useAuth();
  const [searchParams] = useSearchParams();

  // Extract PO passed in router location state (if navigated directly from table action button)
  const poFromState = location.state?.po || location.state?.purchaseOrder || location.state?.poData;
  const poIdParam =
    searchParams.get('poId') ||
    searchParams.get('po') ||
    searchParams.get('poNumber') ||
    searchParams.get('id') ||
    location.state?.poId ||
    poFromState?.id ||
    poFromState?.poNumber;

  const invoiceIdParam = searchParams.get('invoiceId');
  const modeParam = searchParams.get('mode');

  const { companyDefaultCurrency, formatAmount } = useCurrency();

  // Mode Setting: AUTO_FILL (from Vendor Dispatch/Invoice) vs MANUAL (Custom GRN Entry)
  const [entryMode, setEntryMode] = useState<'AUTO_FILL' | 'MANUAL'>(() => {
    if (modeParam === 'manual') return 'MANUAL';
    if (modeParam === 'autofill' || invoiceIdParam) return 'AUTO_FILL';
    return 'AUTO_FILL'; // Default to autofill mode for convenience
  });

  // Single fetched PO state if not found in list but poIdParam is present
  const [fetchedDirectPO, setFetchedDirectPO] = useState<any>(null);

  // Load purchase orders list
  const { data: poData, loading: poLoading1 } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    [],
    { cacheKey: 'create-grn:pos', cacheTtlMs: 30000 }
  );

  // Load purchase requisitions list
  const { data: reqList, loading: poLoading2 } = useServiceData(
    () => purchaseRequisitionService.list(),
    [],
    [],
    { cacheKey: 'create-grn:requisitions', cacheTtlMs: 30000 }
  );

  const poLoading = poLoading1 || poLoading2;

  const rawPoList = useMemo(() => {
    const rawOrders = poData.orders || [];
    const rawReqs = reqList || [];

    const combined: any[] = [];
    const addedKeys = new Set<string>();

    // Add actual Purchase Orders first so genuine PO IDs take precedence
    rawOrders.forEach((po) => {
      const numKey = String(po.poNumber || '').toLowerCase().trim();
      const idKey = String(po.id || '').toLowerCase().trim();
      const key = numKey || idKey;
      if (key && !addedKeys.has(key)) {
        addedKeys.add(key);
        if (numKey) addedKeys.add(numKey);
        if (idKey) addedKeys.add(idKey);
        combined.push(po);
      }
    });

    const mappedReqs = rawReqs.map((req) => ({
      id: req.id || req.rfqId,
      poNumber: req.poNumber,
      vendor: {
        id: req.vendorGstVat || 'vendor_req',
        name: req.vendorName || 'Supplier',
      },
      totalAmount: Number(req.grandTotal || req.subtotal || 0),
      createdAt: req.poDate || req.createdAt || new Date().toISOString(),
      status: req.status || 'APPROVED',
      items: (req.items || []).map((it) => ({
        id: it.id || String(it.itemNo),
        itemName: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        totalPrice: it.total,
      })),
      isRequisition: true,
    }));

    mappedReqs.forEach((r) => {
      const numKey = String(r.poNumber || '').toLowerCase().trim();
      const idKey = String(r.id || '').toLowerCase().trim();
      if ((numKey && addedKeys.has(numKey)) || (idKey && addedKeys.has(idKey))) {
        return;
      }
      const key = numKey || idKey;
      if (key && !addedKeys.has(key)) {
        addedKeys.add(key);
        if (numKey) addedKeys.add(numKey);
        if (idKey) addedKeys.add(idKey);
        combined.push(r);
      }
    });

    return combined;
  }, [poData, reqList]);

  // Filter ONLY Approved POs for GRN creation
  const approvedPOs = useMemo(() => {
    return rawPoList.filter((po) => {
      const s = String(po?.status || '').toUpperCase();
      return (
        s === 'APPROVED' ||
        s === 'CONFIRMED' ||
        s === 'SENT_TO_VENDOR' ||
        s === 'PROCESSING' ||
        s === 'SHIPPED' ||
        s === 'GRN_RECEIVED'
      );
    });
  }, [rawPoList]);

  // Load invoices list for auto-fill source
  const { data: invoicesList } = useServiceData(
    () => invoiceService.list({ limit: 100 }),
    [],
    [],
    { cacheKey: 'create-grn:invoices', cacheTtlMs: 30000 }
  );

  // Load dispatch notes list for inbound receiving
  const { data: dnData } = useServiceData(
    () => dispatchNoteService.list({ limit: 100 }),
    { dispatchNotes: [], total: 0 },
    [],
    { cacheKey: 'create-grn:dns', cacheTtlMs: 30000 }
  );
  const dispatchNotes = dnData.dispatchNotes || [];

  // Load existing GRNs to detect and prevent duplicate GRN creation
  const { data: existingGrnData } = useServiceData(
    () => grnService.list({ limit: 100 }),
    { grns: [], total: 0 },
    [],
    { cacheKey: 'create-grn:grns', cacheTtlMs: 30000 }
  );
  const existingGrns = existingGrnData.grns || [];

  const posWithExistingGrn = useMemo(() => {
    const set = new Set<string>();
    existingGrns.forEach((g) => {
      if (g.poId) set.add(String(g.poId).toLowerCase().trim());
      if (g.purchaseOrder?.id) set.add(String(g.purchaseOrder.id).toLowerCase().trim());
      if (g.purchaseOrder?.poNumber) set.add(String(g.purchaseOrder.poNumber).toLowerCase().trim());
      if (g.vendorInvoiceNumber) set.add(String(g.vendorInvoiceNumber).toLowerCase().trim());
      if (g.dispatchNoteNumber) set.add(String(g.dispatchNoteNumber).toLowerCase().trim());
      if (g.notes) {
        const matches = g.notes.match(/po-[a-z0-9_-]+/gi);
        if (matches) {
          matches.forEach((m) => set.add(m.toLowerCase().trim()));
        }
      }
    });
    return set;
  }, [existingGrns]);

  // Form State
  const [grnNumber, setGrnNumber] = useState<string>(() => `GRN-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedPoId, setSelectedPoId] = useState<string>(() => safeStr(poIdParam));
  const [selectedInboundDocId, setSelectedInboundDocId] = useState<string>(() => {
    if (invoiceIdParam) return `inv_${invoiceIdParam}`;
    return '';
  });
  const [vendorDispatchNoteNumber, setVendorDispatchNoteNumber] = useState<string>('');
  const [selectedVendorInvoiceId, setSelectedVendorInvoiceId] = useState<string>('');
  const [receivedDate, setReceivedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [warehouseLocation, setWarehouseLocation] = useState<string>('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [currency] = useState<string>(companyDefaultCurrency);
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  // Load Warehouses from Company Settings
  useEffect(() => {
    setLoadingWarehouses(true);
    companySettingsService
      .listWarehouses()
      .then((whs) => {
        const activeWhs = whs.filter((w) => w.isActive !== false);
        setWarehouses(activeWhs);
        if (activeWhs.length > 0) {
          const defWh = activeWhs.find((w) => w.isDefault) || activeWhs[0];
          if (defWh && !warehouseLocation) {
            setSelectedWarehouseId(defWh.id);
            setWarehouseLocation(`${defWh.code} — ${defWh.name}`);
          }
        }
      })
      .catch((err) => console.warn('Failed to load company warehouses:', err))
      .finally(() => setLoadingWarehouses(false));
  }, []);

  const handleWarehouseSelect = (whId: string) => {
    setSelectedWarehouseId(whId);
    if (whId === 'CUSTOM') {
      return;
    }
    const wh = warehouses.find((w) => w.id === whId);
    if (wh) {
      const fullLoc = `${wh.code} — ${wh.name}`;
      setWarehouseLocation(fullLoc);
    }
  };

  // Line items state
  const [lineItems, setLineItems] = useState<LineItemState[]>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Selected PO details (prioritizes location.state po, fetchedDirectPO, then matches rawPoList)
  const selectedPO = useMemo(() => {
    if (poFromState) return poFromState;
    if (fetchedDirectPO) return fetchedDirectPO;
    if (!selectedPoId || !rawPoList || rawPoList.length === 0) return null;
    const target = safeStr(selectedPoId).toLowerCase().trim();
    return (
      rawPoList.find((po) => {
        const pId = safeStr(po.id || (po as any)._id).toLowerCase().trim();
        const pNum = safeStr(po.poNumber).toLowerCase().trim();
        const rfqId = safeStr(po.rfqId).toLowerCase().trim();
        return (pId && pId === target) || (pNum && pNum === target) || (rfqId && rfqId === target);
      }) || null
    );
  }, [poFromState, fetchedDirectPO, rawPoList, selectedPoId]);

  // Check if the selected PO has already been received
  const isSelectedPoAlreadyReceived = useMemo(() => {
    if (!selectedPoId && !selectedPO) return false;
    const poIdStr = safeStr(selectedPO?.id || selectedPoId).toLowerCase().trim();
    const poNumStr = safeStr(selectedPO?.poNumber).toLowerCase().trim();
    const s = String(selectedPO?.status || '').toUpperCase().trim();
    return (
      (poIdStr && posWithExistingGrn.has(poIdStr)) ||
      (poNumStr && posWithExistingGrn.has(poNumStr)) ||
      s === 'GRN_RECEIVED' ||
      s === 'DELIVERED' ||
      s === 'CLOSED'
    );
  }, [selectedPoId, selectedPO, posWithExistingGrn]);

  // Keep selectedPoId in sync with selectedPO id/poNumber
  useEffect(() => {
    if (selectedPO) {
      const canonicalId = safeStr(selectedPO.id || selectedPO.poNumber);
      if (canonicalId && selectedPoId !== canonicalId) {
        setSelectedPoId(canonicalId);
      }
    }
  }, [selectedPO]);

  // Display options for PO select dropdown (filters out already received POs while keeping selectedPO)
  const displayPOOptions = useMemo(() => {
    const list = approvedPOs.filter((po) => {
      const pId = safeStr(po.id).toLowerCase().trim();
      const pNum = safeStr(po.poNumber).toLowerCase().trim();
      const s = String(po?.status || '').toUpperCase().trim();
      const hasGrn = (pId && posWithExistingGrn.has(pId)) || (pNum && posWithExistingGrn.has(pNum));
      const isCurrentSelected = selectedPO && (pId === safeStr(selectedPO.id).toLowerCase().trim() || pNum === safeStr(selectedPO.poNumber).toLowerCase().trim());
      return isCurrentSelected || (!hasGrn && s !== 'GRN_RECEIVED' && s !== 'DELIVERED' && s !== 'CLOSED');
    });
    if (selectedPO) {
      const selId = safeStr(selectedPO.id || selectedPO.poNumber).toLowerCase().trim();
      if (!list.some((p) => safeStr(p.id || p.poNumber).toLowerCase().trim() === selId)) {
        list.unshift(selectedPO);
      }
    }
    return list;
  }, [approvedPOs, selectedPO, posWithExistingGrn]);

  // Fetch single PO directly from API if poIdParam is present but not found in state or rawPoList
  useEffect(() => {
    if (poIdParam && !selectedPO && !poLoading) {
      apiRequest<any>(`/purchase-orders/${poIdParam}`)
        .then((res) => {
          if (res) {
            setFetchedDirectPO(res);
            setSelectedPoId(String(res.id || res.poNumber || poIdParam));
          }
        })
        .catch(() => {
          // Ignore API error if PO is not found by ID endpoint
        });
    }
  }, [poIdParam, selectedPO, poLoading]);

  // Display options combining Dispatch Notes and Vendor Invoices for inbound receiving
  const displayInboundDocOptions = useMemo(() => {
    const list: Array<{
      id: string;
      docType: 'DISPATCH' | 'INVOICE';
      docNumber: string;
      label: string;
      poId: string;
      poNumber: string;
      vendorName: string;
      rawDoc: any;
    }> = [];

    // 1. Dispatch Notes
    (dispatchNotes || []).forEach((dn) => {
      const vName = dn.vendor?.name || (dn as any).vendorName || 'Supplier';
      const itemsCount = dn.items?.length || 0;
      const countLabel = itemsCount > 0 ? ` (${itemsCount} items)` : '';
      list.push({
        id: `dn_${dn.id}`,
        docType: 'DISPATCH',
        docNumber: dn.dispatchNoteNumber,
        label: `🚚 [Dispatch Note] ${dn.dispatchNoteNumber} — ${vName}${countLabel}`,
        poId: dn.poId || '',
        poNumber: dn.poNumber || '',
        vendorName: vName,
        rawDoc: dn,
      });
    });

    // 2. Vendor Invoices
    (invoicesList || []).forEach((inv) => {
      const vName = inv.vendorName || (inv as any).vendor?.name || 'Supplier';
      const amtStr = inv.amount ? ` (${formatAmount(inv.amount, currency)})` : '';
      list.push({
        id: `inv_${inv.id}`,
        docType: 'INVOICE',
        docNumber: inv.invoiceNumber,
        label: `🧾 [Vendor Invoice] ${inv.invoiceNumber} — ${vName}${amtStr}`,
        poId: inv.poId || '',
        poNumber: inv.poNumber || '',
        vendorName: vName,
        rawDoc: inv,
      });
    });

    // If selectedPO is chosen, filter docs matching that PO
    if (selectedPO) {
      const targetPoId = safeStr(selectedPO.id).toLowerCase().trim();
      const targetPoNum = safeStr(selectedPO.poNumber).toLowerCase().trim();

      const filtered = list.filter((item) => {
        const itemPoId = safeStr(item.poId).toLowerCase().trim();
        const itemPoNum = safeStr(item.poNumber).toLowerCase().trim();
        return (
          (targetPoId && (itemPoId === targetPoId || itemPoNum === targetPoId)) ||
          (targetPoNum && (itemPoId === targetPoNum || itemPoNum === targetPoNum))
        );
      });

      return filtered;
    }

    return list;
  }, [dispatchNotes, invoicesList, selectedPO, currency, formatAmount]);

  // Check if inbound dispatch or invoice is submitted for selected PO
  const hasInboundDispatch = useMemo(() => {
    if (!selectedPO) return true;
    const targetPoId = safeStr(selectedPO.id).toLowerCase().trim();
    const targetPoNum = safeStr(selectedPO.poNumber).toLowerCase().trim();

    const hasDn = (dispatchNotes || []).some((dn) => {
      const pId = safeStr(dn.poId).toLowerCase().trim();
      const pNum = safeStr(dn.poNumber).toLowerCase().trim();
      return (targetPoId && (pId === targetPoId || pNum === targetPoId)) ||
             (targetPoNum && (pId === targetPoNum || pNum === targetPoNum));
    });
    if (hasDn) return true;

    const hasInv = (invoicesList || []).some((inv) => {
      const pId = safeStr(inv.poId).toLowerCase().trim();
      const pNum = safeStr(inv.poNumber).toLowerCase().trim();
      return (targetPoId && (pId === targetPoId || pNum === targetPoId)) ||
             (targetPoNum && (pId === targetPoNum || pNum === targetPoNum));
    });
    if (hasInv) return true;

    if (selectedPO.dispatchNoteNumber || selectedPO.vendorDispatchNoteNumber || selectedPO.vendorInvoiceNumber) {
      return true;
    }
    return false;
  }, [selectedPO, dispatchNotes, invoicesList]);

  // Selected Dispatch Note & Invoice derived objects
  const selectedDispatchNote = useMemo(() => {
    if (!selectedInboundDocId) return null;
    if (selectedInboundDocId.startsWith('dn_')) {
      const rawId = selectedInboundDocId.replace('dn_', '');
      return dispatchNotes.find((dn) => String(dn.id) === String(rawId) || String(dn.dispatchNoteNumber) === String(rawId)) || null;
    }
    return null;
  }, [selectedInboundDocId, dispatchNotes]);

  const selectedInvoice = useMemo(() => {
    if (!selectedInboundDocId) return null;
    if (selectedInboundDocId.startsWith('inv_')) {
      const rawId = selectedInboundDocId.replace('inv_', '');
      return (invoicesList || []).find((inv) => String(inv.id) === String(rawId) || String(inv.invoiceNumber) === String(rawId)) || null;
    }
    return null;
  }, [selectedInboundDocId, invoicesList]);

  // Handle selecting an inbound document from dropdown
  const handleInboundDocSelect = (docId: string) => {
    setSelectedInboundDocId(docId);
    if (!docId) {
      setSelectedVendorInvoiceId('');
      return;
    }

    const foundOpt = displayInboundDocOptions.find((opt) => opt.id === docId);
    if (!foundOpt) return;

    setVendorDispatchNoteNumber(foundOpt.docNumber);
    if (foundOpt.docType === 'INVOICE') {
      setSelectedVendorInvoiceId(foundOpt.rawDoc?.id || foundOpt.docNumber);
    } else {
      setSelectedVendorInvoiceId('');
    }

    // Auto-select PO if not yet selected
    if (foundOpt.poId || foundOpt.poNumber) {
      const matchedPo = rawPoList.find((p) => {
        const pId = safeStr(p.id).toLowerCase().trim();
        const pNum = safeStr(p.poNumber).toLowerCase().trim();
        const optPoId = safeStr(foundOpt.poId).toLowerCase().trim();
        const optPoNum = safeStr(foundOpt.poNumber).toLowerCase().trim();
        return (optPoId && (pId === optPoId || pNum === optPoId)) ||
               (optPoNum && (pId === optPoNum || pNum === optPoNum));
      });
      if (matchedPo) {
        setSelectedPoId(String(matchedPo.id || matchedPo.poNumber));
      }
    }

    // Auto-populate carrier info in notes if Dispatch Note
    if (foundOpt.docType === 'DISPATCH') {
      const dn = foundOpt.rawDoc;
      const details: string[] = [];
      if (dn.transporterName || dn.carrierName) details.push(`Carrier: ${dn.transporterName || dn.carrierName}`);
      if (dn.vehicleNumber) details.push(`Vehicle: ${dn.vehicleNumber}`);
      if (dn.trackingNumber) details.push(`Tracking/LR: ${dn.trackingNumber}`);
      if (details.length > 0) {
        const detailStr = details.join(' | ');
        setNotes((prev) => (prev && !prev.includes(detailStr) ? `${prev} (${detailStr})` : detailStr));
      }
    }
  };

  // Auto-sync matching inbound document when PO is selected
  useEffect(() => {
    if (!selectedPO) return;
    if (selectedInboundDocId) {
      const current = displayInboundDocOptions.find((opt) => opt.id === selectedInboundDocId);
      if (current) return;
    }
    if (displayInboundDocOptions.length > 0) {
      const firstDn = displayInboundDocOptions.find((d) => d.docType === 'DISPATCH');
      const pick = firstDn || displayInboundDocOptions[0];
      handleInboundDocSelect(pick.id);
    }
  }, [selectedPO, displayInboundDocOptions]);

  // Update line items and header details when PO or Inbound Document changes (Only in AUTO_FILL mode)
  useEffect(() => {
    if (!selectedPO) {
      if (entryMode === 'AUTO_FILL') {
        setLineItems([]);
      }
      return;
    }

    if (entryMode === 'AUTO_FILL') {
      // 1. Prioritize line items from Dispatch Note if selected
      if (selectedDispatchNote && selectedDispatchNote.items && selectedDispatchNote.items.length > 0) {
        const poTotalAmount = Number(selectedPO.totalAmount || selectedPO.grandTotal || 0);
        setLineItems(
          selectedDispatchNote.items.map((item: any, idx: number) => {
            const name = safeStr(item.itemName || item.name || item.description || `Dispatched Item ${idx + 1}`);
            let ordQty = Math.max(1, Number(item.poQty || item.orderedQty || item.quantity || item.qty || 1));
            let dispQty = Math.max(0, Number(item.dispatchedQty || item.invoicedQty || item.receivedQty || ordQty));
            let price = Number(item.unitPrice || item.price || item.rate || 0);
            const lineTotal = Number(item.total || item.totalPrice || item.amount || 0);

            if (!price && lineTotal > 0 && ordQty > 0) {
              price = Number((lineTotal / ordQty).toFixed(2));
            }
            if (price > 0 && lineTotal > 0 && ordQty === 1 && Math.round(lineTotal / price) > 1) {
              ordQty = Math.round(lineTotal / price);
              dispQty = ordQty;
            }
            if (price === 0 && poTotalAmount > 0 && ordQty > 0) {
              price = Number((poTotalAmount / (selectedDispatchNote.items.length || 1) / ordQty).toFixed(2));
            }

            return {
              id: `dn_item_${idx}_${Date.now()}`,
              itemName: name,
              orderedQty: ordQty,
              receivedQty: dispQty,
              acceptedQty: dispQty,
              rejectedQty: 0,
              unitPrice: price,
              unit: safeStr(item.unit || item.uom || 'Units'),
              remarks: 'Inspected - Dispatched items verified',
            };
          })
        );
      } else {
        const isDirectMasterRfq = selectedPO.rfq?.title === 'Direct PO Master' || selectedPO.rfq?.rfqNumber?.startsWith('RFQ-DIRECT');
        const rawItems: any[] =
          (selectedInvoice?.items && selectedInvoice.items.length > 0 && selectedInvoice.items) ||
          (selectedInvoice?.lineItems && selectedInvoice.lineItems.length > 0 && selectedInvoice.lineItems) ||
          (selectedPO.items && selectedPO.items.length > 0 && selectedPO.items) ||
          (selectedPO.lineItems && selectedPO.lineItems.length > 0 && selectedPO.lineItems) ||
          (selectedPO.products && selectedPO.products.length > 0 && selectedPO.products) ||
          (selectedPO.materials && selectedPO.materials.length > 0 && selectedPO.materials) ||
          (!isDirectMasterRfq && selectedPO.rfq?.selectedQuotation?.items && selectedPO.rfq.selectedQuotation.items.length > 0 && selectedPO.rfq.selectedQuotation.items) ||
          (!isDirectMasterRfq && selectedPO.rfq?.items && selectedPO.rfq.items.length > 0 && selectedPO.rfq.items) ||
          (selectedPO.requisition?.items && selectedPO.requisition.items.length > 0 && selectedPO.requisition.items) ||
          [];

        const poTotalAmount = Number(selectedPO.totalAmount || selectedPO.grandTotal || 0);

        if (rawItems.length > 0) {
          setLineItems(
            rawItems.map((item: any, idx: number) => {
              const name = safeStr(
                item.itemName ||
                item.name ||
                item.description ||
                item.itemDescription ||
                item.title ||
                (!isDirectMasterRfq && selectedPO.rfq?.title ? selectedPO.rfq.title : '') ||
                selectedPO.title ||
                selectedPO.poNumber ||
                'Purchase Order Material/Services'
              );
              let qty = Math.max(1, Number(item.poQty || item.quantity || item.orderedQty || item.qty || item.invoicedQty || 1));
              let recQty = Math.max(0, Number(item.invoicedQty || item.dispatchedQty || item.receivedQty || item.poQty || item.quantity || qty));
              let price = Number(item.unitPrice || item.price || item.rate || 0);
              const lineTotal = Number(item.total || item.totalPrice || item.amount || 0);

              if (!price && lineTotal > 0 && qty > 0) {
                price = Number((lineTotal / qty).toFixed(2));
              }
              if (price > 0 && lineTotal > 0 && qty === 1 && Math.round(lineTotal / price) > 1) {
                qty = Math.round(lineTotal / price);
                recQty = qty;
              }
              if (price === 0 && poTotalAmount > 0 && qty > 0) {
                price = Number((poTotalAmount / (rawItems.length || 1) / qty).toFixed(2));
              } else if (poTotalAmount > 0 && price * qty > poTotalAmount * 1.5) {
                price = Number((poTotalAmount / (rawItems.length || 1) / qty).toFixed(2));
              }

              return {
                id: `item_${idx}_${Date.now()}`,
                itemName: name || 'Purchase Order Material/Services',
                orderedQty: qty,
                receivedQty: recQty,
                acceptedQty: recQty,
                rejectedQty: 0,
                unitPrice: price,
                unit: safeStr(item.unit || item.uom || 'Units'),
                remarks: 'Inspected - Goods in good condition',
              };
            })
          );
        } else {
          const fallbackTitle = safeStr(
            (selectedPO.rfq?.title && selectedPO.rfq.title !== 'Direct PO Master' ? selectedPO.rfq.title : '') ||
            selectedPO.title ||
            selectedPO.poNumber ||
            'Purchase Order Material/Services'
          );

          setLineItems([
            {
              id: `item_0_${Date.now()}`,
              itemName: fallbackTitle || 'Purchase Order Material/Services',
              orderedQty: 1,
              receivedQty: 1,
              acceptedQty: 1,
              rejectedQty: 0,
              unitPrice: Number(selectedPO.totalAmount || selectedPO.grandTotal || 0),
              unit: 'Units',
              remarks: 'Inspected - Verified',
            },
          ]);
        }
      }
    }

    // Auto-fill warehouse location & dispatch note if available on selected PO
    const poWhLocation = selectedPO.warehouseLocation || selectedPO.deliveryLocation || selectedPO.shippingAddress;
    if (poWhLocation) {
      setWarehouseLocation(poWhLocation);
      const matchedWh = warehouses.find(
        (w) =>
          w.id === poWhLocation ||
          w.name.toLowerCase() === poWhLocation.toLowerCase() ||
          w.code.toLowerCase() === poWhLocation.toLowerCase() ||
          `${w.code} — ${w.name}`.toLowerCase() === poWhLocation.toLowerCase()
      );
      if (matchedWh) {
        setSelectedWarehouseId(matchedWh.id);
      } else {
        setSelectedWarehouseId('CUSTOM');
      }
    }
    if (selectedPO.dispatchNoteNumber || selectedPO.vendorDispatchNoteNumber || selectedPO.vendorInvoiceNumber) {
      setVendorDispatchNoteNumber(selectedPO.dispatchNoteNumber || selectedPO.vendorDispatchNoteNumber || selectedPO.vendorInvoiceNumber || '');
    }
  }, [selectedPO, selectedDispatchNote, selectedInvoice, warehouses, entryMode]);

  // Pre-select PO ONLY if poId is in URL query params or router state
  useEffect(() => {
    if (!rawPoList || rawPoList.length === 0) return;
    if (poIdParam) {
      const target = safeStr(poIdParam).toLowerCase().trim();
      const match = rawPoList.find((p) => {
        const pId = safeStr(p.id || (p as any)._id).toLowerCase().trim();
        const pNum = safeStr(p.poNumber).toLowerCase().trim();
        const rfqId = safeStr(p.rfqId).toLowerCase().trim();
        return (pId && pId === target) || (pNum && pNum === target) || (rfqId && rfqId === target);
      });
      if (match) {
        setSelectedPoId(String(match.id || match.poNumber));
      }
    }
  }, [poIdParam, rawPoList]);

  // Handle line item edits (Bidirectional Accepted <-> Rejected auto calculation)
  const handleUpdateItem = (id: string, field: keyof LineItemState, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        const rec = updated.receivedQty === '' || updated.receivedQty == null ? 0 : Number(updated.receivedQty) || 0;

        if (field === 'acceptedQty') {
          const acc = value === '' || value == null ? 0 : Number(value) || 0;
          updated.rejectedQty = Math.max(0, rec - acc);
        } else if (field === 'rejectedQty') {
          const rej = value === '' || value == null ? 0 : Number(value) || 0;
          updated.acceptedQty = Math.max(0, rec - rej);
        } else if (field === 'receivedQty') {
          const rej = updated.rejectedQty === '' || updated.rejectedQty == null ? 0 : Number(updated.rejectedQty) || 0;
          updated.acceptedQty = Math.max(0, rec - rej);
        }
        return updated;
      })
    );
  };

  // Add line item manually (Mode B)
  const handleAddManualItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}_${prev.length}`,
        itemName: '',
        orderedQty: 1,
        receivedQty: 1,
        acceptedQty: 1,
        rejectedQty: 0,
        unitPrice: 0,
        unit: 'Units',
        remarks: 'Manual receiving entry',
      },
    ]);
  };

  // Remove manual line item
  const handleRemoveItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

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

  // Calculations
  const calculations = useMemo(() => {
    let totalPoValue = 0;
    let totalGrnValue = 0;
    let totalAcceptedValue = 0;

    lineItems.forEach((item) => {
      const ordQty = Number(item.orderedQty) || 0;
      const recQty = Number(item.receivedQty) || 0;
      const accQty = Number(item.acceptedQty) || 0;
      const price = Number(item.unitPrice) || 0;

      totalPoValue += ordQty * price;
      totalGrnValue += recQty * price;
      totalAcceptedValue += accQty * price;
    });

    return { totalPoValue, totalGrnValue, totalAcceptedValue };
  }, [lineItems]);

  // Form Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (isSelectedPoAlreadyReceived) {
      setErrorMsg(`A Goods Receipt Note has already been recorded for Purchase Order #${selectedPO?.poNumber || selectedPoId}. Duplicate GRN is not allowed.`);
      return false;
    }
    if (selectedPO && !hasInboundDispatch) {
      setErrorMsg(`Vendor Dispatch or Invoice Required: The vendor has not yet submitted a Dispatch Note (Delivery Challan) or Vendor Invoice for Purchase Order #${selectedPO?.poNumber || selectedPoId}. GRN cannot be created until the vendor dispatches materials.`);
      return false;
    }
    if (!selectedPoId && entryMode === 'MANUAL' && lineItems.length === 0) {
      setErrorMsg('Please select a Purchase Order or enter line items.');
      return false;
    }
    if (lineItems.length === 0) {
      setErrorMsg('Please add at least one line item to record receipt.');
      return false;
    }
    return true;
  };

  // Direct Submission (NO WORKFLOW / NO APPROVAL CHAIN REQUIRED)
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payloadItems: GRNItemPayload[] = lineItems.map((item) => ({
        itemName: item.itemName || 'Received Item',
        orderedQty: Number(item.orderedQty) || 1,
        receivedQty: Number(item.receivedQty) || 0,
        acceptedQty: item.acceptedQty !== '' && item.acceptedQty != null ? Number(item.acceptedQty) : (Number(item.receivedQty) || 0),
        rejectedQty: item.rejectedQty !== '' && item.rejectedQty != null ? Number(item.rejectedQty) : 0,
        unitPrice: Number(item.unitPrice) || 0,
        unit: item.unit,
        remarks: item.remarks,
      }));

      await grnService.create({
        poId: selectedPO?.poNumber || selectedPO?.id || selectedPoId || 'MANUAL-PO',
        entryMode,
        dispatchNoteId: selectedDispatchNote?.id || undefined,
        dispatchNoteNumber: vendorDispatchNoteNumber || grnNumber,
        vendorInvoiceNumber: selectedInvoice?.invoiceNumber || vendorDispatchNoteNumber,
        invoiceId: selectedInvoice?.id,
        vendorId: selectedPO?.vendorId || selectedPO?.vendor?.id || selectedInvoice?.vendorId || selectedDispatchNote?.vendorId,
        vendorName: selectedPO?.vendor?.name || selectedInvoice?.vendorName || selectedDispatchNote?.vendor?.name || 'Supplier',
        receivedDate,
        notes: `${notes} (Location: ${warehouseLocation})`,
        items: payloadItems,
      });

      // Immediately invalidate and trigger fresh refetch across all service caches
      invalidateApiCache('/grn');
      invalidateApiCache('/purchase-orders');
      window.dispatchEvent(new CustomEvent('heliflow:grn-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:po-updated'));
      await queryClient.invalidateQueries({ queryKey: ['svc'] });
      queryClient.refetchQueries({ queryKey: ['svc'] });

      showSuccess({
        title: 'Goods Receipt Note Created!',
        badge: 'GRN POSTED',
        message: `Goods Receipt Note ${grnNumber} has been verified and posted directly. Ready for Purchase Invoice creation.`,
        referenceNumber: grnNumber,
        details: [
          { label: 'Purchase Order', value: selectedPO?.poNumber || selectedPoId || 'MANUAL-PO' },
          { label: 'Vendor / Supplier', value: selectedPO?.vendor?.name || selectedInvoice?.vendorName || selectedDispatchNote?.vendor?.name || 'Supplier' },
          { label: 'Inbound Document', value: vendorDispatchNoteNumber || selectedInboundDocId || 'Direct Dispatch' },
          { label: 'Items Received', value: `${payloadItems.length} line items` },
          { label: 'Received Date', value: receivedDate },
        ],
        primaryBtnText: 'View Recorded GRNs',
        onPrimaryClick: () => {
          navigate('/procurement/goods-receipt?tab=recorded', {
            state: { filter: 'GRN', tab: 'recorded', newGrnNumber: grnNumber },
            replace: true,
          });
        },
        secondaryBtnText: 'Create Purchase Invoice',
        onSecondaryClick: () => {
          navigate(
            `/procurement/create-purchase-invoice?poId=${encodeURIComponent(selectedPO?.id || selectedPO?.poNumber || selectedPoId)}&grnId=${encodeURIComponent(grnNumber)}`
          );
        },
        onClose: () => {
          navigate('/procurement/goods-receipt?tab=recorded', {
            state: { filter: 'GRN', tab: 'recorded', newGrnNumber: grnNumber },
            replace: true,
          });
        },
      });

      navigate('/procurement/goods-receipt?tab=recorded', {
        state: { filter: 'GRN', tab: 'recorded', newGrnNumber: grnNumber },
        replace: true,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save Goods Receipt Note.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageFrame>
      {/* Notifications */}
      {errorMsg && (
        <div className="mb-4">
          <MessageStrip type="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </MessageStrip>
        </div>
      )}

      {isSelectedPoAlreadyReceived && (
        <div className="mb-4">
          <MessageStrip type="warning">
            A Goods Receipt Note has already been recorded for this Purchase Order (#{selectedPO?.poNumber || selectedPoId}). You can view the verified document in Recorded GRNs. Duplicate GRN creation is disabled.
          </MessageStrip>
        </div>
      )}

      {selectedPO && !hasInboundDispatch && (
        <div className="mb-4">
          <MessageStrip type="warning">
            <div className="flex items-start gap-2.5">
              <Clock className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Awaiting Vendor Dispatch or Invoice:</span> The vendor has not yet submitted a Dispatch Note (Delivery Challan) or Vendor Invoice for Purchase Order #{selectedPO.poNumber || selectedPoId}. Goods Receipt (GRN) requires an inbound dispatch or invoice from the vendor before it can be verified and posted.
              </div>
            </div>
          </MessageStrip>
        </div>
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between gap-3.5 flex-wrap mb-6">
        <div className="flex items-center gap-3.5 min-w-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(-1)}
            className="size-10 min-w-10 rounded-lg shrink-0 border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="size-[18px]" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-[27px] font-bold text-foreground leading-tight tracking-normal m-0 mb-1">
              Create Goods Receipt Note (GRN)
            </h1>
            <p className="text-[16px] text-muted-foreground m-0">
              Record physical material receipt and verify against Purchase Order and Vendor Invoice for 3-way matching.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPrintModal(true)}
            className="gap-2"
          >
            <Printer className="size-4" /> Print GRN Document
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* GRN Creation Mode Card */}
        <Card className="p-6 border border-border/80 shadow-xs">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Settings2 className="size-5 text-primary" />
              <h2 className="text-base font-bold text-foreground">GRN Creation Mode</h2>
            </div>
            <Badge variant="outline" className="text-xs font-normal">
              Direct Post (No Approval Required)
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Mode 1: Auto-Fill */}
            <div
              onClick={() => setEntryMode('AUTO_FILL')}
              className={cn(
                'cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-4',
                entryMode === 'AUTO_FILL'
                  ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
                  : 'bg-card border-border/70 hover:border-border hover:bg-muted/30'
              )}
            >
              <div className={cn(
                'p-3 rounded-lg flex items-center justify-center shrink-0',
                entryMode === 'AUTO_FILL' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground text-sm">Auto-fill from Vendor Invoice / Dispatch Note</h3>
                  {entryMode === 'AUTO_FILL' && (
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Select incoming Vendor Invoice or Dispatch Note. PO details, quantities, and pricing auto-populate instantly.
                </p>
              </div>
            </div>

            {/* Mode 2: Manual GRN */}
            <div
              onClick={() => {
                setEntryMode('MANUAL');
                setLineItems([
                  {
                    id: `manual_${Date.now()}_0`,
                    itemName: '',
                    orderedQty: 1,
                    receivedQty: 1,
                    acceptedQty: 1,
                    rejectedQty: 0,
                    unitPrice: 0,
                    unit: 'Units',
                    remarks: 'Manual receiving entry',
                  },
                ]);
              }}
              className={cn(
                'cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-4',
                entryMode === 'MANUAL'
                  ? 'bg-primary/5 border-primary ring-1 ring-primary/20'
                  : 'bg-card border-border/70 hover:border-border hover:bg-muted/30'
              )}
            >
              <div className={cn(
                'p-3 rounded-lg flex items-center justify-center shrink-0',
                entryMode === 'MANUAL' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                <FileText className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground text-sm">Create GRN Manually</h3>
                  {entryMode === 'MANUAL' && (
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Input custom materials, received, accepted, and rejected inspection quantities with custom remarks.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Header & Reference Details Card */}
        <Card className="p-6 border border-border/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-border/60">
            <Truck className="size-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Header & Reference Details</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* GRN # */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                GRN Number (System Ref) *
              </label>
              <Input
                type="text"
                value={grnNumber}
                onChange={(e) => setGrnNumber(e.target.value)}
                className="font-mono text-sm bg-background"
                placeholder="e.g. GRN-2026-5255"
              />
            </div>

            {/* If Mode == AUTO_FILL, Vendor Inbound Document Dropdown */}
            {entryMode === 'AUTO_FILL' && (
              <div>
                <label className="block text-xs font-semibold text-primary uppercase tracking-wider mb-1.5 flex items-center justify-between">
                  <span>Vendor Dispatch / Invoice *</span>
                  {selectedInboundDocId && (
                    <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400">
                      ✓ Inbound Verified
                    </span>
                  )}
                </label>
                <select
                  value={selectedInboundDocId}
                  onChange={(e) => handleInboundDocSelect(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">-- Select Incoming Dispatch / Invoice --</option>
                  {displayInboundDocOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* PO Number Select */}
            <div className={entryMode === 'AUTO_FILL' ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Purchase Order (PO Ref) *
              </label>
              <select
                value={selectedPO ? safeStr(selectedPO.id || selectedPO.poNumber) : selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
                disabled={poLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">-- Select Approved PO --</option>
                {displayPOOptions.map((po) => {
                  const optVal = safeStr(po.id || po.poNumber);
                  return (
                    <option key={optVal} value={optVal}>
                      {po.poNumber} — {po.vendor?.name || 'Vendor'} ({formatAmount(po.totalAmount, currency)})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Delivery Date */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Received Date *
              </label>
              <Input
                type="date"
                value={receivedDate ? String(receivedDate).slice(0, 10) : ''}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="text-sm bg-background"
              />
            </div>

            {/* Vendor Dispatch Note Ref */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Vendor Dispatch / LR No.
              </label>
              <Input
                type="text"
                placeholder="e.g. DN-99482 / LR-1029"
                value={vendorDispatchNoteNumber}
                onChange={(e) => setVendorDispatchNoteNumber(e.target.value)}
                className="text-sm bg-background"
              />
            </div>

            {/* Warehouse Location - Linked to Company Settings */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>Store / Warehouse Location</span>
                <span className="text-[11px] font-normal text-primary lowercase tracking-normal">
                  (linked to company settings)
                </span>
              </label>
              <div className="space-y-2">
                <select
                  value={selectedWarehouseId}
                  onChange={(e) => handleWarehouseSelect(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                >
                  <option value="">-- Select Warehouse from Company Settings --</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.code} — {wh.name} {wh.city ? `(${wh.city})` : ''} {wh.isDefault ? '★ (Default Master)' : ''}
                    </option>
                  ))}
                  <option value="CUSTOM">✏️ Custom / Specific Store Location...</option>
                </select>

                {(selectedWarehouseId === 'CUSTOM' || (!selectedWarehouseId && warehouseLocation)) && (
                  <Input
                    type="text"
                    placeholder="e.g. Central Warehouse - Dock 1"
                    value={warehouseLocation}
                    onChange={(e) => setWarehouseLocation(e.target.value)}
                    className="text-sm bg-background mt-2"
                  />
                )}

                {selectedWarehouseId && selectedWarehouseId !== 'CUSTOM' && (() => {
                  const wh = warehouses.find((w) => w.id === selectedWarehouseId);
                  if (!wh) return null;
                  const fullAddress = [wh.address, wh.city, wh.country].filter(Boolean).join(', ');
                  return (
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 px-2.5 py-1.5 bg-muted/40 rounded-lg border border-border/50">
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">
                        <Building2 className="size-3.5 text-primary" /> {wh.code} — {wh.name}
                      </span>
                      {fullAddress && <span>📍 {fullAddress}</span>}
                      {wh.contactPerson && <span>👤 Contact: {wh.contactPerson}</span>}
                      {wh.phone && <span>📞 {wh.phone}</span>}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* PO Details Banner */}
          {selectedPO && (
            <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-wrap gap-6 items-center text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground font-medium">Supplier:</span>
                <span className="font-bold text-foreground">{selectedPO.vendor?.name || 'Vendor'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">PO Total:</span>
                <span className="font-bold text-primary">{formatAmount(selectedPO.totalAmount, currency)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Status:</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold">
                  {selectedPO.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Inbound Dispatch:</span>
                {hasInboundDispatch ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="size-3" /> Dispatched ({vendorDispatchNoteNumber || selectedInboundDocId || 'Verified'})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-semibold flex items-center gap-1">
                    <Clock className="size-3" /> Awaiting Vendor Dispatch
                  </Badge>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Received Items & Quantities Card */}
        <Card className="p-6 border border-border/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <PackageCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-foreground">Received Materials & Inspection Quantities</h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddManualItem}
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="size-3.5" /> Add Line Item
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-left text-sm min-w-[900px]">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border/70">
                <tr>
                  <th className="py-3 px-3.5 w-10 text-center">#</th>
                  <th className="py-3 px-3.5 min-w-[200px]">Item Description</th>
                  <th className="py-3 px-3.5 w-24 text-center">Ordered</th>
                  <th className="py-3 px-3.5 w-28 text-center">Received *</th>
                  <th className="py-3 px-3.5 w-28 text-center">Accepted</th>
                  <th className="py-3 px-3.5 w-28 text-center">Rejected</th>
                  <th className="py-3 px-3.5 w-32 text-right">Unit Price</th>
                  <th className="py-3 px-3.5 w-32 text-right">Total Value</th>
                  <th className="py-3 px-3.5 min-w-[160px]">Remarks</th>
                  <th className="py-3 px-3.5 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-muted-foreground">
                      No line items added. Select a Purchase Order or click '+ Add Line Item' above.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item, index) => {
                    const rec = typeof item.receivedQty === 'number' ? item.receivedQty : 0;
                    const price = item.unitPrice || 0;
                    const totalLineVal = rec * price;

                    return (
                      <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-3.5 text-center text-muted-foreground font-mono text-xs">{index + 1}</td>
                        <td className="py-3 px-3.5">
                          <Input
                            type="text"
                            value={item.itemName}
                            placeholder="Item description"
                            onChange={(e) => handleUpdateItem(item.id, 'itemName', e.target.value)}
                            className="h-9 text-sm bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Input
                            type="number"
                            min="0"
                            value={item.orderedQty}
                            onChange={(e) => handleUpdateItem(item.id, 'orderedQty', parseFloat(e.target.value) || 0)}
                            className="h-9 text-sm text-center font-bold bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Input
                            type="number"
                            min="0"
                            value={item.receivedQty}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                'receivedQty',
                                e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="h-9 text-sm text-center font-bold text-primary border-primary/40 bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.acceptedQty}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                'acceptedQty',
                                e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="h-9 text-sm text-center font-bold text-emerald-600 dark:text-emerald-400 bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.rejectedQty}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                'rejectedQty',
                                e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="h-9 text-sm text-center font-bold text-destructive bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitPrice}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                'unitPrice',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="h-9 text-sm text-right font-mono bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-right font-semibold tabular-nums text-foreground">
                          {formatAmount(totalLineVal, currency)}
                        </td>
                        <td className="py-3 px-3.5">
                          <Input
                            type="text"
                            value={item.remarks}
                            onChange={(e) => handleUpdateItem(item.id, 'remarks', e.target.value)}
                            className="h-9 text-xs text-muted-foreground bg-background"
                            placeholder="Inspection remarks..."
                          />
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.id)}
                            className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            title="Delete line item"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Remarks, Attachments & Totals Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Remarks & Attachment */}
          <Card className="md:col-span-2 p-6 border border-border/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
              Store Receiving Remarks & Documents
            </h3>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add storekeeper receiving observations, damage reports, waybill numbers, or batch details..."
              className="text-sm bg-background"
            />

            <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border/80 hover:border-primary/50 bg-muted/20 rounded-xl cursor-pointer transition-all">
              <Upload className="size-6 text-primary mb-1.5" />
              <span className="text-xs font-bold text-foreground">Upload Delivery Challan / Proof of Delivery</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">Supports PDF, PNG, JPG</span>
              <input type="file" multiple accept=".pdf,.png,.jpg" onChange={handleFileUpload} hidden />
            </label>

            {attachments.length > 0 && (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between p-2.5 bg-muted/40 border border-border/60 rounded-lg text-xs">
                    <div className="flex items-center gap-2">
                      <Paperclip className="size-4 text-primary" />
                      <span className="font-semibold text-foreground">{att.name}</span>
                      <span className="text-muted-foreground">({att.size})</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                      className="size-6 text-destructive"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Totals Summary */}
          <Card className="p-6 border border-border/80 shadow-xs flex flex-col justify-between space-y-6">
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/60">
                Value Summary
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Total PO Value:</span>
                  <span className="font-semibold text-foreground">{formatAmount(calculations.totalPoValue, currency)}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Total Delivered Value:</span>
                  <span className="font-semibold text-primary">{formatAmount(calculations.totalGrnValue, currency)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-border/60 text-base">
                  <span className="font-bold text-foreground">Accepted Value:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(calculations.totalAcceptedValue, currency)}</span>
                </div>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || (Boolean(selectedPO) && !hasInboundDispatch)}
              title={Boolean(selectedPO) && !hasInboundDispatch ? 'Vendor Dispatch Note or Invoice is required before GRN can be posted.' : undefined}
              className="w-full py-2.5 gap-2 shadow-sm font-bold"
            >
              <Send className="size-4" /> {submitting ? 'Posting GRN…' : 'Save & Post GRN'}
            </Button>
          </Card>
        </div>
      </div>

      <ActionSendingOverlay
        isOpen={submitting}
        docType="grn"
        docNumber={grnNumber}
        title="Verifying & Posting Goods Receipt Note (GRN)..."
        subtitle={`Verifying received items against PO #${selectedPO?.poNumber || selectedPoId || 'PO'}, updating warehouse stock, and syncing 3-way match records.`}
        vendorName={selectedPO?.vendor?.name || selectedInvoice?.vendorName || 'Supplier'}
        amount={calculations.totalAcceptedValue}
        currency={companyDefaultCurrency}
        mode="approval"
      />

      {showPrintModal && (
        <PrintGRNModal
          data={{
            grnNumber: grnNumber || 'GRN-DRAFT',
            poNumber: selectedPO?.poNumber || selectedPoId || '—',
            vendorDispatchNoteNumber: vendorDispatchNoteNumber || selectedDispatchNote?.dispatchNoteNumber,
            receivedDate: receivedDate || new Date().toISOString(),
            warehouse: warehouseLocation || 'Central Receiving Store',
            vendorName: selectedPO?.vendor?.name || selectedDispatchNote?.vendorName || selectedInvoice?.vendorName || 'Authorized Supplier',
            vendorAddress: selectedPO?.vendor?.address,
            vendorGstVat: selectedPO?.vendor?.gstNumber || selectedPO?.vendor?.taxId,
            notes,
            status: isSelectedPoAlreadyReceived ? 'RECEIVED' : 'VERIFIED & RECORDED',
            items: lineItems.map((li, idx) => ({
              id: li.id || idx + 1,
              itemCode: (li as any).itemCode || `ITM-${String(idx + 1).padStart(3, '0')}`,
              itemName: li.itemName,
              orderedQty: Number(li.orderedQty || 0),
              receivedQty: Number(li.receivedQty !== '' ? li.receivedQty : li.orderedQty),
              acceptedQty: Number(li.acceptedQty !== '' ? li.acceptedQty : (li.receivedQty !== '' ? li.receivedQty : li.orderedQty)),
              rejectedQty: Number(li.rejectedQty !== '' ? li.rejectedQty : 0),
              unitPrice: Number(li.unitPrice || 0),
              totalPrice: Number(li.totalPrice || 0),
              remarks: li.remarks,
            })),
            purchaseOrder: selectedPO,
          }}
          po={selectedPO}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </PageFrame>
  );
}
