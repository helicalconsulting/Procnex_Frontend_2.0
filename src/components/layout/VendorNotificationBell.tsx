import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, FileText, Check } from 'lucide-react';
import { vendorPortalService, type VendorNotification } from '../../services/vendorPortalService';
import { sseClient } from '../../services/sseClient';
import { USE_MOCK } from '../../config/mock';
import { getVendorNotificationTargetUrl } from '../../lib/notificationRouter';
import FloatingMenu from '../shared/FloatingMenu';
import './VendorNotificationBell.css';

export default function VendorNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [bouncing, setBouncing] = useState(false);
  const bounceTimer = useRef<ReturnType<typeof setTimeout>>();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (silent = false) => {
    if (USE_MOCK) return;
    if (!silent) setLoading(true);
    try {
      const data = await vendorPortalService.listNotifications();
      const rawNotifications = data.notifications || [];
      const seen = new Set<string>();
      const deduplicated = rawNotifications.filter((n) => {
        const key = n.id ? String(n.id) : `${n.title}_${n.message}_${n.createdAt || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setNotifications(deduplicated);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      if (!silent) setNotifications([]);
      setUnreadCount(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load
    const timeout = window.setTimeout(() => {
      void load(false);
    }, 0);

    // Responsive 4-second polling to guarantee real-time updates (silent)
    const interval = setInterval(() => void load(true), 4000);

    const triggerBounce = () => {
      setBouncing(true);
      clearTimeout(bounceTimer.current);
      bounceTimer.current = setTimeout(() => setBouncing(false), 600);
      void load(true);
    };

    // SSE real-time listeners — instant notification delivery
    const unsubscribe = sseClient.on('vendor_notification', triggerBounce);
    const unsubscribeGeneric = sseClient.on('notification', triggerBounce);
    const unsubAny = typeof sseClient.onAny === 'function' ? sseClient.onAny(triggerBounce) : undefined;

    // Window event listeners
    window.addEventListener('heliflow:notification-updated', triggerBounce);
    window.addEventListener('heliflow:approval-updated', triggerBounce);
    window.addEventListener('storage', triggerBounce);

    return () => {
      window.clearTimeout(timeout);
      clearInterval(interval);
      clearTimeout(bounceTimer.current);
      unsubscribe();
      unsubscribeGeneric();
      if (typeof unsubAny === 'function') unsubAny();
      window.removeEventListener('heliflow:notification-updated', triggerBounce);
      window.removeEventListener('heliflow:approval-updated', triggerBounce);
      window.removeEventListener('storage', triggerBounce);
    };
  }, [load]);

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    void load(true);
  };

  const openRfq = (n: VendorNotification) => {
    // 1. Immediately close dropdown, update local count, and navigate with 0ms delay
    setOpen(false);
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      void vendorPortalService.markNotificationRead(n.id).catch(() => {});
    }
    const rfqId = n.metadata?.rfqId || n.metadata?.rfqNumber || (n.metadata as any)?.referenceId;
    const companyCode = (n.metadata as any)?.companyCode;
    const targetUrl = getVendorNotificationTargetUrl(n.title, n.message || '', rfqId, companyCode);
    navigate(targetUrl);
  };

  const markAllRead = async () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      await vendorPortalService.deleteAllNotifications();
    } catch {
      await vendorPortalService.markAllNotificationsRead().catch(() => {});
    }
    window.dispatchEvent(new CustomEvent('heliflow:notification-updated'));
  };

  return (
    <div className="vnotif relative inline-flex items-center" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="group relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.97]"
        title="Notifications"
        onClick={handleOpen}
        aria-expanded={open}
      >
        <div className="relative inline-flex items-center justify-center">
          <Bell size={19} className="transition-transform group-hover:scale-105" />
          {unreadCount > 0 && (
            <span
              className={`vnotif-badge topbar__notif-badge${bouncing ? ' vnotif-badge--bounce topbar__notif-badge--bounce' : ''}`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
      </button>

      {/* Notification panel — using FloatingMenu */}
      <FloatingMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        className="vnotif__panel"
        options={{ placement: 'bottom-end', offset: 8, viewportPadding: 8 }}
        width={360}
        animation="slide"
      >
        <div className="vnotif__header">
          <span className="vnotif__title">Notifications</span>
          {unreadCount > 0 && (
            <button type="button" className="vnotif__mark-all" onClick={markAllRead}>
              <Check size={14} /> Mark all read
            </button>
          )}
        </div>
        <div className="vnotif__list">
          {loading && notifications.length === 0 && <p className="vnotif__empty">Loading…</p>}
          {!loading && notifications.length === 0 && (
            <p className="vnotif__empty">No notifications yet.</p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`vnotif__item ${n.isRead ? '' : 'vnotif__item--unread'}`}
              onClick={() => openRfq(n)}
            >
              <span className="vnotif__item-icon">
                <FileText size={16} />
              </span>
              <span className="vnotif__item-body">
                <span className="vnotif__item-title">{n.title}</span>
                {n.message && <span className="vnotif__item-msg">{n.message}</span>}
              </span>
            </button>
          ))}
        </div>
      </FloatingMenu>
    </div>
  );
}
