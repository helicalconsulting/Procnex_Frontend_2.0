import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart, ArrowLeft, Plus, Trash2, Download, Save, Send,
  Building2, FileText, Calendar, IndianRupee, Tag, UserCheck, ShieldCheck,
  CheckCircle2, AlertCircle, Clock, Search, X, Pencil, Eye
} from 'lucide-react';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { purchaseRequisitionService } from '../../services/purchaseRequisitionService';
import { companySettingsService, type Warehouse, type PaymentTerm, type PaymentPlan } from '../../services/companySettingsService';
import CustomPaymentPlanModal from '../../components/vendor/CustomPaymentPlanModal';
import '../../components/vendor/vendor-rfq-workspace.css';
import { apiRequest } from '../../api/client';
import { downloadPurchaseOrderAsPdf } from '../../utils/pdfDownload';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useAuth } from '../../context/AuthContext';
import ActionSendingOverlay from '../../components/shared/ActionSendingOverlay';
import PhoneInput from '../../components/shared/PhoneInput';
import { COUNTRY_CODES } from '../../config/countryCodes';
import './CreatePurchaseOrderPage.css';

function detectCountryCode(fullPhone: string = '', fallback: string = '+91'): string {
  const trimmed = (fullPhone || '').trim();
  if (!trimmed) return fallback;
  const matched = COUNTRY_CODES.find(cc => trimmed.startsWith(cc.dial));
  return matched ? matched.dial : fallback;
}

function getPhoneNumberOnly(fullPhone: string = '', countryCode: string = '+91'): string {
  const trimmed = (fullPhone || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(countryCode)) {
    return trimmed.slice(countryCode.length).trim();
  }
  const matched = COUNTRY_CODES.find(cc => trimmed.startsWith(cc.dial));
  if (matched) {
    return trimmed.slice(matched.dial.length).trim();
  }
  return trimmed;
}

interface VendorOption {
  id: string;
  name: string;
  email: string;
  supplierCode?: string;
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
  showDescription?: boolean;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxPercent: number;
}

