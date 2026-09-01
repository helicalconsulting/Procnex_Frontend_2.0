import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useBranding } from '../../context/BrandingContext';
import {
  Menu,
  Sun,
  Moon,
  LogOut,
  User,
  ChevronDown,
  Home,
  ChevronRight,
  CalendarDays,
  Globe,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { isVendor } from '../../utils/rbac';
import VendorNotificationBell from './VendorNotificationBell';
import AdminNotificationBell from './AdminNotificationBell';
import HeaderCalendarPopover from './HeaderCalendarPopover';
import './TopBar.css';

// ─── Page title mapping ─────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/rfq': 'Request for Quotations',
  '/quotations': 'Quotation Approval',
  '/procurement/purchase-requisitions': 'PO Creation & Orders',
  '/procurement/purchase-requisition': 'PO Creation & Orders',
  '/procurement/grns': 'My Invoices & GRN',
  '/procurement/create-grn': 'Create Goods Received Note',
  '/procurement': 'PO Creation & Orders',
  '/contracts': 'Contracts',
  '/vendors': 'Vendors',
  '/vendor-portal': 'Vendor Portal',
  '/approvals': 'Purchase Order Approval',
  '/documents': 'Documents',
  '/forms': 'Forms Settings',
  '/notifications': 'Notifications',
  '/audit': 'Audit Trail',
  '/admin/users': 'User Management',
  '/admin/roles-permissions': 'Roles & Permissions',
  '/admin/approval-levels': 'Approval Levels',
  '/admin/company-settings': 'Company Settings',
  '/admin/custom-form-builder': 'Form Builder',
  '/admin/form-responses': 'Form Responses',
  '/accounts-payable': 'Purchase Invoice Approval',
  '/procurement/create-purchase-invoice': 'Create Purchase Invoice',
  '/procurement/create-payment-voucher': 'Create Payment Voucher',
  '/payments': 'Payment Voucher Approval',
  '/sales-orders': 'Sales Orders',
  '/onboarding/new': 'New Onboarding',
  '/onboarding/queue': 'Onboarding Queue',
  '/vendor/dashboard': 'Vendor Dashboard',
  '/vendor/rfqs': 'My RFQs',
  '/vendor/quotations': 'My Quotations',
  '/vendor/orders': 'Purchase Orders',
  '/vendor/invoices': 'Invoices',
  '/vendor/create-invoice': 'Create Vendor Invoice',
  '/vendor/contracts': 'Contracts',
  '/vendor/agreements': 'Agreements',
  '/vendor/profile': 'Profile',
  '/profile': 'My Profile',
  '/signature': 'Signature',
  '/reports': 'Reports',
};

// Section mapping for breadcrumbs (e.g. Home > Procurement > PO Creation & Orders)
const SECTION_MAP: Record<string, string> = {
  '/dashboard': 'Main',
  '/rfq': 'Procurement',
  '/quotations': 'Procurement',
  '/procurement/purchase-requisitions': 'Procurement',
  '/procurement/purchase-requisition': 'Procurement',
  '/procurement': 'Procurement',
  '/contracts': 'Procurement',
  '/approvals': 'Approvals',
  '/accounts-payable': 'Approvals',
  '/payments': 'Approvals',
  '/sales-orders': 'Approvals',
  '/vendors': 'Governance',
  '/admin/company-settings': 'Admin',
  '/admin/users': 'Admin',
  '/admin/roles-permissions': 'Admin',
  '/admin/approval-levels': 'Admin',
  '/admin/custom-form-builder': 'Admin',
  '/admin/form-responses': 'Admin',
  '/documents': 'Documents',
  '/forms': 'Documents',
  '/notifications': 'System',
  '/audit': 'Intelligence',
  '/reports': 'Admin',
  '/onboarding/new': 'Governance',
  '/onboarding/queue': 'Governance',
  '/signature': 'Admin',
  '/vendor/dashboard': 'Vendor Portal',
  '/vendor/rfqs': 'Vendor Portal',
  '/vendor/quotations': 'Vendor Portal',
  '/vendor/orders': 'Vendor Portal',
  '/vendor/invoices': 'Vendor Portal',
  '/vendor/create-invoice': 'Vendor Portal',
  '/vendor/contracts': 'Vendor Portal',
  '/vendor/agreements': 'Vendor Portal',
  '/vendor/profile': 'Vendor Portal',
  '/profile': 'System',
};

function getPageTitle(pathname: string, fallback: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const match = Object.keys(PAGE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname.startsWith(key));
  return match ? PAGE_TITLES[match] : fallback;
}

