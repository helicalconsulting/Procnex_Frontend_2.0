import { createPortal } from 'react-dom';
import { X, Check, Eye } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────

export interface PlanMilestoneView {
  id: string;
  title: string;
  percentage: number;
}

export interface PlanDetailsView {
  name: string;
  milestones: PlanMilestoneView[];
}

interface ViewPaymentPlanModalProps {
  plan: PlanDetailsView;
  onClose: () => void;
}

// ─── Styles ─────────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(4px)',
  zIndex: 999998,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const dialogStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(520px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 80px)',
  background: 'var(--surface-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-xl, 16px)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  zIndex: 999999,
  animation: 'vppFadeIn 0.2s ease',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 20px',
  borderBottom: '1px solid var(--border)',
  flexShrink: 0,
};

const headerLeftStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-primary)',
};

const closeBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--surface-elevated)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'background 0.15s, color 0.15s, border-color 0.15s',
};

const bodyStyle: React.CSSProperties = {
  padding: '20px 24px',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
};

const planNameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: 16,
};

const tableHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 80px',
  gap: 8,
  padding: '6px 0',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  borderBottom: '1px solid var(--border)',
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 80px',
  gap: 8,
  padding: '9px 0',
  borderBottom: '1px solid var(--border)',
};

const rowLabelStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-primary)',
  lineHeight: 1.4,
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  paddingRight: 8,
};

const rowValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text-primary)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

const totalRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderTop: '2px solid var(--border)',
  marginTop: 4,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  padding: '12px 24px',
  borderTop: '1px solid var(--border)',
  flexShrink: 0,
};

const footerBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 20px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  background: 'var(--surface-elevated)',
  color: 'var(--text-primary)',
  transition: 'background 0.15s, border-color 0.15s, color 0.15s',
};

// ─── Component ──────────────────────────────────────────────

function ViewPaymentPlanModalInner({ plan, onClose }: ViewPaymentPlanModalProps) {
  const totalAllocation = plan.milestones.reduce((sum, m) => sum + m.percentage, 0);
  const isTotalValid = Math.abs(totalAllocation - 100) < 0.01;

  return (
    <div className="vquot-modal-backdrop view-plan-modal-backdrop" style={backdropStyle} onClick={onClose}>
      {/* Dialog */}
      <div
        className="vquot-modal view-plan-modal"
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Payment Plan Details"
      >
        {/* Header */}
        <div style={headerStyle}>
          <div style={headerLeftStyle}>
            <Eye size={14} style={{ color: 'var(--vendor-primary, #0a6ed1)', flexShrink: 0 }} />
            <span style={headerTitleStyle}>Payment Plan Details</span>
          </div>
          <button
            type="button"
            style={closeBtnStyle}
            onClick={onClose}
            title="Close"
            aria-label="Close"
            onMouseOver={e => {
              e.currentTarget.style.background = 'rgba(187,0,0,0.1)';
              e.currentTarget.style.color = 'var(--danger-500, #bb0000)';
              e.currentTarget.style.borderColor = 'rgba(187,0,0,0.2)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'var(--surface-elevated)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {/* Plan Name */}
          <div style={planNameStyle}>{plan.name}</div>

          {/* Column Headers */}
          <div style={tableHeaderStyle}>
            <span>Payment Term / Milestone</span>
            <span style={{ textAlign: 'right' }}>Value</span>
          </div>

          {/* Milestone Rows */}
          {plan.milestones.map((m, idx) => (
            <div
              key={m.id}
              style={{
                ...rowStyle,
                borderBottom: idx < plan.milestones.length - 1
                  ? '1px solid var(--border)'
                  : 'none',
              }}
            >
              <span style={rowLabelStyle}>{m.title}</span>
              <span style={rowValueStyle}>{m.percentage}%</span>
            </div>
          ))}

          {/* Total */}
          <div style={totalRowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Total</span>
              {isTotalValid && (
                <Check size={14} style={{ color: '#107e3e', flexShrink: 0 }} />
              )}
            </div>
            <span style={{
              fontSize: 15,
              fontWeight: 800,
              color: isTotalValid ? '#107e3e' : '#bb0000',
            }}>
              {totalAllocation.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <button
            type="button"
            style={footerBtnStyle}
            onClick={onClose}
            onMouseOver={e => {
              e.currentTarget.style.background = 'var(--surface-hover)';
              e.currentTarget.style.borderColor = 'var(--vendor-primary, #0a6ed1)';
              e.currentTarget.style.color = 'var(--vendor-primary, #0a6ed1)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = 'var(--surface-elevated)';
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Inject keyframes once at module level ────────────────

let vppInjected = false;
function injectVppKeyframes() {
  if (vppInjected || typeof document === 'undefined') return;
  vppInjected = true;
  const style = document.createElement('style');
  style.id = '__vpp_animation';
  style.textContent = `
    @keyframes vppFadeIn {
      from { opacity: 0; transform: translateY(12px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `;
  document.head.appendChild(style);
}
injectVppKeyframes();

export default function ViewPaymentPlanModal(props: ViewPaymentPlanModalProps) {
  return createPortal(
    <ViewPaymentPlanModalInner {...props} />,
    document.body,
  );
}
