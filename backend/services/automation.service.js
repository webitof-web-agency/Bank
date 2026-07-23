const Demand = require('../models/banking.models').Demand;
const Voucher = require('../models/banking.models').Voucher;
const JobState = require('../models/jobState.model');
const { createNotification } = require('./notification.service');
const { buildMonthlySummaryReport } = require('./banking.service');
const { getSettings } = require('./settings.service');

let automationTimer = null;
let automationRunning = false;

function cleanText(value = '') {
  return String(value || '').trim();
}

function cleanLower(value = '') {
  return cleanText(value).toLowerCase();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDateKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function formatMonthKey(date = new Date()) {
  return new Date(date).toISOString().slice(0, 7);
}

function getPreviousMonthKey(date = new Date()) {
  const current = new Date(date);
  current.setDate(1);
  current.setMonth(current.getMonth() - 1);
  return formatMonthKey(current);
}

async function hasRunForKey(key, label) {
  const state = await JobState.findOne({ key }).lean();
  return state?.lastRunLabel === label;
}

async function markRun(key, label, payload = {}) {
  await JobState.findOneAndUpdate(
    { key },
    {
      $set: {
        lastRunAt: new Date(),
        lastRunLabel: label,
        payload
      }
    },
    { upsert: true, new: true }
  );
}

function getRecipientRoleCodes(settings = {}) {
  const codes = Array.isArray(settings.notifications?.defaultRoleCodes)
    ? settings.notifications.defaultRoleCodes
    : [];
  return codes.length ? codes : ['admin', 'manager'];
}

function buildDemandReminderSummary(rows = []) {
  return rows.slice(0, 10).map((row) => {
    const pending = Math.max(0, toNumber(row.total, 0) - toNumber(row.recovered, 0));
    return `${row.demandNo} | ${row.memberCode || '-'} | ${row.month || '-'} | pending ${pending}`;
  }).join('\n');
}

function buildDraftVoucherSummary(rows = []) {
  return rows.slice(0, 10).map((row) => {
    return `${row.voucherNo} | ${row.voucherCategory || row.transactionType || '-'} | ${row.date || '-'} | amount ${toNumber(row.amount, 0)}`;
  }).join('\n');
}

function buildMonthlySummaryText(rows = [], month = '') {
  return rows.length
    ? rows.map((row) => `${row.transactionType || row.voucherCategory || 'Voucher'}: count ${toNumber(row.count, 0)}, amount ${toNumber(row.amount, 0)}`).join('\n')
    : `No posted vouchers found for ${month}.`;
}

async function runDemandReminder() {
  const todayKey = formatDateKey();
  const stateKey = 'automation:demand-reminder';
  const runLabel = todayKey;
  if (await hasRunForKey(stateKey, runLabel)) {
    return { skipped: true, reason: 'already-ran-today' };
  }

  const settings = await getSettings();
  if (settings.notifications?.enabled === false || settings.notifications?.transactionAlerts === false) {
    await markRun(stateKey, runLabel, { skipped: true, reason: 'disabled' });
    return { skipped: true, reason: 'disabled' };
  }

  const rows = await Demand.find({}).lean();
  const overdue = rows.filter((row) => {
    const pending = Math.max(0, toNumber(row.total, 0) - toNumber(row.recovered, 0));
    const status = cleanLower(row.status);
    const dueDate = cleanText(row.dueDate);
    return pending > 0 && status !== 'recovered' && status !== 'closed' && status !== 'complete' && (!dueDate || dueDate <= todayKey);
  }).sort((a, b) => cleanText(a.demandNo).localeCompare(cleanText(b.demandNo)));

  if (!overdue.length) {
    await markRun(stateKey, runLabel, { count: 0 });
    return { count: 0 };
  }

  const summary = buildDemandReminderSummary(overdue);
  await createNotification({
    title: 'Overdue Demand Reminder',
    message: `${overdue.length} overdue demands require attention.`,
    type: 'warning',
    severity: 'high',
    module: 'transactions',
    action: 'due-reminder',
    actionUrl: '/app/master/demands',
    entityType: 'Demand',
    entityCode: 'DAILY-OVERDUE',
    audience: 'internal',
    recipientRoleCodes: getRecipientRoleCodes(settings),
    includeDefaultRecipients: false,
    includeActorUserId: false,
    sendEmail: true,
    emailTemplateKey: 'demandReminder',
    emailVariables: {
      count: overdue.length,
      summary,
      actionUrl: '/app/master/demands'
    },
    payload: {
      count: overdue.length,
      summary
    }
  });

  await markRun(stateKey, runLabel, { count: overdue.length });
  return { count: overdue.length };
}

async function runDraftVoucherReminder() {
  const todayKey = formatDateKey();
  const stateKey = 'automation:draft-voucher-reminder';
  const runLabel = todayKey;
  if (await hasRunForKey(stateKey, runLabel)) {
    return { skipped: true, reason: 'already-ran-today' };
  }

  const settings = await getSettings();
  if (settings.notifications?.enabled === false || settings.notifications?.transactionAlerts === false) {
    await markRun(stateKey, runLabel, { skipped: true, reason: 'disabled' });
    return { skipped: true, reason: 'disabled' };
  }

  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1);

  const rows = await Voucher.find({
    status: 'Draft',
    updatedAt: { $lte: cutoff }
  }).sort({ updatedAt: 1 }).lean();

  if (!rows.length) {
    await markRun(stateKey, runLabel, { count: 0 });
    return { count: 0 };
  }

  const summary = buildDraftVoucherSummary(rows);
  await createNotification({
    title: 'Pending Draft Vouchers',
    message: `${rows.length} draft vouchers are still pending posting.`,
    type: 'warning',
    severity: 'medium',
    module: 'transactions',
    action: 'draft-reminder',
    actionUrl: '/app/transactions/overview',
    entityType: 'Voucher',
    entityCode: 'DRAFT-VOUCHERS',
    audience: 'internal',
    recipientRoleCodes: getRecipientRoleCodes(settings),
    includeDefaultRecipients: false,
    includeActorUserId: false,
    sendEmail: true,
    emailTemplateKey: 'securityAlert',
    emailVariables: {
      title: 'Pending Draft Vouchers',
      message: `${rows.length} draft vouchers are still pending posting.`,
      actionUrl: '/app/transactions/overview'
    },
    payload: {
      count: rows.length,
      summary
    }
  });

  await markRun(stateKey, runLabel, { count: rows.length });
  return { count: rows.length };
}

