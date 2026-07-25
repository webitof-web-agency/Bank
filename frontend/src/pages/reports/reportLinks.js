import {
  BarChart3,
  Banknote,
  Building2,
  CalendarRange,
  FileBarChart,
  FileText,
  Landmark,
  LayoutGrid,
  Percent,
  ReceiptText,
  Scale,
  TrendingUp,
  Users
} from 'lucide-react';

export const REPORT_LINKS = [
  {
    key: 'home',
    label: 'Reports',
    path: '/app/reports',
    icon: LayoutGrid,
    category: 'hub',
    permission: 'reports.account-statement-view.view',
    description: 'Open the reports hub and jump to any report.'
  },
  {
    key: 'account-statement-view',
    label: 'Account Statement View',
    path: '/app/reports/account-statement-view',
    icon: FileBarChart,
    category: 'financial-statements',
    permission: 'reports.account-statement-view.view',
    description: 'Ledger-wise account statement with opening and closing balances.'
  },
  {
    key: 'member-ledger',
    label: "Member Ledger / Member's A/c Status",
    path: '/app/reports/member-ledger',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Member ledger with running balance and summary balances.'
  },
  {
    key: 'balance-sheet',
    label: 'Balance Sheet',
    path: '/app/reports/balance-sheet',
    icon: Scale,
    category: 'financial-statements',
    permission: 'reports.balance-sheet.view',
    description: 'Liabilities and assets snapshot for the selected date.'
  },
  {
    key: 'trial-balance',
    label: 'Trial Balance',
    path: '/app/reports/trial-balance',
    icon: BarChart3,
    category: 'financial-statements',
    permission: 'reports.trial-balance.view',
    description: 'Ledger debit and credit balances for trial review.'
  },
  {
    key: 'cash-book',
    label: 'Cash Book',
    path: '/app/reports/cash-book',
    icon: Banknote,
    category: 'financial-statements',
    permission: 'reports.cash-book.view',
    description: 'Cash ledger entries posted for the selected day or date.'
  },
  {
    key: 'day-book',
    label: 'Day Book',
    path: '/app/reports/day-book',
    icon: CalendarRange,
    category: 'financial-statements',
    permission: 'reports.day-book.view',
    description: 'Voucher-wise day book with journal line details.'
  },
  {
    key: 'voucher-summary',
    label: 'Voucher Summary',
    path: '/app/reports/voucher-summary',
    icon: ReceiptText,
    category: 'voucher-and-summary',
    permission: 'reports.voucher-summary.view',
    description: 'Voucher totals grouped by voucher category.'
  },
  {
    key: 'summary-monthly',
    label: 'Summary / Monthly Report',
    path: '/app/reports/summary-monthly',
    icon: TrendingUp,
    category: 'voucher-and-summary',
    permission: 'reports.summary-monthly.view',
    description: 'Monthly transaction summary filtered by branch.'
  },
  {
    key: 'demand-list-report',
    label: 'Demand List',
    path: '/app/reports/demand-list-report',
    icon: FileText,
    category: 'voucher-and-summary',
    permission: 'reports.demand-list-report.view',
    description: 'Demand totals, recovery and pending balance.'
  },
  {
    key: 'profit-loss',
    label: 'Profit / Loss',
    path: '/app/reports/profit-loss',
    icon: Percent,
    category: 'financial-statements',
    permission: 'reports.profit-loss.view',
    description: 'Income versus expenditure snapshot.'
  },
  {
    key: 'all-member-list',
    label: 'All Member List',
    path: '/app/reports/all-member-list',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.all-member-list.view',
    description: 'Complete member registry with status.'
  },
  {
    key: 'payment-receipt-statement',
    label: 'Statement of Payment and Receipt',
    path: '/app/reports/payment-receipt-statement',
    icon: ReceiptText,
    category: 'member-reports',
    permission: 'reports.payment-receipt-statement.view',
    description: 'Payment and receipt statement in voucher order.'
  },
  {
    key: 'branch-list-report',
    label: 'Branch List',
    path: '/app/reports/branch-list-report',
    icon: Building2,
    category: 'directory',
    permission: 'reports.branch-list-report.view',
    description: 'Branch directory with contact details.'
  },
  {
    key: 'dividend-report',
    label: 'Dividend Report',
    path: '/app/reports/dividend-report',
    icon: Landmark,
    category: 'member-reports',
    permission: 'reports.dividend-report.view',
    description: 'Dividend calculation based on member share balance.'
  }
];

export const REPORT_CATEGORIES = [
  {
    key: 'financial-statements',
    label: 'Financial Statements',
    description: 'Core accounting reports for balances, books, and profit analysis.'
  },
  {
    key: 'member-reports',
    label: 'Member Reports',
    description: 'Member-wise ledgers, list views, receipts, and dividend tracking.'
  },
  {
    key: 'voucher-and-summary',
    label: 'Voucher & Summary',
    description: 'Operational summaries, voucher registers, and demand tracking.'
  },
  {
    key: 'directory',
    label: 'Directory',
    description: 'Reference listings used across the banking system.'
  }
];

export const REPORT_LINK_MAP = REPORT_LINKS.reduce((acc, item) => {
  acc[item.key] = item;
  return acc;
}, {});

export const REPORT_NAV_LINKS = REPORT_LINKS.filter((item) => item.key !== 'home');

export const REPORT_GROUPED_LINKS = REPORT_CATEGORIES.map((category) => ({
  ...category,
  items: REPORT_NAV_LINKS.filter((item) => item.category === category.key)
}));
