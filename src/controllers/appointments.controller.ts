import { Request, Response } from 'express';
import { z } from 'zod';
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
  async list(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }
      const query = dateRangeQuerySchema.parse(req.query);

      const appointments = await listAppointments(req.user.id, {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      });

      res.json({ appointments: appointments.map(toApiAppointment) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }

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
      if (!appointment) {
        res.status(500).json({ error: 'No se pudo crear la cita.' });
        return;
      }

      res.status(201).json({ appointment: toApiAppointment(appointment) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }

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
      if (!appointment) {
        res.status(404).json({ error: 'Cita no encontrada.' });
        return;
      }

      res.json({ appointment: toApiAppointment(appointment) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
};
