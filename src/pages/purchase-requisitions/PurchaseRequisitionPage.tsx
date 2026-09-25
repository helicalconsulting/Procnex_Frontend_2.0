import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { rfqService } from '../../services/rfqService';
import { contractService } from '../../services/contractService';
import { purchaseRequisitionService, type PurchaseRequisition, type PurchaseRequisitionItem } from '../../services/purchaseRequisitionService';
import { companySettingsService, type Warehouse } from '../../services/companySettingsService';
import { apiRequest } from '../../api/client';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { useCurrency, CurrencySelector } from '../../components/shared/CurrencyMaster';
import { sseClient } from '../../services/sseClient';
import {
  Save, Eye, FileText, Printer, Send, ArrowLeft, Plus, Trash2,
  ShoppingCart, Building2, Truck, ClipboardList, Hash, DollarSign,
  Percent, Calculator, X, Loader2, AlertTriangle, Settings,
  AlertCircle, Download, FileCheck, ShieldAlert, CheckCircle2, PieChart, IndianRupee,
} from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import PurchaseOrderDocument from '../../components/purchase-orders/PurchaseOrderDocument';
import { toCanvas } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { useAuth } from '../../context/AuthContext';
import ActionSendingOverlay from '../../components/shared/ActionSendingOverlay';
import './PurchaseRequisitionPage.css';

// ─── Helper ─────────────────────────────────────────────────

function generatePONumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `PO-${year}${month}${day}-${seq}`;
}

function calcItemTotal(item: Partial<PurchaseRequisitionItem>): number {
  const qty = item.quantity || 0;
  const price = item.unitPrice || 0;
  return price * qty;
}

function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_APPROVAL: 'Pending Approval',
    APPROVED: 'Completed',
    SENT_TO_VENDOR: 'Sent to Vendor',
  };
  return labels[status] || status.replace(/_/g, ' ');
}

// ─── Component ──────────────────────────────────────────────

