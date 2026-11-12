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
  orderedQty: number; // PO Quantity
  deliveredQty: number; // Delivered Quantity (previously delivered)
  quantityToBeDelivered: number; // Quantity to be delivered in this note
  remainingQty: number; // Remaining Quantity: orderedQty - (deliveredQty + quantityToBeDelivered)
  dispatchedQty: number; // Synced with quantityToBeDelivered
  unit: string;
  unitPrice?: number;
  remarks: string;
}

export interface PoItemDeliverySummary {
  rawItem: any;
  itemCode?: string;
  itemName: string;
  orderedQty: number;
  deliveredQty: number;
  remainingAvailable: number;
}

export interface PoDispatchSummary {
  totalOrdered: number;
  totalDelivered: number;
  totalRemainingAvailable: number;
  isFullyDispatched: boolean;
  isPartiallyDispatched: boolean;
  hasPriorDispatches: boolean;
  items: PoItemDeliverySummary[];
}

export function getPoDispatchSummary(po: any, dnData: any): PoDispatchSummary {
  if (!po) {
    return {
      totalOrdered: 0,
      totalDelivered: 0,
      totalRemainingAvailable: 0,
      isFullyDispatched: false,
      isPartiallyDispatched: false,
      hasPriorDispatches: false,
      items: [],
    };
  }

  const poIdStr = String(po.id || '').trim().toLowerCase();
  const poNumStr = String(po.poNumber || '').trim().toLowerCase();

  const dns = (Array.isArray(dnData) ? dnData : (dnData as any)?.dispatchNotes || [])
    .filter((dn: any) => {
      const s = String(dn?.status || '').toUpperCase();
      if (s === 'CANCELLED') return false;
      const dnPoId = String(dn?.poId || dn?.purchaseOrder?.id || '').trim().toLowerCase();
      const dnPoNum = String(dn?.poNumber || dn?.purchaseOrder?.poNumber || '').trim().toLowerCase();
      return (poIdStr && (dnPoId === poIdStr || dnPoNum === poIdStr)) ||
             (poNumStr && (dnPoId === poNumStr || dnPoNum === poNumStr));
    });

  const deliveredMap = new Map<string, number>();
  dns.forEach((dn: any) => {
    const itms = Array.isArray(dn?.items) ? dn.items : [];
    itms.forEach((it: any) => {
      const qty = Number(it.dispatchedQty ?? it.quantityToBeDelivered ?? it.quantity ?? 0);
      if (it.itemCode) {
        const cKey = `code:${String(it.itemCode).trim().toLowerCase()}`;
        deliveredMap.set(cKey, (deliveredMap.get(cKey) || 0) + qty);
      }
      if (it.itemName) {
        const nKey = `name:${String(it.itemName).trim().toLowerCase()}`;
        deliveredMap.set(nKey, (deliveredMap.get(nKey) || 0) + qty);
      }
    });
  });

  const rawItems: any[] =
    (po.items && po.items.length > 0 && po.items) ||
    (po.lineItems && po.lineItems.length > 0 && po.lineItems) ||
    [];

  let totalOrdered = 0;
  let totalDelivered = 0;
  let totalRemainingAvailable = 0;

  const itemSummaries: PoItemDeliverySummary[] = rawItems.map((rawItem: any, idx: number) => {
    const orderedQty = Number(rawItem.quantity || rawItem.orderedQty || 0);
    const itemCode = rawItem.itemCode || `ITM-00${idx + 1}`;
    const itemName = rawItem.itemName || rawItem.name || rawItem.description || `Item ${idx + 1}`;

    const codeKey = rawItem.itemCode ? `code:${String(rawItem.itemCode).trim().toLowerCase()}` : '';
    const nameKey = `name:${String(itemName).trim().toLowerCase()}`;

    const deliveredQty = (codeKey && deliveredMap.has(codeKey))
      ? (deliveredMap.get(codeKey) || 0)
      : (deliveredMap.get(nameKey) || 0);

    const remainingAvailable = Math.max(0, orderedQty - deliveredQty);
    totalOrdered += orderedQty;
    totalDelivered += deliveredQty;
    totalRemainingAvailable += remainingAvailable;

    return {
      rawItem,
      itemCode,
      itemName,
      orderedQty,
      deliveredQty,
      remainingAvailable,
    };
  });

  const poStatus = String(po.status || '').toUpperCase();
  const isClosedOrRecv = poStatus === 'RECEIVED' || poStatus === 'CLOSED';
  const isFullyDispatched = isClosedOrRecv || (rawItems.length > 0 && totalOrdered > 0 && totalRemainingAvailable <= 0);
  const isPartiallyDispatched = !isFullyDispatched && (totalDelivered > 0 || dns.length > 0);

  return {
    totalOrdered,
    totalDelivered,
    totalRemainingAvailable,
    isFullyDispatched,
    isPartiallyDispatched,
    hasPriorDispatches: dns.length > 0,
    items: itemSummaries,
  };
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

  // Load existing dispatch notes & GRNs to track delivered quantities
  const { data: dnData } = useServiceData(
    () => dispatchNoteService.list({ limit: 100 }),
    { dispatchNotes: [] as any[], total: 0 },
    [],
    { cacheKey: 'vendor:dns', cacheTtlMs: 30000 }
  );

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

  // Calculate delivery summary for selected PO
  const selectedPOSummary = useMemo(() => {
    return getPoDispatchSummary(selectedPO, dnData);
  }, [selectedPO, dnData]);

  const isAlreadyDispatched = selectedPOSummary.isFullyDispatched;

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

    // Auto-populate line items with delivery tracking (PO Quantity, Delivered Quantity, Quantity to be delivered, Remaining Quantity)
    const summary = getPoDispatchSummary(selectedPO, dnData);
    if (summary.items.length > 0) {
      setLineItems(
        summary.items.map((item, idx) => {
          const defaultToDeliver = item.remainingAvailable;
          const remaining = Math.max(0, item.orderedQty - (item.deliveredQty + defaultToDeliver));
          return {
            id: `item_${idx}_${Date.now()}`,
            itemCode: item.itemCode,
            itemName: item.itemName,
            orderedQty: item.orderedQty,
            deliveredQty: item.deliveredQty,
            quantityToBeDelivered: defaultToDeliver,
            remainingQty: remaining,
            dispatchedQty: defaultToDeliver,
            unit: item.rawItem.unit || item.rawItem.uom || 'Units',
            unitPrice: Number(item.rawItem.unitPrice || item.rawItem.price || 0),
            remarks: item.deliveredQty > 0
              ? `Subsequent dispatch (Prev delivered: ${item.deliveredQty})`
              : 'Dispatched in good condition',
          };
        })
      );
    }
  }, [selectedPO, dnData]);

  // Update Quantity to be delivered with formula: Remaining Quantity = PO Quantity - (Delivered Quantity + Quantity to be delivered)
  const handleUpdateQuantityToBeDelivered = (id: string, value: any) => {
    const num = value === '' ? 0 : Number(value);
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const validVal = isNaN(num) ? 0 : num;
        const remaining = Math.max(0, item.orderedQty - (item.deliveredQty + validVal));
        return {
          ...item,
          quantityToBeDelivered: validVal,
          dispatchedQty: validVal,
          remainingQty: remaining,
        };
      })
    );
  };

  // Update Ordered Qty (for manual items)
  const handleUpdateOrderedQty = (id: string, value: any) => {
    const num = value === '' ? 0 : Number(value);
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const validVal = isNaN(num) ? 0 : num;
        const remaining = Math.max(0, validVal - (item.deliveredQty + item.quantityToBeDelivered));
        return {
          ...item,
          orderedQty: validVal,
          remainingQty: remaining,
        };
      })
    );
  };

  // Update Line Item Values
  const handleUpdateLineItem = (id: string, field: keyof LineItemState, value: any) => {
    if (field === 'quantityToBeDelivered' || field === 'dispatchedQty') {
      handleUpdateQuantityToBeDelivered(id, value);
      return;
    }
    if (field === 'orderedQty') {
      handleUpdateOrderedQty(id, value);
      return;
    }
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
        deliveredQty: 0,
        quantityToBeDelivered: 1,
        remainingQty: 0,
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
    if (selectedPOSummary.isFullyDispatched) {
      setErrorMsg(`All ordered items for Purchase Order ${selectedPO?.poNumber || selectedPoId} have already been fully dispatched across previous delivery notes.`);
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

    for (const item of lineItems) {
      if (!item.itemName.trim()) {
        setErrorMsg('All line items must have a valid item description.');
        return false;
      }
      const toDeliver = Number(item.quantityToBeDelivered);
      if (isNaN(toDeliver) || toDeliver < 0) {
        setErrorMsg(`Quantity to be delivered for "${item.itemName}" cannot be negative.`);
        return false;
      }
      const maxAllowed = Math.max(0, item.orderedQty - item.deliveredQty);
      if (toDeliver > maxAllowed) {
        setErrorMsg(`Quantity to be delivered for "${item.itemName}" (${toDeliver}) cannot exceed the remaining quantity (${maxAllowed}).`);
        return false;
      }
    }

    const totalToDeliver = lineItems.reduce((acc, it) => acc + (Number(it.quantityToBeDelivered) || 0), 0);
    if (totalToDeliver <= 0) {
      setErrorMsg('Please enter a Quantity to be delivered greater than 0 for at least one item.');
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
    if (selectedPOSummary.isFullyDispatched) {
      setErrorMsg(`All ordered items for Purchase Order ${selectedPO?.poNumber || selectedPoId} have already been fully dispatched across previous delivery notes.`);
      return;
    }
    if (!validateForm()) return;

    if (isDraft) setSavingDraft(true);
    else setSubmitting(true);

    setErrorMsg(null);

    try {
      const activeItems = lineItems.filter((i) => Number(i.quantityToBeDelivered) > 0);
      const itemsPayload: DispatchNoteItem[] = (activeItems.length > 0 ? activeItems : lineItems).map((item) => ({
        itemCode: item.itemCode,
        itemName: item.itemName,
        poQty: Number(item.orderedQty) || 1,
        orderedQty: Number(item.orderedQty) || 1,
        deliveredQty: Number(item.deliveredQty) || 0,
        quantityToBeDelivered: Number(item.quantityToBeDelivered) || 0,
        dispatchedQty: Number(item.quantityToBeDelivered) || 0,
        remainingQty: Number(item.remainingQty) || 0,
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

        {/* Fully Dispatched Banner */}
        {selectedPOSummary.isFullyDispatched && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 shrink-0">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Purchase Order Fully Dispatched</p>
                <p className="text-xs text-rose-700/90 dark:text-rose-300/80 mt-0.5">
                  All ordered items for Purchase Order <strong>{selectedPO?.poNumber || selectedPoId}</strong> have already been completely dispatched across previous delivery notes.
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

        {/* Partial Dispatch Information Banner */}
        {selectedPOSummary.isPartiallyDispatched && !selectedPOSummary.isFullyDispatched && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border border-sky-300 bg-sky-50 dark:bg-sky-950/20 text-sky-900 dark:text-sky-200">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 shrink-0">
                <Truck className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-sm">Partial Dispatch Mode Active</p>
                <p className="text-xs text-sky-700/90 dark:text-sky-300/80 mt-0.5">
                  Previous dispatches exist for Purchase Order <strong>{selectedPO?.poNumber || selectedPoId}</strong>. You can deliver up to the remaining quantity ({selectedPOSummary.totalRemainingAvailable} units remaining).
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-sky-300 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 shrink-0 gap-1.5"
              onClick={() => navigate(getVendorPath('/vendor/invoices?tab=dispatches'))}
            >
              <FileText className="size-4" /> View Prior Dispatches
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
                  const poSum = getPoDispatchSummary(po, dnData);
                  const isInvOnly = po.vendorFulfillmentAllowed === 'INVOICE_ONLY';
                  const isFull = poSum.isFullyDispatched;
                  const isPart = poSum.isPartiallyDispatched;

                  let labelSuffix = '';
                  if (isInvOnly) labelSuffix = ' [Invoice Only]';
                  else if (isFull) labelSuffix = ' [Fully Dispatched - Completed]';
                  else if (isPart) labelSuffix = ` [Partially Dispatched — ${poSum.totalRemainingAvailable} remaining]`;
                  else labelSuffix = ' [Ready for Dispatch]';

                  return (
                    <option key={po.id} value={po.id} disabled={isInvOnly || isFull}>
                      {po.poNumber} — {formatAmount(po.totalAmount, companyDefaultCurrency)} ({po.status}){labelSuffix}
                    </option>
                  );
                })}
                {selectedPoId && !poList.some((po) => String(po.id) === String(selectedPoId)) && (
                  <option value={selectedPoId} disabled={selectedPOSummary.isFullyDispatched}>
                    {selectedPO?.poNumber || selectedPoId}
                    {selectedPOSummary.isFullyDispatched ? ' [Fully Dispatched - Completed]' : ''}
                    {selectedPOSummary.isPartiallyDispatched && !selectedPOSummary.isFullyDispatched ? ` [Partially Dispatched — ${selectedPOSummary.totalRemainingAvailable} remaining]` : ''}
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
            <table className="w-full text-left text-sm min-w-[860px]">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase font-semibold border-b border-border/70">
                <tr>
                  <th className="py-3 px-3.5 w-10 text-center">#</th>
                  <th className="py-3 px-3.5 min-w-[200px]">Material / Item Description *</th>
                  <th className="py-3 px-3.5 w-28 text-center">PO Quantity</th>
                  <th className="py-3 px-3.5 w-32 text-center">Delivered Quantity</th>
                  <th className="py-3 px-3.5 w-36 text-center">Quantity to be delivered *</th>
                  <th className="py-3 px-3.5 w-32 text-center">Remaining Quantity</th>
                  <th className="py-3 px-3.5 w-24 text-center">Unit</th>
                  <th className="py-3 px-3.5 min-w-[150px]">Remarks / Batch #</th>
                  <th className="py-3 px-3.5 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted-foreground">
                      No line items added. Select a Purchase Order above to auto-populate materials.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item, index) => {
                    const maxAllowed = Math.max(0, item.orderedQty - item.deliveredQty);
                    const isFullyDelivered = item.orderedQty > 0 && maxAllowed === 0;
                    const isExceeded = item.quantityToBeDelivered > maxAllowed;

                    return (
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
                          {item.itemCode && (
                            <span className="text-[11px] font-mono text-muted-foreground mt-0.5 block">
                              Code: {item.itemCode}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          {item.id.startsWith('manual_') ? (
                            <Input
                              type="number"
                              min="1"
                              value={item.orderedQty}
                              onChange={(e) => handleUpdateOrderedQty(item.id, e.target.value)}
                              className="h-9 text-sm text-center font-semibold font-mono bg-background"
                            />
                          ) : (
                            <span className="font-semibold text-foreground font-mono text-sm">
                              {item.orderedQty}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <span className="inline-block font-mono text-sm px-2.5 py-1 rounded-md bg-muted/60 text-muted-foreground font-semibold">
                            {item.deliveredQty}
                          </span>
                          {item.deliveredQty > 0 && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block mt-0.5">
                              in prev notes
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex flex-col items-center">
                            <Input
                              type="number"
                              min="0"
                              max={maxAllowed}
                              disabled={isFullyDelivered}
                              value={item.quantityToBeDelivered}
                              onChange={(e) => handleUpdateQuantityToBeDelivered(item.id, e.target.value)}
                              className={`h-9 text-sm text-center font-bold font-mono bg-background ${
                                isExceeded
                                  ? 'border-rose-500 text-rose-600 focus-visible:ring-rose-500'
                                  : 'text-primary'
                              }`}
                            />
                            {isExceeded && (
                              <span className="text-[10px] text-rose-500 font-medium mt-1">
                                Max: {maxAllowed}
                              </span>
                            )}
                            {isFullyDelivered && (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 mt-1">
                                Completed
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <div className="flex flex-col items-center">
                            <span
                              className={`inline-block font-mono font-bold text-sm px-2.5 py-1 rounded-md ${
                                item.remainingQty === 0
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                              }`}
                            >
                              {item.remainingQty}
                            </span>
                            <span className="text-[10px] text-muted-foreground mt-0.5">
                              {item.remainingQty === 0 ? 'Full' : 'Balance'}
                            </span>
                          </div>
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
                    );
                  })
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
                  <span>Total Ordered in PO:</span>
                  <span className="font-semibold text-foreground">
                    {lineItems.reduce((acc, i) => acc + (Number(i.orderedQty) || 0), 0)} units
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Previously Delivered:</span>
                  <span className="font-semibold text-muted-foreground">
                    {lineItems.reduce((acc, i) => acc + (Number(i.deliveredQty) || 0), 0)} units
                  </span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Transporter:</span>
                  <span className="font-semibold text-foreground">{transporterName || transportMode}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-border/60 text-base">
                  <span className="font-bold text-foreground">Delivering in this Challan:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {lineItems.reduce((acc, i) => acc + (Number(i.quantityToBeDelivered) || 0), 0)} units
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Remaining PO Balance:</span>
                  <span className="font-bold text-foreground font-mono">
                    {lineItems.reduce((acc, i) => acc + (Number(i.remainingQty) || 0), 0)} units
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <Button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={submitting || savingDraft || isInvoiceOnly || selectedPOSummary.isFullyDispatched}
                title={selectedPOSummary.isFullyDispatched ? 'All items for this Purchase Order have already been fully dispatched' : undefined}
                className="w-full py-2.5 gap-2 shadow-sm font-bold"
              >
                <Send className="size-4" /> {submitting ? 'Submitting Challan…' : 'Submit Dispatch Note'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={submitting || savingDraft || isInvoiceOnly || selectedPOSummary.isFullyDispatched}
                title={selectedPOSummary.isFullyDispatched ? 'All items for this Purchase Order have already been fully dispatched' : undefined}
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
            items: lineItems.filter(li => Number(li.quantityToBeDelivered) > 0).map((li) => ({
              id: li.id,
              itemCode: li.itemCode,
              itemName: li.itemName,
              poQty: li.orderedQty,
              orderedQty: li.orderedQty,
              deliveredQty: li.deliveredQty,
              quantityToBeDelivered: li.quantityToBeDelivered,
              dispatchedQty: li.quantityToBeDelivered,
              remainingQty: li.remainingQty,
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
