'use strict';

const appPortal = require('../services/appPortal.service');
const { revokeSession } = require('../services/session.service');

// Resolve the FY start-year from a request, defaulting to the current FY.
function resolveStartYear(query) {
  const fromLabel = appPortal.startYearFromLabel(query.fy);
  if (fromLabel) return fromLabel;
  const direct = Number(query.startYear);
  if (Number.isFinite(direct)) return direct;
  return appPortal.currentFyStartYear();
}

async function withAccount(req) {
  return appPortal.resolveAccount(req.principal);
}

module.exports = {
  async config(_req, res, next) {
    try {
      res.json({ success: true, data: await appPortal.getAppConfig() });
    } catch (error) {
      next(error);
    }
  },

  async version(_req, res, next) {
    try {
      res.json({ success: true, data: await appPortal.getAppVersion() });
    } catch (error) {
      next(error);
    }
  },

  async login(req, res, next) {
    try {
      const { mobile, mobileNo, password } = req.body || {};
      const result = await appPortal.login(mobile || mobileNo, password);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async logout(req, res, next) {
    try {
      await revokeSession({ jti: req.principal.jti, exp: req.principal.exp });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body || {};
      if (confirmPassword !== undefined && newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'New passwords do not match' });
      }
      const result = await appPortal.changePassword(req.principal, currentPassword, newPassword);
      // The old token stops working with the old password; end it explicitly too.
      await revokeSession({ jti: req.principal.jti, exp: req.principal.exp });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },

  async me(req, res, next) {
    try {
      const account = await withAccount(req);
      res.json({ success: true, data: { account: await appPortal.getProfile(account), ledgers: appPortal.ledgersFor(account.type) } });
    } catch (error) {
      next(error);
    }
  },

  async financialYears(req, res, next) {
    try {
      const account = await withAccount(req);
      res.json({ success: true, data: appPortal.financialYears(account) });
    } catch (error) {
      next(error);
    }
  },

  async profile(req, res, next) {
    try {
      const account = await withAccount(req);
      res.json({ success: true, data: await appPortal.getProfile(account) });
    } catch (error) {
      next(error);
    }
  },

  async summary(req, res, next) {
    try {
      const account = await withAccount(req);
      const data = await appPortal.getSummary(account, resolveStartYear(req.query));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },

  async ledgerTicket(req, res, next) {
    try {
      res.json({ success: true, data: await appPortal.ledgerTicket(req.principal, resolveStartYear(req.query)) });
    } catch (error) {
      next(error);
    }
  },

  async ledgerView(req, res, next) {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ success: true, data: await appPortal.ledgerView(req.query.ticket) });
    } catch (error) {
      next(error);
    }
  },

  async statement(req, res, next) {
    try {
      const account = await withAccount(req);
      const data = await appPortal.getStatement(account, req.params.ledger, resolveStartYear(req.query));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
};
