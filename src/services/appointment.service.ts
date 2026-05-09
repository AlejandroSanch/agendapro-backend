import {
  getBusinessSettings,
  isHolidayClosure,
  BusinessSchedule,
} from '../data/repositories/settings.repository';
import { listStaff, StaffRecord } from '../data/repositories/staff.repository';
import { AppointmentStatusDb } from '../data/utils';
import { ApiError } from '../utils/ApiError';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMinutes(timeStr: string): number {
  const [h, m] = String(timeStr || '')
    .split(':')
    .map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Maps JS getDay() (0=Sun) to DB day_of_week (0=Mon..6=Sun) */
const JS_TO_DB_DAY: Record<number, number> = { 0: 6, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 };

// ── Validaciones de negocio ──────────────────────────────────────────────────

/**
 * Valida que la fecha no sea pasada (con margen de 1 minuto).
 */
function validateNotInPast(date: string, time: string): void {
  const startAt = new Date(`${date}T${time}:00`);
  if (startAt.getTime() < Date.now() - 60_000) {
    throw new ApiError(400, 'No se puede crear una cita en el pasado.');
  }
}

/**
 * Valida que el negocio no esté cerrado por feriado.
 */
async function validateNotHoliday(userId: string, date: string): Promise<void> {
  const isHoliday = await isHolidayClosure(userId, date);
  if (isHoliday) {
    throw new ApiError(400, 'El negocio está cerrado por feriado o mantenimiento este día.');
  }
}

/**
 * Valida horario comercial: que la cita quepa dentro de las horas de apertura del día.
 */
function validateBusinessHours(
  schedule: BusinessSchedule | undefined,
  time: string,
  durationMin: number,
): void {
  if (!schedule || !schedule.open) {
    throw new ApiError(400, 'El negocio está cerrado en el día seleccionado.');
  }

  const startMin = toMinutes(time);
  const endMin = startMin + durationMin;
  const openMin = toMinutes(schedule.from);
  const closeMin = toMinutes(schedule.to);

  if (startMin < openMin || endMin > closeMin) {
    throw new ApiError(
      400,
      `La duración de la cita excede el horario comercial (${schedule.from} - ${schedule.to}).`,
    );
  }
}

/**
 * Resuelve el horario de descanso aplicable (personal o del negocio).
 */
function resolveBreakTime(
  trabajadorName: string | undefined,
  staffList: StaffRecord[],
  settings: { breakEnabled: boolean; breakStart: string | null; breakEnd: string | null },
): { breakStart: string | null; breakEnd: string | null } {
  if (trabajadorName) {
    const normalizedName = trabajadorName.toLowerCase().trim().replace(/\s+/g, ' ');
    const staffMember = staffList.find(
      (s) => s.nombre.toLowerCase().trim().replace(/\s+/g, ' ') === normalizedName,
    );
    if (staffMember?.descansoPropio) {
      return { breakStart: staffMember.descansoDesde, breakEnd: staffMember.descansoHasta };
    }
  }

  if (settings.breakEnabled) {
    return { breakStart: settings.breakStart, breakEnd: settings.breakEnd };
  }

  return { breakStart: null, breakEnd: null };
}

/**
 * Valida que la cita no se solape con el horario de descanso.
 */
function validateBreakTimeConflict(
  time: string,
  durationMin: number,
  breakStart: string | null,
  breakEnd: string | null,
): void {
  if (!breakStart || !breakEnd) return;

  const startMin = toMinutes(time);
  const endMin = startMin + durationMin;
  const breakStartMin = toMinutes(breakStart);
  const breakEndMin = toMinutes(breakEnd);

  if (startMin < breakEndMin && endMin > breakStartMin) {
    throw new ApiError(
      400,
      `La cita coincide con el horario de descanso de ${breakStart} a ${breakEnd}.`,
    );
  }
}

// ── Servicio principal ───────────────────────────────────────────────────────

export const AppointmentService = {
  /**
   * Ejecuta todas las validaciones de negocio para crear una cita.
   */
  async validateCreate(
    userId: string,
    data: {
      fecha: string;
      hora: string;
      duracionMin: number;
      trabajador?: string;
    },
  ): Promise<void> {
    // 1. No permitir citas en el pasado
    validateNotInPast(data.fecha, data.hora);

    // 2. Verificar feriados
    await validateNotHoliday(userId, data.fecha);

    // 3. Verificar horario comercial y break time
    const settings = await getBusinessSettings(userId);
    if (settings) {
      const dateObj = new Date(`${data.fecha}T00:00:00`);
      const dbDay = JS_TO_DB_DAY[dateObj.getDay()];
      const schedule = settings.schedules.find((s) => s.day === dbDay);

      validateBusinessHours(schedule, data.hora, data.duracionMin);

      // 4. Verificar descanso
      const staffList = data.trabajador ? await listStaff(userId) : [];
      const { breakStart, breakEnd } = resolveBreakTime(data.trabajador, staffList, settings);
      validateBreakTimeConflict(data.hora, data.duracionMin, breakStart, breakEnd);
    }
  },

  /**
   * Ejecuta las validaciones de negocio para actualizar una cita (break time).
   */
  async validateUpdate(
    userId: string,
    data: {
      fecha: string;
      hora: string;
      duracionMin: number;
      trabajador?: string;
    },
  ): Promise<void> {
    const settings = await getBusinessSettings(userId);
    if (!settings) return;

    const staffList = data.trabajador ? await listStaff(userId) : [];
    const { breakStart, breakEnd } = resolveBreakTime(data.trabajador, staffList, settings);
    validateBreakTimeConflict(data.hora, data.duracionMin, breakStart, breakEnd);
  },
};
