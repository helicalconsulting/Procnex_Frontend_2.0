import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, ArrowLeft, Plus, Trash2, Download, Save, Send,
  Building2, FileText, Calendar, IndianRupee, Tag, UserCheck, ShieldCheck,
  CheckCircle2, AlertCircle, Clock
} from 'lucide-react';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { purchaseRequisitionService } from '../../services/purchaseRequisitionService';
import { apiRequest } from '../../api/client';
import { downloadPurchaseOrderAsPdf } from '../../utils/pdfDownload';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { MessageStrip } from '../../components/shared/MessageStrip';
import './CreatePurchaseOrderPage.css';

interface VendorOption {
  id: string;
  name: string;
  email: string;
  phone?: string;
  contactPerson?: string;
  category?: string;
  address?: string;
  gstNumber?: string;
  panNumber?: string;
}

interface POItem {
  id: string;
  itemCode: string;
  itemName: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxPercent: number;
}

export default function CreatePurchaseOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const isReadOnly = searchParams.get('mode') === 'view';
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { companyName: brandingCompanyName, companyPhone: brandingPhone, companyEmail: brandingEmail } = useBranding();

  // ── Form State ──
  const [poNumber, setPoNumber] = useState(`PO-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`);
  const [revisionNo] = useState('0');
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string>('Draft');

  // Supplier Info
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [supplierType, setSupplierType] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierTaxId, setSupplierTaxId] = useState('');
  const [supplierRating, setSupplierRating] = useState('A - Preferred');
  const [contactPerson, setContactPerson] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // ── Fetch Categories dynamically from Company Settings DB ──
  useEffect(() => {
    apiRequest<{ categories?: Array<{ id: string; name: string }>; data?: Array<{ id: string; name: string }> }>('/company-settings/categories')
      .then((res) => {
        const list = res.categories || res.data || [];
        const names = list.map((c) => c.name).filter(Boolean);
        setCategoriesList(names);
        if (names.length > 0) {
          setSupplierType(names[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Source References
  const [prNo, setPrNo] = useState('');
  const [contractNo, setContractNo] = useState('');
  const [rfqNo, setRfqNo] = useState('');
  const [tenderNo, setTenderNo] = useState('');
  const [supplierQuotationNo, setSupplierQuotationNo] = useState('');
  const [quotationDate, setQuotationDate] = useState('');
  const [blanketOrderNo, setBlanketOrderNo] = useState('');
  const [frameworkAgreement, setFrameworkAgreement] = useState('');

  // Items Grid
  const [items, setItems] = useState<POItem[]>([
    { id: '1', itemCode: 'ITEM-001', itemName: '', description: '', quantity: 1, unit: 'pcs', unitPrice: 0, taxPercent: 18 },
  ]);

  // Commercial Terms
  const [currency, setCurrency] = useState(companyDefaultCurrency || 'KES');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [deliveryDate, setDeliveryDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [shippingTerms, setShippingTerms] = useState('FOB Destination');
  const [shippingCharges, setShippingCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [internalNotes, setInternalNotes] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Actions state
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Fetch Vendors dynamically from DB Master ──
  useEffect(() => {
    setLoadingVendors(true);
    apiRequest<{ vendors?: VendorOption[]; data?: VendorOption[] }>('/vendors')
      .then((res) => {
        const list = res.vendors || res.data || [];
        setVendors(list);
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, []);

  // ── Filter Vendors by Selected Category ──
  const filteredVendors = useMemo(() => {
    if (!supplierType) return vendors;
    const matches = vendors.filter((v) => {
      const cat = (v as any).category || (v as any).categoryName || (v as any).supplierType || '';
      if (!cat) return false;
      return cat.toLowerCase().trim() === supplierType.toLowerCase().trim();
    });
    return matches;
  }, [vendors, supplierType]);

  // ── Auto-select first vendor when category changes ──
  useEffect(() => {
    if (editId) return; // Don't override vendor if editing existing PO
    if (filteredVendors.length > 0) {
      const alreadyIncluded = filteredVendors.some((v) => v.id === selectedVendorId);
      if (!alreadyIncluded) {
        const v = filteredVendors[0];
        setSelectedVendorId(v.id);
        setSupplierCode(`SUP-${v.id.slice(-5).toUpperCase()}`);
        setSupplierName(v.name);
        setSupplierAddress(v.address || '');
        setSupplierTaxId(v.gstNumber || v.panNumber || '');
        setContactPerson(v.contactPerson || '');
        setContactEmail(v.email || '');
        setContactPhone(v.phone || '');
      }
    } else {
      setSelectedVendorId('');
      setSupplierCode('');
      setSupplierName('');
      setSupplierAddress('');
      setSupplierTaxId('');
      setContactPerson('');
      setContactEmail('');
      setContactPhone('');
    }
  }, [filteredVendors, editId]);

  // ── Load Existing PO Data if editId is provided in URL ──
  useEffect(() => {
    if (!editId) return;
    const loadExisting = async () => {
      try {
        let existing = await purchaseRequisitionService.getById(editId);
        if (!existing) {
          existing = await purchaseRequisitionService.getByRfqId(editId);
        }
        if (existing) {
          if (existing.status) {
            const rawStatus = String(existing.status).toUpperCase();
            if (rawStatus === 'APPROVED' || rawStatus === 'PO_ISSUED' || rawStatus === 'COMPLETED' || rawStatus === 'SENT_TO_VENDOR') {
              setStatus('Approved');
            } else if (rawStatus === 'PENDING_APPROVAL' || rawStatus === 'PENDING') {
              setStatus('Pending Approval');
            } else if (rawStatus === 'RETURNED') {
              setStatus('Returned');
            } else if (rawStatus === 'REJECTED') {
              setStatus('Rejected');
            } else {
              setStatus('Draft');
            }
          }
          if ((existing as any).supplierType) setSupplierType((existing as any).supplierType);
          if ((existing as any).supplierCode) setSupplierCode((existing as any).supplierCode);
          if ((existing as any).selectedVendorId || (existing as any).vendorId) {
            setSelectedVendorId((existing as any).selectedVendorId || (existing as any).vendorId);
          }
          if (existing.vendorName) setSupplierName(existing.vendorName);
          if (existing.vendorAddress) setSupplierAddress(existing.vendorAddress);
          if (existing.vendorContactPerson) setContactPerson(existing.vendorContactPerson);
          if (existing.vendorPhone) setContactPhone(existing.vendorPhone);
          if (existing.vendorEmail) setContactEmail(existing.vendorEmail);
          if (existing.vendorGstVat) setSupplierTaxId(existing.vendorGstVat);
          if (existing.currency) setCurrency(existing.currency);
          if (existing.paymentTerms) setPaymentTerms(existing.paymentTerms);
          if (existing.deliveryDate) setDeliveryDate(existing.deliveryDate);
          if (existing.shippingTerms) setShippingTerms(existing.shippingTerms);
          if (existing.shippingCharges !== undefined) setShippingCharges(existing.shippingCharges);
          if (existing.otherCharges !== undefined) setOtherCharges(existing.otherCharges);
          if (existing.internalNotes) setInternalNotes(existing.internalNotes);
          if (existing.specialInstructions) setSpecialInstructions(existing.specialInstructions);
          if (existing.rfqId) setRfqNo(existing.rfqId);
          if (existing.items && existing.items.length > 0) {
            setItems(existing.items.map((item: any, idx: number) => {
              const parts = (item.description || '').split(' - ');
              return {
                id: String(idx + 1),
                itemCode: `ITEM-00${idx + 1}`,
                itemName: parts[0] || item.description || '',
                description: parts.length > 1 ? parts.slice(1).join(' - ') : '',
                quantity: item.quantity || 1,
                unit: item.unit || 'pcs',
                unitPrice: item.unitPrice || 0,
                taxPercent: item.taxPercent || 0,
              };
            }));
          }
        }
      } catch (err) {
        console.error('Failed to load existing PO:', err);
      }
    };
    loadExisting();
  }, [editId]);

  // ── Sync Vendor and Category when Vendors load or Edit mode ──
  useEffect(() => {
    if (vendors.length === 0) return;
    if (selectedVendorId) {
      const matchedVendor = vendors.find((v) => v.id === selectedVendorId);
      if (matchedVendor) {
        const cat = (matchedVendor as any).category || (matchedVendor as any).categoryName || (matchedVendor as any).supplierType || '';
        if (!supplierType && cat) setSupplierType(cat);
        if (!supplierCode) setSupplierCode(`SUP-${matchedVendor.id.slice(-5).toUpperCase()}`);
      }
    } else if (supplierName) {
      const matchedVendor = vendors.find(
        (v) => v.name.toLowerCase().trim() === supplierName.toLowerCase().trim() || (contactEmail && v.email === contactEmail)
      );
      if (matchedVendor) {
        setSelectedVendorId(matchedVendor.id);
        const cat = (matchedVendor as any).category || (matchedVendor as any).categoryName || (matchedVendor as any).supplierType || '';
        if (!supplierType && cat) setSupplierType(cat);
        if (!supplierCode) setSupplierCode(`SUP-${matchedVendor.id.slice(-5).toUpperCase()}`);
      }
    }
  }, [vendors, selectedVendorId, supplierName, contactEmail, supplierType, supplierCode]);

  // ── Vendor Select Handler ──
  const handleVendorSelect = (id: string) => {
    setSelectedVendorId(id);
    const v = vendors.find((vendor) => vendor.id === id);
    if (v) {
      setSupplierCode(`SUP-${v.id.slice(-5).toUpperCase()}`);
      setSupplierName(v.name);
      setSupplierAddress(v.address || 'Standard Registered Address');
      setSupplierTaxId(v.gstNumber || v.panNumber || 'GB123456789');
      setContactPerson(v.contactPerson || 'Account Manager');
      setContactEmail(v.email);
      setContactPhone(v.phone || '+1 000 000 0000');
    }
  };

  // ── Items Handlers ──
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        itemCode: `ITEM-00${prev.length + 1}`,
        itemName: '',
        description: '',
        quantity: 1,
        unit: 'pcs',
        unitPrice: 0,
        taxPercent: 18,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof POItem, value: any) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  // ── Financial Calculations ──
  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0),
    [items]
  );

  const taxTotal = useMemo(
    () => items.reduce((acc, i) => {
      const lineSub = (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
      return acc + (lineSub * (Number(i.taxPercent) || 0)) / 100;
    }, 0),
    [items]
  );

  const grandTotal = useMemo(
    () => subtotal + taxTotal + (Number(shippingCharges) || 0) + (Number(otherCharges) || 0),
    [subtotal, taxTotal, shippingCharges, otherCharges]
  );

  // ── Submit / Save Draft Handler ──
  const handleSubmit = async (targetStatus: 'Draft' | 'Pending Approval') => {
    if (!supplierName.trim()) {
      setMsg({ text: 'Please select or enter Supplier Name.', type: 'error' });
      return;
    }
    if (items.some((i) => !i.itemName.trim())) {
      setMsg({ text: 'Please fill in Item Name for all row items.', type: 'error' });
      return;
    }

    setSubmitting(true);
    setMsg(null);

    const statusPayload = targetStatus === 'Pending Approval' ? 'PENDING_APPROVAL' : 'DRAFT';

    const prPayload: any = {
      ...(editId ? { id: editId } : {}),
      rfqId: rfqNo || editId || `rfq-direct-${Date.now()}`,
      poNumber: poNumber,
      status: statusPayload,
      companyName: brandingCompanyName || 'Heliflow Consulting',
      companyAddress: supplierAddress || 'Industrial Zone, Building 4',
      companyPhone: brandingPhone || '+91 800-HELIFLOW',
      companyEmail: brandingEmail || 'procurement@heliflow.com',
      companyWebsite: 'www.heliflow.com',
      supplierType: supplierType,
      supplierCode: supplierCode,
      selectedVendorId: selectedVendorId,
      vendorId: selectedVendorId,
      vendorName: supplierName,
      vendorAddress: supplierAddress,
      vendorContactPerson: contactPerson,
      vendorPhone: contactPhone,
      vendorEmail: contactEmail,
      vendorGstVat: supplierTaxId,
      shipToCompany: 'Heliflow Warehouse',
      shipToWarehouse: 'Central Warehouse',
      shipToAddress: supplierAddress || 'Central Depot',
      shipToContact: contactPerson || 'Warehouse Manager',
      shipToPhone: contactPhone || '+91 800-HELIFLOW',
      poDate: poDate,
      currency: currency,
      requisitioner: 'Procurement Officer',
      shipVia: 'Surface',
      fob: 'Destination',
      paymentTerms: paymentTerms,
      deliveryDate: deliveryDate,
      shippingTerms: shippingTerms,
      items: items.map((i, idx) => ({
        itemNo: idx + 1,
        description: `${i.itemName}${i.description ? ` - ${i.description}` : ''}`,
        quantity: Number(i.quantity) || 1,
        unit: i.unit || 'pcs',
        unitPrice: Number(i.unitPrice) || 0,
        taxPercent: Number(i.taxPercent) || 0,
        discount: 0,
        total: (Number(i.quantity) || 1) * (Number(i.unitPrice) || 0),
      })),
      shippingCharges: Number(shippingCharges) || 0,
      otherCharges: Number(otherCharges) || 0,
      internalNotes: internalNotes,
      specialInstructions: specialInstructions,
      subtotal: subtotal,
      taxTotal: taxTotal,
      discountTotal: 0,
      grandTotal: grandTotal,
    };

    const standalonePayload = {
      vendorId: selectedVendorId || 'v1',
      totalAmount: grandTotal,
      notes: internalNotes,
      paymentTerms,
      deliveryDate,
      status: statusPayload,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        itemName: i.itemName,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        taxPercent: i.taxPercent,
        totalPrice: i.quantity * i.unitPrice * (1 + i.taxPercent / 100),
      })),
      sourceReferences: {
        prNo,
        contractNo,
        rfqNo,
        tenderNo,
        supplierQuotationNo,
        quotationDate,
        blanketOrderNo,
        frameworkAgreement,
      },
    };

    try {
      // Save PR requisition record
      await purchaseRequisitionService.save(prPayload);

      // Only initiate approval workflow if submitting for approval!
      if (targetStatus === 'Pending Approval') {
        await purchaseOrderService.createStandalonePO(standalonePayload).catch(() => {});
      }

      setMsg({
        text: targetStatus === 'Draft'
          ? `Purchase Order ${poNumber} saved successfully as Draft!`
          : `Purchase Order ${poNumber} submitted successfully for approval!`,
        type: 'success',
      });
      setTimeout(() => {
        navigate('/procurement/purchase-requisitions');
      }, 1500);
    } catch (err) {
      setMsg({
        text: err instanceof Error ? err.message : 'Failed to save Purchase Order',
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Download PDF Handler ──
  const handleDownloadPdf = () => {
    const poData = {
      poNumber,
      orderDate: poDate,
      companyName: 'Heliflow Procurement',
      companyAddress: 'Industrial Zone, Building 4',
      companyPhone: '+91 800-HELIFLOW',
      companyEmail: 'procurement@heliflow.com',
      companyWebsite: 'www.heliflow.com',
      vendorName: supplierName || 'Supplier',
      vendorContactPerson: contactPerson,
      vendorAddress: supplierAddress,
      vendorPhone: contactPhone,
      vendorEmail: contactEmail,
      vendorGstVat: supplierTaxId,
      shipToCompany: 'Heliflow Warehouse',
      shipToAddress: supplierAddress || 'Central Depot',
      requisitioner: 'Procurement Officer',
      paymentTerms,
      expectedDelivery: deliveryDate,
      items: items.map((i) => ({
        name: i.itemName,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        taxPercent: i.taxPercent,
        total: i.quantity * i.unitPrice,
      })),
      subtotal,
      taxTotal,
      shippingCharges,
      otherCharges,
      grandTotal,
      internalNotes,
      specialInstructions,
    };

    downloadPurchaseOrderAsPdf(poData, formatAmount, currency);
  };

  return (
    <div className="cpo-page">
      {msg && (
        <MessageStrip type={msg.type} onClose={() => setMsg(null)}>
          {msg.text}
        </MessageStrip>
      )}

      {/* Top Header */}
      <div className="cpo-header">
        <div className="cpo-header__left">
          <button className="cpo-back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="cpo-header__title-wrap">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h1>{editId ? `Purchase Order #${poNumber}` : 'Create Standalone Purchase Order'}</h1>
              {status === 'Approved' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(16, 126, 62, 0.15)', color: '#107e3e', border: '1px solid rgba(16, 126, 62, 0.3)', borderRadius: 16, fontSize: 12, fontWeight: 700, marginLeft: 10 }}>
                  <CheckCircle2 size={13} /> Approved
                </span>
              )}
              {status === 'Pending Approval' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(217, 119, 6, 0.15)', color: '#d97706', border: '1px solid rgba(217, 119, 6, 0.3)', borderRadius: 16, fontSize: 12, fontWeight: 700, marginLeft: 10 }}>
                  Pending Approval
                </span>
              )}
            </div>
            <p>Generate individual PO, link vendor master, and submit for approval</p>
          </div>
        </div>
        <div className="cpo-header__actions">
          <button className="cpo-btn cpo-btn--secondary" onClick={handleDownloadPdf}>
            <Download size={15} /> Download PDF
          </button>
          <button
            className="cpo-btn cpo-btn--outline"
            onClick={() => handleSubmit('Draft')}
            disabled={submitting}
          >
            <Save size={15} /> Save Draft
          </button>
          <button
            className="cpo-btn cpo-btn--primary"
            onClick={() => handleSubmit('Pending Approval')}
            disabled={submitting}
          >
            <Send size={15} /> {submitting ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </div>

      {/* Form Content */}
      <div className="cpo-body">
        {/* ── Section 01: Identification ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">01</span>
            <span className="cpo-section__title">Identification</span>
            <span className="cpo-section__hint">System-generated references</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>PURCHASE ORDER NO.</label>
              <input type="text" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
              <span className="cpo-field__sub">Auto-generated unique PO number</span>
            </div>
            <div className="cpo-field">
              <label>REVISION NO.</label>
              <input type="text" value={revisionNo} readOnly className="cpo-input--readonly" />
              <span className="cpo-field__sub">PO revision / version</span>
            </div>
            <div className="cpo-field">
              <label>PO DATE</label>
              <input type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} />
              <span className="cpo-field__sub">Date of issue</span>
            </div>
            <div className="cpo-field">
              <label>STATUS</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Draft">Draft</option>
                <option value="Pending Approval">Pending Approval</option>
                <option value="Approved">Approved</option>
                <option value="Returned">Returned</option>
                <option value="Rejected">Rejected</option>
              </select>
              <span className="cpo-field__sub">Workflow status</span>
            </div>
          </div>
        </div>

        {/* ── Section 02: Supplier Information ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">02</span>
            <span className="cpo-section__title">Supplier Information</span>
            <span className="cpo-section__hint">Vendor Master Database</span>
          </div>

          <div className="cpo-vendor-picker-banner" style={{
            background: 'linear-gradient(135deg, rgba(10, 110, 209, 0.12), rgba(16, 185, 129, 0.12))',
            border: '1px solid rgba(10, 110, 209, 0.3)',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <Building2 size={24} style={{ color: 'var(--primary-500, #0a6ed1)', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.6px',
                textTransform: 'uppercase',
                color: 'var(--primary-500, #0a6ed1)',
                marginBottom: '6px'
              }}>
                SELECT VENDOR FROM DATABASE MASTER *
              </label>
              <select
                value={selectedVendorId}
                onChange={(e) => handleVendorSelect(e.target.value)}
                disabled={loadingVendors}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'var(--surface-card, #ffffff)',
                  border: '2px solid var(--primary-500, #0a6ed1)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: '0 4px 12px rgba(10, 110, 209, 0.15)'
                }}
              >
                <option value="">
                  {filteredVendors.length > 0
                    ? '-- Select Vendor from Database Master --'
                    : supplierType
                    ? `-- No vendors found for category "${supplierType}" --`
                    : '-- Click here to select Vendor --'}
                </option>
                {filteredVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.email ? `(${v.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="cpo-field" style={{ minWidth: '220px' }}>
              <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>SUPPLIER TYPE (CATEGORY)</label>
              <select value={supplierType} onChange={(e) => setSupplierType(e.target.value)} style={{ padding: '10px 14px', borderRadius: '8px' }}>
                {categoriesList.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>SUPPLIER CODE</label>
              <input type="text" value={supplierCode} onChange={(e) => setSupplierCode(e.target.value)} placeholder="SUP-00000" />
              <span className="cpo-field__sub">Unique vendor master ID</span>
            </div>
            <div className="cpo-field cpo-field--span-2">
              <label>SUPPLIER NAME *</label>
              <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Acme Industrial Supplies Ltd." />
              <span className="cpo-field__sub">Registered vendor name</span>
            </div>
            <div className="cpo-field">
              <label>SUPPLIER RATING</label>
              <select value={supplierRating} onChange={(e) => setSupplierRating(e.target.value)}>
                <option value="A - Preferred">A - Preferred</option>
                <option value="B - Approved">B - Approved</option>
                <option value="C - Conditional">C - Conditional</option>
              </select>
            </div>
          </div>

          <div className="cpo-grid cpo-grid--4" style={{ marginTop: 12 }}>
            <div className="cpo-field cpo-field--span-2">
              <label>SUPPLIER ADDRESS</label>
              <input type="text" value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)} placeholder="Street, City, Country" />
            </div>
            <div className="cpo-field cpo-field--span-2">
              <label>SUPPLIER TAX ID / VAT NO.</label>
              <input type="text" value={supplierTaxId} onChange={(e) => setSupplierTaxId(e.target.value)} placeholder="e.g. GB123456789 / GSTIN" />
            </div>
          </div>

          <div className="cpo-grid cpo-grid--3" style={{ marginTop: 12 }}>
            <div className="cpo-field">
              <label>CONTACT PERSON</label>
              <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Full name" />
            </div>
            <div className="cpo-field">
              <label>CONTACT EMAIL</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="name@supplier.com" />
            </div>
            <div className="cpo-field">
              <label>CONTACT PHONE</label>
              <input type="text" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1 000 000 0000" />
            </div>
          </div>
        </div>

        {/* ── Section 03: Source References ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">03</span>
            <span className="cpo-section__title">Source References</span>
            <span className="cpo-section__hint">Optional links to upstream procurement documents</span>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>PURCHASE REQUISITION NO.</label>
              <input type="text" value={prNo} onChange={(e) => setPrNo(e.target.value)} placeholder="PR-00000" />
              <span className="cpo-field__sub">Source PR</span>
            </div>
            <div className="cpo-field">
              <label>CONTRACT NO.</label>
              <input type="text" value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="CT-00000" />
              <span className="cpo-field__sub">Linked contract</span>
            </div>
            <div className="cpo-field">
              <label>RFQ NO.</label>
              <input type="text" value={rfqNo} onChange={(e) => setRfqNo(e.target.value)} placeholder="RFQ-00000" />
              <span className="cpo-field__sub">Reference RFQ</span>
            </div>
            <div className="cpo-field">
              <label>TENDER NO.</label>
              <input type="text" value={tenderNo} onChange={(e) => setTenderNo(e.target.value)} placeholder="TND-00000" />
              <span className="cpo-field__sub">Tender reference</span>
            </div>
          </div>

          <div className="cpo-grid cpo-grid--4" style={{ marginTop: 12 }}>
            <div className="cpo-field">
              <label>SUPPLIER QUOTATION NO.</label>
              <input type="text" value={supplierQuotationNo} onChange={(e) => setSupplierQuotationNo(e.target.value)} placeholder="SQ-00000" />
              <span className="cpo-field__sub">Vendor quotation ref</span>
            </div>
            <div className="cpo-field">
              <label>QUOTATION DATE</label>
              <input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
              <span className="cpo-field__sub">Date of quotation</span>
            </div>
            <div className="cpo-field">
              <label>BLANKET ORDER NO.</label>
              <input type="text" value={blanketOrderNo} onChange={(e) => setBlanketOrderNo(e.target.value)} placeholder="BO-00000" />
              <span className="cpo-field__sub">Blanket order ref</span>
            </div>
            <div className="cpo-field">
              <label>FRAMEWORK AGREEMENT</label>
              <input type="text" value={frameworkAgreement} onChange={(e) => setFrameworkAgreement(e.target.value)} placeholder="FA-00000" />
              <span className="cpo-field__sub">Agreement reference</span>
            </div>
          </div>
        </div>

        {/* ── Section 04: Line Items Table ── */}
        <div className="cpo-section">
          <div className="cpo-section__header cpo-section__header--flex">
            <div>
              <span className="cpo-section__num">04</span>
              <span className="cpo-section__title">Line Items & Pricing</span>
            </div>
            <button className="cpo-btn cpo-btn--secondary cpo-btn--sm" onClick={handleAddItem}>
              <Plus size={14} /> Add Line Item
            </button>
          </div>

          <div className="cpo-table-wrap">
            <table className="cpo-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th style={{ width: '120px' }}>Item Code</th>
                  <th>Item Name / Description *</th>
                  <th style={{ width: '90px' }}>Qty</th>
                  <th style={{ width: '80px' }}>Unit</th>
                  <th style={{ width: '130px' }}>Unit Price ({currency})</th>
                  <th style={{ width: '90px' }}>Tax %</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Total</th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal = item.quantity * item.unitPrice * (1 + item.taxPercent / 100);
                  return (
                    <tr key={item.id}>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          className="cpo-table__input"
                          value={item.itemCode}
                          onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="cpo-table__input"
                          placeholder="Item Name *"
                          value={item.itemName}
                          onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                          style={{ fontWeight: 600, marginBottom: 4 }}
                        />
                        <input
                          type="text"
                          className="cpo-table__input cpo-table__input--sub"
                          placeholder="Description / Specs"
                          value={item.description}
                          onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          className="cpo-table__input"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="cpo-table__input"
                          value={item.unit}
                          onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="cpo-table__input"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(item.id, 'unitPrice', Number(e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="cpo-table__input"
                          value={item.taxPercent}
                          onChange={(e) => handleItemChange(item.id, 'taxPercent', Number(e.target.value))}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatAmount(lineTotal, currency)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="cpo-trash-btn"
                          onClick={() => handleRemoveItem(item.id)}
                          disabled={items.length <= 1}
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

        {/* ── Section 05: Terms & Commercial Totals ── */}
        <div className="cpo-grid cpo-grid--split">
          <div className="cpo-section">
            <div className="cpo-section__header">
              <span className="cpo-section__num">05</span>
              <span className="cpo-section__title">Commercial Terms & Instructions</span>
            </div>

            <div className="cpo-grid cpo-grid--2">
              <div className="cpo-field">
                <label>CURRENCY</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </div>
              <div className="cpo-field">
                <label>PAYMENT TERMS</label>
                <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30 Days" />
              </div>
              <div className="cpo-field">
                <label>EXPECTED DELIVERY DATE</label>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </div>
              <div className="cpo-field">
                <label>SHIPPING TERMS</label>
                <input type="text" value={shippingTerms} onChange={(e) => setShippingTerms(e.target.value)} placeholder="e.g. FOB Destination" />
              </div>
            </div>

            <div className="cpo-field" style={{ marginTop: 12 }}>
              <label>SPECIAL INSTRUCTIONS / REMARKS</label>
              <textarea
                rows={3}
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Specific delivery notes, packaging instructions, etc."
              />
            </div>
          </div>

          <div className="cpo-section cpo-totals-card">
            <div className="cpo-section__header">
              <span className="cpo-section__title">Financial Summary</span>
            </div>

            <div className="cpo-totals">
              <div className="cpo-totals__row">
                <span>Subtotal</span>
                <span>{formatAmount(subtotal, currency)}</span>
              </div>
              <div className="cpo-totals__row">
                <span>Estimated Taxes</span>
                <span>{formatAmount(taxTotal, currency)}</span>
              </div>
              <div className="cpo-totals__row">
                <span>Shipping Charges</span>
                <input
                  type="number"
                  min="0"
                  className="cpo-totals__input"
                  value={shippingCharges}
                  onChange={(e) => setShippingCharges(Number(e.target.value))}
                />
              </div>
              <div className="cpo-totals__row">
                <span>Other Charges</span>
                <input
                  type="number"
                  min="0"
                  className="cpo-totals__input"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(Number(e.target.value))}
                />
              </div>
              <div className="cpo-totals__divider" />
              <div className="cpo-totals__grand">
                <span>Grand Total</span>
                <span>{formatAmount(grandTotal, currency)}</span>
              </div>
            </div>

            <div className="cpo-action-panel">
              <button
                className="cpo-btn cpo-btn--primary cpo-btn--full"
                onClick={() => handleSubmit('Pending Approval')}
                disabled={submitting}
              >
                <Send size={16} /> Submit PO for Approval
              </button>
              <button
                className="cpo-btn cpo-btn--outline cpo-btn--full"
                onClick={() => handleSubmit('Draft')}
                disabled={submitting}
              >
                <Save size={16} /> Save as Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
