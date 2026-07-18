import { useMemo, useState, useRef, useCallback, useEffect, useId } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import {
  BarChart3,
  Maximize2,
  Minimize2,
  Download,
  FileImage,
  FileText,
  X,
} from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import FloatingMenu from '../shared/FloatingMenu';
import type { EvalCategory } from '../../types/rfqEvaluation';

// ─── Colors ─────────────────────────────────────────────────

const PARAM_COLORS = [
  '#0a6ed1', '#16a34a', '#ca8a04', '#7c3aed',
  '#dc2626', '#0891b2', '#db2777', '#ea580c', '#64748b',
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

// ─── Custom Tooltip ─────────────────────────────────────────

const CustomTooltip = (props: TooltipProps<number, string>) => {
  const { active, payload, label } = props as TooltipProps<number, string> & { payload?: Array<Record<string, unknown>>; label?: string };
  if (!active || !payload || payload.length === 0) return null;
  const fullName = (payload[0]?.payload as Record<string, unknown>)?.fullName as string || label;
  return (
    <div className="rq-chart__tooltip">
      <div className="rq-chart__tooltip-label">{fullName}</div>
      {payload.map((entry: Record<string, unknown>, idx: number) => (
        <div key={idx} className="rq-chart__tooltip-row">
          <span
            className="rq-chart__tooltip-dot"
            style={{ backgroundColor: entry.color }}
          />
          <span className="rq-chart__tooltip-name">{entry.name}</span>
          <span className="rq-chart__tooltip-value">
            {entry.value === -1 ? 'N/A' : `${entry.value}%`}
          </span>
        </div>
      ))}
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
  const [exportOpen, setExportOpen] = useState(false);
  const chartBodyRef = useRef<HTMLDivElement>(null);

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
        // -1 = no data (N/A), distinct from 0%
        catScores[cat.name] = hasData
          ? (maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0)
          : -1;
      }
      map[v.id] = catScores;
    }
    return map;
  }, [vendorNames, vendorScores, enabledCats]);

  // ── Transform to LineChart format ─────────────────────────
  const chartData = useMemo(() => {
    return vendorNames.map((v) => ({
      name: v.name.length > 16 ? v.name.slice(0, 16) + '\u2026' : v.name,
      fullName: v.name,
      ...(vendorCatPct[v.id] ?? {}),
    }));
  }, [vendorNames, vendorCatPct]);

  // ── Parameter names (for line series) ─────────────────────
  const paramNames = useMemo(
    () => enabledCats.map((c) => c.name),
    [enabledCats],
  );

  // ── Toggle hidden series (legend click) ───────────────────
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  const handleLegendClick = useCallback((e: Record<string, unknown>) => {
    const dataKey = e.dataKey as string | undefined;
    if (!dataKey) return;
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  }, []);

  const isSingleVendor = vendorNames.length <= 1;

  // ── Chart height based on content ───────────────────────
  const chartHeight = Math.max(400, Math.min(520, vendorNames.length * 80 + 100));

  // ── Export Functions ─────────────────────────────────────

  const captureToPng = useCallback(async () => {
    if (!chartBodyRef.current) return;
    setExportOpen(false);
    try {
      const dataUrl = await toPng(chartBodyRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor:
          getComputedStyle(chartBodyRef.current)
            .getPropertyValue('--surface-card')
            .trim() || '#ffffff',
      });
      const link = document.createElement('a');
      link.download = `supplier-comparison-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export PNG:', err);
    }
  }, []);

  const captureToPdf = useCallback(async () => {
    if (!chartBodyRef.current) return;
    setExportOpen(false);
    try {
      const dataUrl = await toPng(chartBodyRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor:
          getComputedStyle(chartBodyRef.current)
            .getPropertyValue('--surface-card')
            .trim() || '#ffffff',
      });
      const pdf = new jsPDF('l', 'mm', 'a4');
      const imgWidth = 280;
      const imgHeight =
        (imgWidth * chartBodyRef.current.offsetHeight) /
        chartBodyRef.current.offsetWidth;
      pdf.addImage(dataUrl, 'PNG', 10, 10, imgWidth, imgHeight);
      pdf.save(`supplier-comparison-${Date.now()}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    }
  }, []);

  // ── Escape key to exit fullscreen ────────────────────────
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

  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // ── Empty state ───────────────────────────────────────────
  if (vendorNames.length === 0) {
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
            <p>No evaluation scores available for this RFQ.</p>
          </div>
        </div>
      </div>
    );
  }

  if (enabledCats.length === 0) {
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
            <p>No evaluation parameters configured.</p>
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
      {/* ── Fullscreen Close Button ────────────────────────── */}
      {isFullscreen && onFullscreen && (
        <button className="rq-charts__close-btn" onClick={onFullscreen} title="Close fullscreen (Esc)">
          <X size={18} />
        </button>
      )}

      {/* ── Header Bar ───────────────────────────────────── */}
      <div className="rq-charts__header">
        <h3 id={titleId} className="rq-charts__header-title">
          Supplier Comparison — Multi-Series Score
        </h3>
        <div className="rq-charts__header-actions">
          {onFullscreen && (
            <button
              className="rq-charts__btn rq-charts__btn--icon"
              onClick={onFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          <div className="rq-charts__export-wrap">
            <button
              ref={exportBtnRef}
              className="rq-charts__btn rq-charts__btn--icon"
              onClick={() => setExportOpen(!exportOpen)}
              title="Export chart"
            >
              <Download size={15} />
            </button>
            <FloatingMenu
              open={exportOpen}
              onClose={() => setExportOpen(false)}
              anchorRef={exportBtnRef}
              className="rq-charts__export-dropdown"
              options={{ placement: 'bottom-end', offset: 4, viewportPadding: 8 }}
              animation="slide"
              role="menu"
            >
              <button className="rq-charts__export-option" onClick={captureToPng}>
                <FileImage size={14} />
                Export as PNG
              </button>
              <button className="rq-charts__export-option" onClick={captureToPdf}>
                <FileText size={14} />
                Export as PDF
              </button>
            </FloatingMenu>
          </div>
        </div>
      </div>

      {/* ── Chart ──────────────────────────────────────────── */}
      <div className="rq-charts__body" ref={chartBodyRef}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <LineChart
            data={chartData}
            margin={{
              top: 16,
              right: isSingleVendor ? 120 : 24,
              left: isSingleVendor ? 120 : 8,
              bottom: 8,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12, fill: 'var(--text-primary)', fontWeight: 500 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              height={50}
              label={{
                value: 'Vendors',
                position: 'insideBottomRight',
                offset: -12,
                style: { fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 600 },
              }}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              tick={{ fontSize: 11, fill: 'var(--text-secondary)' }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
              width={52}
            />
            <text
              x={-chartHeight / 2}
              y={14}
              transform="rotate(-90)"
              textAnchor="middle"
              fill="var(--text-secondary)"
              fontSize={12}
              fontWeight={600}
            >
              Score (%)
            </text>
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }} />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              iconType="line"
              iconSize={12}
              onClick={handleLegendClick}
            />
            {paramNames.map((name, idx) => {
              const dataKey = name;
              const color = PARAM_COLORS[idx % PARAM_COLORS.length];
              const isHidden = hiddenSeries.has(dataKey);
              return (
                <Line
                  key={dataKey}
                  dataKey={dataKey}
                  name={name.length > 18 ? name.slice(0, 18) + '\u2026' : name}
                  type="monotone"
                  stroke={color}
                  strokeWidth={isHidden ? 0 : 2}
                  dot={
                    isHidden ? false : {
                      r: isSingleVendor ? 8 : 4,
                      strokeWidth: isSingleVendor ? 2 : 1,
                      fill: 'var(--surface-card)',
                      stroke: color,
                    }
                  }
                  activeDot={{
                    r: isSingleVendor ? 10 : 6,
                    strokeWidth: 2,
                    fill: 'var(--surface-card)',
                    stroke: color,
                  }}
                  connectNulls={false}
                  strokeOpacity={isHidden ? 0 : 1}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>

        {/* ── Single-vendor fallback note ─────────────────── */}
        {isSingleVendor && (
          <p
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-secondary)',
              margin: '8px 0 0',
              fontStyle: 'italic',
            }}
          >
            Each data point represents a parameter score for {vendorNames[0]?.name}. Multi-vendor selection will connect points into lines.
          </p>
        )}
      </div>
    </div>
  );
}
