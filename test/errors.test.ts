import { describe, it, expect } from 'vitest';
import {
  DomainError, ERROR_REASONS, SESSION_END_REASONS, conflict, isErrorReason, isSessionEndReason, notFound, unavailable, validation,
  type ErrorReason,
} from '../src/index.js';

describe('errores de dominio: el porqué estable (`reason`, 28-13)', () => {
  it('cada familia tiene su código HTTP; lo que no contesta es 503', () => {
    expect(conflict('x').httpStatus).toBe(409);
    expect(validation('x').httpStatus).toBe(422);
    expect(notFound().httpStatus).toBe(404);
    expect(unavailable('El motor facial no está encendido', 'FACE_ENGINE_DOWN').httpStatus).toBe(503);
  });

  it('el porqué viaja en el error sin cambiar su código ni su texto', () => {
    const e = conflict('No hay ninguna caja abierta en esta sucursal: abre turno antes de cobrar', 'NO_OPEN_REGISTER');
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('CONFLICT');
    expect(e.reason).toBe('NO_OPEN_REGISTER');
    expect(e.message).toMatch(/abre turno/);
    expect(validation('Hay 2 cajas abiertas', undefined, 'MULTIPLE_OPEN_REGISTERS').reason).toBe('MULTIPLE_OPEN_REGISTERS');
    // Sin porqué, el campo queda vacío: no se inventa uno.
    expect(conflict('Ya existe').reason).toBeUndefined();
    expect(new DomainError('CONFLICT', 'x', 'detalle').reason).toBeUndefined();
  });

  it('las claves son estables: MAYÚSCULAS_CON_GUION y con su descripción', () => {
    const claves = Object.keys(ERROR_REASONS) as ErrorReason[];
    expect(claves.length).toBeGreaterThan(20);
    for (const k of claves) {
      expect(k, k).toMatch(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/);
      expect(ERROR_REASONS[k].trim().length, k).toBeGreaterThan(10);
      expect(isErrorReason(k)).toBe(true);
    }
    expect(isErrorReason('NO_EXISTE')).toBe(false);
    expect(isErrorReason(undefined)).toBe(false);
    // `toString`, `constructor`… no son claves del catálogo.
    expect(isErrorReason('toString')).toBe(false);
  });

  it('las claves que el consolidado pidió están (28-13)', () => {
    for (const k of ['CASH_SESSION_CLOSED', 'ALREADY_PAID', 'MEMBERSHIP_NOT_ACTIVE', 'NO_OPEN_REGISTER', 'MULTIPLE_OPEN_REGISTERS', 'DUPLICATE_MEMBER', 'RATE_LIMITED']) {
      expect(isErrorReason(k), k).toBe(true);
    }
  });

  it('ningún porqué de negocio es un motivo de fin de sesión: el panel saca al login a quien reciba uno de esos', () => {
    for (const k of Object.keys(ERROR_REASONS)) expect(isSessionEndReason(k), k).toBe(false);
    for (const k of SESSION_END_REASONS) expect(isErrorReason(k), k).toBe(false);
  });
});
