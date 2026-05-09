import axios from 'axios';
import { WhatsAppService } from '../services/whatsapp.service';
import { logger } from '../utils/logger';

jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));

describe('WhatsAppService', () => {
  const to = '521234567890';
  const customerName = 'Juan Perez';
  const date = '2023-10-20';
  const time = '10:00';

  let axiosPostSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    axiosPostSpy = jest.spyOn(axios, 'post');
  });

  afterEach(() => {
    axiosPostSpy.mockRestore();
  });

  describe('sendAppointmentReminder', () => {
    it('debería enviar un recordatorio exitosamente', async () => {
      axiosPostSpy.mockResolvedValueOnce({ data: { ok: true } });
      const result = await WhatsAppService.sendAppointmentReminder(to, customerName, date, time);
      expect(result).toBeDefined();
      expect(axiosPostSpy).toHaveBeenCalled();
    });

    it('debería lanzar error y registrarlo cuando falla la API', async () => {
      axiosPostSpy.mockRejectedValueOnce(new Error('API Failure'));
      
      let error;
      try {
        await WhatsAppService.sendAppointmentReminder(to, customerName, date, time);
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('sendAppointmentConfirmation', () => {
    it('debería enviar confirmación (fire and forget)', async () => {
      axiosPostSpy.mockResolvedValueOnce({ data: {} });
      await WhatsAppService.sendAppointmentConfirmation(to, customerName, 'Corte', date, time);
      expect(axiosPostSpy).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalled();
    });

    it('debería registrar error pero NO lanzar excepción', async () => {
      axiosPostSpy.mockRejectedValueOnce(new Error('Network Error'));
      // No debe lanzar
      await WhatsAppService.sendAppointmentConfirmation(to, customerName, 'Corte', date, time);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
