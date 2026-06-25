const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Email service with a pluggable transport.
 *
 * Driver modes (EMAIL_DRIVER env):
 *   - "smtp"     — real SMTP server (production default).
 *   - "resend"   — HTTP-based via Resend API.
 *   - "log"      — dev convenience: writes to stdout via pino. No real send.
 *
 * In test mode (IS_TEST=true) the "log" driver is forced regardless of env.
 */

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const driver = env.isTest ? 'log' : env.email.driver;

  if (driver === 'log') {
    transporter = nodemailer.createTransport({
      jsonTransport: true, // returns the JSON envelope instead of sending
    });
    return transporter;
  }

  if (driver === 'smtp') {
    transporter = nodemailer.createTransport({
      host: env.email.smtp.host,
      port: env.email.smtp.port,
      secure: env.email.smtp.secure,
      auth: {
        user: env.email.smtp.user,
        pass: env.email.smtp.pass,
      },
    });
    return transporter;
  }

  // Resend (or any SMTP-compatible HTTP bridge — Resend exposes SMTP relay)
  transporter = nodemailer.createTransport({
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    auth: {
      user: 'resend',
      pass: env.email.resendApiKey,
    },
  });
  return transporter;
}

/**
 * Send a transactional email.
 *
 * @param {object} opts
 * @param {string} opts.to        - recipient email
 * @param {string} opts.subject  - email subject line
 * @param {string} opts.html     - HTML body
 * @param {string} [opts.text]   - plain-text fallback body
 */
async function sendEmail({ to, subject, html, text }) {
  const from = `${env.email.fromName} <${env.email.fromAddress}>`;
  const transporterInstance = getTransporter();

  try {
    const result = await transporterInstance.sendMail({ from, to, subject, html, text });
    if (env.email.driver === 'log' || env.isTest) {
      // jsonTransport returns { message: JSON string } with no real send.
      logger.debug({ to, subject, envelope: result.envelope }, 'Email (log mode)');
    } else {
      logger.info({ to, subject, messageId: result.messageId }, 'Email sent');
    }
    return result;
  } catch (err) {
    logger.error({ err, to, subject }, 'Failed to send email');
    throw err;
  }
}

module.exports = { sendEmail };
