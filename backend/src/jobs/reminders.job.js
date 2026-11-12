'use strict';

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const { RECORD_STATUS, PERIOD_STATUS, SYSTEM_USER_EMAIL } = require('../config/constants');
const notification = require('../services/notification.service');
const { ReportingPeriod, KpiRecord, AppUser, Kpi } = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;
const REMIND_AT_DAYS = [7, 1];

/**
 * Daily reminders (backend.md §8.10, workflow.md §9): when a period ends in
 * 7 or 1 days, email owners with In Progress/Rejected records and approvers
 * with Ready for Approval records. One email per user.
 */
async function runReminders(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const periods = await ReportingPeriod.find({ period_status: PERIOD_STATUS.IN_PROGRESS }).lean();
  let sent = 0;

  for (const period of periods) {
    const days = Math.ceil((new Date(period.period_end_date) - today) / DAY_MS);
    if (!REMIND_AT_DAYS.includes(days)) continue;

    const records = await KpiRecord.find({
      reporting_period_id: period._id,
      submission_status: { $ne: RECORD_STATUS.APPROVED },
    }).lean();
    const kpis = await Kpi.find({ _id: { $in: records.map((r) => r.kpi_id) } }).lean();
    const kpiById = new Map(kpis.map((k) => [String(k._id), k]));

    const groups = new Map(); // userId → { role, kpis[] }
    const add = (uid, role, rec) => {
      const key = `${uid}|${role}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(kpiById.get(String(rec.kpi_id)));
    };
    for (const r of records) {
      if ([RECORD_STATUS.IN_PROGRESS, RECORD_STATUS.REJECTED].includes(r.submission_status)) {
        add(r.data_owner_user_id, 'enter and submit', r);
      } else if (r.submission_status === RECORD_STATUS.READY_FOR_APPROVAL) {
        add(r.approver_user_id, 'review', r);
      }
    }

    const users = await AppUser.find({
      _id: { $in: [...groups.keys()].map((k) => k.split('|')[0]) },
      is_active: true,
    }).lean();
    const userById = new Map(users.map((u) => [String(u._id), u]));

    for (const [key, list] of groups) {
      const [uid, verb] = key.split('|');
      const u = userById.get(uid);
      if (!u) continue;
      await notification.sendTransitionEmail({
        to: u.email,
        subject: `[ESG] Reminder: ${days} day${days === 1 ? '' : 's'} left for ${period.period_name}`,
        body: `Hello ${u.display_name},\n\nPeriod "${period.period_name}" ends on ${new Date(period.period_end_date)
          .toISOString()
          .slice(0, 10)}. Please ${verb} these KPIs:\n${list
          .filter(Boolean)
          .map((k) => `- ${k.kpi_code}: ${k.kpi_name}`)
          .join('\n')}\n\nOpen: ${env.CLIENT_URL}`,
      });
      sent += 1;
    }
  }
  logger.info({ sent, actor: SYSTEM_USER_EMAIL }, 'Reminder job finished');
  return sent;
}

function startReminderJob() {
  if (!cron.validate(env.REMINDER_CRON)) {
    logger.warn({ cron: env.REMINDER_CRON }, 'Invalid REMINDER_CRON; reminders disabled');
    return null;
  }
  return cron.schedule(env.REMINDER_CRON, () => {
    runReminders().catch((err) => logger.error({ err }, 'Reminder job failed'));
  });
}

module.exports = { runReminders, startReminderJob };

