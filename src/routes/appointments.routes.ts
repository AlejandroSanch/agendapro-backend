import { Router } from 'express';
import {
  AppointmentStatusDb,
  createAppointment,
  listAppointments,
  updateAppointment,
  UpdateAppointmentInput,
  UpsertAppointmentInput,
} from '../data/store';
import { requireAuth } from '../middleware/auth';

type CitaEstado = 'pendiente' | 'confirmada' | 'completada' | 'cancelada';

interface CitaResponse {
  id: string;
  clienteNombre: string;
  clienteTelefono: string;
  servicio: string;
  duracionMin: number;
  fecha: string;
  hora: string;
  precio: number;
  notas: string;
  estado: CitaEstado;
}

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

export const appointmentsRouter = Router();

appointmentsRouter.get('/', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const dateFrom = parseOptionalDate(req.query.dateFrom);
  const dateTo = parseOptionalDate(req.query.dateTo);
  if (dateFrom === false || dateTo === false) {
    res.status(400).json({ error: 'Formato de fecha invalido. Usa YYYY-MM-DD.' });
    return;
  }

  const appointments = await listAppointments(req.user.id, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  res.json({
    appointments: appointments.map((appointment) => ({
      id: appointment.id,
      clienteNombre: appointment.customerName,
      clienteTelefono: appointment.customerPhone,
      servicio: appointment.serviceName,
      duracionMin: appointment.durationMin,
      fecha: appointment.date,
      hora: appointment.time,
      precio: appointment.priceCents / 100,
      notas: appointment.notes,
      estado: statusFromDb[appointment.status],
    })),
  });
});

appointmentsRouter.post('/', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const parsed = parseCreatePayload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const appointment = await createAppointment(req.user.id, parsed.value);
  if (!appointment) {
    res.status(500).json({ error: 'No se pudo crear la cita.' });
    return;
  }

  res.status(201).json({ appointment: toApiAppointment(appointment) });
});

appointmentsRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const appointmentId = String(req.params.id || '').trim();
  if (!appointmentId) {
    res.status(400).json({ error: 'ID de cita invalido.' });
    return;
  }

  const parsed = parsePatchPayload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const appointment = await updateAppointment(req.user.id, appointmentId, parsed.value);
  if (!appointment) {
    res.status(404).json({ error: 'Cita no encontrada.' });
    return;
  }

  res.json({ appointment: toApiAppointment(appointment) });
});

function toApiAppointment(appointment: {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  durationMin: number;
  priceCents: number;
  date: string;
  time: string;
  notes: string;
  status: AppointmentStatusDb;
}): CitaResponse {
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
    estado: statusFromDb[appointment.status],
  };
}

function parseCreatePayload(body: unknown): { ok: true; value: UpsertAppointmentInput } | { ok: false; error: string } {
  const base = parseBasePayload(body, true);
  if (!base.ok) return base;
  const requiredFields = base.value;
  if (
    requiredFields.clienteNombre === undefined ||
    requiredFields.clienteTelefono === undefined ||
    requiredFields.servicio === undefined ||
    requiredFields.duracionMin === undefined ||
    requiredFields.precio === undefined ||
    requiredFields.fecha === undefined ||
    requiredFields.hora === undefined ||
    requiredFields.estado === undefined
  ) {
    return { ok: false, error: 'Campos requeridos incompletos.' };
  }

  return {
    ok: true,
    value: {
      customerName: requiredFields.clienteNombre,
      customerPhone: requiredFields.clienteTelefono,
      serviceName: requiredFields.servicio,
      durationMin: requiredFields.duracionMin,
      priceCents: Math.round(requiredFields.precio * 100),
      date: requiredFields.fecha,
      time: requiredFields.hora,
      notes: requiredFields.notas,
      status: statusToDb[requiredFields.estado],
    },
  };
}

