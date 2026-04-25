import { env } from '../config/env';

/**
 * Genera el HTML del correo de verificación de email.
 */
export function buildVerificationEmailHtml(params: {
  userName: string;
  verificationUrl: string;
}): string {
  const { userName, verificationUrl } = params;
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verifica tu correo - AgendaPro</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#818cf8 100%);padding:32px 32px 28px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                    A
                  </td>
                  <td style="padding-left:12px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                    AgendaPro
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 20px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;line-height:1.3;">
                ¡Bienvenido, ${userName}! 🎉
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
                Gracias por registrarte en AgendaPro. Para activar tu cuenta y comenzar a gestionar tu negocio, solo necesitas verificar tu dirección de correo electrónico.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${verificationUrl}" target="_blank" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;letter-spacing:0.2px;">
                      ✉️ Verificar mi correo
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;line-height:1.5;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0 0 24px;font-size:12px;color:#6366f1;word-break:break-all;line-height:1.5;">
                <a href="${verificationUrl}" style="color:#6366f1;text-decoration:underline;">${verificationUrl}</a>
              </p>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;" />

              <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
                Si no creaste una cuenta en AgendaPro, puedes ignorar este correo de forma segura.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                © ${year} AgendaPro · Gestión inteligente para tu negocio
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/**
 * Genera el texto plano del correo de verificación (para clientes de correo sin HTML).
 */
export function buildVerificationEmailText(params: {
  userName: string;
  verificationUrl: string;
}): string {
  return [
    `¡Hola, ${params.userName}!`,
    '',
    'Gracias por registrarte en AgendaPro.',
    'Para activar tu cuenta, abre el siguiente enlace en tu navegador:',
    '',
    params.verificationUrl,
    '',
    'Si no creaste una cuenta en AgendaPro, puedes ignorar este correo.',
    '',
    `© ${new Date().getFullYear()} AgendaPro`,
  ].join('\n');
}

/**
 * Construye la URL de verificación a partir del token.
 */
export function buildVerificationUrl(token: string): string {
  const base = env.frontendBaseUrl.replace(/\/+$/, '');
  return `${base}/verificar-email?token=${encodeURIComponent(token)}`;
}
