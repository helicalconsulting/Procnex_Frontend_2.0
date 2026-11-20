import { CheckCircle2, Clock, ShieldCheck, RotateCcw } from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { useCurrency } from '../shared/CurrencyMaster';
import type { PurchaseRequisition } from '../../services/purchaseRequisitionService';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import procnexLogo from '../../assets/procnex.png';
import DocumentQRCode from '../common/DocumentQRCode';
import './PurchaseOrderDocument.css';

interface Props {
  pr: PurchaseRequisition;
  approvers?: any[];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number, currency?: string): string {
  const safeCurr = currency || (typeof window !== 'undefined' ? localStorage.getItem('company_default_currency') || 'KES' : 'KES');
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurr,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${safeCurr} ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }
}

function val(value: string | number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function ensurePONumber(poNumber: string | null | undefined): string {
  if (poNumber && poNumber.trim()) return poNumber.trim();
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `PO-DRAFT-${y}${m}${d}-${seq}`;
}

export function formatBranchDisplay(
  branchName?: string | null,
  branchCode?: string | null,
  showBranchId = true
): string {
  if (!branchName && !branchCode) return '';
  const name = (branchName || '').trim();
  const code = (branchCode || '').trim();

  if (!showBranchId) {
    if (name) {
      if (code) {
        const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return name.replace(new RegExp(`\\s*\\(${escaped}\\)`, 'i'), '').trim();
      }
      return name.replace(/\s*\([A-Za-z0-9\-_]+\)\s*$/, '').trim();
    }
    return '';
  }

  if (name && code && code.toLowerCase() !== name.toLowerCase()) {
    if (name.toLowerCase().includes(`(${code.toLowerCase()})`)) {
      return name;
    }
    return `${name} (${code})`;
  }
  return name || code;
}

export default function PurchaseOrderDocument({ pr, approvers }: Props) {
  const { companyName: brandingCompanyName, companyPhone: brandingPhone, companyEmail: brandingEmail, logoUrl, profile } = useBranding();
  const { companyDefaultCurrency } = useCurrency();
  const poCurrency = pr.currency || companyDefaultCurrency;

  const rawBranchName = (pr as any).branchName || (pr as any).branch?.name || (pr as any).originatingBranch || null;
  const rawBranchCode = (pr as any).branchCode || (pr as any).branch?.code || (pr as any).branchId || null;
  const showBranch = profile?.showBranchOnDocuments !== false;
  const showApproverBranch = profile?.showApproverBranchOnDocs !== false;
  const showBranchId = profile?.showBranchIdOnDocuments !== false;
  const branchDisplay = showBranch ? formatBranchDisplay(rawBranchName, rawBranchCode, showBranchId) : '';

  const finalApprovers = (Array.isArray(approvers) && approvers.length > 0)
    ? approvers
    : (Array.isArray((pr as any).approvers) && (pr as any).approvers.length > 0)
      ? (pr as any).approvers
      : [];

  const finalCompanyName = pr.companyName || profile?.companyName || brandingCompanyName || 'Procnex';
  const companyAddress = profile?.companyAddress
    ? [profile.companyAddress, profile.companyCity, profile.companyState, profile.companyCountry].filter(Boolean).join(', ')
    : pr.companyAddress || '';

  const finalLogoUrl = (pr as any).companyLogoUrl || logoUrl || '/Procnex-logo.jpeg' || procnexLogo || defaultHeliflowLogo;

  return (
    <div className="po-document">
      {/* ── Header ── */}
      <div className="po-doc__header">
        <div className="po-doc__header-left">
          {finalLogoUrl ? (
            <img
              src={finalLogoUrl}
              alt={finalCompanyName}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              className="po-doc__logo"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = procnexLogo || defaultHeliflowLogo;
              }}
            />
          ) : (
            <div className="po-doc__logo-placeholder">
              {finalCompanyName.substring(0, 2).toUpperCase()}
            </div>
          )}
          <div className="po-doc__company-info">
            <h1 className="po-doc__company-name">{val(finalCompanyName)}</h1>
            {companyAddress ? <p className="po-doc__company-detail">{val(companyAddress)}</p> : null}
            {(brandingPhone || pr.companyPhone || brandingEmail || pr.companyEmail) && (
              <p className="po-doc__company-detail">
                {brandingPhone || pr.companyPhone ? `Phone: ${brandingPhone || pr.companyPhone}` : ''}
                {(brandingPhone || pr.companyPhone) && (brandingEmail || pr.companyEmail) ? ' | ' : ''}
                {brandingEmail || pr.companyEmail ? `Email: ${brandingEmail || pr.companyEmail}` : ''}
              </p>
            )}
            {profile?.taxRegistrationNumber && (
              <p className="po-doc__company-detail" style={{ fontWeight: 600 }}>
                GSTIN / VAT: {profile.taxRegistrationNumber}
              </p>
            )}
          </div>
        </div>
        <div className="po-doc__header-right">
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
            <div>
              <div className="po-doc__title-block">
                <span className="po-doc__title-label">PURCHASE ORDER</span>
                <span className="po-doc__title-po-num">{ensurePONumber(pr.poNumber)}</span>
              </div>
              <div className="po-doc__meta-grid">
                <div className="po-doc__meta-row">
                  <span className="po-doc__meta-label">PO Date:</span>
                  <span className="po-doc__meta-value">{formatDate(pr.poDate)}</span>
                </div>
                {pr.quotationNumber && (
                  <div className="po-doc__meta-row">
                    <span className="po-doc__meta-label">Quotation Ref:</span>
                    <span className="po-doc__meta-value">{pr.quotationNumber}</span>
                  </div>
                )}
                {pr.requisitionNumber && (
                  <div className="po-doc__meta-row">
                    <span className="po-doc__meta-label">PR Number:</span>
                    <span className="po-doc__meta-value">{pr.requisitionNumber}</span>
                  </div>
                )}
                {showBranch && branchDisplay && (
                  <div className="po-doc__meta-row">
                    <span className="po-doc__meta-label">Branch:</span>
                    <span className="po-doc__meta-value" style={{ fontWeight: 600 }}>{branchDisplay}</span>
                  </div>
                )}
              </div>
            </div>
            <DocumentQRCode
              docType="PO"
              docNumber={ensurePONumber(pr.poNumber)}
              amount={pr.totalAmount || pr.estimatedTotal || 0}
              currency={poCurrency}
              vendorName={pr.vendorName}
              companyCode={profile?.companyCode || (pr as any).companyCode}
              companyName={finalCompanyName}
              companyLogoUrl={finalLogoUrl}
              size={100}
            />
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="po-doc__divider" />

      {/* ── Vendor & Ship To ── */}
      <div className="po-doc__parties">
        <div className="po-doc__party-box">
          <h3 className="po-doc__party-heading">VENDOR</h3>
          <p className="po-doc__party-name">{val(pr.vendorName)}</p>
          <p className="po-doc__party-detail">Contact Person: {val(pr.vendorContactPerson)}</p>
          <p className="po-doc__party-detail">Address: {val(pr.vendorAddress)}</p>
          <p className="po-doc__party-detail">Phone: {val(pr.vendorPhone)}</p>
          <p className="po-doc__party-detail">Email: {val(pr.vendorEmail)}</p>
          <p className="po-doc__party-detail">GST/VAT: {val(pr.vendorGstVat)}</p>
        </div>
        <div className="po-doc__party-box">
          <h3 className="po-doc__party-heading">SHIP TO</h3>
          <p className="po-doc__party-name">{val(pr.shipToCompany)}</p>
          <p className="po-doc__party-detail">
            Warehouse: {val(pr.shipToWarehouse, pr.shipToAddress ? 'WH-001 — Central' : '—')}
          </p>
          <p className="po-doc__party-detail">Address: {val(pr.shipToAddress)}</p>
          <p className="po-doc__party-detail">Contact Person: {val(pr.shipToContact)}</p>
          <p className="po-doc__party-detail">Phone: {val(pr.shipToPhone)}</p>
        </div>
      </div>

      {/* ── PO Info ── */}
      <div className="po-doc__info-grid">
        <div className="po-doc__info-item">
          <span className="po-doc__info-label">Requisitioner</span>
          <span className="po-doc__info-value">{val(pr.requisitioner)}</span>
        </div>
        <div className="po-doc__info-item">
          <span className="po-doc__info-label">Ship Via</span>
          <span className="po-doc__info-value">{val(pr.shipVia)}</span>
        </div>
        <div className="po-doc__info-item">
          <span className="po-doc__info-label">FOB</span>
          <span className="po-doc__info-value">{val(pr.fob)}</span>
        </div>
        <div className="po-doc__info-item">
          <span className="po-doc__info-label">Payment Terms</span>
          <span className="po-doc__info-value">{val(pr.paymentTerms)}</span>
        </div>
        <div className="po-doc__info-item">
          <span className="po-doc__info-label">Delivery Date</span>
          <span className="po-doc__info-value">{formatDate(pr.deliveryDate)}</span>
        </div>
        <div className="po-doc__info-item">
          <span className="po-doc__info-label">Shipping Terms</span>
          <span className="po-doc__info-value">{val(pr.shippingTerms)}</span>
        </div>
        {showBranch && branchDisplay && (
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Originating Branch</span>
            <span className="po-doc__info-value" style={{ fontWeight: 600 }}>{branchDisplay}</span>
          </div>
        )}
      </div>

      {/* ── Items Table ── */}
      {(() => {
        const hasLineTax = (pr.items || []).some(i => (Number(i.taxPercent) || 0) > 0);
        return (
          <div className="po-doc__table-wrap">
            <table className="po-doc__items-table">
              <colgroup>
                <col style={{ width: '5%' }} />
                <col style={{ width: hasLineTax ? '35%' : '41%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: hasLineTax ? '14%' : '18%' }} />
                {hasLineTax && <col style={{ width: '10%' }} />}
                <col style={{ width: hasLineTax ? '18%' : '18%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="po-doc__th--no" style={{ textAlign: 'center' }}>#</th>
                  <th className="po-doc__th--desc" style={{ textAlign: 'left' }}>Description</th>
                  <th className="po-doc__th--qty" style={{ textAlign: 'center' }}>Quantity</th>
                  <th className="po-doc__th--unit" style={{ textAlign: 'center' }}>Unit</th>
                  <th className="po-doc__th--price" style={{ textAlign: 'right' }}>Unit Price</th>
                  {hasLineTax && <th className="po-doc__th--tax" style={{ textAlign: 'center' }}>Tax</th>}
                  <th className="po-doc__th--total" style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pr.items.map((item) => (
                  <tr key={item.itemNo}>
                    <td className="po-doc__td--no" style={{ textAlign: 'center' }}>{item.itemNo}</td>
                    <td className="po-doc__td--desc" style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 600 }}>{val(item.itemName || item.description)}</div>
                      {item.description && item.itemName && item.description !== item.itemName && (
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{item.description}</div>
                      )}
                    </td>
                    <td className="po-doc__td--qty" style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td className="po-doc__td--unit" style={{ textAlign: 'center' }}>{val(item.unit)}</td>
                    <td className="po-doc__td--price" style={{ textAlign: 'right' }}>{formatCurrency(item.unitPrice, poCurrency)}</td>
                    {hasLineTax && (
                      <td className="po-doc__td--tax" style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: '#059669' }}>
                        {item.taxPercent ? `${item.taxPercent}%` : '0%'}
                      </td>
                    )}
                    <td className="po-doc__td--total" style={{ textAlign: 'right' }}>{formatCurrency(item.total, poCurrency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── Totals ── */}
      <div className="po-doc__totals">
        <div className="po-doc__totals-table">
          {Number(pr.taxTotal) > 0 && (
            <>
              <div className="po-doc__total-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span className="po-doc__total-label" style={{ color: '#64748b' }}>Subtotal</span>
                <span className="po-doc__total-value" style={{ fontWeight: 600 }}>{formatCurrency(pr.subtotal, poCurrency)}</span>
              </div>
              <div className="po-doc__total-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
                <span className="po-doc__total-label" style={{ color: '#059669' }}>Tax Total</span>
                <span className="po-doc__total-value" style={{ fontWeight: 600, color: '#059669' }}>+{formatCurrency(pr.taxTotal, poCurrency)}</span>
              </div>
            </>
          )}
          <div className="po-doc__total-row po-doc__total-row--grand">
            <span className="po-doc__total-label po-doc__total-label--grand">Grand Total</span>
            <span className="po-doc__total-value po-doc__total-value--grand">{formatCurrency(pr.grandTotal, poCurrency)}</span>
          </div>
        </div>
      </div>


      {/* ── Notes ── */}
      <div className="po-doc__divider" />
      <div className="po-doc__notes">
        <div className="po-doc__notes-col">
          <h4 className="po-doc__notes-heading">Internal Notes</h4>
          <p className="po-doc__notes-text">{val(pr.internalNotes, 'No internal notes')}</p>
        </div>
        <div className="po-doc__notes-col">
          <h4 className="po-doc__notes-heading">Special Instructions</h4>
          <p className="po-doc__notes-text">{val(pr.specialInstructions, 'No special instructions')}</p>
        </div>
      </div>

      {/* ── Approver Signatures (Approver-wise) ── */}
      {finalApprovers.length > 0 && (
        <>
          <div className="po-doc__divider" />
          <div className="po-doc__approvals-section">
            <h4 className="po-doc__approvals-title">
              APPROVAL HIERARCHY & AUTHORIZATION SIGNATURES
            </h4>
            <div className="po-doc__approvals-grid">
              {finalApprovers.map((appr: any, idx: number) => {
                const levelNum = appr.levelNumber || idx + 1;
                const statusUpper = (appr.status || '').toUpperCase().trim();
                const isApproved = statusUpper === 'APPROVED' || statusUpper === 'AUTO_FORWARDED';
                const isReturned = statusUpper === 'RETURNED';
                const isPending = !isApproved && !isReturned;
                const sigUrl = appr.signatureUrl || appr.dataUrl;

                const isGenericApproverName = (n?: string | null) => {
                  if (!n) return true;
                  const lower = n.trim().toLowerCase();
                  return (
                    lower === 'digital signature' ||
                    lower === 'signature' ||
                    lower === 'signature 2' ||
                    lower === 'system administrator' ||
                    lower === 'administrator' ||
                    lower === 'system admin' ||
                    lower === 'authorized approver' ||
                    lower === 'pending digital signature' ||
                    lower.startsWith('deleted user')
                  );
                };

                const cleanDisplayName =
                  (!isGenericApproverName(appr.signedByName) ? appr.signedByName : null) ||
                  (!isGenericApproverName(appr.approverName) ? appr.approverName : null) ||
                  (!isGenericApproverName(appr.name) ? appr.name : null) ||
                  (appr.requiredRole || `Level ${levelNum} Approver`);

                const rawRole = appr.role || appr.requiredRole || `Level ${levelNum} Approver`;
                const formattedRole = rawRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

                const dateVal = appr.date || appr.actionDate || pr.poDate || (pr as any).submittedAt;
                const dateDisplay = dateVal ? formatDate(dateVal) : '—';

                const apprBranchName = appr.approverBranchName || appr.branchName || appr.approverBranch?.name || appr.branch?.name || (appr.signedBy as any)?.branchName || (appr.signedBy as any)?.branch?.name || null;
                const apprBranchCode = appr.approverBranchCode || appr.branchCode || appr.approverBranch?.code || appr.branch?.code || (appr.signedBy as any)?.branchCode || (appr.signedBy as any)?.branch?.code || appr.approverBranchId || null;
                const approverBranchDisplay = formatBranchDisplay(apprBranchName, apprBranchCode, showBranchId);

                return (
                  <div key={idx} className="po-doc__stamp-card">
                    {/* Level & Status */}
                    <div className="po-doc__stamp-card-head">
                      <span className="po-doc__stamp-level-pill">LEVEL {levelNum}</span>
                      <span
                        className={`po-doc__stamp-status-tag ${
                          isReturned
                            ? 'po-doc__stamp-status-tag--returned'
                            : isPending
                            ? 'po-doc__stamp-status-tag--pending'
                            : 'po-doc__stamp-status-tag--approved'
                        }`}
                      >
                        {isReturned ? (
                          <RotateCcw size={11} />
                        ) : isPending ? (
                          <Clock size={11} />
                        ) : (
                          <CheckCircle2 size={11} />
                        )}
                        {isReturned ? 'RETURNED' : isPending ? 'PENDING' : 'APPROVED & SIGNED'}
                      </span>
                    </div>

                    {/* Role & Date */}
                    <div className="po-doc__stamp-card-details">
                      <div className="po-doc__stamp-role">
                        {formattedRole}
                      </div>
                      {cleanDisplayName && cleanDisplayName !== formattedRole && (
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>
                          {cleanDisplayName}
                        </div>
                      )}
                      {showApproverBranch && approverBranchDisplay && (
                        <div className="po-doc__stamp-branch" style={{ fontSize: '10.5px', color: '#475569', marginTop: '2px' }}>
                          Branch: <strong style={{ color: '#0f172a' }}>{approverBranchDisplay}</strong>
                        </div>
                      )}
                      <div className="po-doc__stamp-date">
                        Date: <strong>{dateDisplay}</strong>
                      </div>
                    </div>

                    {/* Digital Signature */}
                    <div className="po-doc__stamp-signature">
                      {isReturned ? (
                        <div className="po-doc__stamp-sig-returned">
                          <RotateCcw size={12} className="inline mr-1" />
                          <span>Returned for Revision{appr.comments ? `: "${appr.comments}"` : ''}</span>
                        </div>
                      ) : isPending ? (
                        <div className="po-doc__stamp-sig-pending">
                          Pending Digital Signature
                        </div>
                      ) : (
                        <div className="po-doc__stamp-sig-active">
                          {sigUrl ? (
                            <img
                              src={sigUrl}
                              alt={`Signature of ${cleanDisplayName}`}
                              className="po-doc__stamp-sig-img"
                            />
                          ) : (
                            <div className="po-doc__stamp-sig-svg-wrap" style={{ width: '100%', maxWidth: '200px', height: '48px' }}>
                              <svg viewBox="0 0 170 36" style={{ width: '100%', height: '48px' }}>
                                <text
                                  x="85"
                                  y="22"
                                  textAnchor="middle"
                                  fontFamily="'Caveat', 'Dancing Script', 'Brush Script MT', 'Segoe Script', cursive, sans-serif"
                                  fontSize="20"
                                  fontWeight="600"
                                  fill="#1e3a8a"
                                  fontStyle="italic"
                                >
                                  {cleanDisplayName}
                                </text>
                                <path
                                  d="M 15 28 Q 85 33, 155 27"
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  opacity="0.8"
                                />
                              </svg>
                            </div>
                          )}
                          <div className="po-doc__stamp-sig-seal">
                            <ShieldCheck size={10} />
                            <span>Digitally Signed</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
