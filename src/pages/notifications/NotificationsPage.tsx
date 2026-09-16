import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useServiceData } from '../../hooks/useServiceData';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { notificationService } from '../../services/notificationService';
import { sseClient } from '../../services/sseClient';
import type { NotificationRow } from '../../types/viewModels';
import {
  Bell, BellOff, Search, CheckCheck, Trash2,
  ShoppingCart, FileText, CheckSquare, AlertTriangle, Clock,
  Users, Shield, ChevronLeft, ChevronRight, MailOpen, Mail,
} from 'lucide-react';
import { MessageStrip } from '../../components/shared/MessageStrip';
import { PageFrame, PageLead, MetricCard, EmptyState } from '../../components/ui/product';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { cn } from '../../lib/utils';

type NotiType = 'APPROVAL' | 'ORDER' | 'RFQ' | 'SYSTEM' | 'VENDOR' | 'ALERT';

type MockNotification = NotificationRow;

const TYPE_ICONS: Record<NotiType, React.ReactNode> = {
  APPROVAL: <CheckSquare size={16} />,
  ORDER: <ShoppingCart size={16} />,
  RFQ: <FileText size={16} />,
  SYSTEM: <Shield size={16} />,
  VENDOR: <Users size={16} />,
  ALERT: <AlertTriangle size={16} />,
};

const TYPE_TONES: Record<NotiType, string> = {
  APPROVAL: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/15 dark:text-emerald-300',
  ORDER: 'bg-sky-500/10 text-sky-600 ring-sky-500/15 dark:text-sky-300',
  RFQ: 'bg-violet-500/10 text-violet-600 ring-violet-500/15 dark:text-violet-300',
  SYSTEM: 'bg-primary/10 text-primary ring-primary/15',
  VENDOR: 'bg-cyan-500/10 text-cyan-700 ring-cyan-500/15 dark:text-cyan-300',
  ALERT: 'bg-rose-500/10 text-rose-600 ring-rose-500/15 dark:text-rose-300',
};

const FILTERS: ('ALL' | 'UNREAD' | 'READ')[] = ['ALL', 'UNREAD', 'READ'];

