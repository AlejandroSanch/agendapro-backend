import { Request, Response } from 'express';
import {
  createAppointment,
  findAppointmentById,
  listAppointments,
  updateAppointment,
} from '../data/repositories/appointment.repository';
import { AppointmentStatusDb } from '../data/utils';
import {
  appointmentIdParamSchema,
  createAppointmentSchema,
  dateRangeQuerySchema,
  updateAppointmentSchema,
} from '../validators/appointments.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { SseManager } from '../utils/sse.manager';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { WhatsAppService } from '../services/whatsapp.service';
import { AppointmentService } from '../services/appointment.service';

// ── Status mapping ───────────────────────────────────────────────────────────

type CitaEstado = 'pendiente' | 'confirmada' | 'completada' | 'cancelada';

const statusToDb: Record<CitaEstado, AppointmentStatusDb> = {
  pendiente: 'scheduled',
  confirmada: 'confirmed',
  completada: 'completed',
  cancelada: 'cancelled',
};

const statusFromDb: Record<AppointmentStatusDb, CitaEstado> = {
  scheduled: 'pendiente',
  confirmed: 'confirmada',
  completed: 'completada',
  cancelled: 'cancelada',
  no_show: 'cancelada',
};

// ── API transformation ───────────────────────────────────────────────────────

function toApiAppointment(appointment: any) {
  return {
    id: appointment.id,
    clienteNombre: appointment.customerName,
    clienteTelefono: appointment.customerPhone,
    servicio: (() => {
      const original = appointment.serviceName || '';
      return original.replace(/^\[BORRADO\]\s+/i, '').replace(/\s+\(\d+\)$/, '');
    })(),
    duracionMin: appointment.durationMin,
    fecha: appointment.date,
    hora: appointment.time,
    precio: appointment.priceCents / 100,
    notas: appointment.notes,
    estado: statusFromDb[appointment.status as AppointmentStatusDb],
    trabajador: (() => {
      const original = appointment.trabajador || '';
      return original.replace(/^\[BORRADO\]\s+/i, '').replace(/\s*\(\d+\)/, '').trim();
    })(),
  };
}

// ── Controller ───────────────────────────────────────────────────────────────

export const AppointmentsController = {
  stream: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial connection successful message
    res.write('data: {"status": "connected"}\n\n');

    SseManager.addClient(req.user.id, res);
  }),

  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    const query = dateRangeQuerySchema.parse(req.query);
    const appointments = await listAppointments(req.user.id, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });

    res.json({ appointments: appointments.map(toApiAppointment) });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = createAppointmentSchema.parse(req.body);

    // Validaciones de negocio delegadas al servicio
    await AppointmentService.validateCreate(req.user.id, {
      fecha: data.fecha,
      hora: data.hora,
      duracionMin: data.duracionMin,
      trabajador: data.trabajador,
    });

    const payload = {
      customerName: data.clienteNombre,
      customerPhone: data.clienteTelefono,
      serviceName: data.servicio,
      durationMin: data.duracionMin,
      priceCents: Math.round(data.precio * 100),
      date: data.fecha,
      time: data.hora,
      notes: data.notas,
      status: statusToDb[data.estado as CitaEstado],
      trabajador: data.trabajador,
    };

    try {
      const appointment = await createAppointment(req.user.id, payload);
      if (!appointment) throw new ApiError(500, 'No se pudo crear la cita.');
      
      const apiAppointment = toApiAppointment(appointment);
      SseManager.broadcast(req.user.id, 'appointments_updated', { action: 'create', appointment: apiAppointment });
      
      // Enviar confirmación por WhatsApp si hay teléfono
      if (apiAppointment.clienteTelefono) {
        let cleanPhone = apiAppointment.clienteTelefono.replace(/\D/g, '');
        if (cleanPhone.length === 10) cleanPhone = '52' + cleanPhone;
        
        WhatsAppService.sendAppointmentConfirmation(
          cleanPhone,
          apiAppointment.clienteNombre,
          apiAppointment.servicio,
          apiAppointment.fecha,
          apiAppointment.hora
        ).catch(err => console.error('Error enviando confirmación WA:', err));
      }

      // Sincronizar asincrónicamente con Google Calendar
      GoogleCalendarService.pushEvent(req.user.id, apiAppointment as any, 'create').catch(console.error);

      res.status(201).json({ appointment: apiAppointment });
    } catch (error) {
      if (error instanceof Error && error.message.includes('fecha futura')) {
        throw new ApiError(400, error.message);
      }
      throw error;
    }
  }),

  update: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = appointmentIdParamSchema.parse(req.params);
    const data = updateAppointmentSchema.parse(req.body);

    const payload: any = {};
    if (data.clienteNombre !== undefined) payload.customerName = data.clienteNombre;
    if (data.clienteTelefono !== undefined) payload.customerPhone = data.clienteTelefono;
    if (data.servicio !== undefined) payload.serviceName = data.servicio;
    if (data.duracionMin !== undefined) payload.durationMin = data.duracionMin;
    if (data.precio !== undefined) payload.priceCents = Math.round(data.precio * 100);
    if (data.fecha !== undefined) payload.date = data.fecha;
    if (data.hora !== undefined) payload.time = data.hora;
    if (data.notas !== undefined) payload.notes = data.notas;
    if (data.estado !== undefined) payload.status = statusToDb[data.estado as CitaEstado];
    if (data.trabajador !== undefined) payload.trabajador = data.trabajador;

    // Obtener la cita actual para combinar los datos y poder validarla
    const currentApt = await findAppointmentById(req.user.id, params.id);
    if (!currentApt) throw new ApiError(404, 'Cita no encontrada.');

    const mergedDate = data.fecha ?? currentApt.date;
    const mergedTime = data.hora ?? currentApt.time;
    const mergedDuration = data.duracionMin ?? currentApt.durationMin;
    const mergedTrabajador = data.trabajador ?? currentApt.trabajador;

    // Validaciones de negocio delegadas al servicio
    await AppointmentService.validateUpdate(req.user.id, {
      fecha: mergedDate,
      hora: mergedTime,
      duracionMin: mergedDuration,
      trabajador: mergedTrabajador,
    });

    try {
      const appointment = await updateAppointment(req.user.id, params.id, payload);
      if (!appointment) throw new ApiError(404, 'Cita no encontrada.');
      
      const apiAppointment = toApiAppointment(appointment);
      SseManager.broadcast(req.user.id, 'appointments_updated', { action: 'update', appointment: apiAppointment });
      
      const googleAction = apiAppointment.estado === 'cancelada' ? 'delete' : 'update';
      GoogleCalendarService.pushEvent(req.user.id, apiAppointment as any, googleAction).catch(console.error);

      res.json({ appointment: apiAppointment });
    } catch (error) {
      if (error instanceof Error && error.message.includes('fecha futura')) {
        throw new ApiError(400, error.message);
      }
      throw error;
    }
  })
};
