import { GoogleCalendarService } from '../services/google-calendar.service';
import { google } from 'googleapis';
import { getControlPool } from '../data/db';
import { logger } from '../utils/logger';

jest.mock('googleapis');
jest.mock('../data/db');
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

describe('GoogleCalendarService', () => {
  const userId = 'u1';
  const mockDb = {
    query: jest.fn(),
  };

  const mockOAuth2Client = {
    generateAuthUrl: jest.fn().mockReturnValue('http://auth.url'),
    getToken: jest.fn().mockResolvedValue({ tokens: { access_token: 'at', refresh_token: 'rt', expiry_date: 123456789 } }),
    setCredentials: jest.fn(),
    on: jest.fn(),
  };

  const mockCalendarClient = {
    events: {
      insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getControlPool as jest.Mock).mockReturnValue(mockDb);
    (google.auth.OAuth2 as unknown as jest.Mock).mockReturnValue(mockOAuth2Client);
    (google.calendar as jest.Mock).mockReturnValue(mockCalendarClient);
  });

  describe('getAuthUrl', () => {
    it('debería generar una URL de autenticación', () => {
      const url = GoogleCalendarService.getAuthUrl(userId);
      expect(url).toBe('http://auth.url');
      expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ state: userId })
      );
    });
  });

  describe('handleCallback', () => {
    it('debería intercambiar el código por tokens y guardarlos en DB', async () => {
      await GoogleCalendarService.handleCallback('code123', userId);
      expect(mockOAuth2Client.getToken).toHaveBeenCalledWith('code123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_integrations'),
        expect.arrayContaining([userId, 'at', 'rt'])
      );
    });
  });

  describe('getCalendarClient', () => {
    it('debería devolver null si no hay integración', async () => {
      mockDb.query.mockResolvedValueOnce([[]]);
      const client = await GoogleCalendarService.getCalendarClient(userId);
      expect(client).toBeNull();
    });

    it('debería configurar el cliente con tokens de la DB', async () => {
      mockDb.query.mockResolvedValueOnce([[{ access_token: 'at', refresh_token: 'rt', expires_at: new Date() }]]);
      const client = await GoogleCalendarService.getCalendarClient(userId);
      expect(client).toBeDefined();
      expect(mockOAuth2Client.setCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'at', refresh_token: 'rt' })
      );
    });
  });

  describe('pushEvent', () => {
    const appointment = {
      id: 'app123',
      fecha: '2023-12-01',
      hora: '14:00',
      duracionMin: 60,
      servicio: 'Masaje',
      clienteNombre: 'Ana',
      clienteTelefono: '123',
      notas: 'Alguna nota',
      trabajador: 'Carlos',
    };

    it('debería insertar un evento en Google Calendar', async () => {
      jest.spyOn(GoogleCalendarService, 'getCalendarClient').mockResolvedValue(mockCalendarClient as any);

      await GoogleCalendarService.pushEvent(userId, appointment, 'create');

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            summary: expect.stringContaining('Masaje'),
          }),
        }),
      );
    });

    it('debería manejar errores silenciosamente pero registrarlos', async () => {
      jest.spyOn(GoogleCalendarService, 'getCalendarClient').mockRejectedValue(new Error('API Fail'));

      await GoogleCalendarService.pushEvent(userId, appointment, 'create');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
