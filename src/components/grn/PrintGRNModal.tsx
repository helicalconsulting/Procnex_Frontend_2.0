import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, PackageCheck, CheckCircle2, FileText, MapPin, Building2, ShieldCheck } from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { printElementInIframe } from '../../utils/pdfDownload';
import procnexLogo from '../../assets/procnex.png';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import './PrintGRNModal.css';

export interface GRNPrintItem {
  id?: string | number;
  itemCode?: string;
  itemName?: string;
  title?: string;
  name?: string;
  description?: string;
  orderedQty?: number;
  quantity?: number;
  receivedQty?: number;
  acceptedQty?: number;
  rejectedQty?: number;
  unit?: string;
  unitPrice?: number;
  totalPrice?: number;
  remarks?: string;
}

export interface GRNPrintData {
  id?: string;
  grnNumber?: string;
  poId?: string;
  poNumber?: string;
  vendorId?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorGstVat?: string;
  vendorDispatchNoteNumber?: string;
  dispatchNoteNumber?: string;
  receivedDate?: string;
  warehouse?: string;
  storeLocation?: string;
  notes?: string;
  status?: string;
  items?: GRNPrintItem[];
  lineItems?: GRNPrintItem[];
  purchaseOrder?: any;
  receivedBy?: string;
  inspectedBy?: string;
  approvedBy?: string;
}

interface PrintGRNModalProps {
  data?: GRNPrintData;
  grn?: GRNPrintData;
  po?: any;
  onClose: () => void;
}

function formatDocDate(d?: string | null): string {
  if (!d) return new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(d);
  }
}