async function runMonthlySummary() {
  const today = new Date();
  if (today.getDate() !== 1) {
    return { skipped: true, reason: 'not-first-day-of-month' };
  }

  const monthKey = getPreviousMonthKey(today);
  const stateKey = 'automation:monthly-summary';
  const runLabel = monthKey;
  if (await hasRunForKey(stateKey, runLabel)) {
    return { skipped: true, reason: 'already-ran-for-month' };
  }

  const settings = await getSettings();
  if (settings.notifications?.enabled === false || settings.notifications?.emailEnabled === false) {
    await markRun(stateKey, runLabel, { skipped: true, reason: 'disabled' });
    return { skipped: true, reason: 'disabled' };
  }

  const rows = await buildMonthlySummaryReport({ month: monthKey });
  const summary = buildMonthlySummaryText(rows, monthKey);

  await createNotification({
    title: `Monthly Summary ${monthKey}`,
    message: `Monthly summary for ${monthKey} is ready.`,
    type: 'system',
    severity: 'medium',
    module: 'reports',
    action: 'monthly-summary',
    actionUrl: '/app/reports',
    entityType: 'Report',
    entityCode: monthKey,
    audience: 'internal',
    recipientRoleCodes: getRecipientRoleCodes(settings),
    includeDefaultRecipients: false,
    includeActorUserId: false,
    sendEmail: true,
    emailTemplateKey: 'monthlySummary',
    emailVariables: {
      month: monthKey,
      summary,
      actionUrl: '/app/reports'
    },
    payload: {
      month: monthKey,
      rows
    }
  });

  await markRun(stateKey, runLabel, { month: monthKey, rowCount: rows.length });
  return { month: monthKey, rowCount: rows.length };
}

async function runAutomationCycle() {
  if (automationRunning) {
    return { skipped: true, reason: 'already-running' };
  }

  automationRunning = true;
  try {
    const results = [];
    results.push(await runDemandReminder());
    results.push(await runDraftVoucherReminder());
    results.push(await runMonthlySummary());
    return { results };
  } finally {
    automationRunning = false;
  }
}

function startAutomationScheduler() {
  if (automationTimer) {
    return { started: false };
  }

  void runAutomationCycle().catch((error) => {
    console.error('[automation] initial run failed:', error.message);
  });

  automationTimer = setInterval(() => {
    void runAutomationCycle().catch((error) => {
      console.error('[automation] cycle failed:', error.message);
    });
  }, 15 * 60 * 1000);

  return { started: true };
}

function stopAutomationScheduler() {
  if (automationTimer) {
    clearInterval(automationTimer);
    automationTimer = null;
  }
  automationRunning = false;
}

module.exports = {
  runAutomationCycle,
  runDemandReminder,
  runDraftVoucherReminder,
  runMonthlySummary,
  startAutomationScheduler,
  stopAutomationScheduler
};