function getSection(pathname: string): string {
  if (SECTION_MAP[pathname]) return SECTION_MAP[pathname];
  const match = Object.keys(SECTION_MAP)
    .sort((a, b) => b.length - a.length)
    .find((key) => pathname.startsWith(key));
  return match ? SECTION_MAP[match] : '';
}

// ─── Component ──────────────────────────────────────────────

interface TopBarProps {
  onMenuClick: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { user, roles, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();
  const { companyName } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownPopupRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const handleMyProfile = () => {
    setDropdownOpen(false);
    navigate(isVendor(roles) ? '/vendor/profile' : '/profile');
  };

  // Close calendar on click outside
  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isCalendarOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownPopupRef.current &&
        !dropdownPopupRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const pageTitle = getPageTitle(location.pathname, companyName);
  const section = getSection(location.pathname);

  // Get user initials for avatar
  const initials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const dashboardPath = isVendor(roles) ? '/vendor/dashboard' : '/dashboard';

  return (
    <header className="topbar">
      {/* Left — Breadcrumb */}
      <div className="topbar__left">
        <button
          className="topbar__hamburger"
          onClick={onMenuClick}
          aria-label="Toggle menu"
        >
          <Menu size={20} />
        </button>

        <nav className="topbar__breadcrumb">
          <Home
            size={16}
            className="topbar__breadcrumb-home"
            onClick={() => navigate(dashboardPath)}
            title="Go to Dashboard"
          />
          {section && (
            <>
              <ChevronRight size={14} className="topbar__breadcrumb-sep" />
              <span
                className="topbar__breadcrumb-section"
                onClick={() => navigate(dashboardPath)}
                title="Go to Dashboard"
              >
                {section}
              </span>
            </>
          )}
          <ChevronRight size={14} className="topbar__breadcrumb-sep" />
          <span className="topbar__breadcrumb-current">{pageTitle}</span>
        </nav>
      </div>

      {/* Right — Actions */}
      <div className="topbar__right">
        {/* Calendar toggle */}
        <div style={{ position: 'relative' }} ref={calendarRef}>
          <button
            className="topbar__icon-btn"
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            title="Open Laptop Calendar"
            aria-label="Toggle calendar"
          >
            <CalendarDays size={19} />
          </button>
          {isCalendarOpen && (
            <HeaderCalendarPopover onClose={() => setIsCalendarOpen(false)} />
          )}
        </div>

        {/* Language toggle */}
        <button
          className="topbar__icon-btn"
          onClick={toggleLanguage}
          title={language === 'fr' ? 'Switch to English 🇺🇸' : 'Changer en Français 🇫🇷'}
          aria-label="Toggle language"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 8px', fontSize: 12, fontWeight: 700 }}
        >
          <Globe size={16} />
          <span>{language === 'fr' ? 'FR 🇫🇷' : 'EN 🇺🇸'}</span>
        </button>

        {/* Theme toggle */}
        <button
          className="topbar__icon-btn"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={19} /> : <Moon size={19} />}
        </button>

        {/* Notifications */}
        {isVendor(roles) ? <VendorNotificationBell /> : <AdminNotificationBell />}

        <span className="topbar__divider" />

        {/* User */}
        <div
          className="topbar__user"
          ref={dropdownRef}
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <span className="topbar__avatar">{initials}</span>
          <div className="topbar__user-info">
            <span className="topbar__user-name">{user?.fullName}</span>
            <span className="topbar__user-role">{roles.join(', ')}</span>
          </div>
          <ChevronDown
            size={16}
            className={`topbar__chevron ${dropdownOpen ? 'topbar__chevron--open' : ''}`}
          />

          {/* Dropdown popup — positioned with CSS absolute, no FloatingMenu to avoid zoom/fixed conflict */}
          {dropdownOpen && (
            <div className="topbar__dropdown-popup" ref={dropdownPopupRef}>
              <div className="topbar__dropdown-popup__body">
                <div className="topbar__dropdown-header">
                  <span className="topbar__dropdown-avatar">{initials}</span>
                  <div>
                    <div className="topbar__dropdown-name">{user?.fullName}</div>
                    <div className="topbar__dropdown-email">{user?.email || roles.join(', ')}</div>
                  </div>
                </div>
                <div className="topbar__dropdown-divider" />
                <button type="button" className="topbar__dropdown-item" onClick={handleMyProfile}>
                  <User size={16} />
                  My Profile
                </button>
                <div className="topbar__dropdown-divider" />
                <button
                  type="button"
                  className="topbar__dropdown-item topbar__dropdown-item--danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    logout();
                  }}
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
