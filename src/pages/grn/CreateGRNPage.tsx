import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { purchaseRequisitionService } from '../../services/purchaseRequisitionService';
import { grnService, type GRNItemPayload } from '../../services/grnService';
import { invoiceService } from '../../services/invoiceService';
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
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import defaultHeliflowLogo from '../../assets/heliflow.png';

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

export default function CreateGRNPage() {
  const navigate = useNavigate();
  const { roles = [], user } = useAuth();
  const [searchParams] = useSearchParams();
  const poIdParam = searchParams.get('poId');
  const invoiceIdParam = searchParams.get('invoiceId');
  const modeParam = searchParams.get('mode');

  const { companyDefaultCurrency, formatAmount } = useCurrency();
  const { logoUrl } = useBranding();

  // Mode Setting: AUTO_FILL (from Vendor Dispatch/Invoice) vs MANUAL (Custom GRN Entry)
  const [entryMode, setEntryMode] = useState<'AUTO_FILL' | 'MANUAL'>(() => {
    if (modeParam === 'manual') return 'MANUAL';
    if (modeParam === 'autofill' || invoiceIdParam) return 'AUTO_FILL';
    return 'AUTO_FILL'; // Default to autofill mode for convenience
  });

  // Load purchase orders list
  const { data: poData, loading: poLoading1 } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );

  // Load purchase requisitions list
  const { data: reqList, loading: poLoading2 } = useServiceData(
    () => purchaseRequisitionService.list(),
    [],
    []
  );

  const poLoading = poLoading1 || poLoading2;

  const rawPoList = useMemo(() => {
    const rawOrders = poData.orders || [];
    const rawReqs = reqList || [];

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

    const combined: any[] = [];
    const addedKeys = new Set<string>();

    mappedReqs.forEach((r) => {
      const numKey = String(r.poNumber || '').toLowerCase().trim();
      const idKey = String(r.id || '').toLowerCase().trim();
      const key = numKey || idKey;
      if (key && !addedKeys.has(key)) {
        addedKeys.add(key);
        if (numKey) addedKeys.add(numKey);
        if (idKey) addedKeys.add(idKey);
        combined.push(r);
      }
    });

    rawOrders.forEach((po) => {
      const numKey = String(po.poNumber || '').toLowerCase().trim();
      const idKey = String(po.id || '').toLowerCase().trim();
      if ((numKey && addedKeys.has(numKey)) || (idKey && addedKeys.has(idKey))) {
        return;
      }
      const key = numKey || idKey;
      if (key && !addedKeys.has(key)) {
        addedKeys.add(key);
        if (numKey) addedKeys.add(numKey);
        if (idKey) addedKeys.add(idKey);
        combined.push(po);
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
    () => invoiceService.list(),
    [],
    []
  );

  // Form State
  const [grnNumber, setGrnNumber] = useState<string>(() => `GRN-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [vendorDispatchNoteNumber, setVendorDispatchNoteNumber] = useState<string>('');
  const [selectedVendorInvoiceId, setSelectedVendorInvoiceId] = useState<string>('');
  const [receivedDate, setReceivedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [warehouseLocation, setWarehouseLocation] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [currency] = useState<string>(companyDefaultCurrency);
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

  // Line items state
  const [lineItems, setLineItems] = useState<LineItemState[]>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Safe string helper
  const safeStr = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') return val.poNumber || val.id || val.name || '';
    return '';
  };

  // Selected PO details
  const selectedPO = useMemo(() => {
    if (!selectedPoId || !approvedPOs || approvedPOs.length === 0) return null;
    const target = safeStr(selectedPoId).toLowerCase();
    return (
      approvedPOs.find((po) => {
        const pId = safeStr(po.id || (po as any)._id).toLowerCase();
        const pNum = safeStr(po.poNumber).toLowerCase();
        return (pId && pId === target) || (pNum && pNum === target);
      }) || null
    );
  }, [approvedPOs, selectedPoId]);

  // Selected Vendor Invoice details for Auto-fill
  const selectedInvoice = useMemo(() => {
    if (!selectedVendorInvoiceId || !invoicesList) return null;
    return invoicesList.find(
      (inv) => String(inv.id) === String(selectedVendorInvoiceId) || String(inv.invoiceNumber) === String(selectedVendorInvoiceId)
    ) || null;
  }, [invoicesList, selectedVendorInvoiceId]);

  // Handle Auto-fill selection from Vendor Invoice / Dispatch Note
  useEffect(() => {
    if (entryMode === 'AUTO_FILL' && selectedInvoice) {
      if (selectedInvoice.poId || selectedInvoice.poNumber) {
        const matchedPo = approvedPOs.find(
          (p) => String(p.id) === String(selectedInvoice.poId) || String(p.poNumber) === String(selectedInvoice.poNumber)
        );
        if (matchedPo) {
          setSelectedPoId(String(matchedPo.id || matchedPo.poNumber));
        }
      }
      if (selectedInvoice.invoiceNumber) {
        setVendorDispatchNoteNumber(selectedInvoice.invoiceNumber);
      }
    }
  }, [entryMode, selectedInvoice, approvedPOs]);

  // Update line items when PO selection changes
  useEffect(() => {
    if (!selectedPO) {
      setLineItems([]);
      return;
    }

    const rawItems: any[] =
      (selectedPO.items && selectedPO.items.length > 0 && selectedPO.items) ||
      (selectedPO.rfq?.selectedQuotation?.items && selectedPO.rfq.selectedQuotation.items.length > 0 && selectedPO.rfq.selectedQuotation.items) ||
      (selectedPO.rfq?.items && selectedPO.rfq.items.length > 0 && selectedPO.rfq.items) ||
      [];

    if (rawItems.length > 0) {
      setLineItems(
        rawItems.map((item: any, idx: number) => {
          const name = safeStr(
            item.itemName ||
            item.name ||
            item.description ||
            item.itemDescription ||
            (selectedPO.rfq?.title && selectedPO.rfq.title !== 'Direct PO Master' ? selectedPO.rfq.title : '')
          );
          const qty = Number(item.quantity || item.orderedQty || 1);
          const price = Number(item.unitPrice || item.price || 0);

          return {
            id: `item_${idx}_${Date.now()}`,
            itemName: name || '',
            orderedQty: qty,
            receivedQty: qty,
            acceptedQty: qty,
            rejectedQty: 0,
            unitPrice: price,
            unit: safeStr(item.unit || 'Units'),
            remarks: 'Inspected - Goods in good condition',
          };
        })
      );
    } else {
      const fallbackTitle = safeStr(
        (selectedPO.rfq?.title && selectedPO.rfq.title !== 'Direct PO Master' ? selectedPO.rfq.title : '') || ''
      );

      setLineItems([
        {
          id: `item_0_${Date.now()}`,
          itemName: fallbackTitle || '',
          orderedQty: 1,
          receivedQty: 1,
          acceptedQty: 1,
          rejectedQty: 0,
          unitPrice: Number(selectedPO.totalAmount || 0),
          unit: 'Units',
          remarks: 'Inspected - Verified',
        },
      ]);
    }
  }, [selectedPO]);

  // Pre-select PO ONLY if poId is in URL query params
  useEffect(() => {
    if (!approvedPOs || approvedPOs.length === 0) return;
    if (poIdParam) {
      const match = approvedPOs.find((p) => String(p.id) === String(poIdParam) || String(p.poNumber) === String(poIdParam));
      if (match) setSelectedPoId(String(match.id || match.poNumber));
    }
  }, [poIdParam, approvedPOs]);

  // Handle line item edits
  const handleUpdateItem = (id: string, field: keyof LineItemState, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };
        if (field === 'receivedQty') {
          const rec = typeof value === 'number' ? value : 0;
          updated.acceptedQty = Math.max(0, rec - (typeof updated.rejectedQty === 'number' ? updated.rejectedQty : 0));
        } else if (field === 'rejectedQty') {
          const rej = typeof value === 'number' ? value : 0;
          const rec = typeof updated.receivedQty === 'number' ? updated.receivedQty : 0;
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
      const ordQty = typeof item.orderedQty === 'number' ? item.orderedQty : 0;
      const recQty = typeof item.receivedQty === 'number' ? item.receivedQty : 0;
      const accQty = typeof item.acceptedQty === 'number' ? item.acceptedQty : 0;
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;

      totalPoValue += ordQty * price;
      totalGrnValue += recQty * price;
      totalAcceptedValue += accQty * price;
    });

    return { totalPoValue, totalGrnValue, totalAcceptedValue };
  }, [lineItems]);

  // Form Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
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
        orderedQty: item.orderedQty || 1,
        receivedQty: typeof item.receivedQty === 'number' ? item.receivedQty : 0,
        acceptedQty: typeof item.acceptedQty === 'number' ? item.acceptedQty : 0,
        rejectedQty: typeof item.rejectedQty === 'number' ? item.rejectedQty : 0,
        unitPrice: item.unitPrice || 0,
        unit: item.unit,
        remarks: item.remarks,
      }));

      await grnService.create({
        poId: selectedPoId || 'MANUAL-PO',
        entryMode,
        dispatchNoteNumber: vendorDispatchNoteNumber || grnNumber,
        vendorInvoiceNumber: selectedInvoice?.invoiceNumber || vendorDispatchNoteNumber,
        vendorId: selectedPO?.vendorId || selectedInvoice?.vendorId,
        vendorName: selectedPO?.vendor?.name || selectedInvoice?.vendorName || 'Supplier',
        receivedDate,
        notes: `${notes} (Location: ${warehouseLocation})`,
        items: payloadItems,
      });

      setSuccessMsg(`✅ Goods Receipt Note ${grnNumber} saved & posted directly! Available for 3-way matching.`);
      setTimeout(() => navigate('/procurement/goods-receipt'), 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save Goods Receipt Note.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cpo-page w-full space-y-6">
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

      {/* Header with Title & Direct Post Badge */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 px-1">
        <div className="flex items-center gap-4">
          <button
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            onClick={() => navigate(-1)}
            title="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">Create Goods Receipt Note (GRN)</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Zap size={13} /> Direct Post (No Approval Required)
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Record physical material receipt & auto-verify against Purchase Order & Vendor Invoice for 3-way matching.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all"
            onClick={() => window.print()}
          >
            <Printer size={16} /> Print
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 transition-all"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Send size={16} /> {submitting ? 'Posting GRN…' : 'Save & Post GRN Directly'}
          </button>
        </div>
      </div>

      {/* Setting Mode Selector Box */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings2 className="text-blue-400" size={20} />
            <h2 className="text-base font-bold text-white">GRN Creation Mode Setting</h2>
          </div>
          <span className="text-xs text-slate-400">Choose how GRN line items are populated</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Mode 1: Auto-Fill */}
          <div
            onClick={() => setEntryMode('AUTO_FILL')}
            className={`cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-4 ${
              entryMode === 'AUTO_FILL'
                ? 'bg-blue-600/10 border-blue-500/50 ring-1 ring-blue-500/30'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`p-3 rounded-lg ${entryMode === 'AUTO_FILL' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">Auto-fill from Vendor Invoice / Dispatch Note</h3>
                {entryMode === 'AUTO_FILL' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Active</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Select incoming Vendor Invoice or Dispatch Note. PO details, quantities, and pricing auto-populate instantly.
              </p>
            </div>
          </div>

          {/* Mode 2: Manual GRN */}
          <div
            onClick={() => setEntryMode('MANUAL')}
            className={`cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-4 ${
              entryMode === 'MANUAL'
                ? 'bg-indigo-600/10 border-indigo-500/50 ring-1 ring-indigo-500/30'
                : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className={`p-3 rounded-lg ${entryMode === 'MANUAL' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
              <FileText size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">Create GRN Manually</h3>
                {entryMode === 'MANUAL' && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">Active</span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Select Purchase Order manually and input actual received, accepted, and rejected quantities with custom remarks.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Form Fields */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl space-y-6">
        <h2 className="text-lg font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
          <Truck className="text-blue-400" size={20} /> Header & Reference Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {/* GRN # */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">GRN Number (System Ref) *</label>
            <input
              type="text"
              value={grnNumber}
              onChange={(e) => setGrnNumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
              placeholder="e.g. GRN-2026-5255"
            />
          </div>

          {/* If Mode == AUTO_FILL, Vendor Invoice Dropdown */}
          {entryMode === 'AUTO_FILL' && (
            <div>
              <label className="block text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Vendor Dispatch / Invoice *</label>
              <select
                value={selectedVendorInvoiceId}
                onChange={(e) => setSelectedVendorInvoiceId(e.target.value)}
                className="w-full bg-slate-950 border border-blue-500/40 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
              >
                <option value="">-- Select Incoming Vendor Invoice --</option>
                {invoicesList.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — {inv.vendorName || 'Vendor'} ({formatAmount(inv.amount || 0, currency)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* PO Number Select */}
          <div className={entryMode === 'AUTO_FILL' ? '' : 'md:col-span-2'}>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Purchase Order (PO Ref) *</label>
            <select
              value={selectedPoId}
              onChange={(e) => setSelectedPoId(e.target.value)}
              disabled={poLoading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
            >
              <option value="">-- Select Approved PO --</option>
              {approvedPOs.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} — {po.vendor?.name || 'Vendor'} ({formatAmount(po.totalAmount, currency)})
                </option>
              ))}
            </select>
          </div>

          {/* Delivery Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Received Date *</label>
            <input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Vendor Dispatch Note Ref */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Vendor Dispatch / LR No.</label>
            <input
              type="text"
              placeholder="e.g. DN-99482 / LR-1029"
              value={vendorDispatchNoteNumber}
              onChange={(e) => setVendorDispatchNoteNumber(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
            />
          </div>

          {/* Warehouse Location */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Store / Warehouse Location</label>
            <input
              type="text"
              placeholder="e.g. Central Warehouse - Dock 1"
              value={warehouseLocation}
              onChange={(e) => setWarehouseLocation(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
            />
          </div>
        </div>

        {/* PO Details Badge Banner */}
        {selectedPO && (
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap gap-6 items-center text-sm">
            <div>
              <span className="text-slate-400 font-medium">Supplier: </span>
              <span className="font-bold text-white">{selectedPO.vendor?.name || 'Vendor'}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">PO Total Amount: </span>
              <span className="font-bold text-blue-400">{formatAmount(selectedPO.totalAmount, currency)}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">PO Status: </span>
              <span className="font-bold text-emerald-400">{selectedPO.status}</span>
            </div>
          </div>
        )}
      </div>

      {/* Line Items Table */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PackageCheck className="text-emerald-400" size={20} /> Received Materials & Quantities
          </h2>
          <button
            type="button"
            onClick={handleAddManualItem}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 text-xs font-bold border border-indigo-500/30 transition-all shadow-sm"
          >
            <Plus size={15} /> Add Line Item
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-4 w-12">#</th>
                <th className="py-3.5 px-4 min-w-[200px]">Item Description</th>
                <th className="py-3.5 px-4 w-28 text-center">Ordered Qty</th>
                <th className="py-3.5 px-4 w-32">Received Qty *</th>
                <th className="py-3.5 px-4 w-28">Accepted Qty</th>
                <th className="py-3.5 px-4 w-28">Rejected Qty</th>
                <th className="py-3.5 px-4 w-32 text-right">Unit Price ({currency})</th>
                <th className="py-3.5 px-4 w-36 text-right">Total GRN Value</th>
                <th className="py-3.5 px-4 min-w-[160px]">Remarks</th>
                <th className="py-3.5 px-4 w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {lineItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    No items added yet. Click '+ Add Line Item' above or select a Purchase Order to populate items.
                  </td>
                </tr>
              ) : (
                lineItems.map((item, index) => {
                  const rec = typeof item.receivedQty === 'number' ? item.receivedQty : 0;
                  const price = item.unitPrice || 0;
                  const totalLineVal = rec * price;

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-mono text-xs">{index + 1}</td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={item.itemName}
                          placeholder="Item description"
                          onChange={(e) => handleUpdateItem(item.id, 'itemName', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-sm text-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <input
                          type="number"
                          min="0"
                          value={item.orderedQty}
                          onChange={(e) => handleUpdateItem(item.id, 'orderedQty', parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-center text-slate-200 font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          min="0"
                          value={item.receivedQty}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              'receivedQty',
                              e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-full bg-slate-950 border border-blue-500/50 rounded-lg px-2.5 py-1.5 text-sm text-blue-400 font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          min="0"
                          value={item.acceptedQty}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              'acceptedQty',
                              e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-emerald-400 font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          min="0"
                          value={item.rejectedQty}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              'rejectedQty',
                              e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-rose-400 font-bold focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <input
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
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-sm text-right text-white font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-white tabular-nums">{formatAmount(totalLineVal, currency)}</td>
                      <td className="py-3 px-4">
                        <input
                          type="text"
                          value={item.remarks}
                          onChange={(e) => handleUpdateItem(item.id, 'remarks', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                          placeholder="Remarks..."
                        />
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                          title="Delete line item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Summary & Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Remarks & Attachment */}
        <div className="md:col-span-2 bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Store Receiving Remarks & Documents</h3>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add storekeeper receiving observations, damage reports, waybill numbers, or batch details..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
          />

          <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-950/50 rounded-xl cursor-pointer transition-all">
            <Upload size={24} className="text-blue-400 mb-2" />
            <span className="text-xs font-bold text-white">Upload Delivery Challan / Proof of Delivery PDF</span>
            <span className="text-[11px] text-slate-400 mt-0.5">Supports PDF, PNG, JPG</span>
            <input type="file" multiple accept=".pdf,.png,.jpg" onChange={handleFileUpload} hidden />
          </label>

          {attachments.length > 0 && (
            <div className="space-y-2">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <Paperclip size={14} className="text-blue-400" />
                    <span className="font-semibold text-white">{att.name}</span>
                    <span className="text-slate-400">({att.size})</span>
                  </div>
                  <button type="button" onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))} className="text-rose-400">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals Summary */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">Value Comparison</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-slate-400">
                <span>Total PO Amount:</span>
                <span className="font-semibold text-white">{formatAmount(calculations.totalPoValue, currency)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Total Delivered Value:</span>
                <span className="font-semibold text-blue-400">{formatAmount(calculations.totalGrnValue, currency)}</span>
              </div>
              <div className="flex justify-between items-center pt-3 border-t border-slate-800 text-base">
                <span className="font-bold text-white">Accepted Value:</span>
                <span className="font-bold text-emerald-400">{formatAmount(calculations.totalAcceptedValue, currency)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
          >
            <Send size={18} /> {submitting ? 'Posting GRN…' : 'Save & Post GRN Directly'}
          </button>
        </div>
      </div>
    </div>
  );
}