export function PrintGRNModal({
  data: dataProp,
  grn: grnProp,
  po,
  onClose,
}: PrintGRNModalProps) {
  const data = dataProp || grnProp;
  if (!data) return null;

  const { companyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);

  const displayCompanyName =
    profile?.companyName ||
    companyName ||
    po?.buyerCompanyName ||
    'Procnex Procurement Corp';

  const companyAddress =
    profile?.address ||
    profile?.companyAddress ||
    'Corporate Headquarters, Tech Boulevard, Sector 62, Noida, UP 201301';

  let finalLogoUrl = logoUrl || profile?.logoUrl;
  if (!finalLogoUrl) {
    if (displayCompanyName.toLowerCase().includes('procnex')) {
      finalLogoUrl = procnexLogo;
    } else if (displayCompanyName.toLowerCase().includes('helical')) {
      finalLogoUrl = defaultHeliflowLogo;
    }
  }

  const grnNumber = data.grnNumber || data.id || 'GRN-DRAFT';
  const poNumber = data.poNumber || data.purchaseOrder?.poNumber || po?.poNumber || data.poId || '—';
  const dispatchRef =
    data.vendorDispatchNoteNumber ||
    data.dispatchNoteNumber ||
    (data as any).lrNumber ||
    'DN-DIRECT';

  const vendorName =
    data.vendorName ||
    data.purchaseOrder?.vendor?.name ||
    po?.vendorName ||
    po?.vendor?.name ||
    'Authorized Supplier';

  const vendorAddress =
    data.vendorAddress ||
    data.purchaseOrder?.vendor?.address ||
    po?.vendorAddress ||
    po?.vendor?.address ||
    'Supplier Registered Warehouse / Depot';

  const vendorGst =
    data.vendorGstVat ||
    data.purchaseOrder?.vendor?.gstNumber ||
    data.purchaseOrder?.vendor?.taxId ||
    po?.vendorGstVat ||
    po?.vendor?.gstNumber;

  const warehouseLocation =
    data.warehouse ||
    data.storeLocation ||
    po?.shipToWarehouse ||
    po?.warehouse ||
    'Central Receiving Store / Warehouse 01';

  const rawStatus = (data.status || 'VERIFIED').toUpperCase().trim();
  const isAccepted = rawStatus === 'RECEIVED' || rawStatus === 'VERIFIED' || rawStatus === 'APPROVED' || rawStatus === 'POSTED';
  const statusLabel = isAccepted ? 'VERIFIED & RECEIVED' : rawStatus;

  const rawItems = (data.items && data.items.length > 0)
    ? data.items
    : (data.lineItems && data.lineItems.length > 0)
    ? data.lineItems
    : [];

  const itemsList = rawItems.map((item, idx) => {
    const itemCode = item.itemCode || `ITM-${String(idx + 1).padStart(3, '0')}`;
    const itemName = item.itemName || item.title || item.name || `Item ${idx + 1}`;
    const ordered = Number(item.orderedQty ?? item.quantity ?? 0);
    const received = Number(item.receivedQty ?? item.quantity ?? ordered);
    const accepted = Number(item.acceptedQty ?? received);
    const rejected = Number(item.rejectedQty ?? 0);
    const unit = item.unit || 'pcs';
    const unitPrice = Number(item.unitPrice || 0);
    const totalPrice = Number(item.totalPrice || (accepted * unitPrice) || 0);
    const remarks = item.remarks || (rejected > 0 ? `Rejected: ${rejected} ${unit}` : 'Quality Sound & Accepted');

    return {
      id: item.id || idx + 1,
      itemCode,
      itemName,
      description: item.description,
      orderedQty: ordered,
      receivedQty: received,
      acceptedQty: accepted,
      rejectedQty: rejected,
      unit,
      unitPrice,
      totalPrice,
      remarks,
    };
  });

  const totalOrdered = itemsList.reduce((acc, it) => acc + (it.orderedQty || 0), 0);
  const totalReceived = itemsList.reduce((acc, it) => acc + (it.receivedQty || 0), 0);
  const totalAccepted = itemsList.reduce((acc, it) => acc + (it.acceptedQty || 0), 0);
  const totalRejected = itemsList.reduce((acc, it) => acc + (it.rejectedQty || 0), 0);
  const totalValue = itemsList.reduce((acc, it) => acc + (it.totalPrice || 0), 0);

  const handlePrint = () => {
    if (printableRef.current) {
      printElementInIframe(printableRef.current, `Goods_Receipt_Note_${grnNumber}`);
    } else {
      window.print();
    }
  };

  return createPortal(
    <div className="pgrn-modal-backdrop" onClick={onClose}>
      <div className="pgrn-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Header */}
        <div className="pgrn-modal__topbar no-print">
          <div className="pgrn-modal__topbar-title">
            <PackageCheck size={20} className="pgrn-modal__icon" />
            <span>Goods Receipt Note (GRN) — {grnNumber}</span>
            <span className={`pgrn-badge ${isAccepted ? 'pgrn-badge--received' : 'pgrn-badge--pending'}`}>
              {statusLabel}
            </span>
          </div>
          <div className="pgrn-modal__topbar-actions">
            <button className="pgrn-btn pgrn-btn--primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF GRN
            </button>
            <button className="pgrn-btn pgrn-btn--close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="pgrn-sheet" ref={printableRef}>
          {/* Header */}
          <div className="pgrn-sheet__header">
            <div className="pgrn-sheet__company">
              {finalLogoUrl ? (
                <>
                  <img
                    src={finalLogoUrl}
                    alt={displayCompanyName}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    style={{ maxHeight: 46, maxWidth: 200, objectFit: 'contain', marginBottom: 8, display: 'block' }}
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
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #059669, #047857)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 16,
                      letterSpacing: 0.5,
                    }}
                  >
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

            <div className="pgrn-sheet__title-block">
              <h1 className="pgrn-sheet__doc-title">GOODS RECEIPT NOTE</h1>
              <div className="pgrn-sheet__doc-subtitle">MATERIAL INWARD & INSPECTION REPORT</div>
              <div className="pgrn-sheet__doc-num">{grnNumber}</div>
              <table className="pgrn-sheet__meta-table">
                <tbody>
                  <tr>
                    <td className="pgrn-sheet__meta-label">GRN Date:</td>
                    <td className="pgrn-sheet__meta-val">{formatDocDate(data.receivedDate)}</td>
                  </tr>
                  <tr>
                    <td className="pgrn-sheet__meta-label">PO Reference:</td>
                    <td className="pgrn-sheet__meta-val font-mono">{poNumber}</td>
                  </tr>
                  <tr>
                    <td className="pgrn-sheet__meta-label">Challan / LR No:</td>
                    <td className="pgrn-sheet__meta-val font-mono">{dispatchRef}</td>
                  </tr>
                  <tr>
                    <td className="pgrn-sheet__meta-label">Inward Status:</td>
                    <td className="pgrn-sheet__meta-val">
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                          background: '#ecfdf5',
                          color: '#047857',
                          border: '1px solid #a7f3d0',
                        }}
                      >
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Logistics & Storage Strip */}
          <div className="pgrn-sheet__logistics">
            <div className="pgrn-sheet__logistic-col">
              <span className="pgrn-sheet__logistic-label">Receiving Store / Hub</span>
              <span className="pgrn-sheet__logistic-value">{warehouseLocation}</span>
              <span className="pgrn-sheet__logistic-sub">Physical Inward Location</span>
            </div>
            <div className="pgrn-sheet__logistic-col">
              <span className="pgrn-sheet__logistic-label">Receipt Mode</span>
              <span className="pgrn-sheet__logistic-value">Verified Inward Delivery</span>
              <span className="pgrn-sheet__logistic-sub">3-Way Match Inward</span>
            </div>
            <div className="pgrn-sheet__logistic-col">
              <span className="pgrn-sheet__logistic-label">Package Condition</span>
              <span className="pgrn-sheet__logistic-value">Intact / Seals Verified</span>
              <span className="pgrn-sheet__logistic-sub">Gate Verification Passed</span>
            </div>
            <div className="pgrn-sheet__logistic-col">
              <span className="pgrn-sheet__logistic-label">Inspection Verdict</span>
              <span className="pgrn-sheet__logistic-value" style={{ color: totalRejected > 0 ? '#b45309' : '#047857' }}>
                {totalRejected > 0 ? `${totalRejected} Rejected / Discrepancy` : 'Accepted In Full'}
              </span>
              <span className="pgrn-sheet__logistic-sub">Technical Verification</span>
            </div>
          </div>

          {/* Consignor / Receiving Parties */}
          <div className="pgrn-sheet__parties">
            <div className="pgrn-sheet__party-box">
              <div className="pgrn-sheet__party-heading">SUPPLIER / VENDOR DETAILS</div>
              <div className="pgrn-sheet__party-name">{vendorName}</div>
              <div className="pgrn-sheet__party-address">{vendorAddress}</div>
              {vendorGst && (
                <div className="pgrn-sheet__party-detail">
                  <strong>GSTIN / Tax ID:</strong> {vendorGst}
                </div>
              )}
            </div>

            <div className="pgrn-sheet__party-box">
              <div className="pgrn-sheet__party-heading">RECEIVING STORE / CONSIGNEE</div>
              <div className="pgrn-sheet__party-name">{displayCompanyName}</div>
              <div className="pgrn-sheet__party-address">
                {warehouseLocation}
                <br />
                {companyAddress}
              </div>
              <div className="pgrn-sheet__party-detail">
                <strong>Inward Date:</strong> {formatDocDate(data.receivedDate)}
              </div>
            </div>
          </div>

          {/* Line Items & Inspection Breakdown Table */}
          <table className="pgrn-sheet__items-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Item Code & Description</th>
                <th className="text-center" style={{ width: 75 }}>Ordered</th>
                <th className="text-center" style={{ width: 80 }}>Received</th>
                <th className="text-center" style={{ width: 80 }}>Accepted</th>
                <th className="text-center" style={{ width: 75 }}>Rejected</th>
                <th className="text-center" style={{ width: 55 }}>Unit</th>
                {totalValue > 0 && <th className="text-right" style={{ width: 95 }}>Total Value</th>}
                <th style={{ width: 160 }}>Inspection Remarks</th>
              </tr>
            </thead>
            <tbody>
              {itemsList.map((item, idx) => (
                <tr key={item.id}>
                  <td className="text-center text-slate-500 font-mono text-[11px]">{idx + 1}</td>
                  <td>
                    <div className="pgrn-sheet__item-code">{item.itemCode}</div>
                    <div className="pgrn-sheet__item-name">{item.itemName}</div>
                    {item.description && item.description !== item.itemName && (
                      <div className="pgrn-sheet__item-desc">{item.description}</div>
                    )}
                  </td>
                  <td className="text-center font-medium">{item.orderedQty}</td>
                  <td className="text-center font-bold text-slate-900">{item.receivedQty}</td>
                  <td className="text-center font-bold text-emerald-700">{item.acceptedQty}</td>
                  <td className="text-center font-bold text-rose-700">{item.rejectedQty || 0}</td>
                  <td className="text-center text-slate-600">{item.unit}</td>
                  {totalValue > 0 && (
                    <td className="text-right font-semibold">
                      {item.totalPrice ? `₹${item.totalPrice.toLocaleString('en-IN')}` : '—'}
                    </td>
                  )}
                  <td className="text-slate-600 text-[11px]">{item.remarks}</td>
                </tr>
              ))}

              {/* Total Summary Row */}
              <tr className="pgrn-sheet__table-summary">
                <td colSpan={2} className="text-right" style={{ padding: '10px 12px' }}>
                  TOTAL INWARD QUANTITIES:
                </td>
                <td className="text-center font-medium">{totalOrdered || '—'}</td>
                <td className="text-center font-bold text-slate-900">{totalReceived}</td>
                <td className="text-center font-bold text-emerald-800">{totalAccepted}</td>
                <td className="text-center font-bold text-rose-800">{totalRejected}</td>
                <td className="text-center text-slate-600">items</td>
                {totalValue > 0 && (
                  <td className="text-right font-bold text-emerald-900">
                    ₹{totalValue.toLocaleString('en-IN')}
                  </td>
                )}
                <td className="text-slate-500 text-[11px]">
                  {itemsList.length} line item(s) verified
                </td>
              </tr>
            </tbody>
          </table>

          {/* Notes / Remarks Box */}
          {data.notes && (
            <div className="pgrn-sheet__notes-box">
              <div className="pgrn-sheet__notes-title">SPECIAL NOTES / INWARD REMARKS</div>
              <div>{data.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PrintGRNModal;
