import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: nodemailer.Transporter | null = null;

export async function getTransporter() {
  if (transporter) return transporter;

  const host = env.smtpHost;
  const port = env.smtpPort;
  const user = env.smtpUser;
  const pass = env.smtpPass;

  if (!user || !pass) {
    console.warn('⚠️ SMTP credentials not configured in .env — emails will NOT be sent.');
    console.warn('   Set SMTP_USER and SMTP_PASS to enable email delivery.');
  }

  console.log(`📧 Initializing SMTP transporter → ${host}:${port} (secure: ${port === 465})`);

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

    console.log(`📩 Email sent successfully to ${to} (messageId: ${info.messageId})`);
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error);
    throw error;
  }
}
