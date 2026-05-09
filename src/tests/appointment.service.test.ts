import { AppointmentService } from '../services/appointment.service';
import { getBusinessSettings, isHolidayClosure } from '../data/repositories/settings.repository';
import { listStaff } from '../data/repositories/staff.repository';
import { ApiError } from '../utils/ApiError';

jest.mock('../data/repositories/settings.repository');
jest.mock('../data/repositories/staff.repository');

describe('AppointmentService', () => {
  const userId = 'user123';
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCreate', () => {
    it('debería lanzar error si la fecha es en el pasado', async () => {
      const pastDate = '2020-01-01';
      const pastTime = '10:00';
      
      await expect(AppointmentService.validateCreate(userId, {
        fecha: pastDate,
        hora: pastTime,
        duracionMin: 30
      })).rejects.toThrow(ApiError);
    });

    it('debería lanzar error si es un día feriado', async () => {
      (isHolidayClosure as jest.Mock).mockResolvedValue(true);
      
      const futureDate = '2030-01-01';
      
      await expect(AppointmentService.validateCreate(userId, {
        fecha: futureDate,
        hora: '10:00',
        duracionMin: 30
      })).rejects.toThrow('El negocio está cerrado por feriado');
    });

    it('debería lanzar error si el negocio está cerrado ese día', async () => {
      (isHolidayClosure as jest.Mock).mockResolvedValue(false);
      
      // 2026-05-11 es Lunes. JS getDay() = 1. JS_TO_DB_DAY[1] = 0.
      const monday = '2026-05-11'; 
      
      (getBusinessSettings as jest.Mock).mockResolvedValue({
        schedules: [
          { day: 0, open: false, from: '09:00', to: '18:00' }
        ]
      });

      await expect(AppointmentService.validateCreate(userId, {
        fecha: monday,
        hora: '10:00',
        duracionMin: 30
      })).rejects.toThrow('El negocio está cerrado en el día seleccionado.');
    });

    it('debería lanzar error si la cita excede el horario de cierre', async () => {
      (isHolidayClosure as jest.Mock).mockResolvedValue(false);
      
      const monday = '2026-05-11'; 
      
      (getBusinessSettings as jest.Mock).mockResolvedValue({
        schedules: [
          { day: 0, open: true, from: '09:00', to: '18:00' }
        ]
      });

      await expect(AppointmentService.validateCreate(userId, {
        fecha: monday,
        hora: '17:45',
        duracionMin: 30 // Termina 18:15 > 18:00
      })).rejects.toThrow('excede el horario comercial');
    });

    it('debería lanzar error si la cita inicia antes del horario de apertura', async () => {
      (isHolidayClosure as jest.Mock).mockResolvedValue(false);
      
      const monday = '2026-05-11'; 
      
      (getBusinessSettings as jest.Mock).mockResolvedValue({
        schedules: [
          { day: 0, open: true, from: '09:00', to: '18:00' }
        ]
      });

      await expect(AppointmentService.validateCreate(userId, {
        fecha: monday,
        hora: '08:30',
        duracionMin: 30
      })).rejects.toThrow('excede el horario comercial');
    });

    it('debería lanzar error si la cita se solapa con el break del negocio', async () => {
      (isHolidayClosure as jest.Mock).mockResolvedValue(false);
      
      const monday = '2026-05-11'; 
      
      (getBusinessSettings as jest.Mock).mockResolvedValue({
        breakEnabled: true,
        breakStart: '14:00',
        breakEnd: '15:00',
        schedules: [
          { day: 0, open: true, from: '09:00', to: '18:00' }
        ]
      });

      await expect(AppointmentService.validateCreate(userId, {
        fecha: monday,
        hora: '14:30',
        duracionMin: 30
      })).rejects.toThrow('coincide con el horario de descanso');
    });

    it('debería lanzar error si la cita se solapa con el break propio del trabajador', async () => {
      (isHolidayClosure as jest.Mock).mockResolvedValue(false);
      
      const monday = '2026-05-11'; 
      
      (getBusinessSettings as jest.Mock).mockResolvedValue({
        breakEnabled: true,
        breakStart: '14:00', // Break general
        breakEnd: '15:00',
        schedules: [
          { day: 0, open: true, from: '09:00', to: '18:00' }
        ]
      });

      (listStaff as jest.Mock).mockResolvedValue([
        {
          nombre: 'Juan Perez',
          descansoPropio: true,
          descansoDesde: '12:00',
          descansoHasta: '13:00'
        }
      ]);

      // Debería fallar por el descanso del trabajador (12-13) aunque no choque con el general (14-15)
      await expect(AppointmentService.validateCreate(userId, {
        fecha: monday,
        hora: '12:15',
        duracionMin: 30,
        trabajador: 'Juan Perez'
      })).rejects.toThrow('coincide con el horario de descanso de 12:00 a 13:00');
    });

    it('debería pasar todas las validaciones con datos correctos', async () => {
      (isHolidayClosure as jest.Mock).mockResolvedValue(false);
      
      const monday = '2026-05-11'; 
      
      (getBusinessSettings as jest.Mock).mockResolvedValue({
        breakEnabled: true,
        breakStart: '14:00',
        breakEnd: '15:00',
        schedules: [
          { day: 0, open: true, from: '09:00', to: '18:00' }
        ]
      });

      await expect(AppointmentService.validateCreate(userId, {
        fecha: monday,
        hora: '10:00',
        duracionMin: 60
      })).resolves.not.toThrow();
    });
  });
});
