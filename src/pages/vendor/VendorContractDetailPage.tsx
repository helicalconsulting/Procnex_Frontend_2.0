import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceData } from '../../hooks/useServiceData';
import { contractService, type Contract } from '../../services/contractService';
import { MessageStrip, inferMessageType } from '../../components/shared/MessageStrip';
import { useCurrency } from '../../components/shared/CurrencyMaster';
import { ContractTermsSections } from '@/components/contracts/ContractTermsSections';
import { RecordStatusBadge } from '@/components/shared/RecordStatusBadge';
import { DocumentPreview } from '@/components/shared/DocumentPreview';
import { DetailTabs, DetailTabPanel } from '@/components/ui/detail-tabs';
import { quoteDate } from '@/components/vendor/quotationFormatting';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { EmptyState, MetricCard, PageFrame, PageLead } from '../../components/ui/product';
import { cn } from '../../lib/utils';
import {
  ChevronLeft, Download, FileSignature, CheckCircle2,
  Clock, AlertTriangle, Trash2, FileText,
  ReceiptText, PieChart, Package, Shield, Calendar, Wallet,
  Check, X, Building2, User, PenLine, Upload
} from 'lucide-react';
import { downloadContractAsPdf } from '../../utils/pdfDownload';
import { cleanDuplicateSignatures } from '../../utils/cleanSignatures';
import { sseClient } from '../../services/sseClient';
import { getVendorPath } from '../../utils/tenantResolver';
import { signatureService, type SavedSignature } from '../../services/signatureService';
import { useAuth } from '../../context/AuthContext';
import { DetailSkeleton } from '../../components/shared/Skeleton';
import './VendorContractDetailPage.css';
import './vendor-contract-workspace.css';

const INK_COLORS = [
  { id: 'black', color: '#000000', label: 'Black Ink' },
  { id: 'navy', color: '#0a2342', label: 'Navy Blue' },
  { id: 'royal', color: '#0a6ed1', label: 'Royal Blue' },
  { id: 'red', color: '#dc2626', label: 'Red Ink' },
];

