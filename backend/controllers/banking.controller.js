const bankingService = require('../services/banking.service');

function buildCrudControllers(resource, { allowDelete = true } = {}) {
  return {
    async list(req, res, next) {
      try {
        const rows = await bankingService.listResource(resource, req.query.search || '', req.user || {}, {
          fyStart: req.query.fyStart || '',
          fyEnd: req.query.fyEnd || ''
        });
        res.json({ success: true, data: rows });
      } catch (error) {
        next(error);
      }
    },
    async get(req, res, next) {
      try {
        const record = await bankingService.getResource(resource, req.params.id, req.user || {});
        if (!record) {
          return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, data: record });
      } catch (error) {
        next(error);
      }
    },
    async create(req, res, next) {
      try {
        const record = await bankingService.createResource(resource, req.body || {}, {
          actorUserId: req.user?.id || null,
          actorUser: req.user || null
        });
        res.status(201).json({ success: true, data: record });
      } catch (error) {
        next(error);
      }
    },
    async update(req, res, next) {
      try {
        const record = await bankingService.updateResource(resource, req.params.id, req.body || {}, {
          actorUserId: req.user?.id || null,
          actorUser: req.user || null
        });
        if (!record) {
          return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, data: record });
      } catch (error) {
        next(error);
      }
    },
    async delete(req, res, next) {
      try {
        if (!allowDelete) {
          return res.status(400).json({ success: false, message: 'This record cannot be deleted' });
        }
        const ok = await bankingService.deleteResource(resource, req.params.id, { actorUser: req.user || null });
        if (!ok) {
          return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, message: 'Deleted successfully' });
      } catch (error) {
        next(error);
      }
    },
    async restore(req, res, next) {
      try {
        const ok = await bankingService.restoreResource(resource, req.params.id, { actorUser: req.user || null });
        if (!ok) {
          return res.status(404).json({ success: false, message: 'Deleted record not found' });
        }
        res.json({ success: true, message: 'Restored successfully' });
      } catch (error) {
        next(error);
      }
    }
  };
}

