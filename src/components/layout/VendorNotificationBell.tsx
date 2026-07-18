import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, FileText, Check } from 'lucide-react';
import { vendorPortalService, type VendorNotification } from '../../services/vendorPortalService';
import { sseClient } from '../../services/sseClient';
import { USE_MOCK } from '../../config/mock';
import FloatingMenu from '../shared/FloatingMenu';
import './VendorNotificationBell.css';

export default function VendorNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async (deleteAfterLoad = false) => {
    if (USE_MOCK) return;
    setLoading(true);
    try {
      const data = await vendorPortalService.listNotifications();
      let nextNotifications = data.notifications || [];

      if (deleteAfterLoad && nextNotifications.length > 0) {
        // When opening the bell: show all, then delete from backend
        setNotifications(nextNotifications);
        setUnreadCount(data.unreadCount || 0);
        try {
          await vendorPortalService.deleteAllNotifications();
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
          setUnreadCount(0);
        } catch {
          setUnreadCount(data.unreadCount || 0);
        }
      } else {
        // SSE / polling refresh: only show unread notifications
        // so already-read ones don't reappear in the bell
        setNotifications(nextNotifications.filter((n) => !n.isRead));
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);

    // Polling fallback — SSE already handles real-time delivery,
    // so polling at 15s is enough as a safety net.
    const interval = setInterval(load, 15000);

    // SSE real-time listener — instant notification delivery
    // SSE connection is managed centrally by AppLayout
    const unsubscribe = sseClient.on('vendor_notification', () => {
      void load();
    });
    // Also listen for generic 'notification' events
    const unsubscribeGeneric = sseClient.on('notification', () => {
      void load();
    });

    return () => {
      window.clearTimeout(timeout);
      clearInterval(interval);
      unsubscribe();
      unsubscribeGeneric();
    };
  }, [load]);

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);
    load(true);
  };

  const openRfq = async (n: VendorNotification) => {
    if (!n.isRead) {
      await vendorPortalService.markNotificationRead(n.id);
      // Enterprise pattern: remove notification from list after reading
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    const rfqId = n.metadata?.rfqId;
    navigate(rfqId ? `/vendor/rfqs?rfq=${rfqId}` : '/vendor/rfqs');
  };

  const markAllRead = async () => {
    await vendorPortalService.markAllNotificationsRead();
    await vendorPortalService.deleteAllNotifications();
    setNotifications([]);
    setUnreadCount(0);
  };

  return (
    <div className="vnotif" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className="topbar__icon-btn topbar__icon-btn--notif"
        title="Notifications"
        onClick={handleOpen}
        aria-expanded={open}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="topbar__notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
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
          {loading && <p className="vnotif__empty">Loading…</p>}
          {!loading && notifications.length === 0 && (
            <p className="vnotif__empty">No notifications yet.</p>
          )}
          {!loading &&
            notifications.map((n) => (
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
