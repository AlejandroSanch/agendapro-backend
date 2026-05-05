import { Request, Response } from 'express';
import {
  createStaff,
  deleteStaff,
  listStaff,
  toggleStaffActive,
  updateStaff,
} from '../data/repositories/staff.repository';
import { createStaffSchema, staffIdParamSchema, updateStaffSchema } from '../validators/staff.validators';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';

function isDuplicateEmailError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  if (code !== 'ER_DUP_ENTRY') return false;
  const detail = String((error as any)?.sqlMessage ?? (error as any)?.message ?? '').toLowerCase();
  return detail.includes('uniq_staff_email');
}

function isStaffInUseError(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'ER_ROW_IS_REFERENCED_2';
}

export const StaffController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const staff = await listStaff(req.user.id);
    res.json({ staff });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const data = createStaffSchema.parse(req.body);

    try {
      const created = await createStaff(req.user.id, {
        nombre: data.nombre,
        telefono: data.telefono,
        email: data.email,
        rol: data.rol,
        especialidades: data.especialidades,
        horarioPropio: data.horarioPropio,
        horario: data.horario,
        descansoPropio: data.descansoPropio,
        descansoDesde: data.descansoDesde,
        descansoHasta: data.descansoHasta,
        activo: data.activo,
      });

      if (!created) throw new ApiError(404, 'Usuario no encontrado.');
      res.status(201).json({ staffMember: created });
    } catch (error) {
      if (isDuplicateEmailError(error)) throw new ApiError(409, 'Ya existe un empleado con ese email.');
      throw error;
    }
  }),

  update: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = staffIdParamSchema.parse(req.params);
    const data = updateStaffSchema.parse(req.body);

    console.log('Update Staff Data Received:', JSON.stringify(data, null, 2));

    try {
      const updated = await updateStaff(req.user.id, params.id, data);
      if (!updated) throw new ApiError(404, 'Empleado no encontrado.');
      res.json({ staffMember: updated });
    } catch (error) {
      if (isDuplicateEmailError(error)) throw new ApiError(409, 'Ya existe un empleado con ese email.');
      throw error;
    }
  }),

  toggleActive: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = staffIdParamSchema.parse(req.params);
    const updated = await toggleStaffActive(req.user.id, params.id);
    if (!updated) throw new ApiError(404, 'Empleado no encontrado.');
    res.json({ staffMember: updated });
  }),

  delete: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');

    const params = staffIdParamSchema.parse(req.params);

    // Verificar que no sea el último empleado
    const staff = await listStaff(req.user.id);
    if (staff.length <= 1) {
      throw new ApiError(400, 'Debe haber al menos un empleado en el equipo.');
    }

    try {
      const deleted = await deleteStaff(req.user.id, params.id);
      if (!deleted) throw new ApiError(404, 'Empleado no encontrado.');
      res.json({ ok: true });
    } catch (error) {
      if (isStaffInUseError(error)) throw new ApiError(409, 'No se puede eliminar: el empleado tiene citas asociadas.');
      throw error;
    }
  }),
};
