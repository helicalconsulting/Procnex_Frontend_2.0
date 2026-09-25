/**
 * Custom hook for managing dashboard widget state.
 * Handles adding/removing/reordering widgets, role-based filtering,
 * and backend persistence per user.
 *
 * isEnabled  → Admin controls (widget available in gallery)
 * isUserActive → User controls (widget shown on dashboard)
 * sortOrder  → User's widget ordering (stored on backend)
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { WIDGET_REGISTRY, type WidgetDefinition } from '../pages/dashboard/widgets';
import { hasModulePermission } from '../utils/permissions';
import { useServiceData } from './useServiceData';
import { apiRequest } from '../api/client';

function widgetAllowed(
  widget: WidgetDefinition,
  roles: string[],
  permissions: Record<string, { canView: boolean; canCreate: boolean; canApprove: boolean }>
): boolean {
  if (permissions && Object.keys(permissions).length > 0) {
    const { module, action = 'canView' } = widget.requiredPermission;
    return hasModulePermission(permissions, module, action);
  }
  return widget.roles.some((requiredRole) => roles.includes(requiredRole));
}

// ─── Types ──────────────────────────────────────────────────

interface BackendWidgetPref {
  widgetId: string;
  isEnabled: boolean;
  isUserActive: boolean;
  sortOrder: number;
}

interface UseDashboardWidgetsReturn {
  activeWidgets: string[];
  availableWidgets: WidgetDefinition[];
  addWidget: (id: string) => void;
  removeWidget: (id: string) => void;
  reorderWidgets: (newOrder: string[]) => void;
  isWidgetActive: (id: string) => boolean;
  toggleWidget: (id: string) => void;
  isGalleryOpen: boolean;
  openGallery: () => void;
  closeGallery: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────
/** Replicate useServiceData's internal getUserToken for query key invalidation */
function getUserToken(): string {
  try {
    return localStorage.getItem('heliflow_token') || 'no-token';
  } catch {
    return 'no-token';
  }
}

// ─── Hook ───────────────────────────────────────────────────

