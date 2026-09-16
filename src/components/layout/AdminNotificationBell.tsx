import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, FileText, Check, ClipboardList } from 'lucide-react';
import { notificationService } from '../../services/notificationService';
import { sseClient } from '../../services/sseClient';
import { USE_MOCK } from '../../config/mock';
import type { NotificationRow } from '../../types/viewModels';
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

  const load = useCallback(async (deleteAfterLoad = false) => {
    if (USE_MOCK) return;
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
      notificationService.list() as Promise<NotificationRow[]>,
      notificationService.unreadCount() as Promise<number>,
    ]);
      setNotifications(list);
      setUnreadCount(count);

      if (deleteAfterLoad && list.length > 0) {
        try {
          await notificationService.deleteAll();
          setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
          setUnreadCount(0);
        } catch {
          setUnreadCount(count);
        }
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
    void load();

    // Polling fallback — SSE already handles real-time delivery,
    // so polling at 15s is enough as a safety net.
    const interval = setInterval(load, 15000);

    // SSE real-time listener — instant notification on vendor accept, etc.
    // SSE connection is managed centrally by AppLayout
    const unsubscribe = sseClient.on('notification', () => {
      // Trigger the bounce animation
      setBouncing(true);
      clearTimeout(bounceTimer.current);
      bounceTimer.current = setTimeout(() => setBouncing(false), 600);
      // Immediately re-fetch notifications when a real-time event arrives
      void load();
    });

    return () => {
      clearInterval(interval);
      clearTimeout(bounceTimer.current);
      unsubscribe();
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

  const openNotification = async (n: NotificationRow) => {
    if (!n.isRead) {
      await notificationService.markRead(n.id);
      // Enterprise pattern: remove notification from list after reading
      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    const combined = `${n.title} ${n.message}`;
    const t = combined.toLowerCase();
    const rfqMatch = combined.match(/RFQ[-\w]+/i);
    if (t.includes('document') || t.includes('uploaded') || t.includes('compliance')) {
      navigate('/onboarding/queue');
    } else if (t.includes('quotation')) {
      navigate(rfqMatch ? `/quotations?rfq=${encodeURIComponent(rfqMatch[0])}` : '/quotations');
    } else if (t.includes('rfq')) {
      navigate('/rfq');
    } else {
      navigate('/notifications');
    }
  };

  const markAllRead = async () => {
    await notificationService.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
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
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:scale-[0.97]"
        title="Notifications"
        onClick={handleOpen}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className={`topbar__notif-badge${bouncing ? ' topbar__notif-badge--bounce' : ''}`}>{unreadCount > 9 ? '9+' : unreadCount}</span>
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
            notifications.slice(0, 20).map((n) => (
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
