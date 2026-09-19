import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  ShoppingCart,
  Users,
  CheckSquare,
  FolderOpen,
  Bell,
  History,
  UserCog,
  Shield,
  Package,
  Wallet,
  CreditCard,
  TrendingUp,
  BarChart3,
  Building,
  UsersRound,
  PenLine,
  Receipt,
  UserCircle,
  FileSignature,
  FormInput,
  Truck,
  PackageCheck,
} from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import heliflowLogo from '../../assets/heliflow.png';
import { useNavigationMenu } from '../../hooks/useRoleAccess';
import { useRoutePrefetch } from '../../hooks/useRoutePrefetch';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { isVendor } from '../../utils/rbac';
import { getTenantCompanyCode } from '../../utils/tenantResolver';
import { cn } from '../../lib/utils';
import { useMediaQuery } from '../../hooks/useMediaQuery';

// ─── Navigation config ──────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ICON_MAP: Record<string, React.ReactNode> = {
  Dashboard: <LayoutDashboard size={19} />,
  'RFQ Management': <FileText size={19} />,
  Quotations: <ClipboardList size={19} />,
  'Quotation Approval': <ClipboardList size={19} />,
  'PO Creation': <ShoppingCart size={19} />,
  'GRN Entry & Management': <PackageCheck size={19} />,
  'Goods Receipt Note (GRN)': <PackageCheck size={19} />,
  'Purchase Orders': <ShoppingCart size={19} />,
  'PO Approval': <ShoppingCart size={19} />,
  'Accounts Payable': <Wallet size={19} />,
  'Purchase Invoice Approval': <Wallet size={19} />,
  Payments: <CreditCard size={19} />,
  'Payment Voucher Approval': <CreditCard size={19} />,
  'Sales Orders': <TrendingUp size={19} />,
  Vendors: <Users size={19} />,
  Approvals: <CheckSquare size={19} />,
  Contracts: <FileText size={19} />,
  'Create Purchase Invoice': <Receipt size={19} />,
  'Create Payment Voucher': <CreditCard size={19} />,
  Documents: <FolderOpen size={19} />,
  Notifications: <Bell size={19} />,
  'Audit Trail': <History size={19} />,
  Reports: <BarChart3 size={19} />,
  'New Onboarding': <Building size={19} />,
  'Onboarding Queue': <UsersRound size={19} />,
  Signature: <PenLine size={19} />,
  Administration: <Shield size={19} />,
  'Company Settings': <Building size={19} />,
  'My Contracts': <FileText size={19} />,
  'My RFQs': <FileText size={19} />,
  'My Quotations': <ClipboardList size={19} />,
  'My Orders': <Package size={19} />,
  'My Invoices': <Receipt size={19} />,
  Agreements: <FileSignature size={19} />,
  'My Profile': <UserCircle size={19} />,
  'Custom Form Builder': <FormInput size={19} />,
  Forms: <ClipboardList size={19} />,
  'Form Responses': <BarChart3 size={19} />,
};

const FR_NAV_MAP: Record<string, string> = {
  Dashboard: 'Tableau de bord',
  'Vendor Dashboard': 'Tableau de bord',
  'RFQ Management': 'Demandes de prix (RFQ)',
  'My RFQs': 'Mes demandes (RFQ)',
  Quotations: 'Devis & Offres',
  'My Quotations': 'Mes devis',
  'PO Creation': 'Bons de commande',
  'Purchase Orders': 'Bons de commande',
  'My Orders': 'Mes commandes',
  'Accounts Payable': 'Comptes fournisseurs',
  'My Invoices': 'Mes factures',
  Payments: 'Paiements',
  Vendors: 'Fournisseurs',
  Contracts: 'Contrats',
  'My Contracts': 'Mes contrats',
  Agreements: 'Accords & Contrats',
  Documents: 'Documents',
  Notifications: 'Notifications',
  'Audit Trail': "Journal d'audit",
  Reports: 'Rapports',
  'Company Settings': "Paramètres de l'entreprise",
  'User Management': 'Gestion des utilisateurs',
  'Roles & Permissions': 'Rôles & Permissions',
  'Approval Levels': "Niveaux d'approbation",
  'Purchase Requisitions': "Demandes d'achat",
  Signature: 'Signature numérique',
  Forms: 'Formulaires',
  'My Profile': 'Mon profil',
};

const FR_SECTION_MAP: Record<string, string> = {
  Main: 'Principal',
  Procurement: 'Achats & Approvisionnement',
  Approvals: 'Approbations',
  'Orders & Payments': 'Commandes & Paiements',
  Account: 'Compte',
  Governance: 'Gouvernance & Fournisseurs',
  Admin: 'Administration',
};

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  isHovered: boolean;
  onHoverChange: (hovered: boolean) => void;
}

