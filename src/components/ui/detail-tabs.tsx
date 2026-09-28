import type { HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollableTabList } from './scrollable-tab-list';
import './detail-tabs.css';

interface DetailTab {
  id: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

/** One row of fixed-height detail tabs; counts never change the tab height. */
export function DetailTabs({ id, label, tabs, activeTab, onChange }: {
  id: string;
  label: string;
  tabs: DetailTab[];
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <ScrollableTabList label={label} containerClassName="detail-tabs mb-4" className="gap-1 p-1.5">
      {tabs.map(({ id: tabId, label: tabLabel, icon: Icon, count }) => (
        <button
          key={tabId}
          type="button"
          role="tab"
          id={`${id}-tab-${tabId}`}
          aria-controls={`${id}-panel-${tabId}`}
          aria-selected={activeTab === tabId}
          tabIndex={activeTab === tabId ? 0 : -1}
          onClick={() => onChange(tabId)}
          className="detail-tabs__tab flex h-10 shrink-0 items-center gap-2 rounded-lg border border-transparent px-3.5 text-xs font-semibold"
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span>{tabLabel}</span>
          {count !== undefined && <span className="detail-tabs__count text-[10px] tabular-nums">{count}</span>}
        </button>
      ))}
    </ScrollableTabList>
  );
}

export function DetailTabPanel({ id, tabId, className, ...props }: HTMLAttributes<HTMLDivElement> & { id: string; tabId: string }) {
  return <div {...props} id={`${id}-panel-${tabId}`} role="tabpanel" aria-labelledby={`${id}-tab-${tabId}`} tabIndex={0} className={cn('detail-tab-panel', className)} />;
}
