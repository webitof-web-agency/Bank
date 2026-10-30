'use strict';

// Member / employee mobile-app portal API (read-only, bar the account's own
// password change). Mounted at /api/app, BEFORE the admin requireAuth guard
// in routes/index.js, with its own app-token auth. Everything under /me is scoped to the logged-in account.

const express = require('express');
const controller = require('../controllers/appPortal.controller');
const { requireAppAuth } = require('../middlewares/appAuth');
const { authRateLimit, createRateLimiter } = require('../middlewares/rateLimit');

const router = express.Router();

// Public: society name/logo and theme colours, shown before login.
router.get('/config', controller.config);

// Public: the latest app release (Settings -> Mobile App), checked on launch.
router.get('/version', controller.version);

// Per mobile number, whatever the client IP: slows password guessing spread
// over many addresses (the web login's accountRateLimit keys on `identifier`).
const mobileRateLimit = createRateLimiter({
  windowMs: Number(process.env.ACCOUNT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.ACCOUNT_RATE_LIMIT_MAX || 10),
  keyGenerator: (req) => `app-mobile:${String(req.body?.mobile || req.body?.mobileNo || '').replace(/\D/g, '').slice(-10)}`,
  message: 'Too many attempts for this mobile number. Please try again later.'
});

// Public: obtain an app token with mobile + password.
router.post('/auth/login', authRateLimit, mobileRateLimit, controller.login);

// Ends this app session: the token is refused from now on.
router.post('/auth/logout', requireAppAuth, controller.logout);

// Protected: the logged-in member's / employee's own data.
router.use('/me', requireAppAuth, (_req, res, next) => {
  // Personal financial data: never stored by caches or proxies.
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/me', controller.me);
router.post('/me/password', authRateLimit, controller.changePassword);
router.get('/me/financial-years', controller.financialYears);
router.get('/me/profile', controller.profile);
router.get('/me/summary', controller.summary);
router.get('/me/statement/:ledger', controller.statement);
// A short-lived ticket for the ledger page (the website's ledger template in
// the app's web view), and that page's data for the ticket alone.
router.post('/me/ledger-ticket', controller.ledgerTicket);
const ledgerViewRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => `app-ledger-view:${req.ip || 'unknown'}`,
  message: 'Too many ledger requests. Please try again later.'
});
router.get('/ledger-view', ledgerViewRateLimit, controller.ledgerView);

module.exports = router;
