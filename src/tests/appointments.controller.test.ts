import request from 'supertest';
import { app } from '../index';
import * as appointmentRepository from '../data/repositories/appointment.repository';
import { AppointmentService } from '../services/appointment.service';
import { SseManager } from '../utils/sse.manager';
import { WhatsAppService } from '../services/whatsapp.service';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { closeControlPool } from '../data/db';

jest.mock('../data/repositories/appointment.repository');
jest.mock('../services/appointment.service');
jest.mock('../utils/sse.manager');
jest.mock('../services/whatsapp.service');
jest.mock('../services/google-calendar.service');

// Mock Auth Middleware to bypass real JWT checks
jest.mock('../middleware/auth', () => ({
  ...jest.requireActual('../middleware/auth'),
  requireAuth: jest.fn((req, res, next) => {
    req.user = { id: 'u1', email: 'test@example.com', name: 'Test User' };
    next();
  }),
}));

describe('AppointmentsController (Integration)', () => {
  const mockApt = {
    id: 'apt123',
    customerName: 'Juan Perez',
    customerPhone: '521234567890',
    serviceName: 'Corte',
    durationMin: 30,
    priceCents: 1500,
    date: '2023-10-20',
    time: '10:00',
    status: 'scheduled',
    trabajador: 'Carlos',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await closeControlPool();
  });

  describe('GET /api/appointments', () => {
    it('debería listar citas correctamente', async () => {
      (appointmentRepository.listAppointments as jest.Mock).mockResolvedValue({
        data: [mockApt],
        total: 1,
      });

      const response = await request(app).get('/api/appointments');

      expect(response.status).toBe(200);
      expect(response.body.appointments).toHaveLength(1);
      expect(response.body.appointments[0].id).toBe('apt123');
    });
  });

  describe('POST /api/appointments', () => {
    it('debería crear una cita y disparar integraciones', async () => {
      (AppointmentService.validateCreate as jest.Mock).mockResolvedValue(true);
      (appointmentRepository.createAppointment as jest.Mock).mockResolvedValue(mockApt);
      (WhatsAppService.sendAppointmentConfirmation as jest.Mock).mockResolvedValue({});
      (GoogleCalendarService.pushEvent as jest.Mock).mockResolvedValue({});

      const response = await request(app)
        .post('/api/appointments')
        .send({
          clienteNombre: 'Juan Perez',
          clienteTelefono: '521234567890',
          servicio: 'Corte',
          duracionMin: 30,
          precio: 15,
          fecha: '2023-10-20',
          hora: '10:00',
          estado: 'pendiente',
          trabajador: 'Carlos',
        });

      expect(response.status).toBe(201);
      expect(appointmentRepository.createAppointment).toHaveBeenCalled();
      expect(SseManager.broadcast).toHaveBeenCalled();
      expect(WhatsAppService.sendAppointmentConfirmation).toHaveBeenCalled();
      expect(GoogleCalendarService.pushEvent).toHaveBeenCalled();
    });

    it('debería fallar si la validación de negocio falla', async () => {
      (AppointmentService.validateCreate as jest.Mock).mockRejectedValue(new Error('Solapamiento detected'));

      const response = await request(app)
        .post('/api/appointments')
        .send({
          clienteNombre: 'Juan Perez',
          servicio: 'Corte',
          duracionMin: 30,
          precio: 15,
          fecha: '2023-10-20',
          hora: '10:00',
          estado: 'pendiente',
        });

      expect(response.status).toBe(500); // Porque Error genérico en asyncWrapper va a globalErrorHandler -> 500
      // Nota: Si AppointmentService lanzara ApiError, sería 400/409.
    });
  });

  describe('PATCH /api/appointments/:id', () => {
    it('debería actualizar una cita', async () => {
      (appointmentRepository.findAppointmentById as jest.Mock).mockResolvedValue(mockApt);
      (AppointmentService.validateUpdate as jest.Mock).mockResolvedValue(true);
      (appointmentRepository.updateAppointment as jest.Mock).mockResolvedValue({
        ...mockApt,
        status: 'confirmed',
      });

      const response = await request(app)
        .patch('/api/appointments/apt123')
        .send({ estado: 'confirmada' });

      expect(response.status).toBe(200);
      expect(response.body.appointment.estado).toBe('confirmada');
      expect(SseManager.broadcast).toHaveBeenCalled();
    });

    it('debería devolver 404 si la cita no existe', async () => {
      (appointmentRepository.findAppointmentById as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/appointments/nonexistent')
        .send({ estado: 'confirmada' });

      expect(response.status).toBe(404);
    });
  });
});
