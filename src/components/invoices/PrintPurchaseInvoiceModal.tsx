import React, { useRef } from 'react';
import { Printer, X, FileText, CheckCircle2, ShieldCheck, Landmark, Building2 } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import './PrintPurchaseInvoiceModal.css';

export interface PurchaseInvoicePrintData {
  id?: number | string;
  invoiceNumber: string;
  poNumber: string;
  vendorName: string;
  vendorInitials?: string;
  amount: number;
  paidAmount?: number;
  dueDate: string;
  invoiceDate: string;
  status: string;
  paymentTerms: string;
  department: string;
  comments?: string;
  currentLevel?: number;
  totalLevels?: number;
  requiredRole?: string;
}

interface PrintPurchaseInvoiceModalProps {
  data?: PurchaseInvoicePrintData;
  invoice?: PurchaseInvoicePrintData;
  onClose: () => void;
}

export default function PrintPurchaseInvoiceModal({ data: dataProp, invoice: invoiceProp, onClose }: PrintPurchaseInvoiceModalProps) {
  const data = dataProp || invoiceProp;
  if (!data) return null;
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { companyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);

  const displayCompanyName = companyName && !companyName.includes('Procnex') ? companyName : (profile?.companyName || 'Helical Consulting');
  const companyAddress = profile?.companyAddress
    ? [profile.companyAddress, profile.companyCity, profile.companyCountry].filter(Boolean).join(', ')
    : '232, Sahukara Bareilly 232 • Corporate Headquarters';

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const statusLabel = data.status || 'PENDING';
  const isApproved = statusLabel === 'APPROVED' || statusLabel === 'PAID';

  return (
    <div className="ppi-modal-backdrop" onClick={onClose}>
      <div className="ppi-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Header (Hidden in Print) */}
        <div className="ppi-modal__topbar no-print">
          <div className="ppi-modal__topbar-title">
            <Printer size={20} className="ppi-modal__icon" />
            <span>Tax Purchase Invoice — {data.invoiceNumber}</span>
            <span className={`ppi-badge ppi-badge--${isApproved ? 'approved' : statusLabel.toLowerCase() === 'rejected' ? 'rejected' : 'pending'}`}>
              {statusLabel}
            </span>
          </div>
          <div className="ppi-modal__topbar-actions">
            <button className="ppi-btn ppi-btn--primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF Invoice
            </button>
            <button className="ppi-btn ppi-btn--close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="ppi-sheet" ref={printableRef}>
          {/* Header */}
          <div className="ppi-sheet__header">
            <div className="ppi-sheet__company">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={displayCompanyName}
                  style={{ maxHeight: 48, maxWidth: 200, objectFit: 'contain', marginBottom: 8, display: 'block' }}
                />
              ) : (
                <h2>{displayCompanyName}</h2>
              )}
              {logoUrl && <h2 style={{ fontSize: 19, margin: '4px 0 2px 0' }}>{displayCompanyName}</h2>}
              <p>{companyAddress}</p>
              <p>Phone: {profile?.companyPhone || '+91 8272811866'} | Email: {profile?.companyEmail || 'finance@helical.com'}</p>
              {profile?.taxRegistrationNumber && (
                <p style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  GSTIN / VAT: {profile.taxRegistrationNumber}
                </p>
              )}
            </div>

            <div className="ppi-sheet__title-block">
              <h1 className="ppi-sheet__doc-title">TAX INVOICE</h1>
              <div className="ppi-sheet__doc-num">{data.invoiceNumber}</div>
              <table className="ppi-sheet__meta-table">
                <tbody>
                  <tr>
                    <td className="ppi-sheet__meta-label">Invoice Date:</td>
                    <td className="ppi-sheet__meta-val">{fmtDate(data.invoiceDate)}</td>
                  </tr>
                  <tr>
                    <td className="ppi-sheet__meta-label">Due Date:</td>
                    <td className="ppi-sheet__meta-val">{fmtDate(data.dueDate)}</td>
                  </tr>
                  <tr>
                    <td className="ppi-sheet__meta-label">PO Reference:</td>
                    <td className="ppi-sheet__meta-val">{data.poNumber || '—'}</td>
                  </tr>
                  <tr>
                    <td className="ppi-sheet__meta-label">Payment Terms:</td>
                    <td className="ppi-sheet__meta-val">{data.paymentTerms || 'Net 30'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Vendor & Bill To Grid */}
          <div className="ppi-sheet__parties">
            <div className="ppi-sheet__party-box">
              <div className="ppi-sheet__party-heading">VENDOR / SUPPLIER</div>
              <div className="ppi-sheet__party-name">{data.vendorName}</div>
              <div className="ppi-sheet__party-detail">Department: {data.department || 'General'}</div>
              <div className="ppi-sheet__party-detail">Status: {data.status}</div>
            </div>

            <div className="ppi-sheet__party-box">
              <div className="ppi-sheet__party-heading">BILL TO (BUYER / CLIENT)</div>
              <div className="ppi-sheet__party-name">{displayCompanyName}</div>
              <div className="ppi-sheet__party-detail">Address: {companyAddress}</div>
              <div className="ppi-sheet__party-detail">Contact: Accounts Payable / Treasury</div>
            </div>
          </div>

          {/* Info Summary Grid */}
          <div className="ppi-sheet__info-grid">
            <div className="ppi-sheet__info-item">
              <span className="ppi-sheet__info-label">Invoice Number</span>
              <span className="ppi-sheet__info-val">{data.invoiceNumber}</span>
            </div>
            <div className="ppi-sheet__info-item">
              <span className="ppi-sheet__info-label">PO Reference</span>
              <span className="ppi-sheet__info-val">{data.poNumber || '—'}</span>
            </div>
            <div className="ppi-sheet__info-item">
              <span className="ppi-sheet__info-label">Department</span>
              <span className="ppi-sheet__info-val">{data.department}</span>
            </div>
            <div className="ppi-sheet__info-item">
              <span className="ppi-sheet__info-label">Approval Status</span>
              <span className="ppi-sheet__info-val">{data.status}</span>
            </div>
          </div>

          {/* Table Breakdown */}
          <table className="ppi-sheet__items-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Item / Description</th>
                <th>PO Reference</th>
                <th>Department</th>
                <th style={{ textAlign: 'right' }}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>
                  <strong>Purchase Goods & Services — Invoice {data.invoiceNumber}</strong>
                  <br />
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Supplied by {data.vendorName} per Purchase Order agreement
                  </span>
                </td>
                <td>{data.poNumber || '—'}</td>
                <td>{data.department || 'Finance'}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {formatAmount(data.amount, companyDefaultCurrency)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Total Breakdown Box */}
          <div className="ppi-sheet__total-box">
            <div className="ppi-sheet__total-row">
              <span>Subtotal:</span>
              <span>{formatAmount(data.amount, companyDefaultCurrency)}</span>
            </div>
            <div className="ppi-sheet__total-row">
              <span>Tax / VAT:</span>
              <span>Included / 0.00</span>
            </div>
            <div className="ppi-sheet__total-row ppi-sheet__total-row--grand">
              <span>Total Invoice Amount:</span>
              <span>{formatAmount(data.amount, companyDefaultCurrency)}</span>
            </div>
          </div>

          {data.comments && (
            <div style={{ marginTop: 24, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                Approval / Audit Comments
              </div>
              <div style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>
                "{data.comments}"
              </div>
            </div>
          )}

          {/* Signature & Stamp Footer */}
          <div className="ppi-sheet__footer">
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{displayCompanyName} — Accounts Payable System</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Computer Generated Purchase Invoice Document • Verified & Synced
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ borderBottom: '1px solid #cbd5e1', width: 160, marginBottom: 4 }}></div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Authorized Signatory</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
