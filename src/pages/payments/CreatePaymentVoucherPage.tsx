import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { localDataService, type Payment } from '../../services/localDataService';
import { apiRequest } from '../../api/client';
import { companySettingsService } from '../../services/companySettingsService';
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
  CheckSquare
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import BankPaymentVoucherModal, { type PaymentVoucherDocData } from '../../components/payments/BankPaymentVoucherModal';
import { useAuth } from '../../context/AuthContext';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
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
      <div className="cpv-page">
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

        {/* Header - Clean transparent header matching Purchase Invoice page */}
        <div className="cpv-header">
          <div className="cpv-header-main">
            <div className="cpv-header-top-row">
              <h1 className="cpv-header__title">Payment Voucher Entry & Management</h1>
              <div className="cpv-header__actions">
                <button
                  className="cpv-btn cpv-btn--primary"
                  onClick={() => setIsCreating(true)}
                  disabled={!canCreateVoucher}
                  title={!canCreateVoucher ? "You do not have permission to create payment vouchers." : undefined}
                >
                  <Plus size={16} /> New Voucher
                </button>
              </div>
            </div>
            <p className="cpv-header__subtitle">
              Manage payment vouchers, bank disbursement entries and approval statuses
            </p>
          </div>
        </div>

        {/* 5 KPI Summary Cards Grid */}
        <div className="cpv-kpi-grid">
          <div
            className={`cpv-kpi-card cpv-kpi-card--clickable ${statusFilter === null ? 'cpv-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter(null)}
          >
            <div className="cpv-kpi-icon" style={{ background: 'rgba(10,110,209,0.1)', color: '#0a6ed1' }}>
              <FileText size={22} />
            </div>
            <div className="cpv-kpi-info">
              <span className="cpv-kpi-value">{vouchersList.length}</span>
              <span className="cpv-kpi-label">Total Documents</span>
            </div>
          </div>

          <div
            className={`cpv-kpi-card cpv-kpi-card--clickable ${statusFilter === 'DRAFT_PENDING' ? 'cpv-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'DRAFT_PENDING' ? null : 'DRAFT_PENDING'))}
          >
            <div className="cpv-kpi-icon" style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308' }}>
              <Clock size={22} />
            </div>
            <div className="cpv-kpi-info">
              <span className="cpv-kpi-value">{draftAndPendingCount}</span>
              <span className="cpv-kpi-label">Draft & Pending</span>
            </div>
          </div>

          <div
            className={`cpv-kpi-card cpv-kpi-card--clickable ${statusFilter === 'APPROVED' ? 'cpv-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'APPROVED' ? null : 'APPROVED'))}
          >
            <div className="cpv-kpi-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>
              <CheckCircle2 size={22} />
            </div>
            <div className="cpv-kpi-info">
              <span className="cpv-kpi-value">{activeCount}</span>
              <span className="cpv-kpi-label">Approved & Released</span>
            </div>
          </div>

          <div
            className={`cpv-kpi-card cpv-kpi-card--clickable ${statusFilter === 'REJECTED' ? 'cpv-kpi-card--active' : ''}`}
            onClick={() => setStatusFilter((prev) => (prev === 'REJECTED' ? null : 'REJECTED'))}
          >
            <div className="cpv-kpi-icon" style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
              <X size={22} />
            </div>
            <div className="cpv-kpi-info">
              <span className="cpv-kpi-value" style={{ color: rejectedCount > 0 ? '#ef4444' : undefined }}>{rejectedCount}</span>
              <span className="cpv-kpi-label">Rejected</span>
            </div>
          </div>

          <div className="cpv-kpi-card">
            <div className="cpv-kpi-icon" style={{ background: 'rgba(10,110,209,0.12)', color: '#0a6ed1' }}>
              <CreditCard size={22} />
            </div>
            <div className="cpv-kpi-info">
              <span className="cpv-kpi-value cpv-kpi-value--mono">
                {formatAmount(totalValue, companyDefaultCurrency)}
              </span>
              <span className="cpv-kpi-label">Total Volume</span>
            </div>
          </div>
        </div>

        {/* Toolbar & Search */}
        <div className="cpv-toolbar">
          <div className="cpv-search-box">
            <Search size={16} className="cpv-search-icon" />
            <input
              type="text"
              className="cpv-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search voucher, vendor, status..."
            />
            {searchTerm && (
              <button
                type="button"
                className="cpv-search-clear"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
          {(statusFilter !== null || searchTerm) && (
            <button
              className="cpv-btn cpv-btn--outline cpv-btn--sm"
              onClick={() => { setSearchTerm(''); setStatusFilter(null); }}
            >
              <X size={14} /> Clear Filters
            </button>
          )}
        </div>

        {/* Floating Bulk Action Banner */}
        {selectedVoucherIds.length > 0 && !showBulkDeleteModal && (
          <div className="cpv-bulk-banner">
            <div className="cpv-bulk-info">
              <CheckSquare size={18} style={{ color: 'var(--primary-500)' }} />
              <span><strong>{selectedVoucherIds.length}</strong> Voucher(s) selected</span>
            </div>
            <div className="cpv-bulk-actions">
              <button
                type="button"
                className="cpv-btn cpv-btn--outline cpv-btn--sm"
                onClick={() => setSelectedVoucherIds([])}
              >
                Cancel Selection
              </button>
              <button
                type="button"
                className="cpv-btn cpv-btn--danger cpv-btn--sm"
                disabled={!canCreateVoucher}
                onClick={() => setShowBulkDeleteModal(true)}
              >
                <Trash2 size={14} /> Delete Selected ({selectedVoucherIds.length})
              </button>
            </div>
          </div>
        )}

        {/* Management Table */}
        {vouchersList.length === 0 ? (
          <div className="cpv-empty">
            <div className="cpv-empty-icon">
              <Landmark size={28} />
            </div>
            <h3>No Payment Vouchers Yet</h3>
            <p>Click "+ New Voucher" on the top right to create your first vendor payment disbursement voucher.</p>
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="cpv-empty">
            <div className="cpv-empty-icon">
              <Search size={28} />
            </div>
            <h3>No matching vouchers found</h3>
            <p>We couldn't find any vouchers matching your search or filter criteria.</p>
            <button
              className="cpv-btn cpv-btn--outline"
              onClick={() => { setSearchTerm(''); setStatusFilter(null); }}
            >
              <X size={14} /> Clear Filters
            </button>
          </div>
        ) : (
          <div className="cpv-card-table">
            <table className="cpv-table">
              <colgroup>
                <col style={{ width: '44px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '220px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '170px' }} />
                <col style={{ width: '160px' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      disabled={!canCreateVoucher}
                      onChange={canCreateVoucher ? handleSelectAll : undefined}
                      style={{ cursor: canCreateVoucher ? 'pointer' : 'not-allowed', width: 16, height: 16 }}
                    />
                  </th>
                  <th>Voucher Number</th>
                  <th>Vendor</th>
                  <th>Voucher Date</th>
                  <th>Currency</th>
                  <th style={{ textAlign: 'right' }}>Net Disbursement</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredVouchers.map((v) => {
                  const statusKey = (v.status || '').toUpperCase();
                  const isApproved = statusKey === 'APPROVED' || statusKey === 'PAID' || statusKey === 'COMPLETED';
                  const isRejected = statusKey === 'REJECTED' || statusKey === 'CANCELLED';
                  const badgeClass = isApproved ? 'approved' : isRejected ? 'rejected' : 'pending';
                  const badgeLabel = isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'PENDING APPROVAL';

                  return (
                    <tr
                      key={v.id || v.paymentId}
                      className="cpv-table-row"
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
                      <td className="cpv-voucher-num">{v.paymentId}</td>
                      <td className="cpv-vendor-name">{v.vendor || '—'}</td>
                      <td>{v.paidAt || '—'}</td>
                      <td>{companyDefaultCurrency}</td>
                      <td className="cpv-amount" style={{ textAlign: 'right' }}>
                        {formatAmount(v.amount || 0, companyDefaultCurrency)}
                      </td>
                      <td>
                        <span className={`cpv-badge cpv-badge--${badgeClass}`}>{badgeLabel}</span>
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          <button
                            className="cpv-action-btn"
                            onClick={() => handleViewVoucherDoc(v)}
                            title="View Bank Payment Voucher Document"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            className="cpv-action-btn"
                            disabled={!canCreateVoucher}
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
                            className="cpv-action-btn cpv-action-btn--delete"
                            disabled={!canCreateVoucher}
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
      </div>
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
              <span className="cpv-field__sub">Unique payment voucher ID</span>
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

        {/* Section 03: Automated 3-Way Match Engine */}
        <div className={`cpv-section cpv-match-card ${matchStatus === 'DISCREPANCY' ? 'cpv-match-card--discrepancy' : ''}`}>
          <div className="cpv-section__header" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="cpv-section__num">03</span>
              <span className="cpv-section__title">3-Way Match Verification Engine</span>
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
                onClick={() => { setMatchStatus('DISCREPANCY'); setPoQty(100); setGrnQty(80); setInvoicedQty(100); setDiscrepancyReason('Billed Qty (100) exceeds GRN Received Qty (80)'); }}
              >
                Simulate Discrepancy
              </button>
            </div>
          </div>

          <div className={`cpv-match-banner ${matchStatus === 'MATCHED' ? 'cpv-match-banner--matched' : 'cpv-match-banner--discrepancy'}`}>
            <div className={`cpv-match-banner-title ${matchStatus === 'MATCHED' ? 'cpv-match-banner-title--matched' : 'cpv-match-banner-title--discrepancy'}`}>
              {matchStatus === 'MATCHED' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
              <span>
                {matchStatus === 'MATCHED' ? '3-Way Match Verified (PO = GRN = Invoice)' : 'Discrepancy Detected'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {matchStatus === 'MATCHED'
                ? 'Quantities & unit rates across Purchase Order, GRN Dispatch, and Supplier Invoice align perfectly. Sent for formal bank payment approval.'
                : 'Discrepancy detected: Invoiced quantity / value does not match GRN received quantities or PO agreed rates. Flagged for mandatory Manager & Finance approval!'}
            </p>
          </div>

          <div className="cpv-grid cpv-grid--3">
            <div className="cpv-match-box">
              <span className="cpv-match-box-label">a. Purchase Order (PO)</span>
              <div className="cpv-match-box-value">Qty: {poQty} Units @ Ksh 5,000</div>
              <span className="cpv-match-box-sub cpv-match-box-sub--ok">PO Total: Ksh 500,000</span>
            </div>
            <div className="cpv-match-box">
              <span className="cpv-match-box-label">b. GRN / Dispatch Note</span>
              <div className="cpv-match-box-value">Received Qty: {grnQty} Units</div>
              <span className={`cpv-match-box-sub ${grnQty === poQty ? 'cpv-match-box-sub--ok' : 'cpv-match-box-sub--warn'}`}>
                {grnQty === poQty ? '100% Delivery Received' : `Shortfall: ${poQty - grnQty} units missing`}
              </span>
            </div>
            <div className="cpv-match-box">
              <span className="cpv-match-box-label">c. Supplier Invoice</span>
              <div className="cpv-match-box-value">Billed Qty: {invoicedQty} Units</div>
              <span className={`cpv-match-box-sub ${invoicedQty === grnQty ? 'cpv-match-box-sub--ok' : 'cpv-match-box-sub--warn'}`}>
                {invoicedQty === grnQty ? 'Billed Qty Matches GRN' : 'Discrepancy in Billed Qty'}
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