export default function Sidebar({
  mobileOpen,
  onMobileClose,
  isHovered,
  onHoverChange,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const menuItems = useNavigationMenu();
  const prefetch = useRoutePrefetch();
  const { companyName, logoUrl } = useBranding();
  const { isFrench } = useLanguage();
  const sidebarRef = useRef<HTMLElement>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const collapsed = !isHovered;
  const companyCode = getTenantCompanyCode();
  const dashboardPath = isVendor(roles)
    ? (companyCode ? `/v/${companyCode.toLowerCase()}/dashboard` : '/vendor/dashboard')
    : '/dashboard';

  useEffect(() => {
    if (!mobileOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onMobileClose();
        requestAnimationFrame(() => document.getElementById('navigation-trigger')?.focus());
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    if (mobileOpen && !isDesktop) {
      requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLElement>('a')?.focus());
    }
  }, [isDesktop, mobileOpen]);

  const NAV_SECTIONS: NavSection[] = [
    {
      title: 'Main',
      items: menuItems
        .filter((item) => item.id === 'dashboard' || item.id === 'vendor-dashboard')
        .map((item) => ({
          label: item.label,
          icon: ICON_MAP[item.label] || <LayoutDashboard size={19} />,
          path: item.path,
        })),
    },
    {
      title: 'Procurement',
      items: [
        ...menuItems
          .filter((item) => ['rfq', 'purchase-requisitions', 'company-grn', 'contracts', 'create-purchase-invoice', 'create-payment-voucher', 'vendor-rfqs', 'vendor-quotations', 'forms'].includes(item.id))
          .map((item) => ({
            label: item.label,
            icon: ICON_MAP[item.label] || <FileText size={19} />,
            path: item.path,
          })),
      ],
    },
    {
      title: 'Approvals',
      items: [
        ...menuItems
          .filter((item) => item.id === 'quotations')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <ClipboardList size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'approvals')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <ShoppingCart size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'accounts-payable')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Wallet size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'payments')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <CreditCard size={19} />, path: item.path })),
      ],
    },
    {
      title: 'Orders & Payments',
      items: [
        ...menuItems
          .filter((item) => item.id === 'vendor-orders')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Package size={19} />, path: item.path })),
        ...(isVendor(roles)
          ? [
              {
                label: 'My Invoices & Dispatches',
                icon: <Truck size={19} />,
                path: '/procurement/grns',
              },
            ]
          : []),
        ...menuItems
          .filter((item) => item.id === 'vendor-contracts')
          .map((item) => ({ label: 'Contracts', icon: ICON_MAP[item.label] || <FileText size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'vendor-agreements')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <FileSignature size={19} />, path: item.path })),
      ],
    },
    {
      title: 'Account',
      items: [
        ...menuItems
          .filter((item) => item.id === 'vendor-profile')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <UserCircle size={19} />, path: item.path })),
      ],
    },
    {
      title: 'Governance',
      items: [
        ...menuItems
          .filter((item) => item.id === 'vendors')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Users size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'new-onboarding')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Building size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'onboarding-queue')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <UsersRound size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'reports')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <BarChart3 size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'audit-trail')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <History size={19} />, path: item.path })),
      ],
    },
    {
      title: 'Admin',
      items: [
        ...menuItems
          .filter((item) => item.id === 'signature')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <PenLine size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'admin')
          .flatMap((item) =>
            item.children?.map((child) => ({
              label: child.label,
              icon: ICON_MAP[child.label] || <UserCog size={19} />,
              path: child.path,
            })) || []
          ),
      ],
    },
  ].filter((section) => section.items.length > 0);

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
        aria-hidden={!mobileOpen}
        className={cn(
          'fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onMobileClose}
      />

      <aside
        id="primary-navigation"
        ref={sidebarRef}
        aria-label="Primary navigation"
        aria-hidden={!isDesktop && !mobileOpen}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-white/10 [background:var(--shell-bg)] text-[var(--shell-text)] shadow-2xl shadow-slate-950/20 transition-[width,transform] duration-200 ease-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full',
          collapsed ? 'lg:w-20' : 'lg:w-[280px]',
        )}
      >
        <div
          className="flex h-16 shrink-0 cursor-pointer items-center gap-3 border-b border-white/10 px-5"
          onClick={() => {
            navigate(dashboardPath);
            onMobileClose();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              navigate(dashboardPath);
              onMobileClose();
            }
          }}
        >
          <img
            src={logoUrl || heliflowLogo}
            alt={companyName}
            className="h-9 w-9 shrink-0 rounded-xl object-contain ring-1 ring-white/10"
          />
          <span
            className={cn(
              'min-w-0 truncate text-[18px] font-semibold tracking-[-0.03em] text-white transition-opacity',
              collapsed && 'lg:pointer-events-none lg:opacity-0',
            )}
          >
            {companyName}
          </span>
        </div>

        <nav className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 [scrollbar-color:rgba(255,255,255,0.18)_transparent] [scrollbar-width:thin]">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="mb-2">
              <span
                className={cn(
                  'block px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40 transition-opacity',
                  collapsed && 'lg:h-2 lg:overflow-hidden lg:px-0 lg:py-0 lg:opacity-0',
                )}
              >
                {isFrench ? (FR_SECTION_MAP[section.title] || section.title) : section.title}
              </span>
              {section.items.map((item) => {
                const isActive =
                  item.path.endsWith('/dashboard')
                    ? location.pathname === item.path
                    : location.pathname.startsWith(item.path);

                const displayLabel = isFrench ? (FR_NAV_MAP[item.label] || item.label) : item.label;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? displayLabel : undefined}
                    className={cn(
                      'group relative my-1 flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3 text-[14px] font-medium text-white/65 outline-none transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900',
                      collapsed && 'lg:justify-center lg:px-0',
                      isActive && 'bg-white/[0.12] font-semibold text-white shadow-sm shadow-black/10',
                    )}
                    onClick={() => {
                      onMobileClose();
                    }}
                    onMouseEnter={prefetch(item.path)}
                  >
                    {isActive && (
                      <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-[var(--shell-accent)]" />
                    )}
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">{item.icon}</span>
                    <span
                      className={cn(
                        'min-w-0 truncate transition-opacity',
                        collapsed && 'lg:absolute lg:pointer-events-none lg:opacity-0',
                      )}
                    >
                      {displayLabel}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
