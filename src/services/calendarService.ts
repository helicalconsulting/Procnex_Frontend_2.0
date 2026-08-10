import { apiRequest } from '../api/client';

export interface CalendarEventItem {
  id: string;
  userId?: string;
  dateKey: string;
  title: string;
  category: 'urgent' | 'warning' | 'info' | 'custom';
  subText?: string;
  createdAt?: string;
}

const STORAGE_KEY_PREFIX = 'heliflow_calendar_events_user_';

function getLocalStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId || 'guest'}`;
}

export const calendarService = {
  /**
   * List calendar events for the logged in user
   */
  async getEvents(userId: string): Promise<Record<string, CalendarEventItem[]>> {
    if (!userId) return {};

    try {
      const data = await apiRequest<CalendarEventItem[]>('/calendar-events', {
        cacheTtlMs: 0,
      });

      if (Array.isArray(data)) {
        const eventsMap: Record<string, CalendarEventItem[]> = {};
        for (const evt of data) {
          if (!eventsMap[evt.dateKey]) {
            eventsMap[evt.dateKey] = [];
          }
          eventsMap[evt.dateKey].push({
            id: evt.id,
            dateKey: evt.dateKey,
            title: evt.title,
            category: evt.category || 'custom',
            subText: evt.subText || 'Personal Note',
          });
        }
        // Update user-scoped local storage cache
        try {
          localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(eventsMap));
        } catch (e) {
          console.warn('LocalStorage write failed:', e);
        }
        return eventsMap;
      }
    } catch (err) {
      console.warn('Backend calendar fetch failed, using user-isolated local cache:', err);
    }

    // Fallback to user-scoped local cache (Auto-purges past date notes)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayKey = `${year}-${month}-${day}`;

    try {
      const saved = localStorage.getItem(getLocalStorageKey(userId));
      if (saved) {
        const parsed: Record<string, CalendarEventItem[]> = JSON.parse(saved);
        const cleaned: Record<string, CalendarEventItem[]> = {};
        for (const [k, items] of Object.entries(parsed)) {
          if (k >= todayKey) {
            cleaned[k] = items;
          }
        }
        localStorage.setItem(getLocalStorageKey(userId), JSON.stringify(cleaned));
        return cleaned;
      }
      return {};
    } catch {
      return {};
    }
  },

  /**
   * Add a new calendar event note for the logged in user
   */
  async addEvent(
    userId: string,
    dateKey: string,
    title: string
  ): Promise<CalendarEventItem> {
    const tempId = `custom-${Date.now()}`;
    const newEventItem: CalendarEventItem = {
      id: tempId,
      dateKey,
      title,
      category: 'custom',
      subText: 'Personal Note',
    };

    // Save to user-scoped local storage cache first
    try {
      const localKey = getLocalStorageKey(userId);
      const saved = localStorage.getItem(localKey);
      const map: Record<string, CalendarEventItem[]> = saved ? JSON.parse(saved) : {};
      const existing = map[dateKey] || [];
      map[dateKey] = [...existing, newEventItem];
      localStorage.setItem(localKey, JSON.stringify(map));
    } catch (e) {
      console.warn('LocalStorage update failed:', e);
    }

    // Attempt API save to database
    try {
      const res = await apiRequest<CalendarEventItem>('/calendar-events', {
        method: 'POST',
        body: JSON.stringify({
          dateKey,
          title,
          category: 'custom',
          subText: 'Personal Note',
        }),
      });
      if (res && res.id) {
        return res;
      }
    } catch (err) {
      console.warn('Backend calendar save failed, relying on user-isolated local storage:', err);
    }

    return newEventItem;
  },

  /**
   * Delete a calendar event note for the logged in user
   */
  async deleteEvent(
    userId: string,
    dateKey: string,
    eventId: string
  ): Promise<void> {
    // Remove from user-scoped local cache
    try {
      const localKey = getLocalStorageKey(userId);
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const map: Record<string, CalendarEventItem[]> = JSON.parse(saved);
        if (map[dateKey]) {
          map[dateKey] = map[dateKey].filter((evt) => evt.id !== eventId);
          localStorage.setItem(localKey, JSON.stringify(map));
        }
      }
    } catch (e) {
      console.warn('LocalStorage delete failed:', e);
    }

    // Attempt API deletion from database
    if (!eventId.startsWith('custom-')) {
      try {
        await apiRequest(`/calendar-events/${eventId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.warn('Backend calendar delete failed:', err);
      }
    }
  },
};
