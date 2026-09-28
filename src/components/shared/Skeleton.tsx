import React from 'react';
import './Skeleton.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
  ariaLabel?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  borderRadius,
  circle = false,
  className = '',
  style = {},
  ariaLabel = 'Loading...',
}) => {
  const computedStyle: React.CSSProperties = {
    width: width !== undefined ? width : '100%',
    height: height !== undefined ? height : '16px',
    borderRadius: circle ? '50%' : borderRadius !== undefined ? borderRadius : '4px',
    ...style,
  };

  return (
    <div
      className={`cs-skeleton ${circle ? 'cs-skeleton--circle' : ''} ${className}`}
      style={computedStyle}
      aria-hidden="true"
      aria-label={ariaLabel}
    />
  );
};

// ── Primitive Skeletons ──────────────────────────────────────────

export const SkeletonText: React.FC<{
  lines?: number;
  widths?: (string | number)[];
  gap?: number;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ lines = 3, widths, gap = 8, height = 14, className = '', style }) => (
  <div className={`cs-skeleton-text-wrap ${className}`} style={{ display: 'flex', flexDirection: 'column', gap, ...style }} aria-hidden="true">
    {Array.from({ length: lines }).map((_, i) => {
      const w = widths ? widths[i % widths.length] : i === lines - 1 && lines > 1 ? '65%' : '100%';
      return <Skeleton key={i} width={w} height={height} borderRadius={3} />;
    })}
  </div>
);

export const SkeletonAvatar: React.FC<{
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ size = 36, className = '', style }) => (
  <Skeleton circle width={size} height={size} className={className} style={style} />
);

export const SkeletonImage: React.FC<{
  width?: string | number;
  height?: string | number;
  aspectRatio?: string;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ width = '100%', height = 180, aspectRatio, borderRadius = 8, className = '', style }) => (
  <Skeleton
    width={width}
    height={aspectRatio ? undefined : height}
    borderRadius={borderRadius}
    className={className}
    style={{ ...(aspectRatio ? { aspectRatio } : {}), ...style }}
  />
);

export const SkeletonButton: React.FC<{
  width?: string | number;
  height?: string | number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}> = ({ width, height, size = 'md', className = '', style }) => {
  const h = height || (size === 'sm' ? 30 : size === 'lg' ? 42 : 36);
  const w = width || (size === 'sm' ? 80 : size === 'lg' ? 120 : 100);
  return <Skeleton width={w} height={h} borderRadius={6} className={`cs-skeleton--btn ${className}`} style={style} />;
};

// ── Composed Table Skeleton with Exact Columns Support ───────────

