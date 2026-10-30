const { DemandList, Member, Employee } = require('../models/banking.models');
const { isTestMember } = require('../utils/testMember');
const JobState = require('../models/jobState.model');
const { createNotification, purgeOldNotifications } = require('./notification.service');
const { buildMonthlySummaryReport } = require('./banking.service');
const { getSettings } = require('./settings.service');
const smsService = require('./sms/sms.service');
const driveBackups = require('./googleDrive/backup.service');

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

function buildMonthlySummaryText(rows = [], month = '') {
  return rows.length
    ? rows.map((row) => `${row.transactionType || row.voucherCategory || 'Voucher'}: count ${toNumber(row.count, 0)}, amount ${toNumber(row.amount, 0)}`).join('\n')
    : `No vouchers found for ${month}.`;
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

  const rows = await DemandList.find({});
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

// Today in India (the society's day), as YYYY-MM-DD.
function indiaDateKey(date = new Date()) {
  return new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

// Birthdays today: one notification a day naming every active member and
// staff member born on this day and month (dates of birth are stored as
// midnight UTC, so their ISO month-day is the birthday).
async function runBirthdayNotifications() {
  const todayKey = indiaDateKey();
  const stateKey = 'automation:birthdays';
  if (await hasRunForKey(stateKey, todayKey)) {
    return { job: 'birthdays', skipped: true, reason: 'already-ran-today' };
  }
  const monthDay = todayKey.slice(5);
  const bornToday = (row) => cleanText(row.dateOfBirth).slice(5, 10) === monthDay;
  const members = (await Member.find({}).lean())
    .filter((row) => cleanLower(row.status || 'active') === 'active' && !isTestMember(row) && bornToday(row));
  const employees = (await Employee.find({}).lean())
    .filter((row) => row.isActive !== false && cleanLower(row.status || 'active') !== 'inactive' && bornToday(row));
  const people = [
    ...members.map((row) => ({ kind: 'Member', code: cleanText(row.code), name: cleanText(row.name) })),
    ...employees.map((row) => ({ kind: 'Staff', code: cleanText(row.code), name: cleanText(row.name) }))
  ];
  if (people.length) {
    const names = people.map((p) => `${p.name} (${p.kind} ${p.code})`);
    await createNotification({
      title: people.length === 1 ? `Birthday today: ${people[0].name}` : `${people.length} birthdays today`,
      message: names.length > 8 ? `${names.slice(0, 8).join(', ')} and ${names.length - 8} more.` : `${names.join(', ')}.`,
      type: 'info',
      severity: 'low',
      module: 'birthday',
      action: 'birthday',
      entityType: 'Birthday',
      entityCode: todayKey,
      audience: 'internal',
      includeActorUserId: false,
      sendEmail: false,
      payload: { date: todayKey, people }
    });
  }
  await markRun(stateKey, todayKey, { count: people.length });
  return { job: 'birthdays', count: people.length };
}

async function runAutomationCycle() {
  if (automationRunning) {
    return { skipped: true, reason: 'already-running' };
  }

  automationRunning = true;
  try {
    const results = [];
    results.push(await runDemandReminder());
    results.push(await runMonthlySummary());
    results.push(await runBirthdayNotifications().catch((error) => {
      console.error('[automation] birthday notifications failed:', error.message);
      return { job: 'birthdays', error: error.message };
    }));
    results.push(await retryPendingSms());
    results.push(await runDriveBackup());
    results.push(await runNotificationPurge());
    return { results };
  } finally {
    automationRunning = false;
  }
}

// Daily database backup to Google Drive (once per India date, at/after the
// configured hour; skipped when Drive is not connected).
async function runDriveBackup() {
  try {
    const result = await driveBackups.runScheduledBackupIfDue();
    return { job: 'gdrive-backup', ...result };
  } catch (error) {
    console.error('[automation] Google Drive backup failed:', error.message);
    return { job: 'gdrive-backup', error: error.message };
  }
}

async function runNotificationPurge() {
  try {
    const result = await purgeOldNotifications();
    return { job: 'notification-purge', ...result };
  } catch (error) {
    console.error('[automation] notification purge failed:', error.message);
    return { job: 'notification-purge', error: error.message };
  }
}

// SMS rows left PENDING (process stopped mid-send, Flowit unreachable).
async function retryPendingSms() {
  try {
    const results = await smsService.dispatchPending();
    return { job: 'sms-retry', count: results.length };
  } catch (error) {
    console.error('[automation] SMS retry failed:', error.message);
    return { job: 'sms-retry', error: error.message };
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
  runBirthdayNotifications,
  runAutomationCycle,
  runDemandReminder,
  runMonthlySummary,
  startAutomationScheduler,
  stopAutomationScheduler
};
