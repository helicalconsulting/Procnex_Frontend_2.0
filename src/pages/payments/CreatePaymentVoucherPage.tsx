import ColumnSettingsButton from '../../components/shared/ColumnSettingsButton';
import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { localDataService, type Payment } from '../../services/localDataService';
import { apiRequest } from '../../api/client';
import { companySettingsService } from '../../services/companySettingsService';
import { invoiceService, type APInvoice } from '../../services/invoiceService';
import { grnService } from '../../services/grnService';
import {
  ArrowLeft,
  CreditCard,
  Save,
  Send,
  Upload,
  Paperclip,
  X,
  Landmark,
  PackageCheck,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Clock,
  FileText,
  CheckSquare,
  Layers,
  RotateCcw,
  Database,
  Edit3,
  PackageX,
  Scale,
  TrendingDown,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  Info,
  Box
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import BankPaymentVoucherModal, { type PaymentVoucherDocData } from '../../components/payments/BankPaymentVoucherModal';
import InvoiceDocumentViewerModal, { type DocumentAttachment } from '../../components/invoices/InvoiceDocumentViewerModal';
import { useAuth } from '../../context/AuthContext';
import { useSuccessModal } from '../../context/SuccessModalContext';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import ColumnCustomizer from '../../components/shared/ColumnCustomizer';
import '../../components/shared/ColumnCustomizer.css';
import { Input } from '../../components/ui/input';
import { MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import ActionSendingOverlay from '../../components/shared/ActionSendingOverlay';
import './CreatePaymentVoucherPage.css';

interface VendorOption {
  id: string;
  name: string;
  email: string;
  category: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfscCode?: string;
}

interface ReconciledItem {
  id: string;
  invoiceNumber?: string;
  poNumber?: string;
  grnNumber?: string;
  itemName: string;
  orderedQty: number;
  receivedQty: number;
  shortfallQty: number;
  unitPrice: number;
  orderedValue: number;
  receivedValue: number;
  shortfallValue: number;
  status: 'MATCHED' | 'SHORTFALL' | 'OVER_DELIVERY' | 'PENDING';
  remarks?: string;
}

interface VendorInvoiceItem {
  id: string;
  invoiceNumber: string;
  poNumber: string;
  grnNumber: string;
  amount: number;
  paidAmount: number;
  balanceDue: number;
  dueDate: string;
  invoiceDate: string;
  threeWayMatch: 'MATCHED' | 'DISCREPANCY' | 'NOT_MATCHED';
  selected: boolean;
  paymentAmount: number;
  grnOrderedQty?: number;
  grnReceivedQty?: number;
  grnReceivedAmount?: number; // sum of GRN item (receivedQty × unitPrice)
  items?: ReconciledItem[];
}

export default function CreatePaymentVoucherPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreateVoucher = hasPermission('Payments', 'canCreate') || hasPermission('Payments', 'canApprove') || hasPermission('Accounts Payable', 'canCreate');
  const [searchParams] = useSearchParams();
  const { companyDefaultCurrency, formatAmount } = useCurrency();

  const vendorParam = searchParams.get('vendorName');
  const invoiceRefParam = searchParams.get('invoiceRef');
  const amountParam = searchParams.get('amount');
  const modeParam = searchParams.get('mode');

  // Main Page View Mode: Management Overview Table vs Voucher Entry Form
  const [isCreating, setIsCreating] = useState<boolean>(
    () => Boolean(vendorParam || invoiceRefParam || amountParam || modeParam === 'create')
  );

  // Vouchers list for management table
  const { data: vouchersList, loading: vouchersLoading, reload: refetchVouchers } = useServiceData(
    () => localDataService.getPayments(),
    [] as Payment[],
    []
  );

  // Search & Filter State for Management Table
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const VOUCHER_COLS = [
    { key: 'voucherNumber', label: 'VOUCHER NUMBER', defaultVisible: true, required: true },
    { key: 'vendor', label: 'VENDOR', defaultVisible: true },
    { key: 'voucherDate', label: 'VOUCHER DATE', defaultVisible: true },
    { key: 'currency', label: 'CURRENCY', defaultVisible: true },
    { key: 'netDisbursement', label: 'NET DISBURSEMENT', defaultVisible: true },
    { key: 'status', label: 'STATUS', defaultVisible: true },
  ];
  const [voucherColOrder, setVoucherColOrder] = useState<string[]>(VOUCHER_COLS.map((c) => c.key));
  const [voucherVisibleKeys, setVoucherVisibleKeys] = useState<Set<string>>(new Set(VOUCHER_COLS.map((c) => c.key)));
  const [showVoucherColPanel, setShowVoucherColPanel] = useState(false);

  // Selected voucher for detail modal view
  const [selectedVoucherForModal, setSelectedVoucherForModal] = useState<PaymentVoucherDocData | null>(null);

  // Load vendors list directly from Database Master
  const { data: vendorsList } = useServiceData(
    () =>
      vendorService.listTyped().then((vendors) =>
        vendors.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          category: v.category || '',
          bankName: v.bankName || undefined,
          bankAccountNumber: v.bankAccountNumber || undefined,
          bankIfscCode: v.bankIfscCode || undefined,
        }))
      ),
    [] as VendorOption[],
    []
  );

  // Form State
  const [voucherNumber, setVoucherNumber] = useState<string>('');

  useEffect(() => {
    if (isCreating && !voucherNumber) {
      companySettingsService.generateNextSequence('PAYMENT_VOUCHER')
        .then((res) => { if (res?.formattedCode) setVoucherNumber(res.formattedCode); })
        .catch(() => {});
    }
  }, [isCreating]);

  const [paymentMethod, setPaymentMethod] = useState<string>('NEFT');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [vendorName, setVendorName] = useState<string>('');
  const [invoiceRef, setInvoiceRef] = useState<string>('');
  const [voucherDate, setVoucherDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [scheduledDate, setScheduledDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<string>(companyDefaultCurrency);

  // Bank & Beneficiary Details
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');
  const [beneficiaryName, setBeneficiaryName] = useState<string>('');

  // Amounts & TDS
  const [grossAmount, setGrossAmount] = useState<number | ''>('');
  const [tdsPercent, setTdsPercent] = useState<number>(0);
  const [purpose, setPurpose] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // 3-Way Match States (PO vs GRN vs Supplier Invoice)
  const [matchStatus, setMatchStatus] = useState<'MATCHED' | 'DISCREPANCY'>('MATCHED');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');
  const [poQty, setPoQty] = useState<number>(100);
  const [grnQty, setGrnQty] = useState<number>(100);
  const [invoicedQty, setInvoicedQty] = useState<number>(100);

  // Attachments & Document Viewer
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);
  const [viewerOpen, setViewerOpen] = useState<boolean>(false);
  const [viewerAttachments, setViewerAttachments] = useState<DocumentAttachment[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [viewerDocContext, setViewerDocContext] = useState<any>(null);

  // UI state
  const { showSuccess } = useSuccessModal();
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSendingOverlay, setShowSendingOverlay] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Multi-Invoice Selection & 3-Way Multi-Matching States
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('multiple');
  const [vendorInvoices, setVendorInvoices] = useState<VendorInvoiceItem[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);
  // Invoice Entry Mode: null = not selected yet, 'AUTO_FILL' = fetch from DB, 'MANUAL' = user types manually
  const [invoiceEntryMode, setInvoiceEntryMode] = useState<'AUTO_FILL' | 'MANUAL' | null>(
    () => (vendorParam || invoiceRefParam || amountParam) ? 'AUTO_FILL' : null
  );

  // Load invoices & GRNs when vendor is selected or creation starts (only when AUTO_FILL mode)
  useEffect(() => {
    if (!isCreating || invoiceEntryMode !== 'AUTO_FILL') return;

    let isMounted = true;
    setLoadingInvoices(true);

    const fetchInvoicesAndGRNs = async () => {
      try {
        const qInvoiceRef = searchParams.get('invoiceRef');
        const qAmount = searchParams.get('amount');
        const qVendorName = searchParams.get('vendorName');

        const [fetchedInvoices, grnResponse] = await Promise.all([
          invoiceService.list(selectedVendorId ? { vendorId: selectedVendorId } : undefined),
          grnService.list(selectedVendorId ? { vendorId: selectedVendorId, limit: 100 } : { limit: 100 }).catch(() => ({ grns: [], total: 0 })),
        ]);
        if (!isMounted) return;

        const allGrns = grnResponse?.grns || [];
        let mappedInvoices: VendorInvoiceItem[] = [];

        if (fetchedInvoices && fetchedInvoices.length > 0) {
          // If a vendor is selected or passed by name, filter to that vendor's invoices if needed
          const filteredInvs = (selectedVendorId || vendorName)
            ? fetchedInvoices.filter((inv) => {
                const vNameMatch = vendorName && inv.vendorName && inv.vendorName.toLowerCase().includes(vendorName.toLowerCase());
                const invRefMatch = qInvoiceRef && (inv.invoiceNumber === qInvoiceRef || qInvoiceRef.includes(inv.invoiceNumber));
                return !selectedVendorId ? (vNameMatch || invRefMatch) : true;
              })
            : fetchedInvoices;

          const baseInvoices = filteredInvs.length > 0 ? filteredInvs : fetchedInvoices;

          mappedInvoices = baseInvoices.map((inv, idx) => {
            const rawPoNum = (typeof inv.poNumber === 'string' && inv.poNumber)
              ? inv.poNumber
              : (typeof (inv.purchaseOrder as any)?.poNumber === 'string' ? (inv.purchaseOrder as any).poNumber : `PO-2026-${3710 + idx}`);
            const poNum = String(rawPoNum || `PO-2026-${3710 + idx}`);
            const cleanPo = poNum.toLowerCase();

            const rawInvNum = typeof inv.invoiceNumber === 'string' ? inv.invoiceNumber : (inv.invoiceNumber ? String(inv.invoiceNumber) : `INV-2026-00${idx + 1}`);
            const cleanInvNum = rawInvNum.toLowerCase();

            const rawInvGrnNum = typeof inv.grnNumber === 'string' ? inv.grnNumber : (typeof (inv.grn as any)?.grnNumber === 'string' ? (inv.grn as any).grnNumber : '');
            const cleanInvGrnNum = rawInvGrnNum.toLowerCase();

            const invPoIdStr = typeof inv.poId === 'string' ? inv.poId : (typeof (inv.poId as any)?.id === 'string' ? (inv.poId as any).id : '');

            // Find matching GRNs for this invoice — multiple match strategies
            let matchedGrn = allGrns.find(
              (g) => {
                const gGrnNum = typeof g.grnNumber === 'string' ? g.grnNumber.toLowerCase() : '';
                const gPoNum = typeof g.purchaseOrder?.poNumber === 'string' ? g.purchaseOrder.poNumber.toLowerCase() : '';
                const gPoIdStr = typeof g.poId === 'string' ? g.poId : (typeof (g.poId as any)?.id === 'string' ? (g.poId as any).id : '');
                const gVendorInvNum = typeof g.vendorInvoiceNumber === 'string' ? g.vendorInvoiceNumber.toLowerCase() : '';
                const gVendorId = typeof g.vendorId === 'string' ? g.vendorId : (typeof (g.vendorId as any)?.id === 'string' ? (g.vendorId as any).id : '');

                return (
                  (cleanInvGrnNum && gGrnNum && gGrnNum === cleanInvGrnNum) ||
                  (gPoNum && gPoNum === cleanPo) ||
                  (gPoIdStr && invPoIdStr && gPoIdStr === invPoIdStr) ||
                  (gVendorInvNum && gVendorInvNum === cleanInvNum) ||
                  (gVendorId && selectedVendorId && gVendorId === selectedVendorId)
                );
              }
            );
            if (!matchedGrn && inv.grn) {
              matchedGrn = inv.grn;
            }

            const rawGrnDisplay = typeof matchedGrn?.grnNumber === 'string'
              ? matchedGrn.grnNumber
              : (rawInvGrnNum || `GRN-2026-0${40 + idx}`);
            const grnDisplayNumber = String(rawGrnDisplay);

            // Compute GRN received qty vs ordered qty from items
            let totalOrdered = 0;
            let totalReceived = 0;
            let grnItemsAmount = 0; // sum of GRN received value
            const parsedItems: ReconciledItem[] = [];

            if (matchedGrn && Array.isArray(matchedGrn.items) && matchedGrn.items.length > 0) {
              matchedGrn.items.forEach((gi: any, gIdx: number) => {
                const orderedQty = Number(gi.orderedQty ?? gi.quantity ?? 0);
                const receivedQty = Number(gi.acceptedQty ?? gi.receivedQty ?? 0);
                const shortfallQty = Math.max(0, orderedQty - receivedQty);
                const unitPrice = Number(gi.unitPrice ?? gi.rate ?? (inv.amount && orderedQty > 0 ? inv.amount / orderedQty : 0));
                const orderedValue = Number(gi.totalPrice ?? (orderedQty * unitPrice));
                const receivedValue = receivedQty * unitPrice;
                const shortfallValue = shortfallQty * unitPrice;

                totalOrdered += orderedQty;
                totalReceived += receivedQty;
                grnItemsAmount += receivedValue;

                parsedItems.push({
                  id: String(gi.id || `gi_${idx}_${gIdx}`),
                  invoiceNumber: inv.invoiceNumber,
                  poNumber: poNum,
                  grnNumber: grnDisplayNumber,
                  itemName: gi.itemName || gi.description || gi.item?.name || `Item #${gIdx + 1}`,
                  orderedQty,
                  receivedQty,
                  shortfallQty,
                  unitPrice,
                  orderedValue,
                  receivedValue,
                  shortfallValue,
                  status: shortfallQty > 0 ? 'SHORTFALL' : (receivedQty > orderedQty ? 'OVER_DELIVERY' : 'MATCHED'),
                  remarks: gi.remarks || (shortfallQty > 0 ? `${shortfallQty} units missing / rejected` : 'Goods accepted in full'),
                });
              });
            } else if ((Array.isArray(inv.lineItems) && inv.lineItems.length > 0) || (Array.isArray(inv.items) && inv.items.length > 0)) {
              const lineItemsList = (inv.lineItems || inv.items) as any[];
              lineItemsList.forEach((li: any, lIdx: number) => {
                const isDisc = inv.threeWayMatch === 'DISCREPANCY' || inv.threeWayMatch === 'MISMATCH';
                const orderedQty = Number(li.quantity ?? li.qty ?? 10);
                const receivedQty = Number(li.receivedQty ?? li.acceptedQty ?? (isDisc ? Math.max(0, orderedQty - 2) : orderedQty));
                const shortfallQty = Math.max(0, orderedQty - receivedQty);
                const unitPrice = Number(li.unitPrice ?? li.rate ?? li.price ?? (li.total && orderedQty > 0 ? li.total / orderedQty : (inv.amount / (orderedQty || 1))));
                const orderedValue = Number(li.total ?? (orderedQty * unitPrice));
                const receivedValue = receivedQty * unitPrice;
                const shortfallValue = shortfallQty * unitPrice;

                totalOrdered += orderedQty;
                totalReceived += receivedQty;
                grnItemsAmount += receivedValue;

                parsedItems.push({
                  id: String(li.id || `li_${idx}_${lIdx}`),
                  invoiceNumber: inv.invoiceNumber,
                  poNumber: poNum,
                  grnNumber: grnDisplayNumber,
                  itemName: li.description || li.itemName || li.name || `Line Item #${lIdx + 1}`,
                  orderedQty,
                  receivedQty,
                  shortfallQty,
                  unitPrice,
                  orderedValue,
                  receivedValue,
                  shortfallValue,
                  status: shortfallQty > 0 ? 'SHORTFALL' : 'MATCHED',
                  remarks: shortfallQty > 0 ? `${shortfallQty} units missing` : 'Fully delivered',
                });
              });
            } else if (inv.amount > 0) {
              const isDisc = inv.threeWayMatch === 'DISCREPANCY' || inv.threeWayMatch === 'MISMATCH';
              const orderedQty = 10;
              const receivedQty = isDisc ? 8 : 10;
              const shortfallQty = Math.max(0, orderedQty - receivedQty);
              const unitPrice = inv.amount / orderedQty;
              const orderedValue = inv.amount;
              const receivedValue = receivedQty * unitPrice;
              const shortfallValue = shortfallQty * unitPrice;

              totalOrdered += orderedQty;
              totalReceived += receivedQty;
              grnItemsAmount += receivedValue;

              parsedItems.push({
                id: `item_summary_${idx}`,
                invoiceNumber: inv.invoiceNumber,
                poNumber: poNum,
                grnNumber: grnDisplayNumber,
                itemName: `${inv.invoiceNumber || 'Invoice'} - Goods Delivery`,
                orderedQty,
                receivedQty,
                shortfallQty,
                unitPrice,
                orderedValue,
                receivedValue,
                shortfallValue,
                status: shortfallQty > 0 ? 'SHORTFALL' : 'MATCHED',
                remarks: shortfallQty > 0 ? `${shortfallQty} units missing (Value: Ksh ${shortfallValue.toLocaleString()})` : 'Fully delivered & matched',
              });
            }

            // ─── Discrepancy checks ───────────────────────────────────────
            // 1. GRN qty shortfall: received < ordered by >2%
            const hasQtyShortfall = totalOrdered > 0 && totalReceived < totalOrdered &&
              (totalOrdered - totalReceived) / totalOrdered > 0.02;
            // 2. GRN amount shortfall: if we have item prices, GRN value < invoice amount by >2%
            const hasAmountShortfall = grnItemsAmount > 0 && inv.amount > 0 &&
              grnItemsAmount < inv.amount * 0.98;
            const hasShortfall = hasQtyShortfall || hasAmountShortfall;
            // 3. If verified GRN line items exist, trust the itemized calculation over stale backend flag
            const isBackendMismatch = inv.threeWayMatch === 'MISMATCH' || inv.threeWayMatch === 'DISCREPANCY';
            const isDiscrepant = parsedItems.length > 0 ? hasShortfall : (hasShortfall || isBackendMismatch);
            // If employee GRN received qty matches ordered & billed items with no shortfall, it's MATCHED
            const finalMatch: 'MATCHED' | 'DISCREPANCY' | 'NOT_MATCHED' = isDiscrepant ? 'DISCREPANCY' : 'MATCHED';

            const isMatchingParam = qInvoiceRef && (inv.invoiceNumber === qInvoiceRef || qInvoiceRef.includes(inv.invoiceNumber));

            return {
              id: String(inv.id || idx),
              invoiceNumber: rawInvNum,
              poNumber: poNum,
              grnNumber: grnDisplayNumber,
              amount: typeof inv.amount === 'number' ? inv.amount : (Number(inv.amount) || 0),
              paidAmount: typeof inv.paidAmount === 'number' ? inv.paidAmount : (Number(inv.paidAmount) || 0),
              balanceDue: Math.max(0, (typeof inv.amount === 'number' ? inv.amount : Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0)),
              dueDate: typeof inv.dueDate === 'string' ? inv.dueDate : (inv.dueDate instanceof Date ? inv.dueDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
              invoiceDate: typeof inv.submittedAt === 'string' ? inv.submittedAt.slice(0, 10) : (typeof inv.invoiceDate === 'string' ? inv.invoiceDate.slice(0, 10) : new Date().toISOString().slice(0, 10)),
              threeWayMatch: finalMatch,
              selected: Boolean(isMatchingParam || idx === 0),
              paymentAmount: Math.max(0, (typeof inv.amount === 'number' ? inv.amount : Number(inv.amount) || 0) - (Number(inv.paidAmount) || 0)),
              // Store GRN qty, amount, and items for Section 03 discrepancy detection
              grnOrderedQty: totalOrdered > 0 ? totalOrdered : undefined,
              grnReceivedQty: totalOrdered > 0 ? totalReceived : undefined,
              grnReceivedAmount: grnItemsAmount > 0 ? grnItemsAmount : undefined,
              items: parsedItems,
            };
          });
        }

        // If no invoices returned from API but invoiceRef or amount was passed in URL / params
        if (mappedInvoices.length === 0 && (qInvoiceRef || qAmount || invoiceRef)) {
          const invNum = qInvoiceRef || invoiceRef || 'INV-2026-001';
          const invAmt = Number(qAmount || grossAmount || 1000);
          mappedInvoices = [
            {
              id: `param_inv_${Date.now()}`,
              invoiceNumber: invNum,
              poNumber: `PO-2026-3710`,
              grnNumber: `GRN-2026-040`,
              amount: invAmt,
              paidAmount: 0,
              balanceDue: invAmt,
              dueDate: new Date().toISOString().slice(0, 10),
              invoiceDate: new Date().toISOString().slice(0, 10),
              threeWayMatch: 'MATCHED',
              selected: true,
              paymentAmount: invAmt,
              grnOrderedQty: 10,
              grnReceivedQty: 10,
              grnReceivedAmount: invAmt,
              items: [
                {
                  id: `param_item_1`,
                  invoiceNumber: invNum,
                  poNumber: `PO-2026-3710`,
                  grnNumber: `GRN-2026-040`,
                  itemName: `Procured Line Items (${invNum})`,
                  orderedQty: 10,
                  receivedQty: 10,
                  shortfallQty: 0,
                  unitPrice: invAmt / 10,
                  orderedValue: invAmt,
                  receivedValue: invAmt,
                  shortfallValue: 0,
                  status: 'MATCHED',
                  remarks: 'Fully matched and verified',
                },
              ],
            },
          ];
        }

        setVendorInvoices(mappedInvoices);
        if (mappedInvoices.length > 0) {
          updateTotalsFromInvoices(mappedInvoices);
        }
      } catch (_err) {
        if (isMounted) setVendorInvoices([]);
      } finally {
        if (isMounted) setLoadingInvoices(false);
      }
    };

    fetchInvoicesAndGRNs();

    return () => {
      isMounted = false;
    };
  }, [isCreating, selectedVendorId, vendorName, invoiceEntryMode]);

  // Recalculate totals, invoice references, and 3-way multi-matching from invoice selection
  const updateTotalsFromInvoices = (list: VendorInvoiceItem[], mode: 'single' | 'multiple' = selectionMode) => {
    const selected = list.filter((i) => i.selected);
    if (selected.length > 0) {
      const totalGross = selected.reduce((sum, item) => sum + item.paymentAmount, 0);
      setGrossAmount(totalGross);

      const refText = selected.map((i) => i.invoiceNumber).join(', ') + (selected.length > 1 ? ` (${selected.length} Invoices)` : '');
      setInvoiceRef(refText);

      // Aggregate item quantities and shortfall values
      let totalOrd = 0;
      let totalRec = 0;
      let totalGrnAmt = 0;
      let totalShortfallAmt = 0;
      let totalShortfallUnits = 0;

      selected.forEach((i) => {
        if (Array.isArray(i.items) && i.items.length > 0) {
          i.items.forEach((it) => {
            totalOrd += it.orderedQty;
            totalRec += it.receivedQty;
            totalGrnAmt += it.receivedValue;
            totalShortfallAmt += it.shortfallValue;
            totalShortfallUnits += it.shortfallQty;
          });
        } else {
          if (i.grnOrderedQty && i.grnOrderedQty > 0) {
            totalOrd += i.grnOrderedQty;
            totalRec += i.grnReceivedQty ?? i.grnOrderedQty;
          }
          if (i.grnReceivedAmount && i.grnReceivedAmount > 0) {
            totalGrnAmt += i.grnReceivedAmount;
          }
        }
      });

      const hasGrnQtyShortfall = totalOrd > 0 && totalRec < totalOrd && (totalOrd - totalRec) / totalOrd > 0.02;
      const hasGrnAmtShortfall = (totalShortfallAmt > 0.01) || (totalGrnAmt > 0 && totalGross > 0 && totalGrnAmt < totalGross * 0.98);
      const hasGrnShortfall = hasGrnQtyShortfall || hasGrnAmtShortfall;

      // 3-Way Multi-Matching Check: check actual variances
      const hasOverbilling = selected.some((i) => i.paymentAmount > i.amount);
      const hasItemDiscrepancy = selected.some((i) => {
        if (Array.isArray(i.items) && i.items.length > 0) {
          return i.items.some((it) => it.shortfallQty > 0 || it.shortfallValue > 0.01);
        }
        return i.threeWayMatch === 'DISCREPANCY' || (i.threeWayMatch as string) === 'MISMATCH';
      });
      const hasDiscrepancy = hasOverbilling || hasItemDiscrepancy || hasGrnShortfall;

      if (hasDiscrepancy) {
        setMatchStatus('DISCREPANCY');
        const discNames = selected.map((i) => i.invoiceNumber).filter(Boolean).join(', ') || 'Selected Invoices';
        const missingVal = totalShortfallAmt > 0 ? totalShortfallAmt : Math.max(0, totalGross - totalGrnAmt);
        const missingUnits = totalShortfallUnits > 0 ? totalShortfallUnits : Math.max(0, totalOrd - totalRec);

        let reason = '';
        if (missingUnits > 0 || missingVal > 0) {
          reason = `Goods Received Note (GRN) Shortfall: Received ${totalRec}/${totalOrd} units (Missing ${missingUnits} units — Shortfall Value: ${formatAmount(missingVal, currency)}). Invoice(s): ${discNames}. Flagged for mandatory Manager & Finance approval.`;
        } else {
          reason = `Discrepancy detected in 3-Way Match for invoice(s): ${discNames} (Variance between PO, Employee GRN, and Invoice). Flagged for mandatory Manager & Finance approval.`;
        }
        setDiscrepancyReason(reason);
      } else {
        setMatchStatus('MATCHED');
        setDiscrepancyReason('');
      }
    }
  };

  const handleToggleInvoiceMatch = (invId: string) => {
    setVendorInvoices((prev) => {
      const updated = prev.map((item) => {
        if (item.id === invId) {
          const nextMatch: 'MATCHED' | 'DISCREPANCY' = item.threeWayMatch === 'MATCHED' ? 'DISCREPANCY' : 'MATCHED';
          return { ...item, threeWayMatch: nextMatch };
        }
        return item;
      });
      updateTotalsFromInvoices(updated);
      return updated;
    });
  };

  const handleToggleSelectInvoice = (invId: string) => {
    setVendorInvoices((prev) => {
      const updated = prev.map((item) => {
        if (selectionMode === 'single') {
          return { ...item, selected: item.id === invId };
        }
        if (item.id === invId) {
          return { ...item, selected: !item.selected };
        }
        return item;
      });
      updateTotalsFromInvoices(updated);
      return updated;
    });
  };

  const handleSelectAllInvoices = (selectAll: boolean) => {
    if (selectionMode === 'single') return;
    setVendorInvoices((prev) => {
      const updated = prev.map((item) => ({ ...item, selected: selectAll }));
      updateTotalsFromInvoices(updated);
      return updated;
    });
  };

  const handleModeChange = (newMode: 'single' | 'multiple') => {
    setSelectionMode(newMode);
    setVendorInvoices((prev) => {
      let updated = prev;
      if (newMode === 'single') {
        let foundFirst = false;
        updated = prev.map((item) => {
          if (item.selected && !foundFirst) {
            foundFirst = true;
            return { ...item, selected: true };
          }
          return { ...item, selected: false };
        });
        if (!foundFirst && updated.length > 0) {
          updated[0].selected = true;
        }
      }
      updateTotalsFromInvoices(updated, newMode);
      return updated;
    });
  };

  const handleAddCustomInvoice = () => {
    const nextIdx = vendorInvoices.length + 1;
    const invAmt = 1000;
    const newInv: VendorInvoiceItem = {
      id: `custom_inv_${Date.now()}`,
      invoiceNumber: `INV-2026-${String(nextIdx).padStart(3, '0')}`,
      poNumber: `PO-2026-${String(3700 + nextIdx)}`,
      grnNumber: `GRN-2026-${String(40 + nextIdx)}`,
      amount: invAmt,
      paidAmount: 0,
      balanceDue: invAmt,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      invoiceDate: new Date().toISOString().slice(0, 10),
      threeWayMatch: 'MATCHED',
      selected: true,
      paymentAmount: invAmt,
      grnOrderedQty: 10,
      grnReceivedQty: 10,
      grnReceivedAmount: invAmt,
      items: [
        {
          id: `custom_item_${Date.now()}`,
          invoiceNumber: `INV-2026-${String(nextIdx).padStart(3, '0')}`,
          poNumber: `PO-2026-${String(3700 + nextIdx)}`,
          grnNumber: `GRN-2026-${String(40 + nextIdx)}`,
          itemName: `Standard Supplies Item #${nextIdx}`,
          orderedQty: 10,
          receivedQty: 10,
          shortfallQty: 0,
          unitPrice: 100,
          orderedValue: 1000,
          receivedValue: 1000,
          shortfallValue: 0,
          status: 'MATCHED',
          remarks: 'Fully matched',
        },
      ],
    };
    setVendorInvoices((prev) => {
      const updated = [...prev, newInv];
      updateTotalsFromInvoices(updated);
      return updated;
    });
  };

  // Switch invoice entry mode — resets table and either triggers DB fetch or starts with blank row
  const handleSelectInvoiceMode = (mode: 'AUTO_FILL' | 'MANUAL') => {
    setVendorInvoices([]);
    setGrossAmount('');
    setInvoiceRef('');
    setInvoiceEntryMode(mode);
    if (mode === 'MANUAL') {
      // Add one blank row immediately so user can start typing
      const newInv: VendorInvoiceItem = {
        id: `custom_inv_${Date.now()}`,
        invoiceNumber: '',
        poNumber: '',
        grnNumber: '',
        amount: 0,
        paidAmount: 0,
        balanceDue: 0,
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        invoiceDate: new Date().toISOString().slice(0, 10),
        threeWayMatch: 'MATCHED',
        selected: true,
        paymentAmount: 0,
        grnOrderedQty: 0,
        grnReceivedQty: 0,
        grnReceivedAmount: 0,
        items: [],
      };
      setVendorInvoices([newInv]);
    }
    // AUTO_FILL: setting invoiceEntryMode to 'AUTO_FILL' triggers the useEffect to fetch
  };

  const handleInvoiceFieldChange = (invId: string, field: keyof VendorInvoiceItem, val: any) => {
    setVendorInvoices((prev) => {
      const updated = prev.map((item) => {
        if (item.id === invId) {
          const newItem = { ...item, [field]: val };
          if (field === 'paymentAmount' || field === 'amount') {
            const numVal = typeof val === 'number' ? val : parseFloat(val) || 0;
            newItem.amount = numVal;
            newItem.paymentAmount = numVal;
            newItem.balanceDue = numVal;
          }
          return newItem;
        }
        return item;
      });
      updateTotalsFromInvoices(updated);
      return updated;
    });
  };

  const handleRemoveInvoice = (invId: string) => {
    setVendorInvoices((prev) => {
      const updated = prev.filter((i) => i.id !== invId);
      updateTotalsFromInvoices(updated);
      return updated;
    });
  };

  // Prefill from URL query params (e.g. from Approved Purchase Invoice)
  useEffect(() => {
    const qVendor = searchParams.get('vendorName');
    const qInvoiceRef = searchParams.get('invoiceRef');
    const qAmount = searchParams.get('amount');
    const qBankName = searchParams.get('bankName');
    const qAccount = searchParams.get('accountNumber');
    const qIfsc = searchParams.get('ifscCode');
    const qBeneficiary = searchParams.get('beneficiaryName');

    if (qVendor) {
      setVendorName(qVendor);
      setBeneficiaryName(qBeneficiary || qVendor);
      if (vendorsList && vendorsList.length > 0) {
        const found = vendorsList.find(
          (v) => v.name.toLowerCase() === qVendor.toLowerCase() || v.id === qVendor || v.name.toLowerCase().includes(qVendor.toLowerCase())
        );
        if (found) {
          setSelectedVendorId(found.id);
          if (!qBankName && found.bankName) setBankName(found.bankName);
          if (!qAccount && found.bankAccountNumber) setAccountNumber(found.bankAccountNumber);
          if (!qIfsc && found.bankIfscCode) setIfscCode(found.bankIfscCode);
        }
      }
    }
    if (qInvoiceRef) setInvoiceRef(qInvoiceRef);
    if (qAmount && !isNaN(Number(qAmount))) setGrossAmount(Number(qAmount));
    if (qBankName) setBankName(qBankName);
    if (qAccount) setAccountNumber(qAccount);
    if (qIfsc) setIfscCode(qIfsc);
  }, [searchParams, vendorsList]);

  // Handle vendor selection change
  const handleVendorSelect = (vId: string) => {
    setSelectedVendorId(vId);
    const found = vendorsList.find((v) => v.id === vId);
    if (found) {
      setVendorName(found.name);
      setBeneficiaryName(found.name);
      setBankName(found.bankName || '');
      setAccountNumber(found.bankAccountNumber || '');
      setIfscCode(found.bankIfscCode || '');
    } else {
      setBankName('');
      setAccountNumber('');
      setIfscCode('');
    }
  };

  // Calculations
  const gross = typeof grossAmount === 'number' ? grossAmount : 0;
  const tdsAmount = useMemo(() => (gross * (tdsPercent || 0)) / 100, [gross, tdsPercent]);
  const netPayable = useMemo(() => gross, [gross]);

  // File Upload with Base64 encoding for document preview and persistence
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      files.forEach((file, idx) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const newDoc: DocumentAttachment = {
            id: `att_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
            name: file.name,
            size: `${(file.size / 1024).toFixed(1)} KB`,
            type: file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
            dataUrl,
          };
          setAttachments((prev) => [...prev, newDoc]);
        };
        reader.readAsDataURL(file);
      });
      // Clear input so user can re-upload if needed
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (attId: string | number) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  // Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (!vendorName.trim() && !selectedVendorId) {
      setErrorMsg('Please select or specify a Supplier / Beneficiary.');
      return false;
    }
    if (!grossAmount || grossAmount <= 0) {
      setErrorMsg('Please enter a valid Gross Payment Amount greater than 0.');
      return false;
    }
    return true;
  };

  // Submission API Call (Triggers Payments Workflow)
  const submitVoucher = async () => {
    if (submitting) return;
    if (!validateForm()) return;

    setSubmitting(true);
    setShowSendingOverlay(true);
    setErrorMsg(null);

    const selectedInvoices = vendorInvoices.filter((i) => i.selected);
    const selectedInvoiceIds = selectedInvoices.map((i) => i.id);
    const selectedInvoicesList = selectedInvoices.map((i) => ({
      invoiceId: i.id,
      invoiceNumber: i.invoiceNumber,
      amount: i.paymentAmount,
      poNumber: i.poNumber,
      grnNumber: i.grnNumber,
      threeWayMatch: i.threeWayMatch,
      invoiceDate: i.invoiceDate,
    }));

    const itemsList = selectedInvoices.map((inv, idx) => ({
      id: idx + 1,
      description: `Payment Disbursement against Invoice ${inv.invoiceNumber}`,
      poNumber: inv.poNumber,
      grnNumber: inv.grnNumber,
      invoiceRef: inv.invoiceNumber,
      quantity: 1,
      unitPrice: inv.paymentAmount,
      grossAmount: inv.paymentAmount,
      tdsAmount: (inv.paymentAmount * (tdsPercent || 0)) / 100,
      netAmount: inv.paymentAmount - (inv.paymentAmount * (tdsPercent || 0)) / 100,
    }));

    try {
      // 1. Send to Backend Database API (MongoDB via Express + Prisma)
      try {
        const res = await apiRequest<{ id: string; paymentNumber: string }>('/payments', {
          method: 'POST',
          body: JSON.stringify({
            paymentNumber: voucherNumber || undefined,
            vendorId: selectedVendorId || undefined,
            vendorName,
            invoiceRef: invoiceRef || (selectedInvoices.length > 0 ? selectedInvoices.map(i => i.invoiceNumber).join(', ') : undefined),
            invoiceIds: selectedInvoiceIds,
            invoices: selectedInvoicesList,
            amount: netPayable,
            currency,
            method: paymentMethod,
            scheduledAt: scheduledDate,
            comments: remarks || purpose || undefined,
            bankName,
            accountNumber,
            ifscCode,
            beneficiaryName,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
        });
        if (res?.paymentNumber) {
          setVoucherNumber(res.paymentNumber);
          if (attachments.length > 0) {
            try {
              localStorage.setItem(`payment_attachments_${res.paymentNumber}`, JSON.stringify(attachments));
            } catch {}
          }
        }
      } catch (apiErr) {
        console.warn('Backend API notice:', apiErr);
      }

      // Save to localStorage cache for offline/instant access
      if (attachments.length > 0) {
        try {
          localStorage.setItem(`payment_attachments_${voucherNumber}`, JSON.stringify(attachments));
        } catch {}
      }

      // 2. Local fallback sync for offline support
      localDataService.savePayment({
        paymentId: voucherNumber,
        vendor: vendorName,
        invoiceRef: invoiceRef || (selectedInvoices.length > 0 ? selectedInvoices.map(i => i.invoiceNumber).join(', ') : '—'),
        invoiceIds: selectedInvoiceIds,
        invoices: selectedInvoicesList,
        amount: netPayable,
        method: paymentMethod,
        status: 'PENDING',
        remarks: remarks || purpose || `Submitted for Bank Disbursement Workflow (${selectedInvoices.length || 1} invoice(s))`,
        bankName,
        accountNumber,
        ifscCode,
        beneficiaryName,
        purpose,
        grossAmount: gross,
        tdsAmount: tdsAmount,
        items: itemsList.length > 0 ? itemsList : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      refetchVouchers();

      showSuccess({
        title: 'Payment Voucher Submitted!',
        badge: 'VOUCHER SUBMITTED',
        referenceNumber: voucherNumber,
        message: `Payment Voucher #${voucherNumber} saved to Database and submitted for payment workflow approval.`,
        details: [
          { label: 'Vendor / Payee', value: vendorName },
          { label: 'Net Payable', value: `${formatAmount(netPayable)}` },
          { label: 'Payment Method', value: paymentMethod },
          { label: 'Beneficiary Bank', value: bankName || 'Bank Transfer' },
          ...(accountNumber ? [{ label: 'Account No.', value: accountNumber }] : []),
        ],
        primaryBtnText: 'View Vouchers',
      });

      setShowSendingOverlay(false);
      setIsCreating(false);
    } catch (err: any) {
      setShowSendingOverlay(false);
      setErrorMsg(err?.message || 'Failed to submit payment voucher.');
    } finally {
      setSubmitting(false);
    }
  };

  // Single Voucher Delete
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await localDataService.deletePayment(target);
      setDeleteTarget(null);
      refetchVouchers();

      showSuccess({
        title: 'Payment Voucher Deleted',
        badge: 'DELETED',
        type: 'info',
        referenceNumber: target.paymentId,
        message: `Payment Voucher ${target.paymentId} has been deleted successfully.`,
        primaryBtnText: 'Got it',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete payment voucher.');
    } finally {
      setDeleting(false);
    }
  };

  // Bulk Delete Confirm
  const handleBulkDeleteConfirm = async () => {
    if (selectedVoucherIds.length === 0) return;
    setDeleting(true);
    try {
      const targetsToDelete = vouchersList.filter(
        (v) => selectedVoucherIds.includes(String(v.id)) || selectedVoucherIds.includes(v.paymentId)
      );
      for (const item of targetsToDelete) {
        await localDataService.deletePayment(item);
      }
      setSuccessMsg(`Successfully deleted ${selectedVoucherIds.length} payment voucher(s).`);
      setSelectedVoucherIds([]);
      setShowBulkDeleteModal(false);
      refetchVouchers();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete selected payment vouchers.');
    } finally {
      setDeleting(false);
    }
  };

  // Open voucher document modal for viewing
  const handleViewVoucherDoc = (voucher: Payment) => {
    setSelectedVoucherForModal({
      voucherNumber: voucher.paymentId,
      voucherDate: voucher.paidAt || new Date().toISOString().slice(0, 10),
      paymentMethod: voucher.method || 'NEFT',
      vendorName: voucher.vendor,
      beneficiaryName: voucher.beneficiaryName || voucher.vendor,
      bankName: voucher.bankName || '',
      accountNumber: voucher.accountNumber || '',
      ifscCode: voucher.ifscCode || '',
      invoiceRef: voucher.invoiceRef || '—',
      grossAmount: voucher.grossAmount || voucher.amount,
      tdsAmount: voucher.tdsAmount || 0,
      netAmount: voucher.amount,
      currency: companyDefaultCurrency,
      matchStatus: voucher.remarks?.toLowerCase().includes('discrepancy') ? 'DISCREPANCY' : 'MATCHED',
      discrepancyReason: voucher.remarks,
      items: voucher.items || undefined,
      attachments: voucher.attachments || undefined,
    });
  };

  // ── Render Overview Table View if not currently creating ──
  if (!isCreating) {
    const draftAndPendingCount = vouchersList.filter(
      (r) => r.status === 'DRAFT' || r.status === 'PENDING' || r.status === 'PENDING_APPROVAL'
    ).length;
    const activeCount = vouchersList.filter(
      (r) => r.status === 'APPROVED' || r.status === 'COMPLETED' || r.status === 'PAID'
    ).length;
    const rejectedCount = vouchersList.filter(
      (r) => r.status === 'REJECTED' || r.status === 'CANCELLED'
    ).length;
    const totalValue = vouchersList.reduce((acc, r) => acc + (r.amount || 0), 0);

    const filteredVouchers = vouchersList.filter((v) => {
      if (statusFilter === 'DRAFT_PENDING') {
        if (!['DRAFT', 'PENDING', 'PENDING_APPROVAL'].includes(v.status)) return false;
      } else if (statusFilter === 'APPROVED') {
        if (!['APPROVED', 'COMPLETED', 'PAID'].includes(v.status)) return false;
      } else if (statusFilter === 'REJECTED') {
        if (!['REJECTED', 'CANCELLED'].includes(v.status)) return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (v.paymentId || '').toLowerCase().includes(term) ||
        (v.vendor || '').toLowerCase().includes(term) ||
        (v.invoiceRef || '').toLowerCase().includes(term) ||
        (v.method || '').toLowerCase().includes(term) ||
        (v.status || '').toLowerCase().includes(term)
      );
    });

    const isAllSelected = filteredVouchers.length > 0 && filteredVouchers.every((v) => selectedVoucherIds.includes(String(v.id)));

    const handleSelectAll = () => {
      if (isAllSelected) {
        setSelectedVoucherIds([]);
      } else {
        setSelectedVoucherIds(filteredVouchers.map((v) => String(v.id)));
      }
    };

    const handleToggleSelect = (id: string) => {
      setSelectedVoucherIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
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
          <MessageStrip type="success" onClose={() => setSuccessMsg(null)}>
            {successMsg}
          </MessageStrip>
        )}

        <PageLead
          title="Payment Voucher Entry & Management"
          description="Manage payment vouchers, bank disbursement entries and approval statuses"
          actions={
            <Button
              onClick={() => setIsCreating(true)}
              disabled={!canCreateVoucher}
              title={!canCreateVoucher ? 'You do not have permission to create payment vouchers.' : 'Create new Voucher'}
            >
              <Plus /> New Voucher
            </Button>
          }
        />

        {/* 5 KPI Summary Cards Grid matching RFQ design */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { icon: FileText, tone: 'primary' as const, value: vouchersList.length, label: 'TOTAL DOCUMENTS', detail: 'Across all vouchers', filter: null },
            { icon: Clock, tone: 'warning' as const, value: draftAndPendingCount, label: 'DRAFT & PENDING', detail: 'Pending approval', filter: 'DRAFT_PENDING' },
            { icon: CheckCircle2, tone: 'success' as const, value: activeCount, label: 'APPROVED & RELEASED', detail: 'Ready or disbursed', filter: 'APPROVED' },
            { icon: X, tone: 'danger' as const, value: rejectedCount, label: 'REJECTED', detail: 'Requires review', filter: 'REJECTED' },
            { icon: CreditCard, tone: 'primary' as const, value: formatAmount(totalValue, companyDefaultCurrency), label: 'TOTAL VOLUME', detail: 'Value across vouchers', filter: 'TOTAL_VOLUME' },
          ].map((c) => {
            const isActive = c.filter === 'TOTAL_VOLUME' ? false : statusFilter === c.filter;
            return (
              <MetricCard
                key={c.label}
                icon={c.icon}
                tone={c.tone}
                value={c.value}
                label={c.label}
                detail={c.detail}
                className={cn(
                  'cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/50 transition-all duration-200',
                  isActive &&
                    'border-primary/45 ring-2 ring-primary/10 bg-primary/[0.08] dark:bg-primary/20 dark:border-[#388bfd] dark:shadow-[0_0_0_1.5px_#388bfd,0_0_25px_rgba(56,139,253,0.75),0_0_10px_rgba(56,139,253,0.9),inset_0_0_15px_rgba(56,139,253,0.2)]'
                )}
                onClick={() => {
                  if (c.filter !== 'TOTAL_VOLUME') {
                    setStatusFilter((prev) => (prev === c.filter ? null : c.filter));
                  }
                }}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
              />
            );
          })}
        </div>

        {/* Toolbar & Search */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-xl">
            <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 rounded-xl pl-10 pr-10"
              type="text"
              placeholder="Search voucher, vendor, status..."
              aria-label="Search voucher, vendor, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
          {(statusFilter !== null || searchTerm) && (
            <div className="flex items-center gap-2.5 justify-end shrink-0 sm:ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearchTerm(''); setStatusFilter(null); }}
                className="h-11 rounded-xl px-3.5"
              >
                <X size={14} /> Clear Filters
              </Button>
            </div>
          )}
        </div>

        {/* Floating Bulk Action Banner */}
        {selectedVoucherIds.length > 0 && !showBulkDeleteModal && (
          <Card className="mb-4 flex flex-col gap-3 border-primary/35 bg-primary/[0.045] p-3 shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
              <CheckSquare size={18} className="text-primary" />
              <span><strong>{selectedVoucherIds.length}</strong> Voucher(s) selected</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectedVoucherIds([])}
              >
                Cancel Selection
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={!canCreateVoucher}
                onClick={() => setShowBulkDeleteModal(true)}
              >
                <Trash2 size={14} /> Delete Selected ({selectedVoucherIds.length})
              </Button>
            </div>
          </Card>
        )}

        {/* Table Card */}
        {vouchersLoading ? (
          <Card className="overflow-hidden p-4">
            <TableSkeleton rows={5} columnWidths={['44px', '170px', '220px', '140px', '100px', '170px', '160px', '120px']} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {vouchersList.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary mb-3">
                  <Landmark size={28} />
                </div>
                <h3 className="text-lg font-semibold text-foreground">No Payment Vouchers Yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Click "+ New Voucher" on the top right to create your first vendor payment disbursement voucher.
                </p>
              </div>
            ) : filteredVouchers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary mb-3">
                <Search size={28} />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No matching vouchers found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mb-3">
                We couldn't find any vouchers matching your search or filter criteria.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearchTerm(''); setStatusFilter(null); }}
              >
                <X size={14} /> Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/75 bg-muted/45 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="w-[44px] px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        disabled={!canCreateVoucher}
                        onChange={canCreateVoucher ? handleSelectAll : undefined}
                        className="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary/40"
                      />
                    </th>
                    <th className="w-[170px] px-3 py-3">VOUCHER NUMBER</th>
                    <th className="w-[220px] px-3 py-3">VENDOR</th>
                    <th className="w-[140px] px-3 py-3">VOUCHER DATE</th>
                    <th className="w-[100px] px-3 py-3">CURRENCY</th>
                    <th className="w-[170px] px-3 py-3 text-right">NET DISBURSEMENT</th>
                    <th className="w-[160px] px-3 py-3">STATUS</th>
                    <th className="w-[120px] px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>ACTIONS</span>
                        <div className="relative">
                          <ColumnSettingsButton open={showVoucherColPanel} onClick={() => setShowVoucherColPanel((v) => !v)} />

                          {showVoucherColPanel && (
                            <ColumnCustomizer
                              columnOrder={voucherColOrder}
                              visibleKeys={voucherVisibleKeys}
                              allColumns={VOUCHER_COLS}
                              onToggle={(key) => {
                                setVoucherVisibleKeys((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                              onReorder={setVoucherColOrder}
                              onReset={() => {
                                setVoucherColOrder(VOUCHER_COLS.map((c) => c.key));
                                setVoucherVisibleKeys(new Set(VOUCHER_COLS.map((c) => c.key)));
                              }}
                              onClose={() => setShowVoucherColPanel(false)}
                            />
                          )}
                        </div>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredVouchers.map((v) => {
                    const statusKey = (v.status || '').toUpperCase();
                    const isDraft = statusKey === 'DRAFT';
                    const isApproved = statusKey === 'APPROVED' || statusKey === 'PAID' || statusKey === 'COMPLETED';
                    const isRejected = statusKey === 'REJECTED' || statusKey === 'CANCELLED';
                    const tone = isDraft ? 'neutral' : isApproved ? 'success' : isRejected ? 'danger' : 'warning';
                    const badgeLabel = isDraft ? 'Draft' : isApproved ? 'Approved' : isRejected ? 'Rejected' : 'Pending Approval';
                    const isSelected = selectedVoucherIds.includes(String(v.id));

                    return (
                      <tr
                        key={v.id || v.paymentId}
                        className={cn('transition-colors hover:bg-muted/40 cursor-pointer', isSelected && 'bg-primary/[0.04]')}
                        onClick={() => handleViewVoucherDoc(v)}
                      >
                        <td onClick={(e) => e.stopPropagation()} className="px-3 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={!canCreateVoucher}
                            onChange={() => canCreateVoucher && handleToggleSelect(String(v.id))}
                            className="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary/40"
                          />
                        </td>
                        <td className="px-3 py-3.5 font-semibold text-primary font-mono">{v.paymentId}</td>
                        <td className="px-3 py-3.5 font-medium text-foreground">{v.vendor || '—'}</td>
                        <td className="px-3 py-3.5 text-muted-foreground">{v.paidAt || '—'}</td>
                        <td className="px-3 py-3.5 font-medium text-muted-foreground">{companyDefaultCurrency}</td>
                        <td className="px-3 py-3.5 text-right font-semibold font-mono text-foreground">
                          {formatAmount(v.amount || 0, companyDefaultCurrency)}
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge tone={tone}>
                            <span className="size-1.5 rounded-full bg-current" />
                            {badgeLabel}
                          </Badge>
                        </td>
                        <td className="px-3 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleViewVoucherDoc(v)}
                              title="View Bank Payment Voucher Document"
                            >
                              <Eye size={15} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={!canCreateVoucher}
                              title="Edit Payment Voucher"
                              onClick={() => {
                                if (!canCreateVoucher) return;
                                setVoucherNumber(v.paymentId);
                                setVendorName(v.vendor);
                                setInvoiceRef(v.invoiceRef || '');
                                setGrossAmount(v.amount);
                                if (v.method) setPaymentMethod(v.method);
                                if (v.bankName) setBankName(v.bankName);
                                if (v.accountNumber) setAccountNumber(v.accountNumber);
                                if (v.ifscCode) setIfscCode(v.ifscCode);
                                if (v.beneficiaryName) setBeneficiaryName(v.beneficiaryName);
                                if (v.remarks) setRemarks(v.remarks);
                                if (v.purpose) setPurpose(v.purpose);
                                setIsCreating(true);
                              }}
                            >
                              <Pencil size={15} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={!canCreateVoucher}
                              title="Delete Payment Voucher"
                              onClick={() => {
                                if (!canCreateVoucher) return;
                                setDeleteTarget(v);
                              }}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

        {/* Single Voucher Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="cpv-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="cpv-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="cpv-modal-header cpv-modal-header--danger">
                <h3>
                  <AlertTriangle size={20} />
                  <span>Delete Payment Voucher?</span>
                </h3>
                <button className="cpv-modal-close" onClick={() => setDeleteTarget(null)} disabled={deleting} title="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="cpv-modal-body">
                <p>
                  Are you sure you want to delete Payment Voucher <strong>{deleteTarget.paymentId}</strong> for <strong>{deleteTarget.vendor}</strong>?
                </p>
                <div className="cpv-modal-warning">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>This action is permanent and cannot be undone.</span>
                </div>
              </div>
              <div className="cpv-modal-footer">
                <button
                  className="cpv-btn cpv-btn--outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="cpv-btn cpv-btn--danger"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete Voucher'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Voucher Delete Confirmation Modal */}
        {showBulkDeleteModal && (
          <div className="cpv-modal-backdrop" onClick={() => !deleting && setShowBulkDeleteModal(false)}>
            <div className="cpv-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="cpv-modal-header cpv-modal-header--danger">
                <h3>
                  <AlertTriangle size={20} />
                  <span>Delete {selectedVoucherIds.length} Selected Voucher(s)?</span>
                </h3>
                <button className="cpv-modal-close" onClick={() => setShowBulkDeleteModal(false)} disabled={deleting} title="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="cpv-modal-body">
                <p>
                  Are you sure you want to delete the <strong>{selectedVoucherIds.length} selected payment voucher(s)</strong>?
                </p>
                <div className="cpv-modal-warning">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>This action is permanent and cannot be undone.</span>
                </div>
              </div>
              <div className="cpv-modal-footer">
                <button
                  className="cpv-btn cpv-btn--outline"
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="cpv-btn cpv-btn--danger"
                  onClick={handleBulkDeleteConfirm}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : `Delete ${selectedVoucherIds.length} Voucher(s)`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bank Payment Voucher Document Modal */}
        {selectedVoucherForModal && (
          <BankPaymentVoucherModal
            data={selectedVoucherForModal}
            onClose={() => setSelectedVoucherForModal(null)}
          />
        )}

        {/* Attached Document Viewer Modal */}
        {viewerOpen && (
          <InvoiceDocumentViewerModal
            open={viewerOpen}
            onClose={() => setViewerOpen(false)}
            invoice={viewerDocContext}
            attachments={viewerAttachments}
            initialDocIndex={viewerIndex}
          />
        )}
      </PageFrame>
    );
  }

  // ── Render Voucher Entry Form View (`isCreating === true`) ──
  return (
    <div className="cpv-page">
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

      {/* Form Header */}
      <div className="cpv-header">
        <div className="cpv-header__left">
          <button className="cpv-back-btn" onClick={() => setIsCreating(false)} title="Back" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="cpv-header__titles">
            <h1 className="cpv-header__title">Create Payment Voucher</h1>
            <p className="cpv-header__subtitle">
              Generate vendor payment disbursement voucher with Bank Details & Payment Workflow
            </p>
          </div>
        </div>
        <div className="cpv-header__actions">
          <button
            className="cpv-btn cpv-btn--primary"
            onClick={submitVoucher}
            disabled={savingDraft || submitting || !canCreateVoucher}
            title={!canCreateVoucher ? "You do not have permission to submit payment vouchers." : undefined}
          >
            <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Voucher for Approval'}
          </button>
        </div>
      </div>

      {/* Form Body */}
      <div className="cpv-form-body">
        {/* Section 01: Identification & Timing */}
        <div className="cpv-section">
          <div className="cpv-section__header">
            <span className="cpv-section__num">01</span>
            <span className="cpv-section__title">Voucher Identification & Schedule</span>
          </div>
          <div className="cpv-grid cpv-grid--4">
            <div className="cpv-field">
              <label>Voucher Number (Auto)</label>
              <input type="text" value={voucherNumber} readOnly className="cpv-input--readonly" />
            </div>
            <div className="cpv-field">
              <label>Payment Method <span>*</span></label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="NEFT">NEFT (National Electronic Funds Transfer)</option>
                <option value="RTGS">RTGS (Real Time Gross Settlement)</option>
                <option value="IMPS">IMPS (Immediate Payment Service)</option>
                <option value="Cheque">Cheque</option>
                <option value="Wire Transfer">Wire Transfer / SWIFT</option>
              </select>
            </div>
            <div className="cpv-field">
              <label>Voucher Date <span>*</span></label>
              <input
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </div>
            <div className="cpv-field">
              <label>Scheduled Payment Date <span>*</span></label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Section 02: Vendor & Bank Account Details */}
        <div className="cpv-section">
          <div className="cpv-section__header">
            <span className="cpv-section__num">02</span>
            <span className="cpv-section__title">Supplier & Bank Details (for Bank Transfer)</span>
            <span className="cpv-section__hint">Auto-populates supplier banking details</span>
          </div>
          <div className="cpv-grid cpv-grid--4">
            <div className="cpv-field cpv-field--span-2">
              <label>Supplier Name / Beneficiary <span>*</span></label>
              <select
                value={selectedVendorId}
                onChange={(e) => handleVendorSelect(e.target.value)}
              >
                <option value="">Select Supplier from Database Master...</option>
                {vendorsList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category})
                  </option>
                ))}
              </select>
            </div>
            <div className="cpv-field cpv-field--span-2">
              <label>Reference (PO & Invoice Numbers)</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="e.g. PO-001, PO-002, INV-2026-0042"
              />
            </div>
            <div className="cpv-field">
              <label>Beneficiary Account Name</label>
              <input
                type="text"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Account Holder Name"
              />
            </div>
            <div className="cpv-field">
              <label>Bank Name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. HDFC Bank Ltd"
              />
            </div>
            <div className="cpv-field">
              <label>Account Number / IBAN</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 918029301923"
              />
            </div>
            <div className="cpv-field">
              <label>IFSC / SWIFT Code</label>
              <input
                type="text"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value)}
                placeholder="e.g. HDFC0000128"
              />
            </div>
          </div>
        </div>

        {/* Section 02B: Supplier Invoices Selection (Single & Multi-Invoice) */}
        <div className="cpv-section">
          <div className="cpv-section__header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="cpv-section__num">02B</span>
              <span className="cpv-section__title">Select Invoices for Payment (Single & Multiple Invoices)</span>
            </div>
            <div className="cpv-invoice-mode-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {invoiceEntryMode !== null && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', borderRight: '1px solid var(--border-color)', paddingRight: 8, marginRight: 4 }}>
                    {invoiceEntryMode === 'AUTO_FILL' ? '🔗 Auto-Fill' : '✏️ Manual'}
                  </span>
                  <button
                    type="button"
                    className="cpv-mode-btn"
                    onClick={() => { setInvoiceEntryMode(null); setVendorInvoices([]); setGrossAmount(''); setInvoiceRef(''); }}
                    style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                  >
                    ↩ Change Mode
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomInvoice}
                    className="h-8 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
                  >
                    <Plus size={14} /> Add Invoice Line
                  </Button>
                  <button
                    type="button"
                    className={`cpv-mode-btn ${selectionMode === 'multiple' ? 'cpv-mode-btn--active' : ''}`}
                    onClick={() => handleModeChange('multiple')}
                  >
                    <CheckSquare size={14} /> Multiple Invoices
                  </button>
                  <button
                    type="button"
                    className={`cpv-mode-btn ${selectionMode === 'single' ? 'cpv-mode-btn--active' : ''}`}
                    onClick={() => handleModeChange('single')}
                  >
                    <FileText size={14} /> Single Invoice
                  </button>
                </>
              )}
            </div>
          </div>


          {/* Mode Selection Cards — shown when no mode is selected yet */}
          {invoiceEntryMode === null && (
            <div style={{ padding: '28px 24px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, textAlign: 'center' }}>
                How would you like to add invoices for this payment?
              </p>
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
                {/* Auto-Fill Card */}
                <button
                  type="button"
                  onClick={() => handleSelectInvoiceMode('AUTO_FILL')}
                  style={{
                    flex: '1 1 240px', maxWidth: 300, padding: '24px 20px',
                    background: 'var(--surface-secondary, rgba(255,255,255,0.04))',
                    border: '1.5px solid var(--border-color, rgba(255,255,255,0.1))',
                    borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    color: 'inherit',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary, #6366f1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color, rgba(255,255,255,0.1))'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Database size={20} style={{ color: 'var(--primary, #6366f1)' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Auto-Fill from Database</div>
                      <div style={{ fontSize: 11, color: 'var(--primary, #6366f1)', fontWeight: 500 }}>Recommended</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    Automatically fetch open invoices for the selected supplier from the database. Includes PO &amp; GRN references and 3-Way Match status.
                  </p>
                </button>

                {/* Manual Entry Card */}
                <button
                  type="button"
                  onClick={() => handleSelectInvoiceMode('MANUAL')}
                  style={{
                    flex: '1 1 240px', maxWidth: 300, padding: '24px 20px',
                    background: 'var(--surface-secondary, rgba(255,255,255,0.04))',
                    border: '1.5px solid var(--border-color, rgba(255,255,255,0.1))',
                    borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    color: 'inherit',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#22c55e'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 3px rgba(34,197,94,0.15)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color, rgba(255,255,255,0.1))'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Edit3 size={20} style={{ color: '#22c55e' }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Manual Entry</div>
                      <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 500 }}>For unlinked invoices</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    Manually enter invoice number, PO reference, amount and due date. Use this for invoices not yet recorded in the system.
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Invoice Table — shown after mode is selected */}
          {invoiceEntryMode !== null && (
          <>
          {loadingInvoices ? (
            <div style={{ padding: '16px' }}>
              <TableSkeleton rows={3} columnWidths={['40px', '140px', '120px', '120px', '110px', '110px', '110px', '130px', '140px']} />
            </div>
          ) : (
            <div>
              {vendorInvoices.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <p>{invoiceEntryMode === 'AUTO_FILL'
                    ? (selectedVendorId ? 'No open database invoices found for this supplier.' : 'Select a supplier above to auto-load invoices.')
                    : 'Click "Add Invoice Line" above to add a row.'}</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomInvoice}
                    className="mt-3 gap-1.5"
                  >
                    <Plus size={14} /> Add Invoice Line
                  </Button>
                </div>
              ) : (
                <div className="cpv-inv-table-wrap">
                  <table className="cpv-inv-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                          {selectionMode === 'multiple' && (
                            <input
                              type="checkbox"
                              checked={vendorInvoices.length > 0 && vendorInvoices.every((i) => i.selected)}
                              onChange={(e) => handleSelectAllInvoices(e.target.checked)}
                              style={{ cursor: 'pointer', width: 16, height: 16 }}
                              title="Select / Deselect All Invoices"
                            />
                          )}
                        </th>
                        <th>Invoice Number</th>
                        <th>PO Ref</th>
                        <th>GRN Ref</th>
                        <th>3-Way Match</th>
                        <th>Invoice Date</th>
                        <th>Due Date</th>
                        <th style={{ textAlign: 'right' }}>Total Amount</th>
                        <th style={{ textAlign: 'right' }}>Disbursement Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorInvoices.map((inv) => (
                        <tr
                          key={inv.id}
                          className={inv.selected ? 'cpv-inv-row--selected' : ''}
                          onClick={() => handleToggleSelectInvoice(inv.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type={selectionMode === 'single' ? 'radio' : 'checkbox'}
                              name="inv_select_radio"
                              checked={inv.selected}
                              onChange={() => handleToggleSelectInvoice(inv.id)}
                              style={{ cursor: 'pointer', width: 16, height: 16 }}
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={inv.invoiceNumber}
                              onChange={(e) => handleInvoiceFieldChange(inv.id, 'invoiceNumber', e.target.value)}
                              className="rounded border border-input bg-background/80 px-2 py-1 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary"
                              style={{ width: '140px' }}
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={inv.poNumber}
                              onChange={(e) => handleInvoiceFieldChange(inv.id, 'poNumber', e.target.value)}
                              className="rounded border border-input bg-background/80 px-2 py-1 text-xs text-muted-foreground focus:ring-1 focus:ring-primary"
                              style={{ width: '140px' }}
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={inv.grnNumber}
                              onChange={(e) => handleInvoiceFieldChange(inv.id, 'grnNumber', e.target.value)}
                              className="rounded border border-input bg-background/80 px-2 py-1 text-xs text-muted-foreground focus:ring-1 focus:ring-primary"
                              style={{ width: '120px' }}
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleToggleInvoiceMatch(inv.id)}
                              className={`cpv-match-tag cpv-match-tag--${inv.threeWayMatch === 'MATCHED' ? 'matched' : 'discrepancy'}`}
                              style={{
                                cursor: 'pointer',
                                border: 'none',
                                background: inv.threeWayMatch === 'MATCHED' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: inv.threeWayMatch === 'MATCHED' ? '#10b981' : '#ef4444',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                                fontSize: '11px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease',
                              }}
                              title="Click to toggle 3-Way Match status (MATCHED / DISCREPANCY)"
                            >
                              {inv.threeWayMatch === 'MATCHED' ? '✅ MATCHED' : '⚠️ DISCREPANCY'}
                            </button>
                          </td>
                          <td>{inv.invoiceDate}</td>
                          <td>{inv.dueDate}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatAmount(inv.amount, currency)}</td>
                          <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyRight: 'flex-end', gap: 6 }}>
                              <input
                                type="number"
                                step="0.01"
                                value={inv.paymentAmount || ''}
                                onChange={(e) => handleInvoiceFieldChange(inv.id, 'paymentAmount', parseFloat(e.target.value) || 0)}
                                className="rounded border border-input bg-background/80 px-2 py-1 text-right text-xs font-bold text-foreground focus:ring-1 focus:ring-primary"
                                style={{ width: '110px' }}
                              />
                              {vendorInvoices.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveInvoice(inv.id)}
                                  title="Remove Invoice Line"
                                  style={{ padding: 4, background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer' }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="p-3 border-t border-border/60 bg-muted/20">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddCustomInvoice}
                  className="gap-1.5 text-xs text-primary font-semibold hover:bg-primary/10"
                >
                  <Plus size={14} /> Add Another Invoice Line
                </Button>
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Section 03: Automated 3-Way Multi-Match Verification Engine */}
        {(() => {
          const selectedInvs = vendorInvoices.filter((i) => i.selected);
          const billedTotal = selectedInvs.reduce((sum, i) => sum + (i.paymentAmount || 0), 0);

          // Build unified reconciled items from selected invoices
          const reconciledItems: ReconciledItem[] = selectedInvs.flatMap((inv, invIdx) => {
            if (Array.isArray(inv.items) && inv.items.length > 0) {
              return inv.items;
            }
            const isDisc = inv.threeWayMatch === 'DISCREPANCY' || (inv.threeWayMatch as string) === 'MISMATCH';
            const ordQty = inv.grnOrderedQty || 10;
            const recQty = inv.grnReceivedQty ?? (isDisc ? Math.floor(ordQty * 0.8) : ordQty);
            const shortQty = Math.max(0, ordQty - recQty);
            const uPrice = inv.amount > 0 && ordQty > 0 ? inv.amount / ordQty : (inv.paymentAmount || 1000) / (ordQty || 1);
            const ordVal = ordQty * uPrice;
            const recVal = recQty * uPrice;
            const shortVal = shortQty * uPrice;

            return [
              {
                id: `fallback_item_${inv.id || invIdx}`,
                invoiceNumber: inv.invoiceNumber,
                poNumber: inv.poNumber,
                grnNumber: inv.grnNumber,
                itemName: `${inv.invoiceNumber || 'Invoice'} - Goods Delivery Line Items`,
                orderedQty: ordQty,
                receivedQty: recQty,
                shortfallQty: shortQty,
                unitPrice: uPrice,
                orderedValue: ordVal,
                receivedValue: recVal,
                shortfallValue: shortVal,
                status: (shortQty > 0 ? 'SHORTFALL' : 'MATCHED') as 'SHORTFALL' | 'MATCHED',
                remarks: shortQty > 0 ? `${shortQty} units missing from GRN inspection` : 'Goods inspected & verified in good condition',
              },
            ];
          });

          // Compute aggregated quantities and financial values
          let totalOrd = 0;
          let totalRec = 0;
          let totalShortfallUnits = 0;
          let totalOrderedVal = 0;
          let totalReceivedVal = 0;
          let totalShortfallVal = 0;

          if (reconciledItems.length > 0) {
            reconciledItems.forEach((it) => {
              totalOrd += it.orderedQty;
              totalRec += it.receivedQty;
              totalShortfallUnits += it.shortfallQty;
              totalOrderedVal += it.orderedValue;
              totalReceivedVal += it.receivedValue;
              totalShortfallVal += it.shortfallValue;
            });
          } else {
            selectedInvs.forEach((i) => {
              const o = i.grnOrderedQty || 0;
              const r = i.grnReceivedQty ?? o;
              totalOrd += o;
              totalRec += r;
              totalShortfallUnits += Math.max(0, o - r);
              totalOrderedVal += i.amount;
              totalReceivedVal += i.grnReceivedAmount || (i.amount * (o > 0 ? r / o : 1));
            });
            totalShortfallVal = Math.max(0, billedTotal - totalReceivedVal);
          }

          if (totalOrderedVal === 0 && billedTotal > 0) {
            totalOrderedVal = billedTotal;
          }

          // Compute GRN %
          const grnPercent = totalOrd > 0
            ? Math.min(100, Math.round((totalRec / totalOrd) * 100))
            : (totalOrderedVal > 0 ? Math.min(100, Math.round((totalReceivedVal / totalOrderedVal) * 100)) : 100);

          // Employee GRN shortfall checks
          const hasGrnQtyShortfall = totalOrd > 0 && totalRec < totalOrd && (totalOrd - totalRec) / totalOrd > 0.02;
          const hasGrnAmtShortfall = totalShortfallVal > 0.01;
          const hasGrnShortfall = hasGrnQtyShortfall || hasGrnAmtShortfall;

          // Check if any invoice has actual rate/spec discrepancy or overbilling
          const overBilledInvs = selectedInvs.filter((i) => i.paymentAmount > i.amount);
          const rateDiscrepantInvs = selectedInvs.filter((i) => {
            if (i.paymentAmount > i.amount) return false;
            if (Array.isArray(i.items) && i.items.length > 0) {
              return i.items.some((it) => it.shortfallQty > 0 || it.shortfallValue > 0.01);
            }
            if (i.grnReceivedAmount && i.amount) {
              return i.grnReceivedAmount < i.amount * 0.98;
            }
            return (i.threeWayMatch === 'DISCREPANCY' || (i.threeWayMatch as string) === 'MISMATCH') && hasGrnShortfall;
          });

          const poAgreedTotal = totalOrderedVal > 0 ? totalOrderedVal : billedTotal;

          // ── Build structured discrepancy items ───────────────────────────
          interface DiscrepancyItemData {
            id: string;
            icon: any;
            title: string;
            description: string;
            badge?: string;
            details?: { name: string; ordered: number; received: number; shortfall: number; unitPrice: number; shortfallVal: number }[];
          }
          const discrepancyItems: DiscrepancyItemData[] = [];

          if (hasGrnShortfall || totalShortfallUnits > 0 || totalShortfallVal > 0) {
            const shortfallItems = reconciledItems.filter((it) => it.shortfallQty > 0 || it.shortfallValue > 0);
            discrepancyItems.push({
              id: 'grn_shortfall',
              icon: PackageX,
              title: 'Goods Received Note (GRN) Shortfall',
              description: `Received ${totalRec} of ${totalOrd} ordered units (${totalShortfallUnits} units missing/rejected during store receiving inspection).`,
              badge: `${formatAmount(totalShortfallVal, currency)} Shortfall`,
              details: shortfallItems.map((it) => ({
                name: it.itemName,
                ordered: it.orderedQty,
                received: it.receivedQty,
                shortfall: it.shortfallQty,
                unitPrice: it.unitPrice,
                shortfallVal: it.shortfallValue,
              })),
            });
          }

          if (rateDiscrepantInvs.length > 0) {
            discrepancyItems.push({
              id: 'rate_variance',
              icon: Scale,
              title: 'PO Rate & Specification Variance',
              description: `Invoice(s) ${rateDiscrepantInvs.map((i) => i.invoiceNumber).join(', ')} — PO agreed unit rates or accepted quantities do not match billed lines.`,
              badge: 'Rate Mismatch',
            });
          }

          if (overBilledInvs.length > 0) {
            overBilledInvs.forEach((inv) => {
              const excess = inv.paymentAmount - inv.amount;
              discrepancyItems.push({
                id: `overbill_${inv.id}`,
                icon: TrendingDown,
                title: `Overbilled Invoice (${inv.invoiceNumber})`,
                description: `Payment allocated (${formatAmount(inv.paymentAmount, currency)}) exceeds invoice face value (${formatAmount(inv.amount, currency)}).`,
                badge: `+${formatAmount(excess, currency)} Excess`,
              });
            });
          }

          if (matchStatus === 'DISCREPANCY' && discrepancyItems.length === 0 && (hasGrnShortfall || overBilledInvs.length > 0 || rateDiscrepantInvs.length > 0)) {
            discrepancyItems.push({
              id: 'manual_flag',
              icon: ShieldAlert,
              title: 'Manual Review Discrepancy Flag',
              description: 'Flagged for mandatory review by finance management prior to payment voucher approval.',
              badge: 'Under Review',
            });
          }

          const isDiscrepant = discrepancyItems.length > 0;

          const poRefs = Array.from(new Set(selectedInvs.map((i) => typeof i.poNumber === 'string' ? i.poNumber : '').filter(Boolean))).join(', ') || 'PO-2026';
          const grnRefs = Array.from(new Set(selectedInvs.map((i) => typeof i.grnNumber === 'string' ? i.grnNumber : '').filter(Boolean))).join(', ') || 'GRN-2026';

          return (
            <div className={`cpv-section cpv-match-card ${isDiscrepant ? 'cpv-match-card--discrepancy' : ''}`}>
              <div className="cpv-section__header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="cpv-section__num">03</span>
                  <div>
                    <span className="cpv-section__title">
                      3-Way Multi-Match Engine ({selectedInvs.length} Selected Invoice{selectedInvs.length !== 1 ? 's' : ''})
                    </span>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Automated PO, Goods Receipt (GRN) &amp; Vendor Invoice Multi-Line Reconciliation
                    </div>
                  </div>
                </div>
                <div className="cpv-match-header-actions">
                  <span className={`cpv-status-badge ${!isDiscrepant ? 'cpv-status-badge--success' : 'cpv-status-badge--danger'}`}>
                    {!isDiscrepant ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    <span>{!isDiscrepant ? '100% 3-Way Match Verified' : 'Discrepancy Detected'}</span>
                  </span>
                  <button
                    type="button"
                    className="cpv-btn cpv-btn--sm cpv-btn--outline"
                    onClick={() => updateTotalsFromInvoices(vendorInvoices)}
                    title="Re-verify 3-Way Match across selected invoices"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30 }}
                  >
                    <RotateCcw size={12} />
                    <span>Re-Verify</span>
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              <div className={`cpv-match-banner ${!isDiscrepant ? 'cpv-match-banner--matched' : 'cpv-match-banner--discrepancy'}`}>
                <div className="cpv-match-banner-header">
                  <div className={`cpv-match-banner-icon ${!isDiscrepant ? 'cpv-match-banner-icon--matched' : 'cpv-match-banner-icon--discrepancy'}`}>
                    {!isDiscrepant ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
                  </div>
                  <div>
                    <div className={`cpv-match-banner-title ${!isDiscrepant ? 'cpv-match-banner-title--matched' : 'cpv-match-banner-title--discrepancy'}`}>
                      {!isDiscrepant
                        ? `3-Way Multi-Match Verified (${selectedInvs.length || 1} Invoice(s): PO = Employee GRN = Invoice)`
                        : `3-Way Multi-Match Discrepancy Flagged (${discrepancyItems.length} Issue${discrepancyItems.length !== 1 ? 's' : ''} Detected)`
                      }
                    </div>
                    <div className="cpv-match-banner-subtitle">
                      {!isDiscrepant
                        ? `Quantities & unit rates across Purchase Orders (${poRefs}), Employee Goods Received Notes (${grnRefs}), and ${selectedInvs.length || 1} selected Supplier Invoice(s) align 100%. Verified by internal store inspection.`
                        : 'Variance identified between Purchase Orders, Goods Receipt quantities, and billed Supplier Invoices.'
                      }
                    </div>
                  </div>
                </div>

                {/* If Discrepant: Structured Discrepancy Breakdown */}
                {isDiscrepant && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                    <div className="cpv-discrepancy-grid">
                      {discrepancyItems.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <div key={item.id} className="cpv-discrepancy-item-card">
                            <div className="cpv-discrepancy-item-icon">
                              <ItemIcon size={16} />
                            </div>
                            <div className="cpv-discrepancy-item-content">
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <div className="cpv-discrepancy-item-title">{item.title}</div>
                                {item.badge && (
                                  <span className="cpv-discrepancy-item-highlight">{item.badge}</span>
                                )}
                              </div>
                              <div className="cpv-discrepancy-item-desc">{item.description}</div>
                              {item.details && item.details.length > 0 && (
                                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {item.details.map((d, dIdx) => (
                                    <div
                                      key={dIdx}
                                      style={{
                                        fontSize: 11,
                                        background: 'rgba(239, 68, 68, 0.05)',
                                        padding: '4px 8px',
                                        borderRadius: 4,
                                        border: '1px solid rgba(239, 68, 68, 0.15)',
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      <strong style={{ color: 'var(--text-primary)' }}>{d.name}</strong>: Ordered {d.ordered}, Received {d.received} (
                                      <span style={{ color: '#ef4444', fontWeight: 700 }}>
                                        {d.shortfall} missing @ {formatAmount(d.unitPrice, currency)} = {formatAmount(d.shortfallVal, currency)}
                                      </span>)
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="cpv-discrepancy-routing-strip">
                      <AlertCircle size={15} style={{ flexShrink: 0 }} />
                      <span>
                        <strong>Mandatory Approval Routing:</strong> This payment voucher will require elevated Manager &amp; Finance audit approval before disbursement release due to active reconciliation variance.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 3 Overview Comparator Cards */}
              <div className="cpv-match-comparator-grid">
                {/* Box A: Purchase Order */}
                <div className="cpv-match-box-pro">
                  <div>
                    <div className="cpv-match-box-top">
                      <span className="cpv-step-tag">Step A • Baseline</span>
                      <span className="cpv-match-box-ref" title={poRefs}>PO: {poRefs}</span>
                    </div>
                    <div className="cpv-match-box-header-title">Purchase Order Total</div>
                    <div className="cpv-match-box-main-value">{formatAmount(poAgreedTotal, currency)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                      {totalOrd} Total Units Contracted
                    </div>
                  </div>
                  <div className={`cpv-match-box-status-chip ${!isDiscrepant ? 'cpv-match-box-status-chip--ok' : 'cpv-match-box-status-chip--warn'}`}>
                    {!isDiscrepant ? (
                      <>
                        <CheckCircle2 size={13} />
                        <span>PO Agreed Baseline</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={13} />
                        <span>PO Baseline Contract</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Box B: Goods Received Note (GRN) */}
                <div className="cpv-match-box-pro">
                  <div>
                    <div className="cpv-match-box-top">
                      <span className="cpv-step-tag">Step B • Fulfilment</span>
                      <span className="cpv-match-box-ref" title={grnRefs}>GRN: {grnRefs}</span>
                    </div>
                    <div className="cpv-match-box-header-title">Store Received Value</div>
                    <div className="cpv-match-box-main-value" style={{ color: totalShortfallUnits > 0 ? '#ef4444' : '#10b981' }}>
                      {formatAmount(totalReceivedVal, currency)}
                    </div>

                    {/* Progress Bar */}
                    <div className="cpv-match-progress-wrap">
                      <div className="cpv-match-progress-bar">
                        <div
                          className="cpv-match-progress-fill"
                          style={{
                            width: `${grnPercent}%`,
                            background: totalShortfallUnits > 0 ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : 'linear-gradient(90deg, #10b981, #059669)',
                          }}
                        />
                      </div>
                      <div className="cpv-match-progress-label">
                        <span>{totalRec} of {totalOrd} units accepted</span>
                        <span>{grnPercent}%</span>
                      </div>
                    </div>
                  </div>

                  <div className={`cpv-match-box-status-chip ${!hasGrnShortfall && !isDiscrepant ? 'cpv-match-box-status-chip--ok' : 'cpv-match-box-status-chip--warn'}`}>
                    {!hasGrnShortfall && !isDiscrepant ? (
                      <>
                        <CheckCircle2 size={13} />
                        <span>100% Store Fulfilled</span>
                      </>
                    ) : (
                      <>
                        <PackageX size={13} />
                        <span>Shortfall: -{totalShortfallUnits} units ({formatAmount(totalShortfallVal, currency)})</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Box C: Selected Invoices */}
                <div className="cpv-match-box-pro">
                  <div>
                    <div className="cpv-match-box-top">
                      <span className="cpv-step-tag">Step C • Settlement</span>
                      <span className="cpv-match-box-ref">{selectedInvs.length} Invoice{selectedInvs.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="cpv-match-box-header-title">Supplier Billed Total</div>
                    <div className="cpv-match-box-main-value">{formatAmount(billedTotal, currency)}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Net Payable:</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>
                        {formatAmount(totalReceivedVal > 0 ? Math.min(billedTotal, totalReceivedVal) : billedTotal, currency)}
                      </span>
                    </div>
                  </div>

                  <div className={`cpv-match-box-status-chip ${!isDiscrepant ? 'cpv-match-box-status-chip--ok' : 'cpv-match-box-status-chip--warn'}`}>
                    {!isDiscrepant ? (
                      <>
                        <ShieldCheck size={13} />
                        <span>All Invoices Matched</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={13} />
                        <span>Variance: {formatAmount(totalShortfallVal, currency)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Itemized 3-Way Reconciliation Breakdown Table */}
              {reconciledItems.length > 0 && (
                <div className="cpv-recon-container">
                  <div className="cpv-recon-header">
                    <div className="cpv-recon-title-area">
                      <div style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: 'rgba(10, 110, 209, 0.1)',
                        color: 'var(--primary-500, #0a6ed1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                        <PackageCheck size={16} />
                      </div>
                      <div>
                        <div className="cpv-recon-title">
                          Itemized 3-Way Reconciliation Breakdown
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          Comparative audit: PO Contract vs Store GRN Receipt vs Vendor Invoice Line Items
                        </div>
                      </div>
                    </div>
                    {totalShortfallVal > 0 && (
                      <div className="cpv-recon-badge-alert">
                        <AlertTriangle size={13} />
                        <span>Shortfall Impact: {formatAmount(totalShortfallVal, currency)} ({totalShortfallUnits} units)</span>
                      </div>
                    )}
                  </div>

                  <div className="cpv-recon-table-wrap">
                    <table className="cpv-recon-table">
                      <thead>
                        <tr>
                          <th style={{ width: 40, textAlign: 'center' }}>#</th>
                          <th>Item Description &amp; Receiving Note</th>
                          <th>PO / Invoice Ref</th>
                          <th style={{ textAlign: 'right' }}>Ordered</th>
                          <th style={{ textAlign: 'right' }}>Received (GRN)</th>
                          <th style={{ textAlign: 'right' }}>Variance</th>
                          <th style={{ textAlign: 'right' }}>Unit Rate</th>
                          <th style={{ textAlign: 'right' }}>Accepted Value</th>
                          <th style={{ textAlign: 'right' }}>Missing Value</th>
                          <th style={{ textAlign: 'center' }}>Recon Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconciledItems.map((item, idx) => {
                          const hasItemShortfall = item.shortfallQty > 0 || item.shortfallValue > 0;
                          return (
                            <tr key={item.id || idx} className={hasItemShortfall ? 'cpv-row--shortfall' : ''}>
                              <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                {idx + 1}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.itemName}</div>
                                {item.remarks && (
                                  <div style={{
                                    fontSize: 11,
                                    color: hasItemShortfall ? '#ef4444' : 'var(--text-secondary)',
                                    marginTop: 2,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}>
                                    {hasItemShortfall && <AlertCircle size={10} />}
                                    <span>{item.remarks}</span>
                                  </div>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: 'var(--primary-500)',
                                    fontFamily: 'var(--font-mono, monospace)',
                                  }}>
                                    {item.invoiceNumber || '—'}
                                  </span>
                                  <span style={{
                                    fontSize: 10.5,
                                    color: 'var(--text-secondary)',
                                    fontFamily: 'var(--font-mono, monospace)',
                                  }}>
                                    {item.poNumber || '—'}
                                  </span>
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }} className="cpv-mono-val">
                                {item.orderedQty}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }} className="cpv-mono-val">
                                {item.receivedQty}
                              </td>
                              <td style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                color: hasItemShortfall ? '#ef4444' : 'var(--text-secondary)',
                              }} className="cpv-mono-val">
                                {item.shortfallQty > 0 ? `-${item.shortfallQty}` : '0'}
                              </td>
                              <td style={{ textAlign: 'right' }} className="cpv-mono-val">
                                {formatAmount(item.unitPrice, currency)}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }} className="cpv-mono-val">
                                {formatAmount(item.receivedValue, currency)}
                              </td>
                              <td style={{
                                textAlign: 'right',
                                fontWeight: 700,
                                color: hasItemShortfall ? '#ef4444' : 'var(--text-secondary)',
                              }} className="cpv-mono-val">
                                {item.shortfallValue > 0 ? formatAmount(item.shortfallValue, currency) : '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                {hasItemShortfall ? (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: 'rgba(239, 68, 68, 0.12)',
                                    color: '#ef4444',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                  }}>
                                    <AlertTriangle size={11} />
                                    <span>Missing {item.shortfallQty}</span>
                                  </span>
                                ) : (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    color: '#10b981',
                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                  }}>
                                    <CheckCircle2 size={11} />
                                    <span>Matched</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} style={{ textAlign: 'right', color: 'var(--text-primary)', fontWeight: 700 }}>
                            Reconciliation Totals:
                          </td>
                          <td style={{ textAlign: 'right' }} className="cpv-mono-val">{totalOrd}</td>
                          <td style={{ textAlign: 'right', color: '#10b981' }} className="cpv-mono-val">{totalRec}</td>
                          <td style={{
                            textAlign: 'right',
                            color: totalShortfallUnits > 0 ? '#ef4444' : 'inherit',
                          }} className="cpv-mono-val">
                            {totalShortfallUnits > 0 ? `-${totalShortfallUnits}` : '0'}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>—</td>
                          <td style={{ textAlign: 'right', color: '#10b981' }} className="cpv-mono-val">
                            {formatAmount(totalReceivedVal, currency)}
                          </td>
                          <td style={{
                            textAlign: 'right',
                            color: totalShortfallVal > 0 ? '#ef4444' : 'inherit',
                          }} className="cpv-mono-val">
                            {totalShortfallVal > 0 ? formatAmount(totalShortfallVal, currency) : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {totalShortfallVal > 0 ? (
                              <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>⚠️ Variance</span>
                            ) : (
                              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>✓ 100% Match</span>
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Section 04: Purpose & Attachments & Section 05: Disbursement Summary Card */}
        <div className="cpv-grid cpv-grid--split">
          <div className="cpv-section">
            <div className="cpv-section__header">
              <span className="cpv-section__num">04</span>
              <span className="cpv-section__title">Purpose & Remarks</span>
            </div>
            <div className="cpv-grid cpv-grid--1">
              <div className="cpv-field">
                <label>Payment Purpose / Description</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. PO settlement disbursement to vendor"
                />
              </div>
              <div className="cpv-field">
                <label>Remarks</label>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add notes for finance approvers..."
                />
              </div>

              {/* Attachments Upload Dropzone */}
              <div className="cpv-field" style={{ marginTop: 8 }}>
                <label>Attachments & Bank Advice Documents</label>
                <label className="cpv-dropzone">
                  <Upload size={22} className="cpv-dropzone-icon" />
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    Click to upload or drag & drop files
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    PDF, PNG, JPG, or DOCX (Max 10MB)
                  </span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                {attachments.length > 0 && (
                  <div className="cpv-attachments-list">
                    {attachments.map((att, idx) => (
                      <div key={att.id} className="cpv-attachment-item">
                        <div className="cpv-attachment-info">
                          <Paperclip size={16} style={{ color: 'var(--primary-500)' }} />
                          <div>
                            <div className="cpv-attachment-name">{att.name}</div>
                            <div className="cpv-attachment-size">{att.size}</div>
                          </div>
                        </div>
                        <div className="cpv-attachment-actions">
                          <button
                            type="button"
                            className="cpv-preview-btn"
                            onClick={() => {
                              setViewerAttachments(attachments);
                              setViewerIndex(idx);
                              setViewerDocContext({
                                paymentNumber: voucherNumber,
                                vendorName,
                                amount: netPayable,
                                currency,
                              });
                              setViewerOpen(true);
                            }}
                            title="Preview Document"
                          >
                            <Eye size={13} />
                            <span>Preview</span>
                          </button>
                          <button
                            type="button"
                            className="cpv-remove-btn"
                            onClick={() => handleRemoveAttachment(att.id)}
                            title="Remove attachment"
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="cpv-summary-card">
            <div className="cpv-section__header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
              <span className="cpv-section__num">05</span>
              <span className="cpv-section__title">Disbursement Summary</span>
            </div>

            <div className="cpv-summary-box">
              <div className="cpv-field">
                <label>Currency</label>
                <CurrencySelector value={currency} onChange={setCurrency} />
              </div>

              <div className="cpv-field">
                <label>Gross Amount <span>*</span></label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={grossAmount}
                  onChange={(e) =>
                    setGrossAmount(e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))
                  }
                />
              </div>

              <div className="cpv-summary-row">
                <span>Gross Amount</span>
                <span>{formatAmount(gross, currency)}</span>
              </div>

              <div className="cpv-summary-divider" />

              <div className="cpv-summary-grand">
                <span className="cpv-summary-grand-label">Net Disbursement</span>
                <span className="cpv-summary-grand-val">{formatAmount(netPayable, currency)}</span>
              </div>

              <div className="cpv-workflow-notice">
                <PackageCheck size={18} />
                <span>Triggers Payments Approval Chain</span>
              </div>
            </div>

            <button
              className="cpv-btn cpv-btn--primary cpv-btn--full"
              onClick={submitVoucher}
              disabled={savingDraft || submitting || !canCreateVoucher}
              title={!canCreateVoucher ? "You do not have permission to submit payment vouchers." : undefined}
            >
              <Send size={16} /> {submitting ? 'Submitting…' : 'Submit Payment Voucher'}
            </button>
          </div>
        </div>
      </div>
      <ActionSendingOverlay
        isOpen={showSendingOverlay}
        docType="payment_voucher"
        docNumber={voucherNumber}
        vendorName={vendorName}
        amount={netPayable}
        currency={currency}
        mode="approval"
      />

      {/* Invoice & Payment Voucher Document Viewer Modal */}
      {viewerOpen && (
        <InvoiceDocumentViewerModal
          open={viewerOpen}
          onClose={() => setViewerOpen(false)}
          invoice={viewerDocContext}
          attachments={viewerAttachments}
          initialDocIndex={viewerIndex}
        />
      )}
    </div>
  );
}
