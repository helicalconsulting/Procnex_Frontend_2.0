import { useState, useRef, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useBranding } from '../../context/BrandingContext';
import { useLanguage } from '../../context/LanguageContext';
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
import { isVendor } from '../../utils/rbac';
import VendorNotificationBell from './VendorNotificationBell';
import AdminNotificationBell from './AdminNotificationBell';
import HeaderCalendarPopover from './HeaderCalendarPopover';
import { cn } from '../../lib/utils';
import { motionTransition } from '../../lib/motion';

// ─── Page title mapping ─────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/rfq': 'Request for Quotations',
  '/quotations': 'Quotation Approval',
  '/procurement/purchase-requisitions': 'PO Creation & Orders',
  '/procurement/purchase-requisition': 'PO Creation & Orders',
  '/procurement/grns': 'My Invoices & Dispatches',
  '/procurement/goods-receipt': 'Goods Receipt Note (GRN)',
  '/procurement/create-company-grn': 'Create Goods Receipt Note (GRN)',
  '/procurement/create-grn': 'Create Dispatch Note',
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

interface TopBarProps {
  mobileOpen: boolean;
  onMenuClick: () => void;
  isSidebarExpanded?: boolean;
}

const iconButtonClass = 'relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.97]';

export default function TopBar({ mobileOpen, onMenuClick, isSidebarExpanded }: TopBarProps) {
  const { user, roles, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { language, toggleLanguage } = useLanguage();
  const { companyName } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
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

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        setIsCalendarOpen(false);
        if (dropdownOpen) requestAnimationFrame(() => accountButtonRef.current?.focus());
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;
    requestAnimationFrame(() => {
      dropdownPopupRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }, [dropdownOpen]);

  const handleAccountMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    if (items.length === 0) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (Math.max(0, currentIndex) + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[nextIndex].focus();
  };

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
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-border/80 bg-card/95 px-2 transition-[left] duration-200 ease-out supports-[backdrop-filter:blur(1px)]:bg-card/85 supports-[backdrop-filter:blur(1px)]:backdrop-blur-xl sm:px-4 lg:right-0 lg:px-5',
        isSidebarExpanded ? 'lg:left-[280px]' : 'lg:left-20'
      )}
    >
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <button
          type="button"
          id="navigation-trigger"
          className={cn(iconButtonClass, 'lg:hidden')}
          onClick={onMenuClick}
          aria-label="Open navigation"
          aria-controls="primary-navigation"
          aria-expanded={mobileOpen}
        >
          <Menu size={20} />
        </button>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground sm:flex">
          <button
            ref={accountButtonRef}
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => navigate(dashboardPath)}
            aria-label="Go to dashboard"
          >
            <Home size={14} />
          </button>
          {section && (
            <>
              <ChevronRight size={12} className="text-border-strong" />
              <span className="hidden font-medium md:inline">{section}</span>
            </>
          )}
          <ChevronRight size={12} className="text-border-strong" />
          <span className="max-w-[240px] truncate font-semibold text-foreground">{pageTitle}</span>
        </nav>
        <span className="truncate pr-2 text-sm font-semibold text-foreground sm:hidden">{pageTitle}</span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <div className="relative" ref={calendarRef}>
          <button
            type="button"
            className={iconButtonClass}
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
            title="Open calendar"
            aria-label="Open calendar"
            aria-expanded={isCalendarOpen}
          >
            <CalendarDays size={18} />
          </button>
          {isCalendarOpen && (
            <HeaderCalendarPopover onClose={() => setIsCalendarOpen(false)} />
          )}
        </div>

        {/* Language toggle */}
        <button
          type="button"
          className={iconButtonClass}
          onClick={toggleLanguage}
          title={language === 'fr' ? 'Switch to English 🇺🇸' : 'Changer en Français 🇫🇷'}
          aria-label="Toggle language"
        >
          <span className="flex items-center gap-1 text-[12px] font-bold">
            <Globe size={15} />
            <span>{language === 'fr' ? 'FR' : 'EN'}</span>
          </span>
        </button>

        {/* Theme toggle */}
        <button
          type="button"
          className={iconButtonClass}
          onClick={(e) => toggleTheme(e)}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.span
              key={isDark ? 'sun' : 'moon'}
              className="grid place-items-center"
              initial={{ opacity: 0, rotate: -24, scale: 0.75 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 24, scale: 0.75 }}
              transition={motionTransition.fast}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Notifications */}
        {isVendor(roles) ? <VendorNotificationBell /> : <AdminNotificationBell />}

        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            className="flex min-h-11 items-center gap-2 rounded-xl p-1 pr-2 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            aria-controls="account-menu"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/15 dark:bg-primary dark:text-primary-foreground">{initials}</span>
            <span className="hidden min-w-0 flex-col lg:flex">
              <span className="max-w-40 truncate text-[14px] font-semibold leading-4 text-foreground">{user?.fullName || 'Account'}</span>
              <span className="max-w-40 truncate text-[12px] leading-4 text-muted-foreground">{roles.join(', ')}</span>
            </span>
            <ChevronDown size={14} className={cn('hidden text-muted-foreground transition-transform lg:block', dropdownOpen && 'rotate-180')} />
          </button>

          <AnimatePresence initial={false}>
          {dropdownOpen && (
            <motion.div
              id="account-menu"
              role="menu"
              ref={dropdownPopupRef}
              onKeyDown={handleAccountMenuKeyDown}
              initial={{ opacity: 0, y: -5, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.985 }}
              transition={motionTransition.fast}
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-slate-950/15 backdrop-blur-xl"
            >
              <div className="rounded-xl bg-muted/70 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{user?.fullName || 'Account'}</div>
                    <div className="truncate text-xs text-muted-foreground">{user?.email || roles.join(', ')}</div>
                  </div>
                </div>
              </div>
              <div className="my-1 h-px bg-border" />
              <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={handleMyProfile}>
                <User size={17} /> My Profile
              </button>
              <div className="my-1 h-px bg-border" />
              <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive" onClick={logout}>
                <LogOut size={17} /> Sign Out
              </button>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
