const bankingService = require('../services/banking.service');

function buildCrudControllers(resource, { allowDelete = true } = {}) {
  return {
    async list(req, res, next) {
      try {
        const rows = await bankingService.listResource(resource, req.query.search || '', req.user || {});
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
  managers: buildCrudControllers('managers'),
  branches: buildCrudControllers('branches'),
  employees: buildCrudControllers('employees'),
  members: buildCrudControllers('members'),
  ledgers: buildCrudControllers('ledgers'),
  rates: buildCrudControllers('rates'),
  bankAccounts: buildCrudControllers('bankAccounts'),
  demands: buildCrudControllers('demands'),
  noInterestMembers: buildCrudControllers('noInterestMembers'),
  bankTransactions: buildCrudControllers('bankTransactions')
};

const transactions = {
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
        status: req.query.status || '',
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
      const record = await bankingService.getResource('vouchers', req.params.id, req.user || {});
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
      const ok = await bankingService.deleteVoucher(req.params.id);
      if (!ok) {
        return res.status(404).json({ success: false, message: 'Voucher not found' });
      }
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      next(error);
    }
  },
  async reverseVoucher(req, res, next) {
    try {
      const record = await bankingService.reverseVoucher(req.params.id, {
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
  async listBankTransactions(req, res, next) {
    try {
      const rows = await bankingService.buildBankTransactionRows({
        user: req.user || {},
        search: req.query.search || '',
        status: req.query.status || '',
        bankAccountCode: req.query.bankAccountCode || '',
        dateFrom: req.query.dateFrom || req.query.fyStart || '',
        dateTo: req.query.dateTo || req.query.fyEnd || ''
      });
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  },
  async createBankTransaction(req, res, next) {
    try {
      const record = await bankingService.createBankTransaction(req.body || {}, {
        actorUserId: req.user?.id || null,
          actorUser: req.user || null
      });
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  },
  async updateBankTransaction(req, res, next) {
    try {
      const record = await bankingService.updateBankTransaction(req.params.id, req.body || {}, {
        actorUserId: req.user?.id || null,
          actorUser: req.user || null
      });
      if (!record) {
        return res.status(404).json({ success: false, message: 'Bank transaction not found' });
      }
      res.json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  },
  async deleteBankTransaction(req, res, next) {
    try {
      const ok = await bankingService.deleteBankTransaction(req.params.id);
      if (!ok) {
        return res.status(404).json({ success: false, message: 'Bank transaction not found' });
      }
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
};

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
  async accountStatement(req, res, next) {
    try {
      const data = await bankingService.buildAccountStatementReport({
        user: req.user || {},
        search: req.query.search || '',
        nature: req.query.nature || '',
        uptoDate: req.query.date || req.query.uptoDate || req.query.fyEnd || ''
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
        uptoDate: req.query.date || req.query.uptoDate || req.query.fyEnd || ''
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
      const data = await bankingService.buildCashBookReport({ date: req.query.date || req.query.fyEnd || '', user: req.user || {} });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async dayBook(req, res, next) {
    try {
      const data = await bankingService.buildDayBookReport({ date: req.query.date || req.query.fyEnd || '', user: req.user || {} });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async voucherSummary(req, res, next) {
    try {
      const data = await bankingService.buildVoucherSummaryReport({ date: req.query.date || req.query.fyEnd || '', user: req.user || {} });
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
        month: req.query.month || ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async demandList(req, res, next) {
    try {
      const data = await bankingService.buildDemandListReport({ month: req.query.month || '', user: req.user || {} });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async allMemberList(req, res, next) {
    try {
      const data = await bankingService.buildAllMemberListReport({ user: req.user || {} });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async paymentReceiptStatement(req, res, next) {
    try {
      const data = await bankingService.buildPaymentReceiptStatementReport({
        user: req.user || {},
        dateFrom: req.query.dateFrom || req.query.from || req.query.fyStart || '',
        dateTo: req.query.dateTo || req.query.to || req.query.fyEnd || ''
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async branchList(req, res, next) {
    try {
      const data = await bankingService.buildBranchListReport({ user: req.user || {} });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
  async dividendReport(req, res, next) {
    try {
      const data = await bankingService.buildDividendReport({
        user: req.user || {},
        rate: req.query.rate ? Number(req.query.rate) : 8
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = {
  reports,
  resources,
  transactions
};




