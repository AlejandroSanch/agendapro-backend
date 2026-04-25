import { Request, Response } from 'express';
import {
  createService,
  deleteService,
  hasActiveAppointments,
  listServices,
  ServiceRecord,
  updateService,
} from '../data/repositories/service.repository';
import { createServiceSchema, serviceIdParamSchema, updateServiceSchema } from '../validators/services.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

function toApiService(service: ServiceRecord) {
  return {
    id: service.id,
    nombre: service.name.replace(/^\[BORRADO\] /, '').replace(/ \(\d{6}\)$/, ''),
    categoria: service.category,
    categoriaId: service.categoryId,
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
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    
    const services = await listServices(req.user.id);
    res.json({ services: services.map(toApiService) });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

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

    try {
      const created = await createService(req.user.id, payload);
      if (!created) throw new ApiError(404, 'Usuario no encontrado.');
      res.status(201).json({ service: toApiService(created) });
    } catch (error) {
      if (isDuplicateNameError(error)) throw new ApiError(409, 'Ya existe un servicio con ese nombre.');
      throw error;
    }
  }),

  update: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

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

    try {
      const updated = await updateService(req.user.id, params.id, payload);
      if (!updated) throw new ApiError(404, 'Servicio no encontrado.');
      res.json({ service: toApiService(updated) });
    } catch (error) {
      if (isDuplicateNameError(error)) throw new ApiError(409, 'Ya existe un servicio con ese nombre.');
      throw error;
    }
  }),

  delete: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = serviceIdParamSchema.parse(req.params);

    try {
      // 1. Verificar si tiene citas activas (programadas o confirmadas)
      const hasActive = await hasActiveAppointments(req.user.id, params.id);
      if (hasActive) {
        throw new ApiError(409, 'No se puede eliminar: el servicio tiene citas próximas programadas. Por favor cámbialas o cancélalas primero.');
      }

      // 2. Realizar borrado lógico
      const deleted = await deleteService(req.user.id, params.id);
      if (!deleted) throw new ApiError(404, 'Servicio no encontrado o ya eliminado.');
      
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw error;
    }
  })
};
