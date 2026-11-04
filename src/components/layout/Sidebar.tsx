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
  Plus,
  Minus,
} from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import heliflowLogo from '../../assets/heliflow.png';
import { useNavigationMenu } from '../../hooks/useRoleAccess';
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
  'Vendor Onboarding': <Building size={19} />,
  'Onboarding Queue': <UsersRound size={19} />,
  Signature: <PenLine size={19} />,
  Administration: <Shield size={19} />,
  'Company Settings': <Building size={19} />,
  'My Contracts': <FileText size={19} />,
  'My RFQs': <FileText size={19} />,
  'My Quotations': <ClipboardList size={19} />,
  'My Orders': <Package size={19} />,
  'My Invoices': <Receipt size={19} />,
  'My Invoices & Dispatches': <Truck size={19} />,
  'My Payments': <CreditCard size={19} />,
  Agreements: <FileSignature size={19} />,
  'My Profile': <UserCircle size={19} />,
  'My Signature': <PenLine size={19} />,
  'Custom Form Builder': <FormInput size={19} />,
  Forms: <ClipboardList size={19} />,
  'Form Responses': <BarChart3 size={19} />,
  'Budget Management': <Wallet size={19} />,
};

const FR_NAV_MAP: Record<string, string> = {
  Dashboard: 'Tableau de bord',
  'Budget Management': 'Gestion du budget',
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
  'My Payments': 'Mes paiements',
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
  'My Signature': 'Signature numérique',
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

const AR_NAV_MAP: Record<string, string> = {
  Dashboard: 'لوحة التحكم',
  'Budget Management': 'إدارة الميزانية',
  'Vendor Dashboard': 'لوحة تحكم المورد',
  'RFQ Management': 'إدارة طلبات الأسعار (RFQ)',
  'My RFQs': 'طلبات الأسعار الخاصة بي',
  Quotations: 'عروض الأسعار',
  'Quotation Approval': 'الموافقة على عروض الأسعار',
  'My Quotations': 'عروض الأسعار الخاصة بي',
  'PO Creation': 'إنشاء أمر شراء',
  'Purchase Orders': 'أوامر الشراء',
  'PO Approval': 'الموافقة على أمر الشراء',
  'My Orders': 'طلباتي',
  'Accounts Payable': 'حسابات الموردين',
  'Purchase Invoice Approval': 'الموافقة على فواتير الشراء',
  'Create Purchase Invoice': 'إنشاء فاتورة شراء',
  'My Invoices': 'فواتيري',
  'My Invoices & Dispatches': 'فواتيري وشحناتي',
  'My Payments': 'مدفوعاتي',
  Payments: 'المدفوعات',
  'Payment Voucher Approval': 'الموافقة على سندات الصرف',
  'Create Payment Voucher': 'إنشاء سند صرف',
  Vendors: 'الموردون',
  Contracts: 'العقود',
  'Create Contract': 'إنشاء عقد',
  'My Contracts': 'عقودي',
  Agreements: 'الاتفاقيات والعقود',
  Documents: 'المستندات',
  Notifications: 'الإشعارات',
  'Audit Trail': 'سجل التدقيق',
  Reports: 'التقارير',
  'Company Settings': 'إعدادات الشركة',
  'User Management': 'إدارة المستخدمين',
  'Roles & Permissions': 'الأدوار والصلاحيات',
  'Approval Levels': 'مستويات الموافقة',
  'Purchase Requisitions': 'طلبات الشراء',
  Signature: 'التوقيع الرقمي',
  'My Signature': 'التوقيع الرقمي',
  Forms: 'النماذج',
  'Custom Form Builder': 'منشئ النماذج المخصصة',
  'Form Responses': 'ردود النماذج',
  'Goods Receipt Note (GRN)': 'إشعار استلام البضائع (GRN)',
  'GRN Entry & Management': 'إدخال وإدارة إشعار استلام البضائع',
  'My Profile': 'ملفي الشخصي',
};

const AR_SECTION_MAP: Record<string, string> = {
  Main: 'الرئيسية',
  Procurement: 'المشتريات والتوريد',
  Approvals: 'الموافقات',
  'Orders & Payments': 'الطلبات والمدفوعات',
  Account: 'الحساب',
  Governance: 'الحوكمة والموردون',
  Admin: 'الإدارة',
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
  const { companyName, logoUrl } = useBranding();
  const { isFrench, isArabic } = useLanguage();
  const sidebarRef = useRef<HTMLElement>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const collapsed = !isHovered;
  const companyCode = getTenantCompanyCode();
  const dashboardPath = isVendor(roles)
    ? (companyCode ? `/v/${companyCode.toLowerCase()}/dashboard` : '/vendor/dashboard')
    : '/dashboard';

  // Persistent user preference for collapsible sidebar sections
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('heliflow_collapsed_sections');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem('heliflow_collapsed_sections', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

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
          .filter((item) => ['rfq', 'purchase-requisitions', 'budget-management', 'company-grn', 'contracts', 'create-purchase-invoice', 'create-payment-voucher', 'vendor-rfqs', 'vendor-quotations', 'forms'].includes(item.id))
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
        ...menuItems
          .filter((item) => item.id === 'vendor-invoices')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Truck size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'vendor-payments')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <CreditCard size={19} />, path: item.path })),
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
        ...menuItems
          .filter((item) => item.id === 'vendor-signature')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <PenLine size={19} />, path: item.path })),
      ],
    },
    {
      title: 'Governance',
      items: [
        ...menuItems
          .filter((item) => item.id === 'new-onboarding')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Building size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'onboarding-queue')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <UsersRound size={19} />, path: item.path })),
        ...menuItems
          .filter((item) => item.id === 'vendors')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Users size={19} />, path: item.path })),
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
          'fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden border-r border-[var(--shell-border)] [background:var(--shell-bg)] text-[var(--shell-text)] shadow-md shadow-slate-900/5 transition-[width,transform] duration-200 ease-out dark:shadow-slate-950/30 lg:translate-x-0',
          mobileOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full',
          collapsed ? 'lg:w-20' : 'lg:w-[280px]',
        )}
      >
        <div
          className={cn(
            'flex h-16 shrink-0 cursor-pointer items-center gap-3 border-b border-[var(--shell-border)] px-5 transition-[padding] duration-200',
            collapsed && 'justify-center px-0',
          )}
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
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== heliflowLogo) {
                target.src = heliflowLogo;
              }
            }}
            className="h-9 w-9 shrink-0 rounded-xl object-contain ring-1 ring-[var(--shell-border)]"
          />
          <span
            className={cn(
              'min-w-0 truncate text-[18px] font-semibold tracking-[-0.03em] text-[var(--shell-text)] transition-opacity',
              collapsed && 'hidden pointer-events-none opacity-0',
            )}
          >
            {companyName}
          </span>
        </div>

        <nav className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 [scrollbar-color:var(--shell-scrollbar)_transparent] [scrollbar-width:thin]">
          {NAV_SECTIONS.map((section) => {
            const isSectionCollapsed = Boolean(collapsedSections[section.title]);
            const hasActiveItem = section.items.some((item) =>
              item.path.endsWith('/dashboard')
                ? location.pathname === item.path
                : location.pathname.startsWith(item.path),
            );

            return (
              <div key={section.title} className="mb-2">
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  aria-expanded={!isSectionCollapsed}
                  title={isSectionCollapsed ? `Expand ${section.title} (${section.items.length} items)` : `Collapse ${section.title}`}
                  className={cn(
                    'group/sec flex w-full items-center justify-between px-3 pb-1.5 pt-4 text-left transition-colors select-none cursor-pointer rounded-lg hover:bg-[var(--shell-item-hover-bg)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)]',
                    collapsed && 'h-2 overflow-hidden px-0 py-0 opacity-0 pointer-events-none',
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--shell-section-label)] group-hover/sec:text-[var(--shell-text)] transition-colors">
                      {isArabic ? (AR_SECTION_MAP[section.title] || section.title) : isFrench ? (FR_SECTION_MAP[section.title] || section.title) : section.title}
                    </span>
                    {isSectionCollapsed && hasActiveItem && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-[var(--shell-accent,#0a6ed1)] ring-2 ring-[var(--shell-accent,#0a6ed1)]/30 animate-pulse shrink-0"
                        title="Active page inside this section"
                      />
                    )}
                  </div>

                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] transition-all duration-150',
                      isSectionCollapsed
                        ? 'border-[var(--shell-accent,#0a6ed1)]/40 bg-[var(--shell-accent,#0a6ed1)]/15 text-[var(--shell-accent,#0a6ed1)] group-hover/sec:bg-[var(--shell-accent,#0a6ed1)] group-hover/sec:text-white'
                        : 'border-[var(--shell-border)]/60 bg-[var(--shell-border)]/20 text-[var(--shell-section-label)] group-hover/sec:border-[var(--shell-border)] group-hover/sec:text-[var(--shell-text)] group-hover/sec:bg-[var(--shell-border)]/40',
                    )}
                  >
                    {isSectionCollapsed ? (
                      <Plus size={12} strokeWidth={2.5} className="transition-transform duration-150 group-hover/sec:scale-110" />
                    ) : (
                      <Minus size={12} strokeWidth={2.5} className="transition-transform duration-150 group-hover/sec:scale-110" />
                    )}
                  </span>
                </button>

                <div
                  className={cn(
                    'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
                    isSectionCollapsed
                      ? 'grid-rows-[0fr] opacity-0 pointer-events-none'
                      : 'grid-rows-[1fr] opacity-100',
                  )}
                >
                  <div className="overflow-hidden">
                    {section.items.map((item) => {
                      const isActive =
                        item.path.endsWith('/dashboard')
                          ? location.pathname === item.path
                          : location.pathname.startsWith(item.path);

                      const displayLabel = isArabic
                        ? (AR_NAV_MAP[item.label] || item.label)
                        : isFrench
                        ? (FR_NAV_MAP[item.label] || item.label)
                        : item.label;

                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          aria-current={isActive ? 'page' : undefined}
                          title={collapsed ? displayLabel : undefined}
                          className={cn(
                            'group relative my-1 flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--shell-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--shell-bg)]',
                            collapsed && 'justify-center px-0',
                            isActive
                              ? 'bg-[var(--shell-item-active-bg)] font-semibold text-[var(--shell-item-active-text)] shadow-xs'
                              : 'text-[var(--shell-item-text)] hover:bg-[var(--shell-item-hover-bg)] hover:text-[var(--shell-item-hover-text)]',
                          )}
                          onClick={() => {
                            onMobileClose();
                          }}
                        >
                          {isActive && (
                            <span className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-[var(--shell-accent)]" />
                          )}
                          <span
                            className={cn(
                              'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
                              isActive
                                ? 'text-[var(--shell-item-active-text)]'
                                : 'text-[var(--shell-item-icon)] group-hover:text-[var(--shell-item-hover-text)]',
                            )}
                          >
                            {item.icon}
                          </span>
                          <span
                            className={cn(
                              'min-w-0 truncate transition-opacity',
                              collapsed && 'hidden pointer-events-none opacity-0',
                            )}
                          >
                            {displayLabel}
                          </span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
