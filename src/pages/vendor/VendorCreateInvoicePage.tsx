import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { grnService, type GoodsReceivedNote } from '../../services/grnService';
import { companySettingsService } from '../../services/companySettingsService';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Send,
  Upload,
  Paperclip,
  X,
  Save,
  Printer
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Select, Textarea } from '../../components/ui/input';
import { PageFrame, PageLead } from '../../components/ui/product';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import '../../components/purchase-orders/PurchaseOrderDocument.css';
import '../../styles/vendor-portal.css';
import './vendor-invoice-workspace.css';

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

const localDateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

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
  const poList = useMemo(() => poData.orders || [], [poData.orders]);

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
  const [invoiceDate, setInvoiceDate] = useState<string>(() => localDateValue(new Date()));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return localDateValue(d);
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
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string; type: string; dataUrl: string }[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

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
    const itemId = crypto.randomUUID();
    setLineItems((prev) => [
      ...prev,
      {
        id: itemId,
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
    requestAnimationFrame(() => document.getElementById(`invoice-item-${itemId}`)?.focus());
  }, []);

  const handleRemoveLineItem = useCallback((id: number | string) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  // Handle File Uploads
  const handleFiles = (files: File[]) => {
    const accepted = files.filter(file => /\.(pdf|png|jpe?g)$/i.test(file.name));
    if (accepted.length !== files.length) setErrorMsg('Please attach PDF, JPG or PNG files.');
    accepted.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments(prev => [...prev, {
          id: crypto.randomUUID(), name: file.name,
          size: `${(file.size / 1024).toFixed(1)} KB`, type: file.type,
          dataUrl: reader.result as string,
        }]);
      };
      reader.onerror = () => setErrorMsg(`Could not read ${file.name}. Please try again.`);
      reader.readAsDataURL(file);
    });
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
        attachments,
        lineItems,
        items: lineItems,
        isDraft,
        isVendorSubmission: true,
      };

      try {
        if (lineItems && lineItems.length > 0) {
          localStorage.setItem(`vendor_invoice_items_${invoiceNumber}`, JSON.stringify(lineItems));
          localStorage.setItem(`invoice_items_${invoiceNumber}`, JSON.stringify(lineItems));
          if (selectedPoId) {
            localStorage.setItem(`vendor_invoice_items_${selectedPoId}`, JSON.stringify(lineItems));
          }
        }
        if (attachments.length > 0) {
          localStorage.setItem(`invoice_attachments_${invoiceNumber}`, JSON.stringify(attachments));
          if (selectedPoId) {
            localStorage.setItem(`invoice_attachments_${selectedPoId}`, JSON.stringify(attachments));
          }
        }
      } catch {}

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
    <PageFrame className="invoice-workspace">
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
        description={selectedPO ? `Create & dispatch your tax invoice to the buyer for ${displayPoNumber}.` : 'Select a purchase order, review line items, and attach your tax invoice.'}
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
            <div className="form-field">
              <label htmlFor="invoice-po" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SELECT PURCHASE ORDER *</label>
              <Select id="invoice-po"
                className="h-10 font-medium"
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
              </Select>
            </div>

            <div className="form-field">
              <label htmlFor="invoice-number" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">VENDOR INVOICE NUMBER *</label>
              <Input id="invoice-number"
                className="h-10 rounded-xl text-sm font-medium"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-9005"
              />
            </div>

            <div className="form-field">
              <label htmlFor="invoice-buyer" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">BUYER / CLIENT NAME</label>
              <Input id="invoice-buyer"
                className="h-10 rounded-xl text-sm font-medium"
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Enter Buyer / Client Name"
              />
            </div>

            <div className="form-field">
              <label htmlFor="invoice-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">INVOICE DATE *</label>
              <Input id="invoice-date"
                className="h-10 rounded-xl text-sm font-medium"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="invoice-due-date" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">DUE DATE *</label>
              <Input id="invoice-due-date"
                className="h-10 rounded-xl text-sm font-medium"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="invoice-payment-terms" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PAYMENT TERMS</label>
              <Select id="invoice-payment-terms"
                className="h-10 font-medium"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              >
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </Select>
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
                <p className="text-xs text-muted-foreground">Edit quantities, prices and tax. Reference quantities stay with each item.</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleAddLineItem} className="gap-1.5">
              <Plus className="size-4" /> Add Line Item
            </Button>
          </div>

          <div className="invoice-line-table overflow-auto rounded-xl border border-border/70">
            <table className="w-full border-collapse text-left text-sm" aria-label="Invoice line items">
              <caption className="sr-only">Editable invoice lines. PO and received quantities are reference values. Line totals include tax.</caption>
              <colgroup><col style={{ width: '36%' }} /><col style={{ width: '15%' }} /><col style={{ width: '17%' }} /><col style={{ width: '11%' }} /><col style={{ width: '16%' }} /><col style={{ width: '5%' }} /></colgroup>
              <thead className="border-b border-border/70 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">Item / Description *</th>
                  <th scope="col" className="px-4 py-3 text-right">Invoiced Qty *</th>
                  <th scope="col" className="px-4 py-3 text-right">Unit Price ({currency})</th>
                  <th scope="col" className="px-4 py-3 text-right">Tax %</th>
                  <th scope="col" className="px-4 py-3 text-right">Total ({currency})</th>
                  <th scope="col" className="px-2 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lineItems.map((item, index) => {
                  const qty = typeof item.invoicedQty === 'number' ? item.invoicedQty : 0;
                  const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                  const lineTotal = qty * price * (1 + (item.taxPercent || 0) / 100);
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-center gap-2">
                          <span className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">{index + 1}.</span>
                          <Input id={`invoice-item-${item.id}`} type="text" className="h-9 rounded-lg" aria-label={`Item description, line ${index + 1}`} placeholder="Item description..." value={item.itemName} onChange={e => handleUpdateLineItem(item.id, 'itemName', e.target.value)} />
                        </div>
                        <div className="invoice-line-reference mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {item.poQty > 0 ? <>
                            <span>PO qty: <strong className="font-semibold text-foreground">{item.poQty}</strong></span>
                            <span>Received: <strong className="font-semibold text-foreground">{selectedGrnId ? item.grnQty : 'No GRN linked'}</strong></span>
                          </> : <span>{selectedPoId ? 'Additional invoice line' : 'Select a purchase order to load reference quantities'}</span>}
                        </div>
                        {item.description && <p className="mt-1 text-xs text-muted-foreground break-words">{item.description}</p>}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Input type="number" min="0" step="any" className="h-9 rounded-lg text-right font-semibold tabular-nums" aria-label={`Invoiced quantity, line ${index + 1}`} placeholder="0" value={item.invoicedQty} onChange={e => handleUpdateLineItem(item.id, 'invoicedQty', e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))} />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Input type="number" min="0" step="0.01" className="h-9 rounded-lg text-right tabular-nums" aria-label={`Unit price, line ${index + 1}`} placeholder="0.00" value={item.unitPrice} onChange={e => handleUpdateLineItem(item.id, 'unitPrice', e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))} />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Input type="number" min="0" max="100" step="0.01" className="h-9 rounded-lg text-right tabular-nums" aria-label={`Tax percentage, line ${index + 1}`} value={item.taxPercent} onChange={e => handleUpdateLineItem(item.id, 'taxPercent', Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))} />
                      </td>
                      <td className="px-4 py-4 text-right align-top"><div className="flex h-9 items-center justify-end font-semibold tabular-nums whitespace-nowrap">{formatAmount(lineTotal, currency)}</div></td>
                      <td className="px-2 py-4 align-top">
                        <Button variant="ghost" size="icon-sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove line ${index + 1}`} onClick={() => handleRemoveLineItem(item.id)} disabled={lineItems.length <= 1} title={lineItems.length <= 1 ? 'Keep at least one invoice line' : 'Remove item'}><Trash2 className="size-4" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span role="status">{lineItems.length} {lineItems.length === 1 ? 'line item' : 'line items'}</span>
            <span>Line totals include tax</span>
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
                <div className="form-field">
                  <label htmlFor="invoice-notes" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">INVOICE NOTES / REMARKS FOR BUYER</label>
                  <Textarea id="invoice-notes"
                    className="min-h-[90px] p-3"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add delivery notes, tax calculation comments, or payment details for buyer..."
                  />
                </div>

                <div className="form-field">
                  <label id="invoice-attachment-label" htmlFor="invoice-attachments" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">ATTACH VENDOR TAX INVOICE PDF</label>
                  <label
                    className={`invoice-dropzone group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 p-6 text-center cursor-pointer transition-colors hover:border-primary/60 ${isDraggingFiles ? 'invoice-dropzone--dragging' : ''}`}
                    onDragOver={event => { event.preventDefault(); setIsDraggingFiles(true); }}
                    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDraggingFiles(false); }}
                    onDrop={event => { event.preventDefault(); setIsDraggingFiles(false); handleFiles(Array.from(event.dataTransfer.files)); }}
                  >
                    <Upload className="size-7 text-primary" aria-hidden="true" />
                    <span className="text-sm font-bold text-foreground">Click to upload vendor tax invoice</span>
                    <span id="invoice-attachment-help" className="text-xs text-muted-foreground">PDF, JPG or PNG · Drag files here or click to browse</span>
                    <input id="invoice-attachments" aria-labelledby="invoice-attachment-label" aria-describedby="invoice-attachment-help" className="sr-only" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={event => { handleFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
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
                            aria-label={`Remove attachment ${att.name}`}
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
                <div className="form-field">
                  <label htmlFor="invoice-currency" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CURRENCY</label>
                  <CurrencySelector id="invoice-currency" className="invoice-currency" value={currency} onChange={setCurrency} size="sm" />
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
                {companyName || 'Procnex'}
              </h1>
              <p className="po-doc__company-detail">
                {selectedPO?.companyAddress || selectedPO?.shipToAddress || (companyName || 'Procnex') + ' • Corporate Headquarters'}
              </p>
              <p className="po-doc__company-detail">
                {companyPhone || selectedPO?.companyPhone ? `Phone: ${companyPhone || selectedPO?.companyPhone}` : ''}
                {(companyPhone || selectedPO?.companyPhone) && (companyEmail || selectedPO?.companyEmail) ? ' | ' : ''}
                {companyEmail || selectedPO?.companyEmail ? `Email: ${companyEmail || selectedPO?.companyEmail}` : ''}
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
            <p className="po-doc__party-name">{user?.fullName || selectedPO?.vendor?.name || selectedPO?.vendorName || 'Supplier'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.vendor?.contactPerson || selectedPO?.vendorContactPerson || user?.fullName || 'Sales / Accounts'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.vendor?.address || selectedPO?.vendorAddress || 'Vendor Address'}</p>
            <p className="po-doc__party-detail">Phone: {selectedPO?.vendor?.phone || selectedPO?.vendorPhone || '—'}</p>
            <p className="po-doc__party-detail">Email: {user?.email || selectedPO?.vendor?.email || selectedPO?.vendorEmail || '—'}</p>
            <p className="po-doc__party-detail">GST/VAT: {selectedPO?.vendor?.gstVat || selectedPO?.vendorGstVat || '—'}</p>
          </div>
          <div className="po-doc__party-box">
            <h3 className="po-doc__party-heading">BILL TO (BUYER / CLIENT)</h3>
            <p className="po-doc__party-name">{buyerName || companyName || 'Procnex'}</p>
            <p className="po-doc__party-detail">Warehouse: {selectedPO?.shipToWarehouse || 'Central Warehouse'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.shipToAddress || 'Corporate Headquarters'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.shipToContact || 'Accounts Payable / Treasury'}</p>
            <p className="po-doc__party-detail">Phone: {companyPhone || selectedPO?.shipToPhone || '—'}</p>
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
