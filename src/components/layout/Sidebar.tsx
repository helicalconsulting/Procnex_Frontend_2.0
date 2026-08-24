import { NavLink, useLocation } from 'react-router-dom';
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
  ChevronLeft,
  ChevronRight,
  FormInput,
} from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import heliflowLogo from '../../assets/heliflow.png';
import { useNavigationMenu } from '../../hooks/useRoleAccess';
import { useRoutePrefetch } from '../../hooks/useRoutePrefetch';
import { useLanguage } from '../../context/LanguageContext';
import './Sidebar.css';

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

// Icon mapping for menu items
const ICON_MAP: Record<string, React.ReactNode> = {
  Dashboard: <LayoutDashboard size={19} />,
  'RFQ Management': <FileText size={19} />,
  Quotations: <ClipboardList size={19} />,
  'Quotation Approval': <ClipboardList size={19} />,
  'PO Creation': <ShoppingCart size={19} />,
  'Purchase Orders': <ShoppingCart size={19} />,
  'PO Approval': <ShoppingCart size={19} />,
  'Accounts Payable': <Wallet size={19} />,
  'Purchase Invoice Approval': <Wallet size={19} />,
  'Payments': <CreditCard size={19} />,
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
  'Agreements': <FileSignature size={19} />,
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

// ─── Component ──────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onToggle,
  onMobileClose,
}: SidebarProps) {
  const location = useLocation();
  const menuItems = useNavigationMenu();
  const prefetch = useRoutePrefetch();
  const { companyName, logoUrl } = useBranding();
  const { isFrench } = useLanguage();

  // Convert menu items to nav sections
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
          .filter((item) => ['rfq', 'contracts', 'create-purchase-invoice', 'create-payment-voucher', 'vendor-rfqs', 'vendor-quotations', 'purchase-requisitions', 'forms'].includes(item.id))
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
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <Receipt size={19} />, path: item.path })),
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
      ],
    },
    {
      title: 'Admin',
      items: [
        ...menuItems
          .filter((item) => item.id === 'signature')
          .map((item) => ({ label: item.label, icon: ICON_MAP[item.label] || <PenLine size={19} />, path: item.path })),
        // Admin children (Users, Roles, Approval Levels)
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

  const sidebarClasses = [
    'sidebar',
    collapsed ? 'sidebar--collapsed' : '',
    mobileOpen ? 'sidebar--mobile-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`sidebar__backdrop ${mobileOpen ? 'sidebar__backdrop--visible' : ''}`}
        onClick={onMobileClose}
      />

      <aside className={sidebarClasses}>
        {/* Logo */}
        <div className="sidebar__logo">
          <img
            src={logoUrl || heliflowLogo}
            alt={companyName}
            className="sidebar__logo-img"
          />
          <span className="sidebar__logo-text">{companyName}</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar__nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="sidebar__section">
              <span className="sidebar__section-label">
                {isFrench ? (FR_SECTION_MAP[section.title] || section.title) : section.title}
              </span>
              {section.items.map((item) => {
                const isActive =
                  item.path === '/dashboard' || item.path === '/vendor/dashboard'
                    ? location.pathname === item.path
                    : location.pathname.startsWith(item.path);

                const displayLabel = isFrench ? (FR_NAV_MAP[item.label] || item.label) : item.label;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
                    onClick={() => {
                      onMobileClose();
                    }}
                    onMouseEnter={prefetch(item.path)}
                  >
                    <span className="sidebar__item-icon">{item.icon}</span>
                    <span className="sidebar__item-label">{displayLabel}</span>
                    <span className="sidebar__item-tooltip">{displayLabel}</span>
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
