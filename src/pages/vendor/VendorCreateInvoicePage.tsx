import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService } from '../../services/vendorPortalService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { grnService, type GoodsReceivedNote } from '../../services/grnService';
import { companySettingsService } from '../../services/companySettingsService';
import {
  ArrowLeft,
  Receipt,
  Plus,
  Trash2,
  Send,
  Upload,
  Paperclip,
  X,
  Building2,
  ShoppingCart,
  FileText,
  Save,
  CheckCircle2,
  Printer
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { PageFrame, PageLead } from '../../components/ui/product';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import '../../components/purchase-orders/PurchaseOrderDocument.css';
import '../../styles/vendor-portal.css';

interface LineItem {
  id: number | string;
  itemCode: string;
  itemName: string;
  description: string;
  poQty: number;
  grnQty: number;
  invoicedQty: number | '';
  unitPrice: number | '';
  taxPercent: number;
}

export default function VendorCreateInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poIdParam = searchParams.get('poId');
  const grnIdParam = searchParams.get('grnId');

  const { user } = useAuth();
  const { companyDefaultCurrency, formatAmount } = useCurrency();
  const { companyName, companyPhone, companyEmail, logoUrl } = useBranding();

  // Load Vendor's assigned Purchase Orders
  const { data: poData, loading: poLoading } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );
  const poList = poData.orders || [];

  // Form State - initialize state directly from URL query parameters if present
  const [selectedPoId, setSelectedPoId] = useState<string>(() => poIdParam || '');
  const [selectedGrnId, setSelectedGrnId] = useState<string>(() => grnIdParam || '');
  const [grnOptions, setGrnOptions] = useState<GoodsReceivedNote[]>([]);

  useEffect(() => {
    if (poIdParam) {
      setSelectedPoId(poIdParam);
    }
  }, [poIdParam]);

  const [invoiceNumber, setInvoiceNumber] = useState<string>('');

  useEffect(() => {
    if (!invoiceNumber) {
      companySettingsService.generateNextSequence('INVOICE')
        .then((res) => { if (res?.formattedCode) setInvoiceNumber(res.formattedCode); })
        .catch(() => {});
    }
  }, []);
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentTerms, setPaymentTerms] = useState<string>('Net 30');
  const [currency, setCurrency] = useState<string>(companyDefaultCurrency);
  const [buyerName, setBuyerName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: 1, itemCode: 'ITM-001', itemName: '', description: '', poQty: 0, grnQty: 0, invoicedQty: '', unitPrice: '', taxPercent: 18 },
  ]);

  // Attachments state
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

  // UI State
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionSuccessModalData, setActionSuccessModalData] = useState<ActionSuccessModalData | null>(null);

  // Selected PO details
  const selectedPO = useMemo(() => {
    return poList.find(
      (po) => String(po.id) === String(selectedPoId) || String(po.poNumber) === String(selectedPoId)
    );
  }, [poList, selectedPoId]);

  const finalLogoUrl = logoUrl || selectedPO?.companyLogoUrl || defaultHeliflowLogo;

  // Human-readable PO Number formatter (never display raw 24-hex Mongo ID)
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

  // Human-readable GRN Number formatter (never display raw 24-hex Mongo ID)
  const displayGrnNumber = useMemo(() => {
    const matchInGrn = grnOptions.find(
      (g) => String(g.id) === String(selectedGrnId) || String(g.grnNumber) === String(selectedGrnId)
    );
    if (matchInGrn?.grnNumber) return matchInGrn.grnNumber;

    if (grnIdParam && grnIdParam.startsWith('GRN-')) return grnIdParam;
    if (selectedGrnId && selectedGrnId.startsWith('GRN-')) return selectedGrnId;

    if (selectedGrnId && /^[0-9a-fA-F]{24}$/.test(selectedGrnId)) {
      return `GRN-${selectedGrnId.slice(-6).toUpperCase()}`;
    }

    return selectedGrnId || 'Direct PO Billing / Select GRN';
  }, [grnOptions, selectedGrnId, grnIdParam]);

  // Pre-select GRN when grnOptions finish loading
  useEffect(() => {
    const targetGrn = grnIdParam || selectedGrnId;
    if (targetGrn && grnOptions.length > 0) {
      const matchGrn = grnOptions.find(
        (g) => String(g.id) === String(targetGrn) || String(g.grnNumber) === String(targetGrn)
      );
      if (matchGrn) {
        setSelectedGrnId(String(matchGrn.id));
      } else {
        setSelectedGrnId(targetGrn);
      }
    }
  }, [grnIdParam, grnOptions]);

  // Fetch GRNs and update line items when PO selection or parameters change
  useEffect(() => {
    if (!selectedPoId) {
      setLineItems([
        { id: 1, itemCode: 'ITM-001', itemName: '', description: '', poQty: 0, grnQty: 0, invoicedQty: '', unitPrice: '', taxPercent: 18 },
      ]);
      setGrnOptions([]);
      setSelectedGrnId('');
      setBuyerName('');
      return;
    }

    const targetPoId = selectedPO?.id || selectedPoId;
    const targetPoNum = selectedPO?.poNumber || selectedPoId;

    if (selectedPO?.items && selectedPO.items.length > 0) {
      setLineItems(
        selectedPO.items.map((item: any, idx: number) => ({
          id: `item_${idx}_${Date.now()}`,
          itemCode: item.itemCode || `ITM-00${idx + 1}`,
          itemName: item.itemName || item.name || 'Line Item',
          description: item.description || '',
          poQty: Number(item.quantity || 1),
          grnQty: Number(item.quantity || 1),
          invoicedQty: Number(item.quantity || 1),
          unitPrice: Number(item.unitPrice || 0),
          taxPercent: 18,
        }))
      );
    } else {
      setLineItems([
        { id: 1, itemCode: 'ITM-001', itemName: '', description: '', poQty: 0, grnQty: 0, invoicedQty: '', unitPrice: '', taxPercent: 18 },
      ]);
    }

    const queryKey = String(targetPoId || targetPoNum);
    grnService
      .getByPO(queryKey)
      .then((grns) => {
        if (grns && grns.length > 0) {
          setGrnOptions(grns);
        } else {
          grnService.list({ limit: 100 }).then((res) => {
            const list = res.grns || [];
            const matched = list.filter(
              (g) =>
                String(g.poId) === String(targetPoId) ||
                String(g.poId) === String(targetPoNum) ||
                String(g.purchaseOrder?.id) === String(targetPoId) ||
                String(g.purchaseOrder?.poNumber) === String(targetPoNum)
            );
            setGrnOptions(matched);
          }).catch(() => setGrnOptions([]));
        }
      })
      .catch(() => {
        setGrnOptions([]);
      });
  }, [selectedPO, selectedPoId]);

  // Update line items when GRN selection changes
  useEffect(() => {
    if (selectedGrnId && grnOptions.length > 0) {
      const foundGRN = grnOptions.find(
        (g) => String(g.id) === String(selectedGrnId) || String(g.grnNumber) === String(selectedGrnId)
      );

      if (foundGRN && foundGRN.items && foundGRN.items.length > 0) {
        const updatedLineItems = foundGRN.items.map((gi: any, idx: number) => {
          const poMatch =
            selectedPO?.items?.[idx] ||
            selectedPO?.items?.find((pi: any) => (pi.itemName || pi.name) === gi.itemName);
          const poQty = Number(gi.orderedQty || poMatch?.quantity || 1);
          const grnQty = Number(gi.receivedQty ?? gi.acceptedQty ?? 1);
          const unitPrice = Number(poMatch?.unitPrice || gi.unitPrice || 0);

          return {
            id: gi.id || `grn_item_${idx}_${Date.now()}`,
            itemCode: gi.itemCode || poMatch?.itemCode || `ITM-00${idx + 1}`,
            itemName: gi.itemName || poMatch?.itemName || poMatch?.name || 'Line Item',
            description: gi.remarks || poMatch?.description || '',
            poQty: poQty,
            grnQty: grnQty,
            invoicedQty: grnQty,
            unitPrice: unitPrice,
            taxPercent: 18,
          };
        });

        setLineItems(updatedLineItems);
      }
    } else if (!selectedGrnId && selectedPO?.items && selectedPO.items.length > 0) {
      setLineItems(
        selectedPO.items.map((item: any, idx: number) => ({
          id: `item_${idx}_${Date.now()}`,
          itemCode: item.itemCode || `ITM-00${idx + 1}`,
          itemName: item.itemName || item.name || 'Line Item',
          description: item.description || '',
          poQty: Number(item.quantity || 1),
          grnQty: Number(item.quantity || 1),
          invoicedQty: Number(item.quantity || 1),
          unitPrice: Number(item.unitPrice || 0),
          taxPercent: 18,
        }))
      );
    }
  }, [selectedGrnId, grnOptions, selectedPO]);

  // Populate Buyer/Client Name ONLY if explicitly set on PO; otherwise keep completely blank (no auto text)
  useEffect(() => {
    if (selectedPO && selectedPoId) {
      const explicitBuyer =
        (selectedPO as any).buyerName ||
        (selectedPO as any).clientName ||
        (selectedPO as any).companyName ||
        (selectedPO as any).buyerCompany ||
        (selectedPO as any).buyer?.name;

      if (explicitBuyer && String(explicitBuyer).toUpperCase() !== 'VENDOR') {
        setBuyerName(String(explicitBuyer));
        return;
      }
    }
    setBuyerName('');
  }, [selectedPO, selectedPoId]);

  // Update Line Item Values
  const handleUpdateLineItem = useCallback((id: number | string, field: keyof LineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, []);

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
        invoicedQty: '',
        unitPrice: '',
        taxPercent: 18,
      },
    ]);
  }, []);

  const handleRemoveLineItem = useCallback((id: number | string) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  // Handle File Uploads
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

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    lineItems.forEach((item) => {
      const qty = typeof item.invoicedQty === 'number' ? item.invoicedQty : 0;
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      const lineSubtotal = qty * price;
      const lineTax = lineSubtotal * ((item.taxPercent || 0) / 100);

      subtotal += lineSubtotal;
      totalTax += lineTax;
    });

    const grandTotal = subtotal + totalTax;
    return { subtotal, totalTax, grandTotal };
  }, [lineItems]);

  // Form Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (!invoiceNumber.trim()) {
      setErrorMsg('Invoice Number is required.');
      return false;
    }
    if (!selectedPoId) {
      setErrorMsg('Please select a Purchase Order.');
      return false;
    }
    return true;
  };

  // Submit Invoice to Buyer
  const handleSubmitInvoice = async (isDraft: boolean) => {
    if (!validateForm()) return;

    if (isDraft) setSavingDraft(true);
    else setSubmitting(true);

    setErrorMsg(null);

    try {
      const payload = {
        invoiceNumber,
        poId: selectedPoId,
        grnId: selectedGrnId ? selectedGrnId.replace(/^grn_/, '').replace(/^inv_/, '') : null,
        vendorId: user?.id || selectedPO?.vendorId || selectedPO?.vendor?.id,
        buyerName,
        invoiceDate,
        dueDate,
        paymentTerms,
        currency,
        amount: calculations.grandTotal,
        notes,
        isDraft,
        isVendorSubmission: true,
      };

      const { apiRequest } = await import('../../api/client');
      await apiRequest('/invoices/manual', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      window.dispatchEvent(new CustomEvent('heliflow:invoice-created'));
      try {
        const bc = new BroadcastChannel('heliflow_sync');
        bc.postMessage({ type: 'INVOICE_CREATED', timestamp: Date.now() });
        bc.close();
      } catch {}

      if (isDraft) {
        setSuccessMsg(`Draft invoice #${invoiceNumber} saved successfully.`);
        setTimeout(() => navigate('/procurement/grns'), 1500);
      } else {
        setActionSuccessModalData({
          actionType: 'sent',
          module: 'Purchase Invoice',
          referenceNumber: invoiceNumber,
          title: `Tax Invoice Sent to Buyer`,
          actionTitle: `Purchase Invoice Sent`,
          badgeText: `SENT`,
          message: `Tax Invoice #${invoiceNumber} has been sent to Buyer successfully! Buyer notification has been sent to the Procurement & Accounts team to review and register the Purchase Invoice.`,
          details: [
            { label: 'PO Reference', value: displayPoNumber },
            { label: 'GRN Reference', value: displayGrnNumber },
            { label: 'Total Value', value: formatAmount(calculations.grandTotal, currency) },
            ...(buyerName ? [{ label: 'Buyer Name', value: buyerName }] : []),
          ],
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to send Invoice to Buyer.');
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  return (
    <PageFrame>
      {/* Notifications */}
      {errorMsg && (
        <MessageStrip type="error" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </MessageStrip>
      )}
      {successMsg && (
        <MessageStrip type="success">
          {successMsg}
        </MessageStrip>
      )}

      {/* Header */}
      <PageLead
        title={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => navigate(-1)}
              title="Go back"
              aria-label="Go back"
              className="rounded-lg shrink-0"
            >
              <ArrowLeft className="size-4" />
            </Button>
            <span>Submit Invoice to Buyer</span>
          </div>
        }
        description={`Create & dispatch your tax invoice directly to the buyer for PO #${selectedPO?.poNumber || 'Order'}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            className="gap-1.5"
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="size-4" /> Print Document
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSubmitInvoice(true)}
            disabled={savingDraft || submitting}
            className="gap-1.5"
          >
            <Save className="size-4" /> {savingDraft ? 'Saving…' : 'Save Draft'}
          </Button>
          <Button
            size="sm"
            onClick={() => handleSubmitInvoice(false)}
            disabled={savingDraft || submitting}
            className="gap-1.5 shadow-xs"
          >
            <Send className="size-4" /> {submitting ? 'Sending Invoice…' : 'Send Invoice to Buyer'}
          </Button>
        </div>
      </PageLead>

      {/* Form Body */}
      <div className="space-y-6">
        {/* Section 01: Order & Invoice Details */}
        <Card className="overflow-hidden border border-border/80 shadow-xs p-5">
          <div className="flex items-center gap-3 pb-3 border-b border-border/60 mb-5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">01</span>
            <div>
              <h3 className="font-semibold text-foreground text-base">Purchase Order & Invoice Details</h3>
              <p className="text-xs text-muted-foreground">Auto-loaded from confirmed Purchase Order</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SELECT PURCHASE ORDER *</label>
              <select
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                value={selectedPoId}
                onChange={(e) => {
                  setSelectedPoId(e.target.value);
                  setSelectedGrnId('');
                }}
                disabled={poLoading}
              >
                <option value="">-- Select Purchase Order --</option>
                {poList.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} — ({formatAmount(po.totalAmount, currency)})
                  </option>
                ))}
                {selectedPoId && !poList.some((po) => String(po.id) === String(selectedPoId)) && (
                  <option value={selectedPoId}>
                    {displayPoNumber}
                  </option>
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">VENDOR INVOICE NUMBER *</label>
              <Input
                className="h-10 rounded-xl text-sm font-medium"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-9005"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BUYER / CLIENT NAME</label>
              <Input
                className="h-10 rounded-xl text-sm font-medium"
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Enter Buyer / Client Name"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">INVOICE DATE *</label>
              <Input
                className="h-10 rounded-xl text-sm font-medium"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">DUE DATE *</label>
              <Input
                className="h-10 rounded-xl text-sm font-medium"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PAYMENT TERMS</label>
              <select
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Section 02: Line Items & Invoiced Quantities */}
        <Card className="overflow-hidden border border-border/80 shadow-xs p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60 mb-5">
            <div className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">02</span>
              <div>
                <h3 className="font-semibold text-foreground text-base">Line Items & Invoiced Quantities</h3>
                <p className="text-xs text-muted-foreground">Specify quantities, rates, and taxes per line item</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleAddLineItem} className="gap-1.5">
              <Plus className="size-4" /> Add Line Item
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border/70 bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 min-w-[220px]">Item Name / Description *</th>
                  <th className="px-4 py-3 min-w-[90px] text-center bg-primary/5">PO Qty</th>
                  <th className="px-4 py-3 min-w-[90px] text-center bg-emerald-500/5">GRN Qty</th>
                  <th className="px-4 py-3 min-w-[110px] text-center bg-amber-500/10 text-amber-700 dark:text-amber-400">Invoiced Qty *</th>
                  <th className="px-4 py-3 min-w-[130px]">Unit Price ({currency})</th>
                  <th className="px-4 py-3 min-w-[80px]">Tax %</th>
                  <th className="px-4 py-3 min-w-[130px] text-right">Total ({currency})</th>
                  <th className="px-3 py-3 w-[44px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lineItems.map((item) => {
                  const qty = typeof item.invoicedQty === 'number' ? item.invoicedQty : 0;
                  const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                  const lineTotal = qty * price * (1 + (item.taxPercent || 0) / 100);

                  return (
                    <tr key={item.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <Input
                          type="text"
                          className="h-9 rounded-lg"
                          placeholder="Item description..."
                          value={item.itemName}
                          onChange={(e) => handleUpdateLineItem(item.id, 'itemName', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-3 text-center bg-primary/[0.02]">
                        <Badge tone="primary" className="font-bold tabular-nums">
                          {item.poQty}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center bg-emerald-500/[0.02]">
                        <Badge tone="success" className="font-bold tabular-nums">
                          {item.grnQty}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center bg-amber-500/[0.03]">
                        <Input
                          type="number"
                          min="0"
                          className="h-9 rounded-lg text-center font-extrabold border-amber-500/50 text-foreground"
                          placeholder="0"
                          value={item.invoicedQty}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'invoicedQty',
                              e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="h-9 rounded-lg"
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
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          className="h-9 rounded-lg text-center"
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
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-foreground">
                        {formatAmount(lineTotal, currency)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleRemoveLineItem(item.id)}
                          disabled={lineItems.length <= 1}
                          title="Remove item"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Section 03 & Section 04 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Remarks & Physical Invoice Attachment */}
          <Card className="overflow-hidden border border-border/80 shadow-xs p-5 lg:col-span-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-border/60 mb-5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">03</span>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Remarks & Physical Invoice PDF</h3>
                  <p className="text-xs text-muted-foreground">Attach signed bill and add buyer comments</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">INVOICE NOTES / REMARKS FOR BUYER</label>
                  <textarea
                    className="w-full min-h-[90px] rounded-xl border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add delivery notes, tax calculation comments, or payment details for buyer..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ATTACH VENDOR TAX INVOICE PDF</label>
                  <label className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary/[0.02] p-6 text-center cursor-pointer transition-all hover:border-primary/60 hover:bg-primary/[0.05]">
                    <Upload className="size-7 text-primary transition-transform group-hover:-translate-y-0.5" />
                    <div className="text-sm font-bold text-foreground">CLICK TO UPLOAD PHYSICAL VENDOR BILL PDF</div>
                    <div className="text-xs text-muted-foreground">Drag and drop your signed tax invoice PDF here, or click to browse files</div>
                    <input type="file" multiple accept=".pdf,.png,.jpg" onChange={handleFileUpload} hidden />
                  </label>
                  {attachments.length > 0 && (
                    <div className="flex flex-col gap-2 pt-2">
                      {attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/30 p-2.5 text-xs">
                          <div className="flex items-center gap-2">
                            <Paperclip className="size-4 text-primary shrink-0" />
                            <span className="font-semibold text-foreground">{att.name}</span>
                            <span className="text-muted-foreground">({att.size})</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => handleRemoveAttachment(att.id)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Totals Summary */}
          <Card className="overflow-hidden border border-border/80 shadow-xs p-5 lg:col-span-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 pb-3 border-b border-border/60 mb-5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">04</span>
                <div>
                  <h3 className="font-semibold text-foreground text-base">Invoice Value Summary</h3>
                  <p className="text-xs text-muted-foreground">Summary breakdown of taxes and total payable</p>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CURRENCY</label>
                  <CurrencySelector value={currency} onChange={setCurrency} size="sm" />
                </div>

                <div className="flex items-center justify-between text-muted-foreground pt-2">
                  <span>Subtotal</span>
                  <span className="font-semibold text-foreground tabular-nums">{formatAmount(calculations.subtotal, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Total Tax</span>
                  <span className="font-semibold text-foreground tabular-nums">{formatAmount(calculations.totalTax, currency)}</span>
                </div>

                <div className="border-t border-border/60 my-2" />

                <div className="flex items-center justify-between text-base font-bold text-foreground">
                  <span>Final Value</span>
                  <span className="text-primary tabular-nums">{formatAmount(calculations.grandTotal, currency)}</span>
                </div>
              </div>
            </div>

            <div className="pt-6">
              <Button
                size="lg"
                onClick={() => handleSubmitInvoice(false)}
                disabled={savingDraft || submitting}
                className="w-full gap-2 shadow-xs"
              >
                <Send className="size-4" /> {submitting ? 'Sending Invoice…' : 'Send Invoice to Buyer'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ActionSuccessModal
        data={actionSuccessModalData}
        onClose={() => {
          setActionSuccessModalData(null);
          navigate('/procurement/grns');
        }}
      />

      {/* Official A4 Digital TAX INVOICE Document (Visible ONLY during window.print()) */}
      <div className="grn-print-document po-document hidden print:block">
        {/* ── Header ── */}
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
                Phone: {companyPhone || selectedPO?.companyPhone || '+918272811866'} &nbsp;|&nbsp; Email: {companyEmail || selectedPO?.companyEmail || 'nischalagarwal674@gmail.com'}
              </p>
              <p className="po-doc__company-detail">
                {selectedPO?.companyWebsite || 'www.procnex.com'}
              </p>
            </div>
          </div>
          <div className="po-doc__header-right">
            <div className="po-doc__title-block">
              <span className="po-doc__title-label" style={{ color: '#0a2342' }}>TAX INVOICE</span>
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

        {/* ── Divider ── */}
        <div className="po-doc__divider" />

        {/* ── Vendor & Ship To ── */}
        <div className="po-doc__parties">
          <div className="po-doc__party-box">
            <h3 className="po-doc__party-heading">VENDOR / SUPPLIER</h3>
            <p className="po-doc__party-name">{user?.fullName || selectedPO?.vendor?.name || selectedPO?.vendorName || 'Embedded'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.vendor?.contactPerson || selectedPO?.vendorContactPerson || user?.fullName || 'Nischal Agarwal'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.vendor?.address || selectedPO?.vendorAddress || '232,Sahukara Bareilly 232'}</p>
            <p className="po-doc__party-detail">Phone: {selectedPO?.vendor?.phone || selectedPO?.vendorPhone || '+918272811866'}</p>
            <p className="po-doc__party-detail">Email: {user?.email || selectedPO?.vendor?.email || selectedPO?.vendorEmail || 'nischalagarwal674@gmail.com'}</p>
            <p className="po-doc__party-detail">GST/VAT: {selectedPO?.vendor?.gstVat || selectedPO?.vendorGstVat || 'VAT60707070706'}</p>
          </div>
          <div className="po-doc__party-box">
            <h3 className="po-doc__party-heading">BILL TO (BUYER / CLIENT)</h3>
            <p className="po-doc__party-name">{buyerName || companyName || 'Procnex'}</p>
            <p className="po-doc__party-detail">Warehouse: {selectedPO?.shipToWarehouse || 'Central Warehouse'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.shipToAddress || '232,Sahukara Bareilly 232'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.shipToContact || 'Nischal Agarwal'}</p>
            <p className="po-doc__party-detail">Phone: {companyPhone || selectedPO?.shipToPhone || '+918272811866'}</p>
          </div>
        </div>

        {/* ── Info Grid ── */}
        <div className="po-doc__info-grid">
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">PO Reference</span>
            <span className="po-doc__info-value">{displayPoNumber}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Dispatch Note</span>
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
            <span className="po-doc__info-value">SUBMITTED</span>
          </div>
        </div>

        {/* ── Items Table ── */}
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
                <th className="po-doc__th--qty">Inv Qty</th>
                <th className="po-doc__th--price">Unit Price</th>
                <th className="po-doc__th--tax">Tax %</th>
                <th className="po-doc__th--disc">Disc %</th>
                <th className="po-doc__th--total">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => {
                const invQty = typeof item.invoicedQty === 'number' ? item.invoicedQty : 0;
                const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                const lineTotal = invQty * price * (1 + (item.taxPercent || 0) / 100);

                return (
                  <tr key={item.id}>
                    <td className="po-doc__td--no">{index + 1}</td>
                    <td className="po-doc__td--desc">{item.itemName || item.description || 'Line Item'}</td>
                    <td className="po-doc__td--qty">{item.poQty}</td>
                    <td className="po-doc__td--qty">{invQty}</td>
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

        {/* ── Totals ── */}
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
              <span className="po-doc__total-label">Tax Total</span>
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
              <span className="po-doc__total-value po-doc__total-value--grand">{formatAmount(calculations.grandTotal, currency)}</span>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="po-doc__divider" />
        <div className="po-doc__notes">
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Invoice Notes / Remarks</h4>
            <p className="po-doc__notes-text">{notes || 'Tax invoice dispatched to buyer for payment processing.'}</p>
          </div>
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Payment Instructions</h4>
            <p className="po-doc__notes-text">Please remit payment as per agreed payment terms ({paymentTerms}).</p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="po-doc__footer">
          <div className="po-doc__footer-divider" />
          <p className="po-doc__footer-text">
            {buyerName || companyName}
            {companyPhone && <span> &nbsp;|&nbsp; Phone: {companyPhone}</span>}
            {companyEmail && <span> &nbsp;|&nbsp; Email: {companyEmail}</span>}
          </p>
        </div>
      </div>
    </PageFrame>
  );
}
