import { Request, Response } from 'express';
import {
  createAppointment,
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

    const appointment = await createAppointment(req.user.id, payload);
    if (!appointment) throw new ApiError(500, 'No se pudo crear la cita.');

    res.status(201).json({ appointment: toApiAppointment(appointment) });
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

    const appointment = await updateAppointment(req.user.id, params.id, payload);
    if (!appointment) throw new ApiError(404, 'Cita no encontrada.');

    res.json({ appointment: toApiAppointment(appointment) });
  })
};