function buildSingletonControllers(resource) {
  return {
    async get(req, res, next) {
      try {
        const record = await bankingService.getSingle(resource);
        if (!record) {
          return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json({ success: true, data: record });
      } catch (error) {
        next(error);
      }
    },
    async update(req, res, next) {
      try {
        const record = await bankingService.updateResource(resource, null, req.body || {}, { actorUserId: req.user?.id || null,
          actorUser: req.user || null });
        res.json({ success: true, data: record });
      } catch (error) {
        next(error);
      }
    }
  };
}

const resources = {
  society: buildSingletonControllers('society'),
  committee: buildSingletonControllers('committee'),
  branches: buildCrudControllers('branches'),
  employees: buildCrudControllers('employees'),
  members: buildCrudControllers('members'),
  ledgers: buildCrudControllers('ledgers'),
  rates: {
    async get(req, res, next) {
      try {
        const data = await bankingService.getGlobalRatesConfig();
        res.json({ success: true, data });
      } catch (error) {
        next(error);
      }
    },
    async update(req, res, next) {
      try {
        const data = await bankingService.updateGlobalRatesConfig(req.body || {});
        res.json({ success: true, data });
      } catch (error) {
        next(error);
      }
    }
  },
  bankAccounts: buildCrudControllers('bankAccounts'),
  demandLists: buildCrudControllers('demandLists'),
  demandLines: buildCrudControllers('demandLines'),
  memberDemandDefaults: buildCrudControllers('memberDemandDefaults'),
  recoveryLines: buildCrudControllers('recoveryLines'),
  noInterestMembers: buildCrudControllers('noInterestMembers'),
  bankTransactions: buildCrudControllers('bankTransactions')
};

const transactions = {
  async getNextVoucher(req, res, next) {
    try {
      const branchCode = req.query.branchCode || '';
      const voucherNo = await bankingService.getNextVoucherNo(branchCode);
      res.json({ success: true, data: { voucherNo } });
    } catch (error) {
      next(error);
    }
  },
  async catalog(req, res, next) {
    try {
      const rows = await bankingService.getTransactionCatalog();
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  },
  async listVouchers(req, res, next) {
    try {
      const rows = await bankingService.buildVoucherRows({
        user: req.user || {},
        search: req.query.search || '',
        partyType: req.query.partyType || '',
        branchCode: req.query.branchCode || '',
        dateFrom: req.query.dateFrom || req.query.fyStart || '',
        dateTo: req.query.dateTo || req.query.fyEnd || ''
      });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  },
  async getVoucher(req, res, next) {
    try {
      const id = req.params.id;
      const record = id.startsWith('legacy:')
        ? await bankingService.getHistoricalVoucherById(id.slice('legacy:'.length), req.user || {})
        : await bankingService.getResource('vouchers', id, req.user || {});
      if (!record) {
        return res.status(404).json({ success: false, message: 'Voucher not found' });
      }
      res.json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  },
  async createVoucher(req, res, next) {
    try {
      const record = await bankingService.createVoucher(req.body || {}, {
        actorUserId: req.user?.id || null,
          actorUser: req.user || null
      });
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  },
  async updateVoucher(req, res, next) {
    try {
      if (req.params.id.startsWith('legacy:')) {
        return res.status(400).json({ success: false, message: 'This is a read-only historical record and cannot be edited.' });
      }
      const record = await bankingService.updateVoucher(req.params.id, req.body || {}, {
        actorUserId: req.user?.id || null,
          actorUser: req.user || null
      });
      if (!record) {
        return res.status(404).json({ success: false, message: 'Voucher not found' });
      }
      res.json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  },
  async deleteVoucher(req, res, next) {
    try {
      if (req.params.id.startsWith('legacy:')) {
        return res.status(400).json({ success: false, message: 'This is a read-only historical record and cannot be deleted.' });
      }
      const ok = await bankingService.deleteVoucher(req.params.id, {
        actorUserId: req.user?.id || null,
        actorUser: req.user || null
      });
      if (!ok) {
        return res.status(404).json({ success: false, message: 'Voucher not found' });
      }
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      next(error);
    }
  },
  async restoreVoucher(req, res, next) {
    try {
      const ok = await bankingService.restoreVoucher(req.params.id, {
        actorUserId: req.user?.id || null,
        actorUser: req.user || null
      });
      if (!ok) {
        return res.status(404).json({ success: false, message: 'Deleted voucher not found' });
      }
      res.json({ success: true, message: 'Restored successfully' });
    } catch (error) {
      next(error);
    }
  },

};

// Every report request carries the header FY switcher as fyStart/fyEnd (see
// frontend api.js). Explicit filter dates always win; the FY is the fallback
// window so no report silently spans every year.
function reportRange(query = {}) {
  return {
    dateFrom: query.dateFrom || query.from || query.fyStart || '',
    dateTo: query.dateTo || query.to || query.date || query.uptoDate || query.fyEnd || ''
  };
}

const reports = {
  async dashboard(req, res, next) {
    try {
      const data = await bankingService.buildDashboardQuickSummary({
        user: req.user || {},
        fyStart: req.query.fyStart || '',
        fyEnd: req.query.fyEnd || ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async lookups(req, res, next) {
    try {
      const data = await bankingService.getLookups(req.user || {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async memberLedger(req, res, next) {
    try {
      const data = await bankingService.buildMemberLedgerReport({
        user: req.user || {},
        memberCode: req.query.memberCode || req.query.code || '',
        dateFrom: req.query.dateFrom || req.query.from || req.query.fyStart || '',
        dateTo: req.query.dateTo || req.query.to || req.query.fyEnd || ''
      });
      if (!data) {
        return res.status(404).json({ success: false, message: 'Member not found' });
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async employeeLedger(req, res, next) {
    try {
      const data = await bankingService.buildEmployeeLedgerReport({
        user: req.user || {},
        employeeCode: req.query.employeeCode || req.query.code || '',
        dateFrom: req.query.dateFrom || req.query.from || req.query.fyStart || '',
        dateTo: req.query.dateTo || req.query.to || req.query.fyEnd || ''
      });
      if (!data) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async accountStatement(req, res, next) {
    try {
      const data = await bankingService.buildAccountStatementReport({
        user: req.user || {},
        type: req.query.type || 'ledger',
        ledgerId: req.query.ledgerId || req.query.ledger || '',
        memberId: req.query.memberId || req.query.memberCode || '',
        employeeId: req.query.employeeId || req.query.employeeCode || '',
        ...reportRange(req.query),
        uptoDate: req.query.uptoDate || '',
        search: req.query.search || '',
        nature: req.query.nature || ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async trialBalance(req, res, next) {
    try {
      const data = await bankingService.buildTrialBalanceReport({
        user: req.user || {},
        ...reportRange(req.query)
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async balanceSheet(req, res, next) {
    try {
      const data = await bankingService.buildBalanceSheetReport({
        user: req.user || {},
        uptoDate: req.query.date || req.query.uptoDate || req.query.fyEnd || ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async profitLoss(req, res, next) {
    try {
      const data = await bankingService.buildProfitLossReport({
        user: req.user || {},
        uptoDate: req.query.date || req.query.uptoDate || req.query.fyEnd || ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async cashBook(req, res, next) {
    try {
      // A single Report Date means that one day; otherwise the whole FY.
      const date = req.query.date || '';
      const range = reportRange(req.query);
      const data = await bankingService.buildCashBookReport({
        dateFrom: req.query.dateFrom || req.query.from || date || range.dateFrom,
        dateTo: range.dateTo,
        user: req.user || {}
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async dayBook(req, res, next) {
    try {
      const date = req.query.date || '';
      const range = reportRange(req.query);
      const data = await bankingService.buildDayBookReport({
        dateFrom: date || range.dateFrom,
        dateTo: range.dateTo,
        user: req.user || {}
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async voucherSummary(req, res, next) {
    try {
      const date = req.query.date || '';
      const range = reportRange(req.query);
      const data = await bankingService.buildVoucherSummaryReport({
        dateFrom: date || range.dateFrom,
        dateTo: range.dateTo,
        user: req.user || {}
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async monthlySummary(req, res, next) {
    try {
      const data = await bankingService.buildMonthlySummaryReport({
        user: req.user || {},
        branchCode: req.query.branchCode || '',
        month: req.query.month || '',
        ...reportRange(req.query)
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  // Demand Entry: demand list header + member component lines.
  async demandEntryList(req, res, next) {
    try {
      const data = await bankingService.listDemandEntries({ branchCode: req.query.branchCode || '', fyStart: req.query.fyStart || '', fyEnd: req.query.fyEnd || '', user: req.user || {} });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
  async demandEntryMembers(req, res, next) {
    try {
      const data = await bankingService.getDemandEntryMembers({ branchCode: req.query.branchCode || '', user: req.user || {} });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
  async demandEntryGet(req, res, next) {
    try {
      const data = await bankingService.getDemandEntry(req.params.id, { user: req.user || {} });
      if (!data) return res.status(404).json({ success: false, message: 'Demand list not found' });
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
  async demandEntrySave(req, res, next) {
    try {
      const data = await bankingService.saveDemandEntry(req.body || {}, {
        id: req.params.id || '', fyStart: req.query.fyStart || req.body?.fyStart || '', fyEnd: req.query.fyEnd || req.body?.fyEnd || '', user: req.user || {}
      });
      if (!data) return res.status(404).json({ success: false, message: 'Demand list not found' });
      res.status(req.params.id ? 200 : 201).json({ success: true, data });
    } catch (error) { next(error); }
  },
  async demandEntryDelete(req, res, next) {
    try {
      const deleted = await bankingService.deleteDemandEntry(req.params.id, { user: req.user || {} });
      if (!deleted) return res.status(404).json({ success: false, message: 'Demand list not found' });
      res.json({ success: true });
    } catch (error) { next(error); }
  },
  // Recovery -> Add From Demand List selector (pending lines of one month).
  async recoveryDemandCandidates(req, res, next) {
    try {
      const data = await bankingService.buildRecoveryDemandCandidates({
        branchCode: req.query.branchCode || '',
        month: req.query.month || '',
        year: req.query.year || '',
        fyStart: req.query.fyStart || '',
        fyEnd: req.query.fyEnd || '',
        user: req.user || {}
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async demandList(req, res, next) {
    try {
      const data = await bankingService.buildDemandListReport({
        month: req.query.month || '',
        year: req.query.year || '',
        date: req.query.date || '',
        fyStart: req.query.fyStart || '',
        fyEnd: req.query.fyEnd || '',
        branchCode: req.query.branchCode || '',
        user: req.user || {}
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async allMemberList(req, res, next) {
    try {
      const data = await bankingService.buildAllMemberListReport({
        user: req.user || {},
        branchCode: req.query.branchCode || '',
        uptoDate: reportRange(req.query).dateTo
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async paymentReceiptStatement(req, res, next) {
    try {
      const data = await bankingService.buildPaymentReceiptStatementReport({
        user: req.user || {},
        ...reportRange(req.query)
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async branchList(req, res, next) {
    try {
      const data = await bankingService.buildBranchListReport({
        user: req.user || {},
        branchCode: req.query.branchCode || ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async dividendReport(req, res, next) {
    try {
      const data = await bankingService.buildDividendReport({
        user: req.user || {},
        mode: req.query.mode,
        dateFrom: req.query.dateFrom || req.query.fyStart || '',
        uptoDate: req.query.uptoDate || req.query.dateTo || req.query.fyEnd || '',
        branchCode: req.query.branchCode || '',
        rate: req.query.rate ?? ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
};

const auditLog = {
  async list(req, res, next) {
    try {
      const data = await bankingService.listAuditLog({
        tableName: req.query.tableName || '',
        recordId: req.query.recordId || '',
        dateFrom: req.query.dateFrom || '',
        dateTo: req.query.dateTo || '',
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 50
      });
      res.json({ success: true, ...data });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = {
  reports,
  resources,
  transactions,
  auditLog
};




