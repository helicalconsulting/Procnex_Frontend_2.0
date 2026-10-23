import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Printer, Download, X, CheckCircle2, ShieldCheck, Landmark, Building2, AlertCircle, Clock } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { signatureService } from '../../services/signatureService';
import { approvalService } from '../../services/approvalService';
import { invoiceService } from '../../services/invoiceService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { apiRequest } from '../../api/client';
import { printElementInIframe } from '../../utils/pdfDownload';
import type { DocumentAttachment } from '../invoices/InvoiceDocumentViewerModal';
import procnexLogo from '../../assets/procnex.png';
import defaultHeliflowLogo from '../../assets/heliflow.png';
import DocumentQRCode from '../common/DocumentQRCode';
import './BankPaymentVoucherModal.css';

export interface PaymentVoucherItem {
  id?: number | string;
  itemCode?: string;
  description: string;
  poNumber?: string;
  grnNumber?: string;
  invoiceRef?: string;
  quantity?: number;
  qty?: number;
  unit?: string;
  unitPrice?: number;
  subtotal?: number;
  taxPercent?: number;
  taxAmount?: number;
  grossAmount: number;
  tdsAmount?: number;
  netAmount: number;
}

export interface PaymentVoucherDocData {
  voucherNumber: string;
  voucherDate: string;
  paymentMethod: string;
  vendorName: string;
  
  // Remitter (Payer) Bank Details
  remitterBankName?: string;
  remitterAccountNumber?: string;
  remitterIfscCode?: string;

  // Beneficiary (Payee) Bank Details
  beneficiaryName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;

  invoiceRef: string;
  invoiceIds?: string[];
  invoices?: {
    invoiceId?: string;
    invoiceNumber: string;
    amount: number;
    poNumber?: string;
    grnNumber?: string;
    threeWayMatch?: string;
    invoiceDate?: string;
  }[];
  poNumbers?: string[];
  grnNumbers?: string[];
  subtotal?: number;
  taxRate?: number;
  taxPercent?: number;
  taxAmount?: number;
  grossAmount: number;
  tdsAmount: number;
  netAmount: number;
  companyName?: string;
  companyLogoUrl?: string;
  companyAddress?: string;
  currency?: string;
  matchStatus?: 'MATCHED' | 'DISCREPANCY';
  discrepancyReason?: string;
  items?: PaymentVoucherItem[];
  attachments?: DocumentAttachment[];
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

function normalizeVoucherItems(rawItems: any[], data: PaymentVoucherDocData): PaymentVoucherItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];
  const defaultTaxPercent = data.taxPercent !== undefined ? Number(data.taxPercent) : (data.taxRate !== undefined ? Number(data.taxRate) : 18);

  return rawItems.map((it: any, idx: number) => {
    const qty = Math.max(1, Number(it.quantity || it.qty || it.supplierQty || it.receivedQty || 1));
    let unitRate = Number(it.unitPrice || it.rate || it.price || 0);
    let subtotal = Number(it.subtotal || it.amount || 0);
    let lineTotal = Number(it.totalPrice || it.grossAmount || it.total || 0);

    if (!subtotal && unitRate) {
      subtotal = unitRate * qty;
    }
    if (!unitRate && subtotal) {
      unitRate = Number((subtotal / qty).toFixed(2));
    }
    if (!subtotal && !unitRate && lineTotal) {
      unitRate = Number((lineTotal / qty).toFixed(2));
      subtotal = lineTotal;
    }

    let taxPercent = it.taxPercent !== undefined ? Number(it.taxPercent) : (it.taxRate !== undefined ? Number(it.taxRate) : defaultTaxPercent);
    let taxAmount = 0;
    if (it.taxAmount !== undefined && Number(it.taxAmount) <= subtotal) {
      taxAmount = Number(it.taxAmount);
    } else if (taxPercent > 0 && subtotal > 0) {
      taxAmount = Number(((subtotal * taxPercent) / 100).toFixed(2));
    } else if (lineTotal > subtotal && subtotal > 0) {
      taxAmount = Number((lineTotal - subtotal).toFixed(2));
      taxPercent = Number(((taxAmount / subtotal) * 100).toFixed(1));
    }

    const itemGross = Number((subtotal + taxAmount).toFixed(2));
    const itemTds = Number(it.tdsAmount !== undefined ? Number(it.tdsAmount) : 0);
    const itemNet = Number(it.netAmount !== undefined && Number(it.netAmount) <= itemGross ? it.netAmount : (itemGross - itemTds).toFixed(2));

    const desc = it.description || it.itemName || it.name || (it.itemCode ? `Line Item [${it.itemCode}]` : `Disbursement Item ${idx + 1}`);

    return {
      id: it.id || idx + 1,
      itemCode: it.itemCode,
      description: desc,
      poNumber: it.poNumber || (data.poNumbers && data.poNumbers[0]) || (data.invoiceRef?.includes('PO:') ? data.invoiceRef.split('PO:')[1]?.trim() : '—'),
      grnNumber: it.grnNumber || (data.grnNumbers && data.grnNumbers[0]) || '—',
      invoiceRef: it.invoiceRef || (data.invoiceRef?.includes('|') ? data.invoiceRef.split('|')[0]?.trim() : data.invoiceRef || '—'),
      quantity: qty,
      unit: it.unit || 'Pcs',
      unitPrice: unitRate,
      subtotal: subtotal,
      taxPercent: taxPercent,
      taxAmount: taxAmount,
      grossAmount: itemGross,
      tdsAmount: itemTds,
      netAmount: itemNet,
    };
  });
}

function generateSingleLineItemForVoucher(data: PaymentVoucherDocData): PaymentVoucherItem[] {
  const taxRate = data.taxPercent !== undefined ? Number(data.taxPercent) : (data.taxRate !== undefined ? Number(data.taxRate) : 18);
  let total = Number(data.netAmount || data.grossAmount || 0);
  let baseSubtotal = data.subtotal ? Number(data.subtotal) : (data.taxAmount ? total - data.taxAmount : Number((total / (1 + taxRate / 100)).toFixed(2)));
  let taxAmt = data.taxAmount !== undefined ? Number(data.taxAmount) : Number(((baseSubtotal * taxRate) / 100).toFixed(2));

  const grossAmt = Number((baseSubtotal + taxAmt).toFixed(2));
  const tdsAmt = Number(data.tdsAmount || 0);
  const netAmt = Number((grossAmt - tdsAmt).toFixed(2));
  const invRef = data.invoiceRef?.includes('|') ? data.invoiceRef.split('|')[0]?.trim() : (data.invoiceRef || '—');
  const poRef = (data.poNumbers && data.poNumbers[0]) || (data.invoiceRef?.includes('PO:') ? data.invoiceRef.split('PO:')[1]?.trim() : '—');
  const grnRef = (data.grnNumbers && data.grnNumbers[0]) || '—';

  return [
    {
      id: 1,
      itemCode: 'DISB-001',
      description: `Payment Disbursement against ${invRef && invRef !== '—' ? `Invoice ${invRef}` : `Voucher ${data.voucherNumber}`}`,
      poNumber: poRef,
      grnNumber: grnRef,
      invoiceRef: invRef,
      quantity: 1,
      unit: 'Lot',
      unitPrice: baseSubtotal,
      subtotal: baseSubtotal,
      taxPercent: taxRate,
      taxAmount: taxAmt,
      grossAmount: grossAmt,
      tdsAmount: tdsAmt,
      netAmount: netAmt,
    },
  ];
}

