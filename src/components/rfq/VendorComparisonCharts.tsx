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
}

interface VendorComparisonChartsProps {
  categories: EvalCategory[];
  vendorScores: Record<string, Record<string, Record<string, number>>>;
  vendorNames: VendorData[];
  onFullscreen?: () => void;
  isFullscreen?: boolean;
}

// ─── Custom Tooltip (Image 2 Style) ─────────────────────────

const CustomTooltip = (props: TooltipProps<number, string>) => {
  const { active, payload, label } = props as TooltipProps<number, string> & {
    payload?: Array<Record<string, unknown>>;
    label?: string;
  };
  if (!active || !payload || payload.length === 0) return null;

  const firstItem = payload[0]?.payload as Record<string, unknown>;
  const vendorFullName = (firstItem?.fullName as string) || label;
  const vendorCode = (firstItem?.vendorCode as string) || '';

  return (
    <div className="rq-chart__tooltip">
      <div className="rq-chart__tooltip-label">
        {vendorCode ? `${vendorCode}: ` : ''}{vendorFullName}
      </div>
      {payload.map((entry: Record<string, unknown>, idx: number) => {
        const val = entry.value;
        const valStr = val === null || val === undefined || val === -1 ? 'N/A' : `${val}%`;
        return (
          <div key={idx} className="rq-chart__tooltip-row">
            <span
              className="rq-chart__tooltip-dot"
              style={{ backgroundColor: entry.color as string }}
            />
            <span className="rq-chart__tooltip-name">{entry.name as string}</span>
            <span className="rq-chart__tooltip-value">{valStr}</span>
          </div>
        );
      })}
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

  const enabledCats = useMemo(
    () => categories.filter((c) => c.enabled),
    [categories],
  );

  // ── Compute per-vendor, per-category percentage scores ──
  const vendorCatPct = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const v of vendorNames) {
      const catScores: Record<string, number> = {};
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
        catScores[cat.name] = hasData
          ? (maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0)
          : -1;
      }
      map[v.id] = catScores;
    }
    return map;
  }, [vendorNames, vendorScores, enabledCats]);

  // ── Map ONLY REAL vendor list with code (v1, v2, v3...) ──
  const realVendors = useMemo(() => {
    return vendorNames.map((v, i) => ({
      ...v,
      code: `v${i + 1}`,
    }));
  }, [vendorNames]);

  // ── Vendor Curve Data (Strictly Real Vendors Only) ──
  const vendorCurveData = useMemo(() => {
    return realVendors.map((v) => {
      const row: Record<string, unknown> = {
        vendorCode: v.code,
        fullName: v.name,
        name: v.name.length > 16 ? v.name.slice(0, 16) + '…' : v.name,
      };

      enabledCats.forEach((cat, cIdx) => {
        const pCode = `P${cIdx + 1}`;
        const score = vendorCatPct[v.id]?.[cat.name];
        row[pCode] = score !== undefined && score !== -1 ? score : null;
      });

      return row;
    });
  }, [realVendors, enabledCats, vendorCatPct]);

  // ── Legend Click Toggle ──
  const handleLegendClick = useCallback((e: Record<string, unknown>) => {
    const dataKey = e.dataKey as string | undefined;
    if (!dataKey) return;
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  }, []);

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

      {/* ── Single Chart Container (Strict Real Vendor Data Only) ── */}
      <div className="rq-charts__body">
        <ResponsiveContainer width="100%" height={460}>
          <AreaChart
            data={vendorCurveData}
            margin={{ top: 20, right: 60, left: 30, bottom: 28 }}
          >
            <defs>
              {enabledCats.map((cat, idx) => {
                const color = PARAM_COLORS[idx % PARAM_COLORS.length];
                return (
                  <linearGradient key={cat.id} id={`grad_cat_${cat.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.20} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={true} horizontal={true} />
            
            {/* X-AXIS: Real Vendors v1, v2, v3... */}
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
            
            {/* LEFT Y-AXIS: Parameter Labels P1, P2, P3, P4... */}
            <YAxis
              yAxisId="left"
              domain={[0, 100]}
              ticks={[15, 35, 55, 75, 95]}
              tick={{ fontSize: 12, fill: 'var(--text-primary)', fontWeight: 700 }}
              axisLine={{ stroke: 'var(--text-primary)', strokeWidth: 1.5 }}
              tickLine={true}
              tickFormatter={(val: number) => {
                if (val <= 20) return 'P1';
                if (val <= 40) return 'P2';
                if (val <= 60) return 'P3';
                if (val <= 80) return 'P4';
                return 'P5';
              }}
              width={50}
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
              width={55}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--primary-500)', strokeDasharray: '3 3' }} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 14 }}
              iconType="circle"
              iconSize={10}
              onClick={handleLegendClick}
            />

            {/* Parameter Lines across Real Vendors */}
            {enabledCats.map((cat, cIdx) => {
              const pCode = `P${cIdx + 1}`;
              const color = PARAM_COLORS[cIdx % PARAM_COLORS.length];
              const isHidden = hiddenSeries.has(`${pCode}: ${cat.name}`);
              if (isHidden) return null;
              return (
                <Area
                  key={cat.id}
                  yAxisId="left"
                  name={`${pCode}: ${cat.name}`}
                  type="monotone"
                  dataKey={pCode}
                  stroke={color}
                  strokeWidth={3}
                  fillOpacity={1}
                  fill={`url(#grad_cat_${cat.id})`}
                  connectNulls={true}
                  dot={{
                    r: realVendors.length === 1 ? 8 : 6,
                    strokeWidth: 2.5,
                    fill: 'var(--surface-card)',
                    stroke: color,
                  }}
                  activeDot={{
                    r: 9,
                    strokeWidth: 3,
                    fill: 'var(--surface-card)',
                    stroke: color,
                  }}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>

        {/* ── Footnote Legend: Real Vendor Mapping + Parameter Code Mapping ── */}
        <div className="rq-charts__param-legend">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', width: '100%', marginBottom: 4 }}>
            {realVendors.map((v) => (
              <span key={v.id} className="rq-charts__param-chip" style={{ background: 'rgba(10,110,209,0.08)' }}>
                <strong>{v.code}:</strong> {v.name}
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
            {enabledCats.map((cat, idx) => (
              <span key={cat.id} className="rq-charts__param-chip">
                <strong>P{idx + 1}:</strong> {cat.name} ({cat.weightage}%)
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
