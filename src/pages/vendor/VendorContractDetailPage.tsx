import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { contractService, type Contract } from '../../services/contractService';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import {
  ChevronLeft, Download, FileSignature, CheckCircle2,
  Clock, AlertTriangle, Trash2, FileText, Maximize2, Minimize2,
  DollarSign, PieChart, Package, Shield, Calendar, IndianRupee,
  Printer, Check, X, Building2, User, PenLine, Upload
} from 'lucide-react';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import { sseClient } from '../../services/sseClient';
import './VendorContractDetailPage.css';

// ─── Status Badge Mappings ───────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  PENDING_VENDOR_SIGNATURE: 'Awaiting Your Signature',
  AWAITING_VENDOR_SIGNATURE: 'Awaiting Your Signature',
  AWAITING_CUSTOMER_SIGNATURE: 'Awaiting Buyer Signature',
  VENDOR_SIGNED: 'Vendor Signed',
  ACCEPTED: 'Active',
  COMPLETED: 'Completed',
  ACTIVE: 'Active',
  EXPIRING_SOON: 'Expiring Soon',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  TERMINATED: 'Terminated',
};

// ─── Component ──────────────────────────────────────────────

export default function VendorContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatAmount } = useCurrency();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [signerName, setSignerName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullPreview, setFullPreview] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch contract
  const { data, loading, error: fetchError, reload } = useServiceData(
    () => contractService.getVendorContract(id!).then(r => r),
    null as { contract: Contract } | null,
    [id],
    { cacheKey: `vendor:contract:${id}`, cacheTtlMs: 30000 }
  );

  // Compute contract balance from purchase orders
  const contractBalance = useMemo(() => {
    const c = data?.contract;
    if (!c) return null;
    const pos = c.purchaseOrders || [];
    const consumedValue = pos
      .filter((po: { status: string; totalAmount: number }) => po.status !== 'CANCELLED' && po.status !== 'REJECTED')
      .reduce((sum: number, po: { totalAmount: number }) => sum + po.totalAmount, 0);
    return {
      contractValue: c.contractValue || 0,
      currency: c.currency || 'KES',
      consumedValue,
      remainingValue: Math.max(0, (c.contractValue || 0) - consumedValue),
      totalPOs: pos.length,
    };
  }, [data?.contract?.purchaseOrders, data?.contract?.contractValue, data?.contract?.currency]);

  // Auto-open sign mode from query param
  useEffect(() => {
    if (searchParams.get('action') === 'sign' && data && !signed) {
      setActiveTab('signature');
      setTimeout(() => {
        document.getElementById('vcd-sign-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }
  }, [searchParams, data, signed]);

  // SSE real-time refresh
  const poTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!id) return;
    const unsub = sseClient.on('po_created', (payload: unknown) => {
      const event = payload as { contractId?: string };
      if (event?.contractId !== id) return;
      if (poTimeoutRef.current) clearTimeout(poTimeoutRef.current);
      poTimeoutRef.current = setTimeout(() => reload(), 500);
    });
    return () => {
      unsub();
      if (poTimeoutRef.current) clearTimeout(poTimeoutRef.current);
    };
  }, [id, reload]);

  // Init canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0a6ed1';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [mode, activeTab]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height),
      };
    }
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    setHasDrawn(true);
    const ctx = canvasRef.current?.getContext('2d');
    const pos = getCanvasPos(e);
    if (ctx) { ctx.beginPath(); ctx.moveTo(pos.x, pos.y); }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    const pos = getCanvasPos(e);
    if (ctx) { ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
  };

  const stopDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setUploadedImage(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result as string);
      setHasDrawn(true);
    };
    reader.readAsDataURL(file);
  };

  const getSignatureDataUrl = (): string | null => {
    if (mode === 'upload' && uploadedImage) return uploadedImage;
    if (mode === 'draw') return canvasRef.current?.toDataURL('image/png') || null;
    return null;
  };

  const handleSign = useCallback(async () => {
    if (!signerName.trim()) { setError('Please enter your name.'); return; }
    const sig = getSignatureDataUrl();
    if (!sig) { setError('Please draw or upload your signature.'); return; }
    setError(null);
    setSigning(true);
    try {
      await contractService.signContractVendor(id!, signerName.trim(), signerTitle.trim(), sig);
      setPageMsg('Contract signed successfully! The contract is now active.');
      setSigned(true);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setSigning(false);
    }
  }, [id, signerName, signerTitle, reload]);

  const handleDownload = () => {
    if (!data) return;
    downloadContractAsPdf(
      data.contract.contentSnapshot,
      data.contract.contractNumber,
      data.contract.title,
    );
  };

  const handlePrint = () => {
    if (!data?.contract?.contentSnapshot) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(data.contract.contentSnapshot);
    win.document.close();
    win.print();
  };

  if (loading) return <div className="vcd-page"><div className="vcd-page__loading">Loading contract…</div></div>;
  if (fetchError) return (
    <div className="vcd-page">
      <button className="vcd-back" onClick={() => navigate('/vendor/contracts')}><ChevronLeft size={16} /> Back to Contracts</button>
      <div className="vcd-page__error">
        <div className="vcd-page__error-icon"><AlertTriangle size={48} /></div>
        <p style={{ fontWeight: 700, fontSize: 18 }}>Failed to load contract</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{fetchError}</p>
        <button className="vcd-action-btn vcd-action-btn--primary" onClick={reload} style={{ marginTop: 16 }}>Retry</button>
      </div>
    </div>
  );
  if (!data) return null;

  const contract = data.contract;
  const status = contract.status;
  const canSign = status === 'AWAITING_VENDOR_SIGNATURE' || status === 'PENDING_VENDOR_SIGNATURE';
  const isSigned = signed || ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(status);
  const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const tabs = [
    { id: 'overview', label: 'Overview', icon: <FileText size={14} /> },
    { id: 'terms', label: 'Terms & Clauses', icon: <Shield size={14} />, count: (contract.clauses?.length || 0) + (contract.slaEntries?.length || 0) > 0 ? (contract.clauses?.length || 0) + (contract.slaEntries?.length || 0) : undefined },
    { id: 'document', label: 'Document Preview', icon: <FileText size={14} /> },
    { id: 'orders', label: 'Purchase Orders', icon: <Package size={14} />, count: contract.purchaseOrders?.length || 0 },
    { id: 'signature', label: isSigned ? 'Signature Info' : 'Sign Contract', icon: <FileSignature size={14} /> },
  ];

  return (
    <div className="vcd-page">
      {pageMsg && (
        <MessageStrip type={inferMessageType(pageMsg)} onClose={() => setPageMsg(null)} autoHideMs={6000}>
          {pageMsg}
        </MessageStrip>
      )}

      {/* Back Button */}
      <button className="vcd-back" onClick={() => navigate('/vendor/contracts')}>
        <ChevronLeft size={16} /> Back to Contracts
      </button>

      {/* Summary Header */}
      <div className="vcd-summary">
        <div className="vcd-summary__top">
          <div className="vcd-summary__top-left">
            <h1 className="vcd-summary__title">{contract.title}</h1>
            <span className="vcd-summary__number">{contract.contractNumber}</span>
          </div>
          <div className="vcd-summary__top-right">
            <span className={`vc-status vc-status--${status}`}>
              {isSigned ? <CheckCircle2 size={14} /> : canSign ? <Clock size={14} /> : <FileText size={14} />}
              {STATUS_LABELS[status] || status}
            </span>

            {canSign && (
              <button className="vcd-action-btn vcd-action-btn--primary" onClick={() => setActiveTab('signature')}>
                <FileSignature size={14} /> Sign Now
              </button>
            )}
            <button className="vcd-action-btn vcd-action-btn--secondary" onClick={handleDownload}>
              <Download size={14} /> Download PDF
            </button>
            <button className="vcd-action-btn vcd-action-btn--secondary" onClick={handlePrint}>
              <Printer size={14} /> Print
            </button>
          </div>
        </div>

        {/* Balance Cards Summary (Shown when signed/active) */}
        {isSigned && contractBalance && (
          <div className="vcd-balance__cards">
            <div className="vcd-balance__card">
              <div className="vcd-balance__card-icon vcd-balance__card-icon--total">
                <IndianRupee size={20} />
              </div>
              <div className="vcd-balance__card-info">
                <span className="vcd-balance__card-value">{formatAmount(contractBalance.contractValue, contractBalance.currency)}</span>
                <span className="vcd-balance__card-label">Contract Value</span>
              </div>
            </div>

            <div className="vcd-balance__card">
              <div className="vcd-balance__card-icon vcd-balance__card-icon--consumed">
                <DollarSign size={20} />
              </div>
              <div className="vcd-balance__card-info">
                <span className="vcd-balance__card-value">{formatAmount(contractBalance.consumedValue, contractBalance.currency)}</span>
                <span className="vcd-balance__card-label">Consumed by POs</span>
              </div>
            </div>

            <div className="vcd-balance__card">
              <div className={`vcd-balance__card-icon ${contractBalance.remainingValue > 0 ? 'vcd-balance__card-icon--remaining' : 'vcd-balance__card-icon--exhausted'}`}>
                <PieChart size={20} />
              </div>
              <div className="vcd-balance__card-info">
                <span className="vcd-balance__card-value">{formatAmount(contractBalance.remainingValue, contractBalance.currency)}</span>
                <span className="vcd-balance__card-label">Remaining Balance</span>
              </div>
            </div>

            <div className="vcd-balance__card">
              <div className="vcd-balance__card-icon vcd-balance__card-icon--total">
                <Package size={20} />
              </div>
              <div className="vcd-balance__card-info">
                <span className="vcd-balance__card-value">{contractBalance.totalPOs}</span>
                <span className="vcd-balance__card-label">Purchase Orders</span>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="vcd-summary__meta">
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Buyer</span>
            <span className="vcd-summary__item-value">{contract.contractOwner?.fullName || 'Buyer Organization'}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Contract Value</span>
            <span className="vcd-summary__item-value">{formatAmount(contract.contractValue, contract.currency)}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Effective Date</span>
            <span className="vcd-summary__item-value">{formatDate(contract.effectiveDate)}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Expiration Date</span>
            <span className="vcd-summary__item-value">{formatDate(contract.expirationDate)}</span>
          </div>
          <div className="vcd-summary__item">
            <span className="vcd-summary__item-label">Source RFQ</span>
            <span className="vcd-summary__item-value">{contract.rfq?.rfqNumber || '—'}</span>
            {contract.rfq?.title && (
              <span className="vcd-summary__item-sub">{contract.rfq.title}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="vcd-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`vcd-tab ${activeTab === tab.id ? 'vcd-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="vcd-tab__count">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content Panels */}
      <div className="vcd-tab-content">
        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="vcd-grid">
            <div className="vcd-card-panel">
              <h3 className="vcd-panel-title"><Building2 size={16} /> Contract Information</h3>
              <div className="vcd-field-row"><span className="vcd-field-label">Title</span><span className="vcd-field-value">{contract.title}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Contract Number</span><span className="vcd-field-value">{contract.contractNumber}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Contract Type</span><span className="vcd-field-value">{contract.contractType?.replace(/_/g, ' ') || 'General Agreement'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Status</span><span className="vcd-field-value">{STATUS_LABELS[status] || status}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Priority</span><span className="vcd-field-value">{contract.priority || 'Standard'}</span></div>
            </div>

            <div className="vcd-card-panel">
              <h3 className="vcd-panel-title"><User size={16} /> Buyer & Reference</h3>
              <div className="vcd-field-row"><span className="vcd-field-label">Buyer Representative</span><span className="vcd-field-value">{contract.contractOwner?.fullName || 'Procurement Team'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Buyer Email</span><span className="vcd-field-value">{contract.contractOwner?.email || '—'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Source RFQ</span><span className="vcd-field-value">{contract.rfq?.rfqNumber || '—'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">RFQ Title</span><span className="vcd-field-value">{contract.rfq?.title || '—'}</span></div>
            </div>

            <div className="vcd-card-panel">
              <h3 className="vcd-panel-title"><IndianRupee size={16} /> Commercial Terms</h3>
              <div className="vcd-field-row"><span className="vcd-field-label">Contract Value</span><span className="vcd-field-value">{formatAmount(contract.contractValue, contract.currency)}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Currency</span><span className="vcd-field-value">{contract.currency || 'KES'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Payment Terms</span><span className="vcd-field-value">{contract.paymentTerms || 'Net 30'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Delivery Terms</span><span className="vcd-field-value">{contract.deliveryTerms || 'FOB Destination'}</span></div>
            </div>

            <div className="vcd-card-panel">
              <h3 className="vcd-panel-title"><Calendar size={16} /> Key Timeline Dates</h3>
              <div className="vcd-field-row"><span className="vcd-field-label">Effective Date</span><span className="vcd-field-value">{formatDate(contract.effectiveDate)}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Expiration Date</span><span className="vcd-field-value">{formatDate(contract.expirationDate)}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Created Date</span><span className="vcd-field-value">{formatDate(contract.createdAt)}</span></div>
              {contract.signedByVendorAt && <div className="vcd-field-row"><span className="vcd-field-label">Signed by You</span><span className="vcd-field-value">{formatDate(contract.signedByVendorAt)}</span></div>}
            </div>
          </div>
        )}

        {/* ── TERMS & CLAUSES TAB ── */}
        {activeTab === 'terms' && (
          <div className="vcd-grid">
            <div className="vcd-card-panel">
              <h3 className="vcd-panel-title"><IndianRupee size={16} /> Payment & Billing</h3>
              <div className="vcd-field-row"><span className="vcd-field-label">Payment Terms</span><span className="vcd-field-value">{contract.paymentTerms || '—'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Payment Schedule</span><span className="vcd-field-value">{contract.paymentSchedule || '—'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Tax / VAT Percentage</span><span className="vcd-field-value">{contract.taxPercentage ? `${contract.taxPercentage}%` : 'Standard'}</span></div>
            </div>

            <div className="vcd-card-panel">
              <h3 className="vcd-panel-title"><Package size={16} /> Delivery & Logistics</h3>
              <div className="vcd-field-row"><span className="vcd-field-label">Delivery Terms</span><span className="vcd-field-value">{contract.deliveryTerms || '—'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Delivery Location</span><span className="vcd-field-value">{contract.deliveryLocation || '—'}</span></div>
              <div className="vcd-field-row"><span className="vcd-field-label">Lead Time</span><span className="vcd-field-value">{contract.leadTime || '—'}</span></div>
            </div>

            <div className="vcd-card-panel vcd-card-panel--full">
              <h3 className="vcd-panel-title"><Shield size={16} /> Compliance & Warranties</h3>
              <div className="vcd-compliance-grid">
                {[
                  { label: 'Confidentiality', val: contract.confidentiality },
                  { label: 'Data Protection', val: contract.dataProtection },
                  { label: 'Anti-Bribery', val: contract.antiBriberyCompliance },
                  { label: 'Regulatory Compliance', val: contract.regulatoryCompliance },
                  { label: 'Insurance Required', val: contract.insuranceRequired },
                  { label: 'Audit Rights', val: contract.auditRights },
                ].map((item, idx) => (
                  <div key={idx} className={item.val ? 'vcd-comp-item vcd-comp-item--yes' : 'vcd-comp-item vcd-comp-item--no'}>
                    {item.val ? <Check size={14} /> : <X size={14} />} <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── DOCUMENT PREVIEW TAB ── */}
        {activeTab === 'document' && (
          <div className={`vcd-doc-preview ${fullPreview ? 'vcd-doc-preview--full' : ''}`}>
            <div className="vcd-doc-preview__toolbar">
              <div className="vcd-doc-preview__toolbar-left">
                <FileText size={16} />
                <span>Executed Contract Document</span>
              </div>
              <div className="vcd-doc-preview__toolbar-right">
                <button
                  className="vcd-doc-preview__toggle"
                  onClick={() => setFullPreview(!fullPreview)}
                >
                  {fullPreview ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  <span>{fullPreview ? 'Collapse' : 'Full View'}</span>
                </button>
                <button className="vcd-doc-preview__toggle" onClick={handleDownload}>
                  <Download size={15} /> <span>Download</span>
                </button>
              </div>
            </div>
            <div className="vcd-doc-preview__body">
              {contract.contentSnapshot ? (
                <div className="vcd-doc-content" dangerouslySetInnerHTML={{ __html: contract.contentSnapshot }} />
              ) : (
                <div className="vcd-empty-doc">
                  <FileText size={48} />
                  <p>Document content unavailable</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PURCHASE ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <div className="vcd-card-panel vcd-card-panel--full">
            <h3 className="vcd-panel-title"><Package size={16} /> Issued Purchase Orders</h3>
            {contract.purchaseOrders && contract.purchaseOrders.length > 0 ? (
              <table className="vcd-po-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Issue Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.purchaseOrders.map(po => (
                    <tr key={po.id}>
                      <td className="vcd-po-number">{po.poNumber}</td>
                      <td>{formatDate(po.createdAt)}</td>
                      <td className="vcd-po-amount">{formatAmount(po.totalAmount, contract.currency)}</td>
                      <td>
                        <span className={`vc-status vc-status--${po.status}`}>
                          {po.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="vcd-empty-text">No Purchase Orders have been generated against this contract yet.</p>
            )}
          </div>
        )}

        {/* ── SIGNATURE TAB ── */}
        {activeTab === 'signature' && (
          <div id="vcd-sign-section" className="vcd-card-panel vcd-card-panel--full">
            <h3 className="vcd-panel-title"><FileSignature size={18} /> Digital Signature Execution</h3>

            {isSigned ? (
              <div className="vcd-signed-banner">
                <CheckCircle2 size={32} className="vcd-signed-icon" />
                <div>
                  <h4 className="vcd-signed-title">Contract Signed &amp; Active</h4>
                  <p className="vcd-signed-desc">
                    You signed this contract on {formatDate(contract.signedByVendorAt)}. The executed document is binding and available for download.
                  </p>
                </div>
              </div>
            ) : canSign ? (
              <div className="vcd-sign-studio">
                <div className="vcd-sign-studio__left">
                  <div className="vcd-sign-info-card">
                    <h4 className="vcd-sign-info-title">Signer Authorization</h4>
                    <p className="vcd-sign-info-desc">
                      Executing this document certifies that you are an authorized representative of <strong>{contract.vendor?.name || 'the Vendor Organization'}</strong> with legal authority to enter binding agreements.
                    </p>

                    <div className="vcd-form-group">
                      <label className="vcd-form-label">
                        <User size={13} /> Signer Full Name *
                      </label>
                      <input
                        type="text"
                        className="vcd-form-input"
                        value={signerName}
                        onChange={e => setSignerName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        disabled={signing}
                      />
                    </div>

                    <div className="vcd-form-group">
                      <label className="vcd-form-label">
                        <Building2 size={13} /> Title / Role
                      </label>
                      <input
                        type="text"
                        className="vcd-form-input"
                        value={signerTitle}
                        onChange={e => setSignerTitle(e.target.value)}
                        placeholder="e.g. Managing Director"
                        disabled={signing}
                      />
                    </div>

                    <div className="vcd-security-badge">
                      <Shield size={14} />
                      <span>21 CFR Part 11 &amp; IT Act Compliant Digital Signature</span>
                    </div>
                  </div>
                </div>

                <div className="vcd-sign-studio__right">
                  <div className="vcd-signature-pad-card">
                    <div className="vcd-signature-pad-header">
                      <span className="vcd-signature-pad-title">Signature Studio</span>
                      <div className="vcd-segmented-control">
                        <button
                          type="button"
                          className={`vcd-segmented-btn ${mode === 'draw' ? 'vcd-segmented-btn--active' : ''}`}
                          onClick={() => { setMode('draw'); clearCanvas(); }}
                          disabled={signing}
                        >
                          <PenLine size={13} /> Draw
                        </button>
                        <button
                          type="button"
                          className={`vcd-segmented-btn ${mode === 'upload' ? 'vcd-segmented-btn--active' : ''}`}
                          onClick={() => { setMode('upload'); clearCanvas(); fileInputRef.current?.click(); }}
                          disabled={signing}
                        >
                          <Upload size={13} /> Upload
                        </button>
                      </div>
                    </div>

                    {mode === 'draw' && (
                      <div className="vcd-canvas-container">
                        <canvas
                          ref={canvasRef}
                          className="vcd-canvas-element"
                          width={480}
                          height={160}
                          onMouseDown={startDraw}
                          onMouseMove={draw}
                          onMouseUp={stopDraw}
                          onMouseLeave={stopDraw}
                          onTouchStart={startDraw}
                          onTouchMove={draw}
                          onTouchEnd={stopDraw}
                        />
                        {!hasDrawn && (
                          <div className="vcd-canvas-placeholder">
                            <PenLine size={20} />
                            <span>Sign here using your mouse or touch screen</span>
                          </div>
                        )}
                      </div>
                    )}

                    {mode === 'upload' && (
                      <div className="vcd-canvas-container vcd-canvas-container--upload" onClick={() => fileInputRef.current?.click()}>
                        {uploadedImage ? (
                          <img src={uploadedImage} alt="Uploaded signature" className="vcd-uploaded-img" />
                        ) : (
                          <div className="vcd-upload-prompt">
                            <Upload size={28} />
                            <span>Click to upload PNG or JPG signature image</span>
                          </div>
                        )}
                      </div>
                    )}

                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />

                    <div className="vcd-signature-pad-footer">
                      {hasDrawn && (
                        <button type="button" className="vcd-action-btn vcd-action-btn--danger" onClick={clearCanvas} disabled={signing}>
                          <Trash2 size={13} /> Clear
                        </button>
                      )}
                      <button
                        type="button"
                        className="vcd-action-btn vcd-action-btn--primary vcd-action-btn--lg"
                        onClick={handleSign}
                        disabled={signing || !signerName.trim() || !hasDrawn}
                      >
                        {signing ? <><Clock size={16} /> Signing Contract…</> : <><FileSignature size={16} /> Execute &amp; Sign Contract</>}
                      </button>
                    </div>

                    {error && <MessageStrip type="error" compact style={{ marginTop: 12 }} onClose={() => setError(null)}>{error}</MessageStrip>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="vcd-empty-text">This contract is not currently awaiting signature.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
