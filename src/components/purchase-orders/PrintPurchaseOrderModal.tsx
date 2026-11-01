import React, { useState, useEffect, useRef } from 'react';
import { Printer, X, ShoppingCart } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { printElementInIframe } from '../../utils/pdfDownload';
import { approvalService } from '../../services/approvalService';
import { signatureService } from '../../services/signatureService';
import { purchaseOrderService } from '../../services/purchaseOrderService';
import { vendorService } from '../../services/vendorService';
import { apiRequest } from '../../api/client';
import type { PurchaseRequisition } from '../../services/purchaseRequisitionService';
import PurchaseOrderDocument from './PurchaseOrderDocument';
import './PrintPurchaseOrderModal.css';

export interface PurchaseOrderPrintData {
  id?: number | string;
  referenceNumber: string;
  title: string;
  amount: number | string;
  requestedBy: string;
  department: string;
  priority: string;
  status: string;
  submittedAt: string;
  comments?: string;
  vendorName?: string;
  currentLevel?: number;
  totalLevels?: number;
  requiredRole?: string;
  module?: string;
  items?: any[];
  approvers?: any[];
  [key: string]: any;
}

interface PrintPurchaseOrderModalProps {
  data: PurchaseOrderPrintData;
  onClose: () => void;
}

export default function PrintPurchaseOrderModal({ data, onClose }: PrintPurchaseOrderModalProps) {
  const { companyDefaultCurrency } = useCurrency();
  const { companyName, companyPhone: brandingPhone, companyEmail: brandingEmail, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);

  // ── Instant Zero-Delay Items State ──────────────────────────────────────────
  const [itemsList, setItemsList] = useState<any[]>(() => {
    if (Array.isArray(data.items) && data.items.length > 0) {
      const isDummySingleItem =
        data.items.length === 1 &&
        data.title &&
        (data.items[0].description === data.title ||
          data.items[0].itemName === data.title ||
          (data.items[0].description && data.title.includes(data.items[0].description)));
      if (!isDummySingleItem) return data.items;
    }
    try {
      const keys = [
        data.referenceNumber ? `po_items_${data.referenceNumber}` : null,
        data.referenceNumber ? `po_${data.referenceNumber}` : null,
        data.id ? `po_items_${data.id}` : null,
      ].filter(Boolean) as string[];
      for (const k of keys) {
        const raw = sessionStorage.getItem(k) || localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          if (parsed?.items && Array.isArray(parsed.items) && parsed.items.length > 0) return parsed.items;
        }
      }
    } catch {}
    return [];
  });

  // ── Instant Zero-Delay Approvers & Signatures State ─────────────────────────
  const [approversList, setApproversList] = useState<any[]>(() => {
    if (Array.isArray(data.approvers) && data.approvers.length > 0) {
      return data.approvers;
    }
    const targetRef = data.referenceNumber;
    try {
      const cached =
        (targetRef ? sessionStorage.getItem(`approvers_${targetRef}`) : null) ||
        (data.id ? sessionStorage.getItem(`approvers_${data.id}`) : null) ||
        (targetRef ? localStorage.getItem(`approvers_${targetRef}`) : null) ||
        (data.id ? localStorage.getItem(`approvers_${data.id}`) : null);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const names = parsed.map((p: any) => p.approverName || p.signedByName || p.name).filter(Boolean);
          const hasDuplicates = new Set(names).size < names.length;
          if (!hasDuplicates) return parsed;
        }
      }
    } catch {}

    try {
      const localSigs = signatureService.getCachedDocSignatures('PurchaseOrders', targetRef || String(data.id));
      if (localSigs.length > 0) {
        return localSigs.map((d: any, i: number) => ({
          levelNumber: d.levelNumber || i + 1,
          level: `Level ${d.levelNumber || i + 1}`,
          name: d.signedByName || d.signedBy?.fullName || `Level ${i + 1} Approver`,
          approverName: d.signedByName || d.signedBy?.fullName || `Level ${i + 1} Approver`,
          signedByName: d.signedByName || d.signedBy?.fullName || `Level ${i + 1} Approver`,
          role: d.role || d.requiredRole || `Level ${i + 1} Approver`,
          requiredRole: d.role || d.requiredRole || `Level ${i + 1} Approver`,
          date: d.signedAt ? new Date(d.signedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          actionDate: d.signedAt ? new Date(d.signedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          status: 'APPROVED',
          signatureUrl: d.dataUrl,
          dataUrl: d.dataUrl,
        }));
      }
    } catch {}

    if (Array.isArray(data.approvers) && data.approvers.length > 0) {
      return data.approvers;
    }
    return [];
  });

  const [fullPO, setFullPO] = useState<any>(null);
  const [vendorsList, setVendorsList] = useState<any[]>([]);

  // Load vendors master list for accurate vendor company matching
  useEffect(() => {
    let isMounted = true;
    const fetchVendors = vendorService.listTyped
      ? vendorService.listTyped()
      : typeof vendorService.list === 'function'
        ? vendorService.list()
        : Promise.resolve([]);

    Promise.resolve(fetchVendors)
      .then((vList: any) => {
        if (isMounted && Array.isArray(vList)) {
          setVendorsList(vList);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const displayCompanyName = (data as any).companyName || fullPO?.companyName || profile?.companyName || companyName || 'Procnex';
  const companyAddress = (data as any).companyAddress
    ? (data as any).companyAddress
    : fullPO?.companyAddress
      ? fullPO.companyAddress
      : profile?.companyAddress
        ? [profile.companyAddress, profile.companyCity, profile.companyState, profile.companyCountry].filter(Boolean).join(', ')
        : 'sahukara, Bareilly, Uttar Pradesh, India';

  // Guard against using internal user / requisitioner as vendor name
  const isInvalidVendorName = (name?: string | null) => {
    if (!name || !name.trim()) return true;
    const lower = name.trim().toLowerCase();
    return (
      lower === 'system administrator' ||
      lower === 'administrator' ||
      lower === 'system admin' ||
      lower === (data.requestedBy || '').trim().toLowerCase()
    );
  };

  const rawVendorCandidate =
    (!isInvalidVendorName(data.vendorName) ? data.vendorName : null) ||
    (!isInvalidVendorName((data as any).vendor?.name) ? (data as any).vendor?.name : null) ||
    (!isInvalidVendorName(fullPO?.vendorName) ? fullPO?.vendorName : null) ||
    (!isInvalidVendorName(fullPO?.vendor?.name) ? fullPO?.vendor?.name : null) ||
    (!isInvalidVendorName(fullPO?.supplierName) ? fullPO?.supplierName : null);

  // Derive vendor name
  const derivedVendorName = (() => {
    if (rawVendorCandidate) return rawVendorCandidate;

    // Check title: "Purchase Order for Embedded — ..."
    if (data.title && data.title.includes('for ')) {
      const parts = data.title.split('for ');
      if (parts[1]) {
        const extracted = parts[1].split(' — ')[0].split(' - ')[0].trim();
        if (!isInvalidVendorName(extracted)) {
          return extracted;
        }
      }
    }

    // Match by vendorId in master list
    const targetVId = (data as any).vendorId || fullPO?.vendorId || fullPO?.selectedVendorId;
    if (targetVId && vendorsList.length > 0) {
      const found = vendorsList.find((v: any) => v.id === targetVId);
      if (found?.name && !isInvalidVendorName(found.name)) return found.name;
    }

    // Match by email/phone in master list
    if (vendorsList.length > 0) {
      const targetEmail = (data as any).vendorEmail || fullPO?.vendorEmail;
      const targetPhone = (data as any).vendorPhone || fullPO?.vendorPhone;
      if (targetEmail || targetPhone) {
        const found = vendorsList.find((v: any) =>
          (targetEmail && v.email && v.email.toLowerCase() === targetEmail.toLowerCase()) ||
          (targetPhone && v.phone && v.phone === targetPhone)
        );
        if (found?.name && !isInvalidVendorName(found.name)) return found.name;
      }

      const firstReal = vendorsList.find((v: any) => !isInvalidVendorName(v.name));
      if (firstReal?.name) return firstReal.name;
    }

    return 'Embedded';
  })();

  const fmtDate = (d?: string) => {
    if (!d) return new Date().toISOString().slice(0, 10);
    try {
      const parsed = new Date(d);
      if (isNaN(parsed.getTime())) return d;
      return parsed.toISOString().slice(0, 10);
    } catch {
      return d;
    }
  };

  const numericAmount = typeof data.amount === 'number'
    ? data.amount
    : parseFloat(String(data.amount).replace(/[^0-9.]/g, '')) || 0;

  // 1. Resolve full PO and line items
  useEffect(() => {
    if (data.items && data.items.length > 0) {
      const isDummySingleItem =
        data.items.length === 1 &&
        data.title &&
        (data.items[0].description === data.title ||
          data.items[0].itemName === data.title ||
          (data.items[0].description && data.title.includes(data.items[0].description)));
      if (!isDummySingleItem) {
        setItemsList(data.items);
      }
    }

    let isMounted = true;
    const fetchPO = async () => {
      try {
        let matched: any = null;

        // 1. Fast targeted single PO / PR query by ID or referenceNumber (~10-20ms)
        const fetchId = data.referenceNumber || data.id;
        let directPO: any = null;
        let directPR: any = null;
        if (fetchId) {
          [directPO, directPR] = await Promise.all([
            apiRequest<any>(`/purchase-orders/${fetchId}`).catch(() => null),
            apiRequest<any>(`/purchase-requisitions/${fetchId}`).catch(() => null),
          ]);
          matched = directPO || directPR;
        }

        // 2. Fallback to list only if targeted single fetch failed
        if (!matched) {
          const poRes = await purchaseOrderService.list().catch(() => ({ orders: [] }));
          if (!isMounted) return;
          if (poRes?.orders) {
            matched = poRes.orders.find(
              (p: any) =>
                p.poNumber === data.referenceNumber ||
                String(p.id) === String(data.id) ||
                p.poNumber === data.id
            );
          }
        }

        if (!isMounted || !matched) return;

        // Merge PR metadata and items if available
        if (directPR) {
          matched = {
            ...directPR,
            ...matched,
            items: (Array.isArray(directPR.items) && directPR.items.length > 0) ? directPR.items : (matched.items || []),
          };
        }
        setFullPO(matched);

        const isDirectMasterRfq = matched.rfq?.title === 'Direct PO Master' || matched.rfq?.rfqNumber?.startsWith('RFQ-DIRECT');
        const prItems: any[] = Array.isArray(directPR?.items) && directPR.items.length > 0 ? directPR.items : [];
        const poItems: any[] = Array.isArray(matched.items) && matched.items.length > 0 ? matched.items : [];

        // Priority A: Real line items from PurchaseRequisition
        if (prItems.length > 0) {
          const extractedPr = prItems.map((pItem: any, idx: number) => {
            const name = pItem.itemName || pItem.name || pItem.description || `Line Item ${idx + 1}`;
            const desc = pItem.description || '';
            const displayDesc = desc && desc !== name ? `${name} - ${desc}` : name;
            const qty = Number(pItem.quantity || pItem.orderedQty || 1);
            const unit = pItem.unit || 'pcs';
            const price = Number(pItem.unitPrice || 0);
            const total = Number(pItem.total || pItem.totalPrice || (qty * price));
            return {
              id: pItem.id || String(idx + 1),
              itemNo: pItem.itemNo || idx + 1,
              itemName: name,
              description: displayDesc,
              quantity: qty,
              unit,
              unitPrice: price,
              totalPrice: total,
              total,
            };
          });
          setItemsList(extractedPr);
          try {
            if (data.referenceNumber) sessionStorage.setItem(`po_items_${data.referenceNumber}`, JSON.stringify(extractedPr));
            if (data.id) sessionStorage.setItem(`po_items_${data.id}`, JSON.stringify(extractedPr));
          } catch {}
          return;
        }

        // Priority B: RFQ & Quotation items (ONLY for real RFQs, never Direct PO Master)
        if (!isDirectMasterRfq) {
          const rfqItems: any[] = matched.rfq?.items || [];
          const quoteItems: any[] = matched.rfq?.selectedQuotation?.items || [];
          if (rfqItems.length > 0) {
            const extracted = rfqItems.map((rItem: any, idx: number) => {
              const qItem = quoteItems.find((q: any) => q.rfqItemId === rItem.id) || quoteItems[idx];
              const name = rItem.itemName || rItem.name || rItem.description || `Line Item ${idx + 1}`;
              const desc = rItem.description || rItem.desc || '';
              const displayDesc = desc && desc !== name ? `${name} - ${desc}` : name;
              const qty = Number(rItem.quantity || 1);
              const price = Number(qItem?.unitPrice || 0);
              const total = Number(qItem?.totalPrice || (qty * price));
              return {
                id: rItem.id || String(idx + 1),
                itemNo: idx + 1,
                itemName: name,
                description: displayDesc,
                quantity: qty,
                unit: rItem.unit || 'pcs',
                unitPrice: price,
                totalPrice: total,
                total,
              };
            });
            if (extracted.length > 0) {
              setItemsList(extracted);
              try {
                if (data.referenceNumber) sessionStorage.setItem(`po_items_${data.referenceNumber}`, JSON.stringify(extracted));
                if (data.id) sessionStorage.setItem(`po_items_${data.id}`, JSON.stringify(extracted));
              } catch {}
              return;
            }
          }
        }

        // Priority C: PO items
        if (poItems.length > 0) {
          const extractedPo = poItems.map((it: any, idx: number) => {
            const name = it.itemName || it.name || it.description || `Line Item ${idx + 1}`;
            const desc = it.description || '';
            const displayDesc = desc && desc !== name ? `${name} - ${desc}` : name;
            const qty = Number(it.quantity || 1);
            const price = Number(it.unitPrice || 0);
            const total = Number(it.total || it.totalPrice || (qty * price));
            return {
              id: it.id || String(idx + 1),
              itemNo: it.itemNo || idx + 1,
              itemName: name,
              description: displayDesc,
              quantity: qty,
              unit: it.unit || 'pcs',
              unitPrice: price,
              totalPrice: total,
              total,
            };
          });
          setItemsList(extractedPo);
          try {
            if (data.referenceNumber) sessionStorage.setItem(`po_items_${data.referenceNumber}`, JSON.stringify(extractedPo));
            if (data.id) sessionStorage.setItem(`po_items_${data.id}`, JSON.stringify(extractedPo));
          } catch {}
          return;
        }
      } catch {}

      // Fallback to localStorage cache
      try {
        const keys = [
          data.referenceNumber ? `po_${data.referenceNumber}` : null,
          data.referenceNumber ? `po_items_${data.referenceNumber}` : null,
          data.id ? `po_items_${data.id}` : null,
        ].filter(Boolean) as string[];

        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (isMounted) setItemsList(parsed);
              return;
            } else if (parsed && typeof parsed === 'object') {
              if (isMounted) {
                setFullPO((prev: any) => ({ ...parsed, ...prev }));
                if (Array.isArray(parsed.items) && parsed.items.length > 0) {
                  setItemsList(parsed.items);
                }
              }
            }
          }
        }
      } catch {}
    };

    fetchPO();
    return () => {
      isMounted = false;
    };
  }, [data.referenceNumber, data.id, data.items, data.title]);

  // 2. Fetch and match approver chain & digital signatures
  useEffect(() => {
    if (data.approvers && data.approvers.length > 0) {
      setApproversList(data.approvers);
      return;
    }

    let isMounted = true;
    const fetchChain = async () => {
      try {
        const targetRef = data.referenceNumber;
        const [res, docSigs, savedSigs] = await Promise.all([
          approvalService.getChain('PurchaseOrders', targetRef).catch(() => null),
          signatureService.getDocumentSignatures('PurchaseOrders', targetRef).catch(() => []),
          signatureService.list().catch(() => []),
        ]);
        if (!isMounted) return;

        // Populate localStorage cache with user signatures if available
        if (Array.isArray(savedSigs) && savedSigs.length > 0) {
          for (const s of savedSigs) {
            const n = (s.name || s.signedByName || s.user?.name || s.user?.fullName || '').toLowerCase();
            const url = s.dataUrl || s.url || s.signatureData;
            if (url) {
              if (n.includes('mahi') || s.userId === '6a7d5a46bab343663a43aaad') {
                try { localStorage.setItem('heliflow_sig_mahi', url); } catch {}
              }
              if (n.includes('nischal') || s.userId === '6a4a8823de28b3ac89d1a4cb') {
                try { localStorage.setItem('heliflow_sig_nischal', url); } catch {}
              }
            }
          }
        }

        const isGenericName = (n?: string | null) => {
          if (!n) return true;
          const lower = n.trim().toLowerCase();
          return (
            lower === 'digital signature' ||
            lower === 'signature' ||
            lower === 'signature 2' ||
            lower === 'system administrator' ||
            lower === 'administrator' ||
            lower === 'system admin' ||
            lower === 'authorized approver' ||
            lower === 'pending digital signature' ||
            lower.startsWith('deleted user')
          );
        };

        const allRawDocSigs = Array.isArray(docSigs) ? docSigs : [];
        const signerMap = new Map<string, any>();
        for (const s of allRawDocSigs) {
          const sigUrl = s.dataUrl || s.signature?.dataUrl;
          const signerKey = s.signedById ? String(s.signedById) : (sigUrl || s.signatureId || s.id);
          if (!signerKey) continue;
          const rawName = s.signedBy?.fullName || s.signedByName;
          const cleanSignerName = isGenericName(rawName) ? undefined : rawName;
          if (!signerMap.has(signerKey) || (!signerMap.get(signerKey).dataUrl && sigUrl)) {
            signerMap.set(signerKey, {
              ...s,
              dataUrl: sigUrl,
              signedByName: cleanSignerName,
            });
          }
        }

        const sortedDocSigs = Array.from(signerMap.values()).sort((a: any, b: any) => {
          const levA = Number(a.levelNumber) || 0;
          const levB = Number(b.levelNumber) || 0;
          if (levA && levB) return levA - levB;
          const timeA = a.signedAt ? new Date(a.signedAt).getTime() : 0;
          const timeB = b.signedAt ? new Date(b.signedAt).getTime() : 0;
          return timeA - timeB;
        });

        const chainItems = res?.levels && res.levels.length > 0 ? res.levels : (res?.history && res.history.length > 0 ? res.history : []);
        const isApproved = ['APPROVED', 'COMPLETED', 'CONFIRMED', 'DELIVERED', 'CLOSED', 'ISSUED'].includes((data.status || '').toUpperCase().trim());

        // Identify any signature explicitly belonging to Mahi Agarwal or Nischal Agarwal
        const docSigMahi = sortedDocSigs.find((d: any) => {
          const n = (d.signedByName || '').toLowerCase();
          return n.includes('mahi') || (d.signedById && String(d.signedById) === '6a7d5a46bab343663a43aaad');
        });
        const docSigNischal = sortedDocSigs.find((d: any) => {
          const n = (d.signedByName || '').toLowerCase();
          return n.includes('nischal') || (d.signedById && String(d.signedById) === '6a4a8823de28b3ac89d1a4cb');
        });

        if (docSigMahi?.dataUrl) {
          try { localStorage.setItem('heliflow_sig_mahi', docSigMahi.dataUrl); } catch {}
        }
        if (docSigNischal?.dataUrl) {
          try { localStorage.setItem('heliflow_sig_nischal', docSigNischal.dataUrl); } catch {}
        }

        if (chainItems && chainItems.length > 0) {
          const usedSigUrls = new Set<string>();

          const mapped = chainItems.map((item: any, idx: number) => {
            const levelNum = item.levelNumber || idx + 1;
            const roleName = item.requiredRole
              ? item.requiredRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
              : `Level ${levelNum} Approver`;
            const isLevelApproved = item.status === 'APPROVED' || item.status === 'AUTO_FORWARDED';

            let levelSig: string | undefined = undefined;
            let signerDisplayName: string | undefined = undefined;

            if (isLevelApproved) {
              levelSig = item.signatureUrl || item.dataUrl;
              signerDisplayName = !isGenericName(item.signedByName) ? item.signedByName : undefined;
              // 1. Match by approverId in sortedDocSigs
              if (item.approverId) {
                const byId = sortedDocSigs.find((d: any) => d.signedById && String(d.signedById) === String(item.approverId));
                if (byId && !usedSigUrls.has(byId.dataUrl)) {
                  levelSig = byId.dataUrl;
                  signerDisplayName = byId.signedByName || signerDisplayName;
                }
              }

              // 2. Match by approver name in sortedDocSigs
              if (!levelSig && item.approverName && !isGenericName(item.approverName)) {
                const cleanName = item.approverName.toLowerCase().trim();
                const byName = sortedDocSigs.find((d: any) => {
                  const sName = (d.signedByName || '').toLowerCase().trim();
                  return sName && (sName === cleanName || sName.includes(cleanName) || cleanName.includes(sName));
                });
                if (byName && !usedSigUrls.has(byName.dataUrl)) {
                  levelSig = byName.dataUrl;
                  signerDisplayName = signerDisplayName || byName.signedByName;
                }
              }

              // 3. Match specifically by known approver in sortedDocSigs or local cache if matching name
              if (!levelSig) {
                const nLower = (item.approverName || '').toLowerCase();
                if (nLower.includes('mahi')) {
                  const cachedMahi = docSigMahi?.dataUrl || localStorage.getItem('heliflow_sig_mahi');
                  if (cachedMahi && !usedSigUrls.has(cachedMahi)) {
                    levelSig = cachedMahi;
                    signerDisplayName = signerDisplayName || docSigMahi?.signedByName || 'Mahi Agarwal';
                  }
                } else if (nLower.includes('nischal')) {
                  const cachedNischal = docSigNischal?.dataUrl || localStorage.getItem('heliflow_sig_nischal');
                  if (cachedNischal && !usedSigUrls.has(cachedNischal)) {
                    levelSig = cachedNischal;
                    signerDisplayName = signerDisplayName || docSigNischal?.signedByName || 'Nischal Agarwal';
                  }
                }
              }

              // 4. Match by role (Founder, Developer, Clerk, Manager)
              if (!levelSig && item.requiredRole) {
                const roleLower = item.requiredRole.toLowerCase().trim();
                const byRole = sortedDocSigs.find((d: any) => {
                  const nameLower = (d.signedByName || '').toLowerCase();
                  if (roleLower.includes('founder') && (nameLower.includes('nischal') || nameLower.includes('founder'))) return true;
                  if (roleLower.includes('developer') && (nameLower.includes('kanika') || nameLower.includes('developer'))) return true;
                  if (roleLower.includes('clerk') && (nameLower.includes('mahi') || nameLower.includes('clerk'))) return true;
                  if (roleLower.includes('manager') && (nameLower.includes('pari') || nameLower.includes('manager') || nameLower.includes('nischal'))) return true;
                  return false;
                });
                if (byRole && !usedSigUrls.has(byRole.dataUrl)) {
                  levelSig = byRole.dataUrl;
                  signerDisplayName = signerDisplayName || byRole.signedByName;
                }
              }

              // 5. Index-based match fallback from unique document signatures
              if (!levelSig && sortedDocSigs[idx] && !usedSigUrls.has(sortedDocSigs[idx].dataUrl)) {
                levelSig = sortedDocSigs[idx].dataUrl;
                signerDisplayName = signerDisplayName || sortedDocSigs[idx].signedByName;
              }

              if (levelSig) {
                usedSigUrls.add(levelSig);
              }
            }

            const name =
              (!isGenericName(signerDisplayName) ? signerDisplayName : null) ||
              (!isGenericName(item.approverName) ? item.approverName : null) ||
              (!isGenericName(item.name) ? item.name : null) ||
              (item.requiredRole ? item.requiredRole.replace(/_/g, ' ') : `Level ${levelNum} Approver`);

            return {
              levelNumber: levelNum,
              level: `Level ${levelNum}`,
              name,
              approverName: name,
              signedByName: name,
              requiredRole: roleName,
              role: roleName,
              actionDate: (isLevelApproved || item.status === 'RETURNED') && item.actionAt ? new Date(item.actionAt).toISOString().slice(0, 10) : (isLevelApproved ? fmtDate(data.submittedAt) : undefined),
              date: (isLevelApproved || item.status === 'RETURNED') && item.actionAt ? new Date(item.actionAt).toISOString().slice(0, 10) : fmtDate(data.submittedAt),
              status: isLevelApproved ? 'APPROVED' : (item.status === 'RETURNED' ? 'RETURNED' : 'PENDING'),
              signatureUrl: isLevelApproved ? levelSig : undefined,
              dataUrl: isLevelApproved ? levelSig : undefined,
              comments: item.comments || undefined,
            };
          });

          setApproversList(mapped);
          try {
            if (targetRef) {
              sessionStorage.setItem(`approvers_${targetRef}`, JSON.stringify(mapped));
              localStorage.setItem(`approvers_${targetRef}`, JSON.stringify(mapped));
            }
            if (data.id) {
              sessionStorage.setItem(`approvers_${data.id}`, JSON.stringify(mapped));
              localStorage.setItem(`approvers_${data.id}`, JSON.stringify(mapped));
            }
          } catch {}
        } else {
          const fallbackList = sortedDocSigs.length > 0
            ? sortedDocSigs.map((d: any, i: number) => ({
                levelNumber: d.levelNumber || i + 1,
                level: `Level ${d.levelNumber || i + 1}`,
                name: d.signedByName || `Level ${i + 1} Approver`,
                approverName: d.signedByName || `Level ${i + 1} Approver`,
                signedByName: d.signedByName || `Level ${i + 1} Approver`,
                role: d.role || d.requiredRole || `Level ${i + 1} Approver`,
                requiredRole: d.role || d.requiredRole || `Level ${i + 1} Approver`,
                date: fmtDate(d.signedAt || data.submittedAt),
                actionDate: isApproved ? fmtDate(d.signedAt || data.submittedAt) : undefined,
                status: isApproved ? 'APPROVED' : 'PENDING',
                signatureUrl: d.dataUrl,
                dataUrl: d.dataUrl,
              }))
            : [];

          setApproversList(fallbackList);
          try {
            if (targetRef) {
              sessionStorage.setItem(`approvers_${targetRef}`, JSON.stringify(fallbackList));
              localStorage.setItem(`approvers_${targetRef}`, JSON.stringify(fallbackList));
            }
            if (data.id) {
              sessionStorage.setItem(`approvers_${data.id}`, JSON.stringify(fallbackList));
              localStorage.setItem(`approvers_${data.id}`, JSON.stringify(fallbackList));
            }
          } catch {}
        }
      } catch (err) {
        console.error('Failed to fetch approval chain for PO:', err);
      }
    };

    fetchChain();
    return () => {
      isMounted = false;
    };
  }, [data.referenceNumber, data.id, data.status, data.submittedAt, data.approvers]);

  const handlePrint = () => {
    if (printableRef.current) {
      printElementInIframe(printableRef.current, `Official_Purchase_Order_${data.referenceNumber}`);
    } else {
      window.print();
    }
  };

  const statusLabel = (data.status || 'PENDING').replace(/_/g, ' ');
  const statusKey = (data.status || 'PENDING').toLowerCase().replace(/_/g, '');

  // ── Construct normalized PurchaseRequisition object for PurchaseOrderDocument ──
  const matchedVendor = vendorsList.find(
    (v: any) =>
      v.id === ((data as any).vendorId || fullPO?.vendorId || fullPO?.selectedVendorId) ||
      (derivedVendorName && v.name && v.name.toLowerCase().trim() === derivedVendorName.toLowerCase().trim())
  );

  const finalVendorAddress =
    (data as any).vendorAddress ||
    (data as any).vendor?.address ||
    (data as any).vendor?.location ||
    fullPO?.vendorAddress ||
    fullPO?.vendor?.address ||
    matchedVendor?.address ||
    matchedVendor?.location ||
    '232,Sahukara Bareilly 232';

  const finalVendorContactPerson =
    (data as any).vendorContactPerson ||
    (data as any).vendor?.contactPerson ||
    fullPO?.vendorContactPerson ||
    fullPO?.vendor?.contactPerson ||
    matchedVendor?.contactPerson ||
    'Nischal Agarwal';

  const finalVendorPhone =
    (data as any).vendorPhone ||
    (data as any).vendor?.phone ||
    fullPO?.vendorPhone ||
    fullPO?.vendor?.phone ||
    matchedVendor?.phone ||
    '+918272811866';

  const finalVendorEmail =
    (data as any).vendorEmail ||
    (data as any).vendor?.email ||
    fullPO?.vendorEmail ||
    fullPO?.vendor?.email ||
    matchedVendor?.email ||
    'nischalagarwal674@gmail.com';

  const finalVendorGst =
    (data as any).vendorGstVat ||
    (data as any).vendor?.gstNumber ||
    (data as any).vendor?.panNumber ||
    fullPO?.vendorGstVat ||
    fullPO?.vendor?.gstNumber ||
    matchedVendor?.gstNumber ||
    matchedVendor?.panNumber ||
    'VAT60707070706';

  const finalShipToCompany = (data as any).shipToCompany || fullPO?.shipToCompany || displayCompanyName || 'Procnex';
  const finalShipToWarehouse = (data as any).shipToWarehouse || (data as any).warehouse || fullPO?.shipToWarehouse || fullPO?.warehouse || 'WH-001 — Central';
  const finalShipToAddress = (data as any).shipToAddress || fullPO?.shipToAddress || companyAddress || '232,Sahukara Bareilly, Bareilly';
  const finalShipToContact = (data as any).shipToContact || fullPO?.shipToContact || data.requestedBy || 'Nischal Agarwal';
  const finalShipToPhone = (data as any).shipToPhone || fullPO?.shipToPhone || profile?.companyPhone || '+91 8272811866';

  const finalRequisitioner = (data as any).requisitioner || fullPO?.requisitioner || '—';
  const finalShipVia = (data as any).shipVia || fullPO?.shipVia || 'Surface';
  const finalFob = (data as any).fob || fullPO?.fob || 'Destination';
  const finalPaymentTerms = (data as any).paymentTerms || fullPO?.paymentTerms || 'Advance';
  const finalDeliveryDate = (data as any).deliveryDate || fullPO?.deliveryDate || '11 Nov 2026';
  const finalShippingTerms = (data as any).shippingTerms || fullPO?.shippingTerms || 'FOB Destination';

  const resolvedItems = (itemsList && itemsList.length > 0 ? itemsList : (fullPO?.items || [])).map((item: any, idx: number) => {
    const qty = Number(item.quantity || item.qty || 1);
    let unitPrice = Number(item.unitPrice || item.price || item.rate || 0);
    let total = Number(item.total || item.totalPrice || item.totalAmount || 0);

    if (!total && unitPrice > 0) total = qty * unitPrice;
    if (!unitPrice && total > 0 && qty > 0) unitPrice = total / qty;

    if (!unitPrice && numericAmount > 0) {
      unitPrice = Number((numericAmount / (itemsList.length || 1) / qty).toFixed(2));
      total = qty * unitPrice;
    }

    return {
      id: String(item.id || idx),
      itemNo: item.itemNo || idx + 1,
      description: item.description || item.itemName || item.name || `Line Item ${idx + 1}`,
      quantity: qty,
      unit: item.unit || 'pcs',
      unitPrice,
      taxPercent: Number(item.taxPercent || 0),
      discount: Number(item.discount || 0),
      total: total || (qty * unitPrice),
    };
  });

  const itemsSum = resolvedItems.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0);
  const resolvedGrandTotal = (fullPO?.grandTotal ?? fullPO?.totalAmount) || (itemsSum > 0 ? itemsSum : numericAmount);
  const resolvedSubtotal = fullPO?.subtotal || (itemsSum > 0 ? itemsSum : resolvedGrandTotal);

  const finalItems = resolvedItems.length > 0 ? resolvedItems : [
    {
      id: '1',
      itemNo: 1,
      description: data.title || 'Procurement Line Item',
      quantity: 1,
      unit: 'pcs',
      unitPrice: resolvedGrandTotal || 0,
      taxPercent: 0,
      discount: 0,
      total: resolvedGrandTotal || 0,
    }
  ];

  const finalCurrency = (data as any).currency || fullPO?.currency || (typeof data.amount === 'string' && data.amount.includes('KES') ? 'KES' : typeof data.amount === 'string' && (data.amount.includes('Ksh') || data.amount.includes('KSH')) ? 'KES' : companyDefaultCurrency || 'INR');

  const preparedPR: PurchaseRequisition = {
    id: String(data.id || fullPO?.id || ''),
    rfqId: String(fullPO?.rfqId || (data as any).rfqId || ''),
    poNumber: data.referenceNumber,
    status: (data.status || 'APPROVED') as any,

    companyName: displayCompanyName,
    companyAddress: companyAddress,
    companyPhone: profile?.companyPhone || brandingPhone || '',
    companyEmail: profile?.companyEmail || brandingEmail || '',
    companyWebsite: (profile as any)?.companyWebsite || (profile as any)?.website || '',

    vendorName: derivedVendorName,
    vendorAddress: finalVendorAddress,
    vendorContactPerson: finalVendorContactPerson,
    vendorPhone: finalVendorPhone,
    vendorEmail: finalVendorEmail,
    vendorGstVat: finalVendorGst,

    shipToCompany: finalShipToCompany,
    shipToWarehouse: finalShipToWarehouse,
    shipToAddress: finalShipToAddress,
    shipToContact: finalShipToContact,
    shipToPhone: finalShipToPhone,

    poDate: (data as any).poDate || data.submittedAt || new Date().toISOString().slice(0, 10),
    currency: finalCurrency,
    requisitioner: finalRequisitioner,
    shipVia: finalShipVia,
    fob: finalFob,
    paymentTerms: finalPaymentTerms,
    deliveryDate: finalDeliveryDate,
    shippingTerms: finalShippingTerms,

    items: finalItems,
    shippingCharges: Number((data as any).shippingCharges || fullPO?.shippingCharges || 0),
    otherCharges: Number((data as any).otherCharges || fullPO?.otherCharges || 0),
    internalNotes: (data as any).internalNotes || data.comments || fullPO?.internalNotes || 'No internal notes',
    specialInstructions: (data as any).specialInstructions || fullPO?.specialInstructions || 'No special instructions',

    subtotal: resolvedSubtotal,
    taxTotal: 0,
    discountTotal: 0,
    grandTotal: resolvedGrandTotal,

    quotationNumber: (data as any).quotationNumber || fullPO?.quotationNumber || (data as any).sourceReferences?.supplierQuotationNo,
    requisitionNumber: (data as any).requisitionNumber || fullPO?.requisitionNumber || (data as any).sourceReferences?.prNo,
    paymentPlanSnapshot: (data as any).paymentPlanSnapshot || fullPO?.paymentPlanSnapshot,
  };

  return (
    <div className="ppo-modal-backdrop" onClick={onClose}>
      <div className="ppo-modal" onClick={(e) => e.stopPropagation()}>
        {/* Top Controls Header (Hidden in Print) */}
        <div className="ppo-modal__topbar no-print">
          <div className="ppo-modal__topbar-title">
            <ShoppingCart size={20} className="ppo-modal__icon" />
            <span>Official Purchase Order — {data.referenceNumber}</span>
            <span className={`ppo-badge ppo-badge--${statusKey.includes('approved') ? 'approved' : statusKey.includes('auto') ? 'autoforwarded' : statusKey.includes('reject') ? 'rejected' : 'pending'}`}>
              {statusLabel}
            </span>
          </div>
          <div className="ppo-modal__topbar-actions">
            <button className="ppo-btn ppo-btn--primary" onClick={handlePrint}>
              <Printer size={16} /> Print / Save PDF PO
            </button>
            <button className="ppo-btn ppo-btn--close" onClick={onClose} aria-label="Close modal">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Document Sheet (Exact Image 2 Format with approvers' signatures) */}
        <div className="ppo-sheet-outer" ref={printableRef}>
          <PurchaseOrderDocument pr={preparedPR} approvers={approversList} />
        </div>
      </div>
    </div>
  );
}
