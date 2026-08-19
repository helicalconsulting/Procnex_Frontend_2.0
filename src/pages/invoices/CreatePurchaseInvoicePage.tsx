import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { vendorService } from '../../services/vendorService';
import { companySettingsService } from '../../services/companySettingsService';
import {
  ArrowLeft,
  Receipt,
  Plus,
  Trash2,
  Save,
  Send,
  Upload,
  Calendar,
  Building2,
  ShoppingCart,
  FileText,
  Paperclip,
  X,
  CreditCard,
  Tag
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import '../purchase-orders/CreatePurchaseOrderPage.css';
import './CreatePurchaseInvoicePage.css';

interface LineItem {
  id: number;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number | '';
  unitPrice: number | '';
  taxPercent: number;
}

interface VendorOption {
  id: string;
  name: string;
  email: string;
  category: string;
}

export default function CreatePurchaseInvoicePage() {
  const navigate = useNavigate();
  const { companyDefaultCurrency, formatAmount } = useCurrency();

  // Load vendors list
  const { data: vendorsList } = useServiceData(
    () =>
      vendorService.list().then((rows) =>
        rows.map((v) => ({
          id: v.id,
          name: v.name,
          email: v.email,
          category: v.category,
        }))
      ),
    [] as VendorOption[],
    [],
    { cacheTtlMs: 60000 }
  );

  // Load departments from settings
  const { data: departments } = useServiceData(
    () => companySettingsService.listDepartments().then((deps) => deps.map((d) => d.name)),
    [] as string[],
    [],
    { cacheTtlMs: 120000 }
  );

  // Form State
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [poNumber, setPoNumber] = useState<string>('');
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [vendorName, setVendorName] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paymentTerms, setPaymentTerms] = useState<string>('Net 30');
  const [department, setDepartment] = useState<string>('');
  const [currency, setCurrency] = useState<string>(companyDefaultCurrency);
  const [dispatchRef, setDispatchRef] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: 1, itemCode: 'ITM-001', itemName: '', description: '', quantity: 1, unitPrice: '', taxPercent: 18 },
  ]);

  // Attachments state
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: string }[]>([]);

  // UI state
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Handle vendor selection change
  const handleVendorSelect = (vId: string) => {
    setSelectedVendorId(vId);
    const found = vendorsList.find((v) => v.id === vId);
    if (found) {
      setVendorName(found.name);
    }
  };

  // Add Line Item
  const handleAddLineItem = useCallback(() => {
    setLineItems((prev) => [
      ...prev,
      {
        id: Date.now(),
        itemCode: `ITM-00${prev.length + 1}`,
        itemName: '',
        description: '',
        quantity: 1,
        unitPrice: '',
        taxPercent: 18,
      },
    ]);
  }, []);

  // Remove Line Item
  const handleRemoveLineItem = useCallback((id: number) => {
    setLineItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  }, []);

  // Update Line Item
  const handleUpdateLineItem = useCallback((id: number, field: keyof LineItem, value: any) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }, []);

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalTax = 0;

    lineItems.forEach((item) => {
      const qty = typeof item.quantity === 'number' ? item.quantity : 0;
      const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
      const lineSubtotal = qty * price;
      const lineTax = lineSubtotal * ((item.taxPercent || 0) / 100);

      subtotal += lineSubtotal;
      totalTax += lineTax;
    });

    const grandTotal = subtotal + totalTax;
    return { subtotal, totalTax, grandTotal };
  }, [lineItems]);

  // Attach File Mock
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

  // Validation
  const validateForm = (): boolean => {
    setErrorMsg(null);
    if (!invoiceNumber.trim()) {
      setErrorMsg('Invoice Number is required.');
      return false;
    }
    if (!vendorName.trim() && !selectedVendorId) {
      setErrorMsg('Please select or specify a Vendor.');
      return false;
    }
    const validItems = lineItems.filter(
      (item) => item.itemName.trim() && typeof item.quantity === 'number' && item.quantity > 0
    );
    if (validItems.length === 0) {
      setErrorMsg('Please add at least one line item with a valid item name and quantity.');
      return false;
    }
    return true;
  };

  // Actions
  const handleSaveDraft = async () => {
    if (!validateForm()) return;
    setSavingDraft(true);
    setErrorMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setSuccessMsg(`Invoice #${invoiceNumber} saved as draft successfully.`);
      setTimeout(() => navigate('/accounts-payable'), 1500);
    } catch {
      setErrorMsg('Failed to save draft invoice.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 800));
      setSuccessMsg(`Purchase Invoice #${invoiceNumber} submitted for approval successfully!`);
      setTimeout(() => navigate('/accounts-payable'), 1500);
    } catch {
      setErrorMsg('Failed to submit purchase invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cpo-page">
      {/* Message Notifications */}
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

      {/* Top Header matching New PO design */}
      <div className="cpo-header">
        <div className="cpo-header__left">
          <button className="cpo-back-btn" onClick={() => navigate('/accounts-payable')}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="cpo-header__title-wrap">
            <h1>Create Purchase Invoice</h1>
            <p>Generate a new vendor purchase invoice for approval & 3-way matching</p>
          </div>
        </div>
        <div className="cpo-header__actions">
          <button
            className="cpo-btn cpo-btn--outline"
            onClick={handleSaveDraft}
            disabled={savingDraft || submitting}
          >
            <Save size={15} /> {savingDraft ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            className="cpo-btn cpo-btn--primary"
            onClick={handleSubmit}
            disabled={savingDraft || submitting}
          >
            <Send size={15} /> {submitting ? 'Submitting…' : 'Submit Invoice'}
          </button>
        </div>
      </div>

      {/* Form Content matching New PO Sections */}
      <div className="cpo-body">
        {/* ── Section 01: Identification ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">01</span>
            <span className="cpo-section__title">Identification</span>
            <span className="cpo-section__hint">Invoice & PO references</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>INVOICE NUMBER *</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-2026-0042"
              />
              <span className="cpo-field__sub">Vendor invoice reference</span>
            </div>
            <div className="cpo-field">
              <label>PO REFERENCE</label>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. PO-2026-0012"
              />
              <span className="cpo-field__sub">Linked Purchase Order number</span>
            </div>
            <div className="cpo-field">
              <label>INVOICE DATE *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
              <span className="cpo-field__sub">Date on vendor invoice</span>
            </div>
            <div className="cpo-field">
              <label>DUE DATE *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <span className="cpo-field__sub">Payment due date</span>
            </div>
          </div>
        </div>

        {/* ── Section 02: Supplier & Department Information ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">02</span>
            <span className="cpo-section__title">Supplier & Department Details</span>
            <span className="cpo-section__hint">Vendor database & cost center</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field cpo-field--span-2">
              <label>SELECT VENDOR *</label>
              <select
                value={selectedVendorId}
                onChange={(e) => handleVendorSelect(e.target.value)}
              >
                <option value="">Select Vendor from Database Master...</option>
                {vendorsList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category})
                  </option>
                ))}
              </select>
              <span className="cpo-field__sub">Vendor account for payment release</span>
            </div>
            <div className="cpo-field">
              <label>DEPARTMENT</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                <option value="">Select Department...</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
                {!departments.includes('Procurement') && <option value="Procurement">Procurement</option>}
                {!departments.includes('Operations') && <option value="Operations">Operations</option>}
                {!departments.includes('Finance') && <option value="Finance">Finance</option>}
                {!departments.includes('IT & Telecom') && <option value="IT & Telecom">IT & Telecom</option>}
              </select>
              <span className="cpo-field__sub">Allocated cost center</span>
            </div>
            <div className="cpo-field">
              <label>PAYMENT TERMS</label>
              <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                <option value="Immediate">Immediate</option>
                <option value="Net 15">Net 15</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
                <option value="50% Advance">50% Advance</option>
              </select>
              <span className="cpo-field__sub">Standard credit terms</span>
            </div>
          </div>
        </div>

        {/* ── Section 03: Invoice Line Items ── */}
        <div className="cpo-section">
          <div className="cpo-section__header cpo-section__header--flex">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="cpo-section__num">03</span>
              <span className="cpo-section__title">Invoice Line Items</span>
            </div>
            <button className="cpo-btn cpo-btn--outline cpo-btn--sm" onClick={handleAddLineItem}>
              <Plus size={14} /> Add Line Item
            </button>
          </div>
          <div className="cpo-table-wrap">
            <table className="cpo-table">
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>Item Code</th>
                  <th style={{ width: '240px' }}>Item Name / Description *</th>
                  <th style={{ width: '100px' }}>Qty *</th>
                  <th style={{ width: '140px' }}>Unit Price ({currency})</th>
                  <th style={{ width: '100px' }}>Tax %</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Total ({currency})</th>
                  <th style={{ width: '48px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item) => {
                  const qty = typeof item.quantity === 'number' ? item.quantity : 0;
                  const price = typeof item.unitPrice === 'number' ? item.unitPrice : 0;
                  const lineTotal = qty * price * (1 + (item.taxPercent || 0) / 100);

                  return (
                    <tr key={item.id}>
                      <td>
                        <input
                          type="text"
                          className="cpo-table__input"
                          placeholder="Code"
                          value={item.itemCode}
                          onChange={(e) => handleUpdateLineItem(item.id, 'itemCode', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="cpo-table__input"
                          placeholder="Item description..."
                          value={item.itemName}
                          onChange={(e) => handleUpdateLineItem(item.id, 'itemName', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="cpo-table__input"
                          placeholder="1"
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateLineItem(
                              item.id,
                              'quantity',
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
                          placeholder="18"
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
                          title="Delete Line"
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

        {/* ── Section 04: Commercial Terms & Totals (Split Grid Layout) ── */}
        <div className="cpo-grid cpo-grid--split">
          {/* Terms & Remarks */}
          <div className="cpo-section">
            <div className="cpo-section__header">
              <span className="cpo-section__num">04</span>
              <span className="cpo-section__title">Remarks & Attachments</span>
            </div>
            <div className="cpo-grid cpo-grid--1" style={{ gap: 16 }}>
              <div className="cpo-field">
                <label>DISPATCH / GRN REFERENCE NUMBER</label>
                <input
                  type="text"
                  value={dispatchRef}
                  onChange={(e) => setDispatchRef(e.target.value)}
                  placeholder="e.g. GRN-2026-8819 or Waybill #4912"
                />
                <span className="cpo-field__sub">Goods receipt or delivery note reference</span>
              </div>
              <div className="cpo-field">
                <label>INTERNAL NOTES & REMARKS</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes for finance approvers or payment processing..."
                />
              </div>

              {/* File Upload Dropzone */}
              <div className="cpo-field">
                <label>ATTACH INVOICE DOCUMENTS</label>
                <label className="cpi-upload-dropzone" style={{ padding: '16px', background: 'var(--surface-elevated)', border: '1px dashed var(--border)', borderRadius: 8, textAlign: 'center', cursor: 'pointer', display: 'block' }}>
                  <Upload size={20} style={{ color: 'var(--primary-500)', marginBottom: 4 }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Click to upload vendor bill PDF or receipt proof</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Supports PDF, PNG, JPG (Max 10MB)</div>
                  <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} hidden />
                </label>

                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    {attachments.map((att) => (
                      <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Paperclip size={13} style={{ color: 'var(--primary-500)' }} />
                          <span style={{ fontWeight: 600 }}>{att.name}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>({att.size})</span>
                        </div>
                        <button type="button" onClick={() => handleRemoveAttachment(att.id)} style={{ background: 'none', border: 'none', color: 'var(--danger-500)', cursor: 'pointer' }}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Totals Summary Panel */}
          <div className="cpo-section cpo-totals-card">
            <div className="cpo-section__header">
              <span className="cpo-section__num">05</span>
              <span className="cpo-section__title">Payment Summary</span>
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
                <span>Total Tax (GST / VAT)</span>
                <span>{formatAmount(calculations.totalTax, currency)}</span>
              </div>

              <div className="cpo-totals__divider" />

              <div className="cpo-totals__grand">
                <span>Grand Total</span>
                <span style={{ color: 'var(--primary-500)' }}>{formatAmount(calculations.grandTotal, currency)}</span>
              </div>
            </div>

            <div className="cpo-action-panel">
              <button
                className="cpo-btn cpo-btn--primary cpo-btn--full"
                onClick={handleSubmit}
                disabled={savingDraft || submitting}
              >
                <Send size={16} /> {submitting ? 'Submitting…' : 'Submit Purchase Invoice'}
              </button>
              <button
                className="cpo-btn cpo-btn--secondary cpo-btn--full"
                onClick={handleSaveDraft}
                disabled={savingDraft || submitting}
              >
                <Save size={16} /> {savingDraft ? 'Saving…' : 'Save Invoice Draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