export interface SkeletonTableProps {
  rows?: number;
  columns?: number | (string | number)[];
  columnWidths?: (string | number)[];
  showHeader?: boolean;
  showToolbar?: boolean;
  rowHeight?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const SkeletonTable: React.FC<SkeletonTableProps> = ({
  rows = 5,
  columns = 6,
  columnWidths,
  showHeader = true,
  showToolbar = true,
  rowHeight = 22,
  className = '',
  style,
}) => {
  // Determine widths for each column
  let colWidths: (string | number)[];
  if (Array.isArray(columns)) {
    colWidths = columns;
  } else if (columnWidths && columnWidths.length > 0) {
    colWidths = columnWidths;
  } else {
    const colCount = typeof columns === 'number' ? columns : 6;
    colWidths = Array.from({ length: colCount }).map((_, c) =>
      c === 0 ? '25%' : c === colCount - 1 ? '100px' : c === 1 ? '35%' : '20%'
    );
  }

  const colCount = colWidths.length;

  return (
    <div className={`cs-table-skeleton-wrap ${className}`} style={style} aria-busy="true" aria-label="Loading data table">
      {showToolbar && (
        <div className="cs-table-skeleton-toolbar">
          <Skeleton width={200} height={34} borderRadius={6} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Skeleton width={110} height={34} borderRadius={6} />
            <Skeleton width={90} height={34} borderRadius={6} />
          </div>
        </div>
      )}
      <div className="cs-table-skeleton-body" style={{ display: 'flex', flexDirection: 'column' }}>
        {showHeader && (
          <div
            className="cs-table-skeleton-row cs-table-skeleton-header"
            style={{ background: 'var(--surface-elevated, var(--muted, #f8fafc))', fontWeight: 600 }}
          >
            {colWidths.map((w, c) => (
              <div key={c} style={{ width: typeof w === 'number' ? `${w}px` : w, flexShrink: 0, paddingRight: 12 }}>
                <Skeleton width="85%" height={16} borderRadius={4} />
              </div>
            ))}
          </div>
        )}
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="cs-table-skeleton-row">
            {colWidths.map((w, c) => (
              <div key={c} style={{ width: typeof w === 'number' ? `${w}px` : w, flexShrink: 0, paddingRight: 12 }}>
                <Skeleton width={c === 0 ? '75%' : c === colCount - 1 ? '60px' : '90%'} height={rowHeight} borderRadius={4} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// Aliased TableSkeleton for backward compatibility
export const TableSkeleton = SkeletonTable;

// ── Composed Card Skeleton ────────────────────────────────────────

export const SkeletonCard: React.FC<{
  count?: number;
  hasImage?: boolean;
  hasHeader?: boolean;
  hasFooter?: boolean;
  className?: string;
  style?: React.CSSProperties;
}> = ({ count = 1, hasImage = false, hasHeader = true, hasFooter = true, className = '', style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', ...style }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`cs-card-skeleton-wrap ${className}`}>
        {hasHeader && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Skeleton width="45%" height={20} borderRadius={4} />
            <Skeleton width={70} height={24} borderRadius={12} />
          </div>
        )}
        {hasImage && <SkeletonImage height={140} borderRadius={6} />}
        <SkeletonText lines={2} widths={['90%', '60%']} height={14} />
        {hasFooter && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Skeleton width={90} height={14} />
            <SkeletonButton size="sm" width={80} />
          </div>
        )}
      </div>
    ))}
  </div>
);

// Aliased CardSkeleton
export const CardSkeleton = SkeletonCard;

// ── Composed Chart Skeleton ───────────────────────────────────────

export const SkeletonChart: React.FC<{
  type?: 'bar' | 'line' | 'pie' | 'kpi';
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ type = 'bar', height = 180, className = '', style }) => {
  if (type === 'pie') {
    return (
      <div className={`cs-chart-skeleton-wrap ${className}`} style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 16, ...style }} aria-busy="true">
        <Skeleton circle width={120} height={120} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <SkeletonText lines={3} widths={['80%', '60%', '70%']} height={12} />
        </div>
      </div>
    );
  }

  return (
    <div className={`cs-chart-skeleton-wrap ${className}`} style={{ height, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 16, ...style }} aria-busy="true">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton width={140} height={16} />
        <Skeleton width={80} height={14} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, height: height - 60, paddingTop: 16 }}>
        {[40, 75, 55, 90, 65, 80, 45, 70].map((h, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 8, height: '100%', justifyContent: 'flex-end' }}>
            <Skeleton width="100%" height={`${h}%`} borderRadius="4px 4px 0 0" />
            <Skeleton width="60%" height={10} style={{ alignSelf: 'center' }} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Composed Form Skeleton ────────────────────────────────────────

export const SkeletonForm: React.FC<{ fields?: number; columns?: number; className?: string; style?: React.CSSProperties }> = ({
  fields = 4,
  columns = 2,
  className = '',
  style,
}) => (
  <div
    className={`cs-form-skeleton-wrap ${className}`}
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${columns > 1 ? '240px' : '100%'}, 1fr))`,
      gap: 20,
      padding: 20,
      ...style,
    }}
    aria-busy="true"
  >
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i} className="cs-form-skeleton-field" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width={120} height={14} />
        <Skeleton width="100%" height={38} borderRadius={6} />
      </div>
    ))}
  </div>
);

// Aliased FormSkeleton
export const FormSkeleton = SkeletonForm;

// ── Composed List Skeleton ────────────────────────────────────────

export const SkeletonList: React.FC<{ items?: number; hasAvatar?: boolean; className?: string; style?: React.CSSProperties }> = ({
  items = 4,
  hasAvatar = true,
  className = '',
  style,
}) => (
  <div className={`cs-list-skeleton-wrap ${className}`} style={{ display: 'flex', flexDirection: 'column', gap: 12, ...style }} aria-busy="true">
    {Array.from({ length: items }).map((_, i) => (
      <div
        key={i}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--surface-card, var(--card, #ffffff))',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: 6,
        }}
      >
        {hasAvatar && <SkeletonAvatar size={36} />}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width={i % 2 === 0 ? '60%' : '75%'} height={15} />
          <Skeleton width="40%" height={12} />
        </div>
        <Skeleton width={60} height={20} borderRadius={10} />
      </div>
    ))}
  </div>
);

// ── Stats Skeleton ────────────────────────────────────────────────

export const StatsSkeleton: React.FC<{ count?: number; className?: string; style?: React.CSSProperties }> = ({ count = 4, className = '', style }) => (
  <div className={`cs-stats-skeleton-wrap ${className}`} style={style} aria-busy="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="cs-stat-skeleton-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton width={70} height={14} />
          <Skeleton circle width={28} height={28} />
        </div>
        <Skeleton width={90} height={26} style={{ marginTop: 4 }} />
        <Skeleton width="60%" height={12} style={{ marginTop: 2 }} />
      </div>
    ))}
  </div>
);

// ── Detail Skeleton ───────────────────────────────────────────────

export const DetailSkeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`cs-detail-skeleton-wrap ${className}`} style={style} aria-busy="true">
    <div className="cs-detail-skeleton-topbar">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Skeleton width={120} height={28} />
        <Skeleton width={80} height={22} borderRadius={12} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <SkeletonButton size="sm" width={80} />
        <SkeletonButton size="sm" width={90} />
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      <SkeletonCard count={1} />
      <SkeletonCard count={1} />
    </div>
    <SkeletonTable rows={3} columns={5} />
  </div>
);

// ── Page Level Composition Skeleton ────────────────────────────────

export const PageSkeleton: React.FC<{
  hasStats?: boolean;
  hasTable?: boolean;
  columns?: number | (string | number)[];
  rows?: number;
  className?: string;
  style?: React.CSSProperties;
}> = ({ hasStats = true, hasTable = true, columns = 6, rows = 5, className = '', style }) => (
  <div
    className={`cs-page-skeleton-wrap ${className}`}
    style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 16, width: '100%', ...style }}
    aria-busy="true"
    aria-label="Loading page content"
  >
    {/* Page Header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width={220} height={28} borderRadius={4} />
        <Skeleton width={380} height={14} borderRadius={3} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <SkeletonButton width={100} height={36} />
        <SkeletonButton width={120} height={36} />
      </div>
    </div>
    {/* Stat Cards */}
    {hasStats && <StatsSkeleton count={4} />}
    {/* Main Data Table */}
    {hasTable && <SkeletonTable rows={rows} columns={columns} />}
  </div>
);

export default Skeleton;
