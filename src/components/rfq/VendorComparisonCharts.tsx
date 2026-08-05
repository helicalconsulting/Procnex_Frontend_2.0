import { useMemo, useState, useCallback, useEffect, useId } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  type TooltipProps,
} from 'recharts';
import {
  BarChart3,
  Maximize2,
  Minimize2,
  X,
} from 'lucide-react';
import type { EvalCategory } from '../../types/rfqEvaluation';
import './RfqEvaluationPanel.css';

// ─── Parameter Color Palette ─────────────────────────────────

const PARAM_COLORS = [
  '#0a6ed1', // SAP Blue
  '#107e3e', // Success Green
  '#e9730c', // Warning Orange
  '#7c3aed', // Purple
  '#0891b2', // Cyan
  '#db2777', // Pink
  '#dc2626', // Red
  '#6366f1', // Indigo
];

// ─── Types ──────────────────────────────────────────────────

interface VendorData {
  id: string;
  name: string;
  overallScore?: number;
}

interface VendorComparisonChartsProps {
  categories: EvalCategory[];
  vendorScores: Record<string, Record<string, Record<string, number>>>;
  vendorNames: VendorData[];
  onFullscreen?: () => void;
  isFullscreen?: boolean;
}

// ─── Custom Tooltip (Exact Match to User Photo with Premium Badge) ───

const CustomTooltip = (props: TooltipProps<number, string>) => {
  const { active, payload, label } = props as TooltipProps<number, string> & {
    payload?: Array<Record<string, unknown>>;
    label?: string;
  };
  if (!active || !payload || payload.length === 0) return null;

  const firstItem = payload[0]?.payload as Record<string, unknown>;
  const vendorFullName = (firstItem?.fullName as string) || label;
  const vendorCode = (firstItem?.vendorCode as string) || '';
  const overallScore = firstItem?.overallScore as number | undefined;

  return (
    <div className="rq-chart__tooltip">
      <div className="rq-chart__tooltip-header">
        {vendorCode && <span className="rq-chart__tooltip-code-pill">{vendorCode}</span>}
        <span className="rq-chart__tooltip-label">{vendorFullName}</span>
      </div>

      <div className="rq-chart__tooltip-row">
        <div className="rq-chart__tooltip-left">
          <span className="rq-chart__tooltip-dot" style={{ backgroundColor: '#00b0ff', boxShadow: '0 0 10px #00b0ff' }} />
          <span className="rq-chart__tooltip-name">Supplier Score Curve</span>
        </div>
        <span className="rq-chart__tooltip-badge rq-chart__tooltip-badge--overall">
          {overallScore !== undefined ? `${overallScore}%` : 'N/A'}
        </span>
      </div>
    </div>
  );
};

// ─── Component ──────────────────────────────────────────────

