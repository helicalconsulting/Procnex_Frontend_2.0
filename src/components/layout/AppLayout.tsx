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

    let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedInvalidate = () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      invalidateTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['svc'] });
      }, 500);
    };

    // Targeted handler when real-time SSE events are received
    const dispatchTargetedEvent = (category: string, eventData: any) => {
      debouncedInvalidate();
      window.dispatchEvent(new CustomEvent('heliflow:sse-event', { detail: eventData }));

      switch (category) {
        case 'notification':
          window.dispatchEvent(new CustomEvent('heliflow:notification-updated', { detail: eventData }));
          break;
        case 'rfq':
          window.dispatchEvent(new CustomEvent('heliflow:rfq-updated', { detail: eventData }));
          break;
        case 'approval':
          window.dispatchEvent(new CustomEvent('heliflow:approval-updated', { detail: eventData }));
          break;
        case 'po':
          window.dispatchEvent(new CustomEvent('heliflow:po-updated', { detail: eventData }));
          break;
        case 'quotation':
          window.dispatchEvent(new CustomEvent('heliflow:quotation-updated', { detail: eventData }));
          break;
        case 'vendor':
          window.dispatchEvent(new CustomEvent('heliflow:vendor-updated', { detail: eventData }));
          break;
        case 'grn':
          window.dispatchEvent(new CustomEvent('heliflow:grn-updated', { detail: eventData }));
          break;
        case 'payment':
          window.dispatchEvent(new CustomEvent('heliflow:payment-updated', { detail: eventData }));
          break;
        default:
          break;
      }
    };

    const unsubs = [
      sseClient.on('notification', (d) => dispatchTargetedEvent('notification', d)),
      sseClient.on('vendor_notification', (d) => dispatchTargetedEvent('notification', d)),
      sseClient.on('rfq_status_changed', (d) => dispatchTargetedEvent('rfq', d)),
      sseClient.on('approval_required', (d) => dispatchTargetedEvent('approval', d)),
      sseClient.on('approval_level_complete', (d) => dispatchTargetedEvent('approval', d)),
      sseClient.on('approval_chain_complete', (d) => dispatchTargetedEvent('approval', d)),
      sseClient.on('approval_updated', (d) => dispatchTargetedEvent('approval', d)),
      sseClient.on('approval_initiated', (d) => dispatchTargetedEvent('approval', d)),
      sseClient.on('approval_auto_forwarded', (d) => dispatchTargetedEvent('approval', d)),
      sseClient.on('po_created', (d) => dispatchTargetedEvent('po', d)),
      sseClient.on('po_updated', (d) => dispatchTargetedEvent('po', d)),
      sseClient.on('po_status_changed', (d) => dispatchTargetedEvent('po', d)),
      sseClient.on('quotation_received', (d) => dispatchTargetedEvent('quotation', d)),
      sseClient.on('quotation_status_changed', (d) => dispatchTargetedEvent('quotation', d)),
      sseClient.on('vendor_approved', (d) => dispatchTargetedEvent('vendor', d)),
      sseClient.on('grn_created', (d) => dispatchTargetedEvent('grn', d)),
    ];

    return () => {
      if (invalidateTimer) clearTimeout(invalidateTimer);
      unsubs.forEach((unsub) => unsub());
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
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-xl outline-none transition-transform focus:translate-y-0 focus:ring-2 focus:ring-ring focus:ring-offset-2 print:hidden"
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
