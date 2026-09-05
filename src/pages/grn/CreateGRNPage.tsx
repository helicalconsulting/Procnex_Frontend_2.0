import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { grnService, type GRNItemPayload } from '../../services/grnService';
import {
  ArrowLeft,
  Truck,
  CheckCircle2,
  PackageCheck,
  Send,
  Upload,
  Paperclip,
  X,
  Printer
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useAuth } from '../../context/AuthContext';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import '../../components/purchase-orders/PurchaseOrderDocument.css';

interface LineItemState {
  id: string;
  itemName: string;
  orderedQty: number;
  receivedQty: number | '';
  unitPrice: number;
  unit: string;
  remarks: string;
}

export default function CreateGRNPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreateGRN = hasPermission('PO Creation', 'canCreate') || hasPermission('Goods Received Note', 'canCreate') || hasPermission('GRN', 'canCreate');
  const [searchParams] = useSearchParams();
  const poIdParam = searchParams.get('poId');
  const { companyDefaultCurrency, formatAmount } = useCurrency();
  const { companyName, companyPhone, companyEmail, logoUrl } = useBranding();

  // Load purchase orders list from API
  const { data: poData, loading: poLoading } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );

  const poList = poData.orders || [];

  // Form State
  const [grnNumber] = useState<string>(() => `DN-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedPoId, setSelectedPoId] = useState<string>('');
  const [receivedDate, setReceivedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>('');
  const [currency, setCurrency] = useState<string>(companyDefaultCurrency);
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

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

  // Line items state
  const [lineItems, setLineItems] = useState<LineItemState[]>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Safe string converter to prevent TypeError: Cannot convert object to primitive value
  const safeStr = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'object') {
      if (val.$oid) return String(val.$oid);
      if (val._id) return safeStr(val._id);
      if (val.id) return safeStr(val.id);
      if (val.poNumber) return safeStr(val.poNumber);
      if (val.grnNumber) return safeStr(val.grnNumber);
      if (val.name) return safeStr(val.name);
      try {
        return String(val);
      } catch {
        return '';
      }
    }
    return '';
  };

  // Selected PO details
  const selectedPO = useMemo(() => {
    if (!selectedPoId || !poList || poList.length === 0) return null;
    const target = safeStr(selectedPoId).toLowerCase();
    return (
      poList.find((po) => {
        const pId = safeStr(po.id || (po as any)._id).toLowerCase();
        const pNum = safeStr(po.poNumber).toLowerCase();
        return (pId && pId === target) || (pNum && pNum === target);
      }) || null
    );
  }, [poList, selectedPoId]);

  const finalLogoUrl = logoUrl || selectedPO?.companyLogoUrl || defaultHeliflowLogo;

  // Pre-select PO if poId is in URL query params or auto-select first PO
  useEffect(() => {
    if (!poList || poList.length === 0) return;

    if (poIdParam) {
      const targetParam = safeStr(poIdParam).toLowerCase();
      const match = poList.find((p) => {
        const pId = safeStr(p.id || (p as any)._id).toLowerCase();
        const pNum = safeStr(p.poNumber).toLowerCase();
        return (pId && pId === targetParam) || (pNum && pNum === targetParam);
      });
      if (match) {
        setSelectedPoId(safeStr(match.id || (match as any)._id || match.poNumber));
      } else if (poList.length > 0) {
        setSelectedPoId(safeStr(poList[0].id || (poList[0] as any)._id || poList[0].poNumber));
      }
    } else if (!selectedPoId && poList.length > 0) {
      setSelectedPoId(safeStr(poList[0].id || (poList[0] as any)._id || poList[0].poNumber));
    }
  }, [poIdParam, poList]);

  // Update line items when PO selection changes
  useEffect(() => {
    if (selectedPO && selectedPO.items && selectedPO.items.length > 0) {
      setLineItems(
        selectedPO.items.map((item: any, idx: number) => ({
          id: `item_${idx}_${Date.now()}`,
          itemName: safeStr(item.itemName || item.name || 'Line Item'),
          orderedQty: Number(item.quantity || 1),
          receivedQty: Number(item.quantity || 1), // Default delivered qty = ordered qty
          unitPrice: Number(item.unitPrice || 0),
          unit: safeStr(item.unit || 'Units'),
          remarks: '',
        }))
      );
    } else if (selectedPO) {
      // Fallback line item if PO items array is empty
      setLineItems([
        {
          id: `item_0_${Date.now()}`,
          itemName: `Items for PO #${safeStr(selectedPO.poNumber)}`,
          orderedQty: 1,
          receivedQty: 1,
          unitPrice: Number(selectedPO.totalAmount || 0),
          unit: 'Units',
          remarks: '',
        },
      ]);
    } else {
      setLineItems([]);
    }
  }, [selectedPO]);

  // Update Line Item Delivered Qty / Remarks
  const handleUpdateItem = (id: string, field: keyof LineItemState, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  // Calculations: Total PO Value vs Total Dispatch Note Value
  const calculations = useMemo(() => {
    let totalPoValue = 0;
    let totalGrnValue = 0;

    lineItems.forEach((item) => {
      const ordQty = typeof item.orderedQty === 'number' ? item.orderedQty : 0;
      const recQty = typeof item.receivedQty === 'number' ? item.receivedQty : 0;
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;

      totalPoValue += ordQty * price;
      totalGrnValue += recQty * price;
    });

    return { totalPoValue, totalGrnValue };
  }, [lineItems]);

  // Form Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (!selectedPoId) {
      setErrorMsg('Please select a Purchase Order (PO Number).');
      return false;
    }
    if (lineItems.length === 0) {
      setErrorMsg('No items found for the selected Purchase Order.');
      return false;
    }
    return true;
  };

  // Direct Submission (NO WORKFLOW REQUIRED)
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payloadItems: GRNItemPayload[] = lineItems.map((item) => ({
        itemName: item.itemName,
        orderedQty: item.orderedQty,
        receivedQty: typeof item.receivedQty === 'number' ? item.receivedQty : 0,
        acceptedQty: typeof item.receivedQty === 'number' ? item.receivedQty : 0,
        unit: item.unit,
        remarks: item.remarks,
      }));

      await grnService.create({
        poId: selectedPoId,
        receivedDate,
        notes,
        items: payloadItems,
      });

      setSuccessMsg(`Dispatch Note #${grnNumber} generated & sent successfully!`);
      setTimeout(() => navigate('/procurement/grns'), 1500);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to create Dispatch Note.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cpo-page">
      {/* Notifications */}
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

      {/* Header */}
      <div className="cpo-header">
        <div className="cpo-header__left">
          <button className="cpo-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="cpo-header__title-wrap">
            <h1>Create Dispatch Note</h1>
            <p>Record & dispatch physical goods against an approved Purchase Order (Direct Send to Buyer)</p>
          </div>
        </div>
        <div className="cpo-header__actions">
          <button
            type="button"
            className="cpo-btn cpo-btn--outline"
            onClick={() => window.print()}
          >
            <Printer size={16} /> Print Document
          </button>
          <button
            className="cpo-btn cpo-btn--primary"
            onClick={handleSubmit}
            disabled={submitting || poLoading || !canCreateGRN}
            style={!canCreateGRN ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
            title={!canCreateGRN ? "Admin has not allowed this action. You do not have permission to send dispatch notes." : undefined}
          >
            <Send size={16} /> {submitting ? 'Sending Dispatch Note…' : 'Send Dispatch Note'}
          </button>
        </div>
      </div>

      {/* Form Content */}
      <div className="cpo-body">
        {/* Section 01: Call PO & Dispatch Note Header */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">01</span>
            <span className="cpo-section__title">Select Purchase Order & Details</span>
            <span className="cpo-section__hint">Auto-fetches item list & ordered quantities</span>
          </div>

          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field cpo-field--span-2">
              <label>PO NUMBER / PURCHASE ORDER *</label>
              <select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
                disabled={poLoading}
              >
                <option value="">-- Call PO Number (Select Approved PO) --</option>
                {poList.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} — {po.vendor?.name || 'Vendor'} ({formatAmount(po.totalAmount, currency)})
                  </option>
                ))}
              </select>
              <span className="cpo-field__sub">Selecting a PO auto-populates all line items below</span>
            </div>

            <div className="cpo-field">
              <label>DISPATCH NOTE NUMBER (AUTO)</label>
              <input type="text" value={grnNumber} readOnly className="cpo-input--readonly" />
              <span className="cpo-field__sub">Auto-generated Dispatch Note reference</span>
            </div>

            <div className="cpo-field">
              <label>DELIVERY / RECEIVED DATE *</label>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
              <span className="cpo-field__sub">Physical goods arrival date</span>
            </div>
          </div>

          {selectedPO && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', gap: 24, fontSize: 13, flexWrap: 'wrap' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Supplier Name: </span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedPO.vendor?.name || 'Telematics'}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>PO Total Amount: </span>
                <span style={{ fontWeight: 700, color: 'var(--primary-500)' }}>{formatAmount(selectedPO.totalAmount, currency)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Status: </span>
                <span style={{ fontWeight: 700, color: 'var(--success-500)' }}>{selectedPO.status}</span>
              </div>
            </div>
          )}
        </div>

        {/* Section 02: Item Listing & Delivered Quantities */}
        <div className="cpo-section">
          <div className="cpo-section__header cpo-section__header--flex">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="cpo-section__num">02</span>
              <span className="cpo-section__title">Goods Delivery Line Items</span>
            </div>
            <span className="cpo-optional-pill">Auto-populated from PO</span>
          </div>

          <div className="cpo-table-wrap">
            <table className="cpo-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ width: '260px' }}>Item Name</th>
                  <th style={{ width: '120px' }}>Ordered Qty</th>
                  <th style={{ width: '140px' }}>Delivered Qty *</th>
                  <th style={{ width: '130px' }}>Price ({currency})</th>
                  <th style={{ width: '150px', textAlign: 'right' }}>Dispatch Value ({currency})</th>
                  <th style={{ width: '180px' }}>Inspection Remarks</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      Please select a Purchase Order above to view line items.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item, index) => {
                    const recQty = typeof item.receivedQty === 'number' ? item.receivedQty : 0;
                    const price = item.unitPrice || 0;
                    const lineGrnValue = recQty * price;

                    return (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 600 }}>{index + 1}</td>
                        <td style={{ fontWeight: 600 }}>{item.itemName}</td>
                        <td>
                          <span style={{ display: 'inline-block', padding: '4px 10px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontWeight: 700 }}>
                            {item.orderedQty} {item.unit}
                          </span>
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="cpo-table__input"
                            style={{ fontWeight: 700, color: 'var(--primary-500)' }}
                            value={item.receivedQty}
                            onChange={(e) =>
                              handleUpdateItem(
                                item.id,
                                'receivedQty',
                                e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0)
                              )
                            }
                          />
                        </td>
                        <td>{formatAmount(price, currency)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 14 }}>
                          {formatAmount(lineGrnValue, currency)}
                        </td>
                        <td>
                          <input
                            type="text"
                            className="cpo-table__input cpo-table__input--sub"
                            placeholder="e.g. Good condition"
                            value={item.remarks}
                            onChange={(e) => handleUpdateItem(item.id, 'remarks', e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 03: Remarks & Attachments */}
        <div className="cpo-grid cpo-grid--split">
          {/* Notes & Attachments */}
          <div className="cpo-section">
            <div className="cpo-section__header">
              <span className="cpo-section__num">03</span>
              <span className="cpo-section__title">Remarks & Attachments</span>
            </div>
            <div className="cpo-grid cpo-grid--1" style={{ gap: 16 }}>
              <div className="cpo-field">
                <label>INTERNAL RECEIVING REMARKS</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add storekeeper receiving notes, waybill numbers, or damage inspection observations..."
                />
              </div>

              <div className="cpo-field">
                <label>ATTACH DELIVERY CHALLAN / RECEIPT PDF</label>
                <label style={{ padding: '36px 20px', background: 'var(--surface-elevated)', border: '2px dashed rgba(10, 110, 209, 0.4)', borderRadius: 10, textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s ease' }}>
                  <Upload size={28} style={{ color: 'var(--primary-500)' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.4px' }}>CLICK TO UPLOAD DELIVERY CHALLAN / WAYBILL PDF</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Drag and drop your delivery challan or waybill PDF here, or click to browse files</div>
                  <input type="file" multiple accept=".pdf,.png,.jpg" onChange={handleFileUpload} hidden />
                </label>
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {attachments.map((att) => (
                      <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Paperclip size={14} style={{ color: 'var(--primary-500)' }} />
                          <span style={{ fontWeight: 600 }}>{att.name}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({att.size})</span>
                        </div>
                        <button type="button" onClick={() => handleRemoveAttachment(att.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-500)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Value Comparison Card */}
          <div className="cpo-section cpo-totals-card">
            <div className="cpo-section__header">
              <span className="cpo-section__num">04</span>
              <span className="cpo-section__title">Value Comparison</span>
            </div>

            <div className="cpo-totals">
              <div className="cpo-field" style={{ marginBottom: 12 }}>
                <label>CURRENCY</label>
                <CurrencySelector value={currency} onChange={setCurrency} />
              </div>

              <div className="cpo-totals__row">
                <span>Total PO Value</span>
                <span style={{ fontWeight: 700 }}>{formatAmount(calculations.totalPoValue, currency)}</span>
              </div>

              <div className="cpo-totals__row">
                <span>Total Dispatch Note Value</span>
                <span style={{ fontWeight: 700, color: 'var(--primary-500)' }}>{formatAmount(calculations.totalGrnValue, currency)}</span>
              </div>
            </div>

            <div className="cpo-action-panel">
              <button
                className="cpo-btn cpo-btn--primary cpo-btn--full"
                onClick={handleSubmit}
                disabled={submitting || poLoading || !canCreateGRN}
                style={!canCreateGRN ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreateGRN ? "Admin has not allowed this action. You do not have permission to send dispatch notes." : undefined}
              >
                <Send size={16} /> {submitting ? 'Sending Dispatch Note…' : 'Send Dispatch Note'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Official A4 Digital GRN Document (Visible ONLY during window.print()) */}
      <div className="grn-print-document po-document">
        {/* ── Header ── */}
        <div className="po-doc__header">
          <div className="po-doc__header-left">
            <img src={finalLogoUrl} alt={companyName || 'Procnex'} className="po-doc__logo" />
            <div className="po-doc__company-info">
              <h1 className="po-doc__company-name">
                {companyName && !companyName.includes('Procnex') ? companyName : 'Procnex'}
              </h1>
              <p className="po-doc__company-detail">
                {selectedPO?.companyAddress || selectedPO?.shipToAddress || '232,Sahukara Bareilly 232'}
              </p>
              <p className="po-doc__company-detail">
                Phone: {companyPhone || selectedPO?.companyPhone || '+918272811866'} &nbsp;|&nbsp; Email: {companyEmail || selectedPO?.companyEmail || 'nischalagarwal674@gmail.com'}
              </p>
              <p className="po-doc__company-detail">
                {selectedPO?.companyWebsite || 'www.heliflow.com'}
              </p>
            </div>
          </div>
          <div className="po-doc__header-right">
            <div className="po-doc__title-block">
              <span className="po-doc__title-label" style={{ color: '#059669' }}>DISPATCH NOTE</span>
              <span className="po-doc__title-po-num">{grnNumber}</span>
            </div>
            <table className="po-doc__meta-table">
              <tbody>
                <tr>
                  <td className="po-doc__meta-label">Dispatch Date</td>
                  <td className="po-doc__meta-value">{receivedDate}</td>
                </tr>
                <tr>
                  <td className="po-doc__meta-label">PO Number</td>
                  <td className="po-doc__meta-value">{selectedPO?.poNumber || '—'}</td>
                </tr>
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
            <p className="po-doc__party-name">{selectedPO?.vendor?.name || selectedPO?.vendorName || 'Embedded'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.vendor?.contactPerson || selectedPO?.vendorContactPerson || 'Nischal Agarwal'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.vendor?.address || selectedPO?.vendorAddress || '232,Sahukara Bareilly 232'}</p>
            <p className="po-doc__party-detail">Phone: {selectedPO?.vendor?.phone || selectedPO?.vendorPhone || '+918272811866'}</p>
            <p className="po-doc__party-detail">Email: {selectedPO?.vendor?.email || selectedPO?.vendorEmail || 'nischalagarwal674@gmail.com'}</p>
            <p className="po-doc__party-detail">GST/VAT: {selectedPO?.vendor?.gstVat || selectedPO?.vendorGstVat || 'VAT60707070706'}</p>
          </div>
          <div className="po-doc__party-box">
            <h3 className="po-doc__party-heading">SHIP TO</h3>
            <p className="po-doc__party-name">{companyName && !companyName.includes('Procnex') ? companyName : 'Procnex'}</p>
            <p className="po-doc__party-detail">Warehouse: {selectedPO?.shipToWarehouse || 'Central Warehouse'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.shipToAddress || '232,Sahukara Bareilly 232'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.shipToContact || 'Nischal Agarwal'}</p>
            <p className="po-doc__party-detail">Phone: {companyPhone || selectedPO?.shipToPhone || '+918272811866'}</p>
          </div>
        </div>

        {/* ── Info Grid ── */}
        <div className="po-doc__info-grid">
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Requisitioner</span>
            <span className="po-doc__info-value">{selectedPO?.requisitioner || 'Procurement Officer'}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Ship Via</span>
            <span className="po-doc__info-value">{selectedPO?.shipVia || 'Surface'}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">FOB</span>
            <span className="po-doc__info-value">{selectedPO?.fob || 'Destination'}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Payment Terms</span>
            <span className="po-doc__info-value">{selectedPO?.paymentTerms || 'Net 30'}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Delivery Date</span>
            <span className="po-doc__info-value">{receivedDate}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Shipping Terms</span>
            <span className="po-doc__info-value">{selectedPO?.shippingTerms || 'FOB Destination'}</span>
          </div>
        </div>

        {/* ── Items Table ── */}
        <div className="po-doc__table-wrap">
          <table className="po-doc__items-table">
            <colgroup>
              <col style={{ width: '5%' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
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
              {lineItems.map((item, index) => {
                const recQty = typeof item.receivedQty === 'number' ? item.receivedQty : 0;
                const price = item.unitPrice || 0;
                const lineGrnValue = recQty * price;

                return (
                  <tr key={item.id}>
                    <td className="po-doc__td--no">{index + 1}</td>
                    <td className="po-doc__td--desc">{item.itemName}</td>
                    <td className="po-doc__td--qty">{recQty}</td>
                    <td className="po-doc__td--unit">{item.unit || 'pcs'}</td>
                    <td className="po-doc__td--price">{formatAmount(price, currency)}</td>
                    <td className="po-doc__td--tax">16%</td>
                    <td className="po-doc__td--disc">—</td>
                    <td className="po-doc__td--total">{formatAmount(lineGrnValue, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Totals ── */}
        <div className="po-doc__totals">
          <div className="po-doc__totals-table">
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Subtotal</span>
              <span className="po-doc__total-value">{formatAmount(calculations.totalGrnValue, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Discount</span>
              <span className="po-doc__total-value">{formatAmount(0, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Tax</span>
              <span className="po-doc__total-value">{formatAmount(calculations.totalGrnValue * 0.16, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Shipping Charges</span>
              <span className="po-doc__total-value">{formatAmount(0, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Other Charges</span>
              <span className="po-doc__total-value">{formatAmount(0, currency)}</span>
            </div>
            <div className="po-doc__total-divider" />
            <div className="po-doc__total-row po-doc__total-row--grand">
              <span className="po-doc__total-label po-doc__total-label--grand">Grand Total</span>
              <span className="po-doc__total-value po-doc__total-value--grand">{formatAmount(calculations.totalGrnValue * 1.16, currency)}</span>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="po-doc__divider" />
        <div className="po-doc__notes">
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Internal Receiving Remarks</h4>
            <p className="po-doc__notes-text">{notes || 'Goods inspected and received in good physical condition as per purchase order specifications.'}</p>
          </div>
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Special Instructions / Inspection</h4>
            <p className="po-doc__notes-text">Storekeeper received and verified quantity matching delivery note.</p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="po-doc__footer">
          <div className="po-doc__footer-divider" />
          <p className="po-doc__footer-text">
            {companyName}
            {companyPhone && <span> &nbsp;|&nbsp; Phone: {companyPhone}</span>}
            {companyEmail && <span> &nbsp;|&nbsp; Email: {companyEmail}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
