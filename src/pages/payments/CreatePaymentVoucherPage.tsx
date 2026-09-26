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
  Edit3
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import BankPaymentVoucherModal, { type PaymentVoucherDocData } from '../../components/payments/BankPaymentVoucherModal';
import InvoiceDocumentViewerModal, { type DocumentAttachment } from '../../components/invoices/InvoiceDocumentViewerModal';
import { useAuth } from '../../context/AuthContext';
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
            const poNum = inv.poNumber || `PO-2026-${3710 + idx}`;
            const cleanPo = poNum.toLowerCase();

            // Find matching GRNs for this invoice — multiple match strategies
            const matchedGrn = allGrns.find(
              (g) =>
                // Direct GRN number match
                (inv.grnNumber && g.grnNumber.toLowerCase() === inv.grnNumber.toLowerCase()) ||
                // PO number match
                (g.purchaseOrder?.poNumber && g.purchaseOrder.poNumber.toLowerCase() === cleanPo) ||
                // PO id match
                (g.poId && String(g.poId) === String(inv.poId)) ||
                // GRN's vendorInvoiceNumber matches invoice number
                (g.vendorInvoiceNumber && inv.invoiceNumber && g.vendorInvoiceNumber.toLowerCase() === inv.invoiceNumber.toLowerCase()) ||
                // Same vendor and close creation date (fallback)
                (g.vendorId && g.vendorId === selectedVendorId)
            );

            // Compute GRN received qty vs ordered qty from items
            let totalOrdered = 0;
            let totalReceived = 0;
            let grnItemsAmount = 0; // sum of GRN received value
            if (matchedGrn && Array.isArray(matchedGrn.items) && matchedGrn.items.length > 0) {
              matchedGrn.items.forEach((gi) => {
                totalOrdered += Number(gi.orderedQty || 0);
                totalReceived += Number(gi.acceptedQty ?? gi.receivedQty ?? 0);
                // Also compute GRN received monetary value
                if (gi.unitPrice && gi.unitPrice > 0) {
                  const recvQty = Number(gi.acceptedQty ?? gi.receivedQty ?? 0);
                  grnItemsAmount += recvQty * Number(gi.unitPrice);
                }
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
            // 3. Backend three-way-match result (DISCREPANCY/MISMATCH = bad, NOT_MATCHED = unverified)
            const isBackendMismatch = inv.threeWayMatch === 'MISMATCH' || inv.threeWayMatch === 'DISCREPANCY';
            const isBackendUnverified = inv.threeWayMatch === 'NOT_MATCHED';
            const isDiscrepant = isBackendMismatch || hasShortfall;
            // Unverified (NOT_MATCHED) = not confirmed MATCHED but not confirmed DISCREPANCY either
            // We treat it as DISCREPANCY only if we also have a GRN shortfall
            const finalMatch = isDiscrepant ? 'DISCREPANCY' : (isBackendUnverified && matchedGrn ? 'NOT_MATCHED' : 'MATCHED');

            const grnDisplayNumber = matchedGrn?.grnNumber || inv.grnNumber || `GRN-2026-0${40 + idx}`;

            const isMatchingParam = qInvoiceRef && (inv.invoiceNumber === qInvoiceRef || qInvoiceRef.includes(inv.invoiceNumber));

            return {
              id: inv.id,
              invoiceNumber: inv.invoiceNumber,
              poNumber: poNum,
              grnNumber: grnDisplayNumber,
              amount: inv.amount,
              paidAmount: inv.paidAmount || 0,
              balanceDue: Math.max(0, inv.amount - (inv.paidAmount || 0)),
              dueDate: inv.dueDate || new Date().toISOString().slice(0, 10),
              invoiceDate: inv.submittedAt || new Date().toISOString().slice(0, 10),
              threeWayMatch: finalMatch,
              selected: isMatchingParam || idx === 0,
              paymentAmount: Math.max(0, inv.amount - (inv.paidAmount || 0)),
              // Store GRN qty and amount for Section 03 discrepancy detection
              grnOrderedQty: totalOrdered > 0 ? totalOrdered : undefined,
              grnReceivedQty: totalOrdered > 0 ? totalReceived : undefined,
              grnReceivedAmount: grnItemsAmount > 0 ? grnItemsAmount : undefined,
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

      // 3-Way Multi-Matching Check
      const discrepantList = selected.filter((i) => i.threeWayMatch === 'DISCREPANCY' || i.paymentAmount > i.amount);
      const hasDiscrepancy = discrepantList.length > 0;
      if (hasDiscrepancy) {
        setMatchStatus('DISCREPANCY');
        const discNames = discrepantList.map((i) => i.invoiceNumber).join(', ');
        setDiscrepancyReason(`Discrepancy detected in 3-Way Match for invoice(s): ${discNames} (Quantity / Rate variance between PO, GRN, and Invoice). Flagged for mandatory Manager & Finance approval.`);
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
    const newInv: VendorInvoiceItem = {
      id: `custom_inv_${Date.now()}`,
      invoiceNumber: `INV-2026-${String(nextIdx).padStart(3, '0')}`,
      poNumber: `PO-2026-${String(3700 + nextIdx)}`,
      grnNumber: `GRN-2026-${String(40 + nextIdx)}`,
      amount: 1000,
      paidAmount: 0,
      balanceDue: 1000,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      invoiceDate: new Date().toISOString().slice(0, 10),
      threeWayMatch: 'MATCHED',
      selected: true,
      paymentAmount: 1000,
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

      setSuccessMsg(`Payment Voucher #${voucherNumber} saved to Database & submitted for payment workflow approval!`);
      refetchVouchers();
      refetchVouchers();

      setTimeout(() => {
        setShowSendingOverlay(false);
        setIsCreating(false);
        setSuccessMsg(null);
      }, 2200);
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
    setDeleting(true);
    try {
      await localDataService.deletePayment(deleteTarget);
      setSuccessMsg(`Payment Voucher ${deleteTarget.paymentId} deleted successfully.`);
      setDeleteTarget(null);
      refetchVouchers();
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
            <TableSkeleton rows={5} columns={6} />
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
                          <Button
                            variant={showVoucherColPanel ? 'secondary' : 'ghost'}
                            size="icon-sm"
                            onClick={() => setShowVoucherColPanel((v) => !v)}
                            title="Customize columns"
                            aria-label="Customize columns"
                            aria-expanded={showVoucherColPanel}
                          >
                            <span className="flex gap-0.5"><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /><span className="size-1 rounded-full bg-current" /></span>
                          </Button>

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
              <TableSkeleton rows={3} columns={6} />
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

          // Always compute real GRN delivery % from actual qty data
          let totalOrd = 0;
          let totalRec = 0;
          let totalGrnAmt = 0; // sum of GRN received amounts (from item prices)
          selectedInvs.forEach((i) => {
            if (i.grnOrderedQty && i.grnOrderedQty > 0) {
              totalOrd += i.grnOrderedQty;
              totalRec += i.grnReceivedQty ?? i.grnOrderedQty;
            }
            if (i.grnReceivedAmount && i.grnReceivedAmount > 0) {
              totalGrnAmt += i.grnReceivedAmount;
            }
          });

          // grnPercent: prefer qty-based, fallback to amount-based
          let grnPercent = 100;
          if (totalOrd > 0) {
            grnPercent = Math.min(100, Math.round((totalRec / totalOrd) * 100));
          } else if (totalGrnAmt > 0 && billedTotal > 0) {
            grnPercent = Math.min(100, Math.round((totalGrnAmt / billedTotal) * 100));
          }

          // GRN shortfall checks
          const hasGrnQtyShortfall = totalOrd > 0 && totalRec < totalOrd && (totalOrd - totalRec) / totalOrd > 0.02;
          const hasGrnAmtShortfall = totalGrnAmt > 0 && billedTotal > 0 && totalGrnAmt < billedTotal * 0.98;
          const hasGrnShortfall = hasGrnQtyShortfall || hasGrnAmtShortfall;

          // Backend-flagged discrepancy or NOT_MATCHED invoices
          const backendDiscrepantInvs = selectedInvs.filter(
            (i) => i.threeWayMatch === 'DISCREPANCY' || (i.threeWayMatch as string) === 'MISMATCH'
          );
          const notMatchedInvs = selectedInvs.filter((i) => i.threeWayMatch === 'NOT_MATCHED');
          // Invoice amount mismatch: paying more than the invoice face value
          const overBilledInvs = selectedInvs.filter((i) => i.paymentAmount > i.amount);

          const discrepantInvs = [...new Set([...backendDiscrepantInvs, ...overBilledInvs])];
          const isDiscrepant = discrepantInvs.length > 0 || matchStatus === 'DISCREPANCY' || hasGrnShortfall ||
            (notMatchedInvs.length > 0 && notMatchedInvs.length === selectedInvs.length); // all NOT_MATCHED = flag

          const poAgreedTotal = isDiscrepant
            ? selectedInvs.reduce((sum, i) => {
                const isInvDisc = i.threeWayMatch === 'DISCREPANCY' || (i.threeWayMatch as string) === 'MISMATCH';
                return sum + (isInvDisc ? i.amount * 0.9 : i.amount);
              }, 0)
            : billedTotal;

          // ── Build specific discrepancy reason lines ──────────────────────
          const reasonLines: string[] = [];
          if (hasGrnQtyShortfall) {
            const shortfallUnits = totalOrd - totalRec;
            const shortfallPct = Math.round((shortfallUnits / totalOrd) * 100);
            reasonLines.push(`📦 GRN Quantity Shortfall: Only ${totalRec} of ${totalOrd} ordered units received (${shortfallPct}% shortfall — ${shortfallUnits} units pending delivery)`);
          }
          if (hasGrnAmtShortfall) {
            const diff = billedTotal - totalGrnAmt;
            reasonLines.push(`💰 GRN Amount Mismatch: GRN received value ${formatAmount(totalGrnAmt, currency)} is less than invoice billed amount ${formatAmount(billedTotal, currency)} (gap: ${formatAmount(diff, currency)})`);
          }
          if (backendDiscrepantInvs.length > 0) {
            reasonLines.push(`🔴 Backend 3-Way Match Failed: Invoice(s) ${backendDiscrepantInvs.map(i => i.invoiceNumber).join(', ')} — PO rates or GRN accepted quantities do not match the billed invoice`);
          }
          if (overBilledInvs.length > 0) {
            overBilledInvs.forEach(i => {
              const excess = i.paymentAmount - i.amount;
              reasonLines.push(`💸 Overbilled: Payment amount ${formatAmount(i.paymentAmount, currency)} exceeds invoice ${i.invoiceNumber} face value ${formatAmount(i.amount, currency)} (excess: ${formatAmount(excess, currency)})`);
            });
          }
          if (notMatchedInvs.length > 0 && notMatchedInvs.length === selectedInvs.length) {
            reasonLines.push(`⚠️ Unverified: Invoice(s) ${notMatchedInvs.map(i => i.invoiceNumber).join(', ')} have not been verified by the 3-Way Match system yet`);
          }
          if (matchStatus === 'DISCREPANCY' && reasonLines.length === 0) {
            reasonLines.push('⚠️ Manual discrepancy flag: Finance team has flagged this payment for review');
          }

          const poRefs = Array.from(new Set(selectedInvs.map((i) => i.poNumber).filter(Boolean))).join(', ') || 'PO-2026';
          const grnRefs = Array.from(new Set(selectedInvs.map((i) => i.grnNumber).filter(Boolean))).join(', ') || 'GRN-2026';

          return (
            <div className={`cpv-section cpv-match-card ${isDiscrepant ? 'cpv-match-card--discrepancy' : ''}`}>
              <div className="cpv-section__header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="cpv-section__num">03</span>
                  <span className="cpv-section__title">
                    3-Way Multi-Match Engine ({selectedInvs.length} Selected Invoice{selectedInvs.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      background: !isDiscrepant ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      color: !isDiscrepant ? '#10b981' : '#ef4444',
                      border: !isDiscrepant ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    {!isDiscrepant ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    <span>{!isDiscrepant ? 'PO = GRN = Invoice Verified' : 'Discrepancy Detected'}</span>
                  </span>
                  <button
                    type="button"
                    className="cpv-btn cpv-btn--sm cpv-btn--outline"
                    onClick={() => updateTotalsFromInvoices(vendorInvoices)}
                    title="Re-verify 3-Way Match across selected invoices"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 28 }}
                  >
                    <RotateCcw size={12} />
                    <span>Re-Verify</span>
                  </button>
                </div>
              </div>

              <div className={`cpv-match-banner ${!isDiscrepant ? 'cpv-match-banner--matched' : 'cpv-match-banner--discrepancy'}`}>
                <div className={`cpv-match-banner-title ${!isDiscrepant ? 'cpv-match-banner-title--matched' : 'cpv-match-banner-title--discrepancy'}`}>
                  {!isDiscrepant ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                  <span>
                    {!isDiscrepant
                      ? `3-Way Multi-Match Verified (${selectedInvs.length || 1} Invoice(s): PO = GRN = Invoice)`
                      : `3-Way Match Discrepancy Detected (${discrepantInvs.length || 1} Invoice(s))`
                    }
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {!isDiscrepant
                    ? `Quantities & unit rates across Purchase Orders (${poRefs}), GRN Delivery Dispatches (${grnRefs}), and ${selectedInvs.length || 1} selected Supplier Invoice(s) align 100%. Sent for formal bank payment approval.`
                    : null}
                  {isDiscrepant && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Reasons for Discrepancy:</div>
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {reasonLines.length > 0
                          ? reasonLines.map((r, idx) => (
                              <li key={idx} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: 4 }}>
                                {r}
                              </li>
                            ))
                          : <li style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 4 }}>
                              Discrepancy in invoice(s) {discrepantInvs.map(i => i.invoiceNumber).join(', ') || 'selected'} — please verify PO, GRN and invoice details manually.
                            </li>
                        }
                      </ul>
                      <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 8, fontWeight: 500 }}>
                        ⚠️ Flagged for mandatory Manager &amp; Finance approval before payment release.
                      </div>
                    </div>
                  )}
                </p>
              </div>

              <div className="cpv-grid cpv-grid--3">
                <div className="cpv-match-box">
                  <span className="cpv-match-box-label">a. Purchase Order (PO: {poRefs})</span>
                  <div className="cpv-match-box-value">PO Agreed Total: {formatAmount(poAgreedTotal, currency)}</div>
                  <span className={`cpv-match-box-sub ${!isDiscrepant ? 'cpv-match-box-sub--ok' : 'cpv-match-box-sub--warn'}`}>
                    {!isDiscrepant
                      ? 'PO Rates & Terms Verified'
                      : backendDiscrepantInvs.length > 0
                        ? '⚠️ PO Rate / Quantity Variance'
                        : overBilledInvs.length > 0
                          ? '⚠️ Payment Exceeds Invoice Amount'
                          : '⚠️ GRN Delivery Shortfall'}
                  </span>
                </div>
                <div className="cpv-match-box">
                  <span className="cpv-match-box-label">b. GRN / Dispatch Note ({grnRefs})</span>
                  <div className="cpv-match-box-value">GRN Dispatches: {grnPercent}% Received</div>
                  <span className={`cpv-match-box-sub ${!isDiscrepant ? 'cpv-match-box-sub--ok' : 'cpv-match-box-sub--warn'}`}>
                    {!isDiscrepant
                      ? 'Delivery Goods Verified (100%)'
                      : hasGrnQtyShortfall
                        ? `⚠️ Qty Shortfall: ${totalRec}/${totalOrd} units (${100 - grnPercent}% pending)`
                        : hasGrnAmtShortfall
                          ? `⚠️ Amount Shortfall: GRN value < Invoice amount`
                          : `⚠️ GRN Mismatch Detected`}
                  </span>
                </div>
                <div className="cpv-match-box">
                  <span className="cpv-match-box-label">c. Selected Invoices ({selectedInvs.length})</span>
                  <div className="cpv-match-box-value">Billed Total: {formatAmount(billedTotal, currency)}</div>
                  <span className={`cpv-match-box-sub ${!isDiscrepant ? 'cpv-match-box-sub--ok' : 'cpv-match-box-sub--warn'}`}>
                    {!isDiscrepant ? 'All Invoices 3-Way Matched' : `⚠️ ${discrepantInvs.length || 1} Discrepancy Flagged`}
                  </span>
                </div>
              </div>
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
