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
} from 'lucide-react';
import { isVendor } from '../../utils/rbac';
import VendorNotificationBell from './VendorNotificationBell';
import AdminNotificationBell from './AdminNotificationBell';
import './TopBar.css';

// ─── Page title mapping ─────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/rfq': 'Request for Quotations',
  '/quotations': 'Quotations',
  '/vendors': 'Vendors',
  '/vendor-portal': 'Vendor Portal',
  '/approvals': 'Approvals',
  '/documents': 'Documents',
  '/notifications': 'Notifications',
  '/audit': 'Audit Trail',
  '/admin/users': 'User Management',
  '/admin/roles-permissions': 'Roles & Permissions',
  '/admin/approval-levels': 'Approval Levels',
  '/admin/company-settings': 'Company Settings',
  '/accounts-payable': 'Accounts Payable',
  '/payments': 'Payments',
  '/sales-orders': 'Sales Orders',
  '/onboarding/new': 'New Onboarding',
  '/onboarding/queue': 'Onboarding Queue',
  '/vendor/dashboard': 'Vendor Dashboard',
  '/vendor/rfqs': 'My RFQs',
  '/vendor/quotations': 'My Quotations',
  '/vendor/orders': 'Purchase Orders',
  '/vendor/invoices': 'Invoices',
  '/vendor/profile': 'Profile',
  '/profile': 'My Profile',
  '/signature': 'Signature',
  '/reports': 'Reports',
};

// Section mapping for breadcrumbs
const SECTION_MAP: Record<string, string> = {
  '/dashboard': 'Main',
  '/rfq': 'Procurement',
  '/quotations': 'Procurement',
  '/approvals': 'Approvals',
  '/accounts-payable': 'Approvals',
  '/admin/company-settings': 'Company Settings',
  '/payments': 'Approvals',
  '/sales-orders': 'Approvals',
  '/vendors': 'Admin',
  '/documents': 'Documents',
  '/notifications': 'System',
  '/audit': 'Intelligence',
  '/reports': 'Admin',
  '/admin/users': 'Admin',
  '/admin/roles-permissions': 'Admin',
  '/admin/approval-levels': 'Admin',
  '/onboarding/new': 'Governance',
  '/onboarding/queue': 'Governance',
  '/signature': 'Governance',
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
  const { companyName } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownPopupRef = useRef<HTMLDivElement>(null);

  const handleMyProfile = () => {
    setDropdownOpen(false);
    navigate(isVendor(roles) ? '/vendor/profile' : '/profile');
  };

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
          <Home size={14} className="topbar__breadcrumb-home" />
          {section && (
            <>
              <ChevronRight size={12} className="topbar__breadcrumb-sep" />
              <span className="topbar__breadcrumb-section">{section}</span>
            </>
          )}
          <ChevronRight size={12} className="topbar__breadcrumb-sep" />
          <span className="topbar__breadcrumb-current">{pageTitle}</span>
        </nav>
      </div>

      {/* Right — Actions */}
      <div className="topbar__right">
        {/* Theme toggle */}
        <button
          className="topbar__icon-btn"
          onClick={toggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
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
            size={14}
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
