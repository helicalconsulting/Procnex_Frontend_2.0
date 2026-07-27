import { ADMIN_ACCESS_ROLES } from './utils/rbac';
import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/ThemeContext";
import { BrandingProvider } from "./context/BrandingContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CurrencyProvider } from "./components/shared/CurrencyMaster";
import { ProtectedRoute } from "./router/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import { PermissionGate } from "./router/PermissionGate";

const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const VendorLoginPage = lazy(() => import("./pages/auth/VendorLoginPage"));
const SetPasswordPage = lazy(() => import("./pages/auth/SetPasswordPage"));
const VendorMagicLinkPage = lazy(
  () => import("./pages/auth/VendorMagicLinkPage"),
);
const MyProfilePage = lazy(() => import("./pages/profile/MyProfilePage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const RFQPage = lazy(() => import("./pages/rfq/RFQPage"));
const CreateRFQPage = lazy(() => import("./pages/rfq/CreateRFQPage"));
const QuotationsPage = lazy(() => import("./pages/quotations/QuotationsPage"));
const UsersPage = lazy(() => import("./pages/admin/UsersPage"));
const RolesPermissionsPage = lazy(
  () => import("./pages/admin/RolesPermissionsPage"),
);
const ApprovalsPage = lazy(() => import("./pages/approvals/ApprovalsPage"));
const ApprovalLevelsPage = lazy(
  () => import("./pages/admin/ApprovalLevelsPage"),
);
const VendorsPage = lazy(() => import("./pages/vendors/VendorsPage"));
const DocumentsPage = lazy(() => import("./pages/documents/DocumentsPage"));
const NotificationsPage = lazy(
  () => import("./pages/notifications/NotificationsPage"),
);
const AuditTrailPage = lazy(() => import("./pages/audit/AuditTrailPage"));
const VendorDashboard = lazy(() => import("./pages/vendor/VendorDashboard"));
const VendorRFQsPage = lazy(() => import("./pages/vendor/VendorRFQsPage"));
const VendorQuotationsPage = lazy(
  () => import("./pages/vendor/VendorQuotationsPage"),
);
const VendorOrdersPage = lazy(() => import("./pages/vendor/VendorOrdersPage"));
const VendorInvoicesPage = lazy(
  () => import("./pages/vendor/VendorInvoicesPage"),
);
const VendorProfilePage = lazy(
  () => import("./pages/vendor/VendorProfilePage"),
);
const VendorContractsPage = lazy(() => import("./pages/vendor/VendorContractsPage"));
const VendorContractDetailPage = lazy(() => import("./pages/vendor/VendorContractDetailPage"));
const VendorAgreementsPage = lazy(() => import("./pages/vendor/VendorAgreementsPage"));
const AccountsPayablePage = lazy(
  () => import("./pages/accounts-payable/AccountsPayablePage"),
);
const PaymentsPage = lazy(() => import("./pages/payments/PaymentsPage"));
const NewOnboardingPage = lazy(
  () => import("./pages/onboarding/NewOnboardingPage"),
);
const OnboardingQueuePage = lazy(
  () => import("./pages/onboarding/OnboardingQueuePage"),
);
const SalesOrdersPage = lazy(
  () => import("./pages/sales-orders/SalesOrdersPage"),
);
const SignaturePage = lazy(() => import("./pages/signature/SignaturePage"));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage"));
const CompanySettingsPage = lazy(
  () => import("./pages/admin/CompanySettingsPage"),
);
const ContractsPage = lazy(() => import("./pages/contracts/ContractsPage"));
const ContractDetailPage = lazy(() => import("./pages/contracts/ContractDetailPage"));
const CreateContractPage = lazy(() => import("./pages/contracts/CreateContractPage"));
const PurchaseRequisitionPage = lazy(() => import("./pages/purchase-requisitions/PurchaseRequisitionPage"));
const PurchaseRequisitionsListPage = lazy(() => import("./pages/purchase-requisitions/PurchaseRequisitionsListPage"));

function CurrencyProviderWithAuth({ children }: { children: React.ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

function RouteFallback() {
  return <div className="route-fallback" aria-label="Loading page" />;
}

function page(Component: ComponentType) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Component />
    </Suspense>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Disabled to prevent bursts of 5+ requests when switching tabs back.
      // Each page already fetches data on mount with a 5-min stale time,
      // and SSE keeps real-time data fresh.
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrandingProvider>
        <BrowserRouter>
          <AuthProvider>
            <CurrencyProviderWithAuth>
            <Routes>
            {/* Public */}
            <Route path="/login" element={page(LoginPage)} />
            <Route path="/vendor/login" element={page(VendorLoginPage)} />
            <Route path="/set-password" element={page(SetPasswordPage)} />
            <Route path="/auth/magic" element={page(VendorMagicLinkPage)} />

            {/* Vendor Portal Routes */}
            <Route element={<ProtectedRoute requireVendor />}>
              <Route element={<AppLayout />}>
                <Route
                  path="/vendor/dashboard"
                  element={page(VendorDashboard)}
                />
                <Route path="/vendor/rfqs" element={page(VendorRFQsPage)} />
                <Route
                  path="/vendor/quotations"
                  element={page(VendorQuotationsPage)}
                />
                <Route path="/vendor/orders" element={page(VendorOrdersPage)} />
                <Route
                  path="/vendor/invoices"
                  element={page(VendorInvoicesPage)}
                />
                <Route
                  path="/vendor/profile"
                  element={page(VendorProfilePage)}
                />
                <Route
                  path="/vendor/contracts"
                  element={page(VendorContractsPage)}
                />
                <Route
                  path="/vendor/contracts/:id"
                  element={page(VendorContractDetailPage)}
                />
                <Route
                  path="/vendor/agreements"
                  element={page(VendorAgreementsPage)}
                />
              </Route>
            </Route>

            {/* Protected — wrapped in AppLayout (Sidebar + TopBar) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/profile" element={page(MyProfilePage)} />
                <Route element={<PermissionGate />}>
                  <Route path="/dashboard" element={page(DashboardPage)} />
                  <Route path="/rfq" element={page(RFQPage)} />
                  <Route path="/rfq/create" element={page(CreateRFQPage)} />
                  <Route path="/rfq/edit/:id" element={page(CreateRFQPage)} />
                  <Route path="/quotations" element={page(QuotationsPage)} />
                  <Route path="/admin/users" element={page(UsersPage)} />
                  <Route
                    path="/admin/roles-permissions"
                    element={page(RolesPermissionsPage)}
                  />
                  <Route
                    path="/admin/approval-levels"
                    element={page(ApprovalLevelsPage)}
                  />
                  <Route path="/approvals" element={page(ApprovalsPage)} />
                  <Route
                    path="/accounts-payable"
                    element={page(AccountsPayablePage)}
                  />
                  <Route path="/payments" element={page(PaymentsPage)} />
                  <Route path="/sales-orders" element={page(SalesOrdersPage)} />
                  <Route path="/vendors" element={page(VendorsPage)} />
                  <Route
                    path="/onboarding/new"
                    element={page(NewOnboardingPage)}
                  />
                  <Route element={<ProtectedRoute allowedRoles={[...ADMIN_ACCESS_ROLES]} />}>
  <Route path="/onboarding/queue" element={<OnboardingQueuePage />} />
</Route>
                  <Route path="/signature" element={page(SignaturePage)} />
                  <Route path="/reports" element={page(ReportsPage)} />
                  <Route
                    path="/admin/company-settings"
                    element={page(CompanySettingsPage)}
                  />
                  <Route path="/documents" element={page(DocumentsPage)} />
                  <Route
                    path="/notifications"
                    element={page(NotificationsPage)}
                  />
                  <Route path="/contracts" element={page(ContractsPage)} />
                  <Route path="/contracts/:id" element={page(ContractDetailPage)} />
                  <Route path="/contracts/new" element={page(CreateContractPage)} />
                  <Route path="/contracts/:id/edit" element={page(ContractDetailPage)} />
                  <Route path="/procurement/purchase-requisitions" element={page(PurchaseRequisitionsListPage)} />
                  <Route path="/procurement/purchase-requisition/:rfqId" element={page(PurchaseRequisitionPage)} />
                  <Route path="/audit" element={page(AuditTrailPage)} />
                </Route>
              </Route>
            </Route>

            {/* Catch-all → redirect to dashboard (which guards itself) */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </CurrencyProviderWithAuth>
          </AuthProvider>
        </BrowserRouter>
        </BrandingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
