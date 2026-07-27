/**
 * SSE (Server-Sent Events) client service.
 * Connects to the correct backend SSE endpoint based on token type:
 * - User/admin tokens → /api/dashboard/stream
 * - Vendor tokens → /api/vendors/stream
 * Dispatches real-time events to the UI so notifications appear instantly.
 */
import { API_BASE } from '../api/client';

type SSEEventHandler = (data: unknown) => void;

/**
 * Decode JWT payload without verifying signature.
 * The backend verifies; we only need to read the `type` field.
 * Handles base64url encoding (JWT standard).
 */
function decodeTokenPayload(token: string): { type?: 'user' | 'vendor' } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    // Convert base64url → base64 (JWT uses URL-safe base64)
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

class SSEClient {
  private eventSource: EventSource | null = null;
  private listeners = new Map<string, Set<SSEEventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 2000;
  private maxReconnectDelay = 30000;
  private connected = false;

  /**
   * All named SSE event types the backend may send via `event: <name>`.
   * EventSource.onmessage only fires for unnamed events (no `event:` field).
   * Named events MUST use addEventListener to be received.
   */
  private static readonly SSE_EVENT_NAMES = [
    'notification',
    'rfq_status_changed',
    'quotation_received',
    'po_created',
    'vendor_approved',
    'approval_required',
    'erp_sync_complete',
    'approval_level_complete',
    'approval_chain_complete',
    'approval_auto_forwarded',
    'approval_deadline_warning',
    'quotation_status_changed',
    'vendor_notification',
    // Vendor onboarding events
    'vendor_onboarding_accepted',
    'vendor_onboarding_documents_submitted',
    'evaluation_scores_updated',
    'contract_signed',
    'po_status_changed',
  ];

  /**
   * Determine which SSE stream to connect to based on the JWT token type.
   * - 'user' → /api/dashboard/stream
   * - 'vendor' → /api/vendors/stream
   */
  private getStreamEndpoint(token: string): string | null {
    const payload = decodeTokenPayload(token);
    if (!payload?.type) return null;

    const endpoint = payload.type === 'vendor' ? '/vendors/stream' : '/dashboard/stream';
    return `${API_BASE}${endpoint}?token=${encodeURIComponent(token)}`;
  }

  connect(): void {
    if (this.eventSource) return; // already connected

    const token = localStorage.getItem('heliflow_token');
    if (!token) return; // not logged in

    const streamUrl = this.getStreamEndpoint(token);
    if (!streamUrl) {
      console.warn('[sseClient] Unknown token type, skipping SSE connection');
      return;
    }

    try {
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        this.connected = true;
        this.reconnectDelay = 2000; // reset backoff on successful connection
      };

      // Handle unnamed SSE messages (no `event:` field — fallback)
      this.eventSource.onmessage = (event) => {
        this.handleSSEMessage(event);
      };

      // Register listeners for ALL named SSE events the backend sends.
      // Without this, events like `event: notification\ndata: {...}` are
      // silently ignored by EventSource because onmessage only fires for
      // unnamed events.
      for (const eventName of SSEClient.SSE_EVENT_NAMES) {
        this.eventSource.addEventListener(eventName, ((event: MessageEvent) => {
          this.handleSSEMessage(event);
        }) as EventListener);
      }

      this.eventSource.onerror = () => {
        this.connected = false;
        this.cleanup();
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  /**
   * Parse and dispatch an SSE MessageEvent to local listeners.
   *
   * Named SSE events (sent via `event: <name>` on the backend) set
   * event.type to the event name.  The backend may either:
   * - embed a `type` field in the JSON payload, OR
   * - rely on the named `event:` line (no `type` in data).
   *
   * We dispatch using BOTH the data payload's `type` field AND
   * the EventSource event.type so that both patterns work.
   */
  private handleSSEMessage(event: MessageEvent): void {
    try {
      const parsed = JSON.parse(event.data);

      // Some backend events embed a { type, data } envelope
      const typeFromData = parsed?.type;
      if (typeFromData) {
        this.dispatch(typeFromData, parsed.data ?? parsed);
      }

      // Named SSE events have event.type set (e.g. 'notification',
      // 'vendor_onboarding_documents_submitted').  For unnamed events
      // (no `event:` line) event.type === 'message'.
      if (event.type && event.type !== 'message') {
        this.dispatch(event.type, parsed);
      }

      // Also dispatch a catch-all 'any' event
      this.dispatch('any', parsed);
    } catch {
      // ignore malformed SSE data
    }
  }

  /**
   * Disconnect from the SSE stream. Call on logout.
   */
  disconnect(): void {
    this.cleanup();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectDelay = 2000;
  }

  /**
   * Subscribe to a specific SSE event type.
   * Returns an unsubscribe function.
   */
  on(event: string, handler: SSEEventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    return () => {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) this.listeners.delete(event);
      }
    };
  }

  /**
   * Check if connected to SSE stream.
   */
  isConnected(): boolean {
    return this.connected;
  }

  private dispatch(event: string, data: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch {
          // Don't let a bad handler crash the SSE stream
        }
      });
    }
  }

  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }
}

export const sseClient = new SSEClient();
