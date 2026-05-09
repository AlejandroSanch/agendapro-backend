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
import { getAuthUser } from '../utils/request';
import {
  createCustomerSchema,
  customerIdParamSchema,
  updateCustomerSchema,
  paginationQuerySchema,
} from '../validators/customers.validators';

export const CustomersController = {
  list: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const query = paginationQuerySchema.parse(req.query);
    const { data, total } = await listCustomers(user.id, {
      page: query.page,
      limit: query.limit,
    });
    res.json({
      customers: data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
      },
    });
  }),

  getById: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const { id } = customerIdParamSchema.parse(req.params);
    const customer = await getCustomerById(user.id, id);
    if (!customer) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ customer });
  }),

  create: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const data = createCustomerSchema.parse(req.body);
    const customer = await createCustomer(user.id, {
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
    const user = getAuthUser(req);
    const { id } = customerIdParamSchema.parse(req.params);
    const data = updateCustomerSchema.parse(req.body);
    const customer = await updateCustomer(user.id, id, data);
    if (!customer) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ customer });
  }),

  toggleActive: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const { id } = customerIdParamSchema.parse(req.params);
    const customer = await toggleCustomerActive(user.id, id);
    if (!customer) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ customer });
  }),

  delete: asyncWrapper(async (req: Request, res: Response) => {
    const user = getAuthUser(req);
    const { id } = customerIdParamSchema.parse(req.params);
    const result = await deleteCustomer(user.id, id);
    if (!result.deleted && !result.deactivated) throw new ApiError(404, 'Cliente no encontrado.');
    res.json({ deleted: result.deleted, deactivated: result.deactivated });
  }),
};
