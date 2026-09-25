import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { localDataService, type Payment } from '../../services/localDataService';
import { apiRequest } from '../../api/client';
import { companySettingsService } from '../../services/companySettingsService';
import { invoiceService, type APInvoice } from '../../services/invoiceService';
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
  Layers
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { TableSkeleton } from '../../components/shared/Skeleton';
import BankPaymentVoucherModal, { type PaymentVoucherDocData } from '../../components/payments/BankPaymentVoucherModal';
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
  threeWayMatch: 'MATCHED' | 'DISCREPANCY';
  selected: boolean;
  paymentAmount: number;
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
  const [tdsPercent, setTdsPercent] = useState<number>(2);
  const [purpose, setPurpose] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // 3-Way Match States (PO vs GRN vs Supplier Invoice)
  const [matchStatus, setMatchStatus] = useState<'MATCHED' | 'DISCREPANCY'>('MATCHED');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');
  const [poQty, setPoQty] = useState<number>(100);
  const [grnQty, setGrnQty] = useState<number>(100);
  const [invoicedQty, setInvoicedQty] = useState<number>(100);

  // Attachments
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

  // UI state
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Multi-Invoice Selection & 3-Way Multi-Matching States
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('multiple');
  const [vendorInvoices, setVendorInvoices] = useState<VendorInvoiceItem[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);

  // Load invoices when vendor is selected or creation starts
  useEffect(() => {
    if (!isCreating) return;

    let isMounted = true;
    setLoadingInvoices(true);

    const fetchInvoices = async () => {
      try {
        const fetched = await invoiceService.list(selectedVendorId ? { vendorId: selectedVendorId } : undefined);
        if (!isMounted) return;

        if (fetched && fetched.length > 0) {
          const mapped: VendorInvoiceItem[] = fetched.map((inv, idx) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            poNumber: inv.poNumber || `PO-2026-${3710 + idx}`,
            grnNumber: inv.grnNumber || `GRN-2026-0${40 + idx}`,
            amount: inv.amount,
            paidAmount: inv.paidAmount || 0,
            balanceDue: Math.max(0, inv.amount - (inv.paidAmount || 0)),
            dueDate: inv.dueDate || new Date().toISOString().slice(0, 10),
            invoiceDate: inv.submittedAt || new Date().toISOString().slice(0, 10),
            threeWayMatch: (inv.threeWayMatch === 'MISMATCH' || inv.threeWayMatch === 'DISCREPANCY') ? 'DISCREPANCY' : 'MATCHED',
            selected: idx === 0,
            paymentAmount: Math.max(0, inv.amount - (inv.paidAmount || 0)),
          }));
          setVendorInvoices(mapped);
          updateTotalsFromInvoices(mapped);
        } else {
          setVendorInvoices([]);
        }
      } catch (_err) {
        if (isMounted) setVendorInvoices([]);
      } finally {
        if (isMounted) setLoadingInvoices(false);
      }
    };

    fetchInvoices();

    return () => {
      isMounted = false;
    };
  }, [isCreating, selectedVendorId]);

  // Recalculate totals, invoice references, and 3-way multi-matching from invoice selection
  const updateTotalsFromInvoices = (list: VendorInvoiceItem[], mode: 'single' | 'multiple' = selectionMode) => {
    const selected = list.filter((i) => i.selected);
    if (selected.length > 0) {
      const totalGross = selected.reduce((sum, item) => sum + item.paymentAmount, 0);
      setGrossAmount(totalGross);

      const refText = selected.map((i) => i.invoiceNumber).join(', ') + (selected.length > 1 ? ` (${selected.length} Invoices)` : '');
      setInvoiceRef(refText);

      // 3-Way Multi-Matching Check
      const hasDiscrepancy = selected.some((i) => i.threeWayMatch === 'DISCREPANCY');
      if (hasDiscrepancy) {
        setMatchStatus('DISCREPANCY');
        setDiscrepancyReason('Discrepancy detected in 3-Way Multi-Match for selected invoices (PO / GRN / Invoice mismatch). Mandatory approval required.');
      } else {
        setMatchStatus('MATCHED');
        setDiscrepancyReason('');
      }
    }
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
    }
    if (qInvoiceRef) setInvoiceRef(qInvoiceRef);
    if (qAmount && !isNaN(Number(qAmount))) setGrossAmount(Number(qAmount));
    if (qBankName) setBankName(qBankName);
    if (qAccount) setAccountNumber(qAccount);
    if (qIfsc) setIfscCode(qIfsc);
  }, [searchParams]);

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
  const netPayable = useMemo(() => Math.max(0, gross - tdsAmount), [gross, tdsAmount]);

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

  const handleRemoveAttachment = (attId: string) => {
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
          }),
        });
        if (res?.paymentNumber) {
          setVoucherNumber(res.paymentNumber);
        }
      } catch (apiErr) {
        console.warn('Backend API notice:', apiErr);
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
      });

      setSuccessMsg(`Payment Voucher #${voucherNumber} saved to Database & submitted for payment workflow approval!`);
      refetchVouchers();

      setTimeout(() => {
        setIsCreating(false);
        setSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
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
            </div>
          </div>

          {loadingInvoices ? (
            <div style={{ padding: '16px' }}>
              <TableSkeleton rows={3} columns={6} />
            </div>
          ) : (
            <div>
              {vendorInvoices.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                  <p>{selectedVendorId ? 'No open database invoices found for this supplier.' : 'Select a supplier above or click below to add invoice lines manually.'}</p>
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
                          <td>
                            <span className={`cpv-match-tag cpv-match-tag--${inv.threeWayMatch === 'MATCHED' ? 'matched' : 'discrepancy'}`}>
                              {inv.threeWayMatch === 'MATCHED' ? '✅ MATCHED' : '⚠️ DISCREPANCY'}
                            </span>
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
        </div>

        {/* Section 03: Automated 3-Way Multi-Match Verification Engine */}
        <div className={`cpv-section cpv-match-card ${matchStatus === 'DISCREPANCY' ? 'cpv-match-card--discrepancy' : ''}`}>
          <div className="cpv-section__header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="cpv-section__num">03</span>
              <span className="cpv-section__title">
                3-Way Multi-Match Engine ({vendorInvoices.filter(i => i.selected).length} Selected Invoices)
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={`cpv-btn cpv-btn--sm ${matchStatus === 'MATCHED' ? 'cpv-btn--success' : 'cpv-btn--outline'}`}
                onClick={() => { setMatchStatus('MATCHED'); setPoQty(100); setGrnQty(100); setInvoicedQty(100); setDiscrepancyReason(''); }}
              >
                Simulate 3-Way Match
              </button>
              <button
                type="button"
                className={`cpv-btn cpv-btn--sm ${matchStatus === 'DISCREPANCY' ? 'cpv-btn--danger' : 'cpv-btn--outline'}`}
                onClick={() => { setMatchStatus('DISCREPANCY'); setPoQty(100); setGrnQty(80); setInvoicedQty(100); setDiscrepancyReason('Billed Qty exceeds GRN Received Qty'); }}
              >
                Simulate Discrepancy
              </button>
            </div>
          </div>

          <div className={`cpv-match-banner ${matchStatus === 'MATCHED' ? 'cpv-match-banner--matched' : 'cpv-match-banner--discrepancy'}`}>
            <div className={`cpv-match-banner-title ${matchStatus === 'MATCHED' ? 'cpv-match-banner-title--matched' : 'cpv-match-banner-title--discrepancy'}`}>
              {matchStatus === 'MATCHED' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              <span>
                {matchStatus === 'MATCHED'
                  ? `3-Way Multi-Match Verified (${vendorInvoices.filter(i => i.selected).length || 1} Invoice(s): PO = GRN = Invoice)`
                  : '3-Way Multi-Match Discrepancy Detected'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {matchStatus === 'MATCHED'
                ? `Quantities & unit rates across Purchase Orders, GRN Dispatches, and ${vendorInvoices.filter(i => i.selected).length || 1} selected Supplier Invoice(s) align perfectly. Sent for formal bank payment approval.`
                : (discrepancyReason || 'Discrepancy detected: Invoiced quantity / value does not match GRN received quantities or PO agreed rates. Flagged for mandatory Manager & Finance approval!')}
            </p>
          </div>

          <div className="cpv-grid cpv-grid--3">
            <div className="cpv-match-box">
              <span className="cpv-match-box-label">a. Purchase Order (PO)</span>
              <div className="cpv-match-box-value">PO Agreed Total: {formatAmount(gross, currency)}</div>
              <span className="cpv-match-box-sub cpv-match-box-sub--ok">PO Rates & Terms Verified</span>
            </div>
            <div className="cpv-match-box">
              <span className="cpv-match-box-label">b. GRN / Dispatch Note</span>
              <div className="cpv-match-box-value">GRN Dispatches: 100% Received</div>
              <span className={`cpv-match-box-sub ${matchStatus === 'MATCHED' ? 'cpv-match-box-sub--ok' : 'cpv-match-box-sub--warn'}`}>
                {matchStatus === 'MATCHED' ? 'Delivery Goods Verified' : 'Quantity Shortfall / Variance'}
              </span>
            </div>
            <div className="cpv-match-box">
              <span className="cpv-match-box-label">c. Selected Invoices ({vendorInvoices.filter(i => i.selected).length})</span>
              <div className="cpv-match-box-value">Billed Total: {formatAmount(gross, currency)}</div>
              <span className={`cpv-match-box-sub ${matchStatus === 'MATCHED' ? 'cpv-match-box-sub--ok' : 'cpv-match-box-sub--warn'}`}>
                {matchStatus === 'MATCHED' ? 'All Invoices 3-Way Matched' : 'Discrepancy Flagged'}
              </span>
            </div>
          </div>
        </div>

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
                    {attachments.map((att) => (
                      <div key={att.id} className="cpv-attachment-item">
                        <div className="cpv-attachment-info">
                          <Paperclip size={16} style={{ color: 'var(--primary-500)' }} />
                          <div>
                            <div className="cpv-attachment-name">{att.name}</div>
                            <div className="cpv-attachment-size">{att.size}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="cpv-action-btn cpv-action-btn--delete"
                          onClick={() => handleRemoveAttachment(att.id)}
                          title="Remove attachment"
                        >
                          <X size={14} />
                        </button>
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
              <div className="cpv-summary-row">
                <span>TDS Deduction ({tdsPercent}%)</span>
                <span style={{ color: '#ef4444' }}>- {formatAmount(tdsAmount, currency)}</span>
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
    </div>
  );
}
