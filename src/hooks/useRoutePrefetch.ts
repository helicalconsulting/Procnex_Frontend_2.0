import { useCallback, useRef } from 'react';
import { rfqService } from '../services/rfqService';
import { vendorService } from '../services/vendorService';
import { quotationService } from '../services/quotationService';
import { approvalService } from '../services/approvalService';
import { notificationService } from '../services/notificationService';
import { dashboardService } from '../services/dashboardService';
import { adminService } from '../services/adminService';
import { invoiceService } from '../services/invoiceService';
import { vendorPortalService } from '../services/vendorPortalService';
import { localDataService } from '../services/localDataService';
import { reportsService } from '../services/reportsService';
import { profileService } from '../services/profileService';
import { procurementService } from '../services/procurementService';
import { signatureService } from '../services/signatureService';

type Fetcher = () => Promise<unknown>;

/**
 * Route-to-fetcher mapping.
 * Each route maps to one or more service functions that warm the API cache
 * when the user hovers over a navigation link.
 */
const ROUTE_FETCHERS: Record<string, Fetcher[]> = {
  '/dashboard': [
    () => dashboardService.getKpis(),
    () => dashboardService.getPipeline(),
    () => dashboardService.getRecentRfqs(),
    () => dashboardService.getSpendOverview(),
    () => dashboardService.getTopVendors(),
  ],
  '/rfq': [
    () => rfqService.list({ limit: 100 }),
  ],
  '/rfq/create': [],
  '/vendors': [
    () => vendorService.list(),
  ],
  '/quotations': [
    () => quotationService.list(),
  ],
  '/approvals': [
    () => approvalService.listTable(),
  ],
  '/payments': [
    () => localDataService.getPayments(),
  ],
  '/sales-orders': [
    () => localDataService.getSalesOrders(),
  ],
  '/accounts-payable': [
    () => invoiceService.list(),
  ],
  '/notifications': [
    () => notificationService.list(),
  ],
  '/reports': [
    () => reportsService.list(),
  ],
  '/audit': [
    () => localDataService.getAuditTrail(),
  ],
  '/documents': [
    () => localDataService.getDocuments(),
  ],
  '/admin/users': [
    () => adminService.listUsers(),
  ],
  '/admin/roles-permissions': [
    () => adminService.listRoles(),
  ],
  '/admin/approval-levels': [
    () => adminService.listApprovalLevels(),
  ],
  '/profile': [
    () => profileService.getDocuments(),
  ],
  '/onboarding/new': [
    () => procurementService.listInvitations(),
  ],
  '/onboarding/queue': [
    () => procurementService.getOnboardingQueue(),
    () => procurementService.listPendingDocuments(),
  ],
  '/signature': [
    () => signatureService.list(),
  ],
  '/vendor/dashboard': [
    () => vendorPortalService.listRfqs(),
    () => vendorPortalService.listQuotations(),
    () => vendorPortalService.listOrders(),
    () => vendorPortalService.listInvoices(),
    () => vendorPortalService.listNotifications(),
  ],
  '/vendor/rfqs': [
    () => vendorPortalService.listRfqs(),
  ],
  '/vendor/quotations': [
    () => vendorPortalService.listQuotations(),
  ],
  '/vendor/orders': [
    () => vendorPortalService.listOrders(),
  ],
  '/vendor/invoices': [
    () => vendorPortalService.listInvoices(),
  ],
  '/vendor/profile': [
    () => vendorPortalService.getProfile(),
  ],
};

/**
 * Matches a route path to the closest prefetch entry.
 * e.g. '/admin/users/5' matches '/admin/users'
 */
function matchRoute(path: string): string | null {
  // Exact match first
  if (ROUTE_FETCHERS[path]) return path;
  // Prefix match: find the longest matching key
  let best: string | null = null;
  let bestLen = 0;
  for (const key of Object.keys(ROUTE_FETCHERS)) {
    if (path.startsWith(key) && key.length > bestLen) {
      best = key;
      bestLen = key.length;
    }
  }
  return best;
}

const FETCHED_ROUTES = new Set<string>();

/**
 * Hook that returns an `onMouseEnter` handler for navigation links.
 * Fires service calls early so the API cache is warm when the user navigates.
 *
 * Usage:
 *   const prefetch = useRoutePrefetch();
 *   <NavLink onMouseEnter={prefetch('/vendors')} ... />
 */
export function useRoutePrefetch() {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const prefetch = useCallback((routePath: string) => {
    return () => {
      const matched = matchRoute(routePath);
      if (!matched) return;

      // Avoid re-fetching routes we've already warmed this session
      if (FETCHED_ROUTES.has(matched)) return;
      FETCHED_ROUTES.add(matched);

      const fetchers = ROUTE_FETCHERS[matched];
      if (!fetchers.length) return;

      // Debounce: wait 150ms of hover stability before firing
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // Fire fetchers sequentially to avoid flooding the backend
        const run = async () => {
          for (const fetcher of fetchers) {
            try {
              await fetcher();
            } catch {
              // Prefetch failures are non-critical — ignore
            }
          }
        };
        run();
      }, 150);
    };
  }, []);

  return prefetch;
}
