import { Request, Response } from 'express';
import { z } from 'zod';
import {
  createService,
  deleteService,
  listServices,
  ServiceRecord,
  updateService,
} from '../data/repositories/service.repository';
import { createServiceSchema, serviceIdParamSchema, updateServiceSchema } from '../validators/services.validators';

function toApiService(service: ServiceRecord) {
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

function isDuplicateNameError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code !== 'ER_DUP_ENTRY') return false;
  const detail = String((error as any)?.sqlMessage ?? (error as any)?.message ?? '').toLowerCase();
  return detail.includes('uniq_services_name');
}

function isServiceInUseError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ER_ROW_IS_REFERENCED_2';
}

export const ServicesController = {
  async list(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }
      const services = await listServices(req.user.id);
      res.json({ services: services.map(toApiService) });
    } catch (error) {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async create(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }

      const data = createServiceSchema.parse(req.body);
      
      const payload = {
        name: data.nombre,
        durationMin: data.duracionMin,
        priceCents: Math.round(data.precio * 100),
        category: data.categoria,
        description: data.descripcion,
        isActive: data.activo,
        displayOrder: data.orden,
      };

      const created = await createService(req.user.id, payload);
      if (!created) {
        res.status(404).json({ error: 'Usuario no encontrado.' });
        return;
      }

      res.status(201).json({ service: toApiService(created) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      if (isDuplicateNameError(error)) {
        res.status(409).json({ error: 'Ya existe un servicio con ese nombre.' });
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

      const params = serviceIdParamSchema.parse(req.params);
      const data = updateServiceSchema.parse(req.body);

      const payload: any = {};
      if (data.nombre !== undefined) payload.name = data.nombre;
      if (data.duracionMin !== undefined) payload.durationMin = data.duracionMin;
      if (data.precio !== undefined) payload.priceCents = Math.round(data.precio * 100);
      if (data.categoria !== undefined) payload.category = data.categoria;
      if (data.descripcion !== undefined) payload.description = data.descripcion;
      if (data.activo !== undefined) payload.isActive = data.activo;
      if (data.orden !== undefined) payload.displayOrder = data.orden;

      const updated = await updateService(req.user.id, params.id, payload);
      if (!updated) {
        res.status(404).json({ error: 'Servicio no encontrado.' });
        return;
      }

      res.json({ service: toApiService(updated) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      if (isDuplicateNameError(error)) {
        res.status(409).json({ error: 'Ya existe un servicio con ese nombre.' });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  },

  async delete(req: Request, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'No autorizado.' });
        return;
      }

      const params = serviceIdParamSchema.parse(req.params);

      const deleted = await deleteService(req.user.id, params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Servicio no encontrado.' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: (error as any).errors[0].message });
        return;
      }
      if (isServiceInUseError(error)) {
        res.status(409).json({ error: 'No se puede eliminar: el servicio tiene citas asociadas.' });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
};
