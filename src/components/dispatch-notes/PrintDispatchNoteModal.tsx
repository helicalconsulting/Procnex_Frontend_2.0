import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Truck, CheckCircle2, Clock, Calendar, FileText, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { printElementInIframe } from '../../utils/pdfDownload';
import procnexLogo from '../../assets/procnex.png';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import './PrintDispatchNoteModal.css';

export interface DispatchNotePrintItem {
  id?: string | number;
  itemCode?: string;
  itemName?: string;
  title?: string;
  description?: string;
  poQty?: number;
  orderedQty?: number;
  dispatchedQty?: number;
  qty?: number;
  unit?: string;
  remarks?: string;
}

export interface DispatchNotePrintData {
  id?: string;
  dispatchNoteNumber?: string;
  poId?: string;
  poNumber?: string;
  vendorId?: string;
  vendorName?: string;
  dispatchDate?: string;
  expectedDeliveryDate?: string;
  transportMode?: string;
  transporterName?: string;
  carrierName?: string;
  vehicleNumber?: string;
  trackingNumber?: string;
  driverName?: string;
  driverPhone?: string;
  driverEmail?: string;
  dispatchFromAddress?: string;
  shippingAddress?: string;
  totalPackages?: number | string;
  totalWeight?: string;
  notes?: string;
  status?: string;
  items?: DispatchNotePrintItem[];
  lineItems?: DispatchNotePrintItem[];
  purchaseOrder?: any;
}

