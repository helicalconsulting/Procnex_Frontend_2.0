import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { dispatchNoteService, type DispatchNoteItem } from '../../services/dispatchNoteService';
import { grnService } from '../../services/grnService';
import {
  ArrowLeft,
  Truck,
  PackageCheck,
  Send,
  Save,
  Printer,
  Calendar,
  Building2,
  FileText,
  Clock,
  Plus,
  Trash2,
  Check,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ActionSendingOverlay from '../../components/shared/ActionSendingOverlay';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { useSuccessModal } from '../../context/SuccessModalContext';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input, Textarea } from '../../components/ui/input';
import { PageFrame, PageLead } from '../../components/ui/product';
import { Badge } from '../../components/ui/badge';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import '../../components/purchase-orders/PurchaseOrderDocument.css';
import '../../styles/vendor-portal.css';
import './vendor-invoice-workspace.css';
import { PrintDispatchNoteModal } from '../../components/dispatch-notes/PrintDispatchNoteModal';
import { getVendorPath } from '../../utils/tenantResolver';

interface LineItemState {
  id: string;
  itemCode?: string;
  itemName: string;
  orderedQty: number;
  dispatchedQty: number;
  unit: string;
  unitPrice?: number;
  remarks: string;
}

const localDateValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function VendorCreateDispatchNotePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poIdParam = searchParams.get('poId');

  const { user } = useAuth();
  const { showSuccess } = useSuccessModal();
  const { companyDefaultCurrency, formatAmount } = useCurrency();
  const { companyName, logoUrl } = useBranding();

  // Load Vendor's assigned Purchase Orders
  const { data: poData, loading: poLoading } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );
  const poList = useMemo(() => poData.orders || [], [poData.orders]);

  // Load existing dispatch notes & GRNs to prevent duplicate dispatch note creation
  const { data: dnData } = useServiceData(
    () => dispatchNoteService.list({ limit: 100 }),
    { dispatchNotes: [] as any[], total: 0 },
    [],
    { cacheKey: 'vendor:dns', cacheTtlMs: 30000 }
  );
  const { data: grnData } = useServiceData(
    () => grnService.list({ limit: 100 }),
    { grns: [] as any[], total: 0 },
    []
  );

  // Set of all PO IDs and PO Numbers that already have a dispatch note created
  const dispatchedPoKeys = useMemo(() => {
    const keys = new Set<string>();

    const checkAndAdd = (poId?: string, poNum?: string, status?: string) => {
      const s = String(status || '').toUpperCase();
      if (s === 'CANCELLED') return;
      if (poId) keys.add(String(poId).trim().toLowerCase());
      if (poNum) keys.add(String(poNum).trim().toLowerCase());
    };

    const dns = Array.isArray(dnData) ? dnData : (dnData as any)?.dispatchNotes || [];
    dns.forEach((dn: any) => {
      checkAndAdd(dn.poId || dn.purchaseOrder?.id, dn.poNumber || dn.purchaseOrder?.poNumber, dn.status);
    });

    const grns = grnData?.grns || [];
    grns.forEach((g: any) => {
      checkAndAdd(g.poId || g.purchaseOrder?.id, g.poNumber || g.purchaseOrder?.poNumber, g.status);
    });

    return keys;
  }, [dnData, grnData]);

  const isPoAlreadyDispatched = useCallback((po: any): boolean => {
    if (!po) return false;
    const s = String(po.status || '').toUpperCase();
    if (s === 'DISPATCHED' || s === 'IN_TRANSIT' || s === 'RECEIVED' || s === 'CLOSED') return true;
    const poId = String(po.id || '').trim().toLowerCase();
    const poNum = String(po.poNumber || '').trim().toLowerCase();
    if (poId && dispatchedPoKeys.has(poId)) return true;
    if (poNum && dispatchedPoKeys.has(poNum)) return true;
    return false;
  }, [dispatchedPoKeys]);

  // Form State
  const [selectedPoId, setSelectedPoId] = useState<string>(() => poIdParam || '');
  const [dispatchNoteNumber, setDispatchNoteNumber] = useState<string>(
    () => `DN-2026-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [dispatchDate, setDispatchDate] = useState<string>(() => localDateValue(new Date()));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return localDateValue(d);
  });
  const [transportMode, setTransportMode] = useState<string>('Road');
  const [transporterName, setTransporterName] = useState<string>('');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [driverName, setDriverName] = useState<string>('');
  const [driverPhone, setDriverPhone] = useState<string>('');
  const [driverEmail, setDriverEmail] = useState<string>('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [dispatchFromAddress, setDispatchFromAddress] = useState<string>('');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [totalPackages, setTotalPackages] = useState<number | ''>(1);
  const [totalWeight, setTotalWeight] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Line items state
  const [lineItems, setLineItems] = useState<LineItemState[]>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Selected PO
  const selectedPO = useMemo(() => {
    if (!selectedPoId || !poList.length) return null;
    const target = selectedPoId.toLowerCase().trim();
    return (
      poList.find((p) => {
        const id = String(p.id || '').toLowerCase().trim();
        const num = String(p.poNumber || '').toLowerCase().trim();
        return id === target || num === target;
      }) || null
    );
  }, [selectedPoId, poList]);

  const isInvoiceOnly = selectedPO?.vendorFulfillmentAllowed === 'INVOICE_ONLY';

  // Check if current selected PO is already dispatched
  const isAlreadyDispatched = useMemo(() => {
    if (!selectedPO && !selectedPoId) return false;
    if (selectedPO) return isPoAlreadyDispatched(selectedPO);
    const idLower = String(selectedPoId).trim().toLowerCase();
    return dispatchedPoKeys.has(idLower);
  }, [selectedPO, selectedPoId, isPoAlreadyDispatched, dispatchedPoKeys]);

  // Sync PO Param
  useEffect(() => {
    if (poIdParam && !selectedPoId) {
      setSelectedPoId(poIdParam);
    }
  }, [poIdParam, selectedPoId]);

  // Auto-populate line items and addresses when PO is selected
  useEffect(() => {
    if (!selectedPO) {
      return;
    }

    // Auto-populate shipping address from PO
    const dest =
      selectedPO.shippingAddress ||
      selectedPO.deliveryLocation ||
      selectedPO.warehouseLocation ||
      (selectedPO as any).shipToAddress ||
      '';
    if (dest && !shippingAddress) {
      setShippingAddress(dest);
    }

    // Auto-populate dispatch from address from Vendor profile if available
    const vendorAddr =
      selectedPO.vendor?.address ||
      (user as any)?.address ||
      (user as any)?.companyAddress ||
      '';
    if (vendorAddr && !dispatchFromAddress) {
      setDispatchFromAddress(vendorAddr);
    }

    // Auto-populate line items
    const rawItems: any[] =
      (selectedPO.items && selectedPO.items.length > 0 && selectedPO.items) ||
      (selectedPO.lineItems && selectedPO.lineItems.length > 0 && selectedPO.lineItems) ||
      [];

    if (rawItems.length > 0) {
      setLineItems(
        rawItems.map((item: any, idx: number) => {
          const qty = Number(item.quantity || item.orderedQty || 1);
          return {
            id: `item_${idx}_${Date.now()}`,
            itemCode: item.itemCode || `ITM-00${idx + 1}`,
            itemName: item.itemName || item.name || item.description || `Item ${idx + 1}`,
            orderedQty: qty,
            dispatchedQty: qty,
            unit: item.unit || item.uom || 'Units',
            unitPrice: Number(item.unitPrice || item.price || 0),
            remarks: 'Dispatched in good condition',
          };
        })
      );
    }
  }, [selectedPO]);

  // Update Line Item Values
  const handleUpdateLineItem = (id: string, field: keyof LineItemState, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Add Manual Item
  const handleAddItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        id: `manual_${Date.now()}_${prev.length}`,
        itemName: '',
        orderedQty: 1,
        dispatchedQty: 1,
        unit: 'Units',
        remarks: 'Direct package item',
      },
    ]);
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  };

  // Email validator with strict checks before and after @
  const validateEmailParts = useCallback((emailStr: string): { isValid: boolean; error: string | null } => {
    const trimmed = emailStr.trim();
    if (!trimmed) {
      return { isValid: true, error: null };
    }

    if (/\s/.test(trimmed)) {
      return { isValid: false, error: 'Email address cannot contain spaces.' };
    }

    if (!trimmed.includes('@')) {
      return { isValid: false, error: "Email must include '@' symbol." };
    }

    const parts = trimmed.split('@');
    if (parts.length > 2) {
      return { isValid: false, error: "Email cannot contain multiple '@' symbols." };
    }

    const [beforeAt, afterAt] = parts;

    // Validation before @
    if (!beforeAt || beforeAt.length === 0) {
      return { isValid: false, error: "Email must have a valid username / mailbox before '@'." };
    }
    if (!/^[a-zA-Z0-9._%+-]+$/.test(beforeAt)) {
      return { isValid: false, error: "Username before '@' contains invalid characters." };
    }
    if (beforeAt.startsWith('.') || beforeAt.endsWith('.')) {
      return { isValid: false, error: "Username before '@' cannot start or end with a dot." };
    }
    if (beforeAt.includes('..')) {
      return { isValid: false, error: "Username before '@' cannot contain consecutive dots." };
    }

    // Validation after @
    if (!afterAt || afterAt.length === 0) {
      return { isValid: false, error: "Email must have a domain name after '@' (e.g. gmail.com)." };
    }
    if (!afterAt.includes('.')) {
      return { isValid: false, error: "Domain after '@' must contain a dot (e.g. domain.com)." };
    }

    const domainParts = afterAt.split('.');
    const domainName = domainParts.slice(0, -1).join('.');
    const tld = domainParts[domainParts.length - 1];

    if (!domainName || domainName.length < 1) {
      return { isValid: false, error: "Missing domain name before '.' (e.g. company.com)." };
    }
    if (!/^[a-zA-Z0-9.-]+$/.test(afterAt)) {
      return { isValid: false, error: "Domain after '@' contains invalid characters." };
    }
    if (afterAt.startsWith('.') || afterAt.endsWith('.')) {
      return { isValid: false, error: "Domain after '@' cannot start or end with a dot." };
    }
    if (afterAt.includes('..')) {
      return { isValid: false, error: "Domain after '@' cannot contain consecutive dots." };
    }
    if (!tld || tld.length < 2 || !/^[a-zA-Z]{2,}$/.test(tld)) {
      return { isValid: false, error: "Domain extension after '.' must be at least 2 letters (e.g. .com, .in)." };
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
      return { isValid: false, error: 'Invalid email format (e.g. name@domain.com).' };
    }

    return { isValid: true, error: null };
  }, []);

  // Mobile number input: strictly only numbers (0-9), max 15 digits, min 7 digits
  const handlePhoneChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything except digits
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 15);
    setDriverPhone(digitsOnly);

    if (digitsOnly.length > 0 && digitsOnly.length < 7) {
      setPhoneError(`Mobile number must be between 7 and 15 digits (${digitsOnly.length}/7 entered)`);
    } else {
      setPhoneError(null);
    }
  }, []);

  const handlePhoneKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow navigation & editing keys
    if (
      ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Home', 'End'].includes(e.key) ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return;
    }
    // Block any non-digit key immediately so letters cannot be typed
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  }, []);

  const handlePhonePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const digits = pasted.replace(/\D/g, '').slice(0, 15);
    setDriverPhone((prev) => {
      const nextVal = (prev + digits).slice(0, 15);
      if (nextVal.length > 0 && nextVal.length < 7) {
        setPhoneError(`Mobile number must be between 7 and 15 digits (${nextVal.length}/7 entered)`);
      } else {
        setPhoneError(null);
      }
      return nextVal;
    });
  }, []);

  // Email input handler with immediate real-time validation
  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDriverEmail(val);
    if (!val.trim()) {
      setEmailError(null);
    } else {
      const res = validateEmailParts(val);
      setEmailError(res.error);
    }
  }, [validateEmailParts]);

  // Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (isInvoiceOnly) {
      setErrorMsg('This Purchase Order is configured for Direct Invoicing only. Dispatch note creation is not permitted for this order.');
      return false;
    }
    if (isAlreadyDispatched) {
      setErrorMsg(`A dispatch note has already been created for Purchase Order ${selectedPO?.poNumber || selectedPoId}. Duplicate dispatch notes are strictly not allowed.`);
      return false;
    }
    if (!dispatchNoteNumber.trim()) {
      setErrorMsg('Dispatch Note Number is required.');
      return false;
    }
    if (!selectedPoId) {
      setErrorMsg('Please select a Purchase Order to dispatch.');
      return false;
    }
    if (!dispatchDate) {
      setErrorMsg('Dispatch Date is required.');
      return false;
    }

    // Driver Mobile Number validation (7-15 digits, no alphabets)
    if (driverPhone.trim()) {
      const digitsOnly = driverPhone.replace(/\D/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        setErrorMsg(`Driver mobile number must be between 7 and 15 digits (currently ${digitsOnly.length} digits).`);
        setPhoneError(`Must be between 7 and 15 digits (${digitsOnly.length}/7 entered)`);
        return false;
      }
    }

    // Driver / Transporter Email validation (before and after @)
    if (driverEmail.trim()) {
      const emailRes = validateEmailParts(driverEmail);
      if (!emailRes.isValid) {
        setErrorMsg(`Invalid email: ${emailRes.error}`);
        setEmailError(emailRes.error);
        return false;
      }
    }

    if (lineItems.length === 0) {
      setErrorMsg('Please add at least one line item to dispatch.');
      return false;
    }
    const hasInvalidQty = lineItems.some(
      (item) => Number(item.dispatchedQty || 0) <= 0 || !item.itemName.trim()
    );
    if (hasInvalidQty) {
      setErrorMsg('All line items must have a valid name and dispatched quantity greater than 0.');
      return false;
    }
    return true;
  };

  // Submit Dispatch Note
  const handleSubmit = async (isDraft: boolean) => {
    if (isInvoiceOnly) {
      setErrorMsg('This Purchase Order is configured for Direct Invoicing only. Dispatch note creation is not permitted for this order.');
      return;
    }
    if (isAlreadyDispatched) {
      setErrorMsg(`A dispatch note has already been created for Purchase Order ${selectedPO?.poNumber || selectedPoId}. Duplicate dispatch notes are strictly not allowed.`);
      return;
    }
    if (!validateForm()) return;

    if (isDraft) setSavingDraft(true);
    else setSubmitting(true);

    setErrorMsg(null);

    try {
      const itemsPayload: DispatchNoteItem[] = lineItems.map((item) => ({
        itemName: item.itemName,
        orderedQty: Number(item.orderedQty) || 1,
        dispatchedQty: Number(item.dispatchedQty) || 1,
        unit: item.unit || 'Units',
        unitPrice: item.unitPrice,
        remarks: item.remarks,
      }));

      await dispatchNoteService.create({
        dispatchNoteNumber,
        poId: selectedPO?.id || selectedPO?.poNumber || selectedPoId,
        vendorId: user?.id || selectedPO?.vendorId || selectedPO?.vendor?.id,
        dispatchDate,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        transportMode,
        transporterName,
        vehicleNumber,
        trackingNumber,
        driverName,
        driverPhone,
        driverEmail: driverEmail.trim() || undefined,
        shippingAddress,
        dispatchFromAddress,
        totalPackages: Number(totalPackages) || undefined,
        totalWeight: totalWeight || undefined,
        notes,
        items: itemsPayload,
        isDraft,
      });

      // Emit event for real-time sync across vendor and employee portals
      window.dispatchEvent(new CustomEvent('heliflow:dispatch-note-created'));
      try {
        const bc = new BroadcastChannel('heliflow_sync');
        bc.postMessage({ type: 'DISPATCH_NOTE_CREATED', timestamp: Date.now() });
        bc.close();
      } catch {}

      showSuccess({
        title: isDraft ? 'Dispatch Note Draft Saved!' : 'Dispatch Note Submitted!',
        badge: isDraft ? 'DRAFT' : 'DISPATCHED',
        message: isDraft
          ? `Dispatch Note ${dispatchNoteNumber} has been saved as draft.`
          : `Dispatch Note ${dispatchNoteNumber} has been submitted successfully to the buyer. The warehouse team can now verify goods receipt.`,
        referenceNumber: dispatchNoteNumber,
        details: [
          { label: 'Purchase Order', value: selectedPO?.poNumber || selectedPoId },
          { label: 'Dispatch Date', value: dispatchDate },
          { label: 'Carrier / Transporter', value: transporterName || 'Direct' },
          { label: 'Vehicle / Tracking', value: vehicleNumber || trackingNumber || '—' },
          { label: 'Total Packages', value: `${totalPackages || 1} pkg` },
        ],
        primaryBtnText: 'View My Orders',
        onPrimaryClick: () => navigate('/vendor/orders'),
      });

      navigate('/vendor/orders');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit Dispatch Note.');
    } finally {
      setSubmitting(false);
      setSavingDraft(false);
    }
  };

  return (
    <PageFrame>
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
              Create Dispatch Note (Delivery Challan)
            </h1>
            <p className="text-[16px] text-muted-foreground m-0">
              Generate shipment advice and delivery challan to notify buyer warehouse for receiving & GRN.
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
            <Printer className="size-4" /> Print Challan
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="mb-4">
          <MessageStrip type="error" onClose={() => setErrorMsg(null)}>
            {errorMsg}
          </MessageStrip>
        </div>
      )}

      <div className="space-y-6">
        {/* Invoice Only Warning Banner */}
        {isInvoiceOnly && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0">
                <FileText className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Direct Invoicing Required for this Order</p>
                <p className="text-xs text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                  The buyer has configured {selectedPO?.poNumber || selectedPoId} for <strong>Direct Invoicing only</strong>. Dispatch note creation is not permitted for this order.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 gap-1.5"
              onClick={() => navigate(getVendorPath(`/vendor/create-invoice?poId=${encodeURIComponent(selectedPoId)}`))}
            >
              <Plus className="size-4" /> Create Invoice Instead
            </Button>
          </div>
        )}

        {/* Duplicate Dispatch Warning Banner */}
        {isAlreadyDispatched && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 shrink-0">
                <Truck className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Dispatch Note Already Created for this Purchase Order</p>
                <p className="text-xs text-rose-700/90 dark:text-rose-300/80 mt-0.5">
                  A dispatch note has already been recorded for <strong>{selectedPO?.poNumber || selectedPoId}</strong>. Duplicate dispatch notes for the same Purchase Order are not allowed.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white shrink-0 gap-1.5"
              onClick={() => navigate(getVendorPath('/vendor/invoices?tab=dispatches'))}
            >
              <Truck className="size-4" /> View Existing Dispatches
            </Button>
          </div>
        )}

        {/* Section 01: Order & Dispatch Identification */}
        <Card className="p-6 border border-border/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-border/60">
            <FileText className="size-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Order & Dispatch Identification</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Purchase Order Select */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Purchase Order Reference *
              </label>
              <select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
                disabled={poLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring font-medium"
              >
                <option value="">-- Select Purchase Order to Dispatch --</option>
                {poList.map((po) => {
                  const alreadyDispatched = isPoAlreadyDispatched(po);
                  return (
                    <option key={po.id} value={po.id} disabled={alreadyDispatched}>
                      {po.poNumber} — {formatAmount(po.totalAmount, companyDefaultCurrency)} ({po.status})
                      {po.vendorFulfillmentAllowed === 'INVOICE_ONLY' ? ' [Invoice Only]' : ''}
                      {alreadyDispatched ? ' [Dispatch Note Already Created]' : ''}
                    </option>
                  );
                })}
                {selectedPoId && !poList.some((po) => String(po.id) === String(selectedPoId)) && (
                  <option value={selectedPoId} disabled={isAlreadyDispatched}>
                    {selectedPO?.poNumber || selectedPoId}{isAlreadyDispatched ? ' [Dispatch Note Already Created]' : ''}
                  </option>
                )}
              </select>
            </div>

            {/* Dispatch Note # */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Dispatch Note / Challan # *
              </label>
              <Input
                type="text"
                value={dispatchNoteNumber}
                onChange={(e) => setDispatchNoteNumber(e.target.value)}
                className="font-mono text-sm bg-background font-bold"
                placeholder="e.g. DN-2026-1049"
              />
            </div>

            {/* Dispatch Date */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Dispatch Date *
              </label>
              <Input
                type="date"
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                className="text-sm bg-background"
              />
            </div>
          </div>

          {/* Selected PO Summary Bar */}
          {selectedPO && (
            <div className="p-4 rounded-xl bg-muted/40 border border-border/70 flex flex-wrap gap-6 items-center text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground font-medium">Buyer:</span>
                <span className="font-bold text-foreground">
                  {(selectedPO as any).buyerCompany || (selectedPO as any).buyerName || companyName || 'Buyer Organization'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">PO Total:</span>
                <span className="font-bold text-primary">
                  {formatAmount(selectedPO.totalAmount, selectedPO.currency || companyDefaultCurrency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Order Status:</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold">
                  {selectedPO.status}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground font-medium">Fulfillment:</span>
                <Badge
                  variant="outline"
                  className={
                    selectedPO.vendorFulfillmentAllowed === 'INVOICE_ONLY'
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-semibold'
                      : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-semibold'
                  }
                >
                  {selectedPO.vendorFulfillmentAllowed === 'INVOICE_ONLY'
                    ? 'Direct Invoice Only'
                    : selectedPO.vendorFulfillmentAllowed === 'DISPATCH_ONLY'
                    ? 'Dispatch Only'
                    : 'Dispatch & Invoice'}
                </Badge>
              </div>
            </div>
          )}
        </Card>

        {/* Section 02: Logistics, Carrier & Transport */}
        <Card className="p-6 border border-border/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-border/60">
            <Truck className="size-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Logistics, Transporter & Tracking Details</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Transport Mode */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Transport Mode
              </label>
              <select
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="Road">🚛 Road (Truck / Lorry)</option>
                <option value="Courier">📦 Courier / Express Cargo</option>
                <option value="Air">✈️ Air Freight</option>
                <option value="Rail">🚆 Rail Freight</option>
                <option value="Sea">🚢 Sea Freight</option>
                <option value="Hand Delivery">🚶 Hand Delivery / Local Pickup</option>
              </select>
            </div>

            {/* Transporter / Carrier Name */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Transporter / Carrier Name
              </label>
              <Input
                type="text"
                placeholder="e.g. BlueDart Express / VRL"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                className="text-sm bg-background"
              />
            </div>

            {/* Vehicle Number */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Vehicle / Lorry No.
              </label>
              <Input
                type="text"
                placeholder="e.g. MH-12-AB-9821"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="text-sm bg-background uppercase font-mono"
              />
            </div>

            {/* Tracking / LR Number */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                LR / Consignment / Tracking #
              </label>
              <Input
                type="text"
                placeholder="e.g. LR-99882104"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                className="text-sm bg-background font-mono"
              />
            </div>

            {/* Driver Name */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Driver / Attendant Name
              </label>
              <Input
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                className="text-sm bg-background"
              />
            </div>

            {/* Driver Mobile Number */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3 text-muted-foreground" />
                  Driver Mobile Number
                </span>
                {driverPhone.length > 0 && (
                  <span
                    className={`text-[10px] ${
                      driverPhone.length >= 7
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'text-amber-600 dark:text-amber-400 font-medium'
                    }`}
                  >
                    {driverPhone.length}/15 digits
                  </span>
                )}
              </label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="e.g. 9876543210 (7-15 digits)"
                value={driverPhone}
                onChange={handlePhoneChange}
                onKeyDown={handlePhoneKeyDown}
                onPaste={handlePhonePaste}
                maxLength={15}
                className={`text-sm bg-background font-mono transition-colors ${
                  phoneError
                    ? 'border-destructive focus-visible:ring-destructive'
                    : driverPhone.length >= 7
                    ? 'border-emerald-500/60 focus-visible:ring-emerald-500'
                    : ''
                }`}
              />
              {phoneError && (
                <p className="text-xs text-destructive font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="size-3 shrink-0" /> {phoneError}
                </p>
              )}
              {!phoneError && driverPhone.length >= 7 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                  <Check className="size-3 shrink-0" /> Valid number ({driverPhone.length} digits)
                </p>
              )}
            </div>

            {/* Driver / Transporter Email */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="size-3 text-muted-foreground" />
                  Driver / Transporter Email
                </span>
              </label>
              <Input
                type="email"
                placeholder="e.g. driver@logistics.com"
                value={driverEmail}
                onChange={handleEmailChange}
                className={`text-sm bg-background transition-colors ${
                  emailError
                    ? 'border-destructive focus-visible:ring-destructive'
                    : driverEmail.trim().length > 0 && !emailError
                    ? 'border-emerald-500/60 focus-visible:ring-emerald-500'
                    : ''
                }`}
              />
              {emailError && (
                <p className="text-xs text-destructive font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="size-3 shrink-0" /> {emailError}
                </p>
              )}
              {!emailError && driverEmail.trim().length > 0 && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1 flex items-center gap-1">
                  <Check className="size-3 shrink-0" /> Valid email address
                </p>
              )}
            </div>

            {/* Expected Delivery Date */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Expected Delivery Date
              </label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="text-sm bg-background"
              />
            </div>

            {/* Total Packages */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Total Packages / Boxes
              </label>
              <Input
                type="number"
                min="1"
                value={totalPackages}
                onChange={(e) => setTotalPackages(e.target.value ? Number(e.target.value) : '')}
                className="text-sm bg-background"
              />
            </div>
          </div>

          {/* Locations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Dispatch From (Vendor Origin Warehouse)
              </label>
              <Textarea
                rows={2}
                placeholder="Factory / Warehouse origin address..."
                value={dispatchFromAddress}
                onChange={(e) => setDispatchFromAddress(e.target.value)}
                className="text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Delivery Destination (Buyer Warehouse Address)
              </label>
              <Textarea
                rows={2}
                placeholder="Buyer delivery / warehouse address..."
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                className="text-sm bg-background"
              />
            </div>
          </div>
        </Card>

        {/* Section 03: Dispatched Materials & Quantities */}
        <Card className="p-6 border border-border/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <PackageCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-base font-bold text-foreground">Dispatched Materials & Quantities</h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddItem}
              className="gap-1.5 text-xs font-semibold"
            >
              <Plus className="size-3.5" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/70">
            <table className="w-full text-left text-sm min-w-[700px]">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border/70">
                <tr>
                  <th className="py-3 px-3.5 w-10 text-center">#</th>
                  <th className="py-3 px-3.5 min-w-[200px]">Material / Item Description *</th>
                  <th className="py-3 px-3.5 w-28 text-center">Ordered Qty</th>
                  <th className="py-3 px-3.5 w-32 text-center">Dispatched Qty *</th>
                  <th className="py-3 px-3.5 w-24 text-center">Unit</th>
                  <th className="py-3 px-3.5 min-w-[160px]">Remarks / Batch #</th>
                  <th className="py-3 px-3.5 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No line items added. Select a Purchase Order above to auto-populate materials.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item, index) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-3.5 text-center text-muted-foreground font-mono text-xs">
                        {index + 1}
                      </td>
                      <td className="py-3 px-3.5">
                        <Input
                          type="text"
                          value={item.itemName}
                          placeholder="Item name / specifications"
                          onChange={(e) => handleUpdateLineItem(item.id, 'itemName', e.target.value)}
                          className="h-9 text-sm bg-background font-medium"
                        />
                      </td>
                      <td className="py-3 px-3.5 text-center font-semibold text-muted-foreground font-mono">
                        {item.orderedQty}
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <Input
                          type="number"
                          min="1"
                          value={item.dispatchedQty}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'dispatchedQty',
                              e.target.value ? Number(e.target.value) : 0
                            )
                          }
                          className="h-9 text-sm text-center font-bold font-mono bg-background text-primary"
                        />
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <Input
                          type="text"
                          value={item.unit}
                          onChange={(e) => handleUpdateLineItem(item.id, 'unit', e.target.value)}
                          className="h-9 text-xs text-center bg-background"
                        />
                      </td>
                      <td className="py-3 px-3.5">
                        <Input
                          type="text"
                          value={item.remarks}
                          placeholder="Batch / Serial No."
                          onChange={(e) => handleUpdateLineItem(item.id, 'remarks', e.target.value)}
                          className="h-9 text-xs bg-background"
                        />
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.id)}
                          className="size-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Section 04: Remarks, Attachments & Submit */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6 border border-border/80 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider pb-2 border-b border-border/60">
              Delivery Remarks & Special Instructions
            </h3>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Special Delivery / Handling Instructions
              </label>
              <Textarea
                rows={4}
                placeholder="Add any instructions for warehouse receiving dock, unloading notes, or temperature handling requirements..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm bg-background"
              />
            </div>
          </Card>

          {/* Action Card */}
          <Card className="p-6 border border-border/80 shadow-xs flex flex-col justify-between space-y-6">
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border/60">
                Dispatch Summary
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>PO Number:</span>
                  <span className="font-semibold text-foreground">{selectedPO?.poNumber || selectedPoId || '—'}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Materials Count:</span>
                  <span className="font-semibold text-primary">{lineItems.length} items</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Transporter:</span>
                  <span className="font-semibold text-foreground">{transporterName || transportMode}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-border/60 text-base">
                  <span className="font-bold text-foreground">Dispatched Qty:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {lineItems.reduce((acc, i) => acc + (Number(i.dispatchedQty) || 0), 0)} units
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <Button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={submitting || savingDraft || isInvoiceOnly || isAlreadyDispatched}
                title={isAlreadyDispatched ? 'A dispatch note has already been created for this Purchase Order' : undefined}
                className="w-full py-2.5 gap-2 shadow-sm font-bold"
              >
                <Send className="size-4" /> {submitting ? 'Submitting Challan…' : 'Submit Dispatch Note'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={submitting || savingDraft || isInvoiceOnly || isAlreadyDispatched}
                title={isAlreadyDispatched ? 'A dispatch note has already been created for this Purchase Order' : undefined}
                className="w-full py-2.5 gap-2 font-medium"
              >
                <Save className="size-4" /> {savingDraft ? 'Saving Draft…' : 'Save Draft'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ActionSendingOverlay
        isOpen={submitting}
        docType="dispatch_note"
        docNumber={dispatchNoteNumber}
        title="Submitting Dispatch Note (Delivery Challan)..."
        subtitle={`Sending delivery advice against PO #${selectedPO?.poNumber || selectedPoId} to buyer warehouse receiving dock.`}
        vendorName={user?.name || 'Vendor'}
        amount={0}
        currency={companyDefaultCurrency}
        mode="approval"
      />

      {showPrintModal && (
        <PrintDispatchNoteModal
          data={{
            dispatchNoteNumber,
            dispatchDate,
            expectedDeliveryDate,
            transportMode,
            transporterName,
            vehicleNumber,
            trackingNumber,
            driverName,
            driverPhone,
            driverEmail,
            dispatchFromAddress,
            shippingAddress,
            totalPackages: totalPackages || 1,
            totalWeight,
            notes,
            poId: selectedPoId,
            poNumber: selectedPO?.poNumber || selectedPoId,
            vendorName: user?.name || (selectedPO as any)?.vendorName || (selectedPO as any)?.vendor?.name || 'Authorized Supplier',
            status: 'IN_TRANSIT',
            items: lineItems.map((li) => ({
              id: li.id,
              itemCode: li.itemCode,
              itemName: li.itemName,
              orderedQty: li.orderedQty,
              dispatchedQty: li.dispatchedQty,
              unit: li.unit,
              remarks: li.remarks,
            })),
          }}
          po={selectedPO}
          onClose={() => setShowPrintModal(false)}
        />
      )}
    </PageFrame>
  );
}
