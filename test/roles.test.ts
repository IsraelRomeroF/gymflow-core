import { describe, it, expect } from 'vitest';
import {
  ROLES, ROLE_BY_KEY, ROLE_KEYS, ROLE_PERMISSIONS, ASSIGNABLE_ROLES, RETIRED_ROLES, PERMISSION_BY_KEY, isRoleKey, canApprove,
  type TenantContext,
} from '../src/index.js';

const tiene = (rol: string, p: string) => ROLE_PERMISSIONS[rol as keyof typeof ROLE_PERMISSIONS].includes(p as never);

describe('catálogo de puestos (ADR-039, cuatro puestos desde el 2026-10-05)', () => {
  it('el gimnasio tiene cuatro puestos; la plataforma no es uno de ellos', () => {
    expect(ROLES.map((r) => r.key)).toEqual([...ROLE_KEYS]);
    expect(ASSIGNABLE_ROLES.map((r) => r.key)).toEqual(['OWNER', 'MANAGER', 'RECEPTION', 'COACH']);
    expect(isRoleKey('CASHIER')).toBe(false);
    for (const r of ROLES) {
      expect(r.description.length).toBeGreaterThan(10);
      for (const p of r.permissions) expect(PERMISSION_BY_KEY.has(p), `${r.key}: ${p}`).toBe(true);
      expect(new Set(r.permissions).size, `${r.key} repite permisos`).toBe(r.permissions.length);
    }
  });

  it('los puestos retirados pasan al que los absorbe', () => {
    expect(RETIRED_ROLES).toEqual({ SUPERVISOR: 'MANAGER', CASHIER: 'RECEPTION', INSTRUCTOR: 'COACH' });
    for (const destino of Object.values(RETIRED_ROLES)) expect(isRoleKey(destino)).toBe(true);
  });

  it('el dueño consulta y da la segunda firma; no opera ni ve expedientes', () => {
    const d = ROLE_BY_KEY.get('OWNER')!;
    expect(d.permissions.filter((p) => !/:read$|^audit:export$|^approvals:grant$|^staff:unlock$|^staff:rescue$/.test(p))).toEqual([]);
    expect(d.permissions).toContain('approvals:grant');
    for (const noVe of ['members:read', 'billing:statement:read', 'classes:read', 'members:health:read']) expect(d.permissions).not.toContain(noVe);
  });

  it('cada puesto hace lo suyo y nada más', () => {
    // El gerente opera todo, pero no se firma a sí mismo ni a su par.
    expect(tiene('MANAGER', 'staff:manage') && tiene('MANAGER', 'payments:refund')).toBe(true);
    expect(tiene('MANAGER', 'approvals:grant')).toBe(false);
    // Un solo gerente: siempre todo el gimnasio (2026-10-06).
    expect(ROLE_BY_KEY.get('MANAGER')!.scope).toBe('org');
    // Recepción atiende, cobra y lleva su caja; no modifica.
    expect(tiene('RECEPTION', 'members:create') && tiene('RECEPTION', 'payments:record') && tiene('RECEPTION', 'cash:session:open') && tiene('RECEPTION', 'pos:sale:create')).toBe(true);
    expect(tiene('RECEPTION', 'members:update') || tiene('RECEPTION', 'cash:withdraw') || tiene('RECEPTION', 'billing:discount:apply')).toBe(false);
    // El coach da clases y entrena; nada de dinero.
    expect(tiene('COACH', 'classes:book_for_member') && tiene('COACH', 'training:assign')).toBe(true);
    expect(tiene('COACH', 'payments:record') || tiene('COACH', 'cash:session:read')).toBe(false);
    for (const r of ROLES) if (r.key !== 'MANAGER') expect(tiene(r.key, 'staff:manage'), r.key).toBe(false);
  });

  it('la plataforma no carga permisos de gimnasio: nunca entra como personal (28-17)', () => {
    expect(ROLE_BY_KEY.get('SUPERADMIN')!.permissions).toEqual(['platform:organizations:manage']);
  });

  it('cada permiso dice lo que autoriza: el cargo fuera del catálogo y resolver un pago son de la gerencia (28-04, 28-05)', () => {
    expect(tiene('MANAGER', 'billing:charge:manual') && tiene('MANAGER', 'payments:reconciliation:resolve')).toBe(true);
    for (const r of ['OWNER', 'RECEPTION', 'COACH', 'SUPERADMIN']) {
      expect(tiene(r, 'billing:charge:manual'), r).toBe(false);
      expect(tiene(r, 'payments:reconciliation:resolve'), r).toBe(false);
    }
    // Recepción emite el cargo del catálogo que cobra y anota el seguimiento de Retención.
    expect(tiene('RECEPTION', 'billing:charge:create') && tiene('RECEPTION', 'retention:followup:write')).toBe(true);
    // El cargo a mano sigue pidiendo motivo, que queda en la bitácora.
    expect(PERMISSION_BY_KEY.get('billing:charge:manual')!.requiresReason).toBe(true);
  });

  it('firma quien tiene approvals:grant sobre la sede, aunque no pueda ejecutar la operación', () => {
    const base = { organizationId: 'org', actorUserId: 'u', actorType: 'USER', limits: ROLE_BY_KEY.get('OWNER')!.limits } as const;
    const duena = { ...base, grants: [{ permission: 'approvals:grant', branchId: null }] } as unknown as TenantContext;
    const gerente = { ...base, grants: ROLE_PERMISSIONS.MANAGER.map((p) => ({ permission: p, branchId: null })) } as unknown as TenantContext;
    expect(canApprove(duena, 'payments:refund', { organizationId: 'org', branchId: 'b1', amountCents: 9_000_000n }).outcome).toBe('ALLOW');
    expect(canApprove(gerente, 'payments:refund', { organizationId: 'org', branchId: 'b1', amountCents: 100n }).outcome).toBe('DENY');
    expect(canApprove(duena, 'payments:refund', { organizationId: 'otra', branchId: 'b1' }).outcome).toBe('DENY');
  });
});
