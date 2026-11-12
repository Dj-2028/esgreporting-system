'use strict';

const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let transporter = null;
const sentOutbox = []; // Captured in test mode for assertions

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * Queues an email after transaction commit and retries up to 3 times with
 * backoff; failures are logged and never block the caller (workflow.md §9).
 */
function enqueueEmail({ to, subject, text, html }) {
  const message = { from: env.MAIL_FROM, to, subject, text, html };

  if (env.NODE_ENV === 'test') {
    sentOutbox.push(message);
    return Promise.resolve(message);
  }

  const attemptSend = async (attempt = 1) => {
    try {
      await getTransporter().sendMail(message);
      logger.info({ subject, attempt }, 'Email sent');
    } catch (err) {
      logger.warn({ err, subject, attempt }, 'Email send failed');
      if (attempt < 3) {
        const delayMs = attempt * 500;
        setTimeout(() => attemptSend(attempt + 1), delayMs).unref();
      } else {
        logger.error({ err, subject }, 'Email permanently failed after 3 attempts');
      }
    }
  };

  setImmediate(() => attemptSend(1));
  return Promise.resolve(message);
}

function getTestOutbox() {
  return sentOutbox;
}

function clearTestOutbox() {
  sentOutbox.length = 0;
}

async function sendAccountCreatedEmail({ email, display_name, tempPassword }) {
  return enqueueEmail({
    to: email,
    subject: 'Your ESG Management System account',
    text: `Hello ${display_name},\n\nYour account has been created.\nSign in at: ${env.CLIENT_URL}/login\nTemporary password: ${tempPassword}\n\nYou will be asked to change your password on first sign-in.`,
  });
}

async function sendPasswordResetEmail({ email, display_name, token }) {
  const link = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`;
  return enqueueEmail({
    to: email,
    subject: 'Reset your ESG Management System password',
    text: `Hello ${display_name},\n\nUse the link below within 30 minutes to reset your password:\n${link}\n\nIf you did not request this, you can ignore this email.`,
  });
}

async function sendAssignmentEmail({ email, display_name, roleLabel, period_name, period_end_date, kpis }) {
  const list = kpis.map((k) => `- ${k.kpi_code}: ${k.kpi_name}`).join('\n');
  const due = period_end_date ? new Date(period_end_date).toISOString().slice(0, 10) : '';
  return enqueueEmail({
    to: email,
    subject: `[ESG] Assigned as ${roleLabel} for ${period_name}`,
    text: `Hello ${display_name},\n\nYou have been assigned as ${roleLabel} for period "${period_name}" (due ${due}):\n${list}\n\nOpen: ${env.CLIENT_URL}`,
  });
}

async function sendTransitionEmail({ to, subject, body }) {
  return enqueueEmail({ to, subject, text: body });
}

module.exports = {
  enqueueEmail,
  getTestOutbox,
  clearTestOutbox,
  sendAccountCreatedEmail,
  sendPasswordResetEmail,
  sendAssignmentEmail,
  sendTransitionEmail,
};