export default function NotificationsPage() {
  const { data: notis, loading, error, reload } = useServiceData(
    () => notificationService.list(),
    [] as NotificationRow[]
  );

  const [localNotis, setLocalNotis] = useState<NotificationRow[]>([]);
  const initialized = useRef(false);
  useEffect(() => {
    if (notis.length > 0 || initialized.current) {
      initialized.current = true;
      setLocalNotis(notis);
    }
  }, [notis]);
  const displayNotis = initialized.current ? localNotis : notis;

  const pollingRef = useRef<ReturnType<typeof setInterval>>();
  useEffect(() => {
    pollingRef.current = setInterval(() => reload(), 30000);
    return () => { clearInterval(pollingRef.current); };
  }, [reload]);

  useEffect(() => {
    const unsubscribe = sseClient.on('notification', () => reload());
    return () => unsubscribe();
  }, [reload]);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<MockNotification | null>(null);
  useBodyScrollLock(!!detail);
  const perPage = 8;

  const summary = useMemo(() => ({
    total: displayNotis.length,
    unread: displayNotis.filter(n => !n.isRead).length,
    read: displayNotis.filter(n => n.isRead).length,
  }), [displayNotis]);

  const filtered = useMemo(() => {
    let list = displayNotis;
    if (filter === 'UNREAD') list = list.filter(n => !n.isRead);
    if (filter === 'READ') list = list.filter(n => n.isRead);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        n.linkedRef.toLowerCase().includes(q)
      );
    }
    return list;
  }, [displayNotis, filter, search]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

  const markRead = useCallback((id: number) => {
    setLocalNotis(prev => prev.filter(n => n.id !== id));
    void notificationService.markRead(id);
  }, []);

  const markAllRead = useCallback(() => {
    const currentIds = new Set(localNotis.filter(n => !n.isRead).map(n => n.id));
    if (currentIds.size === 0) return;
    setLocalNotis(prev => prev.filter(n => n.isRead));
    void notificationService.markAllRead();
  }, [localNotis]);

  const deleteNoti = useCallback((id: number) => {
    setLocalNotis(prev => prev.filter(n => n.id !== id));
  }, []);

  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const formatDateTime = (d: string) => {
    const date = new Date(d);
    return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <PageFrame>
      {error && <MessageStrip type="error" className="mb-4">{error}</MessageStrip>}

      {/* Header */}
      <PageLead
        title="Notifications"
        description="Stay updated with approvals, orders, and system alerts"
        actions={
          summary.unread > 0 ? (
            <Button onClick={markAllRead} variant="outline" size="sm">
              <CheckCheck className="mr-2 size-4" /> Mark All Read
            </Button>
          ) : undefined
        }
      />

      {/* Metric Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard icon={Bell} label="Total Notifications" value={summary.total} tone="primary" aria-pressed={true} />
        <MetricCard icon={Mail} label="Unread Notifications" value={summary.unread} tone="warning" />
        <MetricCard icon={MailOpen} label="Read Notifications" value={summary.read} tone="success" />
      </div>

      {/* Toolbar */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setCurrentPage(1); }}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  filter === f
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {f === 'ALL' ? 'All' : f === 'UNREAD' ? 'Unread' : 'Read'}
                <span className={cn('rounded-md px-1.5 py-0.5 text-[11px]', filter === f ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background/80 text-muted-foreground')}>
                  {f === 'ALL' ? summary.total : f === 'UNREAD' ? summary.unread : summary.read}
                </span>
              </button>
            ))}
          </div>
          <div className="relative min-w-0 flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
              className="pl-9"
            />
          </div>
        </div>
      </Card>

      {/* Notifications List */}
      <Card className="overflow-hidden">
        {paginated.length > 0 ? (
          <div className="divide-y divide-border/50">
            {paginated.map(n => (
              <div
                key={n.id}
                onClick={() => { markRead(n.id); setDetail(n); }}
                className={cn(
                  'group flex cursor-pointer items-start gap-4 p-4 transition-colors hover:bg-muted/40',
                  !n.isRead && 'bg-primary/5'
                )}
              >
                <div className={cn('grid size-9 shrink-0 place-items-center rounded-lg ring-1 mt-0.5', TYPE_TONES[n.type])}>
                  {TYPE_ICONS[n.type]}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={cn('text-sm font-semibold text-foreground truncate', !n.isRead && 'text-primary')}>
                      {n.title}
                    </h4>
                    <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
                      <Clock className="size-3" /> {timeAgo(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">{n.message}</p>
                  <div className="mt-2.5 flex items-center gap-2 text-[12px]">
                    {n.linkedRef !== '-' && (
                      <Badge variant="outline" className="font-mono text-[11px]">{n.linkedRef}</Badge>
                    )}
                    <span className="text-muted-foreground">from <strong className="text-foreground">{n.from}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100" onClick={e => e.stopPropagation()}>
                  {!n.isRead && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Mark read" onClick={() => markRead(n.id)}>
                      <CheckCheck className="size-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" title="Delete" onClick={() => deleteNoti(n.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BellOff}
            title="No notifications"
            description={search ? 'Try adjusting your search criteria.' : "You're all caught up!"}
          />
        )}

        {filtered.length > perPage && (
          <div className="flex items-center justify-between border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
            <span>Showing {(currentPage-1)*perPage+1}–{Math.min(currentPage*perPage, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" disabled={currentPage===1} onClick={() => setCurrentPage(p=>p-1)} className="h-8 w-8 p-0">
                <ChevronLeft className="size-4" />
              </Button>
              {Array.from({length:totalPages},(_,i)=>i+1).map(p=>(
                <Button
                  key={p}
                  variant={currentPage===p?'default':'outline'}
                  size="sm"
                  onClick={()=>setCurrentPage(p)}
                  className="h-8 w-8 p-0"
                >
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="sm" disabled={currentPage===totalPages} onClick={()=>setCurrentPage(p=>p+1)} className="h-8 w-8 p-0">
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        {detail && (
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="size-5 text-primary" /> Notification Details
              </DialogTitle>
              <DialogDescription>
                Full message and metadata.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl ring-1', TYPE_TONES[detail.type])}>
                  {TYPE_ICONS[detail.type]}
                </div>
                <div>
                  <Badge variant="outline" className="font-semibold">{detail.type}</Badge>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-foreground">{detail.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground bg-card p-3 rounded-lg border border-border/50">
                  {detail.message}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Reference</div>
                  <div className="mt-1 font-semibold font-mono text-foreground">{detail.linkedRef !== '-' ? detail.linkedRef : '—'}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">From</div>
                  <div className="mt-1 font-semibold text-foreground">{detail.from}</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card p-3">
                  <div className="text-muted-foreground">Time</div>
                  <div className="mt-1 font-semibold text-foreground">{formatDateTime(detail.createdAt)}</div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setDetail(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </PageFrame>
  );
}
