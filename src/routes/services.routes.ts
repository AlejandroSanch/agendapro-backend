import { Router } from 'express';
import {
  createService,
  CreateServiceInput,
  deleteService,
  listServices,
  ServiceRecord,
  updateService,
  UpdateServiceInput,
} from '../data/store';
import { requireAuth } from '../middleware/auth';

interface ServicioDto {
  id: string;
  nombre: string;
  categoria: string;
  duracionMin: number;
  precio: number;
  descripcion: string;
  activo: boolean;
  orden: number;
}

export const servicesRouter = Router();

servicesRouter.get('/', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const services = await listServices(req.user.id);
  res.json({ services: services.map(toApiService) });
});

servicesRouter.post('/', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const parsed = parseCreatePayload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const created = await createService(req.user.id, parsed.value);
    if (!created) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }

    res.status(201).json({ service: toApiService(created) });
  } catch (error) {
    if (isDuplicateNameError(error)) {
      res.status(409).json({ error: 'Ya existe un servicio con ese nombre.' });
      return;
    }

    throw error;
  }
});

servicesRouter.patch('/:id', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const serviceId = String(req.params.id || '').trim();
  if (!serviceId) {
    res.status(400).json({ error: 'ID de servicio invalido.' });
    return;
  }

  const parsed = parsePatchPayload(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const updated = await updateService(req.user.id, serviceId, parsed.value);
    if (!updated) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    res.json({ service: toApiService(updated) });
  } catch (error) {
    if (isDuplicateNameError(error)) {
      res.status(409).json({ error: 'Ya existe un servicio con ese nombre.' });
      return;
    }

    throw error;
  }
});

servicesRouter.delete('/:id', requireAuth, async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'No autorizado.' });
    return;
  }

  const serviceId = String(req.params.id || '').trim();
  if (!serviceId) {
    res.status(400).json({ error: 'ID de servicio invalido.' });
    return;
  }

  try {
    const deleted = await deleteService(req.user.id, serviceId);
    if (!deleted) {
      res.status(404).json({ error: 'Servicio no encontrado.' });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    if (isServiceInUseError(error)) {
      res.status(409).json({ error: 'No se puede eliminar: el servicio tiene citas asociadas.' });
      return;
    }
    throw error;
  }
});

function toApiService(service: ServiceRecord): ServicioDto {
  return {
    id: service.id,
    nombre: service.name,
    categoria: service.category,
    duracionMin: service.durationMin,
    precio: service.priceCents / 100,
    descripcion: service.description,
    activo: service.isActive,
    orden: service.displayOrder,
  };
}

function parseCreatePayload(body: unknown): { ok: true; value: CreateServiceInput } | { ok: false; error: string } {
  const base = parseBasePayload(body, true);
  if (!base.ok) return base;
  if (base.value.name === undefined || base.value.durationMin === undefined || base.value.priceCents === undefined) {
    return { ok: false, error: 'Campos requeridos incompletos.' };
  }

  return {
    ok: true,
    value: {
      name: base.value.name,
      durationMin: base.value.durationMin,
      priceCents: base.value.priceCents,
      category: base.value.category,
      description: base.value.description,
      isActive: base.value.isActive,
      displayOrder: base.value.displayOrder,
    },
  };
}

function parsePatchPayload(body: unknown): { ok: true; value: UpdateServiceInput } | { ok: false; error: string } {
  const base = parseBasePayload(body, false);
  if (!base.ok) return base;
  if (Object.keys(base.value).length === 0) {
    return { ok: false, error: 'No hay campos para actualizar.' };
  }
  return { ok: true, value: base.value };
}

function parseBasePayload(
  body: unknown,
  required: boolean
): { ok: true; value: Partial<CreateServiceInput> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body invalido.' };
  }

  const raw = body as Record<string, unknown>;
  const payload: Partial<CreateServiceInput> = {};

  if (required || raw.nombre !== undefined) {
    const value = String(raw.nombre || '').trim();
    if (!value) return { ok: false, error: 'nombre es requerido.' };
    payload.name = value;
  }

  if (required || raw.duracionMin !== undefined) {
    const value = Number(raw.duracionMin);
    if (!Number.isFinite(value) || value <= 0) {
      return { ok: false, error: 'duracionMin debe ser mayor a 0.' };
    }
    payload.durationMin = Math.round(value);
  }

  if (required || raw.precio !== undefined) {
    const value = Number(raw.precio);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: 'precio debe ser un numero >= 0.' };
    }
    payload.priceCents = Math.round(value * 100);
  }

  if (required || raw.categoria !== undefined) {
    payload.category = String(raw.categoria || '').trim() || 'general';
  }

  if (required || raw.descripcion !== undefined) {
    payload.description = String(raw.descripcion || '').trim();
  }

  if (raw.activo !== undefined) {
    if (typeof raw.activo !== 'boolean') {
      return { ok: false, error: 'activo debe ser boolean.' };
    }
    payload.isActive = raw.activo;
  }

  if (raw.orden !== undefined) {
    const value = Number(raw.orden);
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, error: 'orden debe ser un numero >= 0.' };
    }
    payload.displayOrder = Math.floor(value);
  }

  return { ok: true, value: payload };
}

function isDuplicateNameError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code !== 'ER_DUP_ENTRY') return false;

  const detail = String(
    (error as { sqlMessage?: string; message?: string })?.sqlMessage ??
      (error as { message?: string })?.message ??
      ''
  ).toLowerCase();

  return detail.includes('uniq_services_name');
}

function isServiceInUseError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ER_ROW_IS_REFERENCED_2';
}
