import nodemailer from 'nodemailer';
import { env } from '../config/env';

let transporter: nodemailer.Transporter | null = null;

export async function getTransporter() {
  if (transporter) return transporter;

  let host = env.smtpHost;
  let port = env.smtpPort;
  let user = env.smtpUser;
  let pass = env.smtpPass;

  // Si no hay configuración real proporcionada, usa una cuenta de prueba descartable en dev/test
  if (!user || !pass) {
    console.log('No SMTP config provided in .env, falling back to ethereal test account...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      host = 'smtp.ethereal.email';
      port = 587;
      user = testAccount.user;
      pass = testAccount.pass;
    } catch (err) {
      console.error('Failed to create ethereal test account:', err);
    }
  }

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
  html?: string
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
    
    console.log(`📩 Email sent successfully to ${to}`);
    // Ethereal proporciona una URL para ver los emails falsos enviados en el navegador
    if (info.messageId) {
       console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
    }
  } catch (error) {
    console.error(`❌ Error sending email to ${to}:`, error);
    throw error;
  }
}
