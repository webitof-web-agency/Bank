const nodemailer = require('nodemailer');
const { getSettings } = require('./settings.service');

let cachedTransporterKey = '';
let cachedTransporter = null;

function renderTemplate(template, values = {}) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}

async function resolveSmtpConfig() {
  const settings = await getSettings();
  const smtp = settings?.smtp || {};
  const host = String(smtp.host || process.env.SMTP_HOST || '').trim();
  const port = Number(smtp.port || process.env.SMTP_PORT || 587);
  const username = String(smtp.username || process.env.SMTP_USER || process.env.SMTP_USERNAME || '').trim();
  const password = String(smtp.password || process.env.SMTP_PASSWORD || '').trim();
  const fromEmail = String(smtp.fromEmail || process.env.SMTP_FROM_EMAIL || username || '').trim();
  const fromName = String(smtp.fromName || process.env.SMTP_FROM_NAME || settings?.appName || 'Bank').trim();
  const secure = Boolean(smtp.secure ?? (Number(port) === 465));

  if (!host || !port || !username || !password || !fromEmail) {
    return null;
  }

  return {
    fromEmail,
    fromName,
    host,
    password,
    port,
    secure,
    username
  };
}

async function getTransporter() {
  const smtp = await resolveSmtpConfig();
  if (!smtp) {
    return null;
  }

  const cacheKey = JSON.stringify({
    host: smtp.host,
    password: smtp.password,
    port: smtp.port,
    secure: smtp.secure,
    username: smtp.username
  });

  if (!cachedTransporter || cachedTransporterKey !== cacheKey) {
    cachedTransporterKey = cacheKey;
    cachedTransporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.username,
        pass: smtp.password
      }
    });
  }

  return {
    transporter: cachedTransporter,
    smtp
  };
}

async function sendMail({ to, subject, text, html }) {
  const resolved = await getTransporter();
  if (!resolved) {
    console.log('[mailer] SMTP not configured, skipping email send:', { to, subject });
    return { skipped: true };
  }

  const { transporter, smtp } = resolved;
  return transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
    to,
    subject,
    text,
    html
  });
}

function buildPasswordResetEmail({ name, otp, minutes }) {
  const subject = 'Password Reset OTP';
  const safeName = name || 'User';
  const text = `Hello ${safeName},\n\nYour password reset OTP is ${otp}.\nThis OTP expires in ${minutes} minutes.\nIf you did not request this, ignore this email.\n`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
      <p>Hello ${safeName},</p>
      <p>Your password reset OTP is <strong style="font-size:20px;letter-spacing:2px">${otp}</strong>.</p>
      <p>This OTP expires in <strong>${minutes} minutes</strong>.</p>
      <p>If you did not request this, ignore this email.</p>
    </div>
  `;
  return { subject, text, html };
}

async function sendPasswordResetOtpEmail({ name, otp, minutes, to }) {
  const settings = await getSettings();
  const template = settings?.emailTemplates?.passwordReset || {};
  const fallback = buildPasswordResetEmail({ name, otp, minutes });
  const subject = renderTemplate(template.subject || fallback.subject, { name, otp, minutes });
  const text = renderTemplate(template.text || fallback.text, { name, otp, minutes });
  const html = renderTemplate(template.html || fallback.html, { name, otp, minutes });
  return sendMail({ to, subject, text, html });
}

module.exports = {
  buildPasswordResetEmail,
  resolveSmtpConfig,
  renderTemplate,
  sendMail,
  sendPasswordResetOtpEmail
};
