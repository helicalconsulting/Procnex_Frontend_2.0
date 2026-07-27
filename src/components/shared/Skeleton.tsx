import React from 'react';
import './Skeleton.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  borderRadius,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`cs-skeleton ${className}`}
      style={{
        width: width !== undefined ? width : '100%',
        height: height !== undefined ? height : '16px',
        borderRadius: borderRadius !== undefined ? borderRadius : '4px',
        ...style,
      }}
    />
  );
};

export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 4,
  columns = 4,
}) => (
  <div className="cs-table-skeleton-wrap">
    <div className="cs-table-skeleton-toolbar">
      <div className="cs-skeleton" style={{ width: 180, height: 34 }} />
      <div className="cs-skeleton" style={{ width: 220, height: 34 }} />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Table Header Skeleton */}
      <div className="cs-table-skeleton-row" style={{ background: 'var(--surface-elevated, #f8fafc)', fontWeight: 600 }}>
        {Array.from({ length: columns }).map((_, c) => (
          <div
            key={c}
            className="cs-skeleton"
            style={{
              width: c === 0 ? 80 : c === columns - 1 ? 120 : '30%',
              height: 18,
            }}
          />
        ))}
      </div>
      {/* Table Rows Skeleton */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="cs-table-skeleton-row">
          {Array.from({ length: columns }).map((_, c) => (
            <div
              key={c}
              className="cs-skeleton"
              style={{
                width: c === 0 ? 70 : c === columns - 1 ? 110 : c === 1 ? '45%' : '25%',
                height: 22,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="cs-card-skeleton-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="cs-skeleton" style={{ width: '40%', height: 22 }} />
          <div className="cs-skeleton" style={{ width: 80, height: 28 }} />
        </div>
        <div className="cs-skeleton" style={{ width: '75%', height: 14 }} />
        <div className="cs-skeleton" style={{ width: '100%', height: 42 }} />
      </div>
    ))}
  </div>
);

export const FormSkeleton: React.FC<{ fields?: number }> = ({ fields = 4 }) => (
  <div className="cs-form-skeleton-wrap">
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i} className="cs-form-skeleton-field">
        <div className="cs-skeleton" style={{ width: 110, height: 14 }} />
        <div className="cs-skeleton" style={{ width: '100%', height: 38 }} />
      </div>
    ))}
  </div>
);

export const StatsSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => (
  <div className="cs-stats-skeleton-wrap">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="cs-stat-skeleton-card">
        <div className="cs-skeleton" style={{ width: 60, height: 26 }} />
        <div className="cs-skeleton" style={{ width: 100, height: 14 }} />
      </div>
    ))}
  </div>
);

export const DetailSkeleton: React.FC = () => (
  <div className="cs-detail-skeleton-wrap">
    <div className="cs-detail-skeleton-topbar">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="cs-skeleton" style={{ width: 100, height: 30 }} />
        <div className="cs-skeleton" style={{ width: 160, height: 20 }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="cs-skeleton" style={{ width: 80, height: 32 }} />
        <div className="cs-skeleton" style={{ width: 80, height: 32 }} />
      </div>
    </div>
    <div className="cs-card-skeleton-wrap">
      <div className="cs-skeleton" style={{ width: '100%', height: 300 }} />
    </div>
  </div>
);

export const PageSkeleton: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 16, width: '100%' }}>
    {/* Page Header */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="cs-skeleton" style={{ width: 220, height: 28 }} />
      <div className="cs-skeleton" style={{ width: 380, height: 16 }} />
    </div>
    {/* Stat Cards */}
    <StatsSkeleton count={4} />
    {/* Table Component */}
    <TableSkeleton rows={4} columns={5} />
  </div>
);

export default Skeleton;
