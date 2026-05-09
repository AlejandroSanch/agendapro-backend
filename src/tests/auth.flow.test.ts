import request from 'supertest';
import { app } from '../index';
import * as userRepository from '../data/repositories/user.repository';
import * as authMiddleware from '../middleware/auth';
import * as mailer from '../utils/mailer';
import { closeControlPool } from '../data/db';

jest.mock('../data/repositories/user.repository', () => ({
  ...jest.requireActual('../data/repositories/user.repository'),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  createUser: jest.fn(),
}));
jest.mock('../middleware/auth', () => ({
  ...jest.requireActual('../middleware/auth'),
  issueAccessToken: jest.fn(),
  issueRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));
jest.mock('../utils/mailer');
jest.mock('../data/utils', () => ({
  ...jest.requireActual('../data/utils'),
  verifyPasswordPlain: jest.fn().mockReturnValue(true),
}));

describe('Auth Flow Integration (Supertest)', () => {
  const mockUser = {
    id: 'u1',
    email: 'test@example.com',
    password: 'hashed_password',
    name: 'Test User',
    emailVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Cerrar cualquier handle abierto si lo hubiera
    await closeControlPool();
  });

  describe('POST /api/auth/login', () => {
    it('debería hacer login y devolver ambos tokens', async () => {
      (userRepository.findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (authMiddleware.issueAccessToken as jest.Mock).mockReturnValue('access_token_abc');
      (authMiddleware.issueRefreshToken as jest.Mock).mockReturnValue('refresh_token_xyz');

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          accessToken: 'access_token_abc',
          refreshToken: 'refresh_token_xyz',
          user: expect.any(Object),
        }),
      );
    });

    it('debería fallar si el email no está verificado', async () => {
      (userRepository.findUserByEmail as jest.Mock).mockResolvedValue({
        ...mockUser,
        emailVerified: false,
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unverified@example.com', password: 'password123' });

      expect(response.status).toBe(403);
      expect(response.body).toEqual(
        expect.objectContaining({
          requiresEmailVerification: true,
        }),
      );
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('debería rotar los tokens correctamente', async () => {
      (authMiddleware.verifyRefreshToken as jest.Mock).mockReturnValue({ sub: 'u1' });
      (userRepository.findUserById as jest.Mock).mockResolvedValue(mockUser);
      (authMiddleware.issueAccessToken as jest.Mock).mockReturnValue('new_access_token');
      (authMiddleware.issueRefreshToken as jest.Mock).mockReturnValue('new_refresh_token');

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'valid_refresh_token' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
      });
    });

    it('debería fallar si el refresh token es inválido', async () => {
      (authMiddleware.verifyRefreshToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid');
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid_token' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/auth/register', () => {
    it('debería registrar un usuario y devolver 201', async () => {
      (userRepository.findUserByEmail as jest.Mock).mockResolvedValue(null);
      (userRepository.createUser as jest.Mock).mockResolvedValue({
        ...mockUser,
        email: 'new@example.com',
        emailVerified: false,
        emailVerificationToken: 'v_token',
      });
      (mailer.sendMail as jest.Mock).mockResolvedValue(true);

      const response = await request(app).post('/api/auth/register').send({
        email: 'new@example.com',
        password: 'password123',
        name: 'New User',
        businessName: 'My Biz',
        acceptTerms: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.requiresEmailVerification).toBe(true);
      expect(userRepository.createUser).toHaveBeenCalled();
    });
  });
});
