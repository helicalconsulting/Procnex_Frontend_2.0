import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { apiRequest } from '../../api/client';
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
  PackageCheck
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import './CreatePaymentVoucherPage.css';

interface VendorOption {
  id: string;
  name: string;
  email: string;
  category: string;
}

export default function CreatePaymentVoucherPage() {
  const navigate = useNavigate();
  const { companyDefaultCurrency, formatAmount } = useCurrency();

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
  const [voucherNumber] = useState<string>(() => `VOU-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [paymentMethod, setPaymentMethod] = useState<string>('NEFT');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [vendorName, setVendorName] = useState<string>('');
  const [invoiceRef, setInvoiceRef] = useState<string>('');
  const [voucherDate, setVoucherDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [scheduledDate, setScheduledDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState<string>(companyDefaultCurrency);

  // Bank & Beneficiary Details (as per diagram)
  const [bankName, setBankName] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [ifscCode, setIfscCode] = useState<string>('');
  const [beneficiaryName, setBeneficiaryName] = useState<string>('');

  // Amounts & TDS
  const [grossAmount, setGrossAmount] = useState<number | ''>('');
  const [tdsPercent, setTdsPercent] = useState<number>(2);
  const [purpose, setPurpose] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  // Attachments
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

  // UI state
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Handle vendor selection change
  const handleVendorSelect = (vId: string) => {
    setSelectedVendorId(vId);
    const found = vendorsList.find((v) => v.id === vId);
    if (found) {
      setVendorName(found.name);
      setBeneficiaryName(found.name);
      // Pre-fill mock bank details for seamless user experience
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

      setSuccessMsg(`Payment Voucher #${voucherNumber} created & submitted for payment workflow approval!`);
      setTimeout(() => navigate('/payments'), 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to submit payment voucher.');
    } finally {
      setSubmitting(false);
    }
  };

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
          <button className="cpo-back-btn" onClick={() => navigate('/payments')}>
            <ArrowLeft size={16} /> Back
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
            disabled={savingDraft || submitting}
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

        {/* Section 02: Vendor & Bank Account Details (as per diagram) */}
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

        {/* Section 03: Summary & Workflow Notice */}
        <div className="cpo-grid cpo-grid--split">
          <div className="cpo-section">
            <div className="cpo-section__header">
              <span className="cpo-section__num">03</span>
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
              <span className="cpo-section__num">04</span>
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
                <span>Yaha Workflow Ayega — Triggers Payments Approval Chain</span>
              </div>
            </div>

            <div className="cpo-action-panel">
              <button
                className="cpo-btn cpo-btn--primary cpo-btn--full"
                onClick={submitVoucher}
                disabled={savingDraft || submitting}
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
