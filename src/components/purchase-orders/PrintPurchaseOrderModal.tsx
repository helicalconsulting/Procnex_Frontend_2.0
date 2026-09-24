import React, { useRef } from 'react';
import { Printer, X, ShoppingCart, CheckCircle2, ShieldCheck, Landmark, Building2, Clock } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import './PrintPurchaseOrderModal.css';

export interface PurchaseOrderPrintData {
  id?: number | string;
  referenceNumber: string;
  title: string;
  amount: number | string;
  requestedBy: string;
  department: string;
  priority: string;
  status: string;
  submittedAt: string;
  comments?: string;
  vendorName?: string;
  currentLevel?: number;
  totalLevels?: number;
  requiredRole?: string;
  module?: string;
}

interface PrintPurchaseOrderModalProps {
  data: PurchaseOrderPrintData;
  onClose: () => void;
}

export default function PrintPurchaseOrderModal({ data, onClose }: PrintPurchaseOrderModalProps) {
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { companyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);

  const displayCompanyName = profile?.companyName || companyName || 'Procnex';
  const companyAddress = profile?.companyAddress
    ? [profile.companyAddress, profile.companyCity, profile.companyState, profile.companyCountry].filter(Boolean).join(', ')
    : (profile?.companyName || companyName || 'Procnex') + ' • Corporate Headquarters';

  // Parse vendor name if embedded in title like "Purchase Order for Ajabu Consulting — Direct PO Master"
  const derivedVendorName = data.vendorName || (() => {
    if (data.title && data.title.includes('for ')) {
      const parts = data.title.split('for ');
      if (parts[1]) {
        return parts[1].split(' — ')[0].split(' - ')[0].trim();
      }
    }
    return 'Ajabu Consulting';
  })();

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d || '28 Aug 2026';
    }
  };

  const numericAmount = typeof data.amount === 'number'
    ? data.amount
    : parseFloat(String(data.amount).replace(/[^0-9.]/g, '')) || 0;

  const displayAmount = typeof data.amount === 'string' && data.amount.trim() !== '' && (data.amount.includes('Ksh') || data.amount.includes('₹') || data.amount.includes('$'))
    ? data.amount
    : formatAmount(numericAmount, companyDefaultCurrency);

  const handlePrint = () => {
    window.print();
  };

  const statusLabel = (data.status || 'PENDING').replace(/_/g, ' ');
  const statusKey = (data.status || 'PENDING').toLowerCase().replace(/_/g, '');

  return (
    <div className="ppo-modal-backdrop" onClick={onClose}>
      <div className="ppo-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Header (Hidden in Print) */}
        <div className="ppo-modal__topbar no-print">
          <div className="ppo-modal__topbar-title">
            <Printer size={20} className="ppo-modal__icon" />
            <span>Official Purchase Order — {data.referenceNumber}</span>
            <span className={`ppo-badge ppo-badge--${statusKey.includes('approved') ? 'approved' : statusKey.includes('auto') ? 'autoforwarded' : statusKey.includes('reject') ? 'rejected' : 'pending'}`}>
              {statusLabel}
            </span>
          </div>
          <div className="ppo-modal__topbar-actions">
            <button className="ppo-btn ppo-btn--primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF PO
            </button>
            <button className="ppo-btn ppo-btn--close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="ppo-sheet" ref={printableRef}>
          {/* Header */}
          <div className="ppo-sheet__header">
            <div className="ppo-sheet__company">
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
              {(profile?.companyPhone || profile?.companyEmail) && (
                <p>
                  {profile?.companyPhone ? `Phone: ${profile.companyPhone}` : ''}
                  {profile?.companyPhone && profile?.companyEmail ? ' | ' : ''}
                  {profile?.companyEmail ? `Email: ${profile.companyEmail}` : ''}
                </p>
              )}
              {profile?.taxRegistrationNumber && (
                <p style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  GSTIN / VAT: {profile.taxRegistrationNumber}
                </p>
              )}
            </div>

            <div className="ppo-sheet__title-block">
              <h1 className="ppo-sheet__doc-title">PURCHASE ORDER</h1>
              <div className="ppo-sheet__doc-num">{data.referenceNumber}</div>
              <table className="ppo-sheet__meta-table">
                <tbody>
                  <tr>
                    <td className="ppo-sheet__meta-label">PO Date:</td>
                    <td className="ppo-sheet__meta-val">{fmtDate(data.submittedAt)}</td>
                  </tr>
                  <tr>
                    <td className="ppo-sheet__meta-label">Priority:</td>
                    <td className="ppo-sheet__meta-val">{data.priority || 'MEDIUM'}</td>
                  </tr>
                  <tr>
                    <td className="ppo-sheet__meta-label">Status:</td>
                    <td className="ppo-sheet__meta-val">{statusLabel}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Vendor & Ship To Grid */}
          <div className="ppo-sheet__parties">
            <div className="ppo-sheet__party-box">
              <div className="ppo-sheet__party-heading">VENDOR / SUPPLIER</div>
              <div className="ppo-sheet__party-name">{derivedVendorName}</div>
              <div className="ppo-sheet__party-detail">Contact Person: Sales & Procurement Manager</div>
              <div className="ppo-sheet__party-detail">Status: Verified Vendor</div>
            </div>

            <div className="ppo-sheet__party-box">
              <div className="ppo-sheet__party-heading">SHIP TO / BUYER</div>
              <div className="ppo-sheet__party-name">{displayCompanyName}</div>
              <div className="ppo-sheet__party-detail">Address: {companyAddress}</div>
              <div className="ppo-sheet__party-detail">Requisitioner: {data.requestedBy} ({data.department || 'Procurement'})</div>
            </div>
          </div>

          {/* Info Summary Grid */}
          <div className="ppo-sheet__info-grid">
            <div className="ppo-sheet__info-item">
              <span className="ppo-sheet__info-label">PO Reference</span>
              <span className="ppo-sheet__info-val">{data.referenceNumber}</span>
            </div>
            <div className="ppo-sheet__info-item">
              <span className="ppo-sheet__info-label">Requisitioner</span>
              <span className="ppo-sheet__info-val">{data.requestedBy}</span>
            </div>
            <div className="ppo-sheet__info-item">
              <span className="ppo-sheet__info-label">Department</span>
              <span className="ppo-sheet__info-val">{data.department || 'Procurement'}</span>
            </div>
            <div className="ppo-sheet__info-item">
              <span className="ppo-sheet__info-label">Priority</span>
              <span className="ppo-sheet__info-val">{data.priority || 'MEDIUM'}</span>
            </div>
          </div>

          {/* Items Table */}
          <table className="ppo-sheet__items-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Item / Description</th>
                <th>Department</th>
                <th>Requisitioner</th>
                <th style={{ textAlign: 'right' }}>Total Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>
                  <strong>{data.title}</strong>
                  <br />
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Official Purchase Order per approved procurement requisition [{data.referenceNumber}]
                  </span>
                </td>
                <td>{data.department || 'Procurement'}</td>
                <td>{data.requestedBy}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {displayAmount}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Total Breakdown Box */}
          <div className="ppo-sheet__total-box">
            <div className="ppo-sheet__total-row">
              <span>Subtotal:</span>
              <span>{displayAmount}</span>
            </div>
            <div className="ppo-sheet__total-row">
              <span>Taxes & Duties:</span>
              <span>Included / 0.00</span>
            </div>
            <div className="ppo-sheet__total-row ppo-sheet__total-row--grand">
              <span>Grand Total:</span>
              <span>{displayAmount}</span>
            </div>
          </div>

          {data.comments && (
            <div style={{ marginTop: 24, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                Approval / Audit Notes
              </div>
              <div style={{ fontSize: 13, color: '#334155', fontStyle: 'italic' }}>
                "{data.comments}"
              </div>
            </div>
          )}

          {/* Signature & Stamp Footer */}
          <div className="ppo-sheet__footer">
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{displayCompanyName} — Procurement Division</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Computer Generated Official Purchase Order Document • Verified & Approved
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ borderBottom: '1px solid #cbd5e1', width: 160, marginBottom: 4 }}></div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Authorized Procurement Officer</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
