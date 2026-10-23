import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { dispatchNoteService, type DispatchNoteItem } from '../../services/dispatchNoteService';
import {
  ArrowLeft,
  Truck,
  PackageCheck,
  Send,
  Upload,
  Paperclip,
  X,
  Save,
  Printer,
  Calendar,
  Building2,
  FileText,
  Clock,
  Plus,
  Trash2,
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
  const [dispatchFromAddress, setDispatchFromAddress] = useState<string>('');
  const [shippingAddress, setShippingAddress] = useState<string>('');
  const [totalPackages, setTotalPackages] = useState<number | ''>(1);
  const [totalWeight, setTotalWeight] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

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

  // Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
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
        shippingAddress,
        dispatchFromAddress,
        totalPackages: Number(totalPackages) || undefined,
        totalWeight: totalWeight || undefined,
        notes,
        items: itemsPayload,
        attachments,
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
                {poList.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} — {formatAmount(po.totalAmount, companyDefaultCurrency)} ({po.status})
                  </option>
                ))}
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

            {/* Driver Phone */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Driver Contact Phone
              </label>
              <Input
                type="text"
                placeholder="e.g. +91 98765 43210"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                className="text-sm bg-background"
              />
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
              Delivery Remarks & Scanned Delivery Challan
            </h3>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Special Delivery / Handling Instructions
              </label>
              <Textarea
                rows={3}
                placeholder="Add any instructions for warehouse receiving dock, unloading notes, or temperature handling requirements..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-sm bg-background"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Attachments (Scanned Challan / LR Copy)
              </label>
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-border/70 rounded-xl hover:border-primary/50 cursor-pointer bg-muted/20 transition-colors">
                <Upload className="size-6 text-muted-foreground mb-1.5" />
                <span className="text-xs font-semibold text-foreground">Click to upload document</span>
                <span className="text-[11px] text-muted-foreground">PDF, PNG, JPG (up to 10MB)</span>
                <input type="file" multiple accept=".pdf,.png,.jpg" onChange={handleFileUpload} hidden />
              </label>

              {attachments.length > 0 && (
                <div className="space-y-2 mt-3">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between p-2.5 bg-muted/40 border border-border/60 rounded-lg text-xs"
                    >
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
                disabled={submitting || savingDraft}
                className="w-full py-2.5 gap-2 shadow-sm font-bold"
              >
                <Send className="size-4" /> {submitting ? 'Submitting Challan…' : 'Submit Dispatch Note'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSubmit(true)}
                disabled={submitting || savingDraft}
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
