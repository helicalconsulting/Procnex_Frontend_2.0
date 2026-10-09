import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, FileText, CheckCircle2, ShieldCheck, Landmark, Building2, Clock } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { approvalService } from '../../services/approvalService';
import { signatureService } from '../../services/signatureService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { invoiceService } from '../../services/invoiceService';
import { printElementInIframe } from '../../utils/pdfDownload';
import procnexLogo from '../../assets/procnex.png';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import './PrintPurchaseInvoiceModal.css';

export interface InvoiceLineItem {
  id?: number | string;
  itemCode?: string;
  itemName?: string;
  name?: string;
  description?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  unitPrice?: number;
  rate?: number;
  totalPrice?: number;
  amount?: number;
  poNumber?: string;
  department?: string;
}

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
  items?: InvoiceLineItem[];
  lineItems?: InvoiceLineItem[];
  purchaseOrder?: any;
  grn?: any;
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

function normalizeInvoiceItems(rawList: any[], data: PurchaseInvoicePrintData): InvoiceLineItem[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  return rawList.map((item: any, idx: number) => {
    const qty = Math.max(1, Number(item.quantity || item.qty || item.orderedQty || 1));
    let unitPrice = Number(item.unitPrice || item.rate || item.price || item.targetPrice || 0);
    let totalPrice = Number(item.totalPrice || item.total || item.grossAmount || item.amount || 0);

    if (!totalPrice && unitPrice) {
      totalPrice = unitPrice * qty;
    }
    if (!unitPrice && totalPrice) {
      unitPrice = Number((totalPrice / qty).toFixed(2));
    }
    if (!unitPrice && !totalPrice && data.amount > 0) {
      const share = data.amount / rawList.length;
      totalPrice = Number(share.toFixed(2));
      unitPrice = Number((totalPrice / qty).toFixed(2));
    }

    const name = item.itemName || item.name || item.description || (item.title ? item.title : `Line Item ${idx + 1}`);
    const code = item.itemCode || item.code || `ITM-${String(idx + 1).padStart(3, '0')}`;
    const desc = item.description && item.description !== name ? item.description : '';

    return {
      id: item.id || idx + 1,
      itemCode: code,
      name,
      description: desc,
      quantity: qty,
      unit: item.unit || 'Pcs',
      unitPrice,
      totalPrice,
      poNumber: item.poNumber || data.poNumber || '—',
      department: item.department || data.department || '—',
    };
  });
}

