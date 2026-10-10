import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, FileText, Check, ClipboardList } from 'lucide-react';
import { notificationService } from '../../services/notificationService';
import { sseClient } from '../../services/sseClient';
import { USE_MOCK } from '../../config/mock';
import type { NotificationRow } from '../../types/viewModels';
import { getNotificationTargetUrl } from '../../lib/notificationRouter';
import FloatingMenu from '../shared/FloatingMenu';
import './VendorNotificationBell.css';

export default function AdminNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
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
      const [list, count] = await Promise.all([
        notificationService.list() as Promise<NotificationRow[]>,
        notificationService.unreadCount() as Promise<number>,
      ]);
      const seen = new Set<string>();
      const deduplicated = (list || []).filter((n) => {
        const key = n.id ? String(n.id) : `${n.title}_${n.message}_${n.createdAt || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setNotifications(deduplicated);
      setUnreadCount(count);
    } catch {
      if (!silent) setNotifications([]);
      setUnreadCount(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load
    void load(false);

    // Responsive 4-second polling to guarantee real-time updates across multiple tabs (silent)
    const interval = setInterval(() => void load(true), 4000);

    const triggerRefresh = () => {
      setBouncing(true);
      clearTimeout(bounceTimer.current);
      bounceTimer.current = setTimeout(() => setBouncing(false), 600);
      void load(true);
    };

    // SSE real-time listeners for instant notification delivery
    const unsubNotification = sseClient.on('notification', triggerRefresh);
    const unsubApprovalReq = sseClient.on('approval_required', triggerRefresh);
    const unsubApprovalChain = sseClient.on('approval_chain_complete', triggerRefresh);
    const unsubApprovalLevel = sseClient.on('approval_level_complete', triggerRefresh);
    const unsubPoCreated = sseClient.on('po_created', triggerRefresh);
    const unsubPoStatus = sseClient.on('po_status_changed', triggerRefresh);
    const unsubQuotation = sseClient.on('quotation_received', triggerRefresh);
    const unsubRfq = sseClient.on('rfq_status_changed', triggerRefresh);
    const unsubAny = typeof sseClient.onAny === 'function' ? sseClient.onAny(triggerRefresh) : undefined;

    // Window event listeners for instant local synchronization
    window.addEventListener('heliflow:notification-updated', triggerRefresh);
    window.addEventListener('heliflow:approval-updated', triggerRefresh);
    window.addEventListener('heliflow:payment-updated', triggerRefresh);
    window.addEventListener('storage', triggerRefresh);

    return () => {
      clearInterval(interval);
      clearTimeout(bounceTimer.current);
      unsubNotification();
      unsubApprovalReq();
      unsubApprovalChain();
      unsubApprovalLevel();
      unsubPoCreated();
      unsubPoStatus();
      unsubQuotation();
      unsubRfq();
      if (typeof unsubAny === 'function') unsubAny();
      window.removeEventListener('heliflow:notification-updated', triggerRefresh);
      window.removeEventListener('heliflow:approval-updated', triggerRefresh);
      window.removeEventListener('heliflow:payment-updated', triggerRefresh);
      window.removeEventListener('storage', triggerRefresh);
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

  const openNotification = (n: NotificationRow) => {
    // 1. Immediately close dropdown, update local count, and navigate with 0ms delay
    setOpen(false);
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    setUnreadCount((c) => Math.max(0, c - 1));
    const targetUrl = getNotificationTargetUrl(n.title, n.message, n.linkedRef);
    navigate(targetUrl);

    // 2. Perform background async markRead & notify listeners
    void notificationService.markRead(n.id).catch(() => {});
    window.dispatchEvent(new CustomEvent('heliflow:notification-updated'));
  };

  const markAllRead = async () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      await notificationService.deleteAll();
    } catch {
      await notificationService.markAllRead().catch(() => {});
    }
    window.dispatchEvent(new CustomEvent('heliflow:notification-updated'));
  };

  const iconFor = (n: NotificationRow) => {
    if (n.type === 'RFQ' || n.title.toLowerCase().includes('quotation')) {
      return <ClipboardList size={16} />;
    }
    return <FileText size={16} />;
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
          {notifications.length > 0 && (
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
          {notifications.slice(0, 20).map((n) => (
            <button
              key={n.id}
              type="button"
              className={`vnotif__item ${n.isRead ? '' : 'vnotif__item--unread'}`}
              onClick={() => openNotification(n)}
            >
              <span className="vnotif__item-icon">{iconFor(n)}</span>
              <span className="vnotif__item-body">
                <span className="vnotif__item-title">{n.title}</span>
                {n.message && <span className="vnotif__item-msg">{n.message}</span>}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="vnotif__footer-link"
          onClick={() => {
            setOpen(false);
            navigate('/notifications');
          }}
        >
          View all notifications
        </button>
      </FloatingMenu>
    </div>
  );
}
