import { describe, it, expect } from 'vitest';
import {
  ADJUSTABLE_BY_ROLE, ADJUSTABLE_PERMISSIONS, ADJUSTABLE_PERMISSION_GROUPS, ADJUSTABLE_ROLES, PERMISSION_BY_KEY,
  adjustableFor, applyOverrides, normalizeOverrides,
} from '../src/index.js';

/** PERMISOS POR PERSONA: cada puesto con su lista (17-02, auditoría 8). */
describe('excepciones por puesto', () => {
  it('toda acción ajustable existe en el catálogo y la lista general las contiene todas', () => {
    for (const k of ADJUSTABLE_PERMISSIONS) expect(PERMISSION_BY_KEY.has(k), k).toBe(true);
    const general = new Set(ADJUSTABLE_PERMISSION_GROUPS.flatMap((g) => g.permissions));
    expect([...ADJUSTABLE_PERMISSIONS].every((k) => general.has(k))).toBe(true);
    expect([...ADJUSTABLE_ROLES].sort()).toEqual(['COACH', 'RECEPTION']);
    for (const grupos of Object.values(ADJUSTABLE_BY_ROLE)) for (const g of grupos) expect(g.permissions.length, g.name).toBeGreaterThan(0);
  });

  it('al coach nunca se le enciende dinero, caja, punto de venta, acceso ni altas', () => {
    const coach = adjustableFor('COACH');
    for (const k of coach) expect(k).toMatch(/^(classes|training):|^members:health:read$/);
    for (const k of ['cash:session:open', 'cash:withdraw', 'pos:sale:create', 'pos:sale:void', 'payments:record', 'billing:charge:create',
      'billing:discount:apply', 'members:create', 'members:update', 'members:intake:review', 'access:monitor', 'access:manual_grant',
      'access:biometric:enroll', 'memberships:create']) {
      expect(coach.has(k), k).toBe(false);
    }
    // A recepción sí se le ajusta lo del mostrador.
    expect(adjustableFor('RECEPTION').has('pos:sale:void') && adjustableFor('RECEPTION').has('cash:withdraw')).toBe(true);
  });

  it('a la gerencia, al dueño y a la plataforma no se les ajusta nada: van completos por su puesto', () => {
    for (const r of ['MANAGER', 'OWNER', 'SUPERADMIN', null, undefined]) expect(adjustableFor(r).size, String(r)).toBe(0);
  });

  it('un ajuste guardado que ya no le toca al puesto deja de valer', () => {
    const guardado = { add: ['cash:session:open', 'classes:manage', 'inventado:x'], remove: ['training:assign', 'pos:sale:create'] };
    expect(normalizeOverrides(guardado, 'COACH')).toEqual({ add: ['classes:manage'], remove: ['training:assign'] });
    expect(normalizeOverrides(guardado, 'RECEPTION')).toEqual({ add: ['cash:session:open', 'classes:manage'], remove: ['pos:sale:create', 'training:assign'] });
    expect(normalizeOverrides(guardado, 'MANAGER')).toEqual({ add: [], remove: [] });
    // Sin puesto, la lista general (lo que ya leía la base).
    expect(normalizeOverrides(guardado).add).toEqual(['cash:session:open', 'classes:manage']);
    // Y lo que queda se aplica sobre el puesto, en sus sucursales.
    const efectivos = applyOverrides([{ permission: 'training:assign', branchId: null }], normalizeOverrides(guardado, 'COACH'), [null]);
    expect(efectivos.map((g) => g.permission)).toEqual(['classes:manage']);
  });
});
