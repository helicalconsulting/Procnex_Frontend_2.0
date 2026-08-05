import { useState, useMemo, useRef, useCallback, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RFQStatus } from '../../types';
import type { RFQTableRow } from '../../types/viewModels';
import ColumnCustomizer from '../shared/ColumnCustomizer';
import { MessageStrip } from '../shared/MessageStrip';
import { rfqService } from '../../services/rfqService';
import { sseClient } from '../../services/sseClient';
import {
  X, CalendarDays, Building2, Tag, Banknote, ClipboardList, Users,
  Package, FileText, Minus, Maximize2, Minimize2, ChevronUp,
  Trophy, Eye, ArrowRightLeft, Shield, TrendingUp,
} from 'lucide-react';
import { useCurrency, CurrencySelector, CurrencyBadge, DEFAULT_CURRENCY } from '../../components/shared/CurrencyMaster';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ViewPaymentPlanModal from '../vendor/ViewPaymentPlanModal';
import '../../pages/rfq/RFQPage.css';

type ModalState = 'open' | 'expanded' | 'minimized';

interface LineItem {
  id: number;
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  expectedDate: string;
}

interface ItemColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  required?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  renderHeader?: () => React.ReactNode;
  renderCell: (item: LineItem, idx: number, formatDate: (d: string) => string) => React.ReactNode;
}

interface EvalCategoryScore {
  categoryId: string;
  categoryName: string;
  weightage: number;
  enabled: boolean;
  earned: number;
  maxPossible: number;
  percentage: number;
  weightedScore: number;
  subParameterScores: Array<{ subParameterId: string; subParameterName: string; maxScore: number; score: number }>;
}

interface EvalSupplierResult {
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  categoryScores: EvalCategoryScore[];
  totalWeightedScore: number;
  finalScore: number;
  rank: number;
  isRecommended: boolean;
}

interface EvalData {
  rfq: { id: string; rfqNumber: string; title: string; rfqType: string; status: string };
  categories: Array<{ id: string; name: string; weightage: number; enabled: boolean }>;
  suppliers: EvalSupplierResult[];
  summary: { totalSuppliers: number; recommendedVendor: EvalSupplierResult | null; averageScore: number };
}

const STATUS_LABELS: Record<RFQStatus, string> = {
  DRAFT: 'Draft', SENT: 'Sent', IN_PROGRESS: 'In Progress', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

const QUOT_STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  SHORTLISTED: 'Shortlisted',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  RETURNED: 'Returned',
};



const PRIORITY_CLASS: Record<string, string> = {
  Low: 'low', Medium: 'medium', High: 'high', Critical: 'critical',
};

const ALL_ITEM_COLUMNS: ItemColumnDef[] = [
  {
    key: 'index', label: '#', defaultVisible: true, required: true,
    width: '48px', align: 'center',
    renderCell: (_item, idx) => <span className="rfq-modal__row-num">{idx + 1}</span>,
  },
  {
    key: 'itemName', label: 'Item Name', defaultVisible: true, required: true,
    width: '180px',
    renderCell: (item) => <span className="rfq-modal__item-name">{item.itemName || '—'}</span>,
  },
  {
    key: 'description', label: 'Description', defaultVisible: true,
    renderCell: (item) => <span className="rfq-modal__item-desc">{item.description || '—'}</span>,
  },
  {
    key: 'quantity', label: 'Qty', defaultVisible: true,
    width: '70px', align: 'right',
    renderCell: (item) => <span className="rfq-modal__item-qty">{item.quantity || '—'}</span>,
  },
  {
    key: 'unit', label: 'Unit', defaultVisible: true,
    width: '72px', align: 'center',
    renderCell: (item) => <span className="rfq-modal__unit-badge">{item.unit}</span>,
  },
  {
    key: 'expectedDate', label: 'Expected Date', defaultVisible: true,
    width: '120px',
    renderCell: (item, _idx, formatDate) => (
      <span className="rfq-modal__item-date">{item.expectedDate ? formatDate(item.expectedDate) : '—'}</span>
    ),
  },
];

const ITEM_COL_WIDTHS: Record<string, string> = {
  index: '48px', itemName: '180px', description: 'auto',
  quantity: '70px', unit: '72px', expectedDate: '120px',
};

// ─── Evaluation Score Colors ───────────────────────────────

const SCORE_GRADE_COLORS = [
  { min: 90, color: '#16a34a', label: 'Excellent' },
  { min: 75, color: '#ca8a04', label: 'Good' },
  { min: 60, color: '#ea580c', label: 'Average' },
  { min: 0, color: '#dc2626', label: 'Poor' },
];

