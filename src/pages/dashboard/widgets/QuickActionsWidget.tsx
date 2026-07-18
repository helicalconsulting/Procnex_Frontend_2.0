import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { checkRoutePermission } from '../../../utils/permissions';
import {
  FileText,
  ShoppingCart,
  Users,
  ClipboardList,
  BarChart3,
  PenLine,
  Zap,
} from 'lucide-react';

// ─── Actions Config ─────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: typeof FileText;
  path: string;
  accent: string;
  roles?: string[]; // if undefined, shown to all
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'create-rfq',
    label: 'Create RFQ',
    description: 'Start a new request for quotation',
    icon: FileText,
    path: '/rfq/create',
    accent: '#0a6ed1',
  },
  {
    id: 'view-approvals',
    label: 'View Approvals',
    description: 'Check pending approval items',
    icon: ShoppingCart,
    path: '/approvals',
    accent: '#e9730c',
  },
  {
    id: 'manage-vendors',
    label: 'Manage Vendors',
    description: 'View and manage vendor list',
    icon: Users,
    path: '/vendors',
    accent: '#8b5cf6',
  },
  {
    id: 'view-quotations',
    label: 'View Quotations',
    description: 'Browse submitted quotations',
    icon: ClipboardList,
    path: '/quotations',
    accent: '#0891b2',
  },
  {
    id: 'view-reports',
    label: 'Reports',
    description: 'Analytics and insights',
    icon: BarChart3,
    path: '/reports',
    accent: '#059669',
  },
  {
    id: 'signature',
    label: 'E-Signature',
    description: 'Sign pending documents',
    icon: PenLine,
    path: '/signature',
    accent: '#ec4899',
  },
];

// ─── Component ──────────────────────────────────────────────

export default function QuickActionsWidget() {
  const navigate = useNavigate();
  const { permissions } = useAuth();

  const visibleActions = QUICK_ACTIONS.filter((action) =>
    checkRoutePermission(permissions, action.path)
  );

  return (
    <>
      <div className="dash-card__header">
        <span className="dash-card__title">
          <Zap size={16} />
          Quick Actions
        </span>
      </div>
      <div className="dash-card__body">
        <div className="quick-actions">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                className="quick-action"
                onClick={() => navigate(action.path)}
              >
                <div
                  className="quick-action__icon"
                  style={{ background: `${action.accent}15`, color: action.accent }}
                >
                  <Icon size={18} />
                </div>
                <div className="quick-action__text">
                  <span className="quick-action__label">{action.label}</span>
                  <span className="quick-action__desc">{action.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
