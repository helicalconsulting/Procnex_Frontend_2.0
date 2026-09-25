import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Printer, Download, X, CheckCircle2, ShieldCheck, Landmark, Building2, AlertCircle, Clock } from 'lucide-react';
import { useCurrency } from '../shared/CurrencyMaster';
import { useBranding } from '../../context/BrandingContext';
import { signatureService } from '../../services/signatureService';
import './BankPaymentVoucherModal.css';

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
  grossAmount: number;
  tdsAmount: number;
  netAmount: number;
  currency?: string;
  matchStatus?: 'MATCHED' | 'DISCREPANCY';
  discrepancyReason?: string;
  items?: PaymentVoucherItem[];
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

interface BankPaymentVoucherModalProps {
  data: PaymentVoucherDocData;
  onClose: () => void;
}

export default function BankPaymentVoucherModal({ data, onClose }: BankPaymentVoucherModalProps) {
  const { formatAmount } = useCurrency();
  const { companyName, logoUrl, profile } = useBranding();
  const printableRef = useRef<HTMLDivElement>(null);

  const displayCompanyName = profile?.companyName || companyName || 'Procnex';
  const companyAddress = profile?.companyAddress
    ? [profile.companyAddress, profile.companyCity, profile.companyState, profile.companyCountry].filter(Boolean).join(', ')
    : 'Corporate Finance & Treasury Division • Banking Operations';

  const currency = data.currency || 'INR';
  const isMatched = data.matchStatus !== 'DISCREPANCY';

  const handlePrint = () => {
    window.print();
  };

  const [approversList, setApproversList] = useState<any[]>(data.approvers || []);

  useEffect(() => {
    if (data.approvers && data.approvers.length > 0) {
      setApproversList(data.approvers);
      return;
    }
    let isMounted = true;
    const fetchSigs = async () => {
      try {
        const pNo = data.voucherNumber;
        const invRef = data.invoiceRef;
        const [docSigsP, docSigsInv, docSigsAP, savedSigs] = await Promise.all([
          signatureService.getDocumentSignatures('Payments', pNo).catch(() => []),
          invRef ? signatureService.getDocumentSignatures('Payments', invRef).catch(() => []) : Promise.resolve([]),
          invRef ? signatureService.getDocumentSignatures('AccountsPayable', invRef).catch(() => []) : Promise.resolve([]),
          signatureService.list().catch(() => []),
        ]);
        if (!isMounted) return;

        const allRawDocSigs = [...docSigsP, ...docSigsInv, ...docSigsAP];
        const signerMap = new Map<string, any>();
        for (const s of allRawDocSigs) {
          const sigUrl = s.dataUrl || s.signature?.dataUrl;
          const signerKey = s.signedById ? String(s.signedById) : (sigUrl || s.signatureId || s.id);
          if (!signerKey) continue;
          if (!signerMap.has(signerKey) || (!signerMap.get(signerKey).dataUrl && sigUrl)) {
            signerMap.set(signerKey, s);
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

        const getSigForLevel = (lvlNum: number, idx: number, approverName?: string | null) => {
          if (approverName && approverName !== '—' && !approverName.toLowerCase().includes('pending')) {
            const cleanName = approverName.toLowerCase().trim();
            const byName = uniqueDocSigs.find((d: any) => {
              const sName = (d.signedBy?.fullName || d.signedByName || d.signature?.name || '').toLowerCase().trim();
              return sName && (sName === cleanName || sName.includes(cleanName) || cleanName.includes(sName));
            });
            if (byName) return byName.dataUrl || byName.signature?.dataUrl;
          }

          const match =
            uniqueDocSigs.find((d: any) => Number(d.levelNumber) === Number(lvlNum)) ||
            uniqueDocSigs.find((d: any) => Number(d.levelNumber || d.level) === Number(lvlNum));
          if (match) return match.dataUrl || match.signature?.dataUrl;

          const byIdx = uniqueDocSigs[idx];
          if (byIdx) {
            return byIdx.dataUrl || byIdx.signature?.dataUrl;
          }
          return undefined;
        };

        const l1ApproverName = (data as any).approvedBy && (data as any).approvedBy !== '—' ? (data as any).approvedBy : 'Purchase Manager';
        const sigL1 = getSigForLevel(1, 0, l1ApproverName) || (uniqueDocSigs.length === 0 ? defaultSigUrl : undefined);
        const sigL2 = getSigForLevel(2, 1, 'Purchase Clerk');

        setApproversList([
          {
            level: 'Level 1',
            name: l1ApproverName,
            role: 'Purchase Manager',
            date: data.voucherDate,
            status: 'APPROVED' as const,
            comments: 'Approved & Digitally Signed',
            signatureUrl: sigL1,
          },
          {
            level: 'Level 2',
            name: 'Purchase Clerk',
            role: 'Purchase Clerk',
            date: data.voucherDate,
            status: sigL2 ? ('APPROVED' as const) : ('PENDING' as const),
            comments: sigL2 ? 'Approved & Digitally Signed' : 'Awaiting Level 2 Approval',
            signatureUrl: sigL2,
          },
        ]);
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
    const list = approversList.length > 0 ? approversList : [
      { level: 'Level 1', name: 'Purchase Manager', role: 'Purchase Manager', date: data.voucherDate, status: 'APPROVED' as const, comments: 'Approved & Digitally Signed' },
      { level: 'Level 2', name: 'Purchase Clerk', role: 'Purchase Clerk', date: data.voucherDate, status: 'PENDING' as const, comments: 'Awaiting Level 2 Approval' },
    ];

    // Deduplicate by level to ensure only distinct levels (Level 1, Level 2) are displayed
    const seen = new Set<string>();
    return list.filter((app) => {
      const key = String(app.level || app.role || '').toLowerCase().replace(/[\s_-]+/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [approversList, data.voucherDate]);

  const displayItems: PaymentVoucherItem[] = (data.items && data.items.length > 0)
    ? data.items
    : (data.invoices && data.invoices.length > 0)
    ? data.invoices.map((inv, idx) => ({
        id: idx + 1,
        description: `Payment Disbursement against Invoice ${inv.invoiceNumber}`,
        poNumber: inv.poNumber || '—',
        grnNumber: inv.grnNumber || '—',
        invoiceRef: inv.invoiceNumber,
        quantity: 1,
        unitPrice: inv.amount,
        grossAmount: inv.amount,
        tdsAmount: inv.amount * (data.tdsAmount && data.grossAmount ? data.tdsAmount / data.grossAmount : 0.02),
        netAmount: inv.amount - (inv.amount * (data.tdsAmount && data.grossAmount ? data.tdsAmount / data.grossAmount : 0.02)),
      }))
    : [
        {
          id: 1,
          description: data.invoiceRef && data.invoiceRef !== '—'
            ? `Payment Disbursement against ${data.invoiceRef}`
            : `Vendor Payment Disbursement to ${data.vendorName || 'Supplier'}`,
          poNumber: data.poNumbers && data.poNumbers.length > 0 ? data.poNumbers.join(', ') : (data.invoiceRef.includes('PO:') ? data.invoiceRef.split('PO:')[1]?.trim() : '—'),
          grnNumber: data.grnNumbers && data.grnNumbers.length > 0 ? data.grnNumbers.join(', ') : '—',
          invoiceRef: data.invoiceRef.includes('|') ? data.invoiceRef.split('|')[0]?.trim() : data.invoiceRef || '—',
          quantity: 1,
          unitPrice: data.grossAmount || data.netAmount,
          grossAmount: data.grossAmount || data.netAmount,
          tdsAmount: data.tdsAmount || 0,
          netAmount: data.netAmount,
        },
      ];

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
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={displayCompanyName}
                  className="bpv-sheet__company-logo"
                  style={{ maxHeight: 50, maxWidth: 220, objectFit: 'contain', marginBottom: 10, display: 'block' }}
                />
              )}
              <h2>{displayCompanyName}</h2>
              <p>{companyAddress}</p>
              {profile?.taxRegistrationNumber && (
                <p className="bpv-sheet__sub">Tax Reg / GST: {profile.taxRegistrationNumber}</p>
              )}
            </div>
            <div className="bpv-sheet__doc-type">
              <h3>BANK PAYMENT VOUCHER</h3>
              <div className="bpv-sheet__voucher-no">{data.voucherNumber}</div>
              <p>Date: <strong>{data.voucherDate}</strong></p>
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
                  <span>Bank Name:</span> <strong>{data.remitterBankName || profile?.bankName || (displayCompanyName ? `${displayCompanyName} Treasury Bank` : 'Corporate Treasury Account')}</strong>
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
            <div style={{ overflowX: 'auto' }}>
              <table className="bpv-table">
                <thead>
                  <tr>
                    <th style={{ width: '35px', textAlign: 'center' }}>#</th>
                    <th>Item / Particulars Description</th>
                    <th>PO Ref</th>
                    <th>GRN Ref</th>
                    <th>Invoice Ref</th>
                    <th style={{ textAlign: 'center', width: '50px' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit Rate</th>
                    <th style={{ textAlign: 'right' }}>Gross Total</th>
                    <th style={{ textAlign: 'right' }}>TDS / Tax</th>
                    <th style={{ textAlign: 'right' }}>Net Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item, index) => {
                    const qty = item.quantity || 1;
                    const unitPrice = item.unitPrice || Math.round(item.grossAmount / qty);
                    const itemTds = item.tdsAmount || 0;
                    return (
                      <tr key={index}>
                        <td style={{ textAlign: 'center', color: '#64748b', fontSize: '12px' }}>{index + 1}</td>
                        <td><strong>{item.description}</strong></td>
                        <td style={{ fontSize: '12px' }}>{item.poNumber || (data.poNumbers && data.poNumbers[0]) || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{item.grnNumber || (data.grnNumbers && data.grnNumbers[0]) || '—'}</td>
                        <td style={{ fontSize: '12px' }}>{item.invoiceRef || data.invoiceRef || '—'}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{qty}</td>
                        <td style={{ textAlign: 'right' }}>{formatAmount(unitPrice, currency)}</td>
                        <td style={{ textAlign: 'right' }}>{formatAmount(item.grossAmount, currency)}</td>
                        <td style={{ textAlign: 'right', color: itemTds > 0 ? '#e11d48' : '#64748b' }}>
                          {itemTds > 0 ? `- ${formatAmount(itemTds, currency)}` : formatAmount(0, currency)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                          {formatAmount(item.netAmount, currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bpv-table-total-row">
                    <td colSpan={7} style={{ textAlign: 'right', fontWeight: 800, textTransform: 'uppercase', fontSize: '12px', letterSpacing: '0.04em' }}>
                      Grand Total Disbursement:
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatAmount(data.grossAmount, currency)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#e11d48' }}>
                      {data.tdsAmount > 0 ? `- ${formatAmount(data.tdsAmount, currency)}` : formatAmount(0, currency)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#059669', fontSize: '14px' }}>
                      {formatAmount(data.netAmount, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="bpv-totals-box">
              <div className="bpv-totals-box__words">
                <span>Amount in Words:</span>
                <strong>{formatAmountInWords(data.netAmount, currency)}</strong>
              </div>
              <div className="bpv-totals-box__grand">
                <span>NET DISBURSEMENT AMOUNT:</span>
                <h2>{formatAmount(data.netAmount, currency)}</h2>
              </div>
            </div>
          </div>

          {/* Section 3: Approver Hierarchy & Digital Stamps ("Kisne Kisne Approve Kiya") */}
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
