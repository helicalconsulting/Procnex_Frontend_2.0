/**
 * Mock vs API mode
 *
 * true  → local mock data (development / demo)
 * false → real backend at VITE_API_URL
 *
 * Override via .env: VITE_USE_MOCK=false
 */
// Frontend UI should be fully dynamic.
// ERP sync can still be "mock" on backend (syspro dataMode=mock), but
// we should not use frontend mock datasets.
export const USE_MOCK = false;
