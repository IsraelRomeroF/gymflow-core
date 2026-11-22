import { describe, it, expect } from 'vitest';
import { lockedPermissions, normalizeUnlocked, isSectionOpen, LOCKABLE_SECTIONS, ROLE_PERMISSIONS, PERMISSIONS } from '../src/index.js';

describe('secciones bajo llave del dueño', () => {
  it('cada permiso de las secciones existe en el catálogo', () => {
    const claves = new Set(PERMISSIONS.map((p) => p.key as string));
    for (const s of LOCKABLE_SECTIONS) for (const p of s.permissions) expect(claves.has(p), `${s.key}: ${p}`).toBe(true);
  });

  it('sin nada liberado, el gerente pierde todo lo de Dirección y Cumplimiento', () => {
    const perdidos = lockedPermissions([], ['MANAGER']);
    expect(perdidos.has('reports:financial:read')).toBe(true);
    expect(perdidos.has('catalog:manage')).toBe(true);
    expect(perdidos.has('audit:read')).toBe(true);
    // Lo del mostrador no se toca.
    expect(perdidos.has('members:create')).toBe(false);
    expect(perdidos.has('payments:record')).toBe(false);
    expect(perdidos.has('catalog:read')).toBe(false);
  });

  it('lo que ESCRIBE una sección cerrada también se cierra con ella (28-04)', () => {
    expect(lockedPermissions([], ['RECEPTION']).has('retention:followup:write')).toBe(true);
    expect(lockedPermissions(['retencion'], ['RECEPTION']).has('retention:followup:write')).toBe(false);
    expect(lockedPermissions([], ['MANAGER']).has('payments:reconciliation:resolve')).toBe(true);
    expect(lockedPermissions(['tablero'], ['MANAGER']).has('payments:reconciliation:resolve')).toBe(false);
    // El cargo fuera del catálogo es operación de la gerencia: no depende de la llave.
    expect(lockedPermissions([], ['MANAGER']).has('billing:charge:manual')).toBe(false);
  });

  it('un permiso compartido se conserva si ALGUNA de sus secciones está liberada', () => {
    expect(lockedPermissions(['movimientos'], ['MANAGER']).has('reports:financial:read')).toBe(false);
    expect(lockedPermissions(['movimientos'], ['MANAGER']).has('billing:portfolio:read')).toBe(true);
  });

  it('el dueño nunca tiene llave', () => {
    expect(lockedPermissions([], ['OWNER']).size).toBe(0);
    expect(ROLE_PERMISSIONS.OWNER).toContain('staff:unlock');
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain('staff:unlock');
  });

  it('solo acepta claves conocidas y sin repetir', () => {
    expect(normalizeUnlocked(['tablero', 'tablero', 'inventada', 'planes'])).toEqual(['tablero', 'planes']);
  });

  it('Caja y Punto de venta vienen con el puesto: el dueño las quita con "-clave" (2026-10-07)', () => {
    expect(isSectionOpen('caja', [])).toBe(true);
    expect(isSectionOpen('caja', ['-caja'])).toBe(false);
    expect(isSectionOpen('tablero', [])).toBe(false);
    expect(lockedPermissions([], ['RECEPTION']).has('cash:session:open')).toBe(false);
    expect(lockedPermissions(['-caja'], ['RECEPTION']).has('cash:session:open')).toBe(true);
    expect(lockedPermissions(['-caja'], ['RECEPTION']).has('pos:sale:create')).toBe(false);
    expect(lockedPermissions(['-pos'], ['MANAGER']).has('pos:sale:create')).toBe(true);
    // Lo de inventario sigue siendo de Productos, no del punto de venta.
    expect(lockedPermissions(['-pos', 'productos'], ['MANAGER']).has('pos:inventory:adjust')).toBe(false);
    // Una clave positiva de Caja no significa nada; una negativa de Tablero tampoco.
    expect(normalizeUnlocked(['caja', '-caja', '-tablero', 'tablero', 'x'])).toEqual(['-caja', 'tablero']);
    expect(lockedPermissions(['-caja'], ['OWNER']).size).toBe(0);
  });
});