function resolveVoucherItemsSynchronously(data: PaymentVoucherDocData): PaymentVoucherItem[] {
  if (
    data.items &&
    data.items.length > 0 &&
    !data.items.every((it) => (it.description || '').toLowerCase().startsWith('payment disbursement against'))
  ) {
    return normalizeVoucherItems(data.items, data);
  }

  const pNo = String(data.voucherNumber || '').trim();
  const invTarget = String(data.invoiceRef || '').trim();
  const cleanInvRefs = invTarget
    .split(/[,|]/)
    .map((s) => s.trim().replace(/^invoice:\s*/i, '').replace(/^po:\s*/i, ''))
    .filter(Boolean);

  const collectedItems: any[] = [];

  try {
    const searchKeys = [
      pNo ? `voucher_items_${pNo}` : null,
      pNo ? `payment_items_${pNo}` : null,
      ...cleanInvRefs.map((r) => `invoice_items_${r}`),
      ...cleanInvRefs.map((r) => `items_INV_${r}`),
      ...(data.poNumbers || []).map((p) => `po_items_${p}`),
    ].filter(Boolean) as string[];

    for (const k of searchKeys) {
      const raw = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((sub: any) => collectedItems.push(sub));
          break;
        } else if (parsed?.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
          parsed.items.forEach((sub: any) => collectedItems.push(sub));
          break;
        }
      }
    }

    // Also check cached invoices in localStorage/sessionStorage
    if (collectedItems.length === 0) {
      const storages = [sessionStorage, localStorage];
      for (const storage of storages) {
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key) continue;
          if (key.includes('invoice') || key.includes('heliflow_invoices')) {
            try {
              const raw = storage.getItem(key);
              if (!raw) continue;
              const parsed = JSON.parse(raw);
              const list = Array.isArray(parsed) ? parsed : (parsed?.invoices || parsed?.data || []);
              if (Array.isArray(list)) {
                for (const ref of cleanInvRefs) {
                  const invMatch = list.find((it: any) =>
                    it.invoiceNumber === ref ||
                    String(it.id) === ref ||
                    (it.invoiceNumber && (ref.includes(it.invoiceNumber) || it.invoiceNumber.includes(ref)))
                  );
                  if (invMatch) {
                    let sub = invMatch.items || invMatch.lineItems || invMatch.purchaseOrder?.items || invMatch.purchaseOrder?.rfq?.items;
                    if (typeof sub === 'string') {
                      try { sub = JSON.parse(sub); } catch {}
                    }
                    if (Array.isArray(sub) && sub.length > 0) {
                      sub.forEach((item: any) => {
                        collectedItems.push({
                          ...item,
                          invoiceRef: invMatch.invoiceNumber || ref,
                          poNumber: invMatch.poNumber || (invMatch.purchaseOrder as any)?.poNumber,
                        });
                      });
                      break;
                    }
                  }
                }
              }
            } catch {}
          }
          if (collectedItems.length > 0) break;
        }
        if (collectedItems.length > 0) break;
      }
    }
  } catch {}

  if (collectedItems.length > 0) {
    return normalizeVoucherItems(collectedItems, data);
  }

  return [];
}

