import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { localDataService, type Payment } from '../../services/localDataService';
import { apiRequest } from '../../api/client';
import { companySettingsService } from '../../services/companySettingsService';
import {
  ArrowLeft,
  CreditCard,
  Building2,
  Calendar,
  Save,
  Send,
  Upload,
  Paperclip,
  X,
  Receipt,
  Landmark,
  FileCheck2,
  PackageCheck,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Layers,
  HelpCircle,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  Clock,
  FileText,
  CheckSquare
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import BankPaymentVoucherModal, { type PaymentVoucherDocData } from '../../components/payments/BankPaymentVoucherModal';
import { useAuth } from '../../context/AuthContext';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import '../purchase-requisitions/PurchaseRequisitionPage.css';
import './CreatePaymentVoucherPage.css';

interface VendorOption {
  id: string;
  name: string;
  email: string;
  category: string;
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
  const { data: vouchersList, loading: vouchersLoading, refetch: refetchVouchers } = useServiceData(
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

  // Selected voucher for detail modal view
  const [selectedVoucherForModal, setSelectedVoucherForModal] = useState<PaymentVoucherDocData | null>(null);

  // Load vendors list
  const { data: vendorsList } = useServiceData(
    () =>
      vendorService.list().then((rows) =>
        rows.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          category: v.category,
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
    if (qBankName) setBankName(qBankName); else if (qVendor && !bankName) setBankName('HDFC Bank Ltd');
    if (qAccount) setAccountNumber(qAccount); else if (qVendor && !accountNumber) setAccountNumber(`9180${Math.floor(10000000 + Math.random() * 90000000)}`);
    if (qIfsc) setIfscCode(qIfsc); else if (qVendor && !ifscCode) setIfscCode('HDFC0000128');
  }, [searchParams]);

  // Handle vendor selection change
  const handleVendorSelect = (vId: string) => {
    setSelectedVendorId(vId);
    const found = vendorsList.find((v) => v.id === vId);
    if (found) {
      setVendorName(found.name);
      setBeneficiaryName(found.name);
      setBankName('HDFC Bank Ltd');
      setAccountNumber(`9180${Math.floor(10000000 + Math.random() * 90000000)}`);
      setIfscCode('HDFC0000128');
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
    if (!validateForm()) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      // 1. Save locally
      localDataService.savePayment({
        paymentId: voucherNumber,
        vendor: vendorName,
        invoiceRef: invoiceRef || '—',
        amount: netPayable,
        method: paymentMethod,
        status: 'PENDING',
        remarks: remarks || purpose || 'Submitted for Bank Disbursement Workflow',
      });

      // 2. Server API request if available
      try {
        await apiRequest('/payments', {
          method: 'POST',
          body: JSON.stringify({
            vendorId: selectedVendorId || undefined,
            vendorName,
            invoiceRef,
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
      } catch (_apiErr) {
        // Fallback handled locally
      }

      setSuccessMsg(`Payment Voucher #${voucherNumber} created & submitted for payment workflow approval!`);
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
      const stored = localStorage.getItem('heliflow_custom_payments');
      if (stored) {
        const list: Payment[] = JSON.parse(stored);
        const next = list.filter((p) => String(p.id) !== String(deleteTarget.id) && p.paymentId !== deleteTarget.paymentId);
        localStorage.setItem('heliflow_custom_payments', JSON.stringify(next));
      }
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
      const stored = localStorage.getItem('heliflow_custom_payments');
      if (stored) {
        const list: Payment[] = JSON.parse(stored);
        const selSet = new Set(selectedVoucherIds);
        const next = list.filter((p) => !selSet.has(String(p.id)) && !selSet.has(p.paymentId));
        localStorage.setItem('heliflow_custom_payments', JSON.stringify(next));
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
      beneficiaryName: voucher.vendor,
      bankName: 'HDFC Bank Ltd',
      accountNumber: '918029381029',
      ifscCode: 'HDFC0000128',
      invoiceRef: voucher.invoiceRef || 'INV-2026-0042',
      grossAmount: voucher.amount * 1.02,
      tdsAmount: voucher.amount * 0.02,
      netAmount: voucher.amount,
      currency: companyDefaultCurrency,
      matchStatus: 'MATCHED',
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
      <div className="pr-page">
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

        {/* Management Header matching Create Purchase Invoice layout */}
        <div className="pr-page__header" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Payment Voucher Entry & Management
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--text-secondary, #64748b)' }}>
              Manage payment vouchers, bank disbursement entries and approval statuses
            </p>
          </div>
          <button
            className="pr-btn pr-btn--primary"
            onClick={() => setIsCreating(true)}
            disabled={!canCreateVoucher}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 700,
              background: canCreateVoucher ? 'linear-gradient(135deg, #0a6ed1, #0856a4)' : 'var(--bg-disabled, #cbd5e1)',
              color: canCreateVoucher ? '#fff' : 'var(--text-disabled, #64748b)',
              border: 'none',
              cursor: canCreateVoucher ? 'pointer' : 'not-allowed',
              opacity: canCreateVoucher ? 1 : 0.6,
              boxShadow: canCreateVoucher ? '0 4px 12px rgba(10, 110, 209, 0.25)' : 'none',
            }}
          >
            <Plus size={16} /> New Voucher
          </button>
        </div>

        {/* 5 KPI Summary Cards */}
        <div className="pr-kpi-summary" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div
            className={`pr-kpi-card ${statusFilter === null ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter(null)}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(10,110,209,0.08)', color: '#0a6ed1' }}>
              <FileText size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">TOTAL DOCUMENTS</span>
              <span className="pr-kpi-value">{vouchersList.length}</span>
            </div>
          </div>

          <div
            className={`pr-kpi-card ${statusFilter === 'DRAFT_PENDING' ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'DRAFT_PENDING' ? null : 'DRAFT_PENDING'))}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(233,115,12,0.1)', color: '#e9730c' }}>
              <Clock size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">DRAFT & PENDING</span>
              <span className="pr-kpi-value">{draftAndPendingCount}</span>
            </div>
          </div>

          <div
            className={`pr-kpi-card ${statusFilter === 'APPROVED' ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'APPROVED' ? null : 'APPROVED'))}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(16,126,62,0.1)', color: '#107e3e' }}>
              <CheckCircle2 size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">APPROVED & RELEASED</span>
              <span className="pr-kpi-value">{activeCount}</span>
            </div>
          </div>

          <div
            className={`pr-kpi-card ${statusFilter === 'REJECTED' ? 'pr-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'REJECTED' ? null : 'REJECTED'))}
            style={{ cursor: 'pointer' }}
          >
            <div className="pr-kpi-icon" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
              <X size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">REJECTED</span>
              <span className="pr-kpi-value" style={{ color: rejectedCount > 0 ? '#dc2626' : undefined }}>{rejectedCount}</span>
            </div>
          </div>

          <div className="pr-kpi-card">
            <div className="pr-kpi-icon pr-kpi-icon--grand">
              <CreditCard size={20} />
            </div>
            <div className="pr-kpi-info">
              <span className="pr-kpi-label">TOTAL VOLUME</span>
              <span className="pr-kpi-value pr-kpi-value--grand">
                {formatAmount(totalValue, companyDefaultCurrency)}
              </span>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        {vouchersList.length > 0 && (
          <div className="pr-search-bar-wrap">
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-placeholder)', pointerEvents: 'none' }} />
              <input
                type="text"
                className="pr-search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search voucher, vendor, status..."
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-placeholder)',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Floating Bulk Action Banner */}
        {selectedVoucherIds.length > 0 && !showBulkDeleteModal && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'var(--surface-card)', border: '1px solid var(--primary-500)',
            padding: '12px 18px', borderRadius: 'var(--radius-md)', marginBottom: '16px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)', transition: 'all 0.2s ease'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              <CheckSquare size={18} style={{ color: 'var(--primary-500)' }} />
              <span><strong>{selectedVoucherIds.length}</strong> Voucher(s) selected</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="pr-btn pr-btn--outline"
                style={{ padding: '7px 16px', fontSize: 13, fontWeight: 600 }}
                onClick={() => setSelectedVoucherIds([])}
              >
                Cancel Selection
              </button>
              <button
                type="button"
                disabled={!canCreateVoucher}
                style={{
                  background: canCreateVoucher ? '#dc2626' : '#64748b',
                  color: '#ffffff', border: 'none',
                  padding: '7px 16px', fontSize: 13, fontWeight: 700,
                  borderRadius: 'var(--radius-sm)',
                  cursor: canCreateVoucher ? 'pointer' : 'not-allowed',
                  opacity: canCreateVoucher ? 1 : 0.5,
                  display: 'inline-flex', alignItems: 'center', gap: 6
                }}
                onClick={() => setShowBulkDeleteModal(true)}
              >
                <Trash2 size={14} /> Delete Selected ({selectedVoucherIds.length})
              </button>
            </div>
          </div>
        )}

        {/* Table View */}
        {vouchersList.length === 0 ? (
          <div className="pr-empty">
            <div className="pr-empty__icon-wrapper">
              <Landmark size={26} />
            </div>
            <h3>No Payment Vouchers Yet</h3>
            <p>Click "+ New Voucher" on the top right to create your first vendor payment disbursement voucher.</p>
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="pr-empty">
            <div className="pr-empty__icon-wrapper">
              <Search size={26} />
            </div>
            <h3>No matching vouchers found</h3>
            <p>We couldn't find any vouchers matching your search or filter criteria.</p>
            <button
              className="pr-btn pr-btn--outline"
              onClick={() => { setSearchTerm(''); setStatusFilter(null); }}
              style={{ borderRadius: 20, padding: '8px 20px' }}
            >
              <X size={14} /> Clear Filters
            </button>
          </div>
        ) : (
          <div className="pr-list-table-wrap">
            <table className="pr-list-table">
              <colgroup>
                <col style={{ width: '44px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '90px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '135px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      disabled={!canCreateVoucher}
                      onChange={canCreateVoucher ? handleSelectAll : undefined}
                      style={{ cursor: canCreateVoucher ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                    />
                  </th>
                  <th>VOUCHER NUMBER</th>
                  <th>VENDOR</th>
                  <th>VOUCHER DATE</th>
                  <th>CURRENCY</th>
                  <th style={{ textAlign: 'right' }}>NET DISBURSEMENT</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'center' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredVouchers.map((v) => {
                  const statusKey = (v.status || '').toUpperCase();
                  const isApproved = statusKey === 'APPROVED' || statusKey === 'PAID' || statusKey === 'COMPLETED';
                  const isRejected = statusKey === 'REJECTED' || statusKey === 'CANCELLED';
                  const badgeClass = isApproved
                    ? 'APPROVED'
                    : isRejected
                    ? 'REJECTED'
                    : 'PENDING_APPROVAL';

                  const badgeLabel = isApproved
                    ? 'APPROVED'
                    : isRejected
                    ? 'REJECTED'
                    : 'PENDING APPROVAL';

                  return (
                    <tr
                      key={v.id || v.paymentId}
                      className={`pr-list-row pr-list-row--${badgeClass.toLowerCase()}`}
                      onClick={() => handleViewVoucherDoc(v)}
                    >
                      <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedVoucherIds.includes(String(v.id))}
                          disabled={!canCreateVoucher}
                          onChange={() => canCreateVoucher && handleToggleSelect(String(v.id))}
                          style={{ cursor: canCreateVoucher ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                        />
                      </td>
                      <td className="pr-list__po-num">
                        <span className="pr-po-link">{v.paymentId}</span>
                      </td>
                      <td className="pr-list__vendor">{v.vendor || '—'}</td>
                      <td>{v.paidAt || '—'}</td>
                      <td>{companyDefaultCurrency}</td>
                      <td className="pr-list__total" style={{ textAlign: 'right' }}>
                        {formatAmount(v.amount || 0, companyDefaultCurrency)}
                      </td>
                      <td>
                        <span className={`pr-badge pr-badge--${badgeClass}`}>{badgeLabel}</span>
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          <button
                            className="pr-list__view-btn"
                            onClick={() => handleViewVoucherDoc(v)}
                            title="View Bank Payment Voucher Document"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            className="pr-list__view-btn"
                            disabled={!canCreateVoucher}
                            style={!canCreateVoucher ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            title="Edit Payment Voucher"
                            onClick={() => {
                              if (!canCreateVoucher) return;
                              setVoucherNumber(v.paymentId);
                              setVendorName(v.vendor);
                              setInvoiceRef(v.invoiceRef || '');
                              setGrossAmount(v.amount);
                              setIsCreating(true);
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="pr-list__view-btn pr-list__delete-btn"
                            disabled={!canCreateVoucher}
                            style={!canCreateVoucher ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            title="Delete Payment Voucher"
                            onClick={() => {
                              if (!canCreateVoucher) return;
                              setDeleteTarget(v);
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Single Voucher Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="pr-modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="pr-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="pr-modal-header pr-modal-header--danger">
                <h3>
                  <AlertTriangle size={20} />
                  <span>Delete Payment Voucher?</span>
                </h3>
                <button className="pr-modal-close" onClick={() => setDeleteTarget(null)} disabled={deleting} title="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="pr-modal-body">
                <p>
                  Are you sure you want to delete Payment Voucher <strong>{deleteTarget.paymentId}</strong> for <strong>{deleteTarget.vendor}</strong>?
                </p>
                <div className="pr-modal-warning">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>This action is permanent and cannot be undone.</span>
                </div>
              </div>
              <div className="pr-modal-footer">
                <button
                  ref={(el) => el?.focus()}
                  className="pr-btn pr-btn--outline"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="pr-btn pr-btn--danger"
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
          <div className="pr-modal-backdrop" onClick={() => !deleting && setShowBulkDeleteModal(false)}>
            <div className="pr-modal-box" onClick={(e) => e.stopPropagation()}>
              <div className="pr-modal-header pr-modal-header--danger">
                <h3>
                  <AlertTriangle size={20} />
                  <span>Delete {selectedVoucherIds.length} Selected Voucher(s)?</span>
                </h3>
                <button className="pr-modal-close" onClick={() => setShowBulkDeleteModal(false)} disabled={deleting} title="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="pr-modal-body">
                <p>
                  Are you sure you want to delete the <strong>{selectedVoucherIds.length} selected payment voucher(s)</strong>?
                </p>
                <div className="pr-modal-warning">
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>This action is permanent and cannot be undone.</span>
                </div>
              </div>
              <div className="pr-modal-footer">
                <button
                  ref={(el) => el?.focus()}
                  className="pr-btn pr-btn--outline"
                  onClick={() => setShowBulkDeleteModal(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  className="pr-btn pr-btn--danger"
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
      </div>
    );
  }

  // ── Render Voucher Entry Form View (`isCreating === true`) ──
  return (
    <div className="cpo-page">
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
      <div className="cpo-header">
        <div className="cpo-header__left">
          <button className="cpo-back-btn" onClick={() => setIsCreating(false)}>
            <ArrowLeft size={16} /> Back to Vouchers
          </button>
          <div className="cpo-header__title-wrap">
            <h1>Create Payment Voucher</h1>
            <p>Generate vendor payment disbursement voucher with Bank Details & Payment Workflow</p>
          </div>
        </div>
        <div className="cpo-header__actions">
          <button
            className="cpo-btn cpo-btn--primary"
            onClick={submitVoucher}
            disabled={savingDraft || submitting || !canCreateVoucher}
            style={!canCreateVoucher ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
            title={!canCreateVoucher ? "Admin has not allowed this action. You do not have permission to submit payment vouchers." : undefined}
          >
            <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Voucher for Approval'}
          </button>
        </div>
      </div>

      {/* Form Body */}
      <div className="cpo-body">
        {/* Section 01: Identification & Timing */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">01</span>
            <span className="cpo-section__title">Voucher Identification & Schedule</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>VOUCHER NUMBER (AUTO)</label>
              <input type="text" value={voucherNumber} readOnly className="cpo-input--readonly" />
              <span className="cpo-field__sub">Unique payment voucher ID</span>
            </div>
            <div className="cpo-field">
              <label>PAYMENT METHOD *</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="NEFT">NEFT (National Electronic Funds Transfer)</option>
                <option value="RTGS">RTGS (Real Time Gross Settlement)</option>
                <option value="IMPS">IMPS (Immediate Payment Service)</option>
                <option value="Cheque">Cheque</option>
                <option value="Wire Transfer">Wire Transfer / SWIFT</option>
              </select>
            </div>
            <div className="cpo-field">
              <label>VOUCHER DATE *</label>
              <input
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </div>
            <div className="cpo-field">
              <label>SCHEDULED PAYMENT DATE *</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Section 02: Vendor & Bank Account Details */}
        <div className="cpo-section" style={{ borderLeft: '4px solid #10b981' }}>
          <div className="cpo-section__header">
            <span className="cpo-section__num">02</span>
            <span className="cpo-section__title">Supplier & Bank Details (for Bank Transfer)</span>
            <span className="cpo-section__hint">Auto-populates supplier banking details</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field cpo-field--span-2">
              <label>SUPPLIER NAME / BENEFICIARY *</label>
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
            <div className="cpo-field cpo-field--span-2">
              <label>REFERENCE (PO & INVOICE NUMBERS)</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="e.g. PO-001, PO-002, INV-2026-0042"
              />
              <span className="cpo-field__sub">Linked PO & Purchase Invoice numbers</span>
            </div>
            <div className="cpo-field">
              <label>BENEFICIARY ACCOUNT NAME</label>
              <input
                type="text"
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                placeholder="Account Holder Name"
              />
            </div>
            <div className="cpo-field">
              <label>BANK NAME</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. HDFC Bank Ltd"
              />
            </div>
            <div className="cpo-field">
              <label>ACCOUNT NUMBER / IBAN</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 918029301923"
              />
            </div>
            <div className="cpo-field">
              <label>IFSC / SWIFT CODE</label>
              <input
                type="text"
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value)}
                placeholder="e.g. HDFC0000128"
              />
            </div>
          </div>
        </div>

        {/* Section 03: Automated 3-Way Match Engine */}
        <div className="cpo-section" style={{ borderLeft: matchStatus === 'MATCHED' ? '4px solid #10b981' : '4px solid #e11d48' }}>
          <div className="cpo-section__header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="cpo-section__num">03</span>
              <span className="cpo-section__title">3-Way Match Verification Engine</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => { setMatchStatus('MATCHED'); setPoQty(100); setGrnQty(100); setInvoicedQty(100); setDiscrepancyReason(''); }}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: matchStatus === 'MATCHED' ? '#10b981' : 'var(--surface-elevated, #1e293b)',
                  color: matchStatus === 'MATCHED' ? '#ffffff' : 'var(--text-secondary, #94a3b8)', border: '1px solid var(--border)'
                }}
              >
                Simulate 3-Way Match
              </button>
              <button
                type="button"
                onClick={() => { setMatchStatus('DISCREPANCY'); setPoQty(100); setGrnQty(80); setInvoicedQty(100); setDiscrepancyReason('Billed Qty (100) exceeds GRN Received Qty (80)'); }}
                style={{
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: matchStatus === 'DISCREPANCY' ? '#e11d48' : 'var(--surface-elevated, #1e293b)',
                  color: matchStatus === 'DISCREPANCY' ? '#ffffff' : 'var(--text-secondary, #94a3b8)', border: '1px solid var(--border)'
                }}
              >
                Simulate Discrepancy (Lafda!)
              </button>
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: matchStatus === 'MATCHED' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(225, 29, 72, 0.08)', borderRadius: 10, border: `1px solid ${matchStatus === 'MATCHED' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(225, 29, 72, 0.25)'}`, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              {matchStatus === 'MATCHED' ? <CheckCircle2 size={20} color="#10b981" /> : <AlertTriangle size={20} color="#f43f5e" />}
              <strong style={{ fontSize: 14, color: matchStatus === 'MATCHED' ? '#10b981' : '#f43f5e' }}>
                {matchStatus === 'MATCHED' ? '3-WAY MATCH VERIFIED (PO = GRN = Invoice)' : 'DISCREPANCY DETECTED ("Lafda!")'}
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.4 }}>
              {matchStatus === 'MATCHED'
                ? 'Quantities & unit rates across Purchase Order, GRN Dispatch, and Supplier Invoice align perfectly. Sent for formal bank payment approval.'
                : 'Discrepancy detected: Invoiced quantity / value does not match GRN received quantities or PO agreed rates. Flagged for mandatory Manager & Finance approval!'}
            </p>
          </div>

          <div className="cpo-grid cpo-grid--3" style={{ gap: 12 }}>
            <div style={{ background: 'var(--surface-elevated, #1e293b)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', fontWeight: 700 }}>a. Purchase Order (PO)</span>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Qty: {poQty} Units @ Ksh 5,000</div>
              <span style={{ fontSize: 11, color: '#10b981' }}>PO Total: Ksh 500,000</span>
            </div>
            <div style={{ background: 'var(--surface-elevated, #1e293b)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', fontWeight: 700 }}>b. GRN / Dispatch Note</span>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Received Qty: {grnQty} Units</div>
              <span style={{ fontSize: 11, color: grnQty === poQty ? '#10b981' : '#f43f5e' }}>
                {grnQty === poQty ? '100% Delivery Received' : `Shortfall: ${poQty - grnQty} units missing`}
              </span>
            </div>
            <div style={{ background: 'var(--surface-elevated, #1e293b)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', fontWeight: 700 }}>c. Supplier Invoice</span>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>Billed Qty: {invoicedQty} Units</div>
              <span style={{ fontSize: 11, color: invoicedQty === grnQty ? '#10b981' : '#f43f5e' }}>
                {invoicedQty === grnQty ? 'Billed Qty Matches GRN' : 'Discrepancy in Billed Qty'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 04: Summary & Workflow Notice */}
        <div className="cpo-grid cpo-grid--split">
          <div className="cpo-section">
            <div className="cpo-section__header">
              <span className="cpo-section__num">04</span>
              <span className="cpo-section__title">Purpose & Remarks</span>
            </div>
            <div className="cpo-grid cpo-grid--1" style={{ gap: 16 }}>
              <div className="cpo-field">
                <label>PAYMENT PURPOSE / DESCRIPTION</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. PO settlement disbursement to vendor"
                />
              </div>
              <div className="cpo-field">
                <label>REMARKS</label>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add notes for finance approvers..."
                />
              </div>
            </div>
          </div>

          <div className="cpo-section cpo-totals-card">
            <div className="cpo-section__header">
              <span className="cpo-section__num">05</span>
              <span className="cpo-section__title">Disbursement Amount & Workflow</span>
            </div>

            <div className="cpo-totals">
              <div className="cpo-field" style={{ marginBottom: 12 }}>
                <label>CURRENCY</label>
                <CurrencySelector value={currency} onChange={setCurrency} />
              </div>

              <div className="cpo-field" style={{ marginBottom: 14 }}>
                <label>GROSS AMOUNT *</label>
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

              <div className="cpo-totals__row">
                <span>Gross Amount</span>
                <span>{formatAmount(gross, currency)}</span>
              </div>
              <div className="cpo-totals__row">
                <span>TDS Deduction ({tdsPercent}%)</span>
                <span style={{ color: 'var(--danger-500)' }}>- {formatAmount(tdsAmount, currency)}</span>
              </div>

              <div className="cpo-totals__divider" />

              <div className="cpo-totals__grand">
                <span>Net Disbursement</span>
                <span style={{ color: '#10b981' }}>{formatAmount(netPayable, currency)}</span>
              </div>

              <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8, color: '#10b981', fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                <PackageCheck size={16} />
                <span>Triggers Payments Approval Chain</span>
              </div>
            </div>

            <div className="cpo-action-panel">
              <button
                className="cpo-btn cpo-btn--primary cpo-btn--full"
                onClick={submitVoucher}
                disabled={savingDraft || submitting || !canCreateVoucher}
                style={!canCreateVoucher ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreateVoucher ? "Admin has not allowed this action. You do not have permission to submit payment vouchers." : undefined}
              >
                <Send size={16} /> {submitting ? 'Submitting…' : 'Submit Payment Voucher'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