interface PrintDispatchNoteModalProps {
  data?: DispatchNotePrintData;
  dispatchNote?: DispatchNotePrintData;
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

export function PrintDispatchNoteModal({
  data: dataProp,
  dispatchNote: dnProp,
  po,
  onClose,
}: PrintDispatchNoteModalProps) {
  const data = dataProp || dnProp;
  if (!data) return null;

  const { companyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);

  const displayCompanyName =
    profile?.companyName ||
    companyName ||
    (po?.buyerCompanyName) ||
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

  const rawStatus = (data.status || 'IN_TRANSIT').toUpperCase().trim();
  const isReceived = rawStatus === 'RECEIVED';
  const isDraft = rawStatus === 'DRAFT';
  const statusLabel = isReceived ? 'RECEIVED BY BUYER' : isDraft ? 'DRAFT CHALLAN' : 'DISPATCHED / IN TRANSIT';

  const poNumber = data.poNumber || (data.purchaseOrder?.poNumber) || (po?.poNumber) || data.poId || '—';
  const vendorName =
    data.vendorName ||
    (data.purchaseOrder?.vendor?.name) ||
    (po?.vendorName) ||
    (po?.vendor?.name) ||
    'Authorized Supplier';

  const rawItems = (data.items && data.items.length > 0)
    ? data.items
    : (data.lineItems && data.lineItems.length > 0)
    ? data.lineItems
    : [];

  const itemsList = rawItems.map((item, idx) => {
    const itemCode = item.itemCode || `ITM-${String(idx + 1).padStart(3, '0')}`;
    const itemName = item.itemName || item.title || `Item ${idx + 1}`;
    const ordered = Number(item.orderedQty || item.poQty || 0);
    const dispatched = Number(item.dispatchedQty || item.qty || ordered || 1);
    const unit = item.unit || 'Units';
    const remarks = item.remarks || (dispatched === ordered ? 'Full shipment' : 'Part shipment');
    return {
      id: item.id || idx + 1,
      itemCode,
      itemName,
      description: item.description,
      orderedQty: ordered,
      dispatchedQty: dispatched,
      unit,
      remarks,
    };
  });

  const totalDispatchedQty = itemsList.reduce((acc, it) => acc + (it.dispatchedQty || 0), 0);

  const handlePrint = () => {
    if (printableRef.current) {
      printElementInIframe(printableRef.current, `Delivery_Challan_${data.dispatchNoteNumber || 'DN'}`);
    } else {
      window.print();
    }
  };

  return createPortal(
    <div className="pdn-modal-backdrop" onClick={onClose}>
      <div className="pdn-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Header */}
        <div className="pdn-modal__topbar no-print">
          <div className="pdn-modal__topbar-title">
            <Truck size={20} className="pdn-modal__icon" />
            <span>Delivery Challan / Dispatch Note — {data.dispatchNoteNumber}</span>
            <span
              className={`pdn-badge ${
                isReceived
                  ? 'pdn-badge--received'
                  : isDraft
                  ? 'pdn-badge--draft'
                  : 'pdn-badge--transit'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="pdn-modal__topbar-actions">
            <button className="pdn-btn pdn-btn--primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF Challan
            </button>
            <button className="pdn-btn pdn-btn--close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="pdn-sheet" ref={printableRef}>
          {/* Header */}
          <div className="pdn-sheet__header">
            <div className="pdn-sheet__company">
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
                      background: 'linear-gradient(135deg, #0284c7, #0369a1)',
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

            <div className="pdn-sheet__title-block">
              <h1 className="pdn-sheet__doc-title">DELIVERY CHALLAN</h1>
              <div className="pdn-sheet__doc-subtitle">DISPATCH NOTE / GOODS ADVICE</div>
              <div className="pdn-sheet__doc-num">{data.dispatchNoteNumber}</div>
              <table className="pdn-sheet__meta-table">
                <tbody>
                  <tr>
                    <td className="pdn-sheet__meta-label">Challan Date:</td>
                    <td className="pdn-sheet__meta-val">{formatDocDate(data.dispatchDate)}</td>
                  </tr>
                  <tr>
                    <td className="pdn-sheet__meta-label">Est. Delivery:</td>
                    <td className="pdn-sheet__meta-val">{formatDocDate(data.expectedDeliveryDate)}</td>
                  </tr>
                  <tr>
                    <td className="pdn-sheet__meta-label">PO Reference:</td>
                    <td className="pdn-sheet__meta-val font-mono">{poNumber}</td>
                  </tr>
                  <tr>
                    <td className="pdn-sheet__meta-label">Shipment Status:</td>
                    <td className="pdn-sheet__meta-val">
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                          background: isReceived ? '#ecfdf5' : isDraft ? '#fffbeb' : '#f0f9ff',
                          color: isReceived ? '#047857' : isDraft ? '#b45309' : '#0369a1',
                          border: `1px solid ${isReceived ? '#a7f3d0' : isDraft ? '#fde68a' : '#bae6fd'}`,
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

          {/* Logistics & Carrier Strip */}
          <div className="pdn-sheet__logistics">
            <div className="pdn-sheet__logistic-col">
              <span className="pdn-sheet__logistic-label">Transport Mode</span>
              <span className="pdn-sheet__logistic-value">{data.transportMode || 'Road Freight'}</span>
              <span className="pdn-sheet__logistic-sub">Surface Transit</span>
            </div>
            <div className="pdn-sheet__logistic-col">
              <span className="pdn-sheet__logistic-label">Carrier / Transporter</span>
              <span className="pdn-sheet__logistic-value">{data.transporterName || data.carrierName || 'Direct Logistics'}</span>
              <span className="pdn-sheet__logistic-sub">Vehicle: {data.vehicleNumber || 'To Be Assigned'}</span>
            </div>
            <div className="pdn-sheet__logistic-col">
              <span className="pdn-sheet__logistic-label">LR / Docket / Consignment #</span>
              <span className="pdn-sheet__logistic-value font-mono">{data.trackingNumber || 'Pending / In-Hand'}</span>
              <span className="pdn-sheet__logistic-sub">Tracking Identifier</span>
            </div>
            <div className="pdn-sheet__logistic-col">
              <span className="pdn-sheet__logistic-label">Packages & Weight</span>
              <span className="pdn-sheet__logistic-value">
                {data.totalPackages ? `${data.totalPackages} Packages` : '1 Package'}
              </span>
              <span className="pdn-sheet__logistic-sub">{data.totalWeight || 'Standard Tare'}</span>
            </div>
          </div>

          {/* Consignor (Dispatch From) & Consignee (Ship To) Parties */}
          <div className="pdn-sheet__parties">
            <div className="pdn-sheet__party-box">
              <div className="pdn-sheet__party-heading">CONSIGNOR (DISPATCH FROM)</div>
              <div className="pdn-sheet__party-name">{vendorName}</div>
              <div className="pdn-sheet__party-address">
                {data.dispatchFromAddress || 'Vendor Logistics Hub / Central Dispatch Warehouse'}
              </div>
              {(data.driverName || data.driverPhone || data.driverEmail) && (
                <div className="pdn-sheet__party-detail">
                  <strong>Driver / Contact:</strong> {data.driverName || '—'}{' '}
                  {data.driverPhone ? `(Ph: ${data.driverPhone})` : ''}{' '}
                  {data.driverEmail ? `(Email: ${data.driverEmail})` : ''}
                </div>
              )}
            </div>

            <div className="pdn-sheet__party-box">
              <div className="pdn-sheet__party-heading">CONSIGNEE (SHIP TO / RECEIVING PLANT)</div>
              <div className="pdn-sheet__party-name">{displayCompanyName}</div>
              <div className="pdn-sheet__party-address">
                {data.shippingAddress || companyAddress || 'Central Receiving Dock / Store Department'}
              </div>
              <div className="pdn-sheet__party-detail">
                <strong>Attention:</strong> Inward Goods & Stores Department (GRN Gate)
              </div>
            </div>
          </div>

          {/* Items Breakdown Table */}
          <table className="pdn-sheet__items-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} className="text-center">#</th>
                <th style={{ width: 110 }}>Item Code</th>
                <th>Description / Specification</th>
                <th style={{ width: 120 }}>PO Ref</th>
                <th style={{ width: 90 }} className="text-right">Ordered Qty</th>
                <th style={{ width: 100 }} className="text-right">Dispatched</th>
                <th style={{ width: 80 }} className="text-center">Unit</th>
                <th style={{ width: 130 }}>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {itemsList.length > 0 ? (
                itemsList.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td className="text-center font-mono text-muted-foreground">{idx + 1}</td>
                    <td className="pdn-sheet__item-code">{item.itemCode}</td>
                    <td>
                      <div className="pdn-sheet__item-name">{item.itemName}</div>
                      {item.description && <div className="pdn-sheet__item-desc">{item.description}</div>}
                    </td>
                    <td className="font-mono text-xs">{poNumber}</td>
                    <td className="text-right font-medium">{item.orderedQty > 0 ? item.orderedQty : '—'}</td>
                    <td className="text-right font-bold text-sky-900">{item.dispatchedQty}</td>
                    <td className="text-center">{item.unit}</td>
                    <td className="text-xs text-muted-foreground">{item.remarks}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="text-center py-6 text-muted-foreground">
                    No items specified on this delivery challan.
                  </td>
                </tr>
              )}
              <tr className="pdn-sheet__table-summary">
                <td colSpan={4} className="text-right" style={{ padding: '10px 12px' }}>
                  TOTAL DISPATCH QUANTITY:
                </td>
                <td className="text-right font-medium">
                  {itemsList.reduce((acc, it) => acc + (it.orderedQty || 0), 0) || '—'}
                </td>
                <td className="text-right font-bold text-sky-900">
                  {totalDispatchedQty}
                </td>
                <td colSpan={2}>
                  {data.totalPackages ? `(${data.totalPackages} total pkgs)` : ''}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Special Instructions & Notes */}
          <div className="pdn-sheet__notes-box">
            <div className="pdn-sheet__notes-title">SPECIAL HANDLING & DELIVERY INSTRUCTIONS</div>
            <div>
              {data.notes ||
                'Material must be accompanied by this original delivery challan. Inspect packages for seal integrity upon arrival. Any transit damages or seal discrepancies must be endorsed immediately on LR.'}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default PrintDispatchNoteModal;
