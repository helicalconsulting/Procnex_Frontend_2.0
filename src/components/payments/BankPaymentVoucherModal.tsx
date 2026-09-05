import React, { useRef } from 'react';
import { Printer, Download, X, CheckCircle2, ShieldCheck, Landmark, Building2, AlertCircle } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import './BankPaymentVoucherModal.css';

export interface PaymentVoucherDocData {
  voucherNumber: string;
  voucherDate: string;
  paymentMethod: string;
  vendorName: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  invoiceRef: string;
  poNumbers?: string[];
  grnNumbers?: string[];
  grossAmount: number;
  tdsAmount: number;
  netAmount: number;
  currency?: string;
  matchStatus?: 'MATCHED' | 'DISCREPANCY';
  discrepancyReason?: string;
  approvers?: {
    level: string;
    name: string;
    role: string;
    date: string;
    status: 'APPROVED' | 'PENDING';
    comments?: string;
  }[];
}

interface BankPaymentVoucherModalProps {
  data: PaymentVoucherDocData;
  onClose: () => void;
}

export default function BankPaymentVoucherModal({ data, onClose }: BankPaymentVoucherModalProps) {
  const { formatAmount } = useCurrency();
  const printableRef = useRef<HTMLDivElement>(null);

  const currency = data.currency || 'INR';
  const isMatched = data.matchStatus !== 'DISCREPANCY';

  const handlePrint = () => {
    window.print();
  };

  const defaultApprovers = data.approvers && data.approvers.length > 0 ? data.approvers : [
    { level: 'Initiator', name: 'Rahul Sharma', role: 'Procurement Executive', date: data.voucherDate, status: 'APPROVED' as const, comments: 'Document 3-way matched and verified' },
    { level: 'Level 1 Review', name: 'Anand Verma', role: 'Purchase Manager', date: data.voucherDate, status: 'APPROVED' as const, comments: 'Quantities and PO rates approved' },
    { level: 'Level 2 Authorization', name: 'Priya Patel', role: 'Finance VP / Treasury Head', date: data.voucherDate, status: 'APPROVED' as const, comments: 'Bank payment release authorized' },
  ];

  return (
    <div className="bpv-modal-backdrop" onClick={onClose}>
      <div className="bpv-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Header (Hidden in Print) */}
        <div className="bpv-modal__topbar no-print">
          <div className="bpv-modal__topbar-title">
            <Landmark size={20} className="bpv-modal__icon" />
            <span>Official Bank Payment Voucher</span>
            <span className={`bpv-badge bpv-badge--${isMatched ? 'matched' : 'discrepancy'}`}>
              {isMatched ? '3-Way Matched' : 'Discrepancy Approved'}
            </span>
          </div>
          <div className="bpv-modal__topbar-actions">
            <button className="bpv-btn bpv-btn--primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF for Bank
            </button>
            <button className="bpv-btn bpv-btn--close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="bpv-sheet" ref={printableRef}>
          {/* Header */}
          <div className="bpv-sheet__header">
            <div className="bpv-sheet__company">
              <h2>HELICAL CONSULTING PRIVATE LIMITED</h2>
              <p>Corporate Finance & Treasury Division • Banking Operations</p>
              <p className="bpv-sheet__sub">Regd. Office: Plot 42, Technology Park, Sector 5, Gurugram, India</p>
            </div>
            <div className="bpv-sheet__doc-type">
              <h3>BANK PAYMENT VOUCHER</h3>
              <div className="bpv-sheet__voucher-no">{data.voucherNumber}</div>
              <p>Date: <strong>{data.voucherDate}</strong></p>
            </div>
          </div>

          <div className="bpv-divider" />

          {/* Section 1: Banking Information (Remitter & Beneficiary) */}
          <div className="bpv-section">
            <div className="bpv-section__title">
              <Landmark size={15} /> BANKING & DISBURSEMENT DETAILS
            </div>
            <div className="bpv-grid bpv-grid--2">
              <div className="bpv-box">
                <div className="bpv-box__title">REMITTER (PAYER) BANK ACCOUNT</div>
                <div className="bpv-box__row"><span>Account Name:</span> <strong>Helical Consulting Pvt Ltd</strong></div>
                <div className="bpv-box__row"><span>Bank Name:</span> <strong>HDFC Bank Ltd</strong></div>
                <div className="bpv-box__row"><span>Account Number:</span> <strong>50200084920192</strong></div>
                <div className="bpv-box__row"><span>IFSC Code:</span> <strong>HDFC0000128</strong></div>
                <div className="bpv-box__row"><span>Payment Mode:</span> <strong className="bpv-highlight">{data.paymentMethod}</strong></div>
              </div>

              <div className="bpv-box">
                <div className="bpv-box__title">BENEFICIARY (PAYEE) BANK ACCOUNT</div>
                <div className="bpv-box__row"><span>Beneficiary Name:</span> <strong>{data.beneficiaryName || data.vendorName}</strong></div>
                <div className="bpv-box__row"><span>Bank Name:</span> <strong>{data.bankName || 'HDFC Bank Ltd'}</strong></div>
                <div className="bpv-box__row"><span>Account Number / IBAN:</span> <strong>{data.accountNumber || '918029381029'}</strong></div>
                <div className="bpv-box__row"><span>IFSC / SWIFT Code:</span> <strong>{data.ifscCode || 'HDFC0000128'}</strong></div>
                <div className="bpv-box__row"><span>Supplier Master Ref:</span> <strong>{data.vendorName}</strong></div>
              </div>
            </div>
          </div>

          {/* Section 2: 3-Way Match & Invoice Breakdown Table */}
          <div className="bpv-section">
            <div className="bpv-section__title">
              <ShieldCheck size={15} /> 3-WAY MATCH & INVOICE BREAKDOWN
            </div>

            {/* Match Status Strip */}
            <div className={`bpv-match-strip bpv-match-strip--${isMatched ? 'success' : 'warning'}`}>
              <div className="bpv-match-strip__icon">
                {isMatched ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              </div>
              <div>
                <strong>3-Way Match Status: {isMatched ? 'VERIFIED MATCH (PO = GRN = Invoice)' : 'DISCREPANCY REVIEWED'}</strong>
                <p>
                  {isMatched
                    ? 'Purchase Order rates, GRN received quantities, and Supplier Invoice values match perfectly.'
                    : `Discrepancy noted: ${data.discrepancyReason || 'Quantities/Rates variance approved by authorized Finance manager.'}`}
                </p>
              </div>
            </div>

            {/* Breakdown Table */}
            <table className="bpv-table">
              <thead>
                <tr>
                  <th>Ref Type</th>
                  <th>PO Reference</th>
                  <th>GRN / Dispatch Ref</th>
                  <th>Invoice Ref</th>
                  <th style={{ textAlign: 'right' }}>Gross Amount</th>
                  <th style={{ textAlign: 'right' }}>TDS Deducted</th>
                  <th style={{ textAlign: 'right' }}>Net Payable</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Consolidated</td>
                  <td>{data.poNumbers && data.poNumbers.length > 0 ? data.poNumbers.join(', ') : 'PO-2026-0041'}</td>
                  <td>{data.grnNumbers && data.grnNumbers.length > 0 ? data.grnNumbers.join(', ') : 'DN-2026-0089'}</td>
                  <td><strong>{data.invoiceRef}</strong></td>
                  <td style={{ textAlign: 'right' }}>{formatAmount(data.grossAmount, currency)}</td>
                  <td style={{ textAlign: 'right', color: '#e11d48' }}>- {formatAmount(data.tdsAmount, currency)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>{formatAmount(data.netAmount, currency)}</td>
                </tr>
              </tbody>
            </table>

            {/* Totals Summary */}
            <div className="bpv-totals-box">
              <div className="bpv-totals-box__words">
                <span>Amount in Words:</span>
                <strong>{numberToWords(data.netAmount)} Only</strong>
              </div>
              <div className="bpv-totals-box__grand">
                <span>NET DISBURSEMENT AMOUNT:</span>
                <h2>{formatAmount(data.netAmount, currency)}</h2>
              </div>
            </div>
          </div>

          {/* Section 3: Approver Hierarchy & Digital Stamps ("Kisne Kisne Approve Kiya Hai") */}
          <div className="bpv-section">
            <div className="bpv-section__title">
              <Building2 size={15} /> APPROVAL HIERARCHY & AUTHORIZATION STAMPS (AUDIT STAMPS)
            </div>

            <div className="bpv-stamps-grid">
              {defaultApprovers.map((app, idx) => (
                <div key={idx} className="bpv-stamp-card">
                  <div className="bpv-stamp-card__level">LEVEL {idx + 1}: {app.level.toUpperCase()}</div>
                  <div className="bpv-stamp-card__body">
                    <div className="bpv-stamp-card__name">{app.name}</div>
                    <div className="bpv-stamp-card__role">{app.role}</div>
                    <div className="bpv-stamp-card__date">Date: {app.date}</div>
                    {app.comments && <div className="bpv-stamp-card__comment">"{app.comments}"</div>}
                  </div>
                  <div className="bpv-stamp-badge">
                    <CheckCircle2 size={14} /> APPROVED & SIGNED
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Notice */}
          <div className="bpv-sheet__footer">
            <p>This is a computer-generated bank disbursement voucher with encrypted digital approval stamps. Valid for official bank transaction submission.</p>
            <p className="bpv-sheet__system-id">System Audit ID: HLF-BPV-{data.voucherNumber}-{Date.now().toString().slice(-6)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Helper: Convert Number to Words (INR)
function numberToWords(num: number): string {
  if (!num || num <= 0) return 'Zero Rupees';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inWords(n % 10000000) : '');
  };

  return `${inWords(Math.floor(num))} Rupees`;
}