function getScoreGrade(score: number): { color: string; label: string } {
  for (const g of SCORE_GRADE_COLORS) {
    if (score >= g.min) return g;
  }
  return SCORE_GRADE_COLORS[SCORE_GRADE_COLORS.length - 1];
}

const RANK_COLORS = ['#f59e0b', '#9ca3af', '#d97706'];
const VENDOR_BAR_COLORS = ['#0a6ed1', '#16a34a', '#7c3aed', '#ca8a04', '#0891b2', '#ea580c', '#db2777', '#dc2626'];

export interface RFQDetailModalProps {
  rfq: RFQTableRow | null;
  onClose: () => void;
  loading?: boolean;
  enableSend?: boolean;
  onSend?: () => void | Promise<void>;
  sending?: boolean;
  sendError?: string | null;
  sendSuccess?: string | null;
  onDismissSendSuccess?: () => void;
  onDismissSendError?: () => void;
  /** When set, compare link calls this instead of navigating away */
  onCompareQuotations?: (rfqNumber: string) => void;
}

export default function RFQDetailModal({
  rfq,
  onClose,
  loading = false,
  enableSend = false,
  onSend,
  sending = false,
  sendError = null,
  sendSuccess = null,
  onDismissSendSuccess,
  onDismissSendError,
  onCompareQuotations,
}: RFQDetailModalProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'info' | 'items' | 'vendors' | 'quotations'>('info');
  const [modalState, setModalState] = useState<ModalState>('open');
  const [viewPlanQuotation, setViewPlanQuotation] = useState<{ name: string; milestones: Array<{ id: string; title: string; percentage: number }> } | null>(null);
  const [viewDisplayCurrency, setViewDisplayCurrency] = useState('');

  // ── Evaluation State ──────────────────────────────────────
  const [evalData, setEvalData] = useState<EvalData | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [showCharts, setShowCharts] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const loadEvalData = useCallback(async () => {
    if (!rfq) return;
    setEvalLoading(true);
    setEvalError(null);
    try {
      const isTender = rfq.rfqType === 'TENDER' || rfq.rfqType === 'CUSTOM';

      if (isTender) {
        // Tender RFQ: fetch enterprise evaluation scores
        const data = await rfqService.getEvaluationScores(rfq.id);
        const raw = data as Record<string, unknown>;
        const suppliers: EvalSupplierResult[] = (raw.suppliers as unknown[])?.map((s: unknown) => {
          const sup = s as Record<string, unknown>;
          return {
            vendorId: sup.vendorId as string,
            vendorName: sup.vendorName as string,
            vendorEmail: sup.vendorEmail as string,
            categoryScores: (sup.categoryScores as unknown[])?.map((cs: unknown) => {
              const catScore = cs as Record<string, unknown>;
              return {
                categoryId: catScore.categoryId as string,
                categoryName: catScore.categoryName as string,
                weightage: catScore.weightage as number,
                enabled: catScore.enabled as boolean,
                earned: catScore.earned as number,
                maxPossible: catScore.maxPossible as number,
                percentage: catScore.percentage as number,
                weightedScore: catScore.weightedScore as number,
                subParameterScores: (catScore.subParameterScores as unknown[]) || [],
              } as EvalCategoryScore;
            }) || [],
            totalWeightedScore: sup.totalWeightedScore as number,
            finalScore: sup.finalScore as number,
            rank: sup.rank as number,
            isRecommended: sup.isRecommended as boolean,
          } as EvalSupplierResult;
        }) || [];
        const sortedSuppliers = [...suppliers].sort((a, b) => (a.rank && b.rank ? a.rank - b.rank : b.finalScore - a.finalScore));
        const recommendedVendor = sortedSuppliers.find((s: EvalSupplierResult) => s.isRecommended) || sortedSuppliers[0] || null;
        setEvalData({
          rfq: raw.rfq as EvalData['rfq'],
          categories: (raw.categories as unknown[])?.map((c: unknown) => c as EvalData['categories'][0]) || [],
          suppliers: sortedSuppliers,
          summary: {
            totalSuppliers: (raw.summary as Record<string, unknown>)?.totalSuppliers as number || sortedSuppliers.length,
            recommendedVendor,
            averageScore: (raw.summary as Record<string, unknown>)?.averageScore as number || (sortedSuppliers.length ? Math.round(sortedSuppliers.reduce((a, b) => a + b.finalScore, 0) / sortedSuppliers.length) : 0),
          },
        });
      } else {
        // Standard / Normal RFQ: build evaluation scores from submitted quotations
        const quotations = rfq.quotations || [];
        if (quotations.length > 0) {
          const prices = quotations.map((q) => q.totalPrice).filter((v) => v > 0);
          const leads = quotations.map((q) => q.leadTimeDays).filter((v) => v != null && v > 0) as number[];
          const minPrice = prices.length ? Math.min(...prices) : 0;
          const minLead = leads.length ? Math.min(...leads) : 0;

          const customFieldsList = (rfq as any).customFields || [];
          const parsedCustomFields = (Array.isArray(customFieldsList) ? customFieldsList : []).map((rawCf: any) => {
            if (rawCf?.value && typeof rawCf.value === 'string') {
              try { return { ...rawCf, ...JSON.parse(rawCf.value) }; } catch {}
            }
            return rawCf;
          });

          const scoredSuppliers = quotations.map((q) => {
            const priceScore = minPrice && q.totalPrice > 0 ? Math.round((minPrice / q.totalPrice) * 100) : 80;
            const leadScore = minLead && q.leadTimeDays ? Math.round((minLead / q.leadTimeDays) * 100) : 80;
            const ratingScore = 80;
            const complianceScore = 100;
            const responseScore = 90;

            const categoryScores: EvalCategoryScore[] = [
              {
                categoryId: 'pricing', categoryName: 'Pricing (Commercials)', weightage: 45,
                enabled: true, earned: Math.round((priceScore * 45) / 100), maxPossible: 45,
                percentage: priceScore, weightedScore: (priceScore * 45) / 100, subParameterScores: [],
              },
              {
                categoryId: 'leadTime', categoryName: 'Delivery / Lead Time', weightage: 15,
                enabled: true, earned: Math.round((leadScore * 15) / 100), maxPossible: 15,
                percentage: leadScore, weightedScore: (leadScore * 15) / 100, subParameterScores: [],
              },
              {
                categoryId: 'rating', categoryName: 'Vendor Rating', weightage: 15,
                enabled: true, earned: Math.round((ratingScore * 15) / 100), maxPossible: 15,
                percentage: ratingScore, weightedScore: (ratingScore * 15) / 100, subParameterScores: [],
              },
              {
                categoryId: 'compliance', categoryName: 'Compliance & Documents', weightage: 15,
                enabled: true, earned: Math.round((complianceScore * 15) / 100), maxPossible: 15,
                percentage: complianceScore, weightedScore: (complianceScore * 15) / 100, subParameterScores: [],
              },
              {
                categoryId: 'responseTime', categoryName: 'Response Time', weightage: 10,
                enabled: true, earned: Math.round((responseScore * 10) / 100), maxPossible: 10,
                percentage: responseScore, weightedScore: (responseScore * 10) / 100, subParameterScores: [],
              },
            ];

            const cfValues = (q as any).customFieldValues || {};
            parsedCustomFields.forEach((cf: any) => {
              const fieldName = (cf.fieldName || cf.key || cf.label || cf.name || '').trim();
              if (!fieldName || fieldName.toLowerCase() === 'hghjjgh') return;
              const val = cfValues[`cf_${cf.id}`] ?? cfValues[cf.id] ?? cfValues[fieldName] ?? cfValues[fieldName.toLowerCase()];
              const hasVal = val != null && String(val).trim() !== '' && String(val).trim() !== 'false';
              const weight = Number(cf.weightage) || 10;
              categoryScores.push({
                categoryId: `cf_${cf.id}`,
                categoryName: fieldName,
                weightage: weight,
                enabled: true,
                earned: hasVal ? weight : 0,
                maxPossible: weight,
                percentage: hasVal ? 100 : 0,
                weightedScore: hasVal ? weight : 0,
                subParameterScores: [],
              });
            });

            const totalEarned = categoryScores.reduce((sum, c) => sum + (c.earned || 0), 0);
            const totalMax = categoryScores.reduce((sum, c) => sum + (c.maxPossible || 0), 0);
            const finalScore = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 80;

            return {
              q,
              categoryScores,
              finalScore,
            };
          }).sort((a, b) => b.finalScore - a.finalScore || a.q.totalPrice - b.q.totalPrice);

          const suppliers: EvalSupplierResult[] = scoredSuppliers.map(({ q, categoryScores, finalScore }, idx) => ({
            vendorId: String(q.vendorId),
            vendorName: q.vendorName,
            vendorEmail: q.vendorEmail,
            categoryScores,
            totalWeightedScore: finalScore,
            finalScore,
            rank: idx + 1,
            isRecommended: idx === 0,
          }));

          const totalSuppliers = suppliers.length;
          const averageScore = Math.round(suppliers.reduce((sum, s) => sum + s.finalScore, 0) / totalSuppliers);

          const categories = suppliers[0]?.categoryScores.map(c => ({
            id: c.categoryId,
            name: c.categoryName,
            weightage: c.weightage,
            enabled: c.enabled,
          })) || [];

          setEvalData({
            rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, rfqType: rfq.rfqType, status: rfq.status },
            categories,
            suppliers,
            summary: {
              totalSuppliers,
              recommendedVendor: suppliers[0] || null,
              averageScore,
            },
          });
        } else {
          setEvalData({
            rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, rfqType: rfq.rfqType, status: rfq.status },
            categories: [],
            suppliers: [],
            summary: { totalSuppliers: 0, recommendedVendor: null, averageScore: 0 },
          });
        }
      }
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Failed to load evaluation scores');
    } finally {
      setEvalLoading(false);
    }
  }, [rfq]);

  // Fetch evaluation data when tab switches to vendors or quotations tab
  useEffect(() => {
    if ((activeTab !== 'vendors' && activeTab !== 'quotations') || !rfq || evalData) return;
    loadEvalData();
  }, [activeTab, rfq?.id, rfq?.rfqType, loadEvalData, evalData]);

  // Subscribe to real-time evaluation score updates via SSE
  // When auto-scoring completes (vendor submits quotation), admin sees results instantly
  useEffect(() => {
    if (!rfq) return;
    const handler = (data: unknown) => {
      const payload = data as Record<string, unknown>;
      if (payload.rfqId === rfq.id) {
        loadEvalData();
      }
    };
    const unsub = sseClient.on('evaluation_scores_updated', handler);
    return unsub;
  }, [rfq?.id, loadEvalData]);

  const itemDefaultOrder = ALL_ITEM_COLUMNS.map((c) => c.key);
  const itemDefaultVisible = new Set(ALL_ITEM_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
  const [itemColOrder, setItemColOrder] = useState<string[]>(itemDefaultOrder);
  const [itemVisibleKeys, setItemVisibleKeys] = useState<Set<string>>(itemDefaultVisible);
  const [showItemColPanel, setShowItemColPanel] = useState(false);
  const itemColBtnRef = useRef<HTMLButtonElement>(null);

  const visibleItemColumns = useMemo(
    () => itemColOrder
      .map((k) => ALL_ITEM_COLUMNS.find((c) => c.key === k)!)
      .filter((c) => c && itemVisibleKeys.has(c.key)),
    [itemColOrder, itemVisibleKeys],
  );

  const handleToggleItemColumn = useCallback((key: string) => {
    setItemVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleResetItemColumns = useCallback(() => {
    setItemColOrder(itemDefaultOrder);
    setItemVisibleKeys(new Set(itemDefaultVisible));
  }, [itemDefaultOrder, itemDefaultVisible]);

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const isOpen = !!rfq && modalState === 'open';
  const isExpanded = !!rfq && modalState === 'expanded';
  const isMinimized = !!rfq && modalState === 'minimized';

  const { formatAmount, convert, companyDefaultCurrency } = useCurrency();
  const activeViewDisplayCurrency = viewDisplayCurrency || companyDefaultCurrency || DEFAULT_CURRENCY;

  const handleCompare = () => {
    if (!rfq) return;
    if (onCompareQuotations) {
      onCompareQuotations(rfq.rfqNumber);
    } else {
      navigate(`/quotations?rfq=${encodeURIComponent(rfq.rfqNumber)}`);
    }
  };

  useBodyScrollLock(!!rfq);

  if (!rfq) return null;

  return (
    <>
      {(isOpen || isExpanded) && (
        <div
          className={`rfq-modal-backdrop ${isExpanded ? 'rfq-modal-backdrop--expanded' : ''}`}
          onClick={onClose}
        />
      )}

      <div
        className={[
          'rfq-modal',
          isOpen ? 'rfq-modal--open' : '',
          isExpanded ? 'rfq-modal--expanded' : '',
          isMinimized ? 'rfq-modal--minimized' : '',
        ].filter(Boolean).join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rfq-modal__drag-handle" />

        <div
          className="rfq-modal__header"
          onClick={isMinimized ? () => setModalState('open') : undefined}
          style={isMinimized ? { cursor: 'pointer' } : undefined}
        >
          <div className="rfq-modal__header-left">
            <span className="rfq-modal__rfq-num">{rfq.title}</span>
            {!isMinimized && (
              <span className={`rfq-badge rfq-badge--${rfq.status}`}>
                <span className="rfq-badge__dot" />{STATUS_LABELS[rfq.status]}
              </span>
            )}
            {isMinimized && (
              <span className="rfq-modal__minimized-title">{rfq.title}</span>
            )}
          </div>

          {!isMinimized && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', marginRight: 12 }}>
              <ArrowRightLeft size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
              <CurrencySelector
                value={activeViewDisplayCurrency}
                onChange={setViewDisplayCurrency}
                size="sm"
              />
              {viewDisplayCurrency && (
                <button
                  type="button"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-placeholder)', padding: 2,
                    display: 'flex', alignItems: 'center',
                    transition: 'color 0.15s',
                  }}
                  onClick={() => setViewDisplayCurrency('')}
                  title="Reset to default currency"
                  onMouseOver={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  onMouseOut={e => { e.currentTarget.style.color = 'var(--text-placeholder)'; }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          <div className="rfq-modal__window-controls" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="rfq-modal__wc-btn"
              title={isMinimized ? 'Restore' : 'Minimize'}
              onClick={() => setModalState(isMinimized ? 'open' : 'minimized')}
            >
              {isMinimized ? <ChevronUp size={14} /> : <Minus size={14} />}
            </button>
            {!isMinimized && (
              <button
                type="button"
                className="rfq-modal__wc-btn"
                title={isExpanded ? 'Restore' : 'Expand'}
                onClick={() => setModalState(isExpanded ? 'open' : 'expanded')}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            <div className="rfq-modal__wc-divider" />
            <button type="button" className="rfq-modal__wc-btn rfq-modal__wc-btn--close" title="Close" onClick={onClose}>
              <X size={14} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            <div className="rfq-modal__hero">
              {rfq.description && <p className="rfq-modal__description">{rfq.description}</p>}
              <div className="rfq-modal__hero-chips">
                <span className={`rfq-badge rfq-type-badge rfq-type-badge--${rfq.rfqType === 'TENDER' ? 'TENDER' : 'RFQ'}`}>
                  {rfq.rfqType === 'TENDER' ? 'Tender' : 'RFQ'}
                </span>
                <span className={`rfq-modal__priority rfq-modal__priority--${PRIORITY_CLASS[rfq.priority]}`}>
                  <Tag size={10} /> {rfq.priority}
                </span>
                <span className="rfq-modal__dept-chip">
                  <Building2 size={10} /> {rfq.department || '—'}
                </span>
              </div>
            </div>

            <div className="rfq-modal__tabs">
              {(['info', 'items', 'vendors', 'quotations'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`rfq-modal__tab ${activeTab === tab ? 'rfq-modal__tab--active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'info' && <><FileText size={13} /> Details</>}
                  {tab === 'items' && <><ClipboardList size={13} /> Items <span className="rfq-modal__tab-count">{rfq.lineItems.length}</span></>}
                  {tab === 'vendors' && <><Users size={13} /> Vendors <span className="rfq-modal__tab-count">{rfq.vendors.length}</span></>}
                  {tab === 'quotations' && (
                    <>
                      <FileText size={13} /> Quotations
                      <span className={`rfq-modal__tab-count ${rfq.quotationCount > 0 ? 'rfq-modal__tab-count--highlight' : ''}`}>
                        {rfq.quotationCount}
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className="rfq-modal__body">
              {activeTab === 'info' && (
                <div className="rfq-modal__info-panel">
                  <div className="rfq-modal__info-grid">
                    {[
                      { icon: <CalendarDays size={13} />, label: 'Closing Date', value: formatDate(rfq.closingDate) },
                      { icon: <Banknote size={13} />, label: 'Currency', value: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{rfq.currency}{activeViewDisplayCurrency !== rfq.currency && <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>Viewing: {activeViewDisplayCurrency}</span>}</span> },
                      { icon: <CalendarDays size={13} />, label: 'Created On', value: formatDate(rfq.createdAt) },
                      { icon: <Users size={13} />, label: 'Created By', value: rfq.creator },
                      { icon: <Package size={13} />, label: 'Total Items', value: String(rfq.itemCount) },
                      { icon: <Users size={13} />, label: 'Vendors Invited', value: String(rfq.vendorCount) },
                      { icon: <FileText size={13} />, label: 'Quotations Received', value: String(rfq.quotationCount) },
                    ].map((item) => (
                      <div key={item.label} className="rfq-modal__info-item">
                        <span className="rfq-modal__info-label">{item.icon} {item.label}</span>
                        <span className="rfq-modal__info-value">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* ── Bid Security Section ── */}
                  {rfq.bidSecurityRequired && (
                    <div className="rfq-modal__info-panel" style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Shield size={16} style={{ color: 'var(--primary-500)' }} />
                        <strong style={{ fontSize: 14, color: 'var(--text-primary)' }}>Bid Security Required</strong>
                      </div>
                      <div className="rfq-modal__info-grid" style={{ gap: 8 }}>
                        {rfq.bidSecurityType && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Type</span>
                            <span className="rfq-modal__info-value">Bid Bond</span>
                          </div>
                        )}
                        {rfq.bidSecurityValueType === 'FIXED_AMOUNT' && rfq.bidSecurityValue != null && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Required Value</span>
                            <span className="rfq-modal__info-value">
                              {rfq.bidSecurityCurrency || 'KES'} {Number(rfq.bidSecurityValue).toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}
                        {rfq.bidSecurityValueType === 'PERCENTAGE' && rfq.bidSecurityValue != null && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Required Value</span>
                            <span className="rfq-modal__info-value">{Number(rfq.bidSecurityValue)}% of Bid Value</span>
                          </div>
                        )}
                        {rfq.bidSecurityValidityValue != null && (
                          <div className="rfq-modal__info-item">
                            <span className="rfq-modal__info-label">Required Validity</span>
                            <span className="rfq-modal__info-value">
                              {rfq.bidSecurityValidityValue} {rfq.bidSecurityValidityUnit === 'DAYS' ? 'Days' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rfq-modal__estimate-bar">
                    <span className="rfq-modal__estimate-label">Total Estimate</span>
                    <span className="rfq-modal__estimate-value">{rfq.totalEstimate}</span>
                  </div>
                </div>
              )}

              {activeTab === 'items' && (
                <div className="rfq-modal__items-panel">
                  <div className="rfq-modal__items-table-wrap">
                    <table className="rfq-modal__items-table">
                      <colgroup>
                        {visibleItemColumns.map((col) => (
                          <col key={col.key} style={{ width: ITEM_COL_WIDTHS[col.key] || 'auto' }} />
                        ))}
                        <col style={{ width: '36px' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          {visibleItemColumns.map((col) => (
                            <th
                              key={col.key}
                              style={{ textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left' }}
                            >
                              {col.renderHeader ? col.renderHeader() : col.label}
                            </th>
                          ))}
                          <th className="rfq-modal__items-th-action">
                            <div className="rfq-table__col-btn-wrap">
                              <button
                                ref={itemColBtnRef}
                                type="button"
                                className={`rfq-table__col-btn ${showItemColPanel ? 'rfq-table__col-btn--active' : ''}`}
                                onClick={() => setShowItemColPanel((v) => !v)}
                                title="Customize columns"
                                aria-label="Customize columns"
                                aria-expanded={showItemColPanel}
                              >
                                <span /><span /><span />
                              </button>
                              {showItemColPanel && (
                                <ColumnCustomizer
                                  columnOrder={itemColOrder}
                                  visibleKeys={itemVisibleKeys}
                                  allColumns={ALL_ITEM_COLUMNS}
                                  onToggle={handleToggleItemColumn}
                                  onReorder={setItemColOrder}
                                  onReset={handleResetItemColumns}
                                  onClose={() => setShowItemColPanel(false)}
                                  anchorRef={itemColBtnRef}
                                />
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rfq.lineItems.map((item, idx) => (
                          <tr key={item.id}>
                            {visibleItemColumns.map((col) => (
                              <td
                                key={col.key}
                                style={{ textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left' }}
                              >
                                {col.renderCell(item, idx, formatDate)}
                              </td>
                            ))}
                            <td />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="rfq-modal__items-mobile">
                    {rfq.lineItems.map((item, idx) => (
                      <div key={item.id} className="rfq-modal__item-card">
                        <span className="rfq-modal__row-num">{idx + 1}</span>
                        <div className="rfq-modal__item-card-body">
                          <div className="rfq-modal__item-card-name">{item.itemName || '—'}</div>
                          <div className="rfq-modal__item-card-desc">{item.description || '—'}</div>
                          <div className="rfq-modal__item-card-meta">
                            <span className="rfq-modal__unit-badge">{item.unit}</span>
                            <span className="rfq-modal__item-card-qty">× {item.quantity || '—'}</span>
                            {item.expectedDate && (
                              <span className="rfq-modal__item-card-date">
                                <CalendarDays size={11} /> {formatDate(item.expectedDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'vendors' && (
                <div className="rfq-modal__vendors-panel">
                  {rfq.vendors.length > 0 ? (
                    <div className="rfq-modal__vendors-list">
                      {rfq.vendors.map((v) => (
                        <div key={v.id} className="rfq-modal__vendor-row">
                          <span className={`rfq-modal__vendor-avatar rfq-modal__vendor-avatar--${v.avatarMod}`}>{v.initials}</span>
                          <div className="rfq-modal__vendor-info">
                            <span className="rfq-modal__vendor-name">{v.name}</span>
                            <span className="rfq-modal__vendor-email">{v.email}</span>
                          </div>
                          <span className="rfq-modal__vendor-score" style={{
                            color: v.score >= 80 ? '#16a34a' : v.score >= 60 ? '#ca8a04' : '#dc2626',
                          }}>
                            {(v.score ?? evalData?.suppliers.find(s => s.vendorName === v.name)?.finalScore) ? `${v.score ?? evalData?.suppliers.find(s => s.vendorName === v.name)?.finalScore}%` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rfq-modal__no-vendors">
                      <Users size={32} />
                      <p>No vendors invited yet.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'quotations' && (
                <div className="rfq-modal__quotations-panel">
                  {(rfq.quotations?.length ?? 0) > 0 ? (
                    <div className="rfq-modal__quotations-list">
                      {(() => {
                        // Sort quotations by score descending for ranking
                        const sortedQuotes = [...(rfq.quotations ?? [])].sort((a, b) => {
                          const scoreA = a.score ?? -1;
                          const scoreB = b.score ?? -1;
                          if (scoreB !== scoreA) return scoreB - scoreA;
                          return a.totalPrice - b.totalPrice; // tie-break by lower price
                        });
                        return sortedQuotes.map((q, rankIdx) => {
                        const initials = q.vendorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                        const avatarMod = String((q.vendorId % 6) + 1);
                        const isTopScorer = rankIdx === 0 && q.score != null;
                        return (
                          <div key={q.id} className="rfq-modal__quotation-row" style={isTopScorer ? {
                            background: 'rgba(245,158,11,0.04)',
                            border: '1px solid rgba(245,158,11,0.2)',
                            borderRadius: 'var(--radius-md)',
                          } : undefined}>
                            {/* Rank badge */}
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                              fontSize: 11, fontWeight: 800,
                              color: rankIdx === 0 ? '#92400e' : rankIdx === 1 ? '#4b5563' : rankIdx === 2 ? '#92400e' : '#6a6d70',
                              background: rankIdx === 0 ? 'rgba(245,158,11,0.15)' : rankIdx === 1 ? 'rgba(156,163,175,0.15)' : rankIdx === 2 ? 'rgba(217,119,6,0.12)' : 'transparent',
                              border: rankIdx <= 2 ? 'none' : '1px solid var(--border)',
                            }}>
                              {rankIdx === 0 ? <Trophy size={12} style={{ color: '#f59e0b' }} /> : `#${rankIdx + 1}`}
                            </span>
                            <span className={`rfq-modal__vendor-avatar rfq-modal__vendor-avatar--${avatarMod}`}>
                              {initials}
                            </span>
                            <div className="rfq-modal__quotation-info">
                              <span className="rfq-modal__vendor-name">{q.vendorName}</span>
                              <span className="rfq-modal__vendor-email">{q.vendorEmail}</span>
                              <span className="rfq-modal__quotation-meta">
                                Submitted {formatDate(q.submittedAt)}
                                {q.leadTimeDays != null && ` · ${q.leadTimeDays} days lead`}
                                {q.paymentTerms && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                    <span> · {q.paymentTerms}</span>
                                    {q.paymentPlanSnapshot && q.paymentPlanSnapshot.length > 0 && (
                                      <button
                                        type="button"
                                        title="View payment plan"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setViewPlanQuotation({
                                            name: q.paymentTerms || 'Payment Plan',
                                            milestones: q.paymentPlanSnapshot!.map((s, i) => ({
                                              id: `snap_${i}`,
                                              title: s.title,
                                              percentage: s.percentage,
                                            })),
                                          });
                                        }}
                                        style={{
                                          background: 'none', border: 'none',
                                          cursor: 'pointer', color: 'var(--text-secondary)',
                                          padding: 0, display: 'inline-flex',
                                          alignItems: 'center', verticalAlign: 'middle',
                                          transition: 'color 0.15s',
                                          marginLeft: 2,
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.color = 'var(--vendor-primary)'; }}
                                        onMouseOut={e => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                      >
                                        <Eye size={13} />
                                      </button>
                                    )}
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="rfq-modal__quotation-right">
                              {/* Score badge */}
                              {(() => {
                                const scoreVal = (q.score != null && q.score > 0)
                                  ? Math.round(q.score <= 5 ? q.score * 20 : q.score)
                                  : evalData?.suppliers.find(s => s.vendorId === String(q.vendorId) || s.vendorName === q.vendorName)?.finalScore;
                                if (scoreVal == null) return null;
                                const rounded = Math.round(scoreVal);
                                const color = rounded >= 80 ? '#107e3e' : rounded >= 60 ? '#b45309' : '#dc2626';
                                const label = rounded >= 80 ? 'Excellent' : rounded >= 60 ? 'Good' : 'Needs improvement';
                                return (
                                  <span
                                    title={`Score: ${rounded}% — ${label}`}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                      fontSize: 11, fontWeight: 700, cursor: 'help',
                                      color,
                                      background: rounded >= 80 ? 'rgba(16,126,62,0.08)' : rounded >= 60 ? 'rgba(180,83,9,0.08)' : 'rgba(220,38,38,0.08)',
                                      padding: '2px 8px', borderRadius: 4, marginBottom: 4,
                                      border: `1px solid ${rounded >= 80 ? 'rgba(16,126,62,0.2)' : rounded >= 60 ? 'rgba(180,83,9,0.2)' : 'rgba(220,38,38,0.2)'}`,
                                      whiteSpace: 'nowrap',
                                      transition: 'transform 0.15s, box-shadow 0.15s',
                                    }}
                                  >
                                    <TrendingUp size={11} />
                                    Score: {rounded}%
                                  </span>
                                );
                              })()}
                              <span className="rfq-modal__quotation-price">
                                {formatAmount(convert(q.totalPrice, q.currency || rfq.currency, activeViewDisplayCurrency), activeViewDisplayCurrency)}
                                {activeViewDisplayCurrency !== (q.currency || rfq.currency) && (
                                  <span style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'block' }}>
                                    Original: {formatAmount(q.totalPrice, q.currency || rfq.currency)}
                                  </span>
                                )}
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                <CurrencyBadge currency={q.currency || rfq.currency} size="sm" />
                                <span className={`rfq-modal__quotation-status rfq-modal__quotation-status--${q.status.toLowerCase()}`}>
                                  {QUOT_STATUS_LABELS[q.status] || q.status}
                                </span>
                              </span>
                            </div>
                          </div>
                        );
                      });
                      })()}
                    </div>
                  ) : (
                    <div className="rfq-modal__no-vendors">
                      <FileText size={32} />
                      <p>No quotations received yet.</p>
                      <p className="rfq-modal__hint-text">Vendors will appear here after they submit from the portal.</p>
                    </div>
                  )}
                  {(rfq.quotations?.length ?? 0) > 0 && (
                    <button type="button" className="rfq-modal__compare-link" onClick={handleCompare}>
                      Compare all suppliers on Quotations page →
                    </button>
                  )}
                </div>
              )}




            </div>

            <div className="rfq-modal__footer">
              {loading && <p className="rfq-modal__hint">Loading RFQ details…</p>}
              {sendSuccess && (
                <MessageStrip type="success" compact className="sap-message-strip--flush" style={{ flex: 1 }} onClose={onDismissSendSuccess} autoHideMs={3000}>
                  {sendSuccess}
                </MessageStrip>
              )}
              {sendError && (
                <MessageStrip type="error" compact className="sap-message-strip--flush" style={{ flex: 1 }} onClose={onDismissSendError} autoHideMs={5000}>
                  {sendError}
                </MessageStrip>
              )}
              <button type="button" className="rfq-modal__btn rfq-modal__btn--secondary" onClick={onClose}>Close</button>
              {enableSend && rfq.status === 'DRAFT' && (
                <button
                  type="button"
                  className="rfq-modal__btn rfq-modal__btn--primary"
                  onClick={() => navigate(`/rfq/edit/${rfq.id}`)}
                >
                  <FileText size={15} /> Edit Draft
                </button>
              )}
            </div>
          </>
        )}
      </div>

        {/* ── View Payment Plan Modal ── */}
        {viewPlanQuotation && (
          <ViewPaymentPlanModal
            plan={viewPlanQuotation}
            onClose={() => setViewPlanQuotation(null)}
          />
        )}
    </>
  );
}
