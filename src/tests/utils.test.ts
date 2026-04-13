import { hashPassword, verifyPasswordPlain, tenantDbNameFromUserId } from '../data/utils';
import { env } from '../config/env';

// Forzar env para pruebas predecibles
env.storePlaintextPasswords = false;
env.mysqlTenantDbPrefix = 'ap_tenant_';

describe('Data Utils (Criptografía y Formateo)', () => {
  describe('Gestión de Passwords', () => {
    it('debería hacer hash a un texto plano y retornar un string seguro distinto al input', () => {
      const plaintext = 'AgendaPro2026';
      const hashed = hashPassword(plaintext);
      
      expect(hashed).toBeDefined();
      expect(hashed.length).toBeGreaterThan(20);
      expect(hashed).not.toEqual(plaintext);
    });

    it('debería retornar true si el texto plano es el correcto contra su hash', () => {
      const plaintext = 'AgendaPro2026';
      const hashed = hashPassword(plaintext);
      
      const isValid = verifyPasswordPlain(hashed, plaintext);
      expect(isValid).toBe(true);
    });

    it('debería retornar false si el texto plano NO coincide con el hash', () => {
      const plaintext = 'AgendaPro2026';
      const hashed = hashPassword(plaintext);
      
      const isValid = verifyPasswordPlain(hashed, 'MalaPassword123');
      expect(isValid).toBe(false);
    });
  });

  describe('tenantDbNameFromUserId', () => {
    it('debería generar un prefijo asumiendo un id en formato "usr_xxx"', () => {
      const mapped = tenantDbNameFromUserId('usr_demo_001');
      expect(mapped).toBe('ap_tenant_usr_demo_001');
    });

    it('debería agregar un prefijo a un custom ID que carece de sufijos formales', () => {
      const mapped = tenantDbNameFromUserId('super_admin');
      expect(mapped).toBe('ap_tenant_super_admin');
    });
  });
});
