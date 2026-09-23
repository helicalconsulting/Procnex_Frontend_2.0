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
  Building2,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useAuth } from '../../context/AuthContext';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Textarea } from '../../components/ui/input';
import { PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';

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
          (p) =>
            (selectedInvoice.poId && (String(p.id) === String(selectedInvoice.poId) || String(p.poNumber) === String(selectedInvoice.poId))) ||
            (selectedInvoice.poNumber && (String(p.id) === String(selectedInvoice.poNumber) || String(p.poNumber) === String(selectedInvoice.poNumber)))
        );
        if (matchedPo) {
          setSelectedPoId(String(matchedPo.id));
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
        poId: selectedPO?.id || selectedPoId || 'MANUAL-PO',
        entryMode,
        dispatchNoteNumber: vendorDispatchNoteNumber || grnNumber,
        vendorInvoiceNumber: selectedInvoice?.invoiceNumber || vendorDispatchNoteNumber,
        invoiceId: selectedInvoice?.id,
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
    <PageFrame>
      {/* Notifications */}
      {errorMsg && (
        <div className="mb-4">
          <MessageStrip type="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </MessageStrip>
        </div>
      )}
      {successMsg && (
        <div className="mb-4">
          <MessageStrip type="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </MessageStrip>
        </div>
      )}

      {/* Page Header */}
      <PageLead
        title={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate(-1)}
              className="size-9 rounded-md shrink-0"
              title="Back"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span>Create Goods Receipt Note (GRN)</span>
          </div>
        }
        description="Record physical material receipt and verify against Purchase Order and Vendor Invoice for 3-way matching."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-2"
          >
            <Printer className="size-4" /> Print
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-2 shadow-sm font-semibold"
          >
            <Send className="size-4" /> {submitting ? 'Posting GRN…' : 'Save & Post GRN'}
          </Button>
        </div>
      </PageLead>

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
              onClick={() => setEntryMode('MANUAL')}
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
                  Select Purchase Order manually and input actual received, accepted, and rejected quantities with custom remarks.
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

            {/* If Mode == AUTO_FILL, Vendor Invoice Dropdown */}
            {entryMode === 'AUTO_FILL' && (
              <div>
                <label className="block text-xs font-semibold text-primary uppercase tracking-wider mb-1.5">
                  Vendor Dispatch / Invoice *
                </label>
                <select
                  value={selectedVendorInvoiceId}
                  onChange={(e) => setSelectedVendorInvoiceId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <div className={entryMode === 'AUTO_FILL' ? '' : 'sm:col-span-2'}>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Purchase Order (PO Ref) *
              </label>
              <select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
                disabled={poLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Received Date *
              </label>
              <Input
                type="date"
                value={receivedDate}
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

            {/* Warehouse Location */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Store / Warehouse Location
              </label>
              <Input
                type="text"
                placeholder="e.g. Central Warehouse - Dock 1"
                value={warehouseLocation}
                onChange={(e) => setWarehouseLocation(e.target.value)}
                className="text-sm bg-background"
              />
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
                                e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                              )
                            }
                            className="h-9 text-sm text-center font-bold text-primary border-primary/40 bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Input
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
                            className="h-9 text-sm text-center font-bold text-emerald-600 dark:text-emerald-400 bg-background"
                          />
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <Input
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
              disabled={submitting}
              className="w-full py-2.5 gap-2 shadow-sm font-bold"
            >
              <Send className="size-4" /> {submitting ? 'Posting GRN…' : 'Save & Post GRN'}
            </Button>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}