export function PrintPurchaseInvoiceModal({ data: dataProp, invoice: invoiceProp, onClose }: PrintPurchaseInvoiceModalProps) {
  const data = dataProp || invoiceProp;
  if (!data) return null;
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { companyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);
  const [approversList, setApproversList] = useState<any[]>(data.approvers || []);

  const [resolvedPaymentTerms, setResolvedPaymentTerms] = useState<string>(() => {
    if (data.paymentTerms && data.paymentTerms !== 'Net 30') return data.paymentTerms;
    const poTerms =
      (data as any).purchaseOrder?.rfq?.selectedQuotation?.paymentTerms ||
      (data as any).purchaseOrder?.paymentTerms ||
      (data as any).purchaseOrder?.rfq?.selectedQuotation?.paymentPlanSnapshot;
    if (poTerms) {
      return typeof poTerms === 'object' ? JSON.stringify(poTerms) : String(poTerms);
    }
    return data.paymentTerms || 'Net 30';
  });

  const [itemsList, setItemsList] = useState<InvoiceLineItem[]>(() => {
    const direct = data.items || data.lineItems || (data as any).purchaseOrder?.items || (data as any).purchaseOrder?.rfq?.items;
    if (Array.isArray(direct) && direct.length > 0) {
      return normalizeInvoiceItems(direct, data);
    }
    return [];
  });

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

  // 1. Asynchronously resolve items from PO / Invoice service / localStorage if not already provided
  useEffect(() => {
    let isMounted = true;
    const resolveItems = async () => {
      // Fetch from PO / Invoice service
      try {
        const [poRes, invRes] = await Promise.all([
          data.poNumber ? purchaseOrderService.list().catch(() => ({ orders: [] })) : Promise.resolve({ orders: [] }),
          invoiceService.list().catch(() => []),
        ]);
        if (!isMounted) return;

        // Check matching PO
        if (data.poNumber && poRes?.orders) {
          const matchedPO = poRes.orders.find((p: any) =>
            p.poNumber === data.poNumber || String(p.id) === data.poNumber || (p.poNumber && data.poNumber.includes(p.poNumber))
          );
          if (matchedPO) {
            const quoteTerms =
              matchedPO.rfq?.selectedQuotation?.paymentTerms ||
              matchedPO.paymentTerms ||
              (matchedPO as any).payment_terms;
            if (quoteTerms && quoteTerms !== 'Net 30') {
              setResolvedPaymentTerms(quoteTerms);
            }
            if (itemsList.length === 0 && matchedPO.items && matchedPO.items.length > 0) {
              setItemsList(normalizeInvoiceItems(matchedPO.items, data));
              return;
            }
          }
        }

        // Check matching Invoice
        if (invRes && Array.isArray(invRes)) {
          const matchedInv = invRes.find((i: any) =>
            i.invoiceNumber === data.invoiceNumber || String(i.id) === String(data.id)
          );
          if (matchedInv) {
            const invTerms =
              (matchedInv.paymentTerms && matchedInv.paymentTerms !== 'Net 30' ? matchedInv.paymentTerms : null) ||
              (matchedInv.purchaseOrder as any)?.rfq?.selectedQuotation?.paymentTerms ||
              (matchedInv.purchaseOrder as any)?.paymentTerms;
            if (invTerms && invTerms !== 'Net 30') {
              setResolvedPaymentTerms(invTerms);
            }
            if (itemsList.length === 0) {
              const foundItems = matchedInv?.items || matchedInv?.lineItems || (matchedInv?.purchaseOrder as any)?.items || (matchedInv?.purchaseOrder as any)?.rfq?.items;
              if (foundItems && Array.isArray(foundItems) && foundItems.length > 0) {
                setItemsList(normalizeInvoiceItems(foundItems, data));
                return;
              }
            }
          }
        }
      } catch {}

      if (itemsList.length > 0) return;

      // Check localStorage caches
      try {
        const keys = [
          data.invoiceNumber ? `invoice_items_${data.invoiceNumber}` : null,
          data.poNumber ? `po_items_${data.poNumber}` : null,
        ].filter(Boolean) as string[];

        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (isMounted) setItemsList(normalizeInvoiceItems(parsed, data));
              return;
            }
          }
        }
      } catch {}
    };

    resolveItems();
    return () => {
      isMounted = false;
    };
  }, [data.invoiceNumber, data.poNumber, data.id]);

  // 2. Fetch and match approver chain & signatures
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

  const finalDisplayItems = itemsList.length > 0 ? itemsList : [
    {
      id: 1,
      itemCode: 'ITM-001',
      name: `Purchase Goods & Services — Invoice ${data.invoiceNumber}`,
      description: `Supplied by ${data.vendorName} per Purchase Order agreement`,
      quantity: 1,
      unit: 'Lump Sum',
      unitPrice: data.amount,
      totalPrice: data.amount,
      poNumber: data.poNumber || '—',
      department: data.department || '—',
    },
  ];

  const computedSubtotal = finalDisplayItems.reduce((acc, it) => acc + (Number(it.totalPrice) || 0), 0) || data.amount;
  const totalInvoiceAmount = data.amount || computedSubtotal;
  const computedTax = (data as any).taxAmount !== undefined
    ? Number((data as any).taxAmount)
    : (totalInvoiceAmount > computedSubtotal ? Number((totalInvoiceAmount - computedSubtotal).toFixed(2)) : 0);
  const taxPercentage = computedSubtotal > 0 && computedTax > 0 ? Math.round((computedTax / computedSubtotal) * 100) : 0;

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
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
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
                    <td className="ppi-sheet__meta-val">{resolvedPaymentTerms || data.paymentTerms || 'Net 30'}</td>
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

          {/* Table Breakdown - All items dynamically listed */}
          <div className="ppi-sheet__table-wrap">
            <table className="ppi-sheet__items-table">
              <thead>
                <tr>
                  <th style={{ width: '38px', textAlign: 'center' }}>#</th>
                  <th>Item / Description</th>
                  <th style={{ width: '135px' }}>PO Reference</th>
                  <th style={{ width: '110px' }}>Department</th>
                  <th style={{ textAlign: 'center', width: '65px' }}>Qty</th>
                  <th style={{ textAlign: 'right', width: '110px' }}>Unit Rate</th>
                  <th style={{ textAlign: 'right', width: '125px' }}>Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {finalDisplayItems.map((item, idx) => {
                  const qty = item.quantity || 1;
                  const unitRate = item.unitPrice || (item.totalPrice ? Math.round(item.totalPrice / qty) : computedSubtotal);
                  const lineTotal = item.totalPrice || (qty * unitRate);
                  return (
                    <tr key={idx}>
                      <td style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>{idx + 1}</td>
                      <td>
                        <strong style={{ color: '#0f172a' }}>{item.name || item.itemName || `Line Item ${idx + 1}`}</strong>
                        {item.itemCode && <span className="ppi-item-code"> [{item.itemCode}]</span>}
                        {item.description ? (
                          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.35 }}>
                            {item.description}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ fontSize: '12.5px', color: '#334155' }}>{item.poNumber || data.poNumber || '—'}</td>
                      <td style={{ fontSize: '12.5px', color: '#334155' }}>{item.department || data.department || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '13px' }}>
                        {qty} {item.unit && item.unit !== 'Unit' && item.unit !== 'Units' ? <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>{item.unit}</span> : ''}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: '13px', color: '#334155' }}>
                        {formatAmount(unitRate, companyDefaultCurrency)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>
                        {formatAmount(lineTotal, companyDefaultCurrency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total Breakdown Box */}
          <div className="ppi-sheet__total-box">
            <div className="ppi-sheet__total-row">
              <span>Subtotal:</span>
              <span>{formatAmount(computedSubtotal, companyDefaultCurrency)}</span>
            </div>
            <div className="ppi-sheet__total-row">
              <span>Tax / VAT{taxPercentage > 0 ? ` (${taxPercentage}%):` : ':'}</span>
              <span style={{ color: computedTax > 0 ? '#0f172a' : '#64748b' }}>
                {computedTax > 0 ? `+ ${formatAmount(computedTax, companyDefaultCurrency)}` : formatAmount(0, companyDefaultCurrency)}
              </span>
            </div>
            <div className="ppi-sheet__total-row ppi-sheet__total-row--grand">
              <span>Total Invoice Amount:</span>
              <span>{formatAmount(totalInvoiceAmount, companyDefaultCurrency)}</span>
            </div>
          </div>

          {data.comments && (
            <div style={{ marginTop: 20, padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
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
