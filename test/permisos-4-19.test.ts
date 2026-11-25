import { describe, it, expect } from 'vitest';
import {
  ADJUSTABLE_BY_ROLE, ADJUSTABLE_PERMISSION_GROUPS, NEVER_ADJUSTABLE_BY_ROLE, OWNER_WITHOUT_MANAGER, PERMISSION_BY_KEY, ROLE_BY_KEY,
  adjustableFor, applyOverrides, normalizeOverrides,
} from '../src/index.js';

/**
 * BLOQUE 4.19 · PERMISOS (respuestas de Israel del 2026-11-25).
 *  · P-09: anular ventas de la tienda deja de encenderse a recepción.
 *  · P-10: recepción nunca lee ni teclea la nota de salud.
 *  · P-02: lo que la dueña recibe mientras no hay gerente.
 */
describe('4.19 · lo que ya no se enciende a recepción', () => {
  it('P-09 y P-10: ni anular ventas ni la nota de salud están en la lista de recepción', () => {
    const rec = adjustableFor('RECEPTION');
    expect(rec.has('pos:sale:void')).toBe(false);
    expect(rec.has('members:health:read')).toBe(false);
    // «Se renueva sola» sigue viniendo con «cambiar de plan», que sí se enciende (P-09, como está).
    expect(rec.has('memberships:change_plan')).toBe(true);
    // Al coach la nota de salud de sus socios se le sigue ajustando.
    expect(adjustableFor('COACH').has('members:health:read')).toBe(true);
    // Y su puesto, tal como nace, tampoco los trae.
    for (const k of ['pos:sale:void', 'members:health:read'] as const) expect(ROLE_BY_KEY.get('RECEPTION')!.permissions).not.toContain(k);
  });

  it('un ajuste guardado de antes deja de valer para recepción y sigue valiendo para el coach', () => {
    const guardado = { add: ['pos:sale:void', 'members:health:read', 'billing:discount:apply'], remove: [] };
    expect(normalizeOverrides(guardado, 'RECEPTION')).toEqual({ add: ['billing:discount:apply'], remove: [] });
    expect(normalizeOverrides(guardado, 'COACH')).toEqual({ add: ['members:health:read'], remove: [] });
    const efectivos = applyOverrides([], normalizeOverrides(guardado, 'RECEPTION'), ['sede']).map((g) => g.permission);
    expect(efectivos).toEqual(['billing:discount:apply']);
  });

  it('la lista general sigue teniendo todo lo que se ajusta a alguien (la nota de salud, por el coach)', () => {
    const general = ADJUSTABLE_PERMISSION_GROUPS.flatMap((g) => g.permissions);
    for (const grupos of Object.values(ADJUSTABLE_BY_ROLE)) for (const g of grupos) for (const k of g.permissions) expect(general, k).toContain(k);
    expect(new Set(general).size).toBe(general.length);
    expect(ADJUSTABLE_PERMISSION_GROUPS.find((g) => g.name === 'Socios')!.permissions).toContain('members:health:read');
    expect(general).not.toContain('pos:sale:void');
  });

  it('cada «nunca» dice por qué, existe en el catálogo y de verdad no se le ajusta a ese puesto', () => {
    for (const [puesto, lista] of Object.entries(NEVER_ADJUSTABLE_BY_ROLE)) {
      for (const n of lista) {
        expect(PERMISSION_BY_KEY.has(n.permission), n.permission).toBe(true);
        expect(adjustableFor(puesto).has(n.permission), `${puesto} ${n.permission}`).toBe(false);
        expect(n.why.length).toBeGreaterThan(20);
      }
    }
    expect(NEVER_ADJUSTABLE_BY_ROLE.RECEPTION.map((n) => n.permission).sort()).toEqual(['members:health:read', 'pos:sale:void']);
  });
});

describe('4.19 · P-02 · la dueña sin gerente', () => {
  it('lo que recibe existe en el catálogo, lo trae el gerente y la dueña no lo trae por su puesto', () => {
    const duena = new Set(ROLE_BY_KEY.get('OWNER')!.permissions);
    const gerente = new Set(ROLE_BY_KEY.get('MANAGER')!.permissions);
    for (const k of OWNER_WITHOUT_MANAGER) {
      expect(PERMISSION_BY_KEY.has(k), k).toBe(true);
      expect(gerente.has(k), k).toBe(true);
      expect(duena.has(k), k).toBe(false);
    }
  });

  it('son las cuatro cosas de P-02 más lo de antes y lo mínimo para llegar a ellas; nunca la nota de salud ni dinero', () => {
    expect([...OWNER_WITHOUT_MANAGER].sort()).toEqual([
      'billing:debt-terms:set', 'cash:variance:approve', 'classes:read', 'classes:session:cancel',
      'members:coach:assign', 'members:read', 'reports:month:close', 'retention:terms:set', 'staff:manage',
    ]);
    for (const k of ['members:health:read', 'payments:record', 'pos:sale:void', 'cash:session:open', 'billing:waiver:apply', 'classes:manage'] as const) {
      expect(OWNER_WITHOUT_MANAGER).not.toContain(k);
    }
  });
});