export default function CreatePurchaseOrderPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreatePO = hasPermission('PO Creation', 'canCreate') || hasPermission('Purchase Orders', 'canCreate') || hasPermission('PO', 'canCreate');
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('id');
  const isReadOnly = searchParams.get('mode') === 'view';
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const { companyName: brandingCompanyName, companyPhone: brandingPhone, companyEmail: brandingEmail, profile } = useBranding();

  // ── Ship-To & Warehouse Master State ──
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [shipToCompany, setShipToCompany] = useState(brandingCompanyName || 'Company Warehouse');
  const [shipToWarehouse, setShipToWarehouse] = useState('Central Warehouse');
  const [shipToAddress, setShipToAddress] = useState('Central Depot');
  const [shipToContact, setShipToContact] = useState('Warehouse Manager');
  const [shipToPhone, setShipToPhone] = useState(brandingPhone || '');
  const [shipToCountryCode, setShipToCountryCode] = useState('+91');
  const [shipToPhoneError, setShipToPhoneError] = useState<string | null>(null);

  // ── Fetch Warehouses dynamically from Company Settings DB ──
  useEffect(() => {
    setLoadingWarehouses(true);
    companySettingsService.listWarehouses(true)
      .then((whs) => {
        const list = whs || [];
        setWarehouses(list);
        if (list.length > 0) {
          const defWh = list.find((w) => w.isDefault && w.isActive) || list.find((w) => w.isActive) || list[0];
          if (defWh) {
            setSelectedWarehouseId(defWh.id);
            setShipToWarehouse(`${defWh.code} — ${defWh.name}`);
            const fullAddress = [defWh.address, defWh.city, defWh.country].filter(Boolean).join(', ');
            setShipToAddress(fullAddress || 'Central Depot');
            if (defWh.contactPerson) setShipToContact(defWh.contactPerson);
            if (defWh.phone) {
              setShipToCountryCode(detectCountryCode(defWh.phone, '+91'));
              setShipToPhone(defWh.phone);
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingWarehouses(false));
  }, []);

  const handleWarehouseSelect = (whId: string) => {
    setSelectedWarehouseId(whId);
    if (whId === '__custom__') {
      setShipToWarehouse('');
      setShipToAddress('');
      setShipToContact('');
      setShipToPhone('');
      setShipToPhoneError(null);
      return;
    }
    const wh = warehouses.find((w) => w.id === whId);
    if (wh) {
      setShipToWarehouse(`${wh.code} — ${wh.name}`);
      const fullAddress = [wh.address, wh.city, wh.country].filter(Boolean).join(', ');
      setShipToAddress(fullAddress || '');
      setShipToContact(wh.contactPerson || '');
      if (wh.phone) {
        setShipToCountryCode(detectCountryCode(wh.phone, '+91'));
        setShipToPhone(wh.phone);
      } else {
        setShipToPhone('');
      }
      setShipToPhoneError(null);
    } else {
      setShipToWarehouse('');
    }
  };

  // ── Form State ──
  const [poNumber, setPoNumber] = useState('');
  const [poNumberLoading, setPoNumberLoading] = useState(!editId); // only load for new POs
  const [revisionNo, setRevisionNo] = useState('0');
  const [poDate, setPoDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string>('Draft');

  // Auto-generate PO number from sequence (new PO only)
  useEffect(() => {
    if (editId) return; // editing existing PO — don't overwrite
    let cancelled = false;
    setPoNumberLoading(true);
    companySettingsService.generateNextSequence('PURCHASE_ORDER')
      .then(({ formattedCode }) => {
        if (!cancelled && formattedCode) setPoNumber(formattedCode);
      })
      .catch(() => {
        if (!cancelled) {
          setPoNumber(`PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
        }
      })
      .finally(() => { if (!cancelled) setPoNumberLoading(false); });
    return () => { cancelled = true; };
  }, [editId]);


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
  const [contactCountryCode, setContactCountryCode] = useState('+91');
  const [contactEmailError, setContactEmailError] = useState<string | null>(null);
  const [contactPhoneError, setContactPhoneError] = useState<string | null>(null);

  const isValidEmail = (email?: string): boolean => {
    if (!email || !email.trim()) return true;
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  };

  const isValidPhone = (phone?: string): boolean => {
    if (!phone || !phone.trim()) return true;
    const trimmed = phone.trim();
    if (!/^[+]?[\d\s().-]{7,25}$/.test(trimmed)) return false;
    const digits = trimmed.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  };

  // Predictive Vendor Search State & Ref
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const vendorSearchRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vendorSearchRef.current && !vendorSearchRef.current.contains(e.target as Node)) {
        setIsVendorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    { id: '1', itemCode: 'ITEM-001', itemName: '', description: '', quantity: 1, unit: 'pcs', unitPrice: 0, taxPercent: 0 },
  ]);

  // Commercial Terms
  const [currency, setCurrency] = useState(companyDefaultCurrency || 'KES');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [paymentTermsList, setPaymentTermsList] = useState<PaymentTerm[]>([]);
  const [customPlans, setCustomPlans] = useState<PaymentPlan[]>([]);
  const [selectedPaymentPlanId, setSelectedPaymentPlanId] = useState<string | null>(null);
  const [paymentPlanSnapshot, setPaymentPlanSnapshot] = useState<Array<{ id?: string; title: string; percentage: number }> | null>(null);
  const [showCustomPlanModal, setShowCustomPlanModal] = useState(false);
  const [editPlan, setEditPlan] = useState<PaymentPlan | null>(null);
  const [showViewPlanModal, setShowViewPlanModal] = useState(false);
  const [deleteConfirmPlanId, setDeleteConfirmPlanId] = useState<string | null>(null);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [deletePlanError, setDeletePlanError] = useState<string | null>(null);
  const [planSaving, setPlanSaving] = useState(false);

  const [deliveryDate, setDeliveryDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [shippingTerms, setShippingTerms] = useState('FOB Destination');
  const [shippingCharges, setShippingCharges] = useState(0);
  const [otherCharges, setOtherCharges] = useState(0);
  const [internalNotes, setInternalNotes] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Actions state
  const [submittingAction, setSubmittingAction] = useState<'draft' | 'submit' | null>(null);
  const [showSendingOverlay, setShowSendingOverlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState<'draft' | 'approval'>('approval');
  const submittingRef = React.useRef(false); // Hard guard against concurrent submits
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ── Fetch Payment Terms & Custom Payment Plans ──
  useEffect(() => {
    companySettingsService.listPaymentTerms()
      .then((terms) => {
        if (terms && terms.length > 0) {
          setPaymentTermsList(terms.filter((t) => t.isActive));
        } else {
          setPaymentTermsList([
            { id: '1', name: 'Net 15', isActive: true } as any,
            { id: '2', name: 'Net 30', isActive: true } as any,
            { id: '3', name: 'Net 45', isActive: true } as any,
            { id: '4', name: 'Net 60', isActive: true } as any,
            { id: '5', name: 'Cash on Delivery', isActive: true } as any,
            { id: '6', name: 'Advance Payment', isActive: true } as any,
          ]);
        }
      })
      .catch(() => {
        setPaymentTermsList([
          { id: '1', name: 'Net 15', isActive: true } as any,
          { id: '2', name: 'Net 30', isActive: true } as any,
          { id: '3', name: 'Net 45', isActive: true } as any,
          { id: '4', name: 'Net 60', isActive: true } as any,
          { id: '5', name: 'Cash on Delivery', isActive: true } as any,
          { id: '6', name: 'Advance Payment', isActive: true } as any,
        ]);
      });

    companySettingsService.listPaymentPlans()
      .then((plans) => {
        if (plans && Array.isArray(plans)) {
          setCustomPlans(plans);
        }
      })
      .catch(() => {});
  }, []);

  const selectedCustomPlan = useMemo(() => {
    if (selectedPaymentPlanId) {
      return customPlans.find((p) => p.id === selectedPaymentPlanId) || null;
    }
    if (paymentPlanSnapshot && paymentPlanSnapshot.length > 0) {
      return {
        id: 'snapshot',
        name: paymentTerms || 'Custom Plan',
        milestones: paymentPlanSnapshot.map((m, i) => ({ id: m.id || `ms_${i}`, title: m.title, percentage: m.percentage })),
      };
    }
    return null;
  }, [selectedPaymentPlanId, customPlans, paymentPlanSnapshot, paymentTerms]);

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

  // ── Predictive Vendor Filter (by Code, Name, Email, Phone, Category) ──
  const searchedVendors = useMemo(() => {
    if (!vendorSearchQuery.trim()) return vendors;
    const q = vendorSearchQuery.toLowerCase().trim();
    return vendors.filter((v) => {
      const name = (v.name || '').toLowerCase();
      const code = ((v as any).supplierCode || (v as any).code || `SUP-${v.id.slice(-5).toUpperCase()}`).toLowerCase();
      const email = (v.email || '').toLowerCase();
      const phone = (v.phone || '').toLowerCase();
      const cat = ((v as any).category || (v as any).categoryName || (v as any).supplierType || '').toLowerCase();
      return name.includes(q) || code.includes(q) || email.includes(q) || phone.includes(q) || cat.includes(q);
    });
  }, [vendors, vendorSearchQuery]);

  const handleSelectVendorOption = (v: VendorOption) => {
    const code = (v as any).supplierCode || (v as any).code || `SUP-${v.id.slice(-5).toUpperCase()}`;
    setSelectedVendorId(v.id);
    setSupplierCode(code);
    setSupplierName(v.name);
    setSupplierAddress(v.address || '');
    setSupplierTaxId(v.gstNumber || v.panNumber || '');
    setContactPerson(v.contactPerson || '');
    setContactEmail(v.email || '');
    setContactPhone(v.phone || '');
    if (v.phone) {
      setContactCountryCode(detectCountryCode(v.phone, '+91'));
    }
    if ((v as any).category || (v as any).categoryName || (v as any).supplierType) {
      setSupplierType((v as any).category || (v as any).categoryName || (v as any).supplierType);
    }
    setVendorSearchQuery(`${code} — ${v.name}`);
    setIsVendorDropdownOpen(false);
  };

  // ── Sync Vendor Search Input when Vendor is selected or in Edit mode ──
  useEffect(() => {
    if (selectedVendorId && vendors.length > 0) {
      const v = vendors.find((vendor) => vendor.id === selectedVendorId);
      if (v) {
        const code = (v as any).supplierCode || (v as any).code || `SUP-${v.id.slice(-5).toUpperCase()}`;
        setVendorSearchQuery(`${code} — ${v.name}`);
      }
    }
  }, [selectedVendorId, vendors]);

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
          if ((existing as any).paymentPlanId) setSelectedPaymentPlanId((existing as any).paymentPlanId);
          if ((existing as any).paymentPlanSnapshot) {
            const snap = (existing as any).paymentPlanSnapshot;
            if (Array.isArray(snap) && snap.length > 0) {
              setPaymentPlanSnapshot(snap);
              const planId = (existing as any).paymentPlanId || 'snapshot';
              setSelectedPaymentPlanId(planId);
              setCustomPlans((prev) => {
                if (prev.some((p) => p.id === planId)) return prev;
                return [{
                  id: planId,
                  name: existing.paymentTerms || 'Custom Payment Plan',
                  milestones: snap.map((m: any, idx: number) => ({ id: m.id || `ms_${idx}`, title: m.title, percentage: m.percentage })),
                }, ...prev];
              });
            }
          }
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
              const desc = parts.length > 1 ? parts.slice(1).join(' - ') : '';
              return {
                id: String(idx + 1),
                itemCode: `ITEM-00${idx + 1}`,
                itemName: parts[0] || item.description || '',
                description: desc,
                showDescription: !!desc,
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
        const code = matchedVendor.supplierCode || (matchedVendor as any).code || `SUP-${matchedVendor.id.slice(-5).toUpperCase()}`;
        if (!supplierCode) setSupplierCode(code);
      }
    } else if (supplierName) {
      const matchedVendor = vendors.find(
        (v) => v.name.toLowerCase().trim() === supplierName.toLowerCase().trim() || (contactEmail && v.email === contactEmail)
      );
      if (matchedVendor) {
        setSelectedVendorId(matchedVendor.id);
        const cat = (matchedVendor as any).category || (matchedVendor as any).categoryName || (matchedVendor as any).supplierType || '';
        if (!supplierType && cat) setSupplierType(cat);
        const code = matchedVendor.supplierCode || (matchedVendor as any).code || `SUP-${matchedVendor.id.slice(-5).toUpperCase()}`;
        if (!supplierCode) setSupplierCode(code);
      }
    }
  }, [vendors, selectedVendorId, supplierName, contactEmail, supplierType, supplierCode]);

  // ── Vendor Select Handler ──
  const handleVendorSelect = (id: string) => {
    setSelectedVendorId(id);
    const v = vendors.find((vendor) => vendor.id === id);
    if (v) {
      const code = v.supplierCode || (v as any).code || `SUP-${v.id.slice(-5).toUpperCase()}`;
      setSupplierCode(code);
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
        taxPercent: 0,
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
    () => subtotal,
    [subtotal]
  );

  // ── Submit / Save Draft Handler ──
  const handleSubmit = async (targetStatus: 'Draft' | 'Pending Approval') => {
    // Hard guard: prevent duplicate submissions from double-click or fast re-renders
    if (submittingRef.current) return;

    if (!supplierName.trim()) {
      setMsg({ text: 'Please select or enter Supplier Name.', type: 'error' });
      return;
    }
    if (!selectedVendorId) {
      setMsg({ text: 'Please select a Vendor from the Database Master dropdown. Vendor ID is required to create a Purchase Order.', type: 'error' });
      return;
    }
    if (items.some((i) => !i.itemName.trim())) {
      setMsg({ text: 'Please fill in Item Name for all row items.', type: 'error' });
      return;
    }
    if (items.some((i) => Number(i.unitPrice) <= 0)) {
      setMsg({ text: 'Please enter a valid Unit Price (greater than 0) for all items.', type: 'error' });
      return;
    }

    if (contactEmail && !isValidEmail(contactEmail)) {
      setContactEmailError('Please enter a valid email address (e.g. name@supplier.com)');
      setMsg({ text: 'Please enter a valid Contact Email address (e.g. name@supplier.com).', type: 'error' });
      return;
    }
    if (contactPhone && !isValidPhone(contactPhone)) {
      setContactPhoneError('Please enter a valid phone number (7 to 15 digits)');
      setMsg({ text: 'Please enter a valid Contact Phone number (7 to 15 digits).', type: 'error' });
      return;
    }
    if (shipToPhone && !isValidPhone(shipToPhone)) {
      setShipToPhoneError('Please enter a valid phone number (7 to 15 digits)');
      setMsg({ text: 'Please enter a valid Receiving Contact Phone number (7 to 15 digits).', type: 'error' });
      return;
    }

    submittingRef.current = true;
    setSubmittingAction(targetStatus === 'Draft' ? 'draft' : 'submit');
    setOverlayMode(targetStatus === 'Draft' ? 'draft' : 'approval');
    setShowSendingOverlay(true);
    setMsg(null);

    const statusPayload = targetStatus === 'Pending Approval' ? 'PENDING_APPROVAL' : 'DRAFT';

    try {
      // ── Build standalone PO payload (used for both Draft and Submit for Approval) ──
      const standalonePayload = {
        vendorId: selectedVendorId || undefined,
        vendorName: supplierName,
        poNumber: poNumber,
        poDate: poDate,
        totalAmount: grandTotal,
        notes: internalNotes,
        paymentTerms,
        paymentPlanId: selectedPaymentPlanId || undefined,
        paymentPlanSnapshot: paymentPlanSnapshot || (selectedCustomPlan ? selectedCustomPlan.milestones : undefined),
        deliveryDate,
        currency,
        status: statusPayload,
        supplierType,
        supplierCode,
        supplierAddress,
        supplierTaxId,
        contactPerson,
        contactEmail,
        contactPhone,
        subtotal,
        taxTotal,
        shippingCharges: Number(shippingCharges) || 0,
        otherCharges: Number(otherCharges) || 0,
        grandTotal,
        internalNotes,
        specialInstructions,
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

      // Always create/update in the PO table so it shows on PO Creation & Orders list
      const createdPO = await purchaseOrderService.createStandalonePO(standalonePayload);
      const finalPoNumber = createdPO?.poNumber || poNumber;

      // Also save to PR table so it appears in the PO Creation & Orders list page
      // (PurchaseRequisitionsListPage reads from purchaseRequisitionService)
      const prPayload: any = {
        ...(editId ? { id: editId } : {}),
        rfqId: rfqNo || editId || `rfq-direct-${Date.now()}`,
        poNumber: finalPoNumber,
        status: statusPayload,
        isStandalone: true,
        companyName: brandingCompanyName || 'Procnex Consulting',
        companyAddress: supplierAddress || '',
        companyPhone: brandingPhone || '',
        companyEmail: brandingEmail || '',
        companyWebsite: '',
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
        shipToCompany: shipToCompany || brandingCompanyName || 'Procnex Warehouse',
        shipToWarehouse: shipToWarehouse || 'Central Warehouse',
        shipToAddress: shipToAddress || '',
        shipToContact: shipToContact || '',
        shipToPhone: shipToPhone || '',
        poDate: poDate,
        currency: currency,
        requisitioner: 'Procurement Officer',
        shipVia: 'Surface',
        fob: 'Destination',
        paymentTerms: paymentTerms,
        paymentPlanId: selectedPaymentPlanId || null,
        paymentPlanSnapshot: paymentPlanSnapshot || (selectedCustomPlan ? selectedCustomPlan.milestones : null),
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
      await purchaseRequisitionService.save(prPayload).catch(() => {});

      // 🔔 Instant sync notification across open tabs and windows
      window.dispatchEvent(new CustomEvent('heliflow:po-created', { detail: { poNumber, status: statusPayload } }));
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
      try {
        const bc = new BroadcastChannel('heliflow_sync');
        bc.postMessage({ type: 'PO_CREATED', poNumber, status: statusPayload, timestamp: Date.now() });
        bc.close();
      } catch {}

      setMsg({
        text: targetStatus === 'Draft'
          ? `Purchase Order ${poNumber} saved successfully as Draft!`
          : `Purchase Order ${poNumber} submitted successfully for approval!`,
        type: 'success',
      });
      setTimeout(() => {
        setShowSendingOverlay(false);
        // Redirect to PO Creation & Orders list page
        navigate('/procurement/purchase-requisitions');
      }, 2200);
    } catch (err) {
      setShowSendingOverlay(false);
      setMsg({
        text: err instanceof Error ? err.message : 'Failed to save Purchase Order',
        type: 'error',
      });
    } finally {
      submittingRef.current = false; // Always reset so button works again
      setSubmittingAction(null);
    }
  };

  // ── Download PDF Handler ──
  const handleDownloadPdf = () => {
    const compAddress = profile?.companyAddress
      ? [profile.companyAddress, profile.companyCity, profile.companyState, profile.companyCountry].filter(Boolean).join(', ')
      : '';

    const poData = {
      poNumber,
      revisionNo,
      orderDate: poDate,
      companyName: brandingCompanyName || 'Company',
      companyAddress: compAddress,
      companyPhone: brandingPhone || '',
      companyEmail: brandingEmail || '',
      companyWebsite: '',
      vendorName: supplierName || 'Supplier',
      supplierCode: supplierCode || undefined,
      supplierType: supplierType || undefined,
      vendorContactPerson: contactPerson || undefined,
      vendorAddress: supplierAddress || undefined,
      vendorPhone: contactPhone || undefined,
      vendorEmail: contactEmail || undefined,
      vendorGstVat: supplierTaxId || undefined,
      shipToCompany: shipToCompany || brandingCompanyName || 'Company Warehouse',
      shipToWarehouse: shipToWarehouse || 'Central Warehouse',
      shipToAddress: shipToAddress || 'Central Depot',
      shipToContact: shipToContact || 'Warehouse Manager',
      shipToPhone: shipToPhone || brandingPhone || '',
      requisitioner: 'Procurement Officer',
      shipVia: 'Surface',
      fob: 'Destination',
      paymentTerms,
      expectedDelivery: deliveryDate,
      shippingTerms,
      items: items.map((i) => ({
        itemCode: i.itemCode,
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
          <button className="cpo-back-btn" onClick={() => navigate(-1)} title="Back" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
          <div className="cpo-header__title-wrap">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h1>{editId ? `Purchase Order #${poNumber}` : 'Create Direct Purchase Order'}</h1>
              {status === 'Approved' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(16, 126, 62, 0.15)', color: '#107e3e', border: '1px solid rgba(16, 126, 62, 0.3)', borderRadius: 16, fontSize: 13, fontWeight: 700, marginLeft: 10 }}>
                  <CheckCircle2 size={13} /> Approved
                </span>
              )}
              {status === 'Pending Approval' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: 'rgba(217, 119, 6, 0.15)', color: '#d97706', border: '1px solid rgba(217, 119, 6, 0.3)', borderRadius: 16, fontSize: 13, fontWeight: 700, marginLeft: 10 }}>
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
            disabled={submittingAction !== null || !canCreatePO}
            style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
            title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to save draft POs." : undefined}
          >
            <Save size={15} /> {submittingAction === 'draft' ? 'Saving Draft…' : 'Save Draft'}
          </button>
          <button
            className="cpo-btn cpo-btn--primary"
            onClick={() => handleSubmit('Pending Approval')}
            disabled={submittingAction !== null || !canCreatePO}
            style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
            title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to submit POs." : undefined}
          >
            <Send size={15} /> {submittingAction === 'submit' ? 'Submitting…' : 'Submit for Approval'}
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
          <div className="cpo-grid cpo-grid--3">
            <div className="cpo-field">
              <label>PURCHASE ORDER NO.</label>
              <span className="cpo-field__sub">Auto-generated from sequence settings</span>
              <input
                type="text"
                value={poNumberLoading ? '' : poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder={poNumberLoading ? 'Generating...' : ''}
                disabled={poNumberLoading}
                style={poNumberLoading ? { opacity: 0.5 } : undefined}
              />
            </div>
            <div className="cpo-field">
              <label>REVISION NO.</label>
              <span className="cpo-field__sub">PO revision / version</span>
              <input
                type="text"
                value={revisionNo}
                onChange={(e) => setRevisionNo(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="cpo-field">
              <label>PO DATE</label>
              <span className="cpo-field__sub">Date of issue</span>
              <input type="date" value={poDate ? String(poDate).slice(0, 10) : ''} onChange={(e) => setPoDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Section 02: Source References ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">02</span>
            <span className="cpo-section__title">Source References</span>
            <div className="cpo-section__hint-group">
              <span className="cpo-optional-pill">OPTIONAL</span>
              <span className="cpo-section__hint">Links to upstream procurement documents</span>
            </div>
          </div>
          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>PURCHASE REQUISITION NO.</label>
              <span className="cpo-field__sub">Source PR</span>
              <input type="text" value={prNo} onChange={(e) => setPrNo(e.target.value)} placeholder="PR-00000" />
            </div>
            <div className="cpo-field">
              <label>CONTRACT NO.</label>
              <span className="cpo-field__sub">Linked contract</span>
              <input type="text" value={contractNo} onChange={(e) => setContractNo(e.target.value)} placeholder="CT-00000" />
            </div>
            <div className="cpo-field">
              <label>RFQ NO.</label>
              <span className="cpo-field__sub">Reference RFQ</span>
              <input type="text" value={rfqNo} onChange={(e) => setRfqNo(e.target.value)} placeholder="RFQ-00000" />
            </div>
            <div className="cpo-field">
              <label>TENDER NO.</label>
              <span className="cpo-field__sub">Tender reference</span>
              <input type="text" value={tenderNo} onChange={(e) => setTenderNo(e.target.value)} placeholder="TND-00000" />
            </div>
          </div>

          <div className="cpo-grid cpo-grid--4" style={{ marginTop: 12 }}>
            <div className="cpo-field">
              <label>SUPPLIER QUOTATION NO.</label>
              <span className="cpo-field__sub">Vendor quotation ref</span>
              <input type="text" value={supplierQuotationNo} onChange={(e) => setSupplierQuotationNo(e.target.value)} placeholder="SQ-00000" />
            </div>
            <div className="cpo-field">
              <label>QUOTATION DATE</label>
              <span className="cpo-field__sub">Date of quotation</span>
              <input type="date" value={quotationDate ? String(quotationDate).slice(0, 10) : ''} onChange={(e) => setQuotationDate(e.target.value)} />
            </div>
            <div className="cpo-field">
              <label>BLANKET ORDER NO.</label>
              <span className="cpo-field__sub">Blanket order ref</span>
              <input type="text" value={blanketOrderNo} onChange={(e) => setBlanketOrderNo(e.target.value)} placeholder="BO-00000" />
            </div>
            <div className="cpo-field">
              <label>FRAMEWORK AGREEMENT</label>
              <span className="cpo-field__sub">Agreement reference</span>
              <input type="text" value={frameworkAgreement} onChange={(e) => setFrameworkAgreement(e.target.value)} placeholder="FA-00000" />
            </div>
          </div>
        </div>

        {/* ── Section 03: Supplier Information ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">03</span>
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
            flexDirection: 'column',
            gap: '8px'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13.5px',
              fontWeight: 800,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              color: 'var(--primary-500, #0a6ed1)',
            }}>
              <Building2 size={18} />
              SEARCH & SELECT VENDOR (BY CODE OR NAME) *
            </label>

            <div ref={vendorSearchRef} style={{ position: 'relative', width: '100%' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={18} style={{ position: 'absolute', left: 14, color: 'var(--primary-500, #0a6ed1)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  value={vendorSearchQuery}
                  onChange={(e) => {
                    setVendorSearchQuery(e.target.value);
                    setIsVendorDropdownOpen(true);
                  }}
                  onFocus={() => setIsVendorDropdownOpen(true)}
                  placeholder="Search by Supplier Code (e.g. SUP-F472F), Vendor Name, or Email..."
                  style={{
                    width: '100%',
                    padding: '12px 40px 12px 42px',
                    borderRadius: '8px',
                    background: 'var(--surface-card, #ffffff)',
                    border: '2px solid var(--primary-500, #0a6ed1)',
                    color: 'var(--text-primary)',
                    fontSize: '16px',
                    fontWeight: 600,
                    outline: 'none',
                    boxShadow: '0 4px 12px rgba(10, 110, 209, 0.15)'
                  }}
                />
                {vendorSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setVendorSearchQuery('');
                      setSelectedVendorId('');
                      setSupplierCode('');
                      setSupplierName('');
                      setSupplierAddress('');
                      setSupplierTaxId('');
                      setContactPerson('');
                      setContactEmail('');
                      setContactPhone('');
                      setIsVendorDropdownOpen(true);
                    }}
                    style={{
                      position: 'absolute',
                      right: 12,
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: 4,
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Clear Selection"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Predictive Search Suggestions Dropdown */}
              {isVendorDropdownOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  maxHeight: '280px',
                  overflowY: 'auto',
                  background: 'var(--surface-card, #1e293b)',
                  border: '1px solid var(--primary-500, #0a6ed1)',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                  zIndex: 100,
                  padding: '6px 0'
                }}>
                  {loadingVendors ? (
                    <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '14.5px' }}>
                      Loading vendors from master database...
                    </div>
                  ) : searchedVendors.length === 0 ? (
                    <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '14.5px' }}>
                      No matching vendors found for "{vendorSearchQuery}"
                    </div>
                  ) : (
                    searchedVendors.map((v) => {
                      const code = (v as any).supplierCode || (v as any).code || `SUP-${v.id.slice(-5).toUpperCase()}`;
                      const isSelected = v.id === selectedVendorId;
                      return (
                        <div
                          key={v.id}
                          onClick={() => handleSelectVendorOption(v)}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            background: isSelected ? 'rgba(10, 110, 209, 0.2)' : 'transparent',
                            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '12px',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'rgba(10, 110, 209, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, fontSize: '15.5px', color: 'var(--text-primary)' }}>
                                {v.name}
                              </span>
                              <span style={{
                                padding: '2px 7px',
                                borderRadius: '4px',
                                background: 'rgba(10, 110, 209, 0.18)',
                                color: 'var(--primary-500, #0a6ed1)',
                                fontSize: '12.5px',
                                fontWeight: 800,
                                letterSpacing: '0.5px'
                              }}>
                                {code}
                              </span>
                            </div>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                              {v.email || 'No email registered'} {v.phone ? `• ${v.phone}` : ''} {(v as any).category || (v as any).categoryName ? `• ${(v as any).category || (v as any).categoryName}` : ''}
                            </span>
                          </div>
                          {isSelected && (
                            <CheckCircle2 size={16} style={{ color: 'var(--primary-500, #0a6ed1)', flexShrink: 0 }} />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="cpo-grid cpo-grid--4">
            <div className="cpo-field">
              <label>SUPPLIER CODE</label>
              <input type="text" value={supplierCode} onChange={(e) => setSupplierCode(e.target.value)} placeholder="SUP-00000" />
            </div>
            <div className="cpo-field cpo-field--span-2">
              <label>SUPPLIER NAME *</label>
              <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Acme Industrial Supplies Ltd." />
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
            <div className={`cpo-field ${contactEmailError ? 'cpo-field--error' : ''}`}>
              <label>CONTACT EMAIL</label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => {
                  const val = e.target.value;
                  setContactEmail(val);
                  const trimmed = val.trim();
                  if (!trimmed) {
                    setContactEmailError(null);
                  } else if (!isValidEmail(trimmed)) {
                    setContactEmailError('Please enter a valid email address (e.g. name@supplier.com)');
                  } else {
                    setContactEmailError(null);
                  }
                }}
                onBlur={(e) => {
                  const trimmed = e.target.value.trim();
                  if (!trimmed) {
                    setContactEmailError(null);
                  } else if (!isValidEmail(trimmed)) {
                    setContactEmailError('Please enter a valid email address (e.g. name@supplier.com)');
                  } else {
                    setContactEmailError(null);
                  }
                }}
                placeholder="name@supplier.com"
              />
              {contactEmailError && <span className="cpo-field__error-msg">{contactEmailError}</span>}
            </div>
            <div className={`cpo-field ${contactPhoneError ? 'cpo-field--error' : ''}`}>
              <label>CONTACT PHONE</label>
              <PhoneInput
                countryCode={contactCountryCode}
                onCountryCodeChange={(code) => {
                  setContactCountryCode(code);
                  const num = getPhoneNumberOnly(contactPhone, contactCountryCode);
                  const combined = num.trim() ? `${code} ${num.trim()}` : '';
                  setContactPhone(combined);
                  if (contactPhoneError && (!num.trim() || isValidPhone(combined))) {
                    setContactPhoneError(null);
                  }
                }}
                value={getPhoneNumberOnly(contactPhone, contactCountryCode)}
                onChange={(val) => {
                  const sanitized = val.replace(/[^0-9\s-()]/g, '');
                  const combined = sanitized.trim() ? `${contactCountryCode} ${sanitized.trim()}` : '';
                  setContactPhone(combined);
                  const trimmed = sanitized.trim();
                  if (!trimmed) {
                    setContactPhoneError(null);
                  } else if (!isValidPhone(combined)) {
                    setContactPhoneError('Please enter a valid phone number (7 to 15 digits)');
                  } else {
                    setContactPhoneError(null);
                  }
                }}
                hasError={Boolean(contactPhoneError)}
                placeholder="e.g. 9820112345"
              />
              {contactPhoneError && <span className="cpo-field__error-msg">{contactPhoneError}</span>}
            </div>
          </div>
        </div>

        {/* ── Section 03B: Ship-To & Warehouse Location Master ── */}
        <div className="cpo-section">
          <div className="cpo-section__header">
            <span className="cpo-section__num">03B</span>
            <span className="cpo-section__title">Ship-To & Warehouse Location</span>
            <span className="cpo-section__hint">Linked to Warehouse Master Database</span>
          </div>

          <div className="cpo-grid cpo-grid--3">
            <div className="cpo-field">
              <label>SHIP-TO WAREHOUSE MASTER *</label>
              <select
                value={selectedWarehouseId}
                onChange={(e) => handleWarehouseSelect(e.target.value)}
                style={{ fontWeight: 600 }}
              >
                <option value="">-- Select Dynamic Warehouse --</option>
                {warehouses.map((wh) => (
                  <option key={wh.id} value={wh.id}>
                    {wh.code} — {wh.name} {wh.isDefault ? '(Default Master)' : ''}
                  </option>
                ))}
                <option value="__custom__">+ Enter Custom Warehouse Manually...</option>
              </select>
              {selectedWarehouseId === '__custom__' && (
                <input
                  style={{ marginTop: 6 }}
                  type="text"
                  value={shipToWarehouse}
                  onChange={(e) => setShipToWarehouse(e.target.value)}
                  placeholder="Enter custom warehouse / location name..."
                />
              )}
            </div>
            <div className="cpo-field">
              <label>RECEIVING CONTACT PERSON</label>
              <input
                type="text"
                value={shipToContact}
                onChange={(e) => setShipToContact(e.target.value)}
                placeholder="Warehouse Manager / Store Incharge"
              />
            </div>
            <div className={`cpo-field ${shipToPhoneError ? 'cpo-field--error' : ''}`}>
              <label>RECEIVING CONTACT PHONE</label>
              <PhoneInput
                countryCode={shipToCountryCode}
                onCountryCodeChange={(code) => {
                  setShipToCountryCode(code);
                  const num = getPhoneNumberOnly(shipToPhone, shipToCountryCode);
                  const combined = num.trim() ? `${code} ${num.trim()}` : '';
                  setShipToPhone(combined);
                  if (shipToPhoneError && (!num.trim() || isValidPhone(combined))) {
                    setShipToPhoneError(null);
                  }
                }}
                value={getPhoneNumberOnly(shipToPhone, shipToCountryCode)}
                onChange={(val) => {
                  const sanitized = val.replace(/[^0-9\s-()]/g, '');
                  const combined = sanitized.trim() ? `${shipToCountryCode} ${sanitized.trim()}` : '';
                  setShipToPhone(combined);
                  const trimmed = sanitized.trim();
                  if (!trimmed) {
                    setShipToPhoneError(null);
                  } else if (!isValidPhone(combined)) {
                    setShipToPhoneError('Please enter a valid phone number (7 to 15 digits)');
                  } else {
                    setShipToPhoneError(null);
                  }
                }}
                hasError={Boolean(shipToPhoneError)}
                placeholder="e.g. 9820112345"
              />
              {shipToPhoneError && <span className="cpo-field__error-msg">{shipToPhoneError}</span>}
            </div>
          </div>

          <div className="cpo-grid cpo-grid--1" style={{ marginTop: 12 }}>
            <div className="cpo-field">
              <label>FULL SHIP-TO DELIVERY ADDRESS</label>
              <input
                type="text"
                value={shipToAddress}
                onChange={(e) => setShipToAddress(e.target.value)}
                placeholder="Central Depot, Industrial Zone..."
              />
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
                  <th style={{ width: '180px', textAlign: 'right', paddingRight: '16px' }}>Total</th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const lineTotal = item.quantity * item.unitPrice * (1 + (item.taxPercent || 0) / 100);
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
                        <div className="cpo-table__item-name-wrap">
                          <input
                            type="text"
                            className="cpo-table__input"
                            placeholder="Item Name *"
                            value={item.itemName}
                            onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                            style={{ fontWeight: 600, paddingRight: !item.showDescription ? '120px' : '12px' }}
                          />
                          {!item.showDescription && (
                            <button
                              type="button"
                              className="cpo-table__add-desc-btn"
                              onClick={() => handleItemChange(item.id, 'showDescription', true)}
                            >
                              + Add Description
                            </button>
                          )}
                        </div>
                        {item.showDescription && (
                          <input
                            type="text"
                            className="cpo-table__input cpo-table__input--sub"
                            placeholder="Description / Specs"
                            value={item.description}
                            onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                            style={{ marginTop: 4 }}
                            autoFocus
                          />
                        )}
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
                          step="1"
                          placeholder="0"
                          className="cpo-table__input"
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleItemChange(item.id, 'unitPrice', val === '' ? 0 : Number(val));
                          }}
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
              <div className="cpo-field rfq-payment-field" style={{ gridColumn: 'span 2' }}>
                <label>PAYMENT TERMS & SCHEDULE</label>
                <div className="rfq-payment-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    id="po-payment-terms"
                    disabled={isReadOnly || planSaving}
                    value={selectedPaymentPlanId ? `custom_${selectedPaymentPlanId}` : paymentTerms}
                    onChange={(e) => {
                      const value = e.target.value;
                      setShowViewPlanModal(false);
                      setDeleteConfirmPlanId(null);
                      setShowCustomPlanModal(false);
                      if (value.startsWith('custom_')) {
                        const plan = customPlans.find((p) => p.id === value.slice(7));
                        if (plan) {
                          setSelectedPaymentPlanId(plan.id);
                          setPaymentTerms(plan.name);
                          setPaymentPlanSnapshot(plan.milestones);
                        }
                      } else {
                        setSelectedPaymentPlanId(null);
                        setPaymentTerms(value);
                        setPaymentPlanSnapshot(null);
                      }
                    }}
                    style={{ flex: 1, minWidth: 220 }}
                  >
                    {!paymentTerms && <option value="">Select payment terms</option>}
                    <optgroup label="Standard Terms">
                      {paymentTermsList.map((term) => (
                        <option key={term.id} value={term.name}>
                          {term.name}
                        </option>
                      ))}
                    </optgroup>
                    {customPlans.length > 0 && (
                      <optgroup label="Custom Payment Plans">
                        {customPlans.map((plan) => (
                          <option key={plan.id} value={`custom_${plan.id}`}>
                            {plan.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>

                  {selectedCustomPlan && (
                    <div className="rfq-plan-actions" style={{ display: 'flex', gap: 4 }}>
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="rfq-icon-button"
                          disabled={planSaving}
                          title="Edit payment plan"
                          aria-label="Edit payment plan"
                          onClick={() => {
                            setEditPlan(selectedCustomPlan);
                            setShowCustomPlanModal(true);
                            setShowViewPlanModal(false);
                            setDeleteConfirmPlanId(null);
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="rfq-icon-button"
                        disabled={planSaving}
                        title="View payment plan"
                        aria-label="View payment plan"
                        aria-expanded={showViewPlanModal}
                        onClick={() => {
                          setShowViewPlanModal(!showViewPlanModal);
                          setShowCustomPlanModal(false);
                          setDeleteConfirmPlanId(null);
                        }}
                      >
                        <Eye size={14} />
                      </button>
                      {!isReadOnly && (
                        <button
                          type="button"
                          className="rfq-icon-button rfq-icon-button--danger"
                          disabled={planSaving}
                          title="Delete payment plan"
                          aria-label="Delete payment plan"
                          onClick={() => {
                            setDeleteConfirmPlanId(selectedCustomPlan.id);
                            setShowCustomPlanModal(false);
                            setShowViewPlanModal(false);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  {!isReadOnly && (
                    <button
                      type="button"
                      className="rfq-secondary-action text-xs"
                      disabled={planSaving}
                      aria-expanded={showCustomPlanModal}
                      onClick={() => {
                        setEditPlan(null);
                        setShowCustomPlanModal(true);
                        setShowViewPlanModal(false);
                        setDeleteConfirmPlanId(null);
                      }}
                      style={{ padding: '6px 10px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <Plus size={14} /> Create Custom Payment Plan
                    </button>
                  )}
                </div>

                {/* Custom Payment Plan Modal */}
                {showCustomPlanModal && (
                  <CustomPaymentPlanModal
                    key={editPlan?.id || 'new'}
                    embedded
                    onSavingChange={setPlanSaving}
                    editPlan={editPlan}
                    onSavePlan={async (name, milestones, editPlanId) => {
                      if (editPlanId && !editPlanId.startsWith('snap')) {
                        const updated = await companySettingsService.updatePaymentPlan(editPlanId, { name, milestones });
                        return updated;
                      } else {
                        const created = await companySettingsService.createPaymentPlan(name, milestones);
                        return created;
                      }
                    }}
                    onClose={() => {
                      setShowCustomPlanModal(false);
                      setEditPlan(null);
                    }}
                    onSaved={(plan) => {
                      setCustomPlans((plans) =>
                        plans.some((p) => p.id === plan.id)
                          ? plans.map((p) => (p.id === plan.id ? plan : p))
                          : [plan, ...plans]
                      );
                      setSelectedPaymentPlanId(plan.id);
                      setPaymentTerms(plan.name);
                      setPaymentPlanSnapshot(plan.milestones);
                    }}
                  />
                )}

                {/* View Plan Modal / Section */}
                {showViewPlanModal && selectedCustomPlan && (
                  <section className="rfq-read-section" aria-label="Payment plan details" style={{ marginTop: 8 }}>
                    <div className="rfq-read-section__body" style={{ padding: 12 }}>
                      <div className="rfq-section-heading" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong className="vquot-modal__label">{selectedCustomPlan.name}</strong>
                        <button
                          type="button"
                          className="rfq-icon-button"
                          aria-label="Close payment plan details"
                          onClick={() => setShowViewPlanModal(false)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <ol className="rfq-payment-milestones text-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {selectedCustomPlan.milestones.map((m) => (
                          <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                            <span>{m.title}</span>
                            <strong>
                              {m.percentage}% ({formatAmount((grandTotal * Number(m.percentage)) / 100, currency)})
                            </strong>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </section>
                )}

                {/* Delete Confirmation */}
                {deleteConfirmPlanId && (
                  <section className="rfq-delete-confirm text-sm" aria-label="Delete payment plan confirmation" style={{ marginTop: 8, padding: 12, border: '1px solid var(--danger-300)', borderRadius: 8 }}>
                    <strong>Delete {selectedCustomPlan?.name}?</strong>
                    <span className="rfq-muted" style={{ display: 'block', margin: '4px 0' }}>This removes the saved plan from your company account and cannot be undone.</span>
                    {deletePlanError && <p className="rfq-error" role="alert">{deletePlanError}</p>}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="cpo-btn cpo-btn--outline"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        disabled={isDeletingPlan}
                        onClick={() => setDeleteConfirmPlanId(null)}
                      >
                        Keep plan
                      </button>
                      <button
                        type="button"
                        className="cpo-btn"
                        style={{ padding: '4px 10px', fontSize: 12, background: 'var(--danger-600)', color: '#fff' }}
                        disabled={isDeletingPlan}
                        onClick={async () => {
                          setIsDeletingPlan(true);
                          setDeletePlanError(null);
                          try {
                            if (!deleteConfirmPlanId.startsWith('snap')) {
                              await companySettingsService.deletePaymentPlan(deleteConfirmPlanId);
                            }
                            setCustomPlans((plans) => plans.filter((p) => p.id !== deleteConfirmPlanId));
                            setSelectedPaymentPlanId(null);
                            setPaymentPlanSnapshot(null);
                            setPaymentTerms(paymentTermsList[0]?.name || 'Net 30');
                            setDeleteConfirmPlanId(null);
                          } catch (e) {
                            setDeletePlanError(e instanceof Error ? e.message : 'Failed to delete payment plan');
                          } finally {
                            setIsDeletingPlan(false);
                          }
                        }}
                      >
                        {isDeletingPlan ? 'Deleting…' : 'Delete plan'}
                      </button>
                    </div>
                  </section>
                )}

                {/* Inline Milestone Breakdown Table when custom plan is selected */}
                {selectedCustomPlan && selectedCustomPlan.milestones && selectedCustomPlan.milestones.length > 0 && (
                  <div style={{ marginTop: 12, background: 'var(--surface-elevated)', borderRadius: 8, border: '1px solid var(--border)', padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Milestone Schedule ({selectedCustomPlan.milestones.length} Milestones · 100% Total)
                    </div>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <th style={{ textAlign: 'left', padding: '6px 4px' }}>Milestone</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px' }}>Allocation</th>
                          <th style={{ textAlign: 'right', padding: '6px 4px' }}>Calculated Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCustomPlan.milestones.map((m, idx) => (
                          <tr key={m.id || idx} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 4px', color: 'var(--text-primary)' }}>{m.title}</td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.percentage}%</td>
                            <td style={{ textAlign: 'right', padding: '6px 4px', color: 'var(--text-primary)' }}>
                              {formatAmount((grandTotal * Number(m.percentage)) / 100, currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="cpo-field">
                <label>EXPECTED DELIVERY DATE</label>
                <input type="date" value={deliveryDate ? String(deliveryDate).slice(0, 10) : ''} onChange={(e) => setDeliveryDate(e.target.value)} />
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
                disabled={submittingAction !== null || !canCreatePO}
                style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to submit POs." : undefined}
              >
                <Send size={16} /> {submittingAction === 'submit' ? 'Submitting PO for Approval…' : 'Submit PO for Approval'}
              </button>
              <button
                className="cpo-btn cpo-btn--outline cpo-btn--full"
                onClick={() => handleSubmit('Draft')}
                disabled={submittingAction !== null || !canCreatePO}
                style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to save draft POs." : undefined}
              >
                <Save size={16} /> {submittingAction === 'draft' ? 'Saving as Draft…' : 'Save as Draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <ActionSendingOverlay
        isOpen={showSendingOverlay}
        docType="po"
        docNumber={poNumber}
        vendorName={supplierName}
        amount={grandTotal}
        currency={currency}
        mode={overlayMode}
      />
    </div>
  );
}