export default function VendorContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatAmount } = useCurrency();

  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<string>(() => searchParams.get('action') === 'sign' ? 'signature' : 'overview');
  const [signerName, setSignerName] = useState(user?.fullName || '');
  const [signerTitle, setSignerTitle] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [pageMsg, setPageMsg] = useState<string | null>(null);
  const [savedSigs, setSavedSigs] = useState<SavedSignature[]>([]);
  const [selectedSigId, setSelectedSigId] = useState<string | number | null>(null);
  const [selectedSigUrl, setSelectedSigUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'saved' | 'draw' | 'upload'>('draw');
  const [hasDrawn, setHasDrawn] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#000000');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved signatures for logged in user
  useEffect(() => {
    signatureService.list()
      .then((sigs) => {
        if (sigs && sigs.length > 0) {
          setSavedSigs(sigs);
          const def = sigs.find((s) => s.isDefault) || sigs[0];
          setSelectedSigId(def.id);
          setSelectedSigUrl(def.dataUrl);
          setMode('saved');
          setHasDrawn(true);
        }
      })
      .catch(() => {});
  }, []);

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
  }, [data?.contract]);

  // Auto-open sign mode from query param
  useEffect(() => {
    if (searchParams.get('action') === 'sign' && activeTab === 'signature' && data && !signed) {
      const timeout = setTimeout(() => {
        document.getElementById('vcd-sign-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [searchParams, activeTab, data, signed]);

  // SSE real-time refresh
  const poTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [mode, activeTab, penColor]);

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
    if (ctx) {
      ctx.strokeStyle = penColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
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
    if (mode === 'saved' && selectedSigUrl) return selectedSigUrl;
    if (mode === 'upload' && uploadedImage) return uploadedImage;
    if (mode === 'draw') return canvasRef.current?.toDataURL('image/png') || null;
    return null;
  };

  const handleSign = async () => {
    if (!signerName.trim()) { setError('Please enter your name.'); return; }
    const sig = getSignatureDataUrl();
    if (!sig) { setError('Please draw, upload, or select your saved signature.'); return; }
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
  };

  const handleDownload = () => {
    if (!data) return;
    downloadContractAsPdf(
      data.contract.contentSnapshot,
      data.contract.contractNumber,
      data.contract.title,
    );
  };

  if (loading) {
    return (
      <PageFrame className="contract-workspace">
        <DetailSkeleton />
      </PageFrame>
    );
  }

  if (fetchError) {
    return (
      <PageFrame className="contract-workspace">
        <Button variant="ghost" size="sm" onClick={() => navigate(getVendorPath('/vendor/contracts'))} className="mb-4 gap-1.5">
          <ChevronLeft className="size-4" /> Back to Contracts
        </Button>
        <Card className="p-8 text-center space-y-3">
          <div className="flex justify-center text-destructive">
            <AlertTriangle className="size-12" />
          </div>
          <h3 className="text-lg font-bold text-foreground">Failed to load contract</h3>
          <p className="text-sm text-muted-foreground">{fetchError}</p>
          <Button onClick={reload} className="mt-2">Retry</Button>
        </Card>
      </PageFrame>
    );
  }

  if (!data) return null;

  const contract = data.contract;
  const status = contract.status;
  const canSign = status === 'AWAITING_VENDOR_SIGNATURE' || status === 'PENDING_VENDOR_SIGNATURE';
  const isSigned = signed || ['VENDOR_SIGNED', 'ACCEPTED', 'COMPLETED', 'ACTIVE'].includes(status);
  const formatDate = (date?: string | null) => quoteDate(date || undefined);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'terms', label: 'Terms & Clauses', icon: Shield, count: (contract.clauses?.length || 0) + (contract.slaEntries?.length || 0) > 0 ? (contract.clauses?.length || 0) + (contract.slaEntries?.length || 0) : undefined },
    { id: 'document', label: 'Document Preview', icon: FileText },
    { id: 'orders', label: 'Purchase Orders', icon: Package, count: contract.purchaseOrders?.length || 0 },
    { id: 'signature', label: isSigned ? 'Signature Info' : 'Sign Contract', icon: FileSignature },
  ];

  return (
    <PageFrame className="contract-workspace">
      {pageMsg && (
        <MessageStrip type={inferMessageType(pageMsg)} onClose={() => setPageMsg(null)} autoHideMs={6000}>
          {pageMsg}
        </MessageStrip>
      )}

      {/* Top Back Action Bar */}
      <div className="mb-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(getVendorPath('/vendor/contracts'))}
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> Back to Contracts
        </Button>
      </div>

      {/* Page Lead Header */}
      <PageLead
        title={contract.title}
        description={`Contract Ref: ${contract.contractNumber} · Awarded to your company`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RecordStatusBadge kind="contract" status={status} className="py-1 px-2.5 text-xs font-semibold" />

            {canSign && (
              <Button size="sm" onClick={() => setActiveTab('signature')} className="gap-1.5">
                <FileSignature className="size-4" /> Sign Now
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
              <Download className="size-4" /> Download PDF
            </Button>

          </div>
        }
      />

      {/* KPI Metrics / Balance Cards (Shown when signed/active) */}
      {isSigned && contractBalance ? (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Wallet}
            tone="primary"
            value={formatAmount(contractBalance.contractValue, contractBalance.currency)}
            label="Contract Value"
            detail="Total awarded amount"
          />
          <MetricCard
            icon={ReceiptText}
            tone="cyan"
            value={formatAmount(contractBalance.consumedValue, contractBalance.currency)}
            label="Consumed by POs"
            detail={`Across ${contractBalance.totalPOs} ${contractBalance.totalPOs === 1 ? 'order' : 'orders'}`}
          />
          <MetricCard
            icon={PieChart}
            tone={contractBalance.remainingValue > 0 ? 'success' : 'warning'}
            value={formatAmount(contractBalance.remainingValue, contractBalance.currency)}
            label="Remaining Balance"
            detail="Available limit"
          />
          <MetricCard
            icon={Package}
            tone="violet"
            value={contractBalance.totalPOs}
            label="Purchase Orders"
            detail="Generated PO count"
          />
        </div>
      ) : (
        /* Standalone Contract Overview Cards when not yet active */
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={Wallet}
            tone="primary"
            value={formatAmount(contract.contractValue, contract.currency)}
            label="Contract Value"
            detail="Total value"
          />
          <MetricCard
            icon={Building2}
            tone="cyan"
            value={contract.contractOwner?.fullName || 'Buyer Team'}
            label="Buyer Representative"
            detail={contract.contractOwner?.email || '—'}
          />
          <MetricCard
            icon={Calendar}
            tone="primary"
            value={formatDate(contract.effectiveDate)}
            label="Effective Date"
            detail={`Expires: ${formatDate(contract.expirationDate)}`}
          />
          <MetricCard
            icon={FileText}
            tone="warning"
            value={contract.rfq?.rfqNumber || 'Direct'}
            label="Source RFQ"
            detail={contract.rfq?.title || 'Contract reference'}
          />
        </div>
      )}

      <DetailTabs id="contract-detail" label="Contract details" tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <DetailTabPanel id="contract-detail" tabId={activeTab} className="space-y-4">
        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
                <Building2 className="size-4 text-primary" /> Contract Information
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Title</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.title}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Contract Number</dt>
                  <dd className="font-semibold text-primary break-words">{contract.contractNumber}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Contract Type</dt>
                  <dd className="font-medium text-foreground break-words">{contract.contractType?.replace(/_/g, ' ') || 'Not specified'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Priority</dt>
                  <dd className="font-medium text-foreground break-words">{contract.priority || 'Not specified'}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
                <User className="size-4 text-primary" /> Buyer & Reference
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Buyer Representative</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.contractOwner?.fullName || 'Not specified'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Buyer Email</dt>
                  <dd className="font-medium text-foreground break-words">{contract.contractOwner?.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Source RFQ</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.rfq?.rfqNumber || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">RFQ Title</dt>
                  <dd className="font-medium text-foreground break-words">{contract.rfq?.title || '—'}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
                <Wallet className="size-4 text-primary" /> Commercial Terms
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Contract Value</dt>
                  <dd className="font-semibold text-foreground break-words">{formatAmount(contract.contractValue, contract.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Currency</dt>
                  <dd className="font-medium text-foreground break-words">{contract.currency || 'KES'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Payment Terms</dt>
                  <dd className="font-medium text-foreground break-words">{contract.paymentTerms || 'Not specified'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Delivery Terms</dt>
                  <dd className="font-medium text-foreground break-words">{contract.deliveryTerms || 'Not specified'}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
                <Calendar className="size-4 text-primary" /> Key Timeline Dates
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Effective Date</dt>
                  <dd className="font-semibold text-foreground break-words">{formatDate(contract.effectiveDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Expiration Date</dt>
                  <dd className="font-semibold text-foreground break-words">{formatDate(contract.expirationDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Created Date</dt>
                  <dd className="font-semibold text-foreground break-words">{formatDate(contract.createdAt)}</dd>
                </div>
                {contract.signedByVendorAt && (
                  <div>
                    <dt className="text-muted-foreground font-medium mb-1">Signed by You</dt>
                  <dd className="font-semibold text-emerald-700 dark:text-emerald-300 break-words">{formatDate(contract.signedByVendorAt)}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </div>
        )}

        {/* ── TERMS & CLAUSES TAB ── */}
        {activeTab === 'terms' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
                <Wallet className="size-4 text-primary" /> Payment & Billing
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Payment Terms</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.paymentTerms || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Payment Schedule</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.paymentSchedule || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Tax / VAT</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.taxPercentage != null ? `${contract.taxPercentage}%` : 'Not specified'}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
                <Package className="size-4 text-primary" /> Delivery & Logistics
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Delivery Terms</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.deliveryTerms || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Location</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.deliveryLocation || '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium mb-1">Lead Time</dt>
                  <dd className="font-semibold text-foreground break-words">{contract.leadTime || '—'}</dd>
                </div>
              </dl>
            </Card>

            <Card className="p-5 space-y-4 lg:col-span-2">
              <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
                <Shield className="size-4 text-primary" /> Compliance
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                {[
                  { label: 'Confidentiality', val: contract.confidentiality },
                  { label: 'Data Protection', val: contract.dataProtection },
                  { label: 'Anti-Bribery', val: contract.antiBriberyCompliance },
                  { label: 'Regulatory Compliance', val: contract.regulatoryCompliance },
                  { label: 'Insurance Required', val: contract.insuranceRequired },
                  { label: 'Audit Rights', val: contract.auditRights },
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center gap-2.5 p-3 rounded-xl border font-medium',
                      item.val ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400' : 'border-border/60 bg-muted/10 text-muted-foreground'
                    )}
                  >
                    {item.val ? <Check className="size-4 shrink-0 text-emerald-600" /> : <X className="size-4 shrink-0 text-muted-foreground" />}
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </Card>
            <ContractTermsSections contract={contract} />
          </div>
        )}

        {/* ── DOCUMENT PREVIEW TAB ── */}
        {activeTab === 'document' && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <FileText className="size-4 text-primary" /> {isSigned ? 'Executed Contract Document' : 'Contract Document'}
              </div>
<span className="text-xs text-muted-foreground">Read-only preview</span>
            </div>
            <div className="p-4 bg-muted/30">
              {contract.contentSnapshot ? (
                <DocumentPreview html={cleanDuplicateSignatures(contract.contentSnapshot)} title={`Document preview for ${contract.contractNumber}`} />
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Document content unavailable"
                  description="No document content has been provided for this contract."
                />
              )}
            </div>
          </Card>
        )}

        {/* ── PURCHASE ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
              <Package className="size-4 text-primary" /> Issued Purchase Orders
            </div>
            {contract.purchaseOrders && contract.purchaseOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" aria-label="Contract purchase orders">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/20 text-left font-semibold text-muted-foreground">
                      <th scope="col" className="p-3">PO Number</th>
                      <th scope="col" className="p-3">Issue Date</th>
                      <th scope="col" className="p-3 text-right">Amount</th>
                      <th scope="col" className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {contract.purchaseOrders.map((po) => (
                      <tr key={po.id} className="hover:bg-accent/20">
                        <td className="p-3 font-semibold text-primary">{po.poNumber}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(po.createdAt)}</td>
                        <td className="p-3 text-right tabular-nums font-semibold text-foreground">{formatAmount(po.totalAmount, contract.currency)}</td>
                        <td className="p-3">
                          <RecordStatusBadge kind="order" status={po.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Package}
                title="No Purchase Orders"
                description="No purchase orders have been generated against this contract yet."
              />
            )}
          </Card>
        )}

        {/* ── SIGNATURE TAB ── */}
        {activeTab === 'signature' && (
          <Card id="vcd-sign-section" className="p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-border/60 pb-3 font-semibold text-foreground text-sm">
              <FileSignature className="size-4 text-primary" /> Digital Signature Execution
            </div>

            {isSigned ? (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="size-6 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Contract Signed & Active</h4>
                  <p className="text-xs mt-1 leading-relaxed">
                    You signed this contract on {formatDate(contract.signedByVendorAt)}. The executed document is legally binding and available for download.
                  </p>
                </div>
              </div>
            ) : canSign ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Signer Authorization Info */}
                <div className="lg:col-span-5 space-y-4 rounded-xl border border-border/60 bg-muted/10 p-4">
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">Signer Authorization</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Executing this document certifies that you are an authorized representative of <strong>{contract.vendor?.name || 'the Vendor Organization'}</strong> with legal authority to enter binding agreements.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1">
                        <User className="size-3 text-muted-foreground" /> Signer Full Name *
                      </label>
                      <Input
                        type="text"
                        className="h-10 rounded-xl"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        disabled={signing}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1">
                        <Building2 className="size-3 text-muted-foreground" /> Title / Role
                      </label>
                      <Input
                        type="text"
                        className="h-10 rounded-xl"
                        value={signerTitle}
                        onChange={(e) => setSignerTitle(e.target.value)}
                        placeholder="e.g. Managing Director"
                        disabled={signing}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-2">
                    <Shield className="size-3.5 text-primary shrink-0" />
                    <span>21 CFR Part 11 & IT Act Compliant Digital Signature</span>
                  </div>
                </div>

                {/* Signature Pad / Controls */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/60">
                    <span className="text-xs font-semibold text-foreground">Signature Studio</span>

                    <div className="flex items-center gap-1.5">
                      {mode === 'draw' && (
                        <div className="flex items-center gap-1.5 mr-2">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase">Ink:</span>
                          {INK_COLORS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setPenColor(c.color);
                                const ctx = canvasRef.current?.getContext('2d');
                                if (ctx) ctx.strokeStyle = c.color;
                              }}
                              className={cn(
                                'size-5 rounded-full border transition-transform',
                                penColor === c.color ? 'scale-110 ring-2 ring-primary ring-offset-1' : 'opacity-80'
                              )}
                              style={{ backgroundColor: c.color }}
                              title={c.label}
                            />
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-1 rounded-lg border border-border/70 p-1 bg-muted/20">
                        {savedSigs.length > 0 && (
                          <Button
                            variant={mode === 'saved' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => { setMode('saved'); setHasDrawn(true); }}
                            disabled={signing}
                          >
                            ⭐ Saved ({savedSigs.length})
                          </Button>
                        )}
                        <Button
                          variant={mode === 'draw' ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 text-xs px-2 gap-1"
                          onClick={() => { setMode('draw'); clearCanvas(); }}
                          disabled={signing}
                        >
                          <PenLine className="size-3" /> Draw
                        </Button>
                        <Button
                          variant={mode === 'upload' ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 text-xs px-2 gap-1"
                          onClick={() => { setMode('upload'); clearCanvas(); fileInputRef.current?.click(); }}
                          disabled={signing}
                        >
                          <Upload className="size-3" /> Upload
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Saved Signatures List */}
                  {mode === 'saved' && (
                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3 space-y-2">
                      <span className="text-xs font-medium text-muted-foreground">Select saved signature:</span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {savedSigs.map((s) => (
                          <div
                            key={s.id}
                            onClick={() => { setSelectedSigId(s.id); setSelectedSigUrl(s.dataUrl); setHasDrawn(true); }}
                            className={cn(
                              'cursor-pointer rounded-xl border p-2 text-center transition-all bg-card',
                              selectedSigId === s.id ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-border/60 hover:border-primary/40'
                            )}
                          >
                            <img src={s.dataUrl} alt={s.name} className="h-10 max-w-full object-contain mx-auto my-1" />
                            <span className="text-[11px] font-semibold text-foreground block truncate">{s.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Draw Canvas */}
                  {mode === 'draw' && (
                    <div className="relative rounded-xl border border-border/70 bg-background overflow-hidden">
                      <canvas
                        ref={canvasRef}
                        className="w-full h-40 cursor-crosshair touch-none"
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
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground/60">
                          <PenLine className="size-4" />
                          <span>Sign here using your mouse or touch screen</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Upload Signature Container */}
                  {mode === 'upload' && (
                    <div
                      className="rounded-xl border border-dashed border-border/80 bg-background p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadedImage ? (
                        <img src={uploadedImage} alt="Uploaded signature" className="max-h-24 mx-auto object-contain" />
                      ) : (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <Upload className="size-6 mx-auto text-primary" />
                          <span>Click to upload PNG or JPG signature image</span>
                        </div>
                      )}
                    </div>
                  )}

                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

                  <div className="flex items-center justify-between pt-2">
                    {hasDrawn ? (
                      <Button variant="ghost" size="sm" onClick={clearCanvas} disabled={signing} className="text-xs text-destructive hover:bg-destructive/10">
                        <Trash2 className="size-3.5" /> Clear Signature
                      </Button>
                    ) : <div />}

                    <Button
                      onClick={handleSign}
                      disabled={signing || !signerName.trim() || !hasDrawn}
                      className="gap-2"
                    >
                      {signing ? (
                        <>
                          <Clock className="size-4 animate-spin" /> Signing Contract…
                        </>
                      ) : (
                        <>
                          <FileSignature className="size-4" /> Execute & Sign Contract
                        </>
                      )}
                    </Button>
                  </div>

                  {error && (
                    <MessageStrip type="error" onClose={() => setError(null)}>
                      {error}
                    </MessageStrip>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={FileSignature}
                title="Signature not required"
                description="This contract is not currently awaiting vendor signature execution."
              />
            )}
          </Card>
        )}
      </DetailTabPanel>
    </PageFrame>
  );
}

