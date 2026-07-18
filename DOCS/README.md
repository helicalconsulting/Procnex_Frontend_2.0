# Heliflow Frontend — Architecture & Developer Guide

> **Heliflow** is a procurement workflow management platform. This frontend application serves both internal procurement teams and external vendors through a single React SPA with role-based routing.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [App Entry & Bootstrap](#3-app-entry--bootstrap)
4. [Routing Architecture](#4-routing-architecture)
5. [Authentication & Session Management](#5-authentication--session-management)
6. [RBAC & Authorization](#6-rbac--authorization)
7. [Data Flow: Services → API Client → Backend](#7-data-flow)
8. [Mock vs Real Backend Mode](#8-mock-vs-real-backend-mode)
9. [State Management](#9-state-management)
10. [Real-time Updates (SSE Client)](#10-real-time-updates-sse-client)
11. [UI Component Hierarchy](#11-ui-component-hierarchy)
12. [Key Pages & Features](#12-key-pages--features)
13. [Theme System](#13-theme-system)
14. [Type System](#14-type-system)
15. [Development Setup](#15-development-setup)
16. [Common Patterns & Best Practices](#16-common-patterns--best-practices)

---

## 1. Tech Stack

| Technology | Purpose |
|---|---|
| **React 19.2** | UI framework |
| **TypeScript 6** | Type-safe development |
| **Vite 8** | Build tool & dev server |
| **React Router 7** | Client-side routing |
| **TanStack Query 5** | Server state management, caching, re-fetching |
| **Lucide React** | Icon library |
| **CSS Modules / BEM** | Styling approach (CSS files per component) |
| **Vitest** | Testing framework |

---

## 2. Project Structure

```
Heliflow_Client_Frontend/
├── src/
│   ├── main.tsx                    # App entry point
│   ├── App.tsx                     # Root component: providers + routes
│   ├── App.css                     # Root styles (legacy Vite template)
│   ├── index.css                   # Global CSS + CSS variables
│   │
│   ├── api/                        # API communication layer
│   │   ├── client.ts               # HTTP client with caching, dedup, error handling
│   │   ├── normalize.ts            # Data normalization (Decimal -> number)
│   │   └── mappers.ts              # API response -> ViewModel mappers
│   │
│   ├── types/                      # TypeScript type definitions
│   │   ├── index.ts                # Core domain types (User, RFQ, Vendor, etc.)
│   │   └── viewModels.ts           # UI-specific view models (table rows, cards)
│   │
│   ├── config/                     # Configuration modules
│   │   ├── mock.ts                 # Mock mode toggle (USE_MOCK = false)
│   │   ├── mockData.ts             # Shared mock data (users, tokens)
│   │   ├── modulePermissions.ts    # Module permission capabilities
│   │   ├── permissionRouting.ts    # Route -> permission mapping
│   │   └── portalNames.ts          # Portal naming constants
│   │
│   ├── mocks/                      # Mock datasets for development
│   │   ├── dashboard.mock.ts
│   │   ├── rfqPage.mock.ts
│   │   ├── vendorsPage.mock.ts
│   │   ├── invoicePage.mock.ts
│   │   ├── approvalsPage.mock.ts
│   │   ├── vendorPortal.mock.ts
│   │   ├── notificationsPage.mock.ts
│   │   └── reportsPage.mock.ts
│   │
│   ├── context/                    # React Context providers
│   │   ├── AuthContext.tsx          # Auth state, login/logout, permission checks
│   │   ├── ThemeContext.tsx         # Light/dark theme management
│   │   └── BrandingContext.tsx      # White-label branding (company name, logo, colors, favicon)
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── useAuth.ts              # Auth context consumer hook
│   │   ├── useRoleAccess.ts        # RBAC hooks (canView, canCreate, canApprove)
│   │   ├── useServiceData.ts       # TanStack Query wrapper for data fetching
│   │   ├── useColumnPreferences.ts # User column visibility preferences
│   │   ├── useDashboardWidgets.ts  # Dashboard widget management
│   │   ├── useApprovalWorkflow.ts  # Approval workflow utilities
│   │   └── useRoutePrefetch.ts     # Route prefetching on hover
│   │
│   ├── router/                     # Route guards
│   │   ├── ProtectedRoute.tsx      # Auth check + role check + redirect
│   │   └── PermissionGate.tsx      # Route-level permission enforcement
│   │
│   ├── services/                   # API service modules
│   │   ├── index.ts                # Barrel export
│   │   ├── authService.ts          # Login/logout/session management
│   │   ├── rfqService.ts           # RFQ CRUD + send
│   │   ├── vendorService.ts        # Vendor CRUD + import
│   │   ├── quotationService.ts     # Quotation actions
│   │   ├── purchaseOrderService.ts # PO listing
│   │   ├── invoiceService.ts       # Invoice listing
│   │   ├── approvalService.ts      # Approval actions (approve/reject/return)
│   │   ├── dashboardService.ts     # KPI, pipeline, recent RFQs
│   │   ├── notificationService.ts  # Notifications CRUD
│   │   ├── adminService.ts         # Admin operations
│   │   ├── companySettingsService.ts # Company config, branding/white-label settings
│   │   ├── signatureService.ts     # Digital signatures
│   │   ├── vendorPortalService.ts  # Vendor portal API
│   │   ├── procurementService.ts   # Master data (departments, categories)
│   │   ├── reportsService.ts       # Reports data
│   │   ├── profileService.ts       # User profile
│   │   ├── localDataService.ts     # Local storage utilities
│   │   └── sseClient.ts            # SSE (Server-Sent Events) client
│   │
│   ├── utils/                      # Utility functions
│   │   ├── permissions.ts          # Permission helpers (map, check)
│   │   └── rbac.ts                 # Role definitions, module permissions, navigation menus
│   │
│   ├── pages/                      # Page components (one folder per page)
│   │   ├── auth/        (Login, VendorLogin, SetPassword, MagicLink)
│   │   ├── dashboard/   (Dashboard with widgets)
│   │   ├── rfq/         (RFQ list + create/edit)
│   │   ├── quotations/  (Quotation list)
│   │   ├── vendors/     (Vendor directory)
│   │   ├── approvals/   (Approval inbox)
│   │   ├── invoices/    (Accounts Payable)
│   │   ├── payments/    (Payments)
│   │   ├── sales-orders/ (Sales Orders)
│   │   ├── purchase-orders/ (Purchase Orders)
│   │   ├── documents/   (Documents)
│   │   ├── notifications/ (Notification center)
│   │   ├── reports/     (Reports & analytics)
│   │   ├── audit/       (Audit trail)
│   │   ├── admin/       (Users, Roles, Approval Levels, Company Settings)
│   │   ├── onboarding/  (New Onboarding, Onboarding Queue)
│   │   ├── signature/   (Digital signature)
│   │   ├── profile/     (My Profile)
│   │   └── vendor/      (Vendor portal pages)
│   │
│   ├── components/                  # Shared UI components
│   │   ├── layout/    (AppLayout, Sidebar, TopBar, NotificationBells)
│   │   ├── shared/    (CurrencyMaster, ColumnCustomizer, MessageStrip, RichTextEditor)
│   │   └── vendors/   (Vendor-specific components)
│   │
│   └── styles/                     # Shared CSS files
│       ├── vendor-orders.css
│       ├── vendor-portal.css
│       └── finance-pages.css
│
└── config files: package.json, vite.config.ts, tsconfig*.json, eslint.config.js
```

---

## 3. App Entry & Bootstrap

### main.tsx

```typescript
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(<App />)
```

Simple entry point. All setup happens in `App.tsx`.

### App.tsx - Root Component

The root component establishes the **provider hierarchy**:

```
QueryClientProvider (TanStack Query)
  +-- ThemeProvider (light/dark)
      +-- BrandingProvider (white-label: logo, colors, favicon, company name)
          +-- BrowserRouter
              +-- AuthProvider (user, roles, permissions)
                  +-- CurrencyProvider (currency formatting)
                      +-- Routes
```

#### Route Structure

Three main route groups:

1. **Public Routes** - No auth required
   - `/login` - Internal user login
   - `/vendor/login` - Vendor login
   - `/set-password` - Vendor password setup
   - `/auth/magic` - Magic link auto-login

2. **Vendor Portal Routes** - `ProtectedRoute` with `requireVendor`
   - `/vendor/dashboard`, `/vendor/rfqs`, `/vendor/quotations`
   - `/vendor/orders`, `/vendor/invoices`, `/vendor/profile`

3. **Protected Routes** - Auth required, wrapped in `AppLayout` + `PermissionGate`
   - Dashboard, RFQ, Quotations, Vendors, Approvals
   - Accounts Payable, Payments, Sales Orders
   - Admin (Users, Roles, Approval Levels, Company Settings)
   - Documents, Notifications, Audit Trail
   - Onboarding, Signature, Reports, Profile

#### Lazy Loading

All pages are **lazy-loaded** using `React.lazy()` with `Suspense`:

```typescript
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
// Wrapped in: <Suspense fallback={<RouteFallback />}>
```

---

## 4. Routing Architecture

### Route Protection Layers

**Layer 1: `ProtectedRoute`** - Checks authentication and role requirements

| Prop | Behavior |
|---|---|
| (none) | Any authenticated user can access |
| `requireVendor` | Only vendor users (role includes "Vendor") |
| `allowedRoles` | Only users with one of the specified roles |

If not authenticated -> redirects to `/login` (or `/vendor/login` for vendor routes).
If wrong role -> redirects to `/dashboard`.

**Layer 2: `PermissionGate`** - Enforce module-level permissions

- Wraps all internal routes except profile
- Checks if the user's merged permissions allow access to the current route
- If denied -> redirects to the first allowed path
- Uses `ROUTE_PERMISSION_RULES` mapping from `config/permissionRouting.ts`
- Skips permission check for vendor roles

**Layer 3: `ProtectedRoute` (nested)** - Admin-only sections

- Onboarding Queue route wraps admin routes with `ADMIN_ACCESS_ROLES`
- Only Super Admin, Administrator, or 'admin' roles can access

### Navigation Sidebar

The `Sidebar` component uses `useNavigationMenu()` hook which filters menu items by the user's roles and permissions. Navigation is organized by sections:

| Section | Items |
|---|---|
| Main | Dashboard |
| Procurement | RFQ Management, Quotations |
| Approvals | PO Approval, Accounts Payable, Payments, Sales Orders |
| Orders & Payments | (Vendor) My Orders, My Invoices |
| Account | (Vendor) My Profile |
| Governance | New Onboarding, Onboarding Queue, Signature |
| Intelligence | Reports, Audit Trail |
| Admin | Vendors, Users, Roles, Approval Levels, Company Settings |

---

## 5. Authentication & Session Management

### Architecture

```
AuthContext (React Context)
    |
    +-- Provides: user, roles, permissions, isAuthenticated, isLoading
    +-- login() -> authService.login() -> API -> saveSession()
    +-- vendorLogin() -> authService.vendorLogin() -> API -> saveSession()
    +-- logout() -> authService.logout() -> clearSession()

authService
    +-- Uses USE_MOCK to switch between mock and real API calls
    +-- saveSession(): Stores token, user, roles, permissions in localStorage
    +-- clearSession(): Removes all auth data from localStorage
    +-- getCurrentUser(): Restores session from localStorage or calls /auth/me
```

### Session Storage

All auth data persisted in `localStorage`:

| Key | Content |
|---|---|
| `heliflow_token` | JWT token |
| `heliflow_user` | JSON-serialized User object |
| `heliflow_roles` | JSON-serialized string[] |
| `heliflow_permissions` | JSON-serialized UserModulePermission[] |
| `heliflow_vendor_token` | Vendor-specific token |

### Login Flow

```
User enters credentials -> authService.login()
                         -> If USE_MOCK: mockLogin (checks ALL_MOCK_USERS)
                         -> Else: fetch POST /api/auth/login
                         -> saveSession (localStorage)
                         -> AuthContext updates
                         -> Redirect to /dashboard
```

### Session Restore on Page Refresh

1. `AuthProvider` mounts -> `isLoading = true`
2. Calls `authService.getCurrentUser()`
3. First checks localStorage for existing session data
4. If data exists -> returns immediately (no network call)
5. If localStorage empty (cache miss) -> calls `GET /api/auth/me`
6. On failure -> clears session -> `isLoading = false`
7. On mount complete -> `isLoading = false`, `isAuthenticated = !!user`

### Logout Flow

1. Clears localStorage immediately (instant redirect)
2. Fire-and-forget `POST /api/auth/logout` (background)
3. AuthContext clears user + roles + permissions

---

## 6. RBAC & Authorization

### Two Permission Systems (Backward Compatible)

#### 1. Legacy Role-Based (utils/rbac.ts)

Uses predefined `MODULE_PERMISSIONS` mapping:

```typescript
const MODULE_PERMISSIONS = {
  'Super Admin': {
    RFQ: { canView: true, canCreate: true, canApprove: true, canEdit: true, canDelete: true },
    // ...
  },
  'Procurement Manager': {
    RFQ: { canView: true, canCreate: true, canApprove: true, canEdit: true, canDelete: false },
    // ...
  },
}
```

#### 2. Granular Permission System

Uses database-backed permissions per role with OR-merging across multiple roles.

```typescript
// Each UserModulePermission has:
{ module: string; canView: boolean; canCreate: boolean; canApprove: boolean }

// Merged into a UserPermissionsMap for O(1) lookup:
{ 'RFQ': { canView: true, canCreate: false, canApprove: true }, ... }
```

The hook `useRoleAccess()` checks the new permission system first; if no permissions exist, it falls back to the legacy system.

### Permission Checks

| Method | Where | What it checks |
|---|---|---|
| `hasPermission(module, action?)` | AuthContext | DB-backed permissions (preferred) |
| `hasRole(role)` | AuthContext | Direct role membership |
| `canView(roles, module)` | utils/rbac.ts | Legacy role-based permission |
| `checkRoutePermission(permissions, pathname)` | PermissionGate | Route -> module mapping |
| `checkMenuItemPermission(permissions, itemId)` | Sidebar | Menu item -> module mapping |

### Route -> Permission Mapping

```typescript
// config/permissionRouting.ts
ROUTE_PERMISSION_RULES = [
  { prefix: '/rfq/create', rule: { module: 'RFQ', action: 'canCreate' } },
  { prefix: '/rfq', rule: { module: 'RFQ', action: 'canView' } },
  { prefix: '/quotations', rule: { module: 'Quotations', action: 'canView' } },
  // ... all routes mapped
]
```

### Available Roles

| Role (API) | Role (UI Display) | Access Level |
|---|---|---|
| `admin` | Super Admin | Full access |
| `Administrator` | Administrator | Full access |
| `purchase_clerk` | Procurement Manager | Procurement workflows |
| `finance_approver` | Finance Approver | Financial approvals |
| `finance_manager` | Finance Manager | Finance management |
| `Manager` | Manager | Department management |
| `Staff` | Staff | Basic access |
| `Vendor` | Vendor | Vendor portal only |

---

## 7. Data Flow

### Architecture Pattern

```
Page Component
    |
    +-- useServiceData(fetcher, initialData, deps, options)
    |       |
    |       +-- useQuery (TanStack Query)
    |               |
    |               +-- Service Function (e.g., rfqService.list())
    |                       |
    |                       +-- apiRequest(path, options)
    |                               |
    |                               +-- Cache check (in-memory Map)
    |                               +-- In-flight request dedup
    |                               +-- fetch() -> API_BASE + path
    |                               +-- Response parsing + error handling
    |
    +-- Renders data (table, cards, widgets)
```

### API Client (api/client.ts)

The core HTTP client provides:

1. **In-Memory Cache** - GET responses cached with configurable TTL (default: 2 min)
2. **Request Deduplication** - Identical in-flight requests are shared (prevents N+1)
3. **Surgical Cache Busting** - Mutations only invalidate related cache entries (by URL prefix)
4. **Timeout** - Configurable via `AbortController` (default: 30s)
5. **Error Handling** - Custom `ApiError` class with `code` and `status`
6. **Client Instance ID** - Unique ID (stored in localStorage) for cache management

```typescript
// Usage
const data = await apiRequest<User[]>('/users', { cacheTtlMs: 0 });  // No cache
const result = await apiRequest<{ id: number }>('/rfqs', {           // POST
  method: 'POST',
  body: JSON.stringify(payload),
});
```

### Mappers (api/mappers.ts)

Transforms raw API response data into UI-friendly ViewModels:

```typescript
mapApiRfqToTableRow(rfq)       -> RFQTableRow
mapVendorToTableRow(vendor)     -> VendorTableRow
mapApprovalToTableRow(approval) -> ApprovalTableRow
mapNotificationToRow(notif)     -> NotificationRow
mapBackendRfqStatus(status)     -> RFQStatus (normalized to UI statuses)
```

### useServiceData Hook

A wrapper around TanStack Query's `useQuery`:

```typescript
function useServiceData<T>(
  fetcher: () => Promise<T>,
  initial: T,           // Initial/fallback data
  deps?: unknown[],     // Dependencies to trigger refetch
  options?: { cacheKey?, cacheTtlMs?, maxRetries? }
): {
  data: T,
  loading: boolean,     // True only when NO data is available yet
  error: string | null,
  reload: () => void,   // Invalidates cache and re-fetches
}
```

Key behaviors:
- `loading` is `true` only when we have NO real data (initial load)
- Does NOT flash "Loading..." during background refetches
- `refetchOnWindowFocus` is disabled globally
- `refetchOnReconnect` is enabled

### Service Pattern

Each service module follows a consistent pattern:

```typescript
// services/rfqService.ts
export const rfqService = {
  list: USE_MOCK ? mockList : apiList,
  getById: USE_MOCK ? mockGetById : apiGetById,
  create: USE_MOCK ? mockCreate : apiCreate,
  send: USE_MOCK ? mockSend : apiSend,
  delete: USE_MOCK ? mockDelete : apiDelete,
  // ...
}
```

Every public method has a mock and API implementation, selected at import time by `USE_MOCK`.

---

## 7.1 Service-to-API Endpoint Reference

This section maps every public method on every service module to the exact backend API endpoint it calls. All endpoints are prefixed with `{API_BASE}` (default `http://localhost:3000/api`).

---

### authService (`services/authService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `login(payload)` | `POST` | `/auth/login` | Body: `{ username, password }`. Returns `{ user, token, roles, permissions }` (flat, not wrapped) |
| `vendorLogin(payload)` | `POST` | `/vendors/auth/login` | Body: `{ username, password }`. Returns vendor-shaped response, normalized to `{ user, token, roles: ['Vendor'] }` |
| `logout()` | `POST` | `/auth/logout` | Fire-and-forget in background. Clears localStorage first for instant redirect |
| `getCurrentUser()` | `GET` | `/auth/me` | Only called if localStorage cache is empty. Returns same shape as login |

---

### rfqService (`services/rfqService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list(params?)` | `GET` | `/rfqs?search=&page=&limit=100` | Query params from `ListParams`. Status filtered client-side after mapping |
| `getById(id)` | `GET` | `/rfqs/:id` | Returns single RFQ with items, vendors, quotations, POs |
| `listTyped()` | `GET` | `/rfqs?limit=100` | Returns raw `RFQ[]` instead of `RFQTableRow[]` |
| `create(payload)` | `POST` | `/rfqs` | Body: `{ title, description?, items[], vendorIds[]?, ... }` |
| `update(id, payload)` | `PUT` | `/rfqs/:id` | Partial update of DRAFT RFQ fields |
| `send(id)` | `POST` | `/rfqs/:id/send` | 60s timeout (email dispatch can be slow). Returns `{ emailFailures }` |
| `addVendors(id, vendorIds)` | `POST` | `/rfqs/:id/vendors` | Body: `{ vendorIds: number[] }` |
| `removeVendor(id, vendorId)` | `DELETE` | `/rfqs/:id/vendors/:vendorId` | — |
| `delete(id)` | `DELETE` | `/rfqs/:id` | Only DRAFT RFQs can be deleted |

---

### vendorService (`services/vendorService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list()` | `GET` | `/vendors?limit=100` | Returns `{ vendors: Vendor[] }` — mapped through `mapVendorToTableRow` |
| `listTyped()` | `GET` | `/vendors?limit=100` | Returns raw `Vendor[]` |
| `create(payload)` | `POST` | `/vendors` | Body: `{ name, email, phone?, contactPerson?, category?, categoryId?, location?, website? }` |
| `update(id, payload)` | `PUT` | `/vendors/:vendorId` | Body: `{ name?, email?, phone?, contactPerson?, ... }` |
| `remove(id)` | `DELETE` | `/vendors/:vendorId` | Cascade-deletes quotations, approvals, notifications |
| `resendPasswordSetup(vendorId)` | `POST` | `/vendors/:vendorId/resend-password-setup` | Resends password setup email |
| `changePassword(curr, newPwd, confirm)` | `POST` | `/vendors/auth/change-password` | Body: `{ currentPassword, newPassword, confirmPassword }` |

---

### quotationService (`services/quotationService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list(includeAll?)` | `GET` | `/quotations?limit=100&includeAll=true` | Filters: `?status=&search=&rfqId=&includeAll=&page=&limit=` |
| `listAll()` | `GET` | `/quotations?limit=100&includeAll=true` | Always includes all quotations (skip approval visibility filter) |
| `getById(id)` | `GET` | `/quotations/:id` | Includes RFQ, items, attachments |
| `updateStatus(id, status, comment?)` | `PUT` | `/quotations/:id/status` | Body: `{ status, comments? }`. Integrates with approval workflow |
| `getStats()` | `GET` | `/quotations/stats` | Returns `{ total, pending, accepted, rejected }` |
| `updateSelectedItems(id, itemIds)` | `PUT` | `/quotations/:id/items/selection` | Body: `{ selectedItemIds: number[] }` |

---

### purchaseOrderService (`services/purchaseOrderService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list(params?)` | `GET` | `/purchase-orders?page=&limit=50` | Reads from `data.pos` or `data.purchaseOrders`. Normalizes `totalAmount` from Decimal |

---

### invoiceService (`services/invoiceService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list()` | `GET` | `/invoices` | Returns `{ invoices: [] }` — mapped to `APInvoice[]` shape |

---

### approvalService (`services/approvalService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `listTable(params?)` | `GET` | `/approvals?status=&module=&search=` | Returns approvals for UI tables. Filtered by user's roles |
| `list()` | `GET` | `/approvals` | Returns raw `RequestApproval[]` |
| `getLevels()` | `GET` | `/admin/approval-levels` | Returns all `ApprovalLevel[]` configs |
| `approve(id, comment?)` | `POST` | `/approvals/:id/approve` | Body: `{ comments: string }` |
| `reject(id, comment?)` | `POST` | `/approvals/:id/reject` | Body: `{ comments }` — comments required |
| `return(id, comment?)` | `POST` | `/approvals/:id/return` | Body: `{ comments }` — comments required |

---

### dashboardService (`services/dashboardService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `getKpis()` | `GET` | `/dashboard/overview` | Also calls `/dashboard/my-tasks` to compute KPI cards. Result cached 15s backend-side |
| `getPipeline()` | `GET` | `/dashboard/rfq-status` | Uses shared `fetchRfqStatusReport()`. Maps backend statuses via `mapBackendRfqStatus` |
| `getRecentRfqs()` | `GET` | `/dashboard/rfq-status` | Shares response with `getPipeline()` via in-flight dedup |
| `getActivity()` | — | *(no backend endpoint)* | Returns empty array in non-mock mode |
| `getTopVendors()` | — | *(indirect)* | Calls `vendorService.list()` and sorts by `overallScore` |
| `getMyTasks()` | `GET` | `/dashboard/my-tasks` | Returns `{ tasks, taskCount }` filtered by user's roles |
| `getOverview()` | `GET` | `/dashboard/overview` | Direct `apiRequest` for raw dashboard overview |
| `getSpendOverview()` | `GET` | `/dashboard/spend-overview` | Returns `{ monthlyTrend, categories }` |

---

### notificationService (`services/notificationService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list()` | `GET` | `/notifications?limit=100` | Returns `NotificationRow[]` (mapped) |
| `listTyped()` | `GET` | `/notifications?limit=100` | Returns raw `Notification[]` |
| `unreadCount()` | `GET` | `/notifications/unread-count` | Returns `{ unreadCount: number }` |
| `markRead(id)` | `PUT` | `/notifications/:id/read` | — |
| `markAllRead()` | `PUT` | `/notifications/read-all` | — |
| `deleteAll()` | `DELETE` | `/notifications` | Deletes all user notifications |

---

### adminService (`services/adminService.ts`)

#### Users

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `listUsers()` | `GET` | `/admin/users?limit=100` | Filters: `?search=&role=&page=&limit=` |
| `createUser(payload)` | `POST` | `/admin/users` | **Multipart**: fields + optional file uploads (`aadhaar`, `pan`, `offerLetter`). Invalidates `/admin/users` cache on success |
| `updateUser(id, payload)` | `PUT` | `/admin/users/:id` | Body: `{ fullName?, email?, phone?, department?, roleName? }` |
| `deleteUser(id)` | `DELETE` | `/admin/users/:id` | Soft-delete (archives username/email) |
| `toggleUserStatus(id)` | `PUT` | `/admin/users/:id/toggle-status` | Body: `{}` — toggles `isActive` on server |
| `getUserWidgets(id)` | `GET` | `/admin/users/:id/widgets` | — |
| `saveUserWidgets(id, widgets)` | `PUT` | `/admin/users/:id/widgets` | Body: `{ widgets: [{ widgetId, isEnabled }] }` |

#### Roles

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `listRoles()` | `GET` | `/admin/roles` | Returns `AdminRoleRecord[]` with permissions + user counts |
| `createRole(payload)` | `POST` | `/admin/roles` | Body: `{ roleName, description?, permissions? }` |
| `updateRole(id, payload)` | `PUT` | `/admin/roles/:id` | Body: `{ roleName?, description? }` |
| `deleteRole(id)` | `DELETE` | `/admin/roles/:id` | Fails if role has users assigned or is system role |
| `updateRolePermissions(id, perms)` | `PUT` | `/admin/roles/:id/permissions` | Body: `{ permissions: [{ module, canView, canCreate, canApprove }] }` |

#### Approval Levels

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `listApprovalLevels()` | `GET` | `/admin/approval-levels` | — |
| `createApprovalLevel(payload)` | `POST` | `/admin/approval-levels` | Body: `{ module, requiredRole, timeLimitHours?, minValue?, maxValue? }` |
| `updateApprovalLevel(id, payload)` | `PUT` | `/admin/approval-levels/:id` | — |
| `deleteApprovalLevel(id)` | `DELETE` | `/admin/approval-levels/:id` | Server re-numbers remaining levels |
| `reorderApprovalLevel(id, dir)` | `PUT` | `/admin/approval-levels/:id/reorder` | Body: `{ direction: 'up' | 'down' }` |

---

### companySettingsService (`services/companySettingsService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `listDepartments()` | `GET` | `/company-settings/departments` | Cached 60s. Query: `?includeInactive=true` |
| `createDepartment(name, desc?)` | `POST` | `/company-settings/departments` | Body: `{ name, description? }` — upserts by company+name |
| `updateDepartment(id, data)` | `PUT` | `/company-settings/departments/:departmentId` | Body: `{ name?, description?, isActive? }` |
| `deleteDepartment(id)` | `DELETE` | `/company-settings/departments/:departmentId` | — |
| `listCategories(depId?)` | `GET` | `/company-settings/categories?departmentId=` | Cached 60s |
| `createCategory(depId, name, desc?)` | `POST` | `/company-settings/categories` | Body: `{ departmentId, name, description? }` |
| `updateCategory(id, data)` | `PUT` | `/company-settings/categories/:categoryId` | Body: `{ departmentId?, name?, description?, isActive? }` |
| `deleteCategory(id)` | `DELETE` | `/company-settings/categories/:categoryId` | Server unlinks vendors before deleting |
| `listUnits()` | `GET` | `/company-settings/units` | Cached 60s |
| `createUnit(name)` | `POST` | `/company-settings/units` | Body: `{ name }` — upserts |
| `deleteUnit(id)` | `DELETE` | `/company-settings/units/:unitId` | — |
| `listPositions()` | `GET` | `/company-settings/positions` | Cached 60s |
| `createPosition(name, desc?)` | `POST` | `/company-settings/positions` | Body: `{ name, description? }` — upserts |
| `deletePosition(id)` | `DELETE` | `/company-settings/positions/:positionId` | — |
| `listPaymentTerms()` | `GET` | `/company-settings/payment-terms` | Cached 60s |
| `createPaymentTerm(name)` | `POST` | `/company-settings/payment-terms` | Body: `{ name }` — upserts |
| `deletePaymentTerm(id)` | `DELETE` | `/company-settings/payment-terms/:paymentTermId` | — |
| `getCompanyProfile()` | `GET` | `/company-settings/profile` | Cached 120s |
| `updateCompanyProfile(payload)` | `PUT` | `/company-settings/profile` | Body (payload object): `{ defaultCurrency?, invitationExpiryHours?, resubmissionDeadlineHours?, companyName?, logoUrl?, faviconUrl?, primaryColor?, loginText?, supportEmail? }` |
| `getDefaultCurrency()` | `GET` | `/company-settings/default-currency` | Cached 60s. Works for both user and vendor auth tokens |
| `listEmailTemplates()` | `GET` | `/company-settings/email-templates` | — |
| `getEmailTemplate(key)` | `GET` | `/company-settings/email-templates/:key` | Also returns template labels |
| `updateEmailTemplate(key, bodyHtml, subject?)` | `PUT` | `/company-settings/email-templates/:key` | Body: `{ subject?, bodyHtml }` |
| `resetEmailTemplate(key)` | `DELETE` | `/company-settings/email-templates/:key/reset` | Resets to system default |
| `listRequiredDocuments()` | `GET` | `/company-settings/required-documents` | Cached 60s |
| `createRequiredDocument(name)` | `POST` | `/company-settings/required-documents` | Body: `{ name }` — upserts |
| `deleteRequiredDocument(id)` | `DELETE` | `/company-settings/required-documents/:documentId` | — |

---

### procurementService (`services/procurementService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `getOnboardingQueue()` | `GET` | `/procurement/vendor-approval-queue` | Returns vendors in all lifecycle stages. Normalizes ACTIVE→APPROVED |
| `listPendingDocuments()` | `GET` | `/procurement/pending-documents` | Returns all `PENDING` vendor documents (limit 100) |
| `listInvitations()` | `GET` | `/procurement/onboarding-invitations` | Returns pending invitations |
| `sendInvitation(payload)` | `POST` | `/procurement/onboarding-invitations` | Body: `{ companyName, contactEmail, contactPerson?, notes?, items? }` |
| `resendInvitation(vendorId)` | `POST` | `/procurement/onboarding-invitations/:vendorId/resend` | — |
| `deleteInvitation(vendorId)` | `DELETE` | `/procurement/onboarding-invitations/:vendorId` | Only if vendor is not active |
| `getVendorDocuments(vendorId)` | `GET` | `/procurement/vendors/:vendorId/documents` | Returns docs + summary + required list |
| `getVendorProfile(vendorId)` | `GET` | `/procurement/vendors/:vendorId/profile` | Returns full vendor profile data |
| `verifyDocument(docId)` | `POST` | `/procurement/vendor-documents/:documentId/verify` | — |
| `rejectDocument(docId, reason)` | `POST` | `/procurement/vendor-documents/:documentId/reject` | Body: `{ reason: string }` |
| `approveVendor(vendorId)` | `POST` | `/procurement/approve-vendor/:vendorId` | Approves + sends password setup email |
| `rejectVendor(vendorId, reason?)` | `POST` | `/procurement/reject-vendor/:vendorId` | Body: `{ reason: string }` — sends rejection email |

---

### signatureService (`services/signatureService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list()` | `GET` | `/signatures` | Returns user's saved signatures |
| `create(data)` | `POST` | `/signatures` | Body: `{ name, dataUrl, type: 'drawn'|'uploaded' }` |
| `delete(id)` | `DELETE` | `/signatures/:id` | Also deletes associated document signatures |
| `setDefault(id)` | `PUT` | `/signatures/:id/default` | Unsets all other defaults for this user |
| `signDocument(payload)` | `POST` | `/signatures/sign` | Body: `{ signatureId, module, referenceId, comments? }` |
| `getDocumentSignatures(module, refId)` | `GET` | `/signatures/document/:module/:referenceId` | Returns all signatures on a document |

---

### vendorPortalService (`services/vendorPortalService.ts`)

All calls use the `vendorFetch<T>(path)` helper which prefixes paths with `/vendors` (e.g. `/vendors/rfqs`).

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `listRfqs()` | `GET` | `/vendors/rfqs` | Returns RFQs with invite status, quotation status, resubmit flags |
| `listQuotations()` | `GET` | `/vendors/quotations` | Returns submitted quotations with RFQ details |
| `submitQuotation(rfqId, payload, attachments?)` | `POST` | `/vendors/rfqs/:rfqId/quotations` | Multipart if attachments, JSON otherwise. 120s timeout |
| `resubmitQuotation(rfqId, payload)` | `PUT` | `/vendors/rfqs/:rfqId/quotations` | Only allowed if status is SUBMITTED or RETURNED. 120s timeout |
| `listOrders()` | `GET` | `/vendors/erp-data` | Returns ERP purchase orders |
| `listInvoices()` | `GET` | `/vendors/erp-data` | Returns ERP invoices (same endpoint as orders) |
| `getProfile()` | `GET` | `/vendors/profile` | Full profile with banking, docs, performance |
| `updateBanking(payload)` | `PUT` | `/vendors/profile/banking` | Body: `{ bankName?, bankBranch?, bankAccountNumber?, bankIfscCode? }` |
| `uploadDocument(file, doctype)` | `POST` | `/vendors/profile/documents` | Multipart: `document` (file) + `documentType` (string) |
| `listNotifications()` | `GET` | `/vendors/notifications?limit=50` | Returns `{ notifications, unreadCount }` |
| `markNotificationRead(id)` | `PUT` | `/vendors/notifications/:notificationId/read` | — |
| `markAllNotificationsRead()` | `PUT` | `/vendors/notifications/read-all` | — |
| `deleteAllNotifications()` | `DELETE` | `/vendors/notifications` | — |
| `getWidgetPreferences()` | `GET` | `/vendors/widgets` | — |
| `saveWidgetPreferences(widgets)` | `PUT` | `/vendors/widgets` | Body: `{ widgets: [{ widgetId, isActive }] }` |

---

### profileService (`services/profileService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `getDocuments()` | `GET` | `/auth/profile/documents` | Returns user's uploaded documents (Aadhaar, PAN, etc.) |
| `updateProfile(payload)` | `PUT` | `/auth/profile` | Body: `{ phone?, department? }` |
| `changePassword(current, newPwd, confirm)` | `POST` | `/auth/change-password` | Body: `{ currentPassword, newPassword, confirmPassword }` |

---

### reportsService (`services/reportsService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `list()` | `GET` | *(via invoiceService)* | Delegates to `invoiceService.list()` → `GET /api/invoices`, then maps to `InvoiceRecord` |

---

### localDataService (`services/localDataService.ts`)

| Method | HTTP | Endpoint | Notes |
|---|---|---|---|
| `getPayments()` | `GET` | `/payments` | Maps response fields: `paymentNumber→paymentId`, `vendorName→vendor` |
| `getSalesOrders()` | `GET` | `/sales-orders` | Maps: `soNumber`, `customerName→customer`, `createdAt→orderDate` |
| `getAuditTrail()` | — | *(no backend endpoint)* | Returns empty array if not mock mode |
| `getDocuments()` | — | *(no backend endpoint)* | Returns empty array if not mock mode |
| `getReports()` | — | *(no backend endpoint)* | Falls back to mock in non-mock mode |

---

### sseClient (`services/sseClient.ts`)

| Method | Transport | Endpoint | Notes |
|---|---|---|---|
| `connect()` | `EventSource` (SSE) | `/dashboard/stream?token=` or `/vendors/stream?token=` | Reads JWT token from localStorage, decodes `type` field to pick stream. Auth via query-param (EventSource can't send custom headers) |
| `disconnect()` | — | — | Closes EventSource connection, clears reconnect timer |
| `on(event, handler)` | — | — | Subscribes to named SSE events. Returns unsubscribe function. Listens to 15 named event types |

**SSE events listened to:** `notification`, `rfq_status_changed`, `quotation_received`, `po_created`, `vendor_approved`, `approval_required`, `erp_sync_complete`, `approval_level_complete`, `approval_chain_complete`, `approval_auto_forwarded`, `approval_deadline_warning`, `quotation_status_changed`, `vendor_notification`, `vendor_onboarding_accepted`, `vendor_onboarding_documents_submitted`

---

## 8. Mock vs Real Backend Mode

### Toggle

```typescript
// config/mock.ts
export const USE_MOCK = false;  // false = real backend, true = local mock data
```

Override via env: `VITE_USE_MOCK=false`

### When USE_MOCK = true

- All service calls use local mock data from `mocks/` and `config/mockData.ts`
- No network requests made - everything is simulated with timeouts
- `MOCK_TOKEN` is used for auth
- Perfect for UI development without starting the backend

### When USE_MOCK = false (default)

- All service calls go to the real backend at `VITE_API_URL`
- Auth uses real JWT tokens from the backend
- SSE connects to real backend streams
- Mock data files still exist but are never imported by services

### Mock Demo Credentials

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Super Admin |
| `procurement` | `proc123` | Procurement Manager |
| `finance` | `fin123` | Finance Approver |
| `vendor1` | `vendor123` | Vendor (Acme Tech Solutions) |
| `vendor2` | `vendor123` | Vendor (Global Supply Corp) |
| `vendor3` | `vendor123` | Vendor (Quality Parts Ltd) |

---

## 9. State Management

### Server State: TanStack Query

All server data fetching uses TanStack Query via `useServiceData`:

```typescript
const { data, loading, error, reload } = useServiceData(
  () => rfqService.list({ status: 'DRAFT' }),
  [],                       // initial empty array (fallback)
  [statusFilter],           // refetch when filter changes
  { cacheTtlMs: 300000 }    // 5 min cache
);
```

- **Global QueryClient** with `refetchOnWindowFocus: false`, `retry: 2`
- **Stale time**: 5 minutes default
- **Cache invalidation**: Via `apiClient.invalidateApiCache(path)` or `queryClient.invalidateQueries()`

### Client State: React Context + useState

- **AuthContext**: User, roles, permissions, auth state (login/logout methods)
- **ThemeContext**: Light/dark theme preference (persisted to localStorage)
- **BrandingContext**: White-label branding — company name, logo URL, favicon URL, primary color (with auto-generated palette), login page text, support email. Loads from backend on mount, applies CSS custom properties to `:root`, updates favicon link and `document.title`. Exposed via `useBranding()` hook.

### Local Component State

Components use `useState` and `useCallback` for UI state (modals, dropdowns, form inputs, search filters, tab selections).

---

## 10. Real-time Updates (SSE Client)

### Architecture

```
Backend SSE endpoint (EventSource)
    |
    +-- sseClient.ts (singleton)
            |
            +-- connect()     - Called when AppLayout mounts
            +-- disconnect()  - Called on logout / AppLayout unmount
            +-- on(event, handler) - Subscribe to specific event types
            +-- dispatch(event, data) - Internal: fires all subscribed handlers
```

### Connection Lifecycle

1. **Connect on mount**: `AppLayout` calls `sseClient.connect()` in a `useEffect`
2. **Auto-disconnect on logout**: `sseClient.disconnect()` called
3. **Auto-reconnect**: Exponential backoff (2s -> 30s max) on connection loss

### Stream Selection

The client reads the JWT payload to determine which stream to connect to:

- `type: 'user'` -> `/api/dashboard/stream`
- `type: 'vendor'` -> `/api/vendors/stream`

### Event Handling

```typescript
// Component subscribes
useEffect(() => {
  const unsub = sseClient.on('notification', (data) => {
    setNotificationCount((prev) => prev + 1);
  });
  return unsub; // Cleanup on unmount
}, []);
```

### All SSE Event Names

```
'notification'
'rfq_status_changed'
'quotation_received'
'po_created'
'vendor_approved'
'approval_required'
'erp_sync_complete'
'approval_level_complete'
'approval_chain_complete'
'approval_auto_forwarded'
'approval_deadline_warning'
'quotation_status_changed'
'vendor_notification'
'vendor_onboarding_accepted'
'vendor_onboarding_documents_submitted'
```

---

## 11. UI Component Hierarchy

### Layout

```
AppLayout
  +-- Sidebar (navigation + collapse)
  |   +-- Logo + branding
  |   +-- Nav sections (filtered by permissions)
  |   +-- Collapse toggle button
  |
  +-- Main Area
      +-- TopBar
      |   +-- Hamburger menu button (mobile)
      |   +-- Breadcrumb (Section > Page Title)
      |   +-- Theme toggle (light/dark)
      |   +-- Notification bell (AdminNotificationBell or VendorNotificationBell)
      |   +-- User menu (avatar, name, role, dropdown with profile + logout)
      |
      +-- <Outlet /> (page content)
      |
      +-- Footer (copyright)
```

### Shared Components

| Component | Location | Purpose |
|---|---|---|
| `CurrencyMaster` | `components/shared/CurrencyMaster.tsx` | Currency context + formatting |
| `ColumnCustomizer` | `components/shared/ColumnCustomizer.tsx` | Table column visibility toggling |
| `MessageStrip` | `components/shared/MessageStrip.tsx` | Inline success/error/info/warning messages |
| `RichTextEditor` | `components/shared/RichTextEditor.css` | Rich text editing (styling only) |

---

## 12. Reusable Components Reference

This section documents every shared component in `src/components/` with its props interface, default values, states, and usage examples. Use this as a quick reference when building new pages.

---

### 12.1 MessageStrip

**File:** `components/shared/MessageStrip.tsx`  \
**CSS:** `components/shared/MessageStrip.css`

Inline notification banner with auto-dismiss, type-aware icon, and close button.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | **(required)** | Message content |
| `type` | `'success' \| 'error' \| 'warning' \| 'information'` | `'information'` | Visual style variant |
| `onClose` | `() => void` | — | Callback when close button clicked or auto-hide fires |
| `autoHideMs` | `number` | — | Auto-dismiss after N milliseconds |
| `compact` | `boolean` | `false` | Reduces padding/size for inline use |
| `className` | `string` | `''` | Additional CSS class |
| `style` | `CSSProperties` | — | Inline styles |

#### States

| State | How |
|---|---|
| **Visible** | Default rendering with icon + text + optional close button |
| **Auto-hiding** | Set `autoHideMs={3000}` — calls `onClose` after timeout |
| **Compact** | `compact={true}` — reduced padding for embedding in toolbars/footers |
| **Dismissed** | When `onClose` fires — parent removes from render tree |

#### Usage

```tsx
import { MessageStrip, inferMessageType } from '../components/shared/MessageStrip';

{/* Explicit type */}
<MessageStrip type="success" onClose={() => setSuccess(null)} autoHideMs={3000}>
  Quotation approved successfully.
</MessageStrip>

{/* Auto-inferred type from message text */}
{error && (
  <MessageStrip type={inferMessageType(error)} onClose={() => setError(null)} compact>
    {error}
  </MessageStrip>
)}

{/* Inline in a footer bar */}
<MessageStrip type="warning" compact className="sap-message-strip--flush" style={{ flex: 1 }}>
  This action cannot be undone.
</MessageStrip>
```

#### Helper

`inferMessageType(message: string): MessageStripType` — detects keywords (`fail`, `error`, `success`, `created`, `warn`) and returns the appropriate type automatically.

---

### 12.2 CurrencyProvider, CurrencyContext & useCurrency

**File:** `components/shared/CurrencyMaster.tsx`  \
**CSS:** `components/shared/CurrencyMaster.css`

Application-wide currency formatting and exchange rate context. Wraps the entire app in `App.tsx`.

#### Provider Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | **(required)** | Child tree |

#### Context Value (`useCurrency()`)

```typescript
interface CurrencyContextValue {
  currencies: CurrencyInfo[];          // All available currencies with metadata
  rates: CurrencyRates | null;         // Live exchange rates (base: USD)
  loading: boolean;                    // Rates currently being fetched
  error: string | null;                // Rate fetch error message
  convert: (amount: number, from: string, to: string) => number;
  formatAmount: (amount: number, currency: string) => string;
  getSymbol: (code: string) => string; // Returns symbol (e.g., '$' for USD)
  refresh: () => void;                 // Re-fetch rates from API
  companyDefaultCurrency: string;      // Company's default (e.g., 'KES')
  setCompanyDefaultCurrency: (c: string) => void;
}
```

#### Usage

```tsx
import { CurrencyProvider, useCurrency, formatAmount as formatCurrency } from '../components/shared/CurrencyMaster';

// At app root (already done in App.tsx)
<CurrencyProvider>
  <App />
</CurrencyProvider>

// In any component
const { formatAmount, convert, getSymbol, companyDefaultCurrency } = useCurrency();

// Format a price
const formatted = formatAmount(12500, 'KES'); // "KSh12,500"

// Convert currencies
const inUSD = convert(12500, 'KES', 'USD');

// Get symbol only
const sym = getSymbol('EUR'); // "€"
```

#### Data Sources (in order)

1. **Backend**: `GET /api/exchange-rates` (returns `{ base, date, rates }`)
2. **open.er-api.com**: Free fallback
3. **frankfurter.dev**: Secondary free fallback
4. **Hardcoded fallback**: App-level `FALLBACK_CURRENCIES` (150+ currencies)

---

### 12.3 CurrencySelector

**File:** `components/shared/CurrencyMaster.tsx` (same file)  \
Searchable dropdown for selecting a currency from the full list.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | **(required)** | Selected currency code (e.g., `'KES'`) |
| `onChange` | `(code: string) => void` | **(required)** | Called when user selects a currency |
| `label` | `string` | — | Optional label displayed above the trigger |
| `disabled` | `boolean` | `false` | Disables the selector |
| `size` | `'sm' \| 'md'` | `'md'` | Size variant |
| `className` | `string` | `''` | Additional CSS class |

#### Features

- Search by currency code, name, or country name
- Flag emojis for each country
- Refresh button to update exchange rates
- Keyboard: `Escape` to close, `Enter` to select first result
- Click-outside to close

#### Usage

```tsx
import { CurrencySelector } from '../components/shared/CurrencyMaster';

<CurrencySelector
  value={selectedCurrency}
  onChange={setSelectedCurrency}
  label="RFQ Currency"
  size="md"
/>

{/* Small variant */}
<CurrencySelector
  value="USD"
  onChange={(c) => setCurrency(c)}
  size="sm"
/>
```

---

### 12.4 CurrencyAmountInput

**File:** `components/shared/CurrencyMaster.tsx`  \
Combined amount input field with inline currency selector.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `amount` | `number \| ''` | **(required)** | Current numeric value (or empty string) |
| `currency` | `string` | **(required)** | Selected currency code |
| `onAmountChange` | `(val: number \| '') => void` | **(required)** | Called when amount changes |
| `onCurrencyChange` | `(code: string) => void` | **(required)** | Called when currency changes |
| `placeholder` | `string` | `'Amount'` | Input placeholder |
| `min` | `number` | `0` | Minimum allowed value |
| `disabled` | `boolean` | `false` | Disables both fields |

#### Usage

```tsx
import { CurrencyAmountInput } from '../components/shared/CurrencyMaster';

<CurrencyAmountInput
  amount={lineItem.totalCost}
  currency={lineItem.currency}
  onAmountChange={(val) => updateItem(itemId, 'totalCost', val)}
  onCurrencyChange={(code) => updateItem(itemId, 'currency', code)}
  placeholder="Enter amount"
  min={0}
/>
```

---

### 12.5 CurrencyBadge

**File:** `components/shared/CurrencyMaster.tsx`  \
Compact display badge showing flag + symbol + code.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `currency` | `string` | **(required)** | Currency code (e.g., `'KES'`, `'USD'`) |
| `className` | `string` | `''` | Additional CSS class |
| `size` | `'sm' \| 'md'` | `'sm'` | Badge size |

#### Usage

```tsx
import { CurrencyBadge } from '../components/shared/CurrencyMaster';

{/* In a table cell */}
<td><CurrencyBadge currency={rfq.currency} size="sm" /></td>

{/* On a detail page */}
<CurrencyBadge currency="KES" size="md" />
```

---

### 12.6 ConvertedAmount

**File:** `components/shared/CurrencyMaster.tsx`  \
Displays a converted amount in another currency with an arrow indicator.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `amount` | `number` | **(required)** | Original amount |
| `from` | `string` | **(required)** | Source currency code |
| `to` | `string` | **(required)** | Target currency code |
| `showDirection` | `boolean` | `true` | Show arrow icon |
| `className` | `string` | `''` | Additional CSS class |

#### Behavior

- Returns `null` if `from === to` (no conversion needed)
- Shows `...` while rates are loading
- Shows `~{formatted}` when rates are available

#### Usage

```tsx
import { ConvertedAmount } from '../components/shared/CurrencyMaster';

{/* In a quotation comparison */}
<ConvertedAmount amount={quotation.totalPrice} from={quotation.currency} to="KES" />

{/* Without direction arrow */}
<ConvertedAmount amount={15000} from="USD" to="KES" showDirection={false} />
```

---

### 12.7 ColumnCustomizer

**File:** `components/shared/ColumnCustomizer.tsx`  \
**CSS:** `components/shared/ColumnCustomizer.css`

Floating panel for toggling table column visibility, reordering by drag-and-drop, and resetting to defaults.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `columnOrder` | `string[]` | **(required)** | Current display order of column keys |
| `visibleKeys` | `Set<string>` | **(required)** | Set of currently visible column keys |
| `allColumns` | `ColDescriptor[]` | **(required)** | All available columns with metadata |
| `onToggle` | `(key: string) => void` | **(required)** | Toggle column visibility |
| `onReorder` | `(newOrder: string[]) => void` | **(required)** | Called when user drops a column in new position |
| `onReset` | `() => void` | **(required)** | Reset to default order + visibility |
| `onClose` | `() => void` | **(required)** | Close the panel |
| `anchorRef` | `RefObject<HTMLButtonElement \| null>` | **(required)** | Reference to the trigger button for positioning |

#### Supporting Types

```typescript
interface ColDescriptor {
  key: string;         // Unique column identifier
  label: string;       // Display label in the panel
  required?: boolean;  // If true, cannot be toggled off (greyed out)
}
```

#### Panel Positioning

Automatically positions itself relative to the anchor button. Tries in order:
1. Below anchor (if enough screen space)
2. Above anchor
3. Left of anchor
4. Right of anchor

#### Usage

```tsx
import { useState, useRef, useMemo, useCallback } from 'react';
import ColumnCustomizer from '../components/shared/ColumnCustomizer';
import type { ColDescriptor } from '../components/shared/ColumnCustomizer';

// Define all columns
const ALL_COLUMNS: ColDescriptor[] = [
  { key: 'name', label: 'Vendor Name', required: true },
  { key: 'email', label: 'Email', defaultVisible: true },
  { key: 'phone', label: 'Phone' },
  { key: 'status', label: 'Status', defaultVisible: true },
];

const DEFAULT_ORDER = ALL_COLUMNS.map((c) => c.key);
const DEFAULT_VISIBLE = new Set(
  ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
);

function MyTable() {
  const [order, setOrder] = useState(DEFAULT_ORDER);
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);
  const [panelOpen, setPanelOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback((key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setOrder(DEFAULT_ORDER);
    setVisible(new Set(DEFAULT_VISIBLE));
  }, []);

  // Filter visible columns for rendering
  const visibleColumns = order
    .map((k) => ALL_COLUMNS.find((c) => c.key === k)!)
    .filter((c) => c && visible.has(c.key));

  return (
    <div className="table-col-btn-wrap">
      <button ref={btnRef} onClick={() => setPanelOpen((v) => !v)}>
        Customize
      </button>
      {panelOpen && (
        <ColumnCustomizer
          columnOrder={order}
          visibleKeys={visible}
          allColumns={ALL_COLUMNS}
          onToggle={handleToggle}
          onReorder={setOrder}
          onReset={handleReset}
          onClose={() => setPanelOpen(false)}
          anchorRef={btnRef}
        />
      )}
    </div>
  );
}
```

---

### 12.8 RichTextEditor

**File:** `components/shared/RichTextEditor.tsx`  \
**CSS:** `components/shared/RichTextEditor.css`

WYSIWYG editor built with `contentEditable` and `document.execCommand`, used for email template editing.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | **(required)** | Current HTML content |
| `onChange` | `(html: string) => void` | **(required)** | Called on every content change with raw HTML |
| `placeholder` | `string` | `'Write your email content here...'` | Placeholder shown in preview mode |
| `minHeight` | `number` | `200` | Minimum editor height in pixels |
| `maxHeight` | `number` | `500` | Maximum editor height (scrolls) |

#### Toolbar Actions

| Button | execCommand | Shortcut |
|---|---|---|
| **Bold** | `bold` | `Ctrl+B` |
| *Italic* | `italic` | `Ctrl+I` |
| <u>Underline</u> | `underline` | `Ctrl+U` |
| Bullet List | `insertUnorderedList` | — |
| Numbered List | `insertOrderedList` | — |
| Align Left | `justifyLeft` | — |
| Preview/Edit | Toggle mode | — |

#### States

| State | Description |
|---|---|
| **Edit mode** | ContentEditable div with toolbar |
| **Preview mode** | Read-only HTML rendering via `dangerouslySetInnerHTML` |
| **Empty** | Shows placeholder text in preview; empty `<div>` in edit mode |
| **Paste sanitization** | Intercepts paste, strips formatting, inserts as plain text |

#### Usage

```tsx
import RichTextEditor from '../components/shared/RichTextEditor';

const [htmlContent, setHtmlContent] = useState('');

<RichTextEditor
  value={htmlContent}
  onChange={setHtmlContent}
  placeholder="Write your email body..."
  minHeight={250}
  maxHeight={400}
/>
```

---

### 12.9 AppLayout

**File:** `components/layout/AppLayout.tsx`  \
**CSS:** `components/layout/AppLayout.css`

Root layout wrapper for all authenticated routes (internal + vendor portal). Manages sidebar collapse, mobile menu, and SSE connection lifecycle.

#### Props

*(None — this component is used as a route layout via `<Route element={<AppLayout />}>`)*

#### Internal State

| State | Type | Default | Description |
|---|---|---|---|
| `collapsed` | `boolean` | `false` | Sidebar collapsed/expanded |
| `mobileOpen` | `boolean` | `false` | Mobile sidebar overlay open/closed |

#### Side Effects

- **Mount**: Calls `sseClient.connect()` — central SSE connection for the entire authenticated session
- **Unmount**: Calls `sseClient.disconnect()`

#### Structure

```
<div class="app-layout">
  <Sidebar collapsed mobileOpen onToggle onMobileClose />
  <div class="app-layout__main">
    <TopBar onMenuClick={handleMobileOpen} />
    <main class="app-layout__content">
      <Outlet />  ← page content
    </main>
    <footer>© {year} Helical Consulting</footer>
  </div>
</div>
```

#### Usage

```tsx
// App.tsx — as a route layout
<Route element={<AppLayout />}>
  <Route path="/dashboard" element={<DashboardPage />} />
  <Route path="/rfq" element={<RFQPage />} />
  {/* ... more authenticated routes */}
</Route>
```

---

### 12.10 Sidebar

**File:** `components/layout/Sidebar.tsx`  \
**CSS:** `components/layout/Sidebar.css`

Collapsible navigation sidebar with permission-filtered menu items, section grouping, and route prefetching.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `collapsed` | `boolean` | **(required)** | Sidebar collapsed state |
| `mobileOpen` | `boolean` | **(required)** | Mobile overlay open state |
| `onToggle` | `() => void` | **(required)** | Toggle collapsed state |
| `onMobileClose` | `() => void` | **(required)** | Close mobile overlay |

#### Menu Structure

The sidebar constructs navigation sections dynamically:

| Section | Items | Visibility |
|---|---|---|
| **Main** | Dashboard | Always for internal users |
| **Procurement** | RFQ Management, Quotations | For procurement roles |
| **Approvals** | PO Approval, Accounts Payable, Payments, Sales Orders | For approval roles |
| **Orders & Payments** | My Orders, My Invoices | Vendor only |
| **Account** | My Profile | Vendor only |
| **Governance** | New Onboarding, Onboarding Queue, Signature | Admin only |
| **Intelligence** | Reports, Audit Trail | As per permissions |
| **Admin** | Vendors, Users, Roles, Approval Levels | Admin only |

#### Features

- **Collapse**: Toggle to icon-only mode (`sidebar--collapsed`)
- **Mobile**: Overlay mode with backdrop (`sidebar--mobile-open` + `sidebar__backdrop`)
- **Active state**: Exact match for dashboard, prefix match for all others
- **Prefetching**: `useRoutePrefetch` fires on `onMouseEnter`
- **Tooltips**: Shown on hover when collapsed
- **Section labels**: Visible in expanded mode, hidden in collapsed

#### Usage

```tsx
import Sidebar from '../components/layout/Sidebar';

<Sidebar
  collapsed={isCollapsed}
  mobileOpen={isMobileOpen}
  onToggle={toggleSidebar}
  onMobileClose={closeMobile}
/>
```

---

### 12.11 TopBar

**File:** `components/layout/TopBar.tsx`  \
**CSS:** `components/layout/TopBar.css`

Header bar with breadcrumb navigation, theme toggle, notification bell, and user dropdown menu.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `onMenuClick` | `() => void` | **(required)** | Fired when hamburger icon is clicked (for mobile sidebar) |

#### Internal Behavior

| Feature | Details |
|---|---|
| **Breadcrumb** | `Home > Section > Page Title` — derived from `PAGE_TITLES` and `SECTION_MAP` lookup |
| **Theme toggle** | Sun/Moon icon toggles between light/dark |
| **Notification bell** | Renders `AdminNotificationBell` or `VendorNotificationBell` based on role |
| **User avatar** | Initials derived from `user.fullName`. Shows name + role in dropdown |
| **User dropdown** | My Profile link + Sign Out button. Closes on outside click |

#### Page Title & Section Mapping

```typescript
const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/rfq': 'Request for Quotations',
  '/quotations': 'Quotations',
  '/vendors': 'Vendors',
  '/approvals': 'Approvals',
  '/accounts-payable': 'Accounts Payable',
  '/payments': 'Payments',
  '/vendor/dashboard': 'Vendor Dashboard',
  '/vendor/rfqs': 'My RFQs',
  // ... 20+ routes mapped
};
```

#### Usage

```tsx
import TopBar from '../components/layout/TopBar';

<TopBar onMenuClick={() => setMobileOpen(true)} />
```

---

### 12.12 AdminNotificationBell

**File:** `components/layout/AdminNotificationBell.tsx`  \
**CSS:** `components/layout/VendorNotificationBell.css` (shared)

Notification bell for internal (admin/procurement/finance) users. Fetches from `notificationService`, listens to SSE `'notification'` events.

#### Props

*(None — self-contained component with internal state)*

#### Internal State

| State | Type | Description |
|---|---|---|
| `notifications` | `NotificationRow[]` | Current notifications list |
| `unreadCount` | `number` | Unread count badge |
| `open` | `boolean` | Panel open/closed |
| `loading` | `boolean` | Loading state |
| `bouncing` | `boolean` | Bounce animation when new notification arrives |

#### Features

- **Real-time SSE**: Listens to `'notification'` event — triggers bounce animation + re-fetch
- **Polling fallback**: Re-fetches every 15 seconds
- **Enterprise delete-on-read**: When the bell is opened, all visible notifications are deleted from the backend after display
- **Smart routing**: Clicking a notification navigates to the relevant page:
  - Document/upload → `/onboarding/queue`
  - Quotation → `/quotations?rfq=...`
  - RFQ → `/rfq`
  - General → `/notifications`
- **Mark all read**: Bulk marks + clears unread count
- **Icon per type**: RFQ/quotation notifications get `ClipboardList` icon, others get `FileText`

#### Usage

```tsx
// TopBar renders it automatically based on role:
{isVendor(roles) ? <VendorNotificationBell /> : <AdminNotificationBell />}
```

---

### 12.13 VendorNotificationBell

**File:** `components/layout/VendorNotificationBell.tsx`  \
**CSS:** `components/layout/VendorNotificationBell.css`

Notification bell for vendor portal users. Fetches from `vendorPortalService`, listens to SSE `'vendor_notification'` and `'notification'` events.

#### Props

*(None — self-contained component with internal state)*

#### Features

- **SSE events**: Listens to both `'vendor_notification'` and `'notification'` channels
- **Polling fallback**: Every 15 seconds
- **Delete-on-read**: Same enterprise pattern as AdminNotificationBell
- **Click routing**: Navigates to `/vendor/rfqs?rfq=...` with RFQ ID from metadata, or `/vendor/rfqs`
- **Unread count**: Shows `9+` for counts > 9

#### Usage

```tsx
// TopBar renders automatically:
<VendorNotificationBell />
```

---

### 12.14 RFQDetailModal

**File:** `components/rfq/RFQDetailModal.tsx`

Feature-rich modal for viewing RFQ details. Supports three visual states (open, expanded, minimized), tabbed content panels, column customization on the items table, send/approve actions, and quotation comparison.

#### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `rfq` | `RFQTableRow \| null` | **(required)** | RFQ data to display; `null` hides the modal |
| `onClose` | `() => void` | **(required)** | Close modal callback |
| `loading` | `boolean` | `false` | Shows "Loading…" in footer when true |
| `enableSend` | `boolean` | `false` | Shows "Edit Draft" button for DRAFT status |
| `onSend` | `() => void \| Promise<void>` | — | Not currently wired (future use) |
| `sending` | `boolean` | `false` | Not currently wired |
| `sendError` | `string \| null` | `null` | Error message shown as `MessageStrip` |
| `sendSuccess` | `string \| null` | `null` | Success message shown as `MessageStrip` |
| `onDismissSendSuccess` | `() => void` | — | Clear success message |
| `onDismissSendError` | `() => void` | — | Clear error message |
| `onCompareQuotations` | `(rfqNumber: string) => void` | — | Override default quotation comparison navigation |

#### Window States

| State | CSS Class | Description |
|---|---|---|
| **Open** | `rfq-modal--open` | Default: centered modal with backdrop |
| **Expanded** | `rfq-modal--expanded` | Full-screen modal |
| **Minimized** | `rfq-modal--minimized` | Compact header-only bar at bottom |

#### Tab Panels

| Tab | Content |
|---|---|
| **Details** | Grid: Closing Date, Currency, Created On, Creator, Total Items, Vendors Invited, Quotations. Also shows Total Estimate. |
| **Items** | Sortable table with `ColumnCustomizer` support. Falls back to card layout on mobile. |
| **Vendors** | List of invited vendors with avatar, name, email, and performance score. |
| **Quotations** | Received quotations with price, status badge, lead time, payment terms. "Compare all suppliers" link. |

#### Usage

```tsx
import RFQDetailModal from '../components/rfq/RFQDetailModal';
import type { RFQTableRow } from '../types/viewModels';

function RFQListPage() {
  const [selectedRfq, setSelectedRfq] = useState<RFQTableRow | null>(null);

  return (
    <>
      <table>
        {rfqs.map((rfq) => (
          <tr key={rfq.id} onClick={() => setSelectedRfq(rfq)}>
            <td>{rfq.title}</td>
          </tr>
        ))}
      </table>

      <RFQDetailModal
        rfq={selectedRfq}
        onClose={() => setSelectedRfq(null)}
        enableSend={selectedRfq?.status === 'DRAFT'}
        sendError={null}
        sendSuccess={null}
      />
    </>
  );
}
```

---

---

## 13. Core Business Flow Diagrams (Frontend Perspective)

These diagrams show how the frontend pages connect to support the main business flows.

### RFQ Lifecycle (End-to-End)

```
                    ┌──────────────────────────────────────────────┐
                    │  RFQ LIST PAGE  (/rfq)                       │
                    │  Table with status filters & search          │
                    │  ┌────────────────────────────────────────┐  │
                    │  │ DRAFT  │ SENT  │ IN_PROGRESS  │ CLOSED │  │
                    │  └────────────────────────────────────────┘  │
                    └───────────────────┬──────────────────────────┘
                                        │
                    ┌───────────────────┴──────────────────────────┐
                    │                                              │
                    ▼                                              ▼
   ┌──────────────────────────────┐            ┌──────────────────────────────┐
   │ CREATE RFQ PAGE              │            │ RFQ DETAIL MODAL             │
   │ (/rfq/create)                │            │ (inline or dialog)           │
   │                               │            │                              │
   │ Steps:                        │            │ Shows:                       │
   │ 1. Title + description        │            │ • Items list + quantities    │
   │ 2. Line items (add/remove)    │            │ • Invited vendors + status   │
   │ 3. Select vendors from list   │            │ • Quotations received (cards)│
   │ 4. Set closing date, currency │            │ • Compare side-by-side       │
   │ 5. Save as DRAFT              │            │ • Select winning quote       │
   └──────────┬───────────────────┘            └──────────────┬───────────────┘
              │                                              │
              ▼                                              ▼
   ┌──────────────────────────────┐            ┌──────────────────────────────┐
   │ SEND RFQ (button action)     │            │ QUOTATIONS PAGE              │
   │ • Validates vendors added    │            │ (/quotations)                │
   │ • Emails dispatched:         │            │ • All submitted quotations   │
   │   - Existing: magic link     │            │ • Status tracking             │
   │   - New: accept/decline      │            │ • Approval actions            │
   │ • RFQ status → SENT          │            │   (approve/reject/return)     │
   └──────────────────────────────┘            └──────────────┬───────────────┘
                                                               │
                                                               ▼
                                                  ┌──────────────────────────────┐
                                                  │ APPROVALS PAGE               │
                                                  │ (/approvals)                 │
                                                  │ • Pending approvals inbox    │
                                                  │ • Multi-level chain view     │
                                                  │ • Approve / Reject / Return  │
                                                  └──────────────┬───────────────┘
                                                                 │
                                                                 ▼
                                                  ┌──────────────────────────────┐
                                                  │ PURCHASE ORDERS PAGE         │
                                                  │ (/purchase-orders)           │
                                                  │ • PO list with status         │
                                                  │ • Links to RFQ + vendor      │
                                                  └──────────────┬───────────────┘
                                                                 │
                                                                 ▼
                                                  ┌──────────────────────────────┐
                                                  │ ACCOUNTS PAYABLE PAGE        │
                                                  │ (/accounts-payable)          │
                                                  │ • Invoice list                │
                                                  │ • Three-way match status     │
                                                  │   (✓/✗ per PO/GRN/value)    │
                                                  └──────────────┬───────────────┘
                                                                 │
                                                                 ▼
                                                  ┌──────────────────────────────┐
                                                  │ PAYMENTS PAGE                │
                                                  │ (/payments)                  │
                                                  │ • Payment creation           │
                                                  │ • Status: PENDING→APPROVED   │
                                                  │   →PROCESSING→COMPLETED      │
                                                  └──────────────────────────────┘
```

### Vendor Onboarding Flow

```
       ┌─────────────────────────────────────────────────────────┐
       │ NEW ONBOARDING PAGE  (/onboarding/new)                  │
       │ Admin fills: company name, contact email,               │
       │ optional notes + item requirements                      │
       │ Sends invitation → Vendor created (Status: INVITED)    │
       └────────────────────┬────────────────────────────────────┘
                            │
                            │ VENDOR receives email with
                            │ Accept / Decline buttons
                            ▼
       ┌─────────────────────────────────────────────────────────┐
       │ VENDOR MAGIC LINK PAGE  (/auth/magic?token=xxx)         │
       │ OR the server renders a standalone HTML upload page     │
       │ (server-side, NOT the React app)                        │
       │ Vendor fills: company details, bank info, uploads docs │
       └────────────────────┬────────────────────────────────────┘
                            │
                            ▼
       ┌─────────────────────────────────────────────────────────┐
       │ ONBOARDING QUEUE PAGE  (/onboarding/queue)              │
       │ Admin reviews vendors in queue:                          │
       │ ┌──────────────┬───────────┬──────────┐                 │
       │ │ Pending      │ Approved  │ Rejected │  (filter tabs) │
       │ └──────────────┴───────────┴──────────┘                 │
       │ • View documents per vendor                              │
       │ • Verify individual documents (✓)                        │
       │ • Reject documents with reason (✗ + comment)             │
       │ • Approve vendor → Sends password setup email            │
       │ • Reject vendor → Sends rejection + resubmit link        │
       └────────────────────┬────────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│ SET PASSWORD PAGE         │    │ Vendor re-uploads            │
│ (/set-password?token=xxx) │    │ corrected documents          │
│                           │    │ (back to PENDING_APPROVAL)   │
│ • Validates token         │    └──────────────────────────────┘
│ • Vendor sets password    │
│ • Auto-login on success   │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│ VENDOR PORTAL ACCESS GRANTED                                  │
│                                                               │
│ VENDOR DASHBOARD  (/vendor/dashboard)                         │
│  • KPIs, recent RFQs, quick actions                           │
│                                                               │
│ VENDOR RFQS PAGE  (/vendor/rfqs)                              │
│  • RFQ invitations, respond with quotation                    │
│                                                               │
│ VENDOR QUOTATIONS PAGE  (/vendor/quotations)                  │
│  • Submitted quotes, status tracking                          │
│                                                               │
│ VENDOR ORDERS PAGE  (/vendor/orders)                          │
│  • Purchase Orders from ERP sync                              │
│                                                               │
│ VENDOR INVOICES PAGE  (/vendor/invoices)                      │
│  • Invoice list from ERP sync                                 │
│                                                               │
│ VENDOR PROFILE PAGE  (/vendor/profile)                        │
│  • Company details, banking, documents, performance           │
└──────────────────────────────────────────────────────────────┘
```

### Approval Workflow Chain

```
     ┌────────────────────────────────────────────────────────────┐
     │ APPROVAL LEVELS PAGE  (/admin/approval-levels)             │
     │ Admin configures chains per module:                        │
     │                                                            │
     │  Module: Quotations                                        │
     │  ┌───────┬──────────────┬──────────┬──────────────────┐   │
     │  │ Level │ Role         │ Time     │ Value Range      │   │
     │  ├───────┼──────────────┼──────────┼──────────────────┤   │
     │  │   1   │ Clerk        │  24h     │ Any              │   │
     │  │   2   │ Manager      │  24h     │ ₹5,000+          │   │
     │  │   3   │ Director     │  48h     │ ₹50,000+         │   │
     │  │   4   │ VP           │  48h     │ ₹500,000+        │   │
     │  └───────┴──────────────┴──────────┴──────────────────┘   │
     └──────────────────────┬─────────────────────────────────────┘
                            │
                            │ When a quotation is submitted:
                            ▼
     ┌────────────────────────────────────────────────────────────┐
     │ QUOTATIONS PAGE  (/quotations)                             │
     │                                                             │
     │  ┌──────────────────────────────────────────────────────┐  │
     │  │ Quotation #123 - Acme Corp - ₹10,000                  │  │
     │  │ Status: UNDER_REVIEW  │  Level 1/2                    │  │
     │  │ [Approve] [Reject] [Return]                           │  │
     │  │ Deadline: 24h remaining                               │  │
     │  └──────────────────────────────────────────────────────┘  │
     └──────────────────────┬─────────────────────────────────────┘
                            │
                            │ User clicks Approve →
                            ▼
     ┌────────────────────────────────────────────────────────────┐
     │ REAL-TIME SSE UPDATE                                       │
     │ sseClient receives 'approval_level_complete'               │
     │ • Current user's page stays at ACCEPTED state              │
     │ • Next-level approver's page refreshes with new PENDING    │
     │ • Notification bell updates count                          │
     └──────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
     ┌────────────────────────────────────────────────────────────┐
     │ APPROVALS PAGE  (/approvals)                               │
     │ Multi-level chain visualization:                           │
     │                                                             │
     │  Quotation #123  ───  RFQ-20260619-1234  ───  Acme Corp   │
     │                                                             │
     │  [Level 1: Clerk]  ──APPROVED──►  [Level 2: Manager]       │
     │        ✓ Approved by John                      PENDING     │
     │        at 2026-06-19 10:30            ⏰ Deadline: 24h     │
     │                                                             │
     │  Actions: [Approve] [Reject] [Return with comment]         │
     └──────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
   ┌──────────────────┐          ┌──────────────────┐
   │ APPROVED         │          │ REJECTED         │
   │ • All levels done│          │ • Chain stops    │
   │ • Chain complete │          │ • Quotation→     │
   │ • Quotation→     │          │   REJECTED       │
   │   ACCEPTED       │          │ • Vendor notified│
   │ • Winning vendor │          └──────────────────┘
   │   email sent     │
   │ • Other vendors  │
   │   notified       │
   └──────────────────┘
```

---

## 13. Key Pages & Features

### Auth Pages

| Page | Route | Description |
|---|---|---|
| `LoginPage` | `/login` | Internal user login |
| `VendorLoginPage` | `/vendor/login` | Vendor email/password login |
| `VendorMagicLinkPage` | `/auth/magic` | Auto-login from email magic link |
| `SetPasswordPage` | `/set-password` | Vendor first-time password setup |

### Dashboard (/dashboard)

Modular widget-based layout:

| Widget | Data Source |
|---|---|
| `KpiStatsWidget` | `dashboardService.getKpis()` |
| `ProcurementPipelineWidget` | `dashboardService.getPipeline()` |
| `RecentRfqsWidget` | `dashboardService.getRecentRfqs()` |
| `ActivityTimelineWidget` | `dashboardService.getActivity()` |
| `TopVendorsWidget` | `dashboardService.getTopVendors()` |
| `PendingApprovalsWidget` | `dashboardService.getMyTasks()` |
| `SpendOverviewWidget` | `dashboardService.getSpendOverview()` |
| `QuickActionsWidget` | Static shortcut buttons |

### RFQ Management (/rfq, /rfq/create, /rfq/edit/:id)

- List table with status filters and search
- Create wizard: title/details -> line items -> vendor selection
- Send RFQ (emails dispatched to vendors)
- View quotations, compare side-by-side, select winning quote

### Vendor Directory (/vendors)

- Searchable table with performance scores
- CRUD with cascade protection
- CSV bulk import
- Password setup resend

### Approvals (/approvals)

- Approval inbox with multi-level chain visualization
- Actions: Approve, Reject, Return with comment

### Vendor Portal Pages

| Page | Route | Description |
|---|---|---|
| `VendorDashboard` | `/vendor/dashboard` | KPIs, recent RFQs, quick-actions |
| `VendorRFQsPage` | `/vendor/rfqs` | RFQ invitations and submission status |
| `VendorQuotationsPage` | `/vendor/quotations` | Submitted quotations |
| `VendorOrdersPage` | `/vendor/orders` | Purchase Orders (from ERP) |
| `VendorInvoicesPage` | `/vendor/invoices` | Invoices (from ERP) |
| `VendorProfilePage` | `/vendor/profile` | Profile, banking, documents, performance |

### Admin Pages

| Page | Route | Description |
|---|---|---|
| `UsersPage` | `/admin/users` | User CRUD |
| `RolesPermissionsPage` | `/admin/roles-permissions` | Role management + permission matrix |
| `ApprovalLevelsPage` | `/admin/approval-levels` | Multi-level approval chain setup |
| `CompanySettingsPage` | `/admin/company-settings` | Company profile, **branding/white-label**, required docs, email templates, departments, categories, units, positions, payment terms |

---

## 13. Theme System

### Dark/Light Mode

- `ThemeContext` manages `light`/`dark` state
- Preference stored in `localStorage` key `heliflow_theme`
- Falls back to system preference (`prefers-color-scheme`)
- Theme applied to `<html>` as `data-theme` attribute
- All CSS uses CSS custom properties that change with the theme

```typescript
const { theme, toggleTheme, setTheme, isDark } = useTheme();
```

### White-Label Branding (overrides theme colors)

The **BrandingContext** (`context/BrandingContext.tsx`) dynamically overrides the primary color palette:

1. Admin sets a **Primary Color** hex value in **Company Settings → Branding** tab
2. `BrandingProvider` loads the profile on mount and generates the full `--primary-50` through `--primary-700` palette using color mixing (blend with white for lighter shades, black for darker shades)
3. Applied to `document.documentElement.style` via CSS custom properties — overrides the static `index.css` values
4. Also updates:
   - **Favicon**: `<link rel="icon">` href updated
   - **Document title**: `document.title` set to company name
   - **Login page**: Dynamic logo, company name, subtitle text, footer
   - **Sidebar**: Dynamic logo + company name in header

**If branding fails to load**: Falls back gracefully to default colors (`#0a6ed1`) and title (`"Heliflow"`).

---

## 14. Type System

### Core Types (types/index.ts)

| Interface | Purpose |
|---|---|
| `User` | Authenticated user |
| `Role` | Role definition |
| `Permission` | Module permission |
| `UserModulePermission` | User's module-level permission |
| `AuthResponse` | Login/register response |
| `RFQ`, `RFQItem`, `RFQVendor` | RFQ and related entities |
| `Quotation`, `QuotationItem`, `QuotationAttachment` | Quotation data |
| `Vendor`, `VendorPerformance` | Vendor and performance data |
| `PurchaseOrder` | Purchase order |
| `ApprovalLevel`, `RequestApproval` | Approval chain data |
| `Notification` | Notifications |
| `AuditTrail` | Audit log entries |

### ViewModels (types/viewModels.ts)

| ViewModel | Used In |
|---|---|
| `RFQTableRow` | RFQ list table |
| `RFQQuotationSummary` | RFQ detail quotation cards |
| `VendorTableRow` | Vendor directory table |
| `ApprovalTableRow` | Approval inbox |
| `NotificationRow` | Notification list |
| `KpiItem` | Dashboard KPI cards |
| `DashboardPipelineItem` | Pipeline bar chart |
| `DashboardRecentRfq` | Recent RFQ card |

### RFQ Status Mapping (Backend -> UI)

```
DRAFT              -> DRAFT
SENT               -> SENT
QUOTATIONS_RECEIVED -> IN_PROGRESS
UNDER_EVALUATION   -> IN_PROGRESS
PO_CREATED         -> CLOSED
CLOSED             -> CLOSED
CANCELLED          -> CANCELLED
```

---

## 15. Development Setup

```bash
cd Heliflow_Client_Frontend
npm install
npm run dev    # Start Vite dev server (default: http://localhost:5173)
```

### Commands

```bash
npm run dev         # Start Vite dev server (hot reload)
npm run build       # TypeScript type-check + Vite production build
npm run preview     # Preview production build
npm run lint        # ESLint check
npm test            # Run Vitest tests
npm run test:watch  # Watch mode tests
```

### Environment Variables

```env
VITE_API_URL=http://localhost:3000/api
VITE_USE_MOCK=false
VITE_API_CACHE_TTL_MS=120000
VITE_API_TIMEOUT_MS=30000
```

All have sensible defaults in the code, so `.env` is optional.

---

## 16. Common Patterns & Best Practices

### Adding a New Page

1. Create page component in `src/pages/{section}/{PageName}.tsx`
2. Add CSS file `{PageName}.css` next to the component
3. Add lazy import in `App.tsx`
4. Add route in the appropriate `<Route>` section
5. Add navigation menu item in `utils/rbac.ts`
6. Add route permission rule in `config/permissionRouting.ts`
7. Add page title in `TopBar.tsx`
8. Create service methods in `services/*.ts`
9. Export service from `src/services/index.ts`

### Adding a New Service

```typescript
// services/myEntityService.ts
import { USE_MOCK } from '../config/mock';
import { apiRequest } from '../api/client';

async function mockList(): Promise<MyType[]> { ... }
async function apiList(): Promise<MyType[]> {
  const data = await apiRequest<{ items: MyType[] }>('/my-entities');
  return data.items || [];
}

export const myEntityService = {
  list: USE_MOCK ? mockList : apiList,
};
```

### Data Mapping Pattern

Always use the mapper pattern to transform API data -> UI ViewModels:

```typescript
const rows = rawApiData.map(mapApiRfqToTableRow);
// Then pass `rows` to the table component
```

### Error Handling

- API errors throw `ApiError` with `code` and `status`
- `useServiceData` catches errors and exposes as `error: string | null`
- Components show errors via `MessageStrip` or inline error states
- Network errors show: "Cannot reach backend at {API_BASE}"
- Timeout errors show: "Request timed out after {timeoutMs}ms"

### CSS Conventions

- **BEM-inspired naming**: `.block__element--modifier`
- **One CSS file per component/page**
- **CSS variables** for theming (defined in `index.css`)
- **No CSS-in-JS, no Tailwind** - plain CSS imports
- **Lucide React** for all icons

### Key Imports

```typescript
import { useAuth } from '../context/AuthContext';
import { useRoleAccess } from '../hooks/useRoleAccess';
import { useBranding } from '../context/BrandingContext';
import { isVendor } from '../utils/rbac';
import { useServiceData } from '../hooks/useServiceData';
import { rfqService } from '../services';
import { FileText, Users } from 'lucide-react';
import { MessageStrip } from '../components/shared/MessageStrip';
```

### File/Folder Naming

- Components: `PascalCase.tsx` (e.g., `TopBar.tsx`)
- Pages: `PascalCase.tsx` (e.g., `DashboardPage.tsx`)
- Services: `camelCase.ts` (e.g., `rfqService.ts`)
- Hooks: `usePrefix.ts` (e.g., `useServiceData.ts`)
- CSS: Same name as component: `TopBar.css`
- Types: `PascalCase` (e.g., `RFQTableRow`)
