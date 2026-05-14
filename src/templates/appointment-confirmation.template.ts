/**
 * Template HTML para el correo de confirmación inmediata de cita.
 * Mantiene la estructura y campos del recordatorio pero con estilo de confirmación (Verde).
 */

export interface AppointmentConfirmationParams {
  customerName: string;
  businessName: string;
  serviceName: string;
  specialistName: string;
  dateFormatted: string;
  timeFormatted: string;
  businessAddress: string;
  confirmLink: string;
}

export function buildAppointmentConfirmationHtml(params: AppointmentConfirmationParams): string {
  const {
    customerName,
    businessName,
    serviceName,
    specialistName,
    dateFormatted,
    timeFormatted,
    businessAddress,
    confirmLink,
  } = params;
  const year = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de cita - AgendaPro</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:28px 32px 24px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="width:40px;height:40px;background:rgba(255,255,255,0.2);border-radius:10px;text-align:center;vertical-align:middle;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                    A
                  </td>
                  <td style="padding-left:10px;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">
                    AgendaPro
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 32px 0;text-align:center;">
              <h1 style="margin:0 0 6px;font-size:24px;font-weight:700;color:#0f172a;line-height:1.3;">
                ¡Cita Agendada!
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.5;">
                Hola ${customerName}, tu cita ha sido registrada con éxito.
              </p>
            </td>
          </tr>

          <!-- Ticket Card (Matching Reminder Structure) -->
          <tr>
            <td style="padding:0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:16px;border-left:4px solid #10b981;">
                
                <!-- Establecimiento -->
                <tr>
                  <td style="padding:20px 20px 0;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">
                      Establecimiento
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:800;color:#059669;line-height:1.4;">
                      ${businessName}
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:14px 20px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr><td style="border-top:2px dashed #cbd5e1;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>

                <!-- Servicio -->
                <tr>
                  <td style="padding:14px 20px 0;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">
                      Servicio
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;line-height:1.4;">
                      ${serviceName}
                    </p>
                  </td>
                </tr>

                <!-- Especialista -->
                <tr>
                  <td style="padding:14px 20px 0;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">
                      Especialista
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;line-height:1.4;">
                      ${specialistName}
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:14px 20px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr><td style="border-top:2px dashed #cbd5e1;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>

                <!-- Fecha -->
                <tr>
                  <td style="padding:14px 20px 0;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">
                      Fecha
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;line-height:1.4;">
                      ${dateFormatted}
                    </p>
                  </td>
                </tr>

                <!-- Hora -->
                <tr>
                  <td style="padding:14px 20px 0;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">
                      Hora
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;line-height:1.4;">
                      ${timeFormatted}
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:14px 20px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr><td style="border-top:2px dashed #cbd5e1;font-size:0;line-height:0;height:1px;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>

                <!-- Ubicación -->
                <tr>
                  <td style="padding:14px 20px 20px;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">
                      Ubicación
                    </p>
                    <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;line-height:1.4;">
                      ${businessAddress}
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td style="padding:28px 24px 28px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <a href="${confirmLink}" target="_blank" style="display:block;width:100%;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:16px 0;border-radius:14px;text-align:center;box-shadow:0 10px 15px -3px rgba(16,185,129,0.3);">
                      Confirmar asistencia
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                &copy; ${year} AgendaPro &middot; Gracias por tu confianza
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

export function buildAppointmentConfirmationText(params: AppointmentConfirmationParams): string {
  const { customerName, businessName, serviceName, dateFormatted, timeFormatted } = params;
  return `Hola ${customerName}, tu cita para ${serviceName} en ${businessName} ha sido agendada para el ${dateFormatted} a las ${timeFormatted}. ¡Te esperamos!`;
}
