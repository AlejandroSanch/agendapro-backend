import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

let transporter: nodemailer.Transporter | null = null;

export async function getTransporter() {
  if (transporter) return transporter;

  const host = env.smtpHost;
  const port = env.smtpPort;
  const user = env.smtpUser;
  const pass = env.smtpPass;

  if (!user || !pass) {
    logger.warn('SMTP credentials not configured in .env — emails will NOT be sent.');
    logger.warn('Set SMTP_USER and SMTP_PASS to enable email delivery.');
  }

  logger.info(`Initializing SMTP transporter → ${host}:${port} (secure: ${port === 465})`);

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  return transporter;
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
): Promise<void> {
  try {
    const t = await getTransporter();
    const info = await t.sendMail({
      from: env.smtpFromEmail,
      to,
      subject,
      text,
      html,
    });

    logger.info(`Email sent successfully to ${to} (messageId: ${info.messageId})`);
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, `Error sending email to ${to}`);
    throw error;
  }
}
