import { buildVerificationEmailHtml } from '../templates/verification-email.template';
import fs from 'fs';
import path from 'path';

const html = buildVerificationEmailHtml({
  userName: 'Alejandro',
  verificationUrl: 'http://localhost:4200/verificar-email?token=ejemplo-token-123'
});

const outputPath = path.join(process.cwd(), 'email_preview.html');
fs.writeFileSync(outputPath, html);
console.log(`Preview HTML created at: ${outputPath}`);