export default function PurchaseRequisitionPage() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get('contractId');
  const isReadOnly = searchParams.get('mode') === 'view' || searchParams.get('readOnly') === 'true' || Boolean((location.state as any)?.readOnly);
  const { roles, hasPermission } = useAuth();
  const canCreatePO = hasPermission('PO Creation', 'canCreate') || hasPermission('Goods Received Note', 'canCreate') || hasPermission('GRN', 'canCreate');
  const isFormDisabled = isReadOnly || !canCreatePO;
  const { formatAmount, companyDefaultCurrency } = useCurrency();
  const branding = useBranding();

  const [pr, setPr] = useState<PurchaseRequisition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [contractData, setContractData] = useState<any>(null);
  const [contractBalance, setContractBalance] = useState<{ contractValue: number; consumedValue: number; remainingValue: number; currency: string } | null>(null);
  const [poCreated, setPoCreated] = useState(false);

  // Print / PDF state
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Send to Vendor modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendTo, setSendTo] = useState('');
  const [sendCc, setSendCc] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendMessage, setSendMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Validation
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [itemValidationErrors, setItemValidationErrors] = useState<Record<number, Record<string, string>>>({});

  // Company settings & Warehouses for auto-fill
  const [companyProfile, setCompanyProfile] = useState<Record<string, any> | null>(null);
  const [vendorsList, setVendorsList] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');

  useEffect(() => {
    apiRequest<{ vendors?: any[]; data?: any[] }>('/vendors')
      .then((res) => {
        const list = res.vendors || res.data || [];
        setVendorsList(list);
      })
      .catch(() => {});

    companySettingsService.listWarehouses()
      .then((whs) => {
        setWarehouses(whs || []);
      })
      .catch(() => {});
  }, []);

  // Fetch RFQ data on mount
  useEffect(() => {
    if (!rfqId) return;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Try fetching existing PR first (only for non-contract PR view/edit)
        if (!contractId) {
          const existing = await purchaseRequisitionService.getByRfqId(rfqId);
          if (existing) {
            const items = (existing.items || []).map(i => ({ ...i, total: calcItemTotal(i) }));
            const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
            setPr({
              ...existing,
              items,
              subtotal,
              taxTotal: 0,
              discountTotal: 0,
              shippingCharges: 0,
              otherCharges: 0,
              grandTotal: subtotal,
            });
            setLoading(false);
            return;
          }
        }

        // Fetch contract data if contractId provided or if RFQ is linked to a contract
        let contract: any = null;
        let resolvedContractId = contractId;

        if (!resolvedContractId && rfqId) {
          try {
            const listRes = await contractService.listContracts({ search: rfqId, limit: 10 });
            if (listRes.contracts && listRes.contracts.length > 0) {
              const matched = listRes.contracts.find(c => c.rfqId === rfqId || c.rfq?.id === rfqId);
              if (matched) resolvedContractId = matched.id;
            }
          } catch {}
        }

        if (resolvedContractId) {
          try {
            const contractResp = await contractService.getContract(resolvedContractId);
            contract = contractResp.contract;
            setContractData(contract);
            // Fetch contract balance for validation
            try {
              const balance = await contractService.getContractBalance(resolvedContractId);
              setContractBalance(balance);
            } catch {}
          } catch {}
        }

        // Fetch RFQ details to pre-fill (safely handle contract-only flow or missing RFQ)
        let rfqData: Record<string, any> = {};
        if (rfqId && !rfqId.startsWith('contract-')) {
          try {
            const rfq = await rfqService.getById(rfqId);
            if (rfq) rfqData = rfq as Record<string, any>;
          } catch {
            /* Fallback to contract details if RFQ load fails */
          }
        }

        // Fetch company profile
        let profile: Record<string, any> = {};
        try {
          profile = await companySettingsService.getProfile();
          setCompanyProfile(profile);
        } catch {}

        // Build items from RFQ items + quotation items
        // Fetch the full quotation separately — RFQQuotationSummary doesn't include line items
        // Prefer the accepted/shortlisted quotation, fall back to first in array
        const quotationSummary = rfqData.quotations?.find(
          (q: any) => q.status === 'ACCEPTED' || q.status === 'SHORTLISTED'
        ) || rfqData.quotations?.[0];
        let quotation: Record<string, any> | null = quotationSummary || null;
        let quotItems: Array<Record<string, any>> = [];
        if (quotation?.id) {
          try {
            // Fetch full quotation with items — use apiRequest directly since
            // quotation IDs are MongoDB strings, not numbers
            const quot = await apiRequest<any>(`/quotations/${quotation.id}`);
            if (quot) {
              quotation = quot;
              quotItems = quot.items || [];
            }
          } catch {
            // Fallback: use whatever items we have from the summary
            quotItems = (quotation as any)?.items || [];
          }
        }
        const rfqItems = rfqData.lineItems || [];

        // Prefer contract items if available
        const useContractItems = contract?.items && contract.items.length > 0;
        let items: PurchaseRequisitionItem[] = useContractItems 
          ? contract.items.map((ci: any, idx: number) => ({
              itemNo: idx + 1,
              description: ci.itemName || `Item ${idx + 1}`,
              quantity: ci.quantity || 1,
              unit: ci.unit || 'Pcs',
              unitPrice: Number(ci.unitPrice) || 0,
              taxPercent: Number(ci.tax) > 0 ? Math.round((Number(ci.tax) / (Number(ci.unitPrice) * Number(ci.quantity))) * 100) : (contract?.taxPercentage || 0),
              discount: 0,
              total: 0,
            }))
          : rfqItems.map((ri: any, idx: number) => {
              const qi = quotItems.find((i: any) => i.rfqItemId === ri.id);
              return {
                itemNo: idx + 1,
                description: ri.itemName || ri.description || `Item ${idx + 1}`,
                quantity: ri.quantity || 0,
                unit: ri.unit || 'Pcs',
                unitPrice: qi ? Number(qi.unitPrice) : 0,
                taxPercent: 0,
                discount: 0,
                total: 0,
              };
            });

        // Fallback for contract POs with no pre-defined items array
        if (contract && items.length === 0 && (contract.contractValue || contractBalance?.remainingValue)) {
          const availValue = contractBalance?.remainingValue ?? contract.contractValue;
          items = [
            {
              itemNo: 1,
              description: contract.title || `Contract Items (${contract.contractNumber})`,
              quantity: 1,
              unit: 'Lot',
              unitPrice: availValue,
              taxPercent: contract.taxPercentage || 0,
              discount: 0,
              total: 0,
            }
          ];
        }

        // Recalc totals
        items.forEach(i => { i.total = calcItemTotal(i); });

        const vendor = quotation?.vendor || rfqData.vendors?.[0] || contract?.vendor || {};
        const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
        const taxTotal = 0;
        const discountTotal = 0;

        // Build internal notes with contract reference
        const internalNotes = contract 
          ? `Purchase Order from Contract: ${contract.contractNumber}\nContract Value: ${contract.contractValue} ${contract.currency || ''}`
          : '';

        setPr({
          rfqId,
          poNumber: generatePONumber(),
          status: 'DRAFT',
          companyName: branding.companyName,
          companyAddress: profile?.address || '',
          companyPhone: branding.companyPhone || profile?.phone || '',
          companyEmail: branding.companyEmail || profile?.email || '',
          companyWebsite: profile?.website || '',
          vendorName: vendor?.name || vendor?.companyName || contract?.vendor?.name || '',
          vendorAddress: vendor?.address || vendor?.registeredAddress || contract?.vendor?.address || '',
          vendorContactPerson: vendor?.contactPerson || vendor?.name || contract?.vendor?.contactPerson || '',
          vendorPhone: vendor?.phone || vendor?.contactPhone || contract?.vendor?.phone || '',
          vendorEmail: vendor?.email || contract?.vendor?.email || '',
          vendorGstVat: vendor?.gstVat || vendor?.gstNumber || '',
          shipToCompany: branding.companyName,
          shipToWarehouse: '',
          shipToAddress: profile?.address || '',
          shipToContact: '',
          shipToPhone: '',
          poDate: new Date().toISOString().slice(0, 10),
          currency: contract?.currency || rfqData.currency || 'INR',
          requisitioner: '',
          shipVia: 'Surface',
          fob: 'Destination',
          paymentTerms: contract?.paymentTerms || quotation?.paymentTerms || rfqData.paymentTerms || 'Net 30',
          deliveryDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          shippingTerms: contract?.deliveryTerms || contract?.freightTerms || 'FOB Destination',
          items: items.length > 0 ? items : [
            { itemNo: 1, description: '', quantity: 1, unit: 'Pcs', unitPrice: 0, taxPercent: 0, discount: 0, total: 0 },
          ],
          shippingCharges: 0,
          otherCharges: 0,
          internalNotes,
          specialInstructions: '',
          subtotal,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: subtotal,
        });
      } catch (err: any) {
        setError(err?.message || 'Failed to load RFQ data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [rfqId, contractId]);

  // SSE real-time status updates — when PO is approved/rejected, refresh PR status
  useEffect(() => {
    if (!rfqId) return;

    const unsubStatus = sseClient.on('po_status_changed', () => {
      // Re-fetch the PR to get latest status from backend
      purchaseRequisitionService.getByRfqId(rfqId).then(existing => {
        if (existing) setPr(existing);
      }).catch(() => {});
    });

    const unsubPO = sseClient.on('po_created', (payload: unknown) => {
      const event = payload as { poNumber?: string; rfqId?: string };
      // Only refresh if the PO's rfqId matches our PR's rfqId
      if (event?.rfqId && event.rfqId !== rfqId) return;
      purchaseRequisitionService.getByRfqId(rfqId).then(existing => {
        if (existing) setPr(existing);
      }).catch(() => {});
    });

    return () => {
      unsubStatus();
      unsubPO();
    };
  }, [rfqId]);

  // Recalculate totals whenever items change
  const recalc = useCallback((draft: PurchaseRequisition): PurchaseRequisition => {
    const items = draft.items.map(i => ({ ...i, total: calcItemTotal(i) }));
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0);
    const discountTotal = 0;
    const taxTotal = 0;
    const grandTotal = subtotal;
    return { ...draft, items, subtotal, taxTotal, discountTotal, grandTotal, shippingCharges: 0, otherCharges: 0 };
  }, []);

  // Update a field
  const updateField = useCallback(<K extends keyof PurchaseRequisition>(key: K, value: PurchaseRequisition[K]) => {
    if (!pr || isReadOnly) return;
    const draft = { ...pr, [key]: value };
    if (key === 'shippingCharges' || key === 'otherCharges') {
      setPr(recalc(draft));
    } else {
      setPr(draft);
    }
  }, [pr, recalc, isReadOnly]);

  // Handle Warehouse selection from Company Settings Master
  const handleWarehouseChange = useCallback((whId: string) => {
    if (!pr || isReadOnly) return;
    setSelectedWarehouseId(whId);
    const wh = warehouses.find(w => w.id === whId);
    if (wh) {
      const whLabel = `${wh.code} — ${wh.name}`;
      const fullAddress = [wh.address, wh.city, wh.country].filter(Boolean).join(', ');
      setPr(prev => prev ? {
        ...prev,
        shipToWarehouse: whLabel,
        ...(fullAddress ? { shipToAddress: fullAddress } : {}),
        ...(wh.contactPerson ? { shipToContact: wh.contactPerson } : {}),
        ...(wh.phone ? { shipToPhone: wh.phone } : {}),
      } : null);
    } else {
      updateField('shipToWarehouse', '');
    }
  }, [pr, isReadOnly, warehouses, updateField]);

  // Update an item field
  const updateItem = useCallback((index: number, key: keyof PurchaseRequisitionItem, value: any) => {
    if (!pr || isReadOnly) return;
    const items = [...pr.items];
    items[index] = { ...items[index], [key]: value };
    setPr(recalc({ ...pr, items }));
  }, [pr, recalc, isReadOnly]);

  // Add item
  const addItem = useCallback(() => {
    if (!pr || isReadOnly) return;
    const items = [...pr.items, {
      itemNo: pr.items.length + 1,
      description: '',
      quantity: 1,
      unit: 'Pcs',
      unitPrice: 0,
      taxPercent: 0,
      discount: 0,
      total: 0,
    }];
    setPr(recalc({ ...pr, items }));
  }, [pr, recalc, isReadOnly]);

  // Delete item
  const deleteItem = useCallback((index: number) => {
    if (!pr || pr.items.length <= 1 || isReadOnly) return;
    const items = pr.items.filter((_, i) => i !== index).map((item, i) => ({ ...item, itemNo: i + 1 }));
    setPr(recalc({ ...pr, items }));
  }, [pr, recalc, isReadOnly]);

  // ── Validation ──────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    if (!pr) return false;
    const errors: Record<string, string> = {};
    const itemErrors: Record<number, Record<string, string>> = {};

    if (!pr.vendorName.trim()) errors.vendorName = 'Vendor name is required';
    if (!pr.poDate) errors.poDate = 'PO date is required';

    if (pr.items.length === 0) {
      errors.items = 'At least one item is required';
    } else {
      pr.items.forEach((item, idx) => {
        const iErr: Record<string, string> = {};
        if (item.quantity <= 0) iErr.quantity = 'Must be > 0';
        if (item.unitPrice <= 0) iErr.unitPrice = 'Must be > 0';
        if (Object.keys(iErr).length > 0) itemErrors[idx] = iErr;
      });
      if (Object.keys(itemErrors).length > 0) {
        errors.items = 'Some items have invalid values';
      }
    }

    // Contract balance validation: grand total cannot exceed remaining value
    if (contractBalance && pr.grandTotal > contractBalance.remainingValue) {
      errors.contractBalance = `Purchase Order amount (${formatCurrency(pr.grandTotal, pr.currency)}) exceeds the remaining contract value of ${formatCurrency(contractBalance.remainingValue, contractBalance.currency || pr.currency)}. Reduce item quantities or amounts.`;
    }

    setValidationErrors(errors);
    setItemValidationErrors(itemErrors);
    return Object.keys(errors).length === 0;
  }, [pr, contractBalance]);

  // Scroll to first error
  useEffect(() => {
    if (Object.keys(validationErrors).length > 0) {
      const firstErrEl = document.querySelector('.pr-field--error');
      firstErrEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [validationErrors]);

  // Clear errors when user edits fields
  const clearFieldError = useCallback((field: string) => {
    setValidationErrors(prev => {
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
  }, []);

  const clearItemError = useCallback((idx: number, field: string) => {
    setItemValidationErrors(prev => {
      const copy = { ...prev };
      if (copy[idx]) {
        const iCopy = { ...copy[idx] };
        delete iCopy[field];
        if (Object.keys(iCopy).length === 0) delete copy[idx];
        else copy[idx] = iCopy;
      }
      return copy;
    });
  }, []);

  // Save Draft
  const handleSave = async () => {
    if (!pr || isReadOnly) return;
    if (!validate()) {
      setToast({ message: 'Please fix the validation errors before saving.', type: 'error' });
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Include contractId in save payload so backend auto-creates a PurchaseOrder
      const payload = contractId ? { ...pr, contractId } : pr;
      const result = await purchaseRequisitionService.save(payload) as PurchaseRequisition & { createdPO?: { poNumber: string } };
      
      // Update PR state with returned data (includes the new id)
      if (result) {
        setPr(result);
      }

      // Check if a PO was auto-created (backend returns createdPO)
      if (result?.createdPO?.poNumber) {
        setPoCreated(true);
        setToast({ 
          message: `✅ Purchase Order ${result.createdPO.poNumber} created from contract. You can create another PO or send this one to the vendor.`,
          type: 'success' 
        });
      } else {
        setToast({ message: 'Purchase Requisition saved as draft.', type: 'success' });
      }
      setValidationErrors({});
      setItemValidationErrors({});
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to save', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Print — uses the professional PO document
  const handlePrint = () => {
    window.print();
  };

  // Download PDF — capture the React-rendered PO document as a PDF without flashing on screen
  const handleDownloadPdf = async () => {
    if (!pr) return;
    if (!validate()) {
      setToast({ message: 'Please fix the validation errors before downloading PDF.', type: 'error' });
      return;
    }
    setDownloadingPdf(true);
    try {
      await new Promise(r => setTimeout(r, 150));
      await document.fonts?.ready;

      const element = printAreaRef.current;
      if (!element) throw new Error('Print area not available');

      const canvas = await toCanvas(element, {
        quality: 1,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 10; // mm
      const pageWidth = 210; // A4 width mm
      const pageHeight = 297; // A4 height mm
      const contentWidth = pageWidth - margin * 2; // 190 mm

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = contentWidth;
      let calculatedImgHeight = (canvas.height * imgWidth) / canvas.width;
      const usablePageHeight = pageHeight - margin * 2; // 277 mm

      // If document height is slightly over single page usable height (up to 20%), scale height down to fit on 1 single page
      if (calculatedImgHeight > usablePageHeight && calculatedImgHeight <= usablePageHeight * 1.20) {
        calculatedImgHeight = usablePageHeight;
      }

      let remainingHeight = calculatedImgHeight;
      let pageNum = 0;

      // 8mm threshold prevents accidental blank 2nd page caused by tiny margin/footer pixel overflow
      while (remainingHeight > 8) {
        if (pageNum > 0) pdf.addPage();
        const yOffset = margin - pageNum * usablePageHeight;
        pdf.addImage(imgData, 'PNG', margin, yOffset, imgWidth, calculatedImgHeight, undefined, 'FAST');
        remainingHeight -= usablePageHeight;
        pageNum++;
      }

      const fileName = pr.poNumber || `PO-${Date.now()}`;
      pdf.save(`${fileName}.pdf`);
      setToast({ message: `PDF downloaded: ${fileName}.pdf`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to download PDF', type: 'error' });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Submit for Approval (saves + triggers approval workflow + redirects to approvals page)
  const handleSubmitForApproval = async () => {
    if (!pr || isReadOnly) return;
    if (!validate()) {
      setToast({ message: 'Please fix the validation errors before submitting for approval.', type: 'error' });
      return;
    }
    await executeSubmitForApproval(1);
  };

  const [showSendingOverlay, setShowSendingOverlay] = useState(false);

  const executeSubmitForApproval = async (startLevelNumber?: number) => {
    if (!pr) return;
    setSaving(true);
    setShowSendingOverlay(true);
    setError(null);
    try {
      const payload = {
        ...(contractId ? { ...pr, contractId } : pr),
        status: 'PENDING_APPROVAL' as const,
        startLevelNumber,
      };
      const result = await purchaseRequisitionService.save(payload) as PurchaseRequisition & { createdPO?: { poNumber: string } };
      
      const updatedPr = result 
        ? { ...result, status: 'PENDING_APPROVAL' as const } 
        : { ...pr, status: 'PENDING_APPROVAL' as const };
      setPr(updatedPr);
      setValidationErrors({});
      setItemValidationErrors({});

      // 🔔 Instant sync notification across open tabs and windows
      window.dispatchEvent(new CustomEvent('heliflow:po-created', { detail: { poNumber: result?.createdPO?.poNumber || pr.poNumber, status: 'PENDING_APPROVAL' } }));
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
      try {
        const bc = new BroadcastChannel('heliflow_sync');
        bc.postMessage({ type: 'APPROVAL_SUBMITTED', poNumber: result?.createdPO?.poNumber || pr.poNumber, timestamp: Date.now() });
        bc.close();
      } catch {}

      if (result?.createdPO?.poNumber) {
        setPoCreated(true);
        setToast({
          message: `✅ Purchase Order ${result.createdPO.poNumber} submitted for approval. Redirecting to PO Creation page…`,
          type: 'success'
        });
      } else {
        setToast({ message: 'Purchase Requisition submitted for approval. Redirecting to PO Creation page…', type: 'success' });
      }

      setTimeout(() => {
        setShowSendingOverlay(false);
        navigate('/procurement/purchase-requisitions');
      }, 2200);
    } catch (err: any) {
      setShowSendingOverlay(false);
      setToast({ message: err?.message || 'Failed to submit for approval', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (!pr?.id) return;
    setSending(true);
    try {
      await purchaseRequisitionService.sendToVendor(pr.id);
      setToast({ message: `Purchase Order sent to ${sendTo}`, type: 'success' });
      setShowSendModal(false);
    } catch (err: any) {
      setToast({ message: err?.message || 'Failed to send', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="pr-page">
        <div className="pr-page__loading"><Loader2 size={32} className="pr-page__spinner" /> Loading RFQ data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pr-page">
        <div className="pr-page__error">
          <AlertTriangle size={32} />
          <p>{error}</p>
          <button className="pr-btn" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  if (!pr) return null;

  return (
    <div className="pr-page">
      {toast && (
        <MessageStrip type={toast.type} compact autoHideMs={toast.type === 'error' ? 8000 : 5000} onClose={() => setToast(null)}>
          {toast.message}
        </MessageStrip>
      )}

      {/* ── Validation Summary ── */}
      {Object.keys(validationErrors).length > 0 && (
        <div className="pr-validation-summary">
          <AlertTriangle size={16} />
          <span>Please fix the following errors before proceeding:</span>
          <ul>
            {validationErrors.vendorName && <li>Vendor name is required</li>}
            {validationErrors.poDate && <li>PO date is required</li>}
            {validationErrors.items && (
              <li>
                {validationErrors.items === 'Some items have invalid values'
                  ? 'Some items have quantity or unit price with invalid values'
                  : 'At least one item is required'}
              </li>
            )}
            {validationErrors.contractBalance && <li style={{ color: '#dc2626', fontWeight: 600 }}>{validationErrors.contractBalance}</li>}
          </ul>
          <button className="pr-validation-close" onClick={() => { setValidationErrors({}); setItemValidationErrors({}); }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Contract Balance Banner (SAP Fiori Enterprise Edition) ── */}
      {contractBalance && (() => {
        const consumedAfterPo = contractBalance.consumedValue + pr.grandTotal;
        const consumedPct = Math.min(100, (consumedAfterPo / contractBalance.contractValue) * 100);
        const isOver = pr.grandTotal > contractBalance.remainingValue;
        const remainingAfterThisPo = Math.max(0, contractBalance.remainingValue - (isOver ? 0 : pr.grandTotal));
        const maxPOAmount = Math.max(0, contractBalance.remainingValue);

        return (
          <div className={`pr-contract-balance ${isOver ? 'pr-contract-balance--exceeded' : ''}`}>
            <div className="pr-contract-balance__header">
              <div className="pr-contract-balance__header-title">
                <FileCheck size={18} className="pr-sap-header-icon" />
                <span>CONTRACT AGREEMENT</span>
                <span className="pr-contract-chip">{contractData?.contractNumber || 'N/A'}</span>
              </div>
              <div className="pr-contract-balance__header-limit">
                <ShieldAlert size={14} />
                <span>Max PO Limit: <strong>{formatAmount(maxPOAmount, contractBalance.currency || companyDefaultCurrency)}</strong></span>
              </div>
            </div>

            {/* ── Progress Bar ── */}
            <div className="pr-contract-balance__progress-section">
              <div className="pr-contract-balance__progress-labels">
                <span className="pr-contract-balance__progress-label">
                  CONSUMPTION (AFTER THIS PO): {formatAmount(consumedAfterPo, contractBalance.currency || companyDefaultCurrency)}
                </span>
                <span className="pr-contract-balance__progress-pct">
                  {Math.round(consumedPct)}%
                </span>
              </div>
              <div
                className="pr-contract-balance__progress-track"
                role="progressbar"
                aria-valuenow={Math.round(consumedPct)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="pr-contract-balance__progress-fill"
                  style={{
                    width: `${Math.min(100, consumedPct)}%`,
                  }}
                />
              </div>
              <div className="pr-contract-balance__progress-labels pr-contract-balance__progress-labels--sub">
                <span>TOTAL CONTRACT VALUE: {formatAmount(contractBalance.contractValue, contractBalance.currency || companyDefaultCurrency)}</span>
                <span>AVAILABLE REMAINING BALANCE: {formatAmount(remainingAfterThisPo, contractBalance.currency || companyDefaultCurrency)}</span>
              </div>
            </div>

            {/* ── 4 SAP Metric Cards ── */}
            <div className="pr-contract-balance__items">
              <div className="pr-contract-balance__item">
                <div className="pr-contract-balance__item-head">
                  <IndianRupee size={14} className="pr-cb-icon pr-cb-icon--total" />
                  <span className="pr-contract-balance__label">Contract Value</span>
                </div>
                <span className="pr-contract-balance__value">
                  {formatAmount(contractBalance.contractValue, contractBalance.currency || companyDefaultCurrency)}
                </span>
              </div>

              <div className="pr-contract-balance__item">
                <div className="pr-contract-balance__item-head">
                  <PieChart size={14} className="pr-cb-icon pr-cb-icon--consumed" />
                  <span className="pr-contract-balance__label">Already Consumed</span>
                </div>
                <span className="pr-contract-balance__value pr-contract-balance__value--consumed">
                  {formatAmount(contractBalance.consumedValue, contractBalance.currency || companyDefaultCurrency)}
                </span>
              </div>

              <div className="pr-contract-balance__item">
                <div className="pr-contract-balance__item-head">
                  <ShoppingCart size={14} className="pr-cb-icon pr-cb-icon--po" />
                  <span className="pr-contract-balance__label">This PO Amount</span>
                </div>
                <span className={`pr-contract-balance__value pr-contract-balance__value--po ${isOver ? 'pr-contract-balance__value--over' : ''}`}>
                  {formatAmount(pr.grandTotal, contractBalance.currency || companyDefaultCurrency)}
                </span>
              </div>

              <div className="pr-contract-balance__item">
                <div className="pr-contract-balance__item-head">
                  <CheckCircle2 size={14} className="pr-cb-icon pr-cb-icon--remaining" />
                  <span className="pr-contract-balance__label">Remaining Balance</span>
                </div>
                <span className={`pr-contract-balance__value pr-contract-balance__value--remaining ${remainingAfterThisPo <= 0 ? 'pr-contract-balance__value--exhausted' : ''}`}>
                  {formatAmount(remainingAfterThisPo, contractBalance.currency || companyDefaultCurrency)}
                </span>
              </div>
            </div>

            {/* Warnings */}
            {isOver && (
              <div className="pr-contract-balance__warning">
                <AlertCircle size={15} />
                <span>PO amount exceeds remaining contract value by {formatAmount(pr.grandTotal - contractBalance.remainingValue, contractBalance.currency || companyDefaultCurrency)}. Reduce PO items or amounts.</span>
              </div>
            )}
            {!isOver && consumedPct >= 80 && consumedPct < 100 && (
              <div className="pr-contract-balance__warning pr-contract-balance__warning--caution">
                <AlertCircle size={15} />
                <span>Warning: This PO will consume {Math.round(consumedPct)}% of the total contract value. Only {formatAmount(remainingAfterThisPo, contractBalance.currency || companyDefaultCurrency)} will remain.</span>
              </div>
            )}
            {contractBalance.remainingValue <= 0 && (
              <div className="pr-contract-balance__warning pr-contract-balance__warning--exhausted">
                <AlertCircle size={15} />
                <span>Contract value is fully consumed. No further purchase orders can be created from this contract.</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Top Toolbar ── */}
      <div className="pr-toolbar">
        <button className="pr-toolbar__back" onClick={() => navigate(-1)} title="Go Back">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="pr-toolbar__title">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShoppingCart size={18} />
          </div>
          <span className="pr-toolbar__title-text">PO Creation</span>
          {pr.poNumber && <span className="pr-toolbar__po-num">#{pr.poNumber}</span>}
          <span className={`pr-badge pr-badge--${pr.status}`}>{getStatusLabel(pr.status)}</span>
          {isReadOnly && (
            <span className="pr-badge pr-badge--view-only">
              <Eye size={13} /> VIEW ONLY
            </span>
          )}
        </div>
        <div className="pr-toolbar__actions">
          {!isReadOnly && (
            <button
              className="pr-btn pr-btn--outline"
              onClick={canCreatePO ? handleSave : undefined}
              disabled={saving || !canCreatePO || (contractBalance ? pr.grandTotal > contractBalance.remainingValue : false)}
              style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
              title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to save draft POs." : undefined}
            >
              {contractBalance && pr.grandTotal > contractBalance.remainingValue ? 'Amount Exceeds Limit' : <><Save size={16} /> {saving ? 'Saving…' : 'Save Draft'}</>}
            </button>
          )}
          <button className="pr-btn pr-btn--outline" onClick={handlePrint}>
            <Printer size={16} /> Print
          </button>
          <button className="pr-btn pr-btn--outline" onClick={handleDownloadPdf} disabled={downloadingPdf}>
            <Download size={16} /> {downloadingPdf ? 'Downloading…' : 'Download PDF'}
          </button>
          {!isReadOnly && (
            <button
              className="pr-btn pr-btn--primary"
              onClick={canCreatePO ? handleSubmitForApproval : undefined}
              disabled={saving || !canCreatePO || (contractBalance && pr.grandTotal > contractBalance.remainingValue)}
              style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
              title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to submit POs." : undefined}
            >
              {contractBalance && pr.grandTotal > contractBalance.remainingValue
                ? 'PO Exceeds Contract Limit'
                : <><Send size={16} /> {saving ? 'Submitting…' : 'Send for Approval'}</>}
            </button>
          )}
          {poCreated && !isReadOnly && (
            <button
              className="pr-btn pr-btn--outline"
              disabled={!canCreatePO}
              style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
              title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to create POs." : undefined}
              onClick={() => {
                if (!canCreatePO) return;
                // Re-fetch balance and reset for another PO
                setPoCreated(false);
                if (contractId) {
                  contractService.getContractBalance(contractId).then(setContractBalance).catch(() => {});
                }
                setPr(prev => prev ? {
                  ...prev,
                  poNumber: generatePONumber(),
                  status: 'DRAFT',
                  // Reset items to one blank row — don't replicate previous PO items
                  items: [
                    { itemNo: 1, description: '', quantity: 1, unit: 'Pcs', unitPrice: 0, taxPercent: 0, discount: 0, total: 0 },
                  ],
                  subtotal: 0,
                  taxTotal: 0,
                  discountTotal: 0,
                  grandTotal: 0,
                  shippingCharges: 0,
                  otherCharges: 0,
                  internalNotes: `Previous PO ${prev.poNumber} already created. Creating another PO from remaining contract value.`,
                } : prev);
                setToast({ message: 'Ready to create another PO. Items are empty — add items as needed. Contract balance shown above.', type: 'success' });
              }}
            >
              <Plus size={16} /> Create Another PO
            </button>
          )}
        </div>
      </div>

      {/* ── SAP Fiori Key Metrics (KPI Bar) ── */}
      <div className="pr-kpi-summary">
        <div className="pr-kpi-card">
          <div className="pr-kpi-icon"><Hash size={20} /></div>
          <div className="pr-kpi-info">
            <span className="pr-kpi-label">Line Items</span>
            <span className="pr-kpi-value">{pr.items.length} Item{pr.items.length > 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="pr-kpi-card">
          <div className="pr-kpi-icon"><DollarSign size={20} /></div>
          <div className="pr-kpi-info">
            <span className="pr-kpi-label">Subtotal (Net)</span>
            <span className="pr-kpi-value">{formatAmount(pr.subtotal, pr.currency || companyDefaultCurrency)}</span>
          </div>
        </div>

        <div className="pr-kpi-card">
          <div className="pr-kpi-icon"><Percent size={20} /></div>
          <div className="pr-kpi-info">
            <span className="pr-kpi-label">Tax & Charges</span>
            <span className="pr-kpi-value">
              {formatAmount(pr.taxTotal + (pr.shippingCharges || 0) + (pr.otherCharges || 0), pr.currency || companyDefaultCurrency)}
            </span>
          </div>
        </div>

        <div className="pr-kpi-card">
          <div className="pr-kpi-icon pr-kpi-icon--grand"><Calculator size={20} /></div>
          <div className="pr-kpi-info">
            <span className="pr-kpi-label">Grand Total</span>
            <span className="pr-kpi-value pr-kpi-value--grand">{formatAmount(pr.grandTotal, pr.currency || companyDefaultCurrency)}</span>
          </div>
        </div>
      </div>

      <div className="pr-content">
        {/* ── Company Details ── */}
        <section className="pr-section">
          <div className="pr-section__header"><Building2 size={16} /> Company Details</div>
          <div className="pr-section__grid pr-section__grid--2col">
            <div className="pr-field"><label>Company Name</label><input value={pr.companyName} disabled={isReadOnly} onChange={e => updateField('companyName', e.target.value)} /></div>
            <div className="pr-field"><label>Website</label><input value={pr.companyWebsite} disabled={isReadOnly} onChange={e => updateField('companyWebsite', e.target.value)} /></div>
            <div className="pr-field pr-field--wide"><label>Address</label><input value={pr.companyAddress} disabled={isReadOnly} onChange={e => updateField('companyAddress', e.target.value)} /></div>
            <div className="pr-field"><label>Phone</label><input value={pr.companyPhone} disabled={isReadOnly} onChange={e => updateField('companyPhone', e.target.value)} /></div>
            <div className="pr-field"><label>Email</label><input value={pr.companyEmail} disabled={isReadOnly} onChange={e => updateField('companyEmail', e.target.value)} /></div>
          </div>
        </section>

        {/* ── Vendor Details ── */}
        <section className="pr-section">
          <div className="pr-section__header"><Building2 size={16} /> Vendor Details</div>
          {!isReadOnly && !rfqId && !contractId && !(pr as any)?.rfqId && !(pr as any)?.contractId && (
            <div className="pr-field pr-field--wide" style={{ marginBottom: 16 }}>
              <label>Select Registered Vendor from Master</label>
              <select
                className="pr-select"
                style={{ width: '100%' }}
                onChange={(e) => {
                  const v = vendorsList.find(item => item.id === e.target.value);
                  if (v) {
                    setPr(prev => prev ? {
                      ...prev,
                      vendorName: v.name,
                      vendorEmail: v.email || prev.vendorEmail,
                      vendorPhone: v.phone || prev.vendorPhone,
                      vendorContactPerson: v.contactPerson || prev.vendorContactPerson,
                      vendorAddress: v.address || prev.vendorAddress,
                      vendorGstVat: v.gstNumber || v.panNumber || prev.vendorGstVat,
                    } : prev);
                    clearFieldError('vendorName');
                  }
                }}
              >
                <option value="">-- Choose Vendor from Database Master --</option>
                {vendorsList.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.email ? `(${v.email})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="pr-section__grid pr-section__grid--2col">
            <div className={`pr-field ${validationErrors.vendorName ? 'pr-field--error' : ''}`}>
              <label>Company Name {!isReadOnly && <span className="pr-required">*</span>}</label>
              <input value={pr.vendorName} disabled={isReadOnly} onChange={e => { updateField('vendorName', e.target.value); clearFieldError('vendorName'); }} />
              {validationErrors.vendorName && <span className="pr-field__error-msg">{validationErrors.vendorName}</span>}
            </div>
            <div className="pr-field"><label>Contact Person</label><input value={pr.vendorContactPerson} disabled={isReadOnly} onChange={e => updateField('vendorContactPerson', e.target.value)} /></div>
            <div className="pr-field pr-field--wide"><label>Address</label><input value={pr.vendorAddress} disabled={isReadOnly} onChange={e => updateField('vendorAddress', e.target.value)} /></div>
            <div className="pr-field"><label>Phone</label><input value={pr.vendorPhone} disabled={isReadOnly} onChange={e => updateField('vendorPhone', e.target.value)} /></div>
            <div className="pr-field"><label>Email</label><input value={pr.vendorEmail} disabled={isReadOnly} onChange={e => updateField('vendorEmail', e.target.value)} /></div>
            <div className="pr-field"><label>GST/VAT</label><input value={pr.vendorGstVat} disabled={isReadOnly} onChange={e => updateField('vendorGstVat', e.target.value)} /></div>
          </div>
        </section>

        {/* ── Ship To ── */}
        <section className="pr-section">
          <div className="pr-section__header"><Truck size={16} /> Ship To</div>
          <div className="pr-section__grid pr-section__grid--2col">
            <div className="pr-field"><label>Company</label><input value={pr.shipToCompany} disabled={isReadOnly} onChange={e => updateField('shipToCompany', e.target.value)} /></div>
            <div className="pr-field">
              <label>Warehouse</label>
              {warehouses.length > 0 && !isReadOnly ? (
                <select
                  className="pr-select"
                  style={{ width: '100%' }}
                  value={
                    warehouses.find(w => `${w.code} — ${w.name}` === pr.shipToWarehouse || w.name === pr.shipToWarehouse || w.id === selectedWarehouseId)?.id || ''
                  }
                  disabled={isReadOnly}
                  onChange={e => handleWarehouseChange(e.target.value)}
                >
                  <option value="">-- Select Warehouse from Company Settings --</option>
                  {warehouses.map((wh) => (
                    <option key={wh.id} value={wh.id}>
                      {wh.code} — {wh.name} {wh.city ? `(${wh.city})` : ''} {wh.isDefault ? '★ Default' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={pr.shipToWarehouse}
                  disabled={isReadOnly}
                  placeholder="Enter warehouse name..."
                  onChange={e => updateField('shipToWarehouse', e.target.value)}
                />
              )}
            </div>
            <div className="pr-field pr-field--wide"><label>Address</label><input value={pr.shipToAddress} disabled={isReadOnly} onChange={e => updateField('shipToAddress', e.target.value)} /></div>
            <div className="pr-field"><label>Contact</label><input value={pr.shipToContact} disabled={isReadOnly} onChange={e => updateField('shipToContact', e.target.value)} /></div>
            <div className="pr-field"><label>Phone</label><input value={pr.shipToPhone} disabled={isReadOnly} onChange={e => updateField('shipToPhone', e.target.value)} /></div>
          </div>
        </section>

        {/* ── PO Details ── */}
        <section className="pr-section">
          <div className="pr-section__header"><ClipboardList size={16} /> Purchase Order Details</div>
          <div className="pr-section__grid pr-section__grid--3col">
            <div className="pr-field"><label>PO Number</label><input value={pr.poNumber || ''} disabled={isReadOnly} onChange={e => updateField('poNumber', e.target.value)} className="pr-field--auto" title="Auto-generated. You can edit if needed." /></div>
            <div className={`pr-field ${validationErrors.poDate ? 'pr-field--error' : ''}`}>
              <label>PO Date {!isReadOnly && <span className="pr-required">*</span>}</label>
              <input type="date" value={pr.poDate} disabled={isReadOnly} onChange={e => { updateField('poDate', e.target.value); clearFieldError('poDate'); }} />
              {validationErrors.poDate && <span className="pr-field__error-msg">{validationErrors.poDate}</span>}
            </div>
            <div className="pr-field">
              <label>Currency</label>
              <CurrencySelector
                value={pr.currency}
                disabled={isReadOnly}
                onChange={(code) => updateField('currency', code)}
              />
            </div>
            <div className="pr-field"><label>Requisitioner</label><input value={pr.requisitioner} disabled={isReadOnly} onChange={e => updateField('requisitioner', e.target.value)} /></div>
            <div className="pr-field"><label>Ship Via</label>
              <select value={pr.shipVia} disabled={isReadOnly} onChange={e => updateField('shipVia', e.target.value)}>
                <option>Surface</option>
                <option>Air</option>
                <option>Sea</option>
                <option>Courier</option>
              </select>
            </div>
            <div className="pr-field"><label>FOB</label>
              <select value={pr.fob} disabled={isReadOnly} onChange={e => updateField('fob', e.target.value)}>
                <option>Origin</option>
                <option>Destination</option>
              </select>
            </div>
            <div className="pr-field"><label>Payment Terms</label>
              <select value={pr.paymentTerms} disabled={isReadOnly} onChange={e => updateField('paymentTerms', e.target.value)}>
                <option>Net 15</option>
                <option>Net 30</option>
                <option>Net 45</option>
                <option>Net 60</option>
                <option>Cash on Delivery</option>
                <option>Advance Payment</option>
              </select>
            </div>
            <div className="pr-field"><label>Delivery Date</label><input type="date" value={pr.deliveryDate} disabled={isReadOnly} onChange={e => updateField('deliveryDate', e.target.value)} /></div>
            <div className="pr-field"><label>Shipping Terms</label>
              <select value={pr.shippingTerms} disabled={isReadOnly} onChange={e => updateField('shippingTerms', e.target.value)}>
                <option>FOB Origin</option>
                <option>FOB Destination</option>
                <option>CIF</option>
                <option>CIP</option>
                <option>DDP</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Items Table ── */}
        <section className="pr-section">
          <div className="pr-section__header">
            <Hash size={16} /> Items
            {!isReadOnly && (
              <button
                className="pr-btn pr-btn--sm pr-btn--ghost"
                onClick={canCreatePO ? addItem : undefined}
                disabled={!canCreatePO}
                style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to add items." : undefined}
              >
                <Plus size={14} /> Add Item
              </button>
            )}
          </div>
          <div className="pr-items-table-wrap">
            <table className="pr-items-table">
              <colgroup>
                <col className="pr-col--no" />
                <col className="pr-col--desc" />
                <col className="pr-col--num" />
                <col className="pr-col--unit" />
                <col className="pr-col--price" />
                <col className="pr-col--total" />
                {!isReadOnly && <col className="pr-col--action" />}
              </colgroup>
              <thead>
                <tr>
                  <th className="pr-th--no">#</th>
                  <th className="pr-th--desc">Description</th>
                  <th className="pr-th--num">Qty {!isReadOnly && <span className="pr-required">*</span>}</th>
                  <th className="pr-th--unit">Unit</th>
                  <th className="pr-th--price">Unit Price {!isReadOnly && <span className="pr-required">*</span>}</th>
                  <th className="pr-th--total">Total</th>
                  {!isReadOnly && <th className="pr-th--action"></th>}
                </tr>
              </thead>
              <tbody>
                {pr.items.map((item, idx) => (
                  <tr key={idx} className={itemValidationErrors[idx] ? 'pr-item--error-row' : ''}>
                    <td className="pr-td--no">{item.itemNo}</td>
                    <td className="pr-td--desc"><input value={item.description} disabled={isFormDisabled} onChange={e => updateItem(idx, 'description', e.target.value)} placeholder="Item description" /></td>
                    <td className={`pr-td--num ${itemValidationErrors[idx]?.quantity ? 'pr-item__cell--error' : ''}`}>
                      <input type="number" min="1" value={item.quantity === 0 ? '' : item.quantity} disabled={isFormDisabled}
                        onChange={e => { updateItem(idx, 'quantity', e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))); clearItemError(idx, 'quantity'); }}
                      />
                      {itemValidationErrors[idx]?.quantity && <span className="pr-field__error-msg">{itemValidationErrors[idx].quantity}</span>}
                    </td>
                    <td className="pr-td--unit">
                      <select value={item.unit} disabled={isFormDisabled} onChange={e => updateItem(idx, 'unit', e.target.value)}>
                        <option>Pcs</option><option>Kg</option><option>Ltr</option><option>Mtr</option><option>Box</option><option>Set</option>
                      </select>
                    </td>
                    <td className={`pr-td--num ${itemValidationErrors[idx]?.unitPrice ? 'pr-item__cell--error' : ''}`}>
                      <input type="number" min="0" step="1" placeholder="0" value={item.unitPrice === 0 ? '' : item.unitPrice} disabled={isFormDisabled}
                        onChange={e => { updateItem(idx, 'unitPrice', e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))); clearItemError(idx, 'unitPrice'); }}
                      />
                      {itemValidationErrors[idx]?.unitPrice && <span className="pr-field__error-msg">{itemValidationErrors[idx].unitPrice}</span>}
                    </td>
                    <td className="pr-td--total">{formatCurrency(item.total, pr.currency)}</td>
                    {!isReadOnly && (
                      <td className="pr-td--action">
                        <button
                          className="pr-item__delete"
                          onClick={canCreatePO ? () => deleteItem(idx) : undefined}
                          disabled={pr.items.length <= 1 || !canCreatePO}
                          style={!canCreatePO ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'auto' } : undefined}
                          title={!canCreatePO ? "Admin has not allowed this action. You do not have permission to delete items." : undefined}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Notes & Totals Split Grid ── */}
        <div className="pr-bottom-grid">
          {/* ── Notes ── */}
          <section className="pr-section">
            <div className="pr-section__header"><FileText size={16} /> Notes</div>
            <div className="pr-section__grid pr-section__grid--1col">
              <div className="pr-field pr-field--wide">
                <label>Internal Notes</label>
                <textarea rows={3} value={pr.internalNotes} disabled={isReadOnly} onChange={e => updateField('internalNotes', e.target.value)} placeholder="Internal notes for procurement team..." />
              </div>
              <div className="pr-field pr-field--wide">
                <label>Special Instructions</label>
                <textarea rows={3} value={pr.specialInstructions} disabled={isReadOnly} onChange={e => updateField('specialInstructions', e.target.value)} placeholder="Special instructions for vendor..." />
              </div>
            </div>
          </section>

          {/* ── Totals ── */}
          <section className="pr-section pr-section--totals">
            <div className="pr-section__header"><Calculator size={16} /> Totals</div>
            <div className="pr-totals">
              <div className="pr-totals__grid">
                <div className="pr-total-row"><span>Subtotal</span><span>{formatCurrency(pr.subtotal, pr.currency)}</span></div>
                <div className={`pr-total-row pr-total-row--grand ${contractBalance && pr.grandTotal > contractBalance.remainingValue ? 'pr-total-row--exceeded' : ''}`}>
                  <span>
                    Grand Total
                    {contractBalance && pr.grandTotal > contractBalance.remainingValue && (
                      <span className="pr-total-row__limit-warning" style={{ display: 'block', fontSize: 12, fontWeight: 400, color: '#dc2626', marginTop: 2 }}>
                        Exceeds remaining value by {formatCurrency(pr.grandTotal - contractBalance.remainingValue, contractBalance.currency || pr.currency)}
                      </span>
                    )}
                  </span>
                  <span>
                    {formatCurrency(pr.grandTotal, pr.currency)}
                    {contractBalance && (
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: (contractBalance.remainingValue - pr.grandTotal) >= 0 ? '#059669' : '#dc2626', marginTop: 2 }}>
                        Remaining: {formatCurrency(Math.max(0, contractBalance.remainingValue - (pr.grandTotal > contractBalance.remainingValue ? 0 : pr.grandTotal)), contractBalance.currency || pr.currency)}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Send to Vendor Modal ── */}
      {/* ── Hidden Background Print / PDF Area ── */}
      <div
        ref={printAreaRef}
        className="po-print-area"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '794px',
          background: '#ffffff',
          zIndex: -9999,
          opacity: 1,
          pointerEvents: 'none',
          padding: '40px 48px',
        }}
      >
        {pr && <PurchaseOrderDocument pr={pr} />}
      </div>

      {/* ── Send to Vendor Modal (only after approval) ── */}
      {showSendModal && (
        <div className="pr-modal-backdrop" onClick={() => !sending && setShowSendModal(false)}>
          <div className="pr-send-modal" onClick={e => e.stopPropagation()}>
            <div className="pr-send-modal__header">
              <span><Send size={18} /> Send to Vendor</span>
              <button className="pr-send-modal__close" onClick={() => setShowSendModal(false)} disabled={sending}><X size={18} /></button>
            </div>
            <div className="pr-send-modal__body">
              <div className="pr-field"><label>To</label><input value={sendTo} onChange={e => setSendTo(e.target.value)} /></div>
              <div className="pr-field"><label>CC</label><input value={sendCc} onChange={e => setSendCc(e.target.value)} placeholder="Optional" /></div>
              <div className="pr-field"><label>Subject</label><input value={sendSubject} onChange={e => setSendSubject(e.target.value)} /></div>
              <div className="pr-field pr-field--wide"><label>Message</label><textarea rows={5} value={sendMessage} onChange={e => setSendMessage(e.target.value)} /></div>
              <p className="pr-send-modal__note">
                The professional Purchase Order PDF will be automatically attached when sent. Make sure to save your changes first.
              </p>
            </div>
            <div className="pr-send-modal__footer">
              <button className="pr-btn pr-btn--outline" onClick={() => setShowSendModal(false)} disabled={sending}>Cancel</button>
              <button className="pr-btn pr-btn--primary" onClick={handleSend} disabled={sending || !sendTo.trim()}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ActionSendingOverlay
        isOpen={showSendingOverlay}
        docType="po"
        docNumber={pr?.poNumber}
        vendorName={pr?.vendorName}
        amount={pr?.grandTotal}
        currency={pr?.currency || 'INR'}
        mode="approval"
      />
    </div>
  );
}
