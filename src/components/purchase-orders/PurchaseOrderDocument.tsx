import { useBranding } from '../../context/BrandingContext';
import type { PurchaseRequisition } from '../../services/purchaseRequisitionService';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import './PurchaseOrderDocument.css';

interface Props {
  pr: PurchaseRequisition;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
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

export default function PurchaseOrderDocument({ pr }: Props) {
  const { companyName: brandingCompanyName, companyPhone: brandingPhone, companyEmail: brandingEmail, logoUrl } = useBranding();

  const finalCompanyName = pr.companyName || brandingCompanyName || 'Procnex Consulting';

  const finalLogoUrl = logoUrl || (pr as any).companyLogoUrl || defaultHeliflowLogo;

  return (
    <div className="po-document">
      {/* ── Header ── */}
      <div className="po-doc__header">
        <div className="po-doc__header-left">
          <img src={finalLogoUrl} alt={finalCompanyName} className="po-doc__logo" />
          <div className="po-doc__company-info">
            <h1 className="po-doc__company-name">{val(finalCompanyName)}</h1>
            <p className="po-doc__company-detail">{val(pr.companyAddress, 'Industrial Zone, Building 4')}</p>
            <p className="po-doc__company-detail">
              Phone: {val(brandingPhone || pr.companyPhone, '+91 800-PROCNEX')} &nbsp;|&nbsp; Email: {val(brandingEmail || pr.companyEmail, 'procurement@procnex.com')}
            </p>
            <p className="po-doc__company-detail">{val(pr.companyWebsite, 'www.procnex.com')}</p>
          </div>
        </div>
        <div className="po-doc__header-right">
          <div className="po-doc__title-block">
            <span className="po-doc__title-label">PURCHASE ORDER</span>
            <span className="po-doc__title-po-num">{ensurePONumber(pr.poNumber)}</span>
          </div>
          <table className="po-doc__meta-table">
            <tbody>
              <tr><td className="po-doc__meta-label">PO Date</td><td className="po-doc__meta-value">{formatDate(pr.poDate)}</td></tr>
              <tr><td className="po-doc__meta-label">PO Number</td><td className="po-doc__meta-value">{ensurePONumber(pr.poNumber)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="po-doc__divider" />

      {/* ── Vendor & Ship To ── */}
      <div className="po-doc__parties">
        <div className="po-doc__party-box">
          <h3 className="po-doc__party-heading">VENDOR</h3>
          <p className="po-doc__party-name">{val(pr.vendorName)}</p>
          <p className="po-doc__party-detail">Contact: {val(pr.vendorContactPerson)}</p>
          <p className="po-doc__party-detail">Address: {val(pr.vendorAddress)}</p>
          <p className="po-doc__party-detail">Phone: {val(pr.vendorPhone)}</p>
          <p className="po-doc__party-detail">Email: {val(pr.vendorEmail)}</p>
          <p className="po-doc__party-detail">GST/VAT: {val(pr.vendorGstVat)}</p>
        </div>
        <div className="po-doc__party-box">
          <h3 className="po-doc__party-heading">SHIP TO</h3>
          <p className="po-doc__party-name">{val(pr.shipToCompany)}</p>
          <p className="po-doc__party-detail">Warehouse: {val(pr.shipToWarehouse)}</p>
          <p className="po-doc__party-detail">Address: {val(pr.shipToAddress)}</p>
          <p className="po-doc__party-detail">Contact: {val(pr.shipToContact)}</p>
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
      </div>

      {/* ── Items Table ── */}
      <div className="po-doc__table-wrap">
        <table className="po-doc__items-table">
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '35%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '15%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="po-doc__th--no">#</th>
              <th className="po-doc__th--desc">Description</th>
              <th className="po-doc__th--qty">Quantity</th>
              <th className="po-doc__th--unit">Unit</th>
              <th className="po-doc__th--price">Unit Price</th>
              <th className="po-doc__th--tax">Tax %</th>
              <th className="po-doc__th--disc">Disc %</th>
              <th className="po-doc__th--total">Total</th>
            </tr>
          </thead>
          <tbody>
            {pr.items.map((item) => (
              <tr key={item.itemNo}>
                <td className="po-doc__td--no">{item.itemNo}</td>
                <td className="po-doc__td--desc">{val(item.description)}</td>
                <td className="po-doc__td--qty">{item.quantity}</td>
                <td className="po-doc__td--unit">{val(item.unit)}</td>
                <td className="po-doc__td--price">{formatCurrency(item.unitPrice, pr.currency)}</td>
                <td className="po-doc__td--tax">{item.taxPercent}%</td>
                <td className="po-doc__td--disc">{item.discount > 0 ? `${item.discount}%` : '—'}</td>
                <td className="po-doc__td--total">{formatCurrency(item.total, pr.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Totals ── */}
      <div className="po-doc__totals">
        <div className="po-doc__totals-table">
          <div className="po-doc__total-row">
            <span className="po-doc__total-label">Subtotal</span>
            <span className="po-doc__total-value">{formatCurrency(pr.subtotal, pr.currency)}</span>
          </div>
          <div className="po-doc__total-row">
            <span className="po-doc__total-label">Discount</span>
            <span className={`po-doc__total-value ${pr.discountTotal > 0 ? 'po-doc__total-value--negative' : ''}`}>
              {pr.discountTotal > 0 ? `-${formatCurrency(pr.discountTotal, pr.currency)}` : formatCurrency(0, pr.currency)}
            </span>
          </div>
          <div className="po-doc__total-row">
            <span className="po-doc__total-label">Tax</span>
            <span className="po-doc__total-value">{formatCurrency(pr.taxTotal, pr.currency)}</span>
          </div>
          <div className="po-doc__total-row">
            <span className="po-doc__total-label">Shipping Charges</span>
            <span className="po-doc__total-value">{formatCurrency(pr.shippingCharges || 0, pr.currency)}</span>
          </div>
          <div className="po-doc__total-row">
            <span className="po-doc__total-label">Other Charges</span>
            <span className="po-doc__total-value">{formatCurrency(pr.otherCharges || 0, pr.currency)}</span>
          </div>
          <div className="po-doc__total-divider" />
          <div className="po-doc__total-row po-doc__total-row--grand">
            <span className="po-doc__total-label po-doc__total-label--grand">Grand Total</span>
            <span className="po-doc__total-value po-doc__total-value--grand">{formatCurrency(pr.grandTotal, pr.currency)}</span>
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

      {/* ── Footer ── */}
      <div className="po-doc__footer">
        <div className="po-doc__footer-divider" />
        <p className="po-doc__footer-text">
          {val(brandingCompanyName)}
          <span> &nbsp;|&nbsp; Phone: {val(brandingPhone)}</span>
          <span> &nbsp;|&nbsp; Email: {val(brandingEmail)}</span>
          {pr.companyWebsite && <span> &nbsp;|&nbsp; {pr.companyWebsite}</span>}
        </p>
      </div>
    </div>
  );
}