export function useDashboardWidgets(): UseDashboardWidgetsReturn {
  const { user, roles, permissions } = useAuth();
  const queryClient = useQueryClient();

  // ── Backend prefs fetch ──────────────────────────────────
  const { data: backendPrefs, loading: prefsLoading } = useServiceData(
    () =>
      user?.id
        ? apiRequest<{ widgets: BackendWidgetPref[] }>(
            '/dashboard/widgets'
          ).then((d) => d.widgets ?? [])
        : Promise.resolve([] as BackendWidgetPref[]),
    [] as BackendWidgetPref[],
    [user?.id],
    { cacheKey: `widget-prefs:${user?.id ?? 'none'}` }
  );

  const allowedByRoleAndPermission = useMemo(
    () => WIDGET_REGISTRY.filter((widget) => widgetAllowed(widget, roles, permissions)),
    [roles, permissions]
  );

  // enabledWidgetIds = widgets admin has enabled (isEnabled=true)
  const enabledWidgetIds = useMemo(() => {
    if (prefsLoading) return null;
    return new Set(backendPrefs.filter((p) => p.isEnabled).map((p) => p.widgetId));
  }, [backendPrefs, prefsLoading]);

  // availableWidgets = gallery pool — only admin-enabled widgets (when admin has set prefs)
  // Super Admin always sees ALL widgets; other roles see:
  //   Only widgets the admin has enabled (isEnabled=true).
  //   Role/permission check is NOT used as a separate source — admin controls the gallery.
  //   If admin hasn't set any preferences yet (empty prefs), user sees nothing.
  const availableWidgets = useMemo(() => {
    // Super Admin or admin role bypasses backend isEnabled — gets all allowed widgets
    const isUserAdmin = roles.some((r) => ['Super Admin', 'admin', 'Administrator'].includes(r));
    if (isUserAdmin) return allowedByRoleAndPermission;

    if (!enabledWidgetIds || enabledWidgetIds.size === 0) return allowedByRoleAndPermission;

    return WIDGET_REGISTRY.filter((widget) => enabledWidgetIds.has(widget.id));
  }, [WIDGET_REGISTRY, allowedByRoleAndPermission, enabledWidgetIds, roles]);

  const availableIds = useMemo(
    () => new Set(availableWidgets.map((w) => w.id)),
    [availableWidgets]
  );

  // ── Widget state — sourced from backend only ──
  const [activeWidgets, setActiveWidgets] = useState<string[]>([]);

  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  // Drop widgets user no longer has permission for
  useEffect(() => {
    if (prefsLoading) return;

    setActiveWidgets((prev) => {
      const next = prev.filter((id) => availableIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [availableIds, prefsLoading]);

  // Apply backend prefs — backend is the single source of truth for ordering.
  useEffect(() => {
    if (prefsLoading) return;

    if (backendPrefs.length > 0) {
      const sortedActive = backendPrefs
        .filter((p) => p.isEnabled !== false && p.isUserActive && availableIds.has(p.widgetId))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => p.widgetId);

      setActiveWidgets(sortedActive);
    } else {
      setActiveWidgets([]);
    }
  }, [availableIds, backendPrefs, prefsLoading, user?.id]);

  // ── Backend sync — save user toggles + order ─────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncToBackend = useCallback(
    (newActiveWidgets: string[]) => {
      const activeSet = new Set(newActiveWidgets);
      const widgetsPayload = availableWidgets.map((w, idx) => {
        const existingPref = backendPrefs.find((p) => p.widgetId === w.id);
        return {
          widgetId: w.id,
          isUserActive: activeSet.has(w.id),
          sortOrder: activeSet.has(w.id)
            ? newActiveWidgets.indexOf(w.id)   // user's order position
            : existingPref?.sortOrder ?? 999,   // inactive — keep existing or push to end
        };
      });

      // Debounce to batch rapid toggles
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      const userKey = getUserToken();
      saveTimerRef.current = setTimeout(() => {
        apiRequest('/dashboard/widgets', {
          method: 'PUT',
          body: JSON.stringify({ widgets: widgetsPayload }),
        })
          .then(() => {
            // Mark cache stale WITHOUT immediate refetch — avoids toggle glitch.
            // The optimistic state is already correct. On next mount (navigation
            // back), stale cache triggers a background refetch.
            queryClient.invalidateQueries({
              queryKey: ['svc', userKey, `widget-prefs:${user?.id ?? 'none'}`],
              refetchType: 'none',
            });
          })
          .catch((err) => {
            console.warn('[useDashboardWidgets] Failed to save prefs:', err);
          });
      }, 500);
    },
    [availableWidgets, backendPrefs, queryClient, user?.id]
  );

  const addWidget = useCallback(
    (id: string) => {
      if (!availableIds.has(id)) return;
      setActiveWidgets((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        syncToBackend(next);
        return next;
      });
    },
    [availableIds, syncToBackend]
  );

  const removeWidget = useCallback(
    (id: string) => {
      setActiveWidgets((prev) => {
        const next = prev.filter((wId) => wId !== id);
        syncToBackend(next);
        return next;
      });
    },
    [syncToBackend]
  );

  const reorderWidgets = useCallback(
    (newOrder: string[]) => {
      setActiveWidgets(newOrder);
      syncToBackend(newOrder);
    },
    [syncToBackend]
  );

  const isWidgetActive = useCallback(
    (id: string) => activeWidgets.includes(id),
    [activeWidgets]
  );

  const toggleWidget = useCallback(
    (id: string) => {
      if (activeWidgets.includes(id)) {
        removeWidget(id);
      } else {
        addWidget(id);
      }
    },
    [activeWidgets, addWidget, removeWidget]
  );

  const openGallery = useCallback(() => setIsGalleryOpen(true), []);
  const closeGallery = useCallback(() => setIsGalleryOpen(false), []);

  return {
    activeWidgets,
    availableWidgets,
    addWidget,
    removeWidget,
    reorderWidgets,
    isWidgetActive,
    toggleWidget,
    isGalleryOpen,
    openGallery,
    closeGallery,
  };
}
