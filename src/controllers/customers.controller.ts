import { Request, Response } from 'express';
import {
  createCustomer,
  deleteCustomer,
  getCustomerById,
  listCustomers,
  toggleCustomerActive,
  updateCustomer,
} from '../data/repositories/customer.repository';
import { asyncWrapper } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import {
  createCustomerSchema,
  customerIdParamSchema,
  updateCustomerSchema,
} from '../validators/customers.validators';

export const CustomersController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const customers = await listCustomers(req.user.id);
    res.json({ customers });
  }),

  getById: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const { id } = customerIdParamSchema.parse(req.params);
    const customer = await getCustomerById(req.user.id, id);
    if (!customer) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ customer });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const data = createCustomerSchema.parse(req.body);
    const customer = await createCustomer(req.user.id, {
      nombre: data.nombre,
      telefono: data.telefono,
      email: data.email,
      fechaNacimiento: data.fechaNacimiento,
      sexo: data.sexo,
      notas: data.notas,
    });
    if (!customer) throw new ApiError(500, 'No se pudo crear el cliente.');
    res.status(201).json({ customer });
  }),

  update: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const { id } = customerIdParamSchema.parse(req.params);
    const data = updateCustomerSchema.parse(req.body);
    const customer = await updateCustomer(req.user.id, id, data);
    if (!customer) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ customer });
  }),

  toggleActive: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const { id } = customerIdParamSchema.parse(req.params);
    const customer = await toggleCustomerActive(req.user.id, id);
    if (!customer) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ customer });
  }),

  delete: asyncWrapper(async (req: Request, res: Response) => {
    if (!req.user) throw new ApiError(401, 'No autorizado.');
    const { id } = customerIdParamSchema.parse(req.params);
    const result = await deleteCustomer(req.user.id, id);
    if (!result.deleted && !result.deactivated) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ deleted: result.deleted, deactivated: result.deactivated });
  }),
};
