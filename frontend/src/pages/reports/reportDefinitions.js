// Local calendar date (not toISOString, which is UTC and rolls back a day
// before 05:30 IST).
function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// The header's FY switcher (1 April - 31 March). Falls back to the FY that
// contains today when no FY is passed.
export function resolveFYRange(fy = null) {
  if (fy?.start && fy?.end) return { start: fy.start, end: fy.end };
  const today = todayString();
  const year = Number(today.slice(0, 4));
  const startYear = Number(today.slice(5, 7)) >= 4 ? year : year - 1;
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

export function clampDateToFY(date, fy = null) {
  const { start, end } = resolveFYRange(fy);
  if (!date || date < start) return start;
  if (date > end) return end;
  return date;
}

// Today when it falls inside the selected FY, otherwise the nearest FY edge
// (31 March for a past FY), so "as on date" reports land in the chosen year.
function fyAsOnDate(fy) {
  return clampDateToFY(todayString(), fy);
}

// Demand lists store the calendar year, so Jan-Mar belong to the FY's end year.
export function fyCalendarYearForMonth(month, fy = null) {
  const startYear = Number(resolveFYRange(fy).start.slice(0, 4));
  return String(Number(month) >= 4 ? startYear : startYear + 1);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-IN').format(number);
}

function formatMoney(value) {
  return formatNumber(Number(value || 0));
}

// Always two decimals (3,12,911.80), so a column of balances lines up.
// Negatives keep legacy's leading minus: balances are credit-positive, so a
// loan owed (Dr) is negative, exactly as the legacy grid shows it.
function formatAmount(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0.00';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

// Section `columnAlign` for the given header indexes.
function alignColumns(rightIndexes = [], centerIndexes = []) {
  return Object.fromEntries([
    ...rightIndexes.map((index) => [index, 'right']),
    ...centerIndexes.map((index) => [index, 'center'])
  ]);
}

function toRows(rows = [], mapper = (row) => row) {
  return (Array.isArray(rows) ? rows : []).map(mapper);
}

function firstCode(items = []) {
  return Array.isArray(items) && items.length ? String(items[0]?.code || '').trim() : '';
}

function firstBranch(items = []) {
  return Array.isArray(items) && items.length ? String(items[0]?.code || '').trim() : '';
}

function makeSummary(label, value, subLabel = '') {
  return { label, value, subLabel };
}

// Legacy Dividend Report's "Report" dropdown, in legacy's own order.
export const DIVIDEND_MODES = [
  { value: 'branchwise-opening', label: 'Branchwise (Based on opening)' },
  { value: 'summary-opening', label: 'Summary (Based on opening)' },
  { value: 'memberwise-opening', label: 'MemberWise (Based on Opening)' },
  { value: 'branchwise-closing', label: 'Branchwise (Based on closing)' },
  { value: 'summary-closing', label: 'Summary (Based on closing)' },
  { value: 'memberwise-closing', label: 'MemberWise (Based on Closing)' }
];

export const DIVIDEND_SORT_OPTIONS = [
  { value: 'branchName', label: 'BranchName' },
  { value: 'branchCode', label: 'BranchCode' }
];

// Branches by name (or code), members by code within a branch.
function sortDividendRows(rows = [], sortBy = 'branchName') {
  const byNumberOrText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'en', { numeric: true });
  return [...rows].sort((a, b) => (
    (sortBy === 'branchCode'
      ? byNumberOrText(a.branch, b.branch)
      : byNumberOrText(a.branchName, b.branchName) || byNumberOrText(a.branch, b.branch))
    || byNumberOrText(a.memberCode, b.memberCode)
  ));
}

function getDefaultBranchCode(user = {}) {
  if (user && user.isSuperAdmin) return '';
  return String(user?.branchCode || '').trim().toUpperCase();
}

export function getReportDefaultFilters(reportKey = '', lookups = {}, user = {}, fy = null) {
  const { start: fyStart, end: fyEnd } = resolveFYRange(fy);
  const asOnDate = fyAsOnDate(fy);

  if (reportKey === 'member-ledger') {
    return {
      memberCode: firstCode(lookups.members),
      dateFrom: fyStart,
      dateTo: fyEnd
    };
  }

  if (reportKey === 'account-statement-view') {
    return {
      type: 'ledger',
      search: '',
      nature: '',
      uptoDate: fyEnd
    };
  }

  if (reportKey === 'summary-monthly') {
    return {
      branchCode: getDefaultBranchCode(user),
      month: asOnDate.slice(0, 7)
    };
  }

  if (reportKey === 'demand-list-report') {
    const month = asOnDate.slice(5, 7);
    return {
      branchCode: getDefaultBranchCode(user),
      date: asOnDate,
      year: fyCalendarYearForMonth(month, fy),
      month
    };
  }

  if (reportKey === 'employee-ledger') {
    return {
      employeeCode: firstCode(lookups.employees),
      dateFrom: fyStart,
      dateTo: fyEnd
    };
  }

  if (reportKey === 'member-ac-status') {
    return {
      memberCode: firstCode(lookups.members),
      dateFrom: fyStart,
      dateTo: fyEnd
    };
  }

  if (reportKey === 'statement-of-ledgers') {
    return {
      // Blank = every group, as legacy's own default (blank Group field).
      group: '',
      dateFrom: fyStart,
      dateTo: fyEnd
    };
  }

  if (reportKey === 'statement-of-account') {
    return {
      // Blank = every account, as legacy's own default (blank Account field).
      ledgerCode: '',
      dateFrom: fyStart,
      dateTo: fyEnd
    };
  }

  if (reportKey === 'statement-of-member-ledger') {
    return { dateFrom: fyStart, dateTo: fyEnd };
  }

  if (reportKey === 'members-closing-balance' || reportKey === 'members-opening-balance') {
    // No filters on screen; the FY only dates the title (and the request).
    return { dateFrom: fyStart, dateTo: fyEnd };
  }

  if (reportKey === 'payment-receipt-statement') {
    return { dateFrom: fyStart, dateTo: fyEnd };
  }

  if (['balance-sheet', 'trial-balance', 'cash-book', 'day-book', 'voucher-summary', 'profit-loss'].includes(reportKey)) {
    return { date: asOnDate };
  }

  if (reportKey === 'dividend-report') {
    return {
      mode: 'branchwise-opening',
      branchCode: getDefaultBranchCode(user),
      sortBy: 'branchName',
      // Blank = the paid dividend rate in force at the FY end (rate master).
      rate: '',
      dateFrom: fyStart,
      uptoDate: fyEnd
    };
  }

  if (reportKey === 'all-member-list' || reportKey === 'branch-list-report') {
    return { branchCode: getDefaultBranchCode(user) };
  }

  return {};
}

export function getReportConfig(reportKey = '') {
  const configs = {
    'account-statement-view': {
      label: 'Account Statement View',
      description: 'Ledger-wise account statement with opening, totals and closing balances.',
      filterMode: 'account-statement',
      load: async (api, token, filters) => {
        const type = filters.type || 'ledger';
        const response = await api.banking.reports.accountStatement(token, {
          type,
          search: filters.search || '',
          nature: filters.nature || '',
          uptoDate: filters.uptoDate || ''
        });
        const rows = Array.isArray(response.data) ? response.data : [];

        if (type === 'member') {
          return {
            title: 'Account Statement View',
            subtitle: 'All members',
            summary: [
              makeSummary('Members', rows.length, 'Total members in report'),
              makeSummary('Search', filters.search || 'All', 'Current search filter')
            ],
            sections: [
              {
                title: 'Member Statement',
                description: 'Balance heads for every member as at the end of the selected FY. Minus = Dr (amount owed).',
                headers: ['Member Code', 'Member Name', 'Branch Code', 'Posted Branch', 'Designation', 'F/H Name', 'Share', 'Share Int', 'CD Amt', 'CD Int', 'SSA', 'SSA Int', 'Loan', 'Loan Int', 'D.Loan', 'D.Loan Int', 'Premium', 'Dismembered'],
                columnAlign: alignColumns([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], [17]),
                rows: toRows(rows, (row) => [
                  row.memberCode,
                  row.memberName,
                  row.branchCode,
                  row.postedBranch,
                  row.designation,
                  row.fhName,
                  formatAmount(row.share),
                  formatAmount(row.shareInt),
                  formatAmount(row.cdAmt),
                  formatAmount(row.cdInt),
                  formatAmount(row.ssa),
                  formatAmount(row.ssaInt),
                  formatAmount(row.loan),
                  formatAmount(row.loanInt),
                  formatAmount(row.dloan),
                  formatAmount(row.dloanInt),
                  formatAmount(row.premium),
                  row.dismembered ? 'YES' : 'NO'
                ])
              }
            ],
            csvRows: rows
          };
        }

        if (type === 'employee') {
          return {
            title: 'Account Statement View',
            subtitle: 'All employees',
            summary: [
              makeSummary('Employees', rows.length, 'Total employees in report'),
              makeSummary('Search', filters.search || 'All', 'Current search filter')
            ],
            sections: [
              {
                title: 'Employee Statement',
                description: 'Balance heads for every employee as at the end of the selected FY. Minus = Dr (amount owed).',
                headers: ['Employee Code', 'Employee Name', 'Designation', 'F/H Name', 'Housing Loan', 'Housing Loan Int', 'Vehicle Loan', 'Vehicle Loan Int', 'Retired'],
                columnAlign: alignColumns([4, 5, 6, 7], [8]),
                rows: toRows(rows, (row) => [
                  row.employeeCode,
                  row.employeeName,
                  row.designation,
                  row.fhName,
                  formatAmount(row.housingLoan),
                  formatAmount(row.housingLoanInt),
                  formatAmount(row.vehicleLoan),
                  formatAmount(row.vehicleLoanInt),
                  row.retired ? 'YES' : 'NO'
                ])
              }
            ],
            csvRows: rows
          };
        }

        return {
          title: 'Account Statement View',
          subtitle: filters.uptoDate ? `Upto ${filters.uptoDate}` : 'All ledgers',
          summary: [
            makeSummary('Ledgers', rows.length, 'Total ledgers in report'),
            makeSummary('Nature', filters.nature || 'All', 'Selected ledger nature'),
            makeSummary('Search', filters.search || 'All', 'Current search filter')
          ],
          sections: [
            {
              title: 'Ledger Statement',
              description: 'Opening and closing balances for each ledger.',
              headers: ['Ledger Code', 'Ledger Name', 'Opening Balance', 'Op Side', 'Total Cr', 'Total Dr', 'Balance', 'Bal Side'],
              rows: toRows(rows, (row) => [
                row.ledgerCode,
                row.ledgerName,
                formatMoney(row.openingBalance),
                row.openingSide,
                formatMoney(row.totalCr),
                formatMoney(row.totalDr),
                formatMoney(row.balance),
                row.balanceSide
              ])
            }
          ],
          csvRows: rows.map((row) => ({
            ledgerCode: row.ledgerCode,
            ledgerName: row.ledgerName,
            openingBalance: row.openingBalance,
            openingSide: row.openingSide,
            totalCr: row.totalCr,
            totalDr: row.totalDr,
            balance: row.balance,
            balanceSide: row.balanceSide
          }))
        };
      }
    },
    'member-ledger': {
      label: "Member Ledger / Member's A/c Status",
      description: 'Member ledger with running balance and member balance heads.',
      filterMode: 'member-ledger',
      load: async (api, token, filters) => {
        // Nothing to ask the server for until a member is picked (it would 404).
        const response = !filters.memberCode ? {} : await api.banking.reports.memberLedger(token, {
          memberCode: filters.memberCode || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || ''
        });
        const payload = response.data || {};
        const member = payload.member || {};

        return {
          title: "Member Ledger / Member's A/c Status",
          subtitle: `${member.name || member.code || 'Member'} ${member.membershipNo ? `- ${member.membershipNo}` : ''}`.trim(),
          summary: [],
          sections: [],
          raw: payload
        };
      }
    },
    'balance-sheet': {
      label: 'Balance Sheet',
      description: 'Liabilities and assets snapshot for the selected date.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.balanceSheet(token, { uptoDate: filters.date || '' });
        const payload = response.data || {};
        const liabilities = (Array.isArray(payload.liabilities) ? payload.liabilities : []).filter(row => Number(row.amount) !== 0);
        const assets = (Array.isArray(payload.assets) ? payload.assets : []).filter(row => Number(row.amount) !== 0);

        return {
          title: 'Balance Sheet',
          subtitle: filters.date ? `As on ${filters.date}` : 'Current snapshot',
          summary: [
            makeSummary('Liabilities', formatMoney(payload.totalLiabilities || liabilities.reduce((sum, row) => sum + Number(row.amount || 0), 0)), 'Total liability amount'),
            makeSummary('Assets', formatMoney(payload.totalAssets || assets.reduce((sum, row) => sum + Number(row.amount || 0), 0)), 'Total asset amount'),
            makeSummary('Status', 'Ready', 'Report generation status')
          ],
          sections: [
            {
              title: 'Liabilities',
              description: 'Liability-side balances.',
              headers: ['Ledger Code', 'Ledger Name', 'Amount'],
              rows: liabilities.map((row) => [row.ledgerCode, row.ledgerName, formatMoney(row.amount)])
            },
            {
              title: 'Assets',
              description: 'Asset-side balances.',
              headers: ['Ledger Code', 'Ledger Name', 'Amount'],
              rows: assets.map((row) => [row.ledgerCode, row.ledgerName, formatMoney(row.amount)])
            }
          ],
          raw: payload
        };
      }
    },
    'trial-balance': {
      label: 'Trial Balance',
      description: 'Ledger debit and credit balances for trial review.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.trialBalance(token, { uptoDate: filters.date || '' });
        const rows = (Array.isArray(response.data) ? response.data : []).filter(row => Number(row.closing ?? row.balance ?? row.debit ?? row.credit ?? 0) !== 0);
        return {
          title: 'Trial Balance',
          subtitle: filters.date ? `As on ${filters.date}` : 'Current snapshot',
          summary: [
            makeSummary('Ledgers', rows.length, 'Total ledgers found'),
            makeSummary('Debit', formatMoney(rows.reduce((sum, row) => sum + Number(row.debit || 0), 0)), 'Total debit amount'),
            makeSummary('Credit', formatMoney(rows.reduce((sum, row) => sum + Number(row.credit || 0), 0)), 'Total credit amount')
          ],
          sections: [
            {
              title: 'Trial Balance',
              description: 'Ledger debit and credit balances.',
              headers: ['Ledger Code', 'Ledger Name', 'Debit', 'Credit'],
              rows: rows.map((row) => [row.ledgerCode, row.ledgerName, formatMoney(row.debit), formatMoney(row.credit)])
            }
          ],
          csvRows: rows,
          raw: rows
        };
      }
    },
    'cash-book': {
      label: 'Cash Book',
      description: 'Cash ledger entries posted for the selected date.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.cashBook(token, { date: filters.date || '' });
        const payload = response.data || {};
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const credit = rows.reduce((sum, row) => sum + Number(row.crCash || 0) + Number(row.crTransfer || 0), 0);
        const debit = rows.reduce((sum, row) => sum + Number(row.drCash || 0) + Number(row.drTransfer || 0), 0);
        return {
          title: 'Cash Book',
          subtitle: filters.date ? `For ${filters.date}` : 'Cash book',
          summary: [
            makeSummary('Opening Cash', formatMoney(payload.openingCash), 'Cash-In-Hand at start of day'),
            makeSummary('Income', formatMoney(credit), 'Total credit (cash + transfer)'),
            makeSummary('Expenses', formatMoney(debit), 'Total debit (cash + transfer)'),
            makeSummary('Closing Cash', formatMoney(payload.closingCash), 'Cash-In-Hand at end of day')
          ],
          sections: [
            {
              title: 'Cash Book',
              description: 'Day\'s vouchers by ledger, split into cash and transfer.',
              headers: ['Particulars', 'Cr Cash', 'Cr Transfer', 'Dr Cash', 'Dr Transfer'],
              rows: rows.map((row) => [row.ledgerName, formatMoney(row.crCash), formatMoney(row.crTransfer), formatMoney(row.drCash), formatMoney(row.drTransfer)])
            }
          ],
          csvRows: rows,
          raw: payload
        };
      }
    },
    'day-book': {
      label: 'Day Book',
      description: 'Voucher-wise day book with journal line details.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.dayBook(token, { date: filters.date || '' });
        const payload = response.data || {};
        const vouchers = Array.isArray(payload.vouchers) ? payload.vouchers : [];
        return {
          title: 'Day Book',
          subtitle: filters.date ? `For ${filters.date}` : 'Day book',
          summary: [
            makeSummary('Vouchers', vouchers.length, 'Vouchers on this date'),
            makeSummary('Income', formatMoney(vouchers.reduce((sum, v) => sum + Number(v.credit || 0), 0)), 'Total credit'),
            makeSummary('Expenses', formatMoney(vouchers.reduce((sum, v) => sum + Number(v.debit || 0), 0)), 'Total debit'),
            makeSummary('C/F Cash', formatMoney(payload.closingCash), 'Cash-In-Hand at end of day')
          ],
          sections: [
            {
              title: 'Day Book',
              description: 'Vouchers for the selected date.',
              headers: ['Voucher', 'Particulars', 'Credit', 'Debit'],
              rows: vouchers.map((v) => [v.voucherNo, [v.heading, ...(v.lines || [])].filter(Boolean).join(' / '), formatMoney(v.credit), formatMoney(v.debit)])
            }
          ],
          csvRows: vouchers,
          raw: payload
        };
      }
    },
    'voucher-summary': {
      label: 'Voucher Summary',
      description: 'Voucher totals grouped by voucher category.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.voucherSummary(token, { date: filters.date || '' });
        const payload = response.data || {};
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        return {
          title: 'Voucher Summary',
          subtitle: filters.date ? `For ${filters.date}` : 'Voucher summary',
          summary: [
            makeSummary('Vouchers', rows.reduce((sum, row) => sum + Number(row.count || 0), 0), 'Vouchers on this date'),
            makeSummary('Income', formatMoney(rows.reduce((sum, row) => sum + Number(row.credit || 0), 0)), 'Total credit'),
            makeSummary('Expenses', formatMoney(rows.reduce((sum, row) => sum + Number(row.debit || 0), 0)), 'Total debit'),
            makeSummary('Closing Cash', formatMoney(payload.closingCash), 'Cash-In-Hand at end of day')
          ],
          sections: [
            {
              title: 'Voucher Summary',
              description: 'Vouchers grouped by type and pay mode.',
              headers: ['Type Of Vouchers', 'Total Vouchers', 'Credit', 'Debit'],
              rows: rows.map((row) => [row.voucherType, row.count, formatMoney(row.credit), formatMoney(row.debit)])
            }
          ],
          csvRows: rows,
          raw: payload
        };
      }
    },
    'summary-monthly': {
      label: 'Summary / Monthly Report',
      description: 'Monthly transaction summary filtered by branch.',
      filterMode: 'monthly',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.monthlySummary(token, {
          branchCode: filters.branchCode || '',
          month: filters.month || ''
        });
        const rows = Array.isArray(response.data) ? response.data : [];
        return {
          title: 'Summary / Monthly Report',
          subtitle: `${filters.branchCode || 'All branches'} ${filters.month ? `- ${filters.month}` : ''}`.trim(),
          summary: [
            makeSummary('Rows', rows.length, 'Transaction categories'),
            makeSummary('Branch', filters.branchCode || 'All', 'Selected branch'),
            makeSummary('Month', filters.month || 'All', 'Selected period')
          ],
          sections: [
            {
              title: 'Monthly Summary',
              description: 'Transaction totals grouped by type for the selected month.',
              headers: ['Transaction Type', 'Count', 'Amount'],
              rows: rows.map((row) => [row.transactionType, row.count, formatMoney(row.amount)])
            }
          ],
          csvRows: rows
        };
      }
    },
    'demand-list-report': {
      label: 'Demand List',
      description: 'Demand totals, recovery and pending balance.',
      filterMode: 'demand-list',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.demandList(token, {
          month: filters.month || '',
          year: filters.year || '',
          date: filters.date || '',
          branchCode: filters.branchCode || ''
        });
        const rows = Array.isArray(response.data) ? response.data : [];
        return {
          title: 'Demand List',
          subtitle: filters.month || 'All months',
          summary: [
            makeSummary('Demands', rows.length, 'Total demand records'),
            makeSummary('Pending', formatMoney(rows.reduce((sum, row) => sum + Number(row.pending || 0), 0)), 'Total outstanding amount')
          ],
          sections: [
            {
              title: 'Demand List',
              description: 'Member demand and recovery status.',
              headers: ['Demand No', 'Member Code', 'Month', 'Total', 'Recovered', 'Pending', 'Status'],
              rows: rows.map((row) => [row.demandListNo, row.memberCode, row.month, formatMoney(row.total), formatMoney(row.recovered), formatMoney(row.pending), row.status])
            }
          ],
          csvRows: rows,
          raw: rows
        };
      }
    },
    'profit-loss': {
      label: 'Profit / Loss',
      description: 'Income versus expenditure snapshot.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.profitLoss(token, { uptoDate: filters.date || '' });
        const payload = response.data || {};
        const income = Array.isArray(payload.income) ? payload.income : [];
        const expense = Array.isArray(payload.expense) ? payload.expense : [];
        const totalIncome = Number(payload.totalIncome || income.reduce((sum, row) => sum + Number(row.amount || 0), 0));
        const totalExpense = Number(payload.totalExpense || expense.reduce((sum, row) => sum + Number(row.amount || 0), 0));
        const net = totalIncome - totalExpense;
        return {
          title: 'Profit / Loss',
          subtitle: filters.date ? `As on ${filters.date}` : 'Current snapshot',
          summary: [
            makeSummary('Income', formatMoney(totalIncome), 'Total income amount'),
            makeSummary('Expense', formatMoney(totalExpense), 'Total expenditure amount'),
            makeSummary('Net', formatMoney(net), 'Net profit or loss')
          ],
          sections: [
            {
              title: 'Income',
              description: 'Income side ledger balances.',
              headers: ['Ledger Code', 'Ledger Name', 'Amount'],
              rows: income.map((row) => [row.ledgerCode, row.ledgerName, formatMoney(row.amount)])
            },
            {
              title: 'Expenditure',
              description: 'Expense side ledger balances.',
              headers: ['Ledger Code', 'Ledger Name', 'Amount'],
              rows: expense.map((row) => [row.ledgerCode, row.ledgerName, formatMoney(row.amount)])
            }
          ],
          raw: payload
        };
      }
    },
    'all-member-list': {
      label: 'All Member List',
      description: 'Complete member registry with status.',
      filterMode: 'branchwise',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.allMemberList(token, { branchCode: filters?.branchCode || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        const activeCount = rows.filter((row) => String(row.status || '').toLowerCase() === 'active').length;
        return {
          title: 'All Member List',
          subtitle: 'Complete member registry',
          summary: [
            makeSummary('Members', rows.length, 'Total registered members'),
            makeSummary('Active', activeCount, 'Currently active members'),
            makeSummary('Inactive', rows.length - activeCount, 'Currently inactive members')
          ],
          sections: [
            {
              title: 'All Members',
              description: 'Registered members and their current status.',
              headers: ['Member Code', 'Member Name', 'Branch', 'Category', 'Membership No.', 'Status'],
              rows: rows.map((row) => [row.code, row.name, row.branchCode, row.category, row.membershipNo, row.status])
            }
          ],
          csvRows: rows,
          raw: rows
        };
      }
    },
    'payment-receipt-statement': {
      label: 'Statement of Payment and Receipt',
      description: 'Payment and receipt statement in voucher order.',
      filterMode: 'date-range',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.paymentReceiptStatement(token, {
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || '',
          branchCode: filters.branchCode || ''
        });
        const payload = response.data || {};
        const receipts = Array.isArray(payload.receipts) ? payload.receipts : [];
        const payments = Array.isArray(payload.payments) ? payload.payments : [];
        return {
          title: 'Statement of Payment and Receipt',
          subtitle: `${filters.dateFrom || 'Start'} to ${filters.dateTo || 'End'}`.trim(),
          summary: [
            makeSummary('Receipt Lines', receipts.length, 'Total receipt ledgers'),
            makeSummary('Payment', formatMoney(payload.paymentTotal), 'Total payment amount'),
            makeSummary('Receipt', formatMoney(payload.receiptTotal), 'Total receipt amount')
          ],
          sections: [
            {
              title: 'Receipts',
              description: 'Receipt-side ledger balances.',
              headers: ['Ledger Code', 'Ledger Name', 'Amount'],
              rows: receipts.map((row) => [row.ledgerCode, row.ledgerName, formatMoney(row.amount)])
            },
            {
              title: 'Payments',
              description: 'Payment-side ledger balances.',
              headers: ['Ledger Code', 'Ledger Name', 'Amount'],
              rows: payments.map((row) => [row.ledgerCode, row.ledgerName, formatMoney(row.amount)])
            }
          ],
          raw: payload
        };
      }
    },
    'branch-list-report': {
      label: 'Branch List',
      description: 'Branch directory with contact details.',
      filterMode: 'branchwise',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.branchList(token, { branchCode: filters?.branchCode || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        return {
          title: 'Branch List',
          subtitle: 'All branches',
          summary: [
            makeSummary('Branches', rows.length, 'Total branches found'),
            makeSummary('Head Offices', new Set(rows.map((row) => row.headOfficeCode || 'HO01').filter(Boolean)).size, 'Unique head office codes'),
            makeSummary('Districts', new Set(rows.map((row) => row.district).filter(Boolean)).size, 'Unique districts covered')
          ],
          sections: [
            {
              title: 'Branch Directory',
              description: 'Branches by district, as legacy lists them.',
              headers: ['District', 'Branch Code', 'Branch', 'Phone', 'Address'],
              rows: rows.map((row) => [row.district, row.code, row.place, row.phone, row.address])
            }
          ],
          csvRows: rows,
          raw: rows
        };
      }
    },
    'dividend-report': {
      label: 'Dividend Report',
      description: 'Dividend on member share, branchwise / memberwise / summary, on opening or closing balance.',
      filterMode: 'dividend',
      load: async (api, token, filters) => {
        const mode = filters.mode || 'branchwise-opening';
        const response = await api.banking.reports.dividendReport(token, {
          mode,
          branchCode: filters.branchCode || '',
          rate: filters.rate ?? '',
          dateFrom: filters.dateFrom || '',
          uptoDate: filters.uptoDate || ''
        });
        const rows = sortDividendRows(Array.isArray(response.data) ? response.data : [], filters.sortBy);
        const isBranchwise = mode.startsWith('branchwise');
        const shareOf = (row) => Number(row.shareTotal ?? row.share ?? 0);
        const dividendOf = (row) => Number(row.dividendTotal ?? row.dividendAmount ?? 0);
        const totalShare = rows.reduce((sum, row) => sum + shareOf(row), 0);
        const totalDividend = rows.reduce((sum, row) => sum + dividendOf(row), 0);
        const modeLabel = DIVIDEND_MODES.find((option) => option.value === mode)?.label || 'Dividend';
        return {
          title: 'Dividend Report',
          subtitle: `${modeLabel} · ${filters.branchCode || 'All branches'}`,
          summary: [
            makeSummary(isBranchwise ? 'Branches' : 'Members', rows.length, 'Rows in report'),
            makeSummary('Share', formatAmount(totalShare), 'Total member share'),
            makeSummary('Dividend', formatAmount(totalDividend), 'Total dividend payable')
          ],
          sections: [
            isBranchwise
              ? {
                title: modeLabel,
                description: 'Dividend on member share, totalled by branch.',
                headers: ['Code', 'Branch', 'Members', "Member's Share", 'Dividend'],
                rows: rows.map((row) => [row.branch, row.branchName, row.memberCount, formatAmount(row.shareTotal), formatAmount(row.dividendTotal)])
              }
              : {
                title: modeLabel,
                description: 'Dividend on member share, one row per member.',
                headers: ['Branch Code', 'Branch', 'Code', 'PF', "Member's Name", 'Grade', 'Share', 'Dividend'],
                rows: rows.map((row) => [row.branch, row.branchName, row.memberCode, row.pfNo, row.memberName, row.grade, formatAmount(row.share), formatAmount(row.dividendAmount)])
              }
          ],
          csvRows: rows,
          raw: { mode, rows }
        };
      }
    },
    'employee-ledger': {
      label: "Employee Ledger",
      description: 'Employee ledger with running balance across housing loan, vehicle loan and grain advance.',
      filterMode: 'employee-ledger',
      load: async (api, token, filters) => {
        const response = !filters.employeeCode ? {} : await api.banking.reports.employeeLedger(token, {
          employeeCode: filters.employeeCode || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || ''
        });
        const payload = response.data || {};
        return {
          title: 'Employee Ledger',
          subtitle: payload.employee?.name || payload.employee?.code || 'Employee',
          summary: [],
          sections: [],
          raw: payload
        };
      }
    },
    // Legacy's own two report names for the exact same query/output (verified
    // byte-identical against a real capture) — reuses the Member Ledger call
    // and print template rather than reimplementing it.
    'member-ac-status': {
      label: "Member's A/c Status",
      description: 'Same output as Member Ledger.',
      filterMode: 'member-ledger',
      load: async (api, token, filters) => {
        // Nothing to ask the server for until a member is picked (it would 404).
        const response = !filters.memberCode ? {} : await api.banking.reports.memberLedger(token, {
          memberCode: filters.memberCode || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || ''
        });
        const payload = response.data || {};
        const member = payload.member || {};
        return {
          title: "Member's A/c Status",
          subtitle: `${member.name || member.code || 'Member'} ${member.membershipNo ? `- ${member.membershipNo}` : ''}`.trim(),
          summary: [],
          sections: [],
          raw: payload
        };
      }
    },
    // These 5 all render through a dedicated PrintShell template in
    // ReportViewerPage's PRINT_TEMPLATES map (matching the legacy Crystal
    // Report look), not the generic summary-card + table canvas — so `raw`
    // is all that matters here; `summary`/`sections` are left empty.
    'statement-of-ledgers': {
      label: 'Statement of Ledgers',
      description: 'Ledger opening/credit/debit/closing grouped by nature.',
      filterMode: 'statement-of-ledgers',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.accountStatement(token, {
          type: 'ledger',
          nature: filters.group || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || ''
        });
        const rows = Array.isArray(response.data) ? response.data : [];
        return { title: 'Statement of Ledgers', summary: [], sections: [], raw: rows, csvRows: rows };
      }
    },
    'statement-of-account': {
      label: 'Statement of Account',
      description: 'Voucher-wise register for a single ledger.',
      filterMode: 'statement-of-account',
      load: async (api, token, filters, lookups) => {
        if (!filters.ledgerCode) {
          const response = await api.banking.reports.accountStatement(token, {
            type: 'ledger-statements',
            dateFrom: filters.dateFrom || '',
            dateTo: filters.dateTo || ''
          });
          const accounts = Array.isArray(response.data) ? response.data : [];
          const csvRows = accounts.flatMap((account) => account.rows.map((row) => ({ account: account.ledgerName, ...row })));
          return { title: 'Statement of Account', summary: [], sections: [], raw: { accounts }, csvRows };
        }
        const response = await api.banking.reports.accountStatement(token, {
          type: 'ledger',
          ledgerId: filters.ledgerCode,
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || ''
        });
        const rows = Array.isArray(response.data) ? response.data : [];
        const ledger = (Array.isArray(lookups?.ledgers) ? lookups.ledgers : []).find((item) => item.code === filters.ledgerCode);
        const ledgerName = ledger ? `${ledger.code} - ${ledger.name}` : filters.ledgerCode;
        return { title: 'Statement of Account', summary: [], sections: [], raw: { rows, ledgerName }, csvRows: rows };
      }
    },
    // No member/branch filter by design — legacy prints every member on this
    // report regardless of what's selected in its own Code/Member fields
    // (verified against a real capture), so the new UI doesn't offer one either.
    'members-opening-balance': {
      label: "Members' Opening Balance",
      description: 'Opening balance for every member.',
      filterMode: 'all-members-snapshot',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.accountStatement(token, { type: 'members-opening-balance', fyStart: filters.dateFrom || '', fyEnd: filters.dateTo || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        return { title: "Members' Opening Balance", summary: [], sections: [], raw: rows, csvRows: rows };
      }
    },
    'members-closing-balance': {
      label: "Members' Closing Balance",
      description: 'Closing balance and interest-to-date for every member.',
      filterMode: 'all-members-snapshot',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.accountStatement(token, { type: 'members-closing-balance', fyStart: filters.dateFrom || '', fyEnd: filters.dateTo || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        return { title: "Members' Closing Balance", summary: [], sections: [], raw: rows, csvRows: rows };
      }
    },
    'statement-of-member-ledger': {
      label: 'Statement of Member Ledger',
      description: 'Period credit/debit/balance/interest totals for every member.',
      filterMode: 'date-range',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.accountStatement(token, {
          type: 'statement-of-member-ledger',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || ''
        });
        const rows = Array.isArray(response.data) ? response.data : [];
        return { title: 'Statement of Member Ledger', summary: [], sections: [], raw: rows, csvRows: rows };
      }
    }
  };

  return configs[reportKey] || null;
}