export default function VendorComparisonCharts({
  categories,
  vendorScores,
  vendorNames,
  onFullscreen,
  isFullscreen = false,
}: VendorComparisonChartsProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const titleId = useId();

  // Filter out empty non-parameter categories (e.g. raw extra fields)
  const enabledCats = useMemo(
    () => categories.filter((c) => c.enabled && (c.weightage === undefined || c.weightage > 0) && c.subParameters && c.subParameters.length > 0),
    [categories],
  );

  // ── Compute per-vendor, per-category percentage scores & overall score ──
  const vendorScoresCalculated = useMemo(() => {
    const map: Record<string, { catPct: Record<string, number>; overallScore: number }> = {};
    for (const v of vendorNames) {
      const catScores: Record<string, number> = {};
      let totalWeightedEarned = 0;
      let totalWeightageSum = 0;

      for (const cat of enabledCats) {
        const enabledParams = cat.subParameters.filter((p) => p.enabled);
        let earned = 0;
        let maxPossible = 0;
        let hasData = false;
        for (const p of enabledParams) {
          const score = vendorScores[v.id]?.[cat.id]?.[p.id];
          if (score !== undefined && score !== null) {
            earned += score;
            hasData = true;
          }
          maxPossible += p.maxScore;
        }
        const pct = hasData ? (maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0) : -1;
        catScores[cat.name] = pct;

        if (pct >= 0) {
          const weight = cat.weightage || (100 / Math.max(1, enabledCats.length));
          totalWeightedEarned += (pct * weight) / 100;
          totalWeightageSum += weight;
        }
      }

      const calculatedScore = totalWeightageSum > 0 ? Math.round((totalWeightedEarned / totalWeightageSum) * 100) : 0;
      const overallScore = v.overallScore !== undefined && v.overallScore > 0 ? v.overallScore : calculatedScore;
      map[v.id] = { catPct: catScores, overallScore };
    }
    return map;
  }, [vendorNames, vendorScores, enabledCats]);

  // ── Sort vendors by overall score ascending so curve goes UPWARDS (v1, v2, v3... Image 2) ──
  const realVendors = useMemo(() => {
    const sorted = [...vendorNames].sort((a, b) => {
      const scoreA = vendorScoresCalculated[a.id]?.overallScore || 0;
      const scoreB = vendorScoresCalculated[b.id]?.overallScore || 0;
      return scoreA - scoreB;
    });
    return sorted.map((v, i) => ({
      ...v,
      code: `v${i + 1}`,
      overallScore: vendorScoresCalculated[v.id]?.overallScore || 0,
      catPct: vendorScoresCalculated[v.id]?.catPct || {},
    }));
  }, [vendorNames, vendorScoresCalculated]);

  // ── Vendor Curve Data (Single Overall Curve) ──
  const vendorCurveData = useMemo(() => {
    return realVendors.map((v) => {
      const row: Record<string, unknown> = {
        vendorCode: v.code,
        fullName: v.name,
        name: v.name.length > 16 ? v.name.slice(0, 16) + '…' : v.name,
        overallScore: v.overallScore,
      };

      enabledCats.forEach((cat, cIdx) => {
        const pCode = `P${cIdx + 1}`;
        const score = v.catPct[cat.name];
        row[pCode] = score !== undefined && score !== -1 ? score : null;
      });

      return row;
    });
  }, [realVendors, enabledCats]);

  // ── Left Y-Axis ticks for parameter codes ──
  const ticksForCats = useMemo(() => {
    if (enabledCats.length === 0) return [20, 40, 60, 80];
    const count = enabledCats.length;
    const step = 80 / Math.max(1, count);
    return enabledCats.map((_, i) => Math.round(10 + (i + 0.5) * step));
  }, [enabledCats]);

  // Escape key for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onFullscreen) {
        onFullscreen();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFullscreen, onFullscreen]);

  if (vendorNames.length === 0 || enabledCats.length === 0) {
    return (
      <div className={`rq-charts ${isFullscreen ? 'rq-charts--fullscreen' : ''}`}>
        {isFullscreen && onFullscreen && (
          <button className="rq-charts__close-btn" onClick={onFullscreen} title="Close fullscreen (Esc)">
            <X size={18} />
          </button>
        )}
        <div className="rq-charts__body">
          <div className="rq-charts__empty">
            <BarChart3 size={32} />
            <p>No evaluation categories or vendor scores available for this RFQ.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rq-charts ${isFullscreen ? 'rq-charts--fullscreen' : ''}`}
      role="region"
      aria-labelledby={titleId}
    >
      {isFullscreen && onFullscreen && (
        <button className="rq-charts__close-btn" onClick={onFullscreen} title="Close fullscreen (Esc)">
          <X size={18} />
        </button>
      )}

      {/* ── Header Controls ── */}
      <div className="rq-charts__header">
        <h3 id={titleId} className="rq-charts__header-title">
          Supplier Comparison Curve
        </h3>

        {onFullscreen && (
          <div className="rq-charts__header-actions">
            <button
              className="rq-charts__btn rq-charts__btn--icon"
              onClick={onFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>
        )}
      </div>

      {/* ── Single Curve Line Chart Container (Image 2 Exact Matching) ── */}
      <div className="rq-charts__body">
        <ResponsiveContainer width="100%" height={isFullscreen ? 450 : 280}>
          <AreaChart
            data={vendorCurveData}
            margin={{ top: 16, right: 65, left: 35, bottom: 20 }}
          >
            <defs>
              <linearGradient id="classyCurveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0a6ed1" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#0a6ed1" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} vertical={true} horizontal={true} />
            
            {/* X-AXIS: Real Vendors v1, v2, v3... sorted ascending */}
            <XAxis
              dataKey="vendorCode"
              tick={{ fontSize: 13, fill: 'var(--text-primary)', fontWeight: 700 }}
              axisLine={{ stroke: 'var(--text-primary)', strokeWidth: 1.5 }}
              tickLine={true}
              height={40}
              label={{
                value: 'Vendors',
                position: 'insideBottomRight',
                offset: -10,
                style: { fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 600 },
              }}
            />
            
            {/* LEFT Y-AXIS: Parameter Labels P1, P2, P3, P4, P5, P6... */}
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              ticks={ticksForCats}
              tick={{ fontSize: 12, fill: 'var(--text-primary)', fontWeight: 700 }}
              axisLine={{ stroke: 'var(--text-primary)', strokeWidth: 1.5 }}
              tickLine={true}
              tickFormatter={(val: number) => {
                const idx = ticksForCats.indexOf(val);
                return idx >= 0 ? `P${idx + 1}` : '';
              }}
              width={65}
              label={{
                value: 'Parameters (P1..Pn)',
                angle: -90,
                position: 'insideLeft',
                offset: 12,
                style: { fontSize: 11, fill: 'var(--primary-500)', fontWeight: 700 },
              }}
            />
            
            {/* RIGHT Y-AXIS: Percentage Scale (5%, 10%, 20%, 50%, 100% — Image 2 Exact Ticks) */}
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              ticks={[5, 10, 20, 50, 100]}
              tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 700 }}
              axisLine={{ stroke: 'var(--text-primary)', strokeWidth: 1.5 }}
              tickLine={true}
              tickFormatter={(v: number) => `${v}%`}
              width={65}
              label={{
                value: 'Score (%)',
                angle: 90,
                position: 'insideRight',
                offset: 12,
                style: { fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 700 },
              }}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--primary-500)', strokeDasharray: '3 3' }} />

            {/* Classy Single Shaded Area Curve */}
            <Area
              yAxisId="right"
              name="Supplier Score Curve"
              type="monotone"
              dataKey="overallScore"
              stroke="#0a6ed1"
              strokeWidth={3.5}
              fillOpacity={1}
              fill="url(#classyCurveGradient)"
              connectNulls={true}
              dot={{
                r: 6,
                strokeWidth: 2.5,
                fill: 'var(--surface-card, #1e2530)',
                stroke: '#0a6ed1',
              }}
              activeDot={{
                r: 9,
                strokeWidth: 3,
                fill: 'var(--surface-card, #1e2530)',
                stroke: '#0a6ed1',
              }}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* ── Footnote Legend: Glassmorphic Vendor & Parameter Mapping ── */}
        <div style={{
          marginTop: 10,
          padding: '10px 14px',
          background: 'var(--surface-elevated, rgba(255,255,255,0.03))',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md, 8px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {/* Vendors Mapping Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: 'var(--text-placeholder)',
              textTransform: 'uppercase', letterSpacing: '0.6px',
              minWidth: 110, flexShrink: 0,
            }}>
              Suppliers (Rank)
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {realVendors.map((v) => (
                <div
                  key={v.id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px',
                    borderRadius: 20,
                    background: 'rgba(10, 110, 209, 0.08)',
                    border: '1px solid rgba(10, 110, 209, 0.2)',
                    fontSize: 12, color: 'var(--text-primary)', fontWeight: 500,
                  }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--primary-500)' }}>{v.code}:</span>
                  <span>{v.name}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: v.overallScore >= 75 ? '#107e3e' : 'var(--primary-500)',
                    background: v.overallScore >= 75 ? 'rgba(16, 126, 62, 0.12)' : 'rgba(10, 110, 209, 0.12)',
                    padding: '1px 6px', borderRadius: 10,
                  }}>
                    {v.overallScore}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border)', opacity: 0.5 }} />

          {/* Evaluation Parameters Mapping Row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: 'var(--text-placeholder)',
              textTransform: 'uppercase', letterSpacing: '0.6px',
              minWidth: 110, flexShrink: 0,
            }}>
              Parameters
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              {enabledCats.map((cat, idx) => {
                const color = PARAM_COLORS[idx % PARAM_COLORS.length];
                return (
                  <div
                    key={cat.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm, 4px)',
                      background: 'var(--surface-card, #1e2530)',
                      border: '1px solid var(--border)',
                      fontSize: 12, color: 'var(--text-primary)',
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color, display: 'inline-block', flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>P{idx + 1}:</span>
                    <span>{cat.name}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: 'var(--text-secondary)',
                      background: 'var(--surface-elevated)',
                      padding: '1px 5px', borderRadius: 4,
                    }}>
                      {cat.weightage}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

