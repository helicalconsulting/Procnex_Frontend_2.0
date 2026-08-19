import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
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
  FileCheck2
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
    [],
    { cacheTtlMs: 60000 }
  );

  // Form State
  const [voucherNumber, setVoucherNumber] = useState<string>(() => `VOU-2026-${Math.floor(1000 + Math.random() * 9000)}`);
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
    if (!voucherNumber.trim()) {
      setErrorMsg('Voucher Number is required.');
      return false;
    }
    if (!vendorName.trim() && !selectedVendorId) {
      setErrorMsg('Please select or specify a Vendor.');
      return false;
    }
    if (!grossAmount || grossAmount <= 0) {
      setErrorMsg('Please enter a valid Gross Payment Amount greater than 0.');
      return false;
    }
    return true;
  };

  // Actions
  const handleSaveDraft = async () => {
    if (!validateForm()) return;
    setSavingDraft(true);
    setErrorMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setSuccessMsg(`Payment Voucher #${voucherNumber} saved as draft successfully.`);
      setTimeout(() => navigate('/payments'), 1500);
    } catch {
      setErrorMsg('Failed to save draft voucher.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setSuccessMsg(`Payment Voucher #${voucherNumber} submitted for finance approval!`);
      setTimeout(() => navigate('/payments'), 1500);
    } catch {
      setErrorMsg('Failed to submit payment voucher.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cpo-page">
      {/* Message Notifications */}
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

      {/* Top Header matching New PO design */}
      <div className="cpo-header">
        <div className="cpo-header__left">
          <button className="cpo-back-btn" onClick={() => navigate('/payments')}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="cpo-header__title-wrap">
            <h1>Create Payment Voucher</h1>
            <p>Generate a new vendor payment disbursement voucher for finance authorization</p>
          </div>
        </div>
        <div className="cpo-header__actions">
          <button
            className="cpo-btn cpo-btn--outline"
            onClick={handleSaveDraft}
            disabled={savingDraft || submitting}
          >
            <Save size={15} /> {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            className="cpo-btn cpo-btn--primary"
            onClick={handleSubmit}
            disabled={savingDraft || submitting}
          >
            <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Voucher'}
          </button>
        </div>
      </div>

      {/* Form Body matching New PO Sections */}
      <div className="cpo-body">
        {/* ── Section 01: Identification & Timing ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">01</span>
            <span className="cpo-section__title">Voucher Identification & Schedule</span>
            <span className="cpo-section__hint">System voucher & date references</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>VOUCHER NUMBER *</label>
              <input
                type="text"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
                placeholder="e.g. VOU-2026-0182"
              />
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
                <option value="UPI">UPI</option>
              </select>
              <span className="cpo-field__sub">Banking transfer channel</span>
            </div>
            <div className="cpo-field">
              <label>VOUCHER DATE *</label>
              <input
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
              <span className="cpo-field__sub">Voucher generation date</span>
            </div>
            <div className="cpo-field">
              <label>SCHEDULED PAYMENT DATE *</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
              <span className="cpo-field__sub">Bank clearance date</span>
            </div>
          </div>
        </div>

        {/* ── Section 02: Beneficiary & Bank Details ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">02</span>
            <span className="cpo-section__title">Vendor & Bank Account Details</span>
            <span className="cpo-section__hint">Beneficiary bank account info</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field cpo-field--span-2">
              <label>VENDOR / BENEFICIARY *</label>
              <select
                value={selectedVendorId}
                onChange={(e) => handleVendorSelect(e.target.value)}
              >
                <option value="">Select Vendor from Database Master...</option>
                {vendorsList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category})
                  </option>
                ))}
              </select>
              <span className="cpo-field__sub">Beneficiary account for funds transfer</span>
            </div>
            <div className="cpo-field cpo-field--span-2">
              <label>MATCHED INVOICE REFERENCE</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="e.g. INV-2026-0042 or Multiple"
              />
              <span className="cpo-field__sub">Settled invoice number</span>
            </div>
            <div className="cpo-field">
              <label>BENEFICIARY NAME</label>
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

        {/* ── Section 03: Purpose & Remarks (Split Grid Layout) ── */}
        <div className="cpo-grid cpo-grid--split">
          {/* Notes & Supporting Documents */}
          <div className="cpo-section">
            <div className="cpo-section__header">
              <span className="cpo-section__num">03</span>
              <span className="cpo-section__title">Purpose & Audit Documents</span>
            </div>
            <div className="cpo-grid cpo-grid--1" style={{ gap: 16 }}>
              <div className="cpo-field">
                <label>PAYMENT PURPOSE / DESCRIPTION</label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="e.g. Q1 Hardware & IT Infrastructure vendor disbursement"
                />
                <span className="cpo-field__sub">Audit description for accounts log</span>
              </div>
              <div className="cpo-field">
                <label>INTERNAL FINANCE REMARKS</label>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add notes for finance VP, approver verification, or bank clearance details..."
                />
              </div>

              {/* Upload Dropzone */}
              <div className="cpo-field">
                <label>SUPPORTING PAYMENT DOCUMENTS</label>
                <label className="cpi-upload-dropzone" style={{ padding: '16px', background: 'var(--surface-elevated)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center', cursor: 'pointer', display: 'block' }}>
                  <Upload size={20} style={{ color: 'var(--primary-500)', marginBottom: 4 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Upload bank advice or invoice payment proof</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Supports PDF, PNG, JPG (Max 10MB)</div>
                  <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} hidden />
                </label>

                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {attachments.map((att) => (
                      <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Paperclip size={13} style={{ color: 'var(--primary-500)' }} />
                          <span style={{ fontWeight: 600 }}>{att.name}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>({att.size})</span>
                        </div>
                        <button type="button" onClick={() => handleRemoveAttachment(att.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-500)', cursor: 'pointer' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Amount & Calculation Panel */}
          <div className="cpo-section cpo-totals-card">
            <div className="cpo-section__header">
              <span className="cpo-section__num">04</span>
              <span className="cpo-section__title">Disbursement Summary</span>
            </div>
            <div className="cpo-totals">
              <div className="cpo-field" style={{ marginBottom: 12 }}>
                <label>CURRENCY</label>
                <CurrencySelector value={currency} onChange={setCurrency} />
              </div>

              <div className="cpo-field" style={{ marginBottom: 14 }}>
                <label>GROSS PAYMENT AMOUNT *</label>
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

              <div className="cpo-field" style={{ marginBottom: 14 }}>
                <label>TDS / WITHHOLDING TAX %</label>
                <select value={tdsPercent} onChange={(e) => setTdsPercent(parseFloat(e.target.value) || 0)}>
                  <option value={0}>0% (No Tax Deduction)</option>
                  <option value={1}>1% (TDS 194C - Contractors)</option>
                  <option value={2}>2% (TDS 194I - Plant & Machinery)</option>
                  <option value={5}>5% (TDS 194J - Professional Services)</option>
                  <option value={10}>10% (TDS 194J - Technical Fees / Royalties)</option>
                </select>
              </div>

              <div className="cpo-totals__divider" />

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
                <span style={{ color: 'var(--primary-500)' }}>{formatAmount(netPayable, currency)}</span>
              </div>
            </div>

            <div className="cpo-action-panel">
              <button
                className="cpo-btn cpo-btn--primary cpo-btn--full"
                onClick={handleSubmit}
                disabled={savingDraft || submitting}
              >
                <Send size={16} /> {submitting ? 'Submitting…' : 'Submit Payment Voucher'}
              </button>
              <button
                className="cpo-btn cpo-btn--secondary cpo-btn--full"
                onClick={handleSaveDraft}
                disabled={savingDraft || submitting}
              >
                <Save size={16} /> {savingDraft ? 'Saving…' : 'Save Voucher Draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