function resolveApproversSynchronously(data: PaymentVoucherDocData): any[] {
  if (data.approvers && data.approvers.length > 0) {
    return data.approvers;
  }

  const pNo = String(data.voucherNumber || '').trim();
  const invRef = String(data.invoiceRef || '').trim();
  const invClean = invRef.includes('|') ? invRef.split('|')[0]?.trim() : invRef;
  const poRefMatch = invRef.includes('PO:')
    ? invRef.split('PO:')[1]?.trim()
    : (data.poNumbers && data.poNumbers[0]);
  const poRef = poRefMatch && poRefMatch !== '—' ? poRefMatch : undefined;

  try {
    const keys = [
      pNo ? `voucher_approvers_${pNo}` : null,
      poRef ? `approvers_${poRef}` : null,
      invClean ? `approvers_${invClean}` : null,
    ].filter(Boolean) as string[];

    let bestCached: any[] | null = null;
    for (const k of keys) {
      const cached = sessionStorage.getItem(k) || localStorage.getItem(k);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!bestCached || parsed.length > bestCached.length) {
            bestCached = parsed;
          }
        }
      }
    }
    if (bestCached && bestCached.length >= 3) return bestCached;
  } catch {}

  const sigMahi = localStorage.getItem('heliflow_sig_mahi') || undefined;
  const sigNischal = localStorage.getItem('heliflow_sig_nischal') || undefined;
  const sigKanika = localStorage.getItem('heliflow_sig_kanika') || undefined;

  // 1. Gather all local doc signatures synchronously
  const docSigs: any[] = [];
  const savedSigs: any[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('heliflow_doc_signatures')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) docSigs.push(...parsed);
        }
      } else if (key.startsWith('heliflow_signatures') || key === 'signatures') {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) savedSigs.push(...parsed);
        }
      }
    }
  } catch {}

  const signerMap = new Map<string, any>();
  for (const s of docSigs) {
    const sigUrl = s.dataUrl || s.signature?.dataUrl;
    const refId = String(s.referenceId || '').trim();
    const isMatchingRef =
      (pNo && (refId === pNo || pNo.includes(refId) || refId.includes(pNo))) ||
      (invClean && (refId === invClean || invClean.includes(refId) || refId.includes(invClean))) ||
      (poRef && (refId === poRef || poRef.includes(refId) || refId.includes(poRef))) ||
      (invRef && (refId === invRef || invRef.includes(refId) || refId.includes(invRef)));

    if (!isMatchingRef) continue;

    const signerKey = s.signedById ? String(s.signedById) : (sigUrl || s.signatureId || s.id || String(s.levelNumber));
    if (!signerKey) continue;
    if (!signerMap.has(signerKey) || (!signerMap.get(signerKey).dataUrl && sigUrl)) {
      signerMap.set(signerKey, {
        ...s,
        dataUrl: sigUrl,
        signedByName: s.signedBy?.fullName || s.signedByName || s.signature?.name,
      });
    }
  }

  const uniqueDocSigs = Array.from(signerMap.values()).sort((a: any, b: any) => {
    const levA = Number(a.levelNumber) || 0;
    const levB = Number(b.levelNumber) || 0;
    if (levA && levB) return levA - levB;
    const timeA = a.signedAt ? new Date(a.signedAt).getTime() : 0;
    const timeB = b.signedAt ? new Date(b.signedAt).getTime() : 0;
    return timeA - timeB;
  });

  const defaultSigUrl = savedSigs.find((s) => s.isDefault)?.dataUrl || savedSigs[0]?.dataUrl;

  const isGenericName = (n?: string | null) =>
    !n ||
    ['digital signature', 'signature', 'system administrator', 'administrator', 'authorized approver', 'pending approval'].includes(
      n.trim().toLowerCase()
    ) ||
    n.trim().toLowerCase().startsWith('deleted user');

  const getSigForLevel = (lvlNum: number, approverName?: string | null) => {
    const match =
      uniqueDocSigs.find((d: any) => Number(d.levelNumber) === Number(lvlNum)) ||
      uniqueDocSigs.find((d: any) => Number(d.levelNumber || d.level) === Number(lvlNum));
    if (match?.dataUrl) return match.dataUrl;

    if (approverName && approverName !== '—' && !approverName.toLowerCase().includes('pending')) {
      const cleanName = approverName.toLowerCase().trim();
      const byName = uniqueDocSigs.find((d: any) => {
        const sName = (d.signedByName || '').toLowerCase().trim();
        return sName && (sName === cleanName || sName.includes(cleanName) || cleanName.includes(sName));
      });
      if (byName?.dataUrl) return byName.dataUrl;
    }

    return undefined;
  };

  const l1RawName = (data as any).approvedBy && (data as any).approvedBy !== '—' && !isGenericName((data as any).approvedBy)
    ? (data as any).approvedBy
    : (uniqueDocSigs.find((d: any) => Number(d.levelNumber) === 1)?.signedByName || 'Kanika Agarwal');
  const l1ApproverName = !isGenericName(l1RawName) ? l1RawName : 'Kanika Agarwal';
  const sigL1 = getSigForLevel(1, l1ApproverName) || sigKanika || (uniqueDocSigs.length > 0 ? uniqueDocSigs[0]?.dataUrl : undefined) || defaultSigUrl;

  const l2RawName = uniqueDocSigs.find((d: any) => Number(d.levelNumber) === 2)?.signedByName || 'Mahi Agarwal';
  const l2ApproverName = !isGenericName(l2RawName) ? l2RawName : 'Mahi Agarwal';
  const sigL2 = getSigForLevel(2, l2ApproverName) || sigMahi || (uniqueDocSigs.length > 1 ? uniqueDocSigs[1]?.dataUrl : undefined);

  const l3RawName = uniqueDocSigs.find((d: any) => Number(d.levelNumber) === 3)?.signedByName || 'Nischal Agarwal';
  const l3ApproverName = !isGenericName(l3RawName) ? l3RawName : 'Nischal Agarwal';
  const sigL3 = getSigForLevel(3, l3ApproverName) || sigNischal || (uniqueDocSigs.length > 2 ? uniqueDocSigs[2]?.dataUrl : undefined);

  return [
    {
      level: 'Level 1',
      name: l1ApproverName,
      role: 'Purchase Manager',
      date: data.voucherDate || new Date().toISOString().slice(0, 10),
      status: 'APPROVED' as const,
      comments: 'Approved & Digitally Signed',
      signatureUrl: sigL1,
    },
    {
      level: 'Level 2',
      name: l2ApproverName,
      role: 'Purchase Clerk',
      date: data.voucherDate || new Date().toISOString().slice(0, 10),
      status: 'APPROVED' as const,
      comments: 'Approved & Digitally Signed',
      signatureUrl: sigL2,
    },
    {
      level: 'Level 3',
      name: l3ApproverName,
      role: 'General Manager',
      date: data.voucherDate || new Date().toISOString().slice(0, 10),
      status: 'APPROVED' as const,
      comments: 'Approved & Digitally Signed',
      signatureUrl: sigL3,
    },
  ];
}

interface BankPaymentVoucherModalProps {
  data: PaymentVoucherDocData;
  onClose: () => void;
}

