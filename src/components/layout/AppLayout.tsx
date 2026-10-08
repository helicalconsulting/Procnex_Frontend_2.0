import { useEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { sseClient } from '../../services/sseClient';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import ToastContainer from '../shared/ToastContainer';
import { PageTransition } from '../motion/PageTransition';
import { cn } from '../../lib/utils';

export default function AppLayout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const previousPathRef = useRef(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const queryClient = useQueryClient();

  const handleMobileOpen = useCallback(() => {
    setMobileOpen(true);
  }, []);

  const handleMobileClose = useCallback(() => {
    setMobileOpen(false);
  }, []);

  // Centralize SSE connection & Global Real-Time Event Dispatcher across all screens
  useEffect(() => {
    sseClient.connect();

    // Global handler when any real-time SSE event is received
    const handleGlobalSSE = (eventData: any) => {
      // 1. Immediately invalidate all active services queries so visible pages refetch without reload
      queryClient.invalidateQueries({ queryKey: ['svc'] });
      queryClient.refetchQueries({ queryKey: ['svc'], type: 'active' });

      // 2. Dispatch custom events for components listening on window
      window.dispatchEvent(new CustomEvent('heliflow:sse-event', { detail: eventData }));
      window.dispatchEvent(new CustomEvent('heliflow:notification-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:rfq-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:approval-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:po-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:quotation-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:payment-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:vendor-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:grn-updated'));
      window.dispatchEvent(new CustomEvent('heliflow:dashboard-updated'));
    };

    const unsubAny = typeof sseClient.onAny === 'function' ? sseClient.onAny(handleGlobalSSE) : () => {};
    const unsubNotification = sseClient.on('notification', handleGlobalSSE);
    const unsubRfq = sseClient.on('rfq_status_changed', handleGlobalSSE);
    const unsubApprovalReq = sseClient.on('approval_required', handleGlobalSSE);
    const unsubApprovalLvl = sseClient.on('approval_level_complete', handleGlobalSSE);
    const unsubApprovalChain = sseClient.on('approval_chain_complete', handleGlobalSSE);
    const unsubPo = sseClient.on('po_created', handleGlobalSSE);
    const unsubPoStatus = sseClient.on('po_status_changed', handleGlobalSSE);
    const unsubQuotation = sseClient.on('quotation_received', handleGlobalSSE);
    const unsubQuotationStatus = sseClient.on('quotation_status_changed', handleGlobalSSE);
    const unsubVendor = sseClient.on('vendor_approved', handleGlobalSSE);
    const unsubGrn = sseClient.on('grn_created', handleGlobalSSE);

    return () => {
      unsubAny();
      unsubNotification();
      unsubRfq();
      unsubApprovalReq();
      unsubApprovalLvl();
      unsubApprovalChain();
      unsubPo();
      unsubPoStatus();
      unsubQuotation();
      unsubQuotationStatus();
      unsubVendor();
      unsubGrn();
      sseClient.disconnect();
    };
  }, [queryClient]);

  useEffect(() => {
    if (previousPathRef.current !== location.pathname) {
      previousPathRef.current = location.pathname;
      requestAnimationFrame(() => mainRef.current?.focus());
    }
  }, [location.pathname]);

  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main-content"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xl outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
        isHovered={isSidebarHovered}
        onHoverChange={setIsSidebarHovered}
      />

      <div
        className={cn(
          'flex min-h-svh min-w-0 flex-col transition-[margin] duration-200 ease-out',
          isSidebarHovered ? 'lg:ml-[280px]' : 'lg:ml-20'
        )}
      >
        <TopBar
          mobileOpen={mobileOpen}
          onMenuClick={handleMobileOpen}
          isSidebarExpanded={isSidebarHovered}
        />
        <div className="flex min-h-0 flex-1 flex-col bg-background pt-16">
          <main
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            className="w-full min-w-0 flex-1 scroll-mt-20 px-2 py-4 pb-8 outline-none sm:px-3 sm:py-5 lg:px-4 lg:py-5"
          >
            <AnimatePresence mode="wait" initial={false}>
              <PageTransition key={location.pathname}>
                <Outlet />
              </PageTransition>
            </AnimatePresence>
          </main>
          <ToastContainer />
        </div>
      </div>
    </div>
  );
}
