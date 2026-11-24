import { describe, it, expect } from 'vitest';
import { ADJUSTABLE_PERMISSIONS, LOCKABLE_SECTIONS, PERMISSIONS, ROLE_PERMISSIONS, effectiveSections, lockedPermissions } from '../src/index.js';

/**
 * Fase 4, bloque 4.5 (D-26): la nómina se anota por pago, con nombre. Quién
 * ve cuánto se le paga a cada persona, dicho en el núcleo.
 */
describe('4.5 · quién ve la nómina por persona', () => {
  const PERMISO = 'expenses:payroll:read';

  it('el permiso existe y lo traen el Dueño y el Gerente; recepción y coach, no, ni se les puede encender', () => {
    expect(PERMISSIONS.map((p) => p.key)).toContain(PERMISO);
    expect(ROLE_PERMISSIONS.OWNER).toContain(PERMISO);
    expect(ROLE_PERMISSIONS.MANAGER).toContain(PERMISO);
    expect(ROLE_PERMISSIONS.RECEPTION).not.toContain(PERMISO);
    expect(ROLE_PERMISSIONS.COACH).not.toContain(PERMISO);
    expect(ADJUSTABLE_PERMISSIONS.has(PERMISO)).toBe(false);
    // La sección Movimientos no tiene efecto para recepción ni para el coach: no hay interruptor que mostrarles.
    expect(effectiveSections('RECEPTION')).not.toContain('movimientos');
    expect(effectiveSections('COACH')).not.toContain('movimientos');
  });

  it('va con la sección Movimientos, y solo con ella: el Tablero deja ver el dinero, no la nómina por persona', () => {
    expect(LOCKABLE_SECTIONS.filter((s) => s.permissions.includes(PERMISO)).map((s) => s.key)).toEqual(['movimientos']);
    expect(lockedPermissions([], ['MANAGER']).has(PERMISO)).toBe(true);
    expect(lockedPermissions(['tablero'], ['MANAGER']).has(PERMISO)).toBe(true);
    expect(lockedPermissions(['tablero'], ['MANAGER']).has('reports:financial:read')).toBe(false);
    expect(lockedPermissions(['movimientos'], ['MANAGER']).has(PERMISO)).toBe(false);
    // La dueña no tiene llave propia; si la plataforma le quita Movimientos, también pierde esto.
    expect(lockedPermissions([], ['OWNER']).has(PERMISO)).toBe(false);
    expect(lockedPermissions([], ['OWNER'], ['tablero']).has(PERMISO)).toBe(true);
  });

  it('la sección dice, antes de liberarla, que deja ver cuánto se le paga a cada persona', () => {
    const movimientos = LOCKABLE_SECTIONS.find((s) => s.key === 'movimientos')!;
    expect(movimientos.warning).toContain('cuánto se le paga a cada persona');
    expect(movimientos.text).toContain('nómina');
    // Ninguna otra sección trae aviso: si nace otro, que se decida aquí.
    expect(LOCKABLE_SECTIONS.filter((s) => s.warning).map((s) => s.key)).toEqual(['movimientos']);
  });
});
