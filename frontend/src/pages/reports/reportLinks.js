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
  // These 8 (member-ledger through statement-of-member-ledger) are one family —
  // legacy's single "VwAccountStatement" report-host screen, where a Report
  // dropdown INSIDE the page switches between them (see ACCOUNT_STATEMENT_
  // REPORT_LINKS below). Only member-ledger gets a sidebar entry, matching that:
  // the other 7 are `hidden` from the sidebar/hub but stay real routes+permissions
  // (reachable via the in-page switcher, or a direct link e.g. from a member's
  // detail page).
  {
    key: 'member-ledger',
    label: "Member Ledger / Member's A/c Status",
    // Sidebar / hub name: this entry opens the whole report-host screen.
    navLabel: 'Report',
    path: '/app/reports/member-ledger',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Member ledger with running balance and summary balances.'
  },
  {
    key: 'employee-ledger',
    label: 'Employee Ledger',
    path: '/app/reports/employee-ledger',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Employee ledger with running balance and summary balances.',
    hidden: true
  },
  {
    key: 'statement-of-ledgers',
    label: 'Statement of Ledgers',
    path: '/app/reports/statement-of-ledgers',
    icon: FileBarChart,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Ledger opening/credit/debit/closing grouped by nature (Assets, Liabilities, Income, Expense, Primary).',
    hidden: true
  },
  {
    key: 'statement-of-account',
    label: 'Statement of Account',
    path: '/app/reports/statement-of-account',
    icon: FileBarChart,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Voucher-wise register for a single ledger.',
    hidden: true
  },
  {
    key: 'member-ac-status',
    label: "Member's A/c Status",
    path: '/app/reports/member-ac-status',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: "Same as Member Ledger — legacy's own two report names for the same output.",
    hidden: true
  },
  {
    key: 'members-closing-balance',
    label: "Members' Closing Balance",
    path: '/app/reports/members-closing-balance',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Closing balance and interest-to-date for every member — no per-member filter.',
    hidden: true
  },
  {
    key: 'members-opening-balance',
    label: "Members' Opening Balance",
    path: '/app/reports/members-opening-balance',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Opening balance for every member — no per-member filter.',
    hidden: true
  },
  {
    key: 'statement-of-member-ledger',
    label: 'Statement of Member Ledger',
    path: '/app/reports/statement-of-member-ledger',
    icon: Users,
    category: 'member-reports',
    permission: 'reports.member-ledger.view',
    description: 'Period credit/debit/balance/interest totals for every member.',
    hidden: true
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
    description: 'Dividend on member share — branchwise, memberwise or summary, on opening or closing balance.'
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

export const REPORT_NAV_LINKS = REPORT_LINKS
  .filter((item) => item.key !== 'home' && !item.hidden)
  .map((item) => (item.navLabel ? { ...item, label: item.navLabel } : item));

export const REPORT_GROUPED_LINKS = REPORT_CATEGORIES.map((category) => ({
  ...category,
  items: REPORT_NAV_LINKS.filter((item) => item.category === category.key)
}));

// The in-page "Report" switcher on any of these 8 pages shows only this list
// (in this order — matches the legacy VwAccountStatement dropdown), not the
// full REPORT_NAV_LINKS. See ACCOUNT_STATEMENT_REPORT_KEYS usage in ReportViewerPage.
export const ACCOUNT_STATEMENT_REPORT_KEYS = [
  'member-ledger',
  'employee-ledger',
  'statement-of-ledgers',
  'statement-of-account',
  'member-ac-status',
  'members-closing-balance',
  'members-opening-balance',
  'statement-of-member-ledger'
];

export const ACCOUNT_STATEMENT_REPORT_LINKS = ACCOUNT_STATEMENT_REPORT_KEYS
  .map((key) => REPORT_LINK_MAP[key])
  .filter(Boolean);
