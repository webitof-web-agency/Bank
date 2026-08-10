import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { FYProvider } from './context/FYContext';
import { ProtectedRoute } from './components/guards/ProtectedRoute';
import { PermissionRoute } from './components/guards/PermissionRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { EmployeesPage } from './pages/master/employees';
import { EmployeeDetailPage } from './pages/master/employees/detail';
import { EmployeeFormPage } from './pages/master/employees/EmployeeFormPage';
import { RolesPage } from './pages/roles/RolesPage';
import { RoleFormPage } from './pages/roles/RoleFormPage';
import { FilesPage } from './pages/files/FilesPage';
import { MasterHomePage } from './pages/master';
import { BranchesPage } from './pages/master/branches';
import { BranchDetailPage } from './pages/master/branches/detail';
import { ManagerMasterPage } from './pages/master/ManagerMasterPage';
import { MembersPage } from './pages/master/members';
import { MemberDetailPage } from './pages/master/members/detail';
import { MemberFormPage } from './pages/master/members/MemberFormPage';
import { CommitteePage } from './pages/master/committee';
import { LedgersPage } from './pages/master/ledgers';
import { LedgerDetailPage } from './pages/master/ledgers/detail';
import { RatesPage } from './pages/master/rates';
import { RateDetailPage } from './pages/master/rates/detail';
import { BankAccountsPage } from './pages/master/bank-accounts';
import { BankAccountDetailPage } from './pages/master/bank-accounts/detail';
import { DemandsPage } from './pages/master/demands';
import { DemandDetailPage } from './pages/master/demands/detail';
import { NoInterestMembersPage } from './pages/master/no-interest-members';
import { NoInterestMemberDetailPage } from './pages/master/no-interest-members/detail';
import { SettingsHomePage } from './pages/settings/SettingsHomePage';
import { BusinessIdentityPage } from './pages/settings/BusinessIdentityPage';
import { SocietyDetailsPage } from './pages/settings/SocietyDetailsPage';
import { ChangePasswordPage } from './pages/settings/ChangePasswordPage';
import { UserRightsPage } from './pages/settings/UserRightsPage';
import { BackupRestorePage } from './pages/settings/BackupRestorePage';
import { FinancialYearClosingPage } from './pages/settings/FinancialYearClosingPage';
import { BrandingPage } from './pages/settings/BrandingPage';
import { UiSettingsPage } from './pages/settings/UiSettingsPage';
import { SmtpEmailPage } from './pages/settings/SmtpEmailPage';
import { NotificationSettingsPage } from './pages/settings/notifications';
import { TransactionsHomePage } from './pages/transactions';
import { MemberTransactionsPage } from './pages/transactions/member';
import { MemberTransactionDetailPage } from './pages/transactions/member/detail';
import { BankTransactionsPage } from './pages/transactions/bank';
import { BankTransactionDetailPage } from './pages/transactions/bank/detail';
import { EmployeeTransactionsPage } from './pages/transactions/employee';
import { EmployeeTransactionDetailPage } from './pages/transactions/employee/detail';
import { TransferVoucherTransactionsPage } from './pages/transactions/transfer-voucher';
import { TransferVoucherTransactionDetailPage } from './pages/transactions/transfer-voucher/detail';
import { ReceiptInterestTransactionsPage } from './pages/transactions/receipt-interest';
import { ReceiptInterestTransactionDetailPage } from './pages/transactions/receipt-interest/detail';
import { SupportingTransactionsPage } from './pages/transactions/supporting';
import { SupportingTransactionDetailPage } from './pages/transactions/supporting/detail';
import { ReportsHomePage } from './pages/reports';
import { ReportViewerPage } from './pages/reports/ReportViewerPage';
import ProfilePage from './pages/profile/ProfilePage';
import { NotificationsPage } from './pages/notifications';
import { NotificationDetailPage } from './pages/notifications/detail';
import { CalendarPage } from './pages/calendar';
import { NotFoundPage } from './pages/system/NotFoundPage';
import { AccessDeniedPage } from './pages/system/AccessDeniedPage';

function readCachedAppName() {
  if (typeof window === 'undefined') return 'Bank';

  try {
    const cache = window.localStorage.getItem('bank_branding_cache');
    if (!cache) return 'Bank';

    const branding = JSON.parse(cache);
    return branding?.appName || 'Bank';
  } catch {
    return 'Bank';
  }
}

function LegacyEmployeeRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/app/master/employees/${id}` : '/app/master/employees'} replace />;
}

function LegacySettingsRedirect() {
  return <Navigate to="/app/settings/overview" replace />;
}

function TitleUpdater() {
  const location = useLocation();

  useEffect(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const label = segments.includes('notifications')
      ? 'Notifications'
      : segments[segments.length - 1]
        ? segments[segments.length - 1].replace(/-/g, ' ')
        : 'Dashboard';
    const appName = readCachedAppName();
    document.title = `${label.charAt(0).toUpperCase() + label.slice(1)} - ${appName}`;
  }, [location.pathname]);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <PermissionRoute permission="dashboard.read">
              <DashboardPage />
            </PermissionRoute>
          }
        />
        <Route
          path="files"
          element={
            <PermissionRoute permission="files.read">
              <FilesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="employees"
          element={
            <PermissionRoute permission={['employees.read', 'users.manage']}>
              <LegacyEmployeeRedirect />
            </PermissionRoute>
          }
        />
        <Route
          path="employees/:id"
          element={
            <PermissionRoute permission={['employees.read', 'users.manage']}>
              <LegacyEmployeeRedirect />
            </PermissionRoute>
          }
        />
        <Route path="users" element={<LegacyEmployeeRedirect />} />
        <Route path="users/:id" element={<LegacyEmployeeRedirect />} />
        <Route
          path="roles"
          element={
            <PermissionRoute permission="roles.manage">
              <RolesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="roles/new"
          element={
            <PermissionRoute permission="roles.manage">
              <RoleFormPage />
            </PermissionRoute>
          }
        />
        <Route
          path="roles/:id"
          element={
            <PermissionRoute permission="roles.manage">
              <RoleFormPage />
            </PermissionRoute>
          }
        />
        <Route
          path="settings"
          element={
            <PermissionRoute permission="settings.read">
              <Navigate to="/app/settings/overview" replace />
            </PermissionRoute>
          }
        />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="notifications" element={<PermissionRoute permission="notifications.read"><NotificationsPage /></PermissionRoute>} />
        <Route path="notifications/:id" element={<PermissionRoute permission="notifications.read"><NotificationDetailPage /></PermissionRoute>} />
        <Route path="settings/society-details" element={<PermissionRoute permission="society.read"><SocietyDetailsPage /></PermissionRoute>} />
        <Route path="settings/change-password" element={<ChangePasswordPage />} />
        <Route path="settings/user-rights" element={<PermissionRoute permission="roles.manage"><UserRightsPage /></PermissionRoute>} />
        <Route path="settings/backup-restore" element={<PermissionRoute permission="settings.read"><BackupRestorePage /></PermissionRoute>} />
        <Route path="settings/financial-year-closing" element={<PermissionRoute permission="settings.read"><FinancialYearClosingPage /></PermissionRoute>} />
        <Route path="calendar" element={<PermissionRoute permission="calendar.read"><CalendarPage /></PermissionRoute>} />
        <Route path="master" element={<Navigate to="/app/master/overview" replace />} />
        <Route path="master/overview" element={<MasterHomePage />} />
        <Route path="master/managers" element={<PermissionRoute permission={["employees.read", "users.manage"]}><ManagerMasterPage /></PermissionRoute>} />
        <Route path="transactions" element={<Navigate to="/app/transactions/overview" replace />} />
        <Route
          path="transactions/overview"
          element={
            <PermissionRoute permission={['transactions.read', 'bank-transactions.read', 'demands.read', 'no-interest-members.read']}>
              <TransactionsHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/reports"
          element={
            <PermissionRoute permission="reports.read">
              <Navigate to="/app/reports" replace />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/member"
          element={
            <PermissionRoute permission="transactions.read">
              <MemberTransactionsPage sectionKey="member" detailPathBase="/app/transactions/member" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/member/:id"
          element={
            <PermissionRoute permission="transactions.read">
              <MemberTransactionDetailPage sectionKey="member" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/bank"
          element={
            <PermissionRoute permission="bank-transactions.read">
              <BankTransactionsPage sectionKey="bank" detailPathBase="/app/transactions/bank" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/bank/:id"
          element={
            <PermissionRoute permission="bank-transactions.read">
              <BankTransactionDetailPage sectionKey="bank" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/employee"
          element={
            <PermissionRoute permission="transactions.read">
              <EmployeeTransactionsPage sectionKey="employee" detailPathBase="/app/transactions/employee" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/employee/:id"
          element={
            <PermissionRoute permission="transactions.read">
              <EmployeeTransactionDetailPage sectionKey="employee" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/transfer-voucher"
          element={
            <PermissionRoute permission="transactions.read">
              <TransferVoucherTransactionsPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/transfer-voucher/:id"
          element={
            <PermissionRoute permission="transactions.read">
              <TransferVoucherTransactionDetailPage sectionKey="transfer-voucher" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/receipt-interest"
          element={
            <PermissionRoute permission={['transactions.read', 'no-interest-members.read']}>
              <ReceiptInterestTransactionsPage sectionKey="receipt-interest" detailPathBase="/app/transactions/receipt-interest" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/receipt-interest/:id"
          element={
            <PermissionRoute permission={['transactions.read', 'no-interest-members.read']}>
              <ReceiptInterestTransactionDetailPage sectionKey="receipt-interest" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/supporting"
          element={
            <PermissionRoute permission={['transactions.read', 'demands.read']}>
              <SupportingTransactionsPage sectionKey="supporting" detailPathBase="/app/transactions/supporting" />
            </PermissionRoute>
          }
        />
        <Route
          path="transactions/supporting/:id"
          element={
            <PermissionRoute permission={['transactions.read', 'demands.read']}>
              <SupportingTransactionDetailPage sectionKey="supporting" />
            </PermissionRoute>
          }
        />
        <Route
          path="settings/overview"
          element={
            <PermissionRoute permission="settings.read">
              <SettingsHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="settings/business-identity"
          element={
            <PermissionRoute permission="settings.read">
              <BusinessIdentityPage />
            </PermissionRoute>
          }
        />
        <Route
          path="settings/branding"
          element={
            <PermissionRoute permission="settings.read">
              <BrandingPage />
            </PermissionRoute>
          }
        />
        <Route
          path="settings/ui-settings"
          element={
            <PermissionRoute permission="settings.read">
              <UiSettingsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="settings/smtp-email"
          element={
            <PermissionRoute permission="settings.read">
              <SmtpEmailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="settings/notifications"
          element={
            <PermissionRoute permission="settings.read">
              <NotificationSettingsPage />
            </PermissionRoute>
          }
        />
        <Route path="master/business-identity" element={<Navigate to="/app/settings/business-identity" replace />} />
        <Route path="master/branding" element={<Navigate to="/app/settings/branding" replace />} />
        <Route path="master/ui-settings" element={<Navigate to="/app/settings/ui-settings" replace />} />
        <Route path="master/smtp-email" element={<Navigate to="/app/settings/smtp-email" replace />} />
        <Route
          path="reports"
          element={
            <PermissionRoute permission="reports.read">
              <ReportsHomePage />
            </PermissionRoute>
          }
        />
        <Route
          path="reports/:reportKey"
          element={
            <PermissionRoute permission="reports.read">
              <ReportViewerPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/branches"
          element={
            <PermissionRoute permission="branches.read">
              <BranchesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/branches/:id"
          element={
            <PermissionRoute permission="branches.read">
              <BranchDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/employees"
          element={
            <PermissionRoute permission={['employees.read', 'users.manage']}>
              <EmployeesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/employees/new"
          element={
            <PermissionRoute permission={['employees.write', 'users.manage']}>
              <EmployeeFormPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/employees/:id/edit"
          element={
            <PermissionRoute permission={['employees.write', 'users.manage']}>
              <EmployeeFormPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/employees/:id"
          element={
            <PermissionRoute permission={['employees.read', 'users.manage']}>
              <EmployeeDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/members"
          element={
            <PermissionRoute permission="members.read">
              <MembersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/members/new"
          element={
            <PermissionRoute permission="members.write">
              <MemberFormPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/members/:id/edit"
          element={
            <PermissionRoute permission="members.write">
              <MemberFormPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/members/:id"
          element={
            <PermissionRoute permission="members.read">
              <MemberDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/committee"
          element={
            <PermissionRoute permission="committee.read">
              <CommitteePage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/ledgers"
          element={
            <PermissionRoute permission="ledgers.read">
              <LedgersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/ledgers/:id"
          element={
            <PermissionRoute permission="ledgers.read">
              <LedgerDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/rates"
          element={
            <PermissionRoute permission="rates.read">
              <RatesPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/rates/:id"
          element={
            <PermissionRoute permission="rates.read">
              <RateDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/bank-accounts"
          element={
            <PermissionRoute permission="bank-accounts.read">
              <BankAccountsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/bank-accounts/:id"
          element={
            <PermissionRoute permission="bank-accounts.read">
              <BankAccountDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/demands"
          element={
            <PermissionRoute permission="demands.read">
              <DemandsPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/demands/:id"
          element={
            <PermissionRoute permission="demands.read">
              <DemandDetailPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/no-interest-members"
          element={
            <PermissionRoute permission="no-interest-members.read">
              <NoInterestMembersPage />
            </PermissionRoute>
          }
        />
        <Route
          path="master/no-interest-members/:id"
          element={
            <PermissionRoute permission="no-interest-members.read">
              <NoInterestMemberDetailPage />
            </PermissionRoute>
          }
        />
      </Route>

      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <FYProvider>
      <AuthProvider>
        <BrowserRouter>
          <TitleUpdater />
          <AppRoutes />
          <Toaster richColors position="top-right" closeButton />
        </BrowserRouter>
      </AuthProvider>
    </FYProvider>
  );
}



