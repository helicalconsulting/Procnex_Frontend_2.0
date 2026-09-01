import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorPortalService } from '../../services/vendorPortalService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { grnService, type GoodsReceivedNote } from '../../services/grnService';
import { companySettingsService } from '../../services/companySettingsService';
import {
  ArrowLeft,
  Receipt,
  Plus,
  Trash2,
  Send,
  Upload,
  Paperclip,
  X,
  Building2,
  ShoppingCart,
  FileText,
  Save,
  CheckCircle2,
  Printer
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import ActionSuccessModal, { type ActionSuccessModalData } from '../../components/shared/ActionSuccessModal';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import '../../components/purchase-orders/PurchaseOrderDocument.css';
import '../../styles/vendor-portal.css';

interface LineItem {
  id: number | string;
  itemCode: string;
  itemName: string;
  description: string;
  poQty: number;
  grnQty: number;
  invoicedQty: number | '';
  unitPrice: number | '';
  taxPercent: number;
}

export default function VendorCreateInvoicePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const poIdParam = searchParams.get('poId');
  const grnIdParam = searchParams.get('grnId');

  const { user } = useAuth();
  const { companyDefaultCurrency, formatAmount } = useCurrency();
  const { companyName, companyPhone, companyEmail, logoUrl } = useBranding();

  // Load Vendor's assigned Purchase Orders
  const { data: poData, loading: poLoading } = useServiceData(
    () => purchaseOrderService.list({ limit: 100 }),
    { orders: [], total: 0 },
    []
  );
  const poList = poData.orders || [];

  // Form State - initialize state directly from URL query parameters if present
  const [selectedPoId, setSelectedPoId] = useState<string>(() => poIdParam || '');
  const [selectedGrnId, setSelectedGrnId] = useState<string>(() => grnIdParam || '');
  const [grnOptions, setGrnOptions] = useState<GoodsReceivedNote[]>([]);

  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    () => `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentTerms, setPaymentTerms] = useState<string>('Net 30');
  const [currency, setCurrency] = useState<string>(companyDefaultCurrency);
  const [buyerName, setBuyerName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: 1, itemCode: 'ITM-001', itemName: '', description: '', poQty: 0, grnQty: 0, invoicedQty: 1, unitPrice: '', taxPercent: 18 },
  ]);

  // Attachments state
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

  // UI State
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [actionSuccessModalData, setActionSuccessModalData] = useState<ActionSuccessModalData | null>(null);

  // Selected PO details
  const selectedPO = useMemo(() => {
    return poList.find(
      (po) => String(po.id) === String(selectedPoId) || String(po.poNumber) === String(selectedPoId)
    );
  }, [poList, selectedPoId]);

  const finalLogoUrl = logoUrl || selectedPO?.companyLogoUrl || defaultHeliflowLogo;

  // Human-readable PO Number formatter (never display raw 24-hex Mongo ID)
  const displayPoNumber = useMemo(() => {
    if (selectedPO?.poNumber) return selectedPO.poNumber;
    const matchInList = poList.find(
      (p) => String(p.id) === String(selectedPoId) || String(p.poNumber) === String(selectedPoId)
    );
    if (matchInList?.poNumber) return matchInList.poNumber;

    const matchInGrn = grnOptions.find(
      (g) =>
        String(g.poId) === String(selectedPoId) ||
        String(g.purchaseOrder?.id) === String(selectedPoId) ||
        String(g.purchaseOrder?.poNumber) === String(selectedPoId)
    );
    if (matchInGrn?.purchaseOrder?.poNumber) return matchInGrn.purchaseOrder.poNumber;

    if (poIdParam && poIdParam.startsWith('PO-')) return poIdParam;
    if (selectedPoId && selectedPoId.startsWith('PO-')) return selectedPoId;

    if (selectedPoId && /^[0-9a-fA-F]{24}$/.test(selectedPoId)) {
      return `PO-${selectedPoId.slice(-6).toUpperCase()}`;
    }

    return selectedPoId || 'Select Purchase Order';
  }, [selectedPO, poList, selectedPoId, grnOptions, poIdParam]);

  // Human-readable GRN Number formatter (never display raw 24-hex Mongo ID)
  const displayGrnNumber = useMemo(() => {
    const matchInGrn = grnOptions.find(
      (g) => String(g.id) === String(selectedGrnId) || String(g.grnNumber) === String(selectedGrnId)
    );
    if (matchInGrn?.grnNumber) return matchInGrn.grnNumber;

    if (grnIdParam && grnIdParam.startsWith('GRN-')) return grnIdParam;
    if (selectedGrnId && selectedGrnId.startsWith('GRN-')) return selectedGrnId;

    if (selectedGrnId && /^[0-9a-fA-F]{24}$/.test(selectedGrnId)) {
      return `GRN-${selectedGrnId.slice(-6).toUpperCase()}`;
    }

    return selectedGrnId || 'Direct PO Billing / Select GRN';
  }, [grnOptions, selectedGrnId, grnIdParam]);

  // Sync PO query parameter when poList loads
  useEffect(() => {
    if (poIdParam) {
      const match = poList.find(
        (p) => String(p.id) === String(poIdParam) || String(p.poNumber) === String(poIdParam)
      );
      if (match) {
        setSelectedPoId(String(match.id));
      } else {
        setSelectedPoId(poIdParam);
      }
    } else if (!selectedPoId && poList.length > 0) {
      setSelectedPoId(String(poList[0].id));
    }
  }, [poIdParam, poList]);

  // Pre-select GRN when grnOptions finish loading
  useEffect(() => {
    const targetGrn = grnIdParam || selectedGrnId;
    if (targetGrn && grnOptions.length > 0) {
      const matchGrn = grnOptions.find(
        (g) => String(g.id) === String(targetGrn) || String(g.grnNumber) === String(targetGrn)
      );
      if (matchGrn) {
        setSelectedGrnId(String(matchGrn.id));
      } else {
        setSelectedGrnId(targetGrn);
      }
    }
  }, [grnIdParam, grnOptions]);

  // Fetch GRNs and update line items when PO selection or parameters change
  useEffect(() => {
    const targetPoId = selectedPO?.id || selectedPoId || poIdParam;
    const targetPoNum = selectedPO?.poNumber || selectedPoId || poIdParam;

    if (!targetPoId && !targetPoNum) return;

    if (selectedPO?.items && selectedPO.items.length > 0) {
      setLineItems(
        selectedPO.items.map((item: any, idx: number) => ({
          id: `item_${idx}_${Date.now()}`,
          itemCode: item.itemCode || `ITM-00${idx + 1}`,
          itemName: item.itemName || item.name || 'Line Item',
          description: item.description || '',
          poQty: Number(item.quantity || 1),
          grnQty: Number(item.quantity || 1),
          invoicedQty: Number(item.quantity || 1),
          unitPrice: Number(item.unitPrice || 0),
          taxPercent: 18,
        }))
      );
    }

    const queryKey = String(targetPoId || targetPoNum);
    grnService
      .getByPO(queryKey)
      .then((grns) => {
        if (grns && grns.length > 0) {
          setGrnOptions(grns);
        } else {
          grnService.list({ limit: 100 }).then((res) => {
            const list = res.grns || [];
            const matched = list.filter(
              (g) =>
                String(g.poId) === String(targetPoId) ||
                String(g.poId) === String(targetPoNum) ||
                String(g.purchaseOrder?.id) === String(targetPoId) ||
                String(g.purchaseOrder?.poNumber) === String(targetPoNum)
            );
            setGrnOptions(matched.length > 0 ? matched : list);
          });
        }
      })
      .catch(() => {
        grnService.list({ limit: 100 }).then((res) => setGrnOptions(res.grns || [])).catch(() => setGrnOptions([]));
      });
  }, [selectedPO, selectedPoId, poIdParam]);

  // Update line items when GRN selection changes
  useEffect(() => {
    if (selectedGrnId && grnOptions.length > 0) {
      const foundGRN = grnOptions.find(
        (g) => String(g.id) === String(selectedGrnId) || String(g.grnNumber) === String(selectedGrnId)
      );

      if (foundGRN && foundGRN.items && foundGRN.items.length > 0) {
        const updatedLineItems = foundGRN.items.map((gi: any, idx: number) => {
          const poMatch =
            selectedPO?.items?.[idx] ||
            selectedPO?.items?.find((pi: any) => (pi.itemName || pi.name) === gi.itemName);
          const poQty = Number(gi.orderedQty || poMatch?.quantity || 1);
          const grnQty = Number(gi.receivedQty ?? gi.acceptedQty ?? 1);
          const unitPrice = Number(poMatch?.unitPrice || gi.unitPrice || 0);

          return {
            id: gi.id || `grn_item_${idx}_${Date.now()}`,
            itemCode: gi.itemCode || poMatch?.itemCode || `ITM-00${idx + 1}`,
            itemName: gi.itemName || poMatch?.itemName || poMatch?.name || 'Line Item',
            description: gi.remarks || poMatch?.description || '',
            poQty: poQty,
            grnQty: grnQty,
            invoicedQty: grnQty,
            unitPrice: unitPrice,
            taxPercent: 18,
          };
        });

        setLineItems(updatedLineItems);
      }
    }
  }, [selectedGrnId, grnOptions, selectedPO]);

  // Populate Buyer/Client Name ONLY if explicitly set on PO; otherwise keep completely blank (no auto text)
  useEffect(() => {
    if (selectedPO) {
      const explicitBuyer =
        (selectedPO as any).buyerName ||
        (selectedPO as any).clientName ||
        (selectedPO as any).companyName ||
        (selectedPO as any).buyerCompany ||
        (selectedPO as any).buyer?.name;

      if (explicitBuyer && String(explicitBuyer).toUpperCase() !== 'VENDOR') {
        setBuyerName(String(explicitBuyer));
        return;
      }
    }
    setBuyerName('');
  }, [selectedPO]);

  // Update Line Item Values
  const handleUpdateLineItem = useCallback((id: number | string, field: keyof LineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, []);

  const handleAddLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        itemCode: `ITM-00${prev.length + 1}`,
        itemName: '',
        description: '',
        poQty: 0,
        grnQty: 0,
        invoicedQty: 1,
        unitPrice: '',
        taxPercent: 18,
      },
    ]);
  }, []);

  const handleRemoveLineItem = useCallback((id: number | string) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  // Handle File Uploads
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

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    lineItems.forEach((item) => {
      const qty = typeof item.invoicedQty === 'number' ? item.invoicedQty : 0;
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      const lineSubtotal = qty * price;
      const lineTax = lineSubtotal * ((item.taxPercent || 0) / 100);

      subtotal += lineSubtotal;
      totalTax += lineTax;
    });

    const grandTotal = subtotal + totalTax;
    return { subtotal, totalTax, grandTotal };
  }, [lineItems]);

  // Form Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (!invoiceNumber.trim()) {
      setErrorMsg('Invoice Number is required.');
      return false;
    }
    if (!selectedPoId) {
      setErrorMsg('Please select a Purchase Order.');
      return false;
    }
    return true;
  };

  // Submit Invoice to Buyer
  const handleSubmitInvoice = async (isDraft: boolean) => {
    if (!validateForm()) return;

    if (isDraft) setSavingDraft(true);
    else setSubmitting(true);

    setErrorMsg(null);

    try {
      const payload = {
        invoiceNumber,
        poId: selectedPoId,
        grnId: selectedGrnId ? selectedGrnId.replace(/^grn_/, '').replace(/^inv_/, '') : null,
        vendorId: user?.id || selectedPO?.vendorId || selectedPO?.vendor?.id,
        buyerName,
        invoiceDate,
        dueDate,
        paymentTerms,
        currency,
        amount: calculations.grandTotal,
        notes,
        isDraft,
      };

      const { apiRequest } = await import('../../api/client');
      await apiRequest('/invoices/manual', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (isDraft) {
        setSuccessMsg(`Draft invoice #${invoiceNumber} saved successfully.`);
        setTimeout(() => navigate('/procurement/grns'), 1500);
      } else {
        setActionSuccessModalData({
          actionType: 'sent',
          module: 'Purchase Invoice',
          referenceNumber: invoiceNumber,
          title: `Tax Invoice Sent to Buyer`,
          actionTitle: `Purchase Invoice Sent`,
          badgeText: `SENT`,
          message: `Tax Invoice #${invoiceNumber} has been sent to Buyer successfully! Buyer notification & approval workflow initiated.`,
          details: [
            { label: 'PO Reference', value: displayPoNumber },
            { label: 'GRN Reference', value: displayGrnNumber },
            { label: 'Total Value', value: formatAmount(calculations.grandTotal, currency) },
            ...(buyerName ? [{ label: 'Buyer Name', value: buyerName }] : []),
          ],
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to send Invoice to Buyer.');
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  };

  return (
    <div className="cpo-page vendor-portal">
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
            <h1>Submit Invoice to Buyer 🧾</h1>
            <p>Create & dispatch your tax invoice directly to the buyer for PO #{selectedPO?.poNumber || 'Order'}</p>
          </div>
        </div>
        <div className="cpo-header__actions">
          <button
            type="button"
            className="cpo-btn cpo-btn--outline"
            onClick={() => window.print()}
          >
            <Printer size={15} /> Print Document
          </button>
          <button
            className="cpo-btn cpo-btn--outline"
            onClick={() => handleSubmitInvoice(true)}
            disabled={savingDraft || submitting}
          >
            <Save size={15} /> {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            className="cpo-btn cpo-btn--primary"
            onClick={() => handleSubmitInvoice(false)}
            disabled={savingDraft || submitting}
          >
            <Send size={15} /> {submitting ? 'Sending Invoice…' : 'Send Invoice to Buyer'}
          </button>
        </div>
      </div>

      {/* Form Body */}
      <div className="cpo-body">
        {/* Section 01: Order & Invoice Details */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">01</span>
            <span className="cpo-section__title">Purchase Order & Invoice Details</span>
            <span className="cpo-section__hint">Auto-loaded from confirmed Purchase Order</span>
          </div>

          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field cpo-field--span-2">
              <label>SELECT PURCHASE ORDER *</label>
              <select
                value={selectedPoId}
                onChange={(e) => {
                  setSelectedPoId(e.target.value);
                  setSelectedGrnId('');
                }}
                disabled={poLoading}
              >
                <option value="">-- Select Purchase Order --</option>
                {poList.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.poNumber} — ({formatAmount(po.totalAmount, currency)})
                  </option>
                ))}
                {selectedPoId && !poList.some((po) => String(po.id) === String(selectedPoId)) && (
                  <option value={selectedPoId}>
                    {displayPoNumber}
                  </option>
                )}
              </select>
            </div>

            <div className="cpo-field">
              <label>LINKED GRN / DISPATCH NOTE</label>
              <select
                value={selectedGrnId}
                onChange={(e) => setSelectedGrnId(e.target.value)}
                disabled={!selectedPoId}
              >
                <option value="">-- Direct PO Billing / Select GRN --</option>
                {grnOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.grnNumber} (Received: {new Date(g.receivedDate).toLocaleDateString()})
                  </option>
                ))}
                {selectedGrnId && !grnOptions.some((g) => String(g.id) === String(selectedGrnId)) && (
                  <option value={selectedGrnId}>
                    {displayGrnNumber}
                  </option>
                )}
              </select>
            </div>

            <div className="cpo-field">
              <label>BUYER / CLIENT NAME</label>
              <input
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Enter Buyer / Client Name"
              />
            </div>
          </div>

          <div className="cpo-grid cpo-grid--4" style={{ marginTop: 16 }}>
            <div className="cpo-field">
              <label>VENDOR INVOICE NUMBER *</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-9005"
              />
            </div>

            <div className="cpo-field">
              <label>INVOICE DATE *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="cpo-field">
              <label>DUE DATE *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="cpo-field">
              <label>PAYMENT TERMS</label>
              <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
              </select>
            </div>
          </div>
        </div>

        {/* Section 02: Line Items & Invoiced Quantities */}
        <div className="cpo-section">
          <div className="cpo-section__header cpo-section__header--flex">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="cpo-section__num">02</span>
              <span className="cpo-section__title">Line Items & Invoiced Quantities</span>
            </div>
            <button className="cpo-btn cpo-btn--outline cpo-btn--sm" onClick={handleAddLineItem}>
              <Plus size={14} /> Add Line Item
            </button>
          </div>

          <div className="cpo-table-wrap">
            <table className="cpo-table">
              <thead>
                <tr>
                  <th style={{ width: '220px' }}>Item Name / Description *</th>
                  <th style={{ width: '100px', background: 'rgba(10, 110, 209, 0.08)' }}>PO Qty</th>
                  <th style={{ width: '100px', background: 'rgba(16, 185, 129, 0.08)' }}>GRN Qty</th>
                  <th style={{ width: '120px', background: 'rgba(234, 179, 8, 0.12)' }}>Invoiced Qty *</th>
                  <th style={{ width: '130px' }}>Unit Price ({currency})</th>
                  <th style={{ width: '80px' }}>Tax %</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Total ({currency})</th>
                  <th style={{ width: '44px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => {
                  const qty = typeof item.invoicedQty === 'number' ? item.invoicedQty : 0;
                  const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                  const lineTotal = qty * price * (1 + (item.taxPercent || 0) / 100);

                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          className="cpo-table__input"
                          placeholder="Item description..."
                          value={item.itemName}
                          onChange={(e) => handleUpdateLineItem(item.id, 'itemName', e.target.value)}
                        />
                      </td>
                      <td style={{ background: 'rgba(10, 110, 209, 0.03)' }}>
                        <span style={{ display: 'inline-block', padding: '6px 12px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontWeight: 700, color: 'var(--primary-500)' }}>
                          {item.poQty}
                        </span>
                      </td>
                      <td style={{ background: 'rgba(16, 185, 129, 0.03)' }}>
                        <span style={{ display: 'inline-block', padding: '6px 12px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontWeight: 700, color: '#10b981' }}>
                          {item.grnQty}
                        </span>
                      </td>
                      <td style={{ background: 'rgba(234, 179, 8, 0.04)' }}>
                        <input
                          type="number"
                          min="1"
                          className="cpo-table__input"
                          style={{ fontWeight: 800, borderColor: '#eab308' }}
                          value={item.invoicedQty}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'invoicedQty',
                              e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1)
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="cpo-table__input"
                          placeholder="0.00"
                          value={item.unitPrice}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'unitPrice',
                              e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0)
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="cpo-table__input"
                          value={item.taxPercent}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'taxPercent',
                              Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                            )
                          }
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, paddingTop: 14 }}>
                        {formatAmount(lineTotal, currency)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="cpo-trash-btn"
                          onClick={() => handleRemoveLineItem(item.id)}
                          disabled={lineItems.length <= 1}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 03 & Section 04 */}
        <div className="cpo-grid cpo-grid--split">
          {/* Remarks & Physical Invoice Attachment */}
          <div className="cpo-section">
            <div className="cpo-section__header">
              <span className="cpo-section__num">03</span>
              <span className="cpo-section__title">Remarks & Physical Invoice PDF</span>
            </div>
            <div className="cpo-grid cpo-grid--1" style={{ gap: 16 }}>
              <div className="cpo-field">
                <label>INVOICE NOTES / REMARKS FOR BUYER</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add delivery notes, tax calculation comments, or payment details for buyer..."
                />
              </div>

              <div className="cpo-field">
                <label>ATTACH VENDOR TAX INVOICE PDF</label>
                <label style={{ padding: '36px 20px', background: 'var(--surface-elevated)', border: '2px dashed rgba(10, 110, 209, 0.4)', borderRadius: 10, textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s ease' }}>
                  <Upload size={28} style={{ color: 'var(--primary-500)' }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.4px' }}>CLICK TO UPLOAD PHYSICAL VENDOR BILL PDF</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Drag and drop your signed tax invoice PDF here, or click to browse files</div>
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

          {/* Totals Summary */}
          <div className="cpo-section cpo-totals-card">
            <div className="cpo-section__header">
              <span className="cpo-section__num">04</span>
              <span className="cpo-section__title">Invoice Value Summary</span>
            </div>

            <div className="cpo-totals">
              <div className="cpo-field" style={{ marginBottom: 12 }}>
                <label>CURRENCY</label>
                <CurrencySelector value={currency} onChange={setCurrency} />
              </div>

              <div className="cpo-totals__row">
                <span>Subtotal</span>
                <span>{formatAmount(calculations.subtotal, currency)}</span>
              </div>
              <div className="cpo-totals__row">
                <span>Total Tax</span>
                <span>{formatAmount(calculations.totalTax, currency)}</span>
              </div>

              <div className="cpo-totals__divider" />

              <div className="cpo-totals__grand">
                <span>Final Value</span>
                <span style={{ color: 'var(--primary-500)' }}>{formatAmount(calculations.grandTotal, currency)}</span>
              </div>
            </div>

            <div className="cpo-action-panel">
              <button
                className="cpo-btn cpo-btn--primary cpo-btn--full"
                onClick={() => handleSubmitInvoice(false)}
                disabled={savingDraft || submitting}
              >
                <Send size={16} /> {submitting ? 'Sending Invoice…' : 'Send Invoice to Buyer'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ActionSuccessModal
        data={actionSuccessModalData}
        onClose={() => {
          setActionSuccessModalData(null);
          navigate('/procurement/grns');
        }}
      />

      {/* Official A4 Digital TAX INVOICE Document (Visible ONLY during window.print()) */}
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
              <span className="po-doc__title-label" style={{ color: '#0a2342' }}>TAX INVOICE</span>
              <span className="po-doc__title-po-num">{invoiceNumber}</span>
            </div>
            <table className="po-doc__meta-table">
              <tbody>
                <tr>
                  <td className="po-doc__meta-label">Invoice Date</td>
                  <td className="po-doc__meta-value">{invoiceDate}</td>
                </tr>
                <tr>
                  <td className="po-doc__meta-label">Due Date</td>
                  <td className="po-doc__meta-value">{dueDate}</td>
                </tr>
                <tr>
                  <td className="po-doc__meta-label">PO Number</td>
                  <td className="po-doc__meta-value">{displayPoNumber}</td>
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
            <h3 className="po-doc__party-heading">VENDOR / SUPPLIER</h3>
            <p className="po-doc__party-name">{user?.fullName || selectedPO?.vendor?.name || selectedPO?.vendorName || 'Embedded'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.vendor?.contactPerson || selectedPO?.vendorContactPerson || user?.fullName || 'Nischal Agarwal'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.vendor?.address || selectedPO?.vendorAddress || '232,Sahukara Bareilly 232'}</p>
            <p className="po-doc__party-detail">Phone: {selectedPO?.vendor?.phone || selectedPO?.vendorPhone || '+918272811866'}</p>
            <p className="po-doc__party-detail">Email: {user?.email || selectedPO?.vendor?.email || selectedPO?.vendorEmail || 'nischalagarwal674@gmail.com'}</p>
            <p className="po-doc__party-detail">GST/VAT: {selectedPO?.vendor?.gstVat || selectedPO?.vendorGstVat || 'VAT60707070706'}</p>
          </div>
          <div className="po-doc__party-box">
            <h3 className="po-doc__party-heading">BILL TO (BUYER / CLIENT)</h3>
            <p className="po-doc__party-name">{buyerName || companyName || 'Procnex'}</p>
            <p className="po-doc__party-detail">Warehouse: {selectedPO?.shipToWarehouse || 'Central Warehouse'}</p>
            <p className="po-doc__party-detail">Address: {selectedPO?.shipToAddress || '232,Sahukara Bareilly 232'}</p>
            <p className="po-doc__party-detail">Contact: {selectedPO?.shipToContact || 'Nischal Agarwal'}</p>
            <p className="po-doc__party-detail">Phone: {companyPhone || selectedPO?.shipToPhone || '+918272811866'}</p>
          </div>
        </div>

        {/* ── Info Grid ── */}
        <div className="po-doc__info-grid">
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">PO Reference</span>
            <span className="po-doc__info-value">{displayPoNumber}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Linked GRN</span>
            <span className="po-doc__info-value">{displayGrnNumber}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Payment Terms</span>
            <span className="po-doc__info-value">{paymentTerms}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Invoice Date</span>
            <span className="po-doc__info-value">{invoiceDate}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Due Date</span>
            <span className="po-doc__info-value">{dueDate}</span>
          </div>
          <div className="po-doc__info-item">
            <span className="po-doc__info-label">Status</span>
            <span className="po-doc__info-value">SUBMITTED</span>
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
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th className="po-doc__th--no">#</th>
                <th className="po-doc__th--desc">Description</th>
                <th className="po-doc__th--qty">PO Qty</th>
                <th className="po-doc__th--qty">Inv Qty</th>
                <th className="po-doc__th--price">Unit Price</th>
                <th className="po-doc__th--tax">Tax %</th>
                <th className="po-doc__th--disc">Disc %</th>
                <th className="po-doc__th--total">Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item, index) => {
                const invQty = typeof item.invoicedQty === 'number' ? item.invoicedQty : 0;
                const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                const lineTotal = invQty * price * (1 + (item.taxPercent || 0) / 100);

                return (
                  <tr key={item.id}>
                    <td className="po-doc__td--no">{index + 1}</td>
                    <td className="po-doc__td--desc">{item.itemName || item.description || 'Line Item'}</td>
                    <td className="po-doc__td--qty">{item.poQty}</td>
                    <td className="po-doc__td--qty">{invQty}</td>
                    <td className="po-doc__td--price">{formatAmount(price, currency)}</td>
                    <td className="po-doc__td--tax">{item.taxPercent}%</td>
                    <td className="po-doc__td--disc">—</td>
                    <td className="po-doc__td--total">{formatAmount(lineTotal, currency)}</td>
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
              <span className="po-doc__total-value">{formatAmount(calculations.subtotal, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Discount</span>
              <span className="po-doc__total-value">{formatAmount(0, currency)}</span>
            </div>
            <div className="po-doc__total-row">
              <span className="po-doc__total-label">Tax Total</span>
              <span className="po-doc__total-value">{formatAmount(calculations.totalTax, currency)}</span>
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
              <span className="po-doc__total-value po-doc__total-value--grand">{formatAmount(calculations.grandTotal, currency)}</span>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div className="po-doc__divider" />
        <div className="po-doc__notes">
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Invoice Notes / Remarks</h4>
            <p className="po-doc__notes-text">{notes || 'Tax invoice dispatched to buyer for payment processing.'}</p>
          </div>
          <div className="po-doc__notes-col">
            <h4 className="po-doc__notes-heading">Payment Instructions</h4>
            <p className="po-doc__notes-text">Please remit payment as per agreed payment terms ({paymentTerms}).</p>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="po-doc__footer">
          <div className="po-doc__footer-divider" />
          <p className="po-doc__footer-text">
            {buyerName || companyName}
            {companyPhone && <span> &nbsp;|&nbsp; Phone: {companyPhone}</span>}
            {companyEmail && <span> &nbsp;|&nbsp; Email: {companyEmail}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
