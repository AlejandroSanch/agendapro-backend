// Configuración de env antes de importar nada que use env.ts
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';

import { sendMail } from '../utils/mailer';
import {
  buildVerificationEmailHtml,
  buildVerificationEmailText,
  buildVerificationUrl,
} from '../templates/verification-email.template';

async function testEmail() {
  const email = 'alejandrosanchrom@gmail.com';
  const userName = 'Alejandro';
  const token = 'test-token-123';
  const verificationUrl = buildVerificationUrl(token);

  const html = buildVerificationEmailHtml({ userName, verificationUrl });
  const text = buildVerificationEmailText({ userName, verificationUrl });

  console.log(`Intentando enviar correo de prueba a: ${email}...`);
  try {
    await sendMail(email, 'Prueba de Verificación - AgendaPro', text, html);
    console.log('✅ Correo enviado (revisa arriba el link de Ethereal)');
  } catch (err) {
    console.error('❌ Error fatal en el envío:', err);
  }
}

testEmail();
