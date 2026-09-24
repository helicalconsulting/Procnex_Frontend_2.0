import { ADMIN_ACCESS_ROLES } from './utils/rbac';
import { lazy, Suspense, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/ThemeContext";
import { BrandingProvider } from "./context/BrandingContext";
import { LanguageProvider } from "./context/LanguageContext";
import { AuthProvider } from "./context/AuthContext";
import { CurrencyProvider } from "./components/shared/CurrencyMaster";
import { ProtectedRoute } from "./router/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import { PermissionGate } from "./router/PermissionGate";

const HelicalConsultingPage = lazy(() => import("./pages/auth/HelicalConsultingPage"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const VendorLoginPage = lazy(() => import("./pages/auth/VendorLoginPage"));
const BrandedVendorLoginPage = lazy(() => import("./pages/vendor/BrandedVendorLoginPage"));
const SetPasswordPage = lazy(() => import("./pages/auth/SetPasswordPage"));
const VendorMagicLinkPage = lazy(
  () => import("./pages/auth/VendorMagicLinkPage"),
);
const MyProfilePage = lazy(() => import("./pages/profile/MyProfilePage"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const RFQPage = lazy(() => import("./pages/rfq/RFQPage"));
const CreateRFQPage = lazy(() => import("./pages/rfq/CreateRFQPage"));
const RFQViewPage = lazy(() => import("./pages/rfq/RFQViewPage"));
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
const VendorCreateInvoicePage = lazy(
  () => import("./pages/vendor/VendorCreateInvoicePage"),
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
const CreatePurchaseInvoicePage = lazy(
  () => import("./pages/invoices/CreatePurchaseInvoicePage"),
);
const CreatePaymentVoucherPage = lazy(
  () => import("./pages/payments/CreatePaymentVoucherPage"),
);
const CreateGRNPage = lazy(() => import("./pages/grn/CreateGRNPage"));
const GRNListPage = lazy(() => import("./pages/grn/GRNListPage"));
const CompanyGRNListPage = lazy(() => import("./pages/grn/CompanyGRNListPage"));
const PaymentsPage = lazy(() => import("./pages/payments/PaymentsPage"));
const NewOnboardingPage = lazy(
  () => import("./pages/onboarding/NewOnboardingPage"),
);
const OnboardingQueuePage = lazy(
  () => import("./pages/onboarding/OnboardingQueuePage"),
);
const SignaturePage = lazy(() => import("./pages/signature/SignaturePage"));
const ReportsPage = lazy(() => import("./pages/reports/ReportsPage"));
const CompanySettingsPage = lazy(
  () => import("./pages/admin/CompanySettingsPage"),
);
const CustomFormBuilderPage = lazy(
  () => import("./pages/admin/CustomFormBuilderPage"),
);
const FormResponsesPage = lazy(
  () => import("./pages/admin/FormResponsesPage"),
);
const FormsPage = lazy(() => import("./pages/forms/FormsPage"));
const ContractsPage = lazy(() => import("./pages/contracts/ContractsPage"));
const ContractDetailPage = lazy(() => import("./pages/contracts/ContractDetailPage"));
const CreateContractPage = lazy(() => import("./pages/contracts/CreateContractPage"));
const PurchaseRequisitionPage = lazy(() => import("./pages/purchase-requisitions/PurchaseRequisitionPage"));
const PurchaseRequisitionsListPage = lazy(() => import("./pages/purchase-requisitions/PurchaseRequisitionsListPage"));
const PurchaseOrdersPage = lazy(() => import("./pages/purchase-orders/PurchaseOrdersPage"));
const CreatePurchaseOrderPage = lazy(() => import("./pages/purchase-orders/CreatePurchaseOrderPage"));

import ErrorBoundary from "./components/shared/ErrorBoundary";

function CurrencyProviderWithAuth({ children }: { children: React.ReactNode }) {
  return <CurrencyProvider>{children}</CurrencyProvider>;
}

function RouteFallback() {
  return <div className="route-fallback" aria-label="Loading page" />;
}

function page(Component: ComponentType) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

import { AppMotionProvider } from './components/motion/AppMotionProvider';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppMotionProvider>
          <BrandingProvider>
            <LanguageProvider>
            <BrowserRouter>
              <AuthProvider>
                <CurrencyProviderWithAuth>
                  <Routes>
                    {/* Public */}
                    <Route path="/helicalconsulting" element={page(HelicalConsultingPage)} />
                    <Route path="/login" element={page(LoginPage)} />
                    <Route path="/vendor/login" element={<Navigate to="/login" replace />} />
                    <Route path="/v/:companyCode/login" element={page(BrandedVendorLoginPage)} />
                    <Route path="/set-password" element={page(SetPasswordPage)} />
                    <Route path="/v/:companyCode/set-password" element={page(SetPasswordPage)} />
                    <Route path="/auth/magic" element={page(VendorMagicLinkPage)} />

                    {/* Vendor Portal Routes — Multi-Tenant Isolated */}
                    <Route element={<ProtectedRoute requireVendor />}>
                      <Route element={<AppLayout />}>
                        {/* Company Code Prefix Routes (/v/:companyCode/*) */}
                        <Route path="/v/:companyCode/dashboard" element={page(VendorDashboard)} />
                        <Route path="/v/:companyCode/rfqs" element={page(VendorRFQsPage)} />
                        <Route path="/v/:companyCode/quotations" element={page(VendorQuotationsPage)} />
                        <Route path="/v/:companyCode/orders" element={page(VendorOrdersPage)} />
                        <Route path="/v/:companyCode/invoices" element={page(VendorInvoicesPage)} />
                        <Route path="/v/:companyCode/create-invoice" element={page(VendorCreateInvoicePage)} />
                        <Route path="/v/:companyCode/profile" element={page(VendorProfilePage)} />
                        <Route path="/v/:companyCode/contracts" element={page(VendorContractsPage)} />
                        <Route path="/v/:companyCode/contracts/:id" element={page(VendorContractDetailPage)} />
                        <Route path="/v/:companyCode/agreements" element={page(VendorAgreementsPage)} />

                        {/* Unscoped Vendor Routes (/vendor/*) */}
                        <Route path="/vendor/dashboard" element={page(VendorDashboard)} />
                        <Route path="/vendor/rfqs" element={page(VendorRFQsPage)} />
                        <Route path="/vendor/quotations" element={page(VendorQuotationsPage)} />
                        <Route path="/vendor/orders" element={page(VendorOrdersPage)} />
                        <Route path="/vendor/invoices" element={page(VendorInvoicesPage)} />
                        <Route path="/vendor/create-invoice" element={page(VendorCreateInvoicePage)} />
                        <Route path="/vendor/profile" element={page(VendorProfilePage)} />
                        <Route path="/vendor/contracts" element={page(VendorContractsPage)} />
                        <Route path="/vendor/contracts/:id" element={page(VendorContractDetailPage)} />
                        <Route path="/vendor/agreements" element={page(VendorAgreementsPage)} />
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
                          <Route path="/rfq/:id" element={page(RFQViewPage)} />
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
                          <Route
                            path="/procurement/create-purchase-invoice"
                            element={page(CreatePurchaseInvoicePage)}
                          />
                          <Route
                            path="/procurement/create-payment-voucher"
                            element={page(CreatePaymentVoucherPage)}
                          />
                          <Route
                            path="/procurement/create-purchase-order"
                            element={page(CreatePurchaseOrderPage)}
                          />
                          <Route
                            path="/procurement/grns"
                            element={page(GRNListPage)}
                          />
                          <Route
                            path="/procurement/goods-receipt"
                            element={page(CompanyGRNListPage)}
                          />
                          <Route
                            path="/procurement/create-company-grn"
                            element={page(CreateGRNPage)}
                          />
                          <Route
                            path="/procurement/create-grn"
                            element={page(CreateGRNPage)}
                          />
                          <Route
                            path="/grn/create"
                            element={page(CreateGRNPage)}
                          />
                          <Route
                            path="/invoices/create"
                            element={page(CreatePurchaseInvoicePage)}
                          />
                          <Route
                            path="/payments/create-voucher"
                            element={page(CreatePaymentVoucherPage)}
                          />
                          <Route path="/payments" element={page(PaymentsPage)} />
                          <Route path="/sales-orders" element={<Navigate to="/dashboard" replace />} />
                          <Route path="/vendors" element={page(VendorsPage)} />
                          <Route
                            path="/onboarding/new"
                            element={page(NewOnboardingPage)}
                          />
                          <Route path="/onboarding/queue" element={page(OnboardingQueuePage)} />
                          <Route path="/signature" element={page(SignaturePage)} />
                          <Route path="/reports" element={page(ReportsPage)} />
                          <Route
                            path="/admin/company-settings"
                            element={page(CompanySettingsPage)}
                          />
                          <Route
                            path="/admin/custom-form-builder"
                            element={page(CustomFormBuilderPage)}
                          />
                          <Route
                            path="/admin/form-responses"
                            element={page(FormResponsesPage)}
                          />
                          <Route path="/forms" element={page(FormsPage)} />
                          <Route path="/documents" element={page(DocumentsPage)} />
                          <Route
                            path="/notifications"
                            element={page(NotificationsPage)}
                          />
                          <Route path="/contracts" element={page(ContractsPage)} />
                          <Route path="/contracts/new" element={page(CreateContractPage)} />
                          <Route path="/contracts/create" element={page(CreateContractPage)} />
                          <Route path="/contracts/:id" element={page(ContractDetailPage)} />
                          <Route path="/contracts/:id/edit" element={page(ContractDetailPage)} />
                          <Route path="/purchase-orders" element={page(PurchaseOrdersPage)} />
                          <Route path="/purchase-orders/new" element={page(CreatePurchaseOrderPage)} />
                          <Route path="/procurement/create-purchase-order" element={page(CreatePurchaseOrderPage)} />
                          <Route path="/procurement/purchase-requisitions" element={page(PurchaseRequisitionsListPage)} />
                          <Route path="/procurement/purchase-requisition/:rfqId" element={page(PurchaseRequisitionPage)} />
                          <Route path="/audit" element={page(AuditTrailPage)} />
                        </Route>
                      </Route>
                    </Route>

                    {/* Catch-all → redirect to dashboard */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </CurrencyProviderWithAuth>
              </AuthProvider>
            </BrowserRouter>
          </LanguageProvider>
        </BrandingProvider>
      </AppMotionProvider>
    </ThemeProvider>
    </QueryClientProvider>
  );
}
