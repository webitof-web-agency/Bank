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
import { MembersPage } from './pages/master/members';
import { MemberDetailPage } from './pages/master/members/detail';
import { MemberFormPage } from './pages/master/members/MemberFormPage';
import { CommitteePage } from './pages/master/committee';
import { LedgersPage } from './pages/master/ledgers';
import { LedgerDetailPage } from './pages/master/ledgers/detail';
import { RatesPage } from './pages/master/rates';
import { SettingsHomePage } from './pages/settings/SettingsHomePage';
import { BusinessIdentityPage } from './pages/settings/BusinessIdentityPage';
import { SocietyDetailsPage } from './pages/settings/SocietyDetailsPage';
import { ChangePasswordPage } from './pages/settings/ChangePasswordPage';
import { UserRightsPage } from './pages/settings/UserRightsPage';
import { BackupRestorePage } from './pages/settings/BackupRestorePage';
import { FinancialYearClosingPage } from './pages/settings/FinancialYearClosingPage';
import { TransactionsHomePage } from './pages/transactions';
import { MemberTransactionsHomePage } from './pages/transactions/member/home';
import { MemberTransactionsPage } from './pages/transactions/member';
import { MemberTransactionDetailPage } from './pages/transactions/member/detail';
import { LoanPaidMemberTransactionDetailPage } from './pages/transactions/member/loanPaidDetail';
import { DepositPaidMemberTransactionDetailPage } from './pages/transactions/member/depositPaidDetail';
import { InsurancePaidMemberTransactionDetailPage } from './pages/transactions/member/insurancePaidDetail';
import { SsaPaidMemberTransactionDetailPage } from './pages/transactions/member/ssaPaidDetail';
import { RecoveryMemberTransactionDetailPage } from './pages/transactions/member/recoveryDetail';
import { BankTransactionsPage } from './pages/transactions/bank';
import { BankTransactionDetailPage } from './pages/transactions/bank/detail';
import { BankTransactionsHomePage } from './pages/transactions/bank/home';
import { BankTransactionWorkspacePage } from './pages/transactions/bank/workspace';
import { BankTransactionWorkspaceDetailPage } from './pages/transactions/bank/workspaceDetail';
import { EmployeeTransactionsHomePage } from './pages/transactions/employee/home';
import { EmployeeTransactionWorkspacePage } from './pages/transactions/employee/workspace';
import { EmployeeTransactionWorkspaceDetailPage } from './pages/transactions/employee/workspaceDetail';
import { TransferVoucherTransactionsHomePage } from './pages/transactions/transfer-voucher/home';
import { TransferVoucherTransactionWorkspacePage } from './pages/transactions/transfer-voucher/workspace';
import { TransferVoucherTransactionWorkspaceDetailPage } from './pages/transactions/transfer-voucher/workspaceDetail';
import { ReceiptVoucherWorkspacePage } from './pages/transactions/receipt-interest/receiptWorkspace';
import { ReceiptVoucherWorkspaceDetailPage } from './pages/transactions/receipt-interest/receiptWorkspaceDetail';
import { InterestVoucherWorkspacePage } from './pages/transactions/receipt-interest/interestWorkspace';
import { InterestVoucherWorkspaceDetailPage } from './pages/transactions/receipt-interest/interestWorkspaceDetail';
import { OtherTransactionsPage } from './pages/transactions/other';
import { DemandEntryPage } from './pages/transactions/other/demand-entry/index';
import { DemandEntryDetailPage } from './pages/transactions/other/demand-entry/detail';
import { NoInterestMembersPage } from './pages/transactions/other/no-interest-members';
import { NoInterestMemberDetailPage } from './pages/transactions/other/no-interest-members/detail';
import { ReportsHomePage } from './pages/reports';
import { ReportViewerPage } from './pages/reports/ReportViewerPage';
import ProfilePage from './pages/profile/ProfilePage';
import { NotificationsPage } from './pages/notifications';
import { NotificationDetailPage } from './pages/notifications/detail';
import { CalendarPage } from './pages/calendar';
import { NotFoundPage } from './pages/system/NotFoundPage';
import { AccessDeniedPage } from './pages/system/AccessDeniedPage';
import { ReceiptInterestHomePage as InterestHomePage } from './pages/transactions/interest/home';
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
  const {
    id
  } = useParams();
  return <Navigate to={id ? `/app/master/employees/${id}` : '/app/master/employees'} replace />;
}
function LegacySettingsRedirect() {
  return <Navigate to="/app/settings/overview" replace />;
}
function TitleUpdater() {
  const location = useLocation();
  useEffect(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const label = segments.includes('notifications') ? 'Notifications' : segments[segments.length - 1] ? segments[segments.length - 1].replace(/-/g, ' ') : 'Dashboard';
    const appName = readCachedAppName();
    document.title = `${label.charAt(0).toUpperCase() + label.slice(1)} - ${appName}`;
  }, [location.pathname]);
  return null;
}
function AppRoutes() {
  return <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/app" element={<ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<PermissionRoute permission="dashboard.read">
              <DashboardPage />
            </PermissionRoute>} />
        <Route path="files" element={<PermissionRoute permission="files.read">
              <FilesPage />
            </PermissionRoute>} />
        <Route path="employees" element={<PermissionRoute permission={['employees.read', 'users.manage']}>
              <LegacyEmployeeRedirect />
            </PermissionRoute>} />
        <Route path="employees/:id" element={<PermissionRoute permission={['employees.read', 'users.manage']}>
              <LegacyEmployeeRedirect />
            </PermissionRoute>} />
        <Route path="users" element={<LegacyEmployeeRedirect />} />
        <Route path="users/:id" element={<LegacyEmployeeRedirect />} />
        <Route path="roles" element={<PermissionRoute permission="roles.manage">
              <RolesPage />
            </PermissionRoute>} />
        <Route path="roles/new" element={<PermissionRoute permission="roles.manage">
              <RoleFormPage />
            </PermissionRoute>} />
        <Route path="roles/:id" element={<PermissionRoute permission="roles.manage">
              <RoleFormPage />
            </PermissionRoute>} />
        <Route path="settings" element={<PermissionRoute permission="settings.read">
              <Navigate to="/app/settings/overview" replace />
            </PermissionRoute>} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="notifications" element={<PermissionRoute permission="notifications.read"><NotificationsPage /></PermissionRoute>} />
        <Route path="notifications/:id" element={<PermissionRoute permission="notifications.read"><NotificationDetailPage /></PermissionRoute>} />
        <Route path="settings/head-office" element={<PermissionRoute permission="society.read"><SocietyDetailsPage /></PermissionRoute>} />
        <Route path="settings/society-details" element={<Navigate to="/app/settings/head-office" replace />} />
        <Route path="settings/change-password" element={<ChangePasswordPage />} />
        <Route path="settings/user-rights" element={<PermissionRoute permission="roles.manage"><UserRightsPage /></PermissionRoute>} />
        <Route path="settings/backup-restore" element={<PermissionRoute permission="settings.read"><BackupRestorePage /></PermissionRoute>} />
        <Route path="settings/financial-year-closing" element={<PermissionRoute permission="settings.read"><FinancialYearClosingPage /></PermissionRoute>} />
        <Route path="calendar" element={<PermissionRoute permission="calendar.read"><CalendarPage /></PermissionRoute>} />
        <Route path="master" element={<Navigate to="/app/master/overview" replace />} />
        <Route path="master/overview" element={<MasterHomePage />} />
        
        <Route path="transactions" element={<Navigate to="/app/transactions/overview" replace />} />
        <Route path="transactions/overview" element={<PermissionRoute permission={['transactions.read', 'bank-transactions.read', 'no-interest-members.read']}>
              <TransactionsHomePage />
            </PermissionRoute>} />
        <Route path="transactions/reports" element={<PermissionRoute permission="reports.read">
              <Navigate to="/app/reports" replace />
            </PermissionRoute>} />
        <Route path="transactions/member" element={<PermissionRoute permission="transactions.read">
              <MemberTransactionsHomePage detailPathBase="/app/transactions/member" />
            </PermissionRoute>} />
        <Route path="transactions/member/loan-paid" element={<PermissionRoute permission="transactions.read">
              <MemberTransactionsPage sectionKey="member" itemKey="loan-paid-member" detailPathBase="/app/transactions/member/loan-paid" />
            </PermissionRoute>} />
        <Route path="transactions/member/loan-paid/:id" element={<PermissionRoute permission="transactions.read">
              <LoanPaidMemberTransactionDetailPage />
            </PermissionRoute>} />
        <Route path="transactions/member/deposit-paid" element={<PermissionRoute permission="transactions.read">
              <MemberTransactionsPage sectionKey="member" itemKey="deposit-paid-member" detailPathBase="/app/transactions/member/deposit-paid" />
            </PermissionRoute>} />
        <Route path="transactions/member/deposit-paid/:id" element={<PermissionRoute permission="transactions.read">
              <DepositPaidMemberTransactionDetailPage />
            </PermissionRoute>} />
        <Route path="transactions/member/insurance-paid" element={<PermissionRoute permission="transactions.read">
              <MemberTransactionsPage sectionKey="member" itemKey="insurance-paid-member" detailPathBase="/app/transactions/member/insurance-paid" />
            </PermissionRoute>} />
        <Route path="transactions/member/insurance-paid/:id" element={<PermissionRoute permission="transactions.read">
              <InsurancePaidMemberTransactionDetailPage />
            </PermissionRoute>} />
        <Route path="transactions/member/ssa-paid" element={<PermissionRoute permission="transactions.read">
              <MemberTransactionsPage sectionKey="member" itemKey="ssa-paid-member" detailPathBase="/app/transactions/member/ssa-paid" />
            </PermissionRoute>} />
        <Route path="transactions/member/ssa-paid/:id" element={<PermissionRoute permission="transactions.read">
              <SsaPaidMemberTransactionDetailPage />
            </PermissionRoute>} />
        <Route path="transactions/member/recovery" element={<PermissionRoute permission="transactions.read">
              <MemberTransactionsPage sectionKey="member" itemKey="recovery-member" detailPathBase="/app/transactions/member/recovery" />
            </PermissionRoute>} />
        <Route path="transactions/member/recovery/:id" element={<PermissionRoute permission="transactions.read">
              <RecoveryMemberTransactionDetailPage />
            </PermissionRoute>} />
        <Route path="transactions/member/:id" element={<PermissionRoute permission="transactions.read">
              <MemberTransactionDetailPage sectionKey="member" detailPathBase="/app/transactions/member" />
            </PermissionRoute>} />
        <Route path="transactions/bank" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionsHomePage detailPathBase="/app/transactions/bank" />
            </PermissionRoute>} />
        <Route path="transactions/bank/loan-recv-cash" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspacePage sectionKey="bank" itemKey="loan-recv-cash" detailPathBase="/app/transactions/bank/loan-recv-cash" />
            </PermissionRoute>} />
        <Route path="transactions/bank/loan-recv-cash/:id" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspaceDetailPage sectionKey="bank" itemKey="loan-recv-cash" detailPathBase="/app/transactions/bank/loan-recv-cash" />
            </PermissionRoute>} />
        <Route path="transactions/bank/loan-recv-saving" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspacePage sectionKey="bank" itemKey="loan-recv-saving" detailPathBase="/app/transactions/bank/loan-recv-saving" />
            </PermissionRoute>} />
        <Route path="transactions/bank/loan-recv-saving/:id" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspaceDetailPage sectionKey="bank" itemKey="loan-recv-saving" detailPathBase="/app/transactions/bank/loan-recv-saving" />
            </PermissionRoute>} />
        <Route path="transactions/bank/deposit-in-bank" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspacePage sectionKey="bank" itemKey="deposit-in-bank" detailPathBase="/app/transactions/bank/deposit-in-bank" />
            </PermissionRoute>} />
        <Route path="transactions/bank/deposit-in-bank/:id" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspaceDetailPage sectionKey="bank" itemKey="deposit-in-bank" detailPathBase="/app/transactions/bank/deposit-in-bank" />
            </PermissionRoute>} />
        <Route path="transactions/bank/cheque-issue-saving" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspacePage sectionKey="bank" itemKey="cheque-issue-saving" detailPathBase="/app/transactions/bank/cheque-issue-saving" />
            </PermissionRoute>} />
        <Route path="transactions/bank/cheque-issue-saving/:id" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspaceDetailPage sectionKey="bank" itemKey="cheque-issue-saving" detailPathBase="/app/transactions/bank/cheque-issue-saving" />
            </PermissionRoute>} />
        <Route path="transactions/bank/cheque-issue-loan" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspacePage sectionKey="bank" itemKey="cheque-issue-loan" detailPathBase="/app/transactions/bank/cheque-issue-loan" />
            </PermissionRoute>} />
        <Route path="transactions/bank/cheque-issue-loan/:id" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspaceDetailPage sectionKey="bank" itemKey="cheque-issue-loan" detailPathBase="/app/transactions/bank/cheque-issue-loan" />
            </PermissionRoute>} />
        <Route path="transactions/bank/transfer-saving" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspacePage sectionKey="bank" itemKey="transfer-saving" detailPathBase="/app/transactions/bank/transfer-saving" />
            </PermissionRoute>} />
        <Route path="transactions/bank/transfer-saving/:id" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspaceDetailPage sectionKey="bank" itemKey="transfer-saving" detailPathBase="/app/transactions/bank/transfer-saving" />
            </PermissionRoute>} />
        <Route path="transactions/bank/transfer-cashcredit" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspacePage sectionKey="bank" itemKey="transfer-cashcredit" detailPathBase="/app/transactions/bank/transfer-cashcredit" />
            </PermissionRoute>} />
        <Route path="transactions/bank/transfer-cashcredit/:id" element={<PermissionRoute permission="bank-transactions.read">
              <BankTransactionWorkspaceDetailPage sectionKey="bank" itemKey="transfer-cashcredit" detailPathBase="/app/transactions/bank/transfer-cashcredit" />
            </PermissionRoute>} />
                <Route path="transactions/employee" element={<PermissionRoute permission="transactions.read">
              <EmployeeTransactionsHomePage />
            </PermissionRoute>} />
        <Route path="transactions/employee/advance-paid-emp" element={<PermissionRoute permission="transactions.read">
              <EmployeeTransactionWorkspacePage sectionKey="employee" itemKey="advance-paid-emp" detailPathBase="/app/transactions/employee/advance-paid-emp" />
            </PermissionRoute>} />
        <Route path="transactions/employee/advance-paid-emp/:id" element={<PermissionRoute permission="transactions.read">
              <EmployeeTransactionWorkspaceDetailPage sectionKey="employee" itemKey="advance-paid-emp" />
            </PermissionRoute>} />
        <Route path="transactions/employee/advance-recovery-emp" element={<PermissionRoute permission="transactions.read">
              <EmployeeTransactionWorkspacePage sectionKey="employee" itemKey="advance-recovery-emp" detailPathBase="/app/transactions/employee/advance-recovery-emp" />
            </PermissionRoute>} />
        <Route path="transactions/employee/advance-recovery-emp/:id" element={<PermissionRoute permission="transactions.read">
              <EmployeeTransactionWorkspaceDetailPage sectionKey="employee" itemKey="advance-recovery-emp" />
            </PermissionRoute>} />
                
        <Route path="transactions/transfer-voucher" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionsHomePage /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-paid" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspacePage sectionKey="transfer-voucher" itemKey="transfer-voucher-paid" detailPathBase="/app/transactions/transfer-voucher/transfer-voucher-paid" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-paid/:id" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspaceDetailPage sectionKey="transfer-voucher" itemKey="transfer-voucher-paid" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-recover" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspacePage sectionKey="transfer-voucher" itemKey="transfer-voucher-recover" detailPathBase="/app/transactions/transfer-voucher/transfer-voucher-recover" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/transfer-voucher-recover/:id" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspaceDetailPage sectionKey="transfer-voucher" itemKey="transfer-voucher-recover" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/payment" element={<PermissionRoute permission="transactions.transfer-voucher.view"><OtherTransactionsPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher/payment" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/receipt" element={<PermissionRoute permission="transactions.transfer-voucher.view"><OtherTransactionsPage sectionKey="transfer-voucher" detailPathBase="/app/transactions/transfer-voucher/receipt" /></PermissionRoute>} />
        <Route path="transactions/transfer-voucher/:type/:id" element={<PermissionRoute permission="transactions.transfer-voucher.view"><TransferVoucherTransactionWorkspaceDetailPage sectionKey="transfer-voucher" /></PermissionRoute>} />

        <Route path="transactions/interest" element={<PermissionRoute permission="transactions.read"><InterestHomePage /></PermissionRoute>} />
        <Route path="transactions/interest/interest-paid-member" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspacePage sectionKey="interest" itemKey="interest-paid-member" detailPathBase="/app/transactions/interest/interest-paid-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-paid-member/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" itemKey="interest-paid-member" detailPathBase="/app/transactions/interest/interest-paid-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-member" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspacePage sectionKey="interest" itemKey="interest-receive-member" detailPathBase="/app/transactions/interest/interest-receive-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-member/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" itemKey="interest-receive-member" detailPathBase="/app/transactions/interest/interest-receive-member" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-employee" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspacePage sectionKey="interest" itemKey="interest-receive-employee" detailPathBase="/app/transactions/interest/interest-receive-employee" /></PermissionRoute>} />
        <Route path="transactions/interest/interest-receive-employee/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" itemKey="interest-receive-employee" detailPathBase="/app/transactions/interest/interest-receive-employee" /></PermissionRoute>} />
        <Route path="transactions/interest/:type/:id" element={<PermissionRoute permission="transactions.read"><InterestVoucherWorkspaceDetailPage sectionKey="interest" /></PermissionRoute>} />

        <Route path="transactions/other/payment-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" itemKey="payment-voucher" detailPathBase="/app/transactions/other/payment-voucher" /></PermissionRoute>} />
        <Route path="transactions/other/receipt-voucher" element={<PermissionRoute permission="transactions.read"><OtherTransactionsPage sectionKey="other" itemKey="receipt-voucher" detailPathBase="/app/transactions/other/receipt-voucher" /></PermissionRoute>} />
        <Route path="transactions/other/no-interest-members" element={<PermissionRoute permission="transactions.read"><NoInterestMembersPage sectionKey="other" detailPathBase="/app/transactions/other/no-interest-members" /></PermissionRoute>} />
        <Route path="transactions/other/no-interest-members/:id" element={<PermissionRoute permission="transactions.read"><NoInterestMemberDetailPage sectionKey="other" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryPage sectionKey="other" detailPathBase="/app/transactions/other/demand-entry" /></PermissionRoute>} />
        <Route path="transactions/other/demand-entry/:id" element={<PermissionRoute permission={["transactions.read", "demands.read"]}><DemandEntryDetailPage sectionKey="other" /></PermissionRoute>} />

        <Route path="reports" element={<PermissionRoute permission="reports.read">
              <ReportsHomePage />
            </PermissionRoute>} />
        <Route path="reports/:reportKey" element={<PermissionRoute permission="reports.read">
              <ReportViewerPage />
            </PermissionRoute>} />
        <Route path="master/branches" element={<PermissionRoute permission="branches.read">
              <BranchesPage />
            </PermissionRoute>} />
        <Route path="master/branches/:id" element={<PermissionRoute permission="branches.read">
              <BranchDetailPage />
            </PermissionRoute>} />
        <Route path="master/employees" element={<PermissionRoute permission={['employees.read', 'users.manage']}>
              <EmployeesPage />
            </PermissionRoute>} />
        <Route path="master/employees/new" element={<PermissionRoute permission={['employees.write', 'users.manage']}>
              <EmployeeFormPage />
            </PermissionRoute>} />
        <Route path="master/employees/:id/edit" element={<PermissionRoute permission={['employees.write', 'users.manage']}>
              <EmployeeFormPage />
            </PermissionRoute>} />
        <Route path="master/employees/:id" element={<PermissionRoute permission={['employees.read', 'users.manage']}>
              <EmployeeDetailPage />
            </PermissionRoute>} />
        <Route path="master/members" element={<PermissionRoute permission="members.read">
              <MembersPage />
            </PermissionRoute>} />
        <Route path="master/members/new" element={<PermissionRoute permission="members.write">
              <MemberFormPage />
            </PermissionRoute>} />
        <Route path="master/members/:id/edit" element={<PermissionRoute permission="members.write">
              <MemberFormPage />
            </PermissionRoute>} />
        <Route path="master/members/:id" element={<PermissionRoute permission="members.read">
              <MemberDetailPage />
            </PermissionRoute>} />
        <Route path="master/committee" element={<PermissionRoute permission="committee.read">
              <CommitteePage />
            </PermissionRoute>} />
        <Route path="master/ledgers" element={<PermissionRoute permission="ledgers.read">
              <LedgersPage />
            </PermissionRoute>} />
        <Route path="master/ledgers/:id" element={<PermissionRoute permission="ledgers.read">
              <LedgerDetailPage />
            </PermissionRoute>} />
        <Route path="master/rates" element={<PermissionRoute permission="rates.read">
              <RatesPage />
            </PermissionRoute>} />
        <Route path="master/rates/:id" element={<PermissionRoute permission="rates.read">
                <Navigate to="/app/master/rates" replace />
            </PermissionRoute>} />
        
        
        
        
        
        
        
      </Route>

      <Route path="/access-denied" element={<AccessDeniedPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>;
}
export default function App() {
  return <FYProvider>
      <AuthProvider>
        <BrowserRouter>
          <TitleUpdater />
          <AppRoutes />
          <Toaster richColors position="top-right" closeButton />
        </BrowserRouter>
      </AuthProvider>
    </FYProvider>;
}