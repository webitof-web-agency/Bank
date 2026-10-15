'use strict';

// Member / employee mobile-app portal API (read-only). Mounted at /api/app,
// BEFORE the admin requireAuth guard in routes/index.js, with its own app-token
// auth. Everything under /me is scoped to the logged-in account.

const express = require('express');
const controller = require('../controllers/appPortal.controller');
const { requireAppAuth } = require('../middlewares/appAuth');

const router = express.Router();

// Public: society name/logo and theme colours, shown before login.
router.get('/config', controller.config);

// Public: obtain an app token with mobile + password.
router.post('/auth/login', controller.login);

// Protected: the logged-in member's / employee's own data.
router.use('/me', requireAppAuth);
router.get('/me', controller.me);
router.get('/me/financial-years', controller.financialYears);
router.get('/me/profile', controller.profile);
router.get('/me/summary', controller.summary);
router.get('/me/statement/:product', controller.statement);

module.exports = router;
