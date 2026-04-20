import { Request, Response } from 'express';
import {
  createAppointment,
  listAppointments,
  updateAppointment,
} from '../data/repositories/appointment.repository';
import { 
  getBusinessSettings, 
  isHolidayClosure 
} from '../data/repositories/settings.repository';
import { AppointmentStatusDb } from '../data/utils';
import {
  appointmentIdParamSchema,
  createAppointmentSchema,
  dateRangeQuerySchema,
  updateAppointmentSchema,
} from '../validators/appointments.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

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

function toApiAppointment(appointment: any) {
  return {
    id: appointment.id,
    clienteNombre: appointment.customerName,
    clienteTelefono: appointment.customerPhone,
    servicio: appointment.serviceName,
    duracionMin: appointment.durationMin,
    fecha: appointment.date,
    hora: appointment.time,
    precio: appointment.priceCents / 100,
    notas: appointment.notes,
    estado: statusFromDb[appointment.status as AppointmentStatusDb],
  };
}

export const AppointmentsController = {
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
    
    // Validaciones de alta prioridad
    const now = new Date();
    const startAt = new Date(`${data.fecha}T${data.hora}:00`);

    // 1. Bloquear fechas pasadas (con un margen de 1 minuto para evitar problemas de red)
    if (startAt.getTime() < (now.getTime() - 60000)) {
       throw new ApiError(400, 'No se puede crear una cita en el pasado.');
    }

    // 2. Verificar feriados/cierres
    const isHoliday = await isHolidayClosure(req.user.id, data.fecha);
    if (isHoliday) {
      throw new ApiError(400, 'El negocio está cerrado por feriado o mantenimiento este día.');
    }

    // 3. Verificar horario comercial (Inicio y Fin)
    const settings = await getBusinessSettings(req.user.id);
    if (settings) {
      const dateDate = new Date(`${data.fecha}T00:00:00`);
      let dayOfWeek = dateDate.getDay(); // 0=Dom, 1=Lun... 6=Sab
      
      // JS: 0=Dom, 1=Lun, ..., 6=Sab
      // DB: 0=Lun, 1=Mar, ..., 5=Sab, 6=Dom (ver SettingsRepository: map(h => ({ day: h.day_of_week })))
      const jsToDbDay: Record<number, number> = { 0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };
      const dbDay = jsToDbDay[dayOfWeek];
      const schedule = settings.schedules.find(s => s.day === dbDay);

      if (!schedule || !schedule.open) {
        throw new ApiError(400, 'El negocio está cerrado en el día seleccionado.');
      }

      const toMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
      };

      const startMinCurrent = toMinutes(data.hora);
      const endMinCurrent = startMinCurrent + data.duracionMin;
      const openMin = toMinutes(schedule.from);
      const closeMin = toMinutes(schedule.to);

      if (startMinCurrent < openMin || endMinCurrent > closeMin) {
        throw new ApiError(400, `La duración de la cita excede el horario comercial (${schedule.from} - ${schedule.to}).`);
      }
    }

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
    };

    try {
      const appointment = await createAppointment(req.user.id, payload);
      if (!appointment) throw new ApiError(500, 'No se pudo crear la cita.');
      res.status(201).json({ appointment: toApiAppointment(appointment) });
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

    try {
      const appointment = await updateAppointment(req.user.id, params.id, payload);
      if (!appointment) throw new ApiError(404, 'Cita no encontrada.');
      res.json({ appointment: toApiAppointment(appointment) });
    } catch (error) {
      if (error instanceof Error && error.message.includes('fecha futura')) {
        throw new ApiError(400, error.message);
      }
      throw error;
    }
  })
};