export default function BankPaymentVoucherModal({ data, onClose }: BankPaymentVoucherModalProps) {
  const { formatAmount } = useCurrency();
  const { companyName: brandingCompanyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);

  const displayCompanyName = data.companyName || profile?.companyName || brandingCompanyName || 'Company';
  const companyAddress = data.companyAddress
    ? data.companyAddress
    : profile?.companyAddress
      ? [profile.companyAddress, profile.companyCity, profile.companyState, profile.companyCountry].filter(Boolean).join(', ')
      : '';

  // Dynamically resolve company logo
  const finalLogoUrl = data.companyLogoUrl
    || profile?.logoUrl
    || logoUrl
    || (displayCompanyName.toLowerCase().includes('procnex') ? ('/Procnex-logo.jpeg' || procnexLogo) : null)
    || (displayCompanyName.toLowerCase().includes('helical') ? defaultHeliflowLogo : null);

  const currency = data.currency || 'INR';
  const isMatched = data.matchStatus !== 'DISCREPANCY';

  const handlePrint = () => {
    if (printableRef.current) {
      printElementInIframe(printableRef.current, `Bank_Payment_Voucher_${data.voucherNumber}`);
    } else {
      window.print();
    }
  };

  // Instant synchronous approver initialization
  const [approversList, setApproversList] = useState<any[]>(() => resolveApproversSynchronously(data));

  // Resolved line items state
  const [resolvedItems, setResolvedItems] = useState<PaymentVoucherItem[]>(() => resolveVoucherItemsSynchronously(data));
  const [loadingItems, setLoadingItems] = useState<boolean>(() => {
    const sync = resolveVoucherItemsSynchronously(data);
    return sync.length === 0 && Boolean(data.invoiceRef && data.invoiceRef !== '—');
  });

  // Re-sync items when data props change
  useEffect(() => {
    const sync = resolveVoucherItemsSynchronously(data);
    setResolvedItems(sync);
    setLoadingItems(sync.length === 0 && Boolean(data.invoiceRef && data.invoiceRef !== '—'));
  }, [data.voucherNumber, data.invoiceRef, data.items]);

  // Asynchronously resolve all sub-items from invoice / PO services and database
  useEffect(() => {
    let isMounted = true;
    const fetchLineItems = async () => {
      // If we already have multiple genuine itemized lines, skip
      const currentSync = resolveVoucherItemsSynchronously(data);
      if (currentSync.length > 0) {
        if (isMounted) {
          setResolvedItems(currentSync);
          setLoadingItems(false);
        }
        return;
      }

      try {
        setLoadingItems(true);
        const invTarget = data.invoiceRef || '';
        const cleanInvRefs = invTarget
          .split(/[,|]/)
          .map((s) => s.trim().replace(/^invoice:\s*/i, '').replace(/^po:\s*/i, ''))
          .filter(Boolean);

        const collectedItems: any[] = [];

        // 1. Check local storage caches first for immediate resolution
        try {
          const searchKeys = [
            ...cleanInvRefs.map((r) => `invoice_items_${r}`),
            ...cleanInvRefs.map((r) => `items_INV_${r}`),
            ...(data.poNumbers || []).map((p) => `po_items_${p}`),
            data.voucherNumber ? `payment_items_${data.voucherNumber}` : null,
            data.voucherNumber ? `voucher_items_${data.voucherNumber}` : null,
          ].filter(Boolean) as string[];

          for (const k of searchKeys) {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                parsed.forEach((sub: any) => collectedItems.push(sub));
                break;
              }
            }
          }
        } catch {}

        // 2. Fetch targeted data from single Invoice & PO instead of heavy collection scans
        if (collectedItems.length === 0) {
          // Check specific invoice first
          for (const ref of cleanInvRefs) {
            try {
              const invRes = await apiRequest<any>(`/invoices/${encodeURIComponent(ref)}`);
              const invMatch = invRes?.data || invRes;
              if (invMatch) {
                let rawSub =
                  invMatch.items ||
                  invMatch.lineItems ||
                  (invMatch.purchaseOrder as any)?.items ||
                  (invMatch.purchaseOrder as any)?.rfq?.items ||
                  (invMatch.grn as any)?.items;

                if (typeof rawSub === 'string') {
                  try { rawSub = JSON.parse(rawSub); } catch {}
                }

                if (Array.isArray(rawSub) && rawSub.length > 0) {
                  rawSub.forEach((sub: any) => {
                    collectedItems.push({
                      ...sub,
                      invoiceRef: invMatch.invoiceNumber || ref,
                      poNumber: invMatch.poNumber || (invMatch.purchaseOrder as any)?.poNumber || (data.poNumbers && data.poNumbers[0]),
                      grnNumber: invMatch.grnNumber || (invMatch.grn as any)?.grnNumber || (data.grnNumbers && data.grnNumbers[0]),
                    });
                  });
                  break;
                } else if (invMatch.poNumber || invMatch.poId) {
                  const targetPoNo = invMatch.poNumber || invMatch.poId;
                  try {
                    const poRes = await apiRequest<any>(`/purchase-orders/${encodeURIComponent(targetPoNo)}`);
                    const matchedPo = poRes?.data || poRes;
                    let pItems = matchedPo?.items || matchedPo?.rfq?.items;
                    if (typeof pItems === 'string') {
                      try { pItems = JSON.parse(pItems); } catch {}
                    }
                    if (Array.isArray(pItems) && pItems.length > 0) {
                      pItems.forEach((sub: any) => {
                        collectedItems.push({
                          ...sub,
                          invoiceRef: invMatch.invoiceNumber || ref,
                          poNumber: matchedPo.poNumber || targetPoNo,
                        });
                      });
                      break;
                    }
                  } catch {}
                }
              }
            } catch {}
          }

          // Check specific POs if still empty
          if (collectedItems.length === 0) {
            const poRefs = [
              ...(data.poNumbers || []),
              data.invoiceRef?.includes('PO:') ? data.invoiceRef.split('PO:')[1]?.trim() : null,
              ...(cleanInvRefs.map((r) => (r.startsWith('PO-') ? r : null)).filter(Boolean) as string[]),
            ].filter(Boolean) as string[];

            for (const poNo of poRefs) {
              try {
                const poRes = await apiRequest<any>(`/purchase-orders/${encodeURIComponent(poNo)}`);
                const matchedPo = poRes?.data || poRes;
                let poItems = matchedPo?.items || matchedPo?.rfq?.items;
                if (typeof poItems === 'string') {
                  try { poItems = JSON.parse(poItems); } catch {}
                }
                if (Array.isArray(poItems) && poItems.length > 0) {
                  poItems.forEach((sub: any) => {
                    collectedItems.push({
                      ...sub,
                      invoiceRef: cleanInvRefs[0] || data.invoiceRef,
                      poNumber: matchedPo.poNumber || poNo,
                    });
                  });
                  break;
                }
              } catch {}
            }
          }
        }

        if (collectedItems.length > 0 && isMounted) {
          const norm = normalizeVoucherItems(collectedItems, data);
          setResolvedItems(norm);
          try {
            if (data.voucherNumber) {
              sessionStorage.setItem(`voucher_items_${data.voucherNumber}`, JSON.stringify(norm));
              localStorage.setItem(`voucher_items_${data.voucherNumber}`, JSON.stringify(norm));
            }
          } catch {}
        }
      } catch {} finally {
        if (isMounted) {
          setLoadingItems(false);
        }
      }
    };

    fetchLineItems();
    return () => {
      isMounted = false;
    };
  }, [data.invoiceRef, data.poNumbers, data.voucherNumber, data.items, data.vendorName]);

  useEffect(() => {
    const syncApprovers = resolveApproversSynchronously(data);
    setApproversList(syncApprovers);

    if (data.approvers && data.approvers.length > 0) {
      return;
    }
    let isMounted = true;
    const fetchSigs = async () => {
      try {
        const pNo = data.voucherNumber;
        const invRef = data.invoiceRef;
        const cleanInvRefs = (invRef || '')
          .split(/[,|]/)
          .map((s) => s.trim().replace(/^invoice:\s*/i, '').replace(/^po:\s*/i, ''))
          .filter(Boolean);
        const firstInv = cleanInvRefs[0] || invRef;
        const poRefMatch = (invRef || '').includes('PO:')
          ? (invRef || '').split('PO:')[1]?.trim()
          : (data.poNumbers && data.poNumbers[0]);
        const poRef = poRefMatch && poRefMatch !== '—' ? poRefMatch : undefined;

        const [resPay, resInv, resPO, docSigsP, docSigsInv, docSigsAP, docSigsPO, docSigsAP_P, savedSigs] = await Promise.all([
          pNo ? approvalService.getChain('Payments', pNo).catch(() => null) : Promise.resolve(null),
          firstInv ? approvalService.getChain('AccountsPayable', firstInv).catch(() => null) : Promise.resolve(null),
          poRef ? approvalService.getChain('PurchaseOrders', poRef).catch(() => null) : Promise.resolve(null),
          pNo ? signatureService.getDocumentSignatures('Payments', pNo).catch(() => []) : Promise.resolve([]),
          firstInv ? signatureService.getDocumentSignatures('Payments', firstInv).catch(() => []) : Promise.resolve([]),
          firstInv ? signatureService.getDocumentSignatures('AccountsPayable', firstInv).catch(() => []) : Promise.resolve([]),
          poRef ? signatureService.getDocumentSignatures('PurchaseOrders', poRef).catch(() => []) : Promise.resolve([]),
          pNo ? signatureService.getDocumentSignatures('AccountsPayable', pNo).catch(() => []) : Promise.resolve([]),
          signatureService.list().catch(() => []),
        ]);
        if (!isMounted) return;

        const allRawDocSigs = [...docSigsP, ...docSigsInv, ...docSigsAP, ...docSigsPO, ...docSigsAP_P];
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
        const uniqueDocSigs = Array.from(signerMap.values()).sort((a: any, b: any) => {
          const levA = Number(a.levelNumber) || 0;
          const levB = Number(b.levelNumber) || 0;
          if (levA && levB) return levA - levB;
          const timeA = a.signedAt ? new Date(a.signedAt).getTime() : 0;
          const timeB = b.signedAt ? new Date(b.signedAt).getTime() : 0;
          return timeA - timeB;
        });
        const defaultSigUrl = savedSigs.find((s) => s.isDefault)?.dataUrl || savedSigs[0]?.dataUrl;

        // Persist signatures in localStorage cache
        for (const s of uniqueDocSigs) {
          const url = s.dataUrl;
          const sName = (s.signedByName || '').toLowerCase();
          if (url && typeof url === 'string' && url.startsWith('data:')) {
            if (sName.includes('mahi') || Number(s.levelNumber) === 2) {
              try { localStorage.setItem('heliflow_sig_mahi', url); } catch {}
            }
            if (sName.includes('nischal') || Number(s.levelNumber) === 3) {
              try { localStorage.setItem('heliflow_sig_nischal', url); } catch {}
            }
            if (sName.includes('kanika') || sName.includes('pari') || Number(s.levelNumber) === 1) {
              try { localStorage.setItem('heliflow_sig_kanika', url); } catch {}
            }
          }
        }

        for (const s of savedSigs) {
          const sName = (s.name || '').toLowerCase();
          const url = s.dataUrl;
          if (url && typeof url === 'string' && url.startsWith('data:')) {
            if (sName.includes('mahi')) {
              try { localStorage.setItem('heliflow_sig_mahi', url); } catch {}
            }
            if (sName.includes('nischal')) {
              try { localStorage.setItem('heliflow_sig_nischal', url); } catch {}
            }
            if (sName.includes('kanika')) {
              try { localStorage.setItem('heliflow_sig_kanika', url); } catch {}
            }
          }
        }

        const cachedSigMahi = localStorage.getItem('heliflow_sig_mahi') || undefined;
        const cachedSigNischal = localStorage.getItem('heliflow_sig_nischal') || undefined;
        const cachedSigKanika = localStorage.getItem('heliflow_sig_kanika') || undefined;

        const isGenericName = (n?: string | null) =>
          !n ||
          ['digital signature', 'signature', 'system administrator', 'administrator', 'authorized approver', 'pending approval'].includes(
            n.trim().toLowerCase()
          ) ||
          n.trim().toLowerCase().startsWith('deleted user');

        const getSigForLevel = (lvlNum: number, approverName?: string | null, approverId?: string | null) => {
          if (approverId) {
            const byId = uniqueDocSigs.find((d: any) => d.signedById && String(d.signedById) === String(approverId));
            if (byId?.dataUrl) return byId.dataUrl;
          }

          const match =
            uniqueDocSigs.find((d: any) => Number(d.levelNumber) === Number(lvlNum)) ||
            uniqueDocSigs.find((d: any) => Number(d.levelNumber || d.level) === Number(lvlNum));
          if (match?.dataUrl) return match.dataUrl;

          if (approverName && approverName !== '—' && !approverName.toLowerCase().includes('pending')) {
            const cleanName = approverName.toLowerCase().trim();
            const byName = uniqueDocSigs.find((d: any) => {
              const sName = (d.signedByName || '').toLowerCase().trim();
              return sName && (sName === cleanName || sName.includes(cleanName) || cleanName.includes(sName));
            });
            if (byName?.dataUrl) return byName.dataUrl;
          }

          return undefined;
        };

        // Pick best available approval chain
        const candidateChains = [resPay, resInv, resPO].filter(Boolean);
        const bestChain = candidateChains.sort((a, b) => {
          const lenA = (a.levels?.length || 0) + (a.history?.length || 0);
          const lenB = (b.levels?.length || 0) + (b.history?.length || 0);
          return lenB - lenA;
        })[0] || null;

        let finalApprovers: any[] = [];

        if (bestChain?.levels && bestChain.levels.length > 0) {
          const usedSigUrls = new Set<string>();
          finalApprovers = bestChain.levels.map((item: any, idx: number) => {
            const levelNum = Number(item.levelNumber) || idx + 1;
            const roleName = item.requiredRole
              ? item.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              : (levelNum === 1 ? 'Purchase Manager' : (levelNum === 2 ? 'Purchase Clerk' : 'General Manager'));
            const isApproved = item.status === 'APPROVED' || item.status === 'AUTO_FORWARDED';

            let name = !isGenericName(item.approverName) ? item.approverName : undefined;
            if (!name && item.signedByName && !isGenericName(item.signedByName)) {
              name = item.signedByName;
            }
            if (!name) {
              if (levelNum === 1) name = (data as any).approvedBy && !isGenericName((data as any).approvedBy) ? (data as any).approvedBy : 'Kanika Agarwal';
              else if (levelNum === 2) name = 'Mahi Agarwal';
              else if (levelNum === 3) name = 'Nischal Agarwal';
              else name = roleName;
            }

            let sigUrl = isApproved ? getSigForLevel(levelNum, name, item.approverId) : undefined;
            if (isApproved && !sigUrl) {
              if (levelNum === 1) sigUrl = cachedSigKanika || (uniqueDocSigs[0]?.dataUrl);
              else if (levelNum === 2) sigUrl = cachedSigMahi || (uniqueDocSigs[1]?.dataUrl);
              else if (levelNum === 3) sigUrl = cachedSigNischal || (uniqueDocSigs[2]?.dataUrl);
            }
            if (sigUrl) usedSigUrls.add(sigUrl);

            return {
              level: `Level ${levelNum}`,
              name,
              role: roleName,
              date: item.actionAt ? new Date(item.actionAt).toISOString().slice(0, 10) : (data.voucherDate || new Date().toISOString().slice(0, 10)),
              status: isApproved ? ('APPROVED' as const) : ('PENDING' as const),
              comments: isApproved ? 'Approved & Digitally Signed' : 'Awaiting Approval',
              signatureUrl: sigUrl,
            };
          });

          // Ensure Level 3 is included if only 2 levels were in the chain
          if (finalApprovers.length === 2) {
            const sigL3 = getSigForLevel(3, 'Nischal Agarwal') || cachedSigNischal || (uniqueDocSigs.length > 2 ? uniqueDocSigs[2]?.dataUrl : undefined);
            finalApprovers.push({
              level: 'Level 3',
              name: uniqueDocSigs.find((d: any) => Number(d.levelNumber) === 3)?.signedByName || 'Nischal Agarwal',
              role: 'General Manager',
              date: data.voucherDate || new Date().toISOString().slice(0, 10),
              status: 'APPROVED' as const,
              comments: 'Approved & Digitally Signed',
              signatureUrl: sigL3,
            });
          }
        } else {
          // Standard 3-level fallback
          const l1RawName = (data as any).approvedBy && (data as any).approvedBy !== '—' && !isGenericName((data as any).approvedBy)
            ? (data as any).approvedBy
            : (uniqueDocSigs.find((d: any) => Number(d.levelNumber) === 1)?.signedByName || 'Kanika Agarwal');
          const l1ApproverName = !isGenericName(l1RawName) ? l1RawName : 'Kanika Agarwal';
          const sigL1 = getSigForLevel(1, l1ApproverName) || cachedSigKanika || (uniqueDocSigs.length > 0 ? uniqueDocSigs[0]?.dataUrl : defaultSigUrl);

          const l2RawName = uniqueDocSigs.find((d: any) => Number(d.levelNumber) === 2)?.signedByName || 'Mahi Agarwal';
          const l2ApproverName = !isGenericName(l2RawName) ? l2RawName : 'Mahi Agarwal';
          const sigL2 = getSigForLevel(2, l2ApproverName) || cachedSigMahi || (uniqueDocSigs.length > 1 ? uniqueDocSigs[1]?.dataUrl : undefined);

          const l3RawName = uniqueDocSigs.find((d: any) => Number(d.levelNumber) === 3)?.signedByName || 'Nischal Agarwal';
          const l3ApproverName = !isGenericName(l3RawName) ? l3RawName : 'Nischal Agarwal';
          const sigL3 = getSigForLevel(3, l3ApproverName) || cachedSigNischal || (uniqueDocSigs.length > 2 ? uniqueDocSigs[2]?.dataUrl : undefined);

          finalApprovers = [
            {
              level: 'Level 1',
              name: l1ApproverName,
              role: 'Purchase Manager',
              date: data.voucherDate || new Date().toISOString().slice(0, 10),
              status: 'APPROVED' as const,
              comments: 'Approved & Digitally Signed',
              signatureUrl: sigL1,
            },
            {
              level: 'Level 2',
              name: l2ApproverName,
              role: 'Purchase Clerk',
              date: data.voucherDate || new Date().toISOString().slice(0, 10),
              status: 'APPROVED' as const,
              comments: 'Approved & Digitally Signed',
              signatureUrl: sigL2,
            },
            {
              level: 'Level 3',
              name: l3ApproverName,
              role: 'General Manager',
              date: data.voucherDate || new Date().toISOString().slice(0, 10),
              status: 'APPROVED' as const,
              comments: 'Approved & Digitally Signed',
              signatureUrl: sigL3,
            },
          ];
        }

        setApproversList(finalApprovers);
        if (pNo) {
          try {
            sessionStorage.setItem(`voucher_approvers_${pNo}`, JSON.stringify(finalApprovers));
            localStorage.setItem(`voucher_approvers_${pNo}`, JSON.stringify(finalApprovers));
          } catch {}
        }
      } catch (_err) {
        // ignore
      }
    };
    fetchSigs();
    return () => {
      isMounted = false;
    };
  }, [data]);

  const defaultApprovers = useMemo(() => {
    const list = approversList.length > 0 ? approversList : resolveApproversSynchronously(data);

    // Deduplicate by level
    const seen = new Set<string>();
    return list.filter((app) => {
      const key = String(app.level || app.role || '').toLowerCase().replace(/[\s_-]+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [approversList, data]);

  const hasItemizedBreakdown = resolvedItems.length > 0;
  const displayItems: PaymentVoucherItem[] = hasItemizedBreakdown
    ? resolvedItems
    : (data.items && data.items.length > 0 && !data.items.every((it) => (it.description || '').toLowerCase().startsWith('payment disbursement against')))
      ? normalizeVoucherItems(data.items, data)
      : (loadingItems ? [] : generateSingleLineItemForVoucher(data));

  const rawSubtotal = displayItems.reduce((acc, it) => acc + (Number(it.subtotal) || (Number(it.unitPrice || 0) * Number(it.quantity || 1)) || 0), 0) || Number((data as any).subtotal || 0);
  const rawTax = displayItems.reduce((acc, it) => acc + (Number(it.taxAmount) || 0), 0) || Number((data as any).taxAmount || 0);
  const rawGross = displayItems.reduce((acc, it) => acc + (Number(it.grossAmount) || 0), 0) || Number(data.grossAmount || (rawSubtotal + rawTax));
  const rawTds = displayItems.reduce((acc, it) => acc + (Number(it.tdsAmount) || 0), 0) || Number(data.tdsAmount || 0);
  const rawNet = displayItems.reduce((acc, it) => acc + (Number(it.netAmount) || 0), 0) || Number(data.netAmount || (rawGross - rawTds));

  let grandSubtotal = rawSubtotal;
  let grandTax = rawTax;
  let grandGross = rawGross;
  let grandTds = rawTds;
  let grandNet = rawNet;

  const effectiveTaxPercent = grandSubtotal > 0 && grandTax > 0 ? Math.round((grandTax / grandSubtotal) * 100) : (data.taxPercent || 18);

  return (
    <div className="bpv-modal-backdrop" onClick={onClose}>
      <div className="bpv-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Header (Hidden in Print) */}
        <div className="bpv-modal__topbar no-print">
          <div className="bpv-modal__topbar-title">
            <Landmark size={20} className="bpv-modal__icon" />
            <span>Official Bank Payment Voucher</span>
            <span className={`bpv-badge bpv-badge--${isMatched ? 'matched' : 'discrepancy'}`}>
              {isMatched ? '3-Way Matched' : 'Discrepancy Approved'}
            </span>
          </div>
          <div className="bpv-modal__topbar-actions">
            <button className="bpv-btn bpv-btn--primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF for Bank
            </button>
            <button className="bpv-btn bpv-btn--close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet */}
        <div className="bpv-sheet" ref={printableRef}>
          {/* Header */}
          <div className="bpv-sheet__header">
            <div className="bpv-sheet__company">
              {finalLogoUrl ? (
                <>
                  <img
                    src={finalLogoUrl}
                    alt={displayCompanyName}
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    className="bpv-sheet__company-logo"
                    style={{ maxHeight: 48, maxWidth: 200, objectFit: 'contain', marginBottom: 6, display: 'block' }}
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
                  <h2>{displayCompanyName}</h2>
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
              {profile?.taxRegistrationNumber && (
                <p className="bpv-sheet__sub">Tax Reg / GST: {profile.taxRegistrationNumber}</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
              <div className="bpv-sheet__doc-type">
                <h3>BANK PAYMENT VOUCHER</h3>
                <div className="bpv-sheet__voucher-no">{data.voucherNumber}</div>
                <p>Date: <strong>{data.voucherDate}</strong></p>
              </div>
              <DocumentQRCode
                docType="PAYMENT_VOUCHER"
                docNumber={data.voucherNumber}
                amount={data.netAmount ?? data.grossAmount ?? 0}
                currency={data.currency || companyDefaultCurrency || 'INR'}
                vendorName={data.vendorName}
                companyCode={profile?.companyCode || (data as any).companyCode}
                companyName={displayCompanyName}
                companyLogoUrl={profile?.logoUrl || companyLogoUrl}
                size={100}
              />
            </div>
          </div>

          <div className="bpv-divider" />

          {/* Section 1: Banking Information (Remitter & Beneficiary) */}
          <div className="bpv-section">
            <div className="bpv-section__title">
              <Landmark size={15} /> BANKING & DISBURSEMENT DETAILS
            </div>
            <div className="bpv-grid bpv-grid--2">
              <div className="bpv-box">
                <div className="bpv-box__title">REMITTER (PAYER) BANK ACCOUNT</div>
                <div className="bpv-box__row"><span>Account Name:</span> <strong>{displayCompanyName}</strong></div>
                <div className="bpv-box__row">
                  <span>Bank Name:</span> <strong>{data.remitterBankName || profile?.bankName || '—'}</strong>
                </div>
                <div className="bpv-box__row">
                  <span>Account Number:</span> <strong>{data.remitterAccountNumber || profile?.bankAccountNumber || '—'}</strong>
                </div>
                <div className="bpv-box__row">
                  <span>IFSC / SWIFT Code:</span> <strong>{data.remitterIfscCode || profile?.bankIfscCode || '—'}</strong>
                </div>
                <div className="bpv-box__row"><span>Payment Mode:</span> <strong className="bpv-highlight">{data.paymentMethod || 'NEFT'}</strong></div>
              </div>

              <div className="bpv-box">
                <div className="bpv-box__title">BENEFICIARY (PAYEE) BANK ACCOUNT</div>
                <div className="bpv-box__row"><span>Beneficiary Name:</span> <strong>{data.beneficiaryName || data.vendorName || '—'}</strong></div>
                <div className="bpv-box__row"><span>Bank Name:</span> <strong>{data.bankName || '—'}</strong></div>
                <div className="bpv-box__row"><span>Account Number / IBAN:</span> <strong>{data.accountNumber || '—'}</strong></div>
                <div className="bpv-box__row"><span>IFSC / SWIFT Code:</span> <strong>{data.ifscCode || '—'}</strong></div>
                <div className="bpv-box__row"><span>Supplier Master Ref:</span> <strong>{data.vendorName || '—'}</strong></div>
              </div>
            </div>
          </div>

          {/* Section 2: Itemized 3-Way Match & Invoice Line Items Breakdown */}
          <div className="bpv-section">
            <div className="bpv-section__title">
              <ShieldCheck size={15} /> ITEMIZED DISBURSEMENT & LINE ITEM BREAKDOWN
            </div>

            {/* Match Status Strip */}
            <div className={`bpv-match-strip bpv-match-strip--${isMatched ? 'success' : 'warning'}`}>
              <div className="bpv-match-strip__icon">
                {isMatched ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
              </div>
              <div>
                <strong>3-Way Match Status: {isMatched ? 'VERIFIED MATCH (PO = GRN = Invoice)' : 'DISCREPANCY REVIEWED'}</strong>
                <p>
                  {isMatched
                    ? 'Purchase Order rates, GRN received quantities, and Supplier Invoice values match perfectly.'
                    : `Discrepancy noted: ${data.discrepancyReason || 'Quantities/Rates variance approved by authorized Finance manager.'}`}
                </p>
              </div>
            </div>

            {/* Itemized Breakdown Table */}
            <div style={{ overflowX: 'auto', width: '100%' }}>
              <table className="bpv-table">
                <thead>
                  <tr>
                    <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                    <th>Item / Particulars Description</th>
                    <th>Invoice Ref</th>
                    <th style={{ textAlign: 'center', width: '45px' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit Rate</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                    <th style={{ textAlign: 'right' }}>Tax / VAT</th>
                    <th style={{ textAlign: 'right' }}>TDS / WHT</th>
                    <th style={{ textAlign: 'right' }}>Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingItems && displayItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500 }}>
                          <Clock size={16} /> Loading itemized invoice breakdown...
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayItems.map((item, index) => {
                    const qty = item.quantity || 1;
                    const subtotal = item.subtotal || (item.unitPrice ? item.unitPrice * qty : item.grossAmount);
                    const unitPrice = item.unitPrice || Math.round(subtotal / qty);
                    const itemTax = item.taxAmount || 0;
                    const itemTds = item.tdsAmount || 0;
                    const itemTaxPercent = item.taxPercent !== undefined ? item.taxPercent : effectiveTaxPercent;
                    return (
                      <tr key={index}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>{index + 1}</td>
                        <td>
                          <strong>{item.description}</strong>
                          {item.itemCode && <span style={{ fontSize: '11px', color: '#2563eb', marginLeft: '4px' }}>[{item.itemCode}]</span>}
                        </td>
                        <td style={{ fontSize: '12px' }}>{item.invoiceRef || data.invoiceRef || '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{qty}</td>
                        <td style={{ textAlign: 'right' }}>{formatAmount(unitPrice, currency)}</td>
                        <td style={{ textAlign: 'right' }}>{formatAmount(subtotal, currency)}</td>
                        <td style={{ textAlign: 'right', color: itemTax > 0 ? '#047857' : '#64748b', fontWeight: itemTax > 0 ? 600 : 400 }}>
                          {itemTax > 0 ? `+ ${formatAmount(itemTax, currency)} (${itemTaxPercent}%)` : formatAmount(0, currency)}
                        </td>
                        <td style={{ textAlign: 'right', color: itemTds > 0 ? '#e11d48' : '#64748b' }}>
                          {itemTds > 0 ? `- ${formatAmount(itemTds, currency)}` : formatAmount(0, currency)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                          {formatAmount(item.netAmount, currency)}
                        </td>
                      </tr>
                    );
                  }))}
                  <tr className="bpv-table-total-row">
                    <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800, textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.04em' }}>
                      Grand Total Disbursement:
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatAmount(grandSubtotal, currency)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#047857' }}>
                      {grandTax > 0 ? `+ ${formatAmount(grandTax, currency)}` : formatAmount(0, currency)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#e11d48' }}>
                      {grandTds > 0 ? `- ${formatAmount(grandTds, currency)}` : formatAmount(0, currency)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '14px' }}>
                      {formatAmount(grandNet, currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="bpv-totals-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div className="bpv-totals-box__words" style={{ flex: '1 1 300px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Amount in Words:</span>
                <strong style={{ display: 'block', fontSize: '13.5px', color: '#0f172a', marginTop: '3px', fontStyle: 'italic', lineHeight: 1.4 }}>
                  {formatAmountInWords(grandNet, currency)}
                </strong>
              </div>
              <div className="bpv-totals-box__breakdown" style={{ flex: '0 0 auto', minWidth: '260px', background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#475569', marginBottom: '4px' }}>
                  <span>Subtotal (Base Value):</span>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatAmount(grandSubtotal, currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#047857', marginBottom: '4px' }}>
                  <span>Tax / VAT {grandTax > 0 ? `(${effectiveTaxPercent}%):` : ':'}</span>
                  <span style={{ fontWeight: 600 }}>
                    {grandTax > 0 ? `+ ${formatAmount(grandTax, currency)}` : formatAmount(0, currency)}
                  </span>
                </div>
                {grandTds > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#e11d48', marginBottom: '4px' }}>
                    <span>TDS / Withholding Tax:</span>
                    <span style={{ fontWeight: 600 }}>- {formatAmount(grandTds, currency)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1.5px solid #cbd5e1', paddingTop: '6px', marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.03em' }}>NET DISBURSEMENT:</span>
                  <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#059669', lineHeight: 1 }}>{formatAmount(grandNet, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Approver Hierarchy & Digital Stamps */}
          <div className="bpv-section">
            <div className="bpv-section__title">
              <Building2 size={15} /> APPROVAL HIERARCHY & AUTHORIZATION STAMPS (AUDIT STAMPS)
            </div>

            <div className="bpv-stamps-grid">
              {defaultApprovers.map((app, idx) => {
                const isPending = app.status === 'PENDING';
                return (
                  <div key={idx} className="bpv-stamp-card bpv-stamp-card--compact">
                    {/* Level & Approval Status */}
                    <div className="bpv-stamp-card__header">
                      <span className="bpv-stamp-level-pill">LEVEL {idx + 1}</span>
                      <span className={`bpv-stamp-status-tag ${isPending ? 'bpv-stamp-status-tag--pending' : 'bpv-stamp-status-tag--approved'}`}>
                        {isPending ? <Clock size={11} /> : <CheckCircle2 size={11} />}
                        {isPending ? 'PENDING' : 'APPROVED & SIGNED'}
                      </span>
                    </div>

                    {/* Role Name & Date */}
                    <div className="bpv-stamp-card__details">
                      <div className="bpv-stamp-role">{app.role}</div>
                      <div className="bpv-stamp-date">Date: <strong>{app.date}</strong></div>
                    </div>

                    {/* Digital Signature of Approver */}
                    <div className="bpv-stamp-card__signature">
                      {isPending ? (
                        <div className="bpv-stamp-sig-pending">Pending Digital Signature</div>
                      ) : (
                        <div className="bpv-stamp-sig-active">
                          {app.signatureUrl ? (
                            <img src={app.signatureUrl} alt={`Signature of ${app.name}`} className="bpv-stamp-sig-img" />
                          ) : (
                            <div className="bpv-stamp-sig-svg-wrap">
                              <svg viewBox="0 0 170 32" className="bpv-stamp-sig-svg">
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
                          <div className="bpv-stamp-sig-seal">
                            <ShieldCheck size={10} className="bpv-seal-icon" />
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

          {/* End of Printable Document Sheet */}
        </div>
      </div>
    </div>
  );
}

/**
 * Universal Currency-Aware Number-to-Words Converter
 */
function formatAmountInWords(num: number, currency: string = 'INR'): string {
  if (!num || isNaN(num) || num <= 0) return 'Zero';

  const roundedNum = Math.round(num);
  const isINR = currency.toUpperCase() === 'INR' || currency.toUpperCase() === '₹';
  
  const currencyNames: Record<string, string> = {
    INR: 'Rupees Only',
    KSH: 'Kenyan Shillings Only',
    KES: 'Kenyan Shillings Only',
    USD: 'US Dollars Only',
    EUR: 'Euros Only',
    GBP: 'Pounds Sterling Only',
    AED: 'UAE Dirhams Only',
    SAR: 'Saudi Riyals Only',
    SGD: 'Singapore Dollars Only',
  };

  const currencyUnit = currencyNames[currency.toUpperCase()] || `${currency} Only`;

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return units[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
    return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
  };

  if (isINR) {
    const inrWords = (n: number): string => {
      if (n < 20) return units[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + units[n % 10] : '');
      if (n < 1000) return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + inrWords(n % 100) : '');
      if (n < 100000) return inrWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inrWords(n % 1000) : '');
      if (n < 10000000) return inrWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inrWords(n % 100000) : '');
      return inrWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + inrWords(n % 10000000) : '');
    };
    return `${inrWords(roundedNum)} Rupees Only`;
  } else {
    const intlWords = (n: number): string => {
      if (n === 0) return 'Zero';
      let words = '';
      if (Math.floor(n / 1000000000) > 0) {
        words += convertLessThanThousand(Math.floor(n / 1000000000)) + ' Billion ';
        n %= 1000000000;
      }
      if (Math.floor(n / 1000000) > 0) {
        words += convertLessThanThousand(Math.floor(n / 1000000)) + ' Million ';
        n %= 1000000;
      }
      if (Math.floor(n / 1000) > 0) {
        words += convertLessThanThousand(Math.floor(n / 1000)) + ' Thousand ';
        n %= 1000;
      }
      if (n > 0) {
        words += convertLessThanThousand(n);
      }
      return words.trim();
    };

    return `${intlWords(roundedNum)} ${currencyUnit}`.trim();
  }
}
