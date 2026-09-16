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
import { WidgetHeader, WidgetBody } from './WidgetShell';

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: typeof FileText;
  path: string;
  accent: string;
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

export default function QuickActionsWidget() {
  const navigate = useNavigate();
  const { permissions } = useAuth();

  const visibleActions = QUICK_ACTIONS.filter((action) =>
    checkRoutePermission(permissions, action.path)
  );

  return (
    <>
      <WidgetHeader icon={<Zap size={16} />} title="Quick Actions" />
      <WidgetBody>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                className="group flex min-h-14 items-center gap-3 rounded-xl border border-border/80 bg-card p-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => navigate(action.path)}
              >
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-black/5"
                  style={{ background: `${action.accent}15`, color: action.accent }}
                >
                  <Icon size={18} />
                </div>
                <div className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-foreground group-hover:text-primary">
                    {action.label}
                  </span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {action.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </WidgetBody>
    </>
  );
}
