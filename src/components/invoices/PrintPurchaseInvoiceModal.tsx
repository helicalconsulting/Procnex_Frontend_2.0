import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, CheckCircle2, ShieldCheck, Landmark, Building2, Clock } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { approvalService } from '../../services/approvalService';
import { signatureService } from '../../services/signatureService';
import { printElementInIframe } from '../../utils/pdfDownload';
import procnexLogo from '../../assets/procnex.png';
import defaultHeliflowLogo from '../../assets/heliflow.png';
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
  approvers?: {
    level: string;
    name: string;
    role: string;
    date: string;
    status: 'APPROVED' | 'PENDING';
    comments?: string;
    signatureUrl?: string;
  }[];
}

interface PrintPurchaseInvoiceModalProps {
  data?: PurchaseInvoicePrintData;
  invoice?: PurchaseInvoicePrintData;
  onClose: () => void;
}

export function PrintPurchaseInvoiceModal({ data: dataProp, invoice: invoiceProp, onClose }: PrintPurchaseInvoiceModalProps) {
  const data = dataProp || invoiceProp;
  if (!data) return null;
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { companyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);
  const [approversList, setApproversList] = useState<any[]>(data.approvers || []);

  const displayCompanyName = (data as any).companyName || profile?.companyName || companyName || 'Company';
  const companyAddress = (data as any).companyAddress
    ? (data as any).companyAddress
    : profile?.companyAddress
      ? [profile.companyAddress, profile.companyCity, profile.companyState, profile.companyCountry].filter(Boolean).join(', ')
      : '';

  const finalLogoUrl = (data as any).companyLogoUrl
    || profile?.logoUrl
    || logoUrl
    || (displayCompanyName.toLowerCase().includes('procnex') ? ('/Procnex-logo.jpeg' || procnexLogo) : null)
    || (displayCompanyName.toLowerCase().includes('helical') ? defaultHeliflowLogo : null);

  const fmtDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const statusLabel = data.status || 'PENDING';
  const isApproved = statusLabel === 'APPROVED' || statusLabel === 'PAID';

  useEffect(() => {
    if (data.approvers && data.approvers.length > 0) {
      setApproversList(data.approvers);
      return;
    }

    let isMounted = true;
    const fetchChain = async () => {
      try {
        const targetRef = data.invoiceNumber;
        const [res, docSigs1, docSigs2, docSigs3, savedSigs] = await Promise.all([
          approvalService.getChain('AccountsPayable', targetRef).catch(() => null),
          signatureService.getDocumentSignatures('AccountsPayable', targetRef).catch(() => []),
          data.id && data.id !== targetRef ? signatureService.getDocumentSignatures('AccountsPayable', String(data.id)).catch(() => []) : Promise.resolve([]),
          data.poNumber ? signatureService.getDocumentSignatures('AccountsPayable', data.poNumber).catch(() => []) : Promise.resolve([]),
          signatureService.list().catch(() => []),
        ]);
        if (!isMounted) return;

        const allRawDocSigs = [...docSigs1, ...docSigs2, ...docSigs3];
        const signerMap = new Map<string, any>();
        for (const s of allRawDocSigs) {
          const sigUrl = s.dataUrl || s.signature?.dataUrl;
          const signerKey = s.signedById ? String(s.signedById) : (sigUrl || s.signatureId || s.id);
          if (!signerKey) continue;
          if (!signerMap.has(signerKey) || (!signerMap.get(signerKey).dataUrl && sigUrl)) {
            signerMap.set(signerKey, {
              ...s,
              dataUrl: sigUrl,
              signedByName: s.signedBy?.fullName || s.signedByName || s.signature?.name,
            });
          }
        }

        // Sort unique signatures chronologically
        const sortedDocSigs = Array.from(signerMap.values()).sort((a: any, b: any) => {
          const levA = Number(a.levelNumber) || 0;
          const levB = Number(b.levelNumber) || 0;
          if (levA && levB) return levA - levB;
          const timeA = a.signedAt ? new Date(a.signedAt).getTime() : 0;
          const timeB = b.signedAt ? new Date(b.signedAt).getTime() : 0;
          return timeA - timeB;
        });

        const chainItems = res?.levels && res.levels.length > 0 ? res.levels : (res?.history && res.history.length > 0 ? res.history : []);
        const defaultSigUrl = savedSigs.find((s) => s.isDefault)?.dataUrl || savedSigs[0]?.dataUrl;

        if (chainItems && chainItems.length > 0) {
          const usedSigUrls = new Set<string>();

          const mapped = chainItems.map((item: any, idx: number) => {
            const levelNum = item.levelNumber || idx + 1;
            const roleName = item.requiredRole
              ? item.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              : `Level ${levelNum} Approver`;
            const isLevelApproved = item.status === 'APPROVED' || item.status === 'AUTO_FORWARDED';

            let levelSig: string | undefined = undefined;
            let signerDisplayName: string | undefined = undefined;

            if (isLevelApproved) {
              // 1. Direct match by approverId
              if (item.approverId) {
                const byId = sortedDocSigs.find((d: any) => d.signedById && String(d.signedById) === String(item.approverId));
                if (byId && !usedSigUrls.has(byId.dataUrl)) {
                  levelSig = byId.dataUrl;
                  signerDisplayName = byId.signedByName;
                }
              }

              // 2. Match by explicit levelNumber
              if (!levelSig) {
                const byLevel = sortedDocSigs.find((d: any) => Number(d.levelNumber || d.level) === Number(levelNum));
                if (byLevel && !usedSigUrls.has(byLevel.dataUrl)) {
                  levelSig = byLevel.dataUrl;
                  signerDisplayName = byLevel.signedByName;
                }
              }

              // 3. Match by name
              if (!levelSig && item.approverName && !item.approverName.toLowerCase().includes('pending') && !item.approverName.toLowerCase().includes('authorized')) {
                const cleanName = item.approverName.toLowerCase().trim();
                const byName = sortedDocSigs.find((d: any) => {
                  const sName = (d.signedByName || '').toLowerCase().trim();
                  return sName && (sName === cleanName || sName.includes(cleanName) || cleanName.includes(sName));
                });
                if (byName && !usedSigUrls.has(byName.dataUrl)) {
                  levelSig = byName.dataUrl;
                  signerDisplayName = byName.signedByName;
                }
              }

              // 4. Match by role (Purchase Clerk -> Mahi, Purchase Manager -> Nischal)
              if (!levelSig && item.requiredRole) {
                const roleLower = item.requiredRole.toLowerCase().trim();
                const isClerk = roleLower.includes('clerk');
                const isManager = roleLower.includes('manager');
                const byRole = sortedDocSigs.find((d: any) => {
                  const nameLower = (d.signedByName || '').toLowerCase();
                  if (isClerk && (nameLower.includes('mahi') || nameLower.includes('clerk'))) return true;
                  if (isManager && (nameLower.includes('nischal') || nameLower.includes('manager'))) return true;
                  return false;
                });
                if (byRole && !usedSigUrls.has(byRole.dataUrl)) {
                  levelSig = byRole.dataUrl;
                  signerDisplayName = byRole.signedByName;
                }
              }

              // 5. Unused signature from sortedDocSigs
              if (!levelSig) {
                const unusedDocSig = sortedDocSigs.find((d: any) => d.dataUrl && !usedSigUrls.has(d.dataUrl));
                if (unusedDocSig) {
                  levelSig = unusedDocSig.dataUrl;
                  signerDisplayName = unusedDocSig.signedByName;
                }
              }

              // 6. Unused signature from savedSigs
              if (!levelSig) {
                const unusedSaved = savedSigs.find((s) => s.dataUrl && !usedSigUrls.has(s.dataUrl));
                if (unusedSaved) {
                  levelSig = unusedSaved.dataUrl;
                  signerDisplayName = unusedSaved.name || item.approverName;
                }
              }

              // 7. Fallback default signature only for Level 1 if nothing used yet
              if (!levelSig && levelNum === 1 && sortedDocSigs.length === 0 && defaultSigUrl && !usedSigUrls.has(defaultSigUrl)) {
                levelSig = defaultSigUrl;
              }

              if (levelSig) {
                usedSigUrls.add(levelSig);
              }
            }

            const name = signerDisplayName || (item.approverName && !item.approverName.toLowerCase().includes('authorized') && !item.approverName.toLowerCase().includes('system administrator')
              ? item.approverName
              : (isLevelApproved ? 'Authorized Approver' : (item.requiredRole ? item.requiredRole.replace(/_/g, ' ') : `Level ${levelNum} Approver`)));

            return {
              level: `Level ${levelNum}`,
              name,
              role: roleName,
              date: isLevelApproved && item.actionAt ? new Date(item.actionAt).toISOString().slice(0, 10) : fmtDate(data.invoiceDate),
              status: isLevelApproved ? 'APPROVED' : 'PENDING',
              signatureUrl: levelSig,
            };
          });
          setApproversList(mapped);
        } else {
          const sigL1 = isApproved ? (sortedDocSigs[0]?.dataUrl || defaultSigUrl) : undefined;
          const sigL2 = statusLabel === 'PAID' ? sortedDocSigs[1]?.dataUrl : undefined;

          setApproversList([
            {
              level: 'Level 1',
              name: sortedDocSigs[0]?.signedByName || 'Purchase Manager',
              role: 'Purchase Manager',
              date: fmtDate(data.invoiceDate),
              status: isApproved ? 'APPROVED' : 'PENDING',
              signatureUrl: sigL1,
            },
            {
              level: 'Level 2',
              name: sortedDocSigs[1]?.signedByName || 'Purchase Clerk',
              role: 'Purchase Clerk',
              date: fmtDate(data.invoiceDate),
              status: statusLabel === 'PAID' ? 'APPROVED' : 'PENDING',
              signatureUrl: sigL2,
            },
          ]);
        }
      } catch {
        if (!isMounted) return;
        setApproversList([
          {
            level: 'Level 1',
            name: 'Purchase Manager',
            role: 'Purchase Manager',
            date: fmtDate(data.invoiceDate),
            status: isApproved ? 'APPROVED' : 'PENDING',
          },
          {
            level: 'Level 2',
            name: 'Purchase Clerk',
            role: 'Purchase Clerk',
            date: fmtDate(data.invoiceDate),
            status: statusLabel === 'PAID' ? 'APPROVED' : 'PENDING',
          },
        ]);
      }
    };

    fetchChain();
    return () => {
      isMounted = false;
    };
  }, [data, isApproved, statusLabel]);

  const handlePrint = () => {
    if (printableRef.current) {
      printElementInIframe(printableRef.current, `Tax_Purchase_Invoice_${data.invoiceNumber}`);
    } else {
      window.print();
    }
  };

  return createPortal(
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
              {finalLogoUrl ? (
                <>
                  <img
                    src={finalLogoUrl}
                    alt={displayCompanyName}
                    style={{ maxHeight: 48, maxWidth: 200, objectFit: 'contain', marginBottom: 8, display: 'block' }}
                    onError={(e) => {
                      const img = e.currentTarget as HTMLImageElement;
                      if (displayCompanyName.toLowerCase().includes('procnex') && !img.src.includes('procnex')) {
                        img.src = procnexLogo;
                      } else if (displayCompanyName.toLowerCase().includes('helical') && !img.src.includes('heliflow')) {
                        img.src = defaultHeliflowLogo;
                      } else {
                        img.style.display = 'none';
                      }
                    }}
                  />
                  <h2 style={{ fontSize: 19, margin: '4px 0 2px 0' }}>{displayCompanyName}</h2>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 16,
                    letterSpacing: 0.5,
                  }}>
                    {displayCompanyName.substring(0, 2).toUpperCase()}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{displayCompanyName}</h2>
                </div>
              )}
              {companyAddress ? <p>{companyAddress}</p> : null}
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
                <td>{data.department || '—'}</td>
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

          {/* Approval Hierarchy & Digital Signature Stamps */}
          <div className="ppi-stamps-section">
            <div className="ppi-stamps-title">
              <Building2 size={15} /> APPROVAL HIERARCHY & AUTHORIZATION STAMPS
            </div>

            <div className="ppi-stamps-grid">
              {approversList.map((app, idx) => {
                const isPending = app.status === 'PENDING';
                return (
                  <div key={idx} className="ppi-stamp-card">
                    {/* Level & Status */}
                    <div className="ppi-stamp-card__header">
                      <span className="ppi-stamp-level-pill">LEVEL {idx + 1}</span>
                      <span className={`ppi-stamp-status-tag ${isPending ? 'ppi-stamp-status-tag--pending' : ''}`}>
                        {isPending ? <Clock size={11} /> : <CheckCircle2 size={11} />}
                        {isPending ? 'PENDING' : 'APPROVED & SIGNED'}
                      </span>
                    </div>

                    {/* Role & Date */}
                    <div className="ppi-stamp-card__details">
                      <div className="ppi-stamp-role">{app.role}</div>
                      <div className="ppi-stamp-date">Date: <strong>{app.date}</strong></div>
                    </div>

                    {/* Digital Signature */}
                    <div className="ppi-stamp-card__signature">
                      {isPending ? (
                        <div className="ppi-stamp-sig-pending">Pending Digital Signature</div>
                      ) : (
                        <div className="ppi-stamp-sig-active">
                          {app.signatureUrl ? (
                            <img src={app.signatureUrl} alt={`Signature of ${app.name}`} className="ppi-stamp-sig-img" />
                          ) : (
                            <div className="ppi-stamp-sig-svg-wrap" style={{ width: '100%', maxWidth: '200px', height: '48px' }}>
                              <svg viewBox="0 0 170 32" style={{ width: '100%', height: '48px' }}>
                                <path
                                  d="M 12 20 Q 30 5, 50 22 T 90 12 T 135 24 T 158 10"
                                  fill="none"
                                  stroke="#1e3a8a"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />
                                <text
                                  x="15"
                                  y="24"
                                  fontFamily="'Dancing Script', 'Brush Script MT', cursive, sans-serif"
                                  fontSize="17"
                                  fill="#1e3a8a"
                                  fontStyle="italic"
                                  opacity="0.9"
                                >
                                  {app.name}
                                </text>
                              </svg>
                            </div>
                          )}
                          <div className="ppi-stamp-sig-seal">
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
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PrintPurchaseInvoiceModal;
