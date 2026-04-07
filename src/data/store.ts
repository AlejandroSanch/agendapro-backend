import { randomUUID } from 'crypto';
import { ModuleId, UserPublic, UserRecord } from '../types';

const users = new Map<string, UserRecord>();

const demoUser: UserRecord = {
  id: 'usr_demo_001',
  name: 'Daniel Hernandez',
  email: 'demo@agendapro.com',
  password: 'demo123',
  plan: 'pro',
  businessName: 'Mi Negocio',
  avatarInitials: 'DH',
  moduleOverrides: {},
};

users.set(demoUser.email, demoUser);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(user: UserRecord): UserPublic {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    businessName: user.businessName,
    avatarInitials: user.avatarInitials,
  };
}

export function findUserByEmail(email: string): UserRecord | undefined {
  return users.get(normalizeEmail(email));
}

export function findUserById(id: string): UserRecord | undefined {
  for (const user of users.values()) {
    if (user.id === id) return user;
  }
  return undefined;
}

export function createOrGetDemoUser(email: string, password: string): UserRecord {
  const normalizedEmail = normalizeEmail(email);
  const existing = users.get(normalizedEmail);
  if (existing) return existing;

  const localPart = normalizedEmail.split('@')[0] || 'usuario';
  const initials = localPart.slice(0, 2).toUpperCase();
  const newUser: UserRecord = {
    id: `usr_${randomUUID()}`,
    name: localPart,
    email: normalizedEmail,
    password,
    plan: 'pro',
    businessName: 'Mi Negocio',
    avatarInitials: initials,
    moduleOverrides: {},
  };
  users.set(normalizedEmail, newUser);
  return newUser;
}

export function verifyPassword(user: UserRecord, password: string): boolean {
  // TODO: reemplazar por hash de password (bcrypt/argon2) al pasar a DB real.
  return user.password === password;
}

export function sanitizeUser(user: UserRecord): UserPublic {
  return toPublicUser(user);
}

export function getModuleOverrides(userId: string): Partial<Record<ModuleId, boolean>> {
  return findUserById(userId)?.moduleOverrides ?? {};
}

export function setModuleOverride(userId: string, moduleId: ModuleId, enabled: boolean): Partial<Record<ModuleId, boolean>> {
  const user = findUserById(userId);
  if (!user) return {};
  user.moduleOverrides[moduleId] = enabled;
  return user.moduleOverrides;
}

export function clearModuleOverride(userId: string, moduleId: ModuleId): Partial<Record<ModuleId, boolean>> {
  const user = findUserById(userId);
  if (!user) return {};
  delete user.moduleOverrides[moduleId];
  return user.moduleOverrides;
}