function parsePatchPayload(body: unknown): { ok: true; value: UpdateAppointmentInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body invalido.' };
  }

  const base = parseBasePayload(body, false);
  if (!base.ok) return base;
  if (Object.keys(base.value).length === 0) {
    return { ok: false, error: 'No hay campos para actualizar.' };
  }

  const value: UpdateAppointmentInput = {};
  if (base.value.clienteNombre !== undefined) value.customerName = base.value.clienteNombre;
  if (base.value.clienteTelefono !== undefined) value.customerPhone = base.value.clienteTelefono;
  if (base.value.servicio !== undefined) value.serviceName = base.value.servicio;
  if (base.value.duracionMin !== undefined) value.durationMin = base.value.duracionMin;
  if (base.value.precio !== undefined) value.priceCents = Math.round(base.value.precio * 100);
  if (base.value.fecha !== undefined) value.date = base.value.fecha;
  if (base.value.hora !== undefined) value.time = base.value.hora;
  if (base.value.notas !== undefined) value.notes = base.value.notas;
  if (base.value.estado !== undefined) value.status = statusToDb[base.value.estado];

  return { ok: true, value };
}

function parseBasePayload(
  body: unknown,
  required: boolean
):
  | {
      ok: true;
      value: Partial<{
        clienteNombre: string;
        clienteTelefono: string;
        servicio: string;
        duracionMin: number;
        fecha: string;
        hora: string;
        precio: number;
        notas: string;
        estado: CitaEstado;
      }>;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body invalido.' };
  }

  const raw = body as Record<string, unknown>;
  const payload: Partial<{
    clienteNombre: string;
    clienteTelefono: string;
    servicio: string;
    duracionMin: number;
    fecha: string;
    hora: string;
    precio: number;
    notas: string;
    estado: CitaEstado;
  }> = {};

  if (required || raw.clienteNombre !== undefined) {
    const value = String(raw.clienteNombre || '').trim();
    if (!value) return { ok: false, error: 'clienteNombre es requerido.' };
    payload.clienteNombre = value;
  }

  if (required || raw.clienteTelefono !== undefined) {
    payload.clienteTelefono = String(raw.clienteTelefono || '').trim();
  }

  if (required || raw.servicio !== undefined) {
    const value = String(raw.servicio || '').trim();
    if (!value) return { ok: false, error: 'servicio es requerido.' };
    payload.servicio = value;
  }

  if (required || raw.duracionMin !== undefined) {
    const value = Number(raw.duracionMin);
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: 'duracionMin debe ser mayor a 0.' };
    }
    payload.duracionMin = Math.round(value);
  }

  if (required || raw.fecha !== undefined) {
    const value = String(raw.fecha || '').trim();
    if (!isValidDate(value)) return { ok: false, error: 'fecha invalida. Usa YYYY-MM-DD.' };
    payload.fecha = value;
  }

  if (required || raw.hora !== undefined) {
    const value = String(raw.hora || '').trim();
    if (!isValidTime(value)) return { ok: false, error: 'hora invalida. Usa HH:mm.' };
    payload.hora = value;
  }

  if (required || raw.precio !== undefined) {
    const value = Number(raw.precio);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: 'precio debe ser un numero >= 0.' };
    }
    payload.precio = value;
  }

  if (required || raw.notas !== undefined) {
    payload.notas = String(raw.notas || '').trim();
  }

  if (required || raw.estado !== undefined) {
    const value = String(raw.estado || '').trim() as CitaEstado;
    if (!isValidEstado(value)) return { ok: false, error: 'estado invalido.' };
    payload.estado = value;
  }

  return { ok: true, value: payload };
}

function isValidEstado(value: string): value is CitaEstado {
  return value === 'pendiente' || value === 'confirmada' || value === 'completada' || value === 'cancelada';
}

function parseOptionalDate(value: unknown): string | false | null {
  if (value === undefined || value === null || value === '') return null;
  const asString = String(value);
  return isValidDate(asString) ? asString : false;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hh, mm] = value.split(':').map(Number);
  return hh >= 0 && hh < 24 && mm >= 0 && mm < 60;
}
