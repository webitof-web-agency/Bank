function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonthString() {
  return new Date().toISOString().slice(0, 7);
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-IN').format(number);
}

function formatMoney(value) {
  return formatNumber(Number(value || 0));
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

function getDefaultBranchCode(user = {}) {
  if (user && user.isSuperAdmin) return '';
  return String(user?.branchCode || '').trim().toUpperCase();
}

export function getReportDefaultFilters(reportKey = '', lookups = {}, user = {}) {
  if (reportKey === 'member-ledger') {
    return {
      memberCode: firstCode(lookups.members),
      dateFrom: '',
      dateTo: ''
    };
  }

  if (reportKey === 'account-statement-view') {
    return {
      search: '',
      nature: '',
      uptoDate: ''
    };
  }

  if (reportKey === 'summary-monthly') {
    return {
      branchCode: getDefaultBranchCode(user),
      month: currentMonthString()
    };
  }

  if (reportKey === 'demand-list-report') {
    return { branchCode: getDefaultBranchCode(user), month: currentMonthString() };
  }

  if (reportKey === 'dividend-report') {
    return { rate: 8 };
  }

  if (reportKey === 'payment-receipt-statement') {
    return { dateFrom: '', dateTo: '' };
  }

  if (['balance-sheet', 'trial-balance', 'cash-book', 'day-book', 'voucher-summary', 'profit-loss'].includes(reportKey)) {
    return { date: todayString() };
  }

  if (reportKey === 'all-member-list' || reportKey === 'branch-list-report' || reportKey === 'dividend-report') {
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
        const response = await api.banking.reports.accountStatement(token, {
          search: filters.search || '',
          nature: filters.nature || '',
          uptoDate: filters.uptoDate || ''
        });
        const rows = Array.isArray(response.data) ? response.data : [];
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
        const response = await api.banking.reports.memberLedger(token, {
          memberCode: filters.memberCode || '',
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || ''
        });
        const payload = response.data || {};
        const member = payload.member || {};
        const balances = payload.balances || {};
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        const summaryBalance = rows.length ? rows[rows.length - 1].balance : 0;

        return {
          title: "Member Ledger / Member's A/c Status",
          subtitle: `${member.name || member.code || 'Member'} ${member.membershipNo ? `- ${member.membershipNo}` : ''}`.trim(),
          summary: [
            makeSummary('Member', member.code || '-', 'Selected member code'),
            makeSummary('Membership No', member.membershipNo || member.memNo || '-', 'Member registration no'),
            makeSummary('Running Balance', formatMoney(summaryBalance), 'Closing balance')
          ],
          sections: [
            {
              title: 'Member Ledger',
              description: 'Voucher-wise running balance for the selected member.',
              headers: ['Voucher', 'Date', 'Particulars', 'Debit', 'Credit', 'Running Balance', 'Narration'],
              rows: rows.map((row) => [
                row.voucherNo,
                row.date,
                row.particulars,
                formatMoney(row.debit),
                formatMoney(row.credit),
                formatMoney(row.balance),
                row.narration || ''
              ])
            },
            {
              title: 'Member Balances',
              description: 'Current balance heads linked to the member account.',
              headers: ['Balance Head', 'Amount'],
              rows: [
                ['Share', formatMoney(balances.share)],
                ['Compulsory Deposit', formatMoney(balances.compulsoryDeposit)],
                ['Special Saving', formatMoney(balances.specialSaving)],
                ['Provident Fund', formatMoney(balances.providentFund)],
                ['Loan Against Deposit', formatMoney(balances.loanAgainstDeposit)],
                ['Insurance Premium', formatMoney(balances.insurancePremium)],
                ['Loan Outstanding', formatMoney(balances.loanOutstanding)]
              ]
            }
          ],
          csvRows: rows.map((row) => ({
            voucherNo: row.voucherNo,
            date: row.date,
            particulars: row.particulars,
            debit: row.debit,
            credit: row.credit,
            runningBalance: row.balance,
            narration: row.narration || ''
          }))
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
        const liabilities = Array.isArray(payload.liabilities) ? payload.liabilities : [];
        const assets = Array.isArray(payload.assets) ? payload.assets : [];

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
          ]
        };
      }
    },
    'trial-balance': {
      label: 'Trial Balance',
      description: 'Ledger debit and credit balances for trial review.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.trialBalance(token, { uptoDate: filters.date || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
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
          csvRows: rows
        };
      }
    },
    'cash-book': {
      label: 'Cash Book',
      description: 'Cash ledger entries posted for the selected date.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.cashBook(token, { date: filters.date || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        return {
          title: 'Cash Book',
          subtitle: filters.date ? `For ${filters.date}` : 'All posted cash entries',
          summary: [
            makeSummary('Rows', rows.length, 'Total transactions'),
            makeSummary('Receipts', formatMoney(rows.reduce((sum, row) => sum + Number(row.receipt || 0), 0)), 'Total cash received'),
            makeSummary('Payments', formatMoney(rows.reduce((sum, row) => sum + Number(row.payment || 0), 0)), 'Total cash paid')
          ],
          sections: [
            {
              title: 'Cash Book',
              description: 'Cash receipts and payments.',
              headers: ['Voucher', 'Date', 'Particulars', 'Receipt', 'Payment'],
              rows: rows.map((row) => [row.voucherNo, row.date, row.particulars, formatMoney(row.receipt), formatMoney(row.payment)])
            }
          ],
          csvRows: rows
        };
      }
    },
    'day-book': {
      label: 'Day Book',
      description: 'Voucher-wise day book with journal line details.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.dayBook(token, { date: filters.date || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        return {
          title: 'Day Book',
          subtitle: filters.date ? `For ${filters.date}` : 'All posted journal entries',
          summary: [
            makeSummary('Rows', rows.length, 'Total journal lines'), 
            makeSummary('Vouchers', new Set(rows.map((row) => row.voucherNo)).size, 'Unique vouchers posted')
          ],
          sections: [
            {
              title: 'Day Book',
              description: 'Voucher line items for the selected period.',
              headers: ['Voucher', 'Date', 'Ledger Code', 'Particulars', 'Debit', 'Credit'],
              rows: rows.map((row) => [row.voucherNo, row.date, row.ledgerCode, row.particulars, formatMoney(row.debit), formatMoney(row.credit)])
            }
          ],
          csvRows: rows
        };
      }
    },
    'voucher-summary': {
      label: 'Voucher Summary',
      description: 'Voucher totals grouped by voucher category.',
      filterMode: 'as-on-date',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.voucherSummary(token, { date: filters.date || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        return {
          title: 'Voucher Summary',
          subtitle: filters.date ? `For ${filters.date}` : 'Posted vouchers',
          summary: [
            makeSummary('Categories', rows.length, 'Voucher types found'), 
            makeSummary('Amount', formatMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)), 'Total voucher amount')
          ],
          sections: [
            {
              title: 'Voucher Summary',
              description: 'Posted voucher totals grouped by category.',
              headers: ['Voucher Category', 'Amount'],
              rows: rows.map((row) => [row.voucherCategory, formatMoney(row.amount)])
            }
          ],
          csvRows: rows
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
      filterMode: 'month-only',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.demandList(token, { month: filters.month || '', branchCode: filters.branchCode || '' });
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
              rows: rows.map((row) => [row.demandNo, row.memberCode, row.month, formatMoney(row.total), formatMoney(row.recovered), formatMoney(row.pending), row.status])
            }
          ],
          csvRows: rows
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
          ]
        };
      }
    },
    'all-member-list': {
      label: 'All Member List',
      description: 'Complete member registry with status.',
      filterMode: 'none',
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
          csvRows: rows
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
        const rows = Array.isArray(response.data) ? response.data : [];
        return {
          title: 'Statement of Payment and Receipt',
          subtitle: `${filters.dateFrom || 'Start'} to ${filters.dateTo || 'End'}`.trim(),
          summary: [
            makeSummary('Rows', rows.length, 'Total voucher entries'),
            makeSummary('Payment', formatMoney(rows.reduce((sum, row) => sum + Number(row.payment || 0), 0)), 'Total payment amount'),
            makeSummary('Receipt', formatMoney(rows.reduce((sum, row) => sum + Number(row.receipt || 0), 0)), 'Total receipt amount')
          ],
          sections: [
            {
              title: 'Payment and Receipt',
              description: 'Voucher wise payment and receipt rows.',
              headers: ['Voucher No', 'Date', 'Voucher Category', 'Party Code', 'Payment', 'Receipt'],
              rows: rows.map((row) => [row.voucherNo, row.date, row.voucherCategory, row.partyCode, formatMoney(row.payment), formatMoney(row.receipt)])
            }
          ],
          csvRows: rows
        };
      }
    },
    'branch-list-report': {
      label: 'Branch List',
      description: 'Branch directory with contact details.',
      filterMode: 'none',
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
              description: 'Branch code, head office mapping, place and contact information.',
              headers: ['Branch Code', 'Head Office Code', 'Place', 'District', 'Phone', 'Address'],
              rows: rows.map((row) => [row.code, row.headOfficeCode || 'HO01', row.place, row.district, row.phone, row.address])
            }
          ],
          csvRows: rows
        };
      }
    },
    'dividend-report': {
      label: 'Dividend Report',
      description: 'Dividend calculation based on member share balance.',
      filterMode: 'rate',
      load: async (api, token, filters) => {
        const response = await api.banking.reports.dividendReport(token, { rate: Number(filters.rate || 8), branchCode: filters.branchCode || '' });
        const rows = Array.isArray(response.data) ? response.data : [];
        const totalDividend = rows.reduce((sum, row) => sum + Number(row.dividendAmount || 0), 0);
        return {
          title: 'Dividend Report',
          subtitle: `Rate ${Number(filters.rate || 8)}%`,
          summary: [
            makeSummary('Members', rows.length, 'Eligible members'),
            makeSummary('Rate', `${Number(filters.rate || 8)}%`, 'Dividend percentage'),
            makeSummary('Dividend', formatMoney(totalDividend), 'Total dividend payable')
          ],
          sections: [
            {
              title: 'Dividend Calculation',
              description: 'Dividend based on member share balance.',
              headers: ['Member Code', 'Member Name', 'Share Balance', 'Dividend Rate', 'Dividend Amount'],
              rows: rows.map((row) => [row.memberCode, row.memberName, formatMoney(row.shareBalance), `${row.dividendRate}%`, formatMoney(row.dividendAmount)])
            }
          ],
          csvRows: rows
        };
      }
    }
  };

  return configs[reportKey] || null;
}

