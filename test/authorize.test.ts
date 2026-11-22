import { describe, it, expect } from 'vitest';
import {
  can, canPossess, canApprove, isAllowed, UNLIMITED_LIMITS,
  type TenantContext, type Grant, type RoleLimits,
} from '../src/index.js';

const ORG_A = '01930000-0000-7000-8000-00000000000a';
const ORG_B = '01930000-0000-7000-8000-00000000000b';
const BRANCH_1 = '01930000-0000-7000-8000-0000000000b1';
const BRANCH_2 = '01930000-0000-7000-8000-0000000000b2';
const USER = '01930000-0000-7000-8000-0000000000u1';
const MANAGER = '01930000-0000-7000-8000-0000000000u2';

function ctx(grants: Grant[], limits: Partial<RoleLimits> = {}, actorUserId = USER): TenantContext {
  return {
    organizationId: ORG_A,
    actorType: 'USER',
    actorUserId,
    grants,
    limits: { ...UNLIMITED_LIMITS, ...limits },
    requestId: 'req-1',
  };
}

describe('frontera de tenant', () => {
  it('deniega un recurso de otra organización aunque tenga el permiso', () => {
    const d = can(ctx([{ permission: 'members:read', branchId: null }]), 'members:read', {
      organizationId: ORG_B,
    });
    expect(d).toEqual({ outcome: 'DENY', code: 'CROSS_TENANT', detail: expect.any(String) });
  });

  it('la comprobación de tenant ocurre ANTES que la de permiso', () => {
    const d = can(ctx([]), 'members:read', { organizationId: ORG_B });
    expect(d.outcome).toBe('DENY');
    if (d.outcome === 'DENY') expect(d.code).toBe('CROSS_TENANT');
  });
});

describe('alcance de sucursal', () => {
  const grants: Grant[] = [{ permission: 'billing:discount:apply', branchId: BRANCH_1 }];

  it('permite en su sucursal', () => {
    const d = can(ctx(grants), 'billing:discount:apply', {
      organizationId: ORG_A, branchId: BRANCH_1, percent: 5, reason: 'promesa de pago',
    });
    expect(isAllowed(d)).toBe(true);
  });

  it('DENIEGA en otra sucursal aunque tenga el permiso', () => {
    const d = can(ctx(grants), 'billing:discount:apply', {
      organizationId: ORG_A, branchId: BRANCH_2, percent: 5, reason: 'promesa de pago',
    });
    expect(d.outcome).toBe('DENY');
    if (d.outcome === 'DENY') expect(d.code).toBe('OUT_OF_BRANCH_SCOPE');
  });

  it('deniega una acción ORGANIZACIONAL (branchId: null) a quien solo tiene alcance de sucursal', () => {
    const d = can(ctx([{ permission: 'reports:branch:read', branchId: BRANCH_1 }]), 'reports:branch:read', {
      organizationId: ORG_A,
      branchId: null, // null = la acción es organizacional
    });
    expect(d.outcome).toBe('DENY');
  });

  it('SIN branchId basta con tener el permiso en cualquier alcance', () => {
    // Es la semántica del gate de ruta: exigir alcance organizacional aquí
    // dejaría a recepción fuera de todos los listados.
    const d = can(ctx([{ permission: 'members:read', branchId: BRANCH_1 }]), 'members:read', {
      organizationId: ORG_A,
    });
    expect(d.outcome).toBe('ALLOW');
  });

  it('un grant organizacional cubre cualquier sucursal', () => {
    const d = can(ctx([{ permission: 'members:read', branchId: null }]), 'members:read', {
      organizationId: ORG_A, branchId: BRANCH_2,
    });
    expect(d.outcome).toBe('ALLOW');
  });
});

describe('motivo obligatorio', () => {
  it('rechaza si falta el motivo', () => {
    const d = can(ctx([{ permission: 'cash:withdraw', branchId: null }]), 'cash:withdraw', {
      organizationId: ORG_A, branchId: BRANCH_1, amountCents: 1000n,
    });
    expect(d.outcome).toBe('DENY');
    if (d.outcome === 'DENY') expect(d.code).toBe('REASON_REQUIRED');
  });

  it('rechaza un motivo en blanco', () => {
    const d = can(ctx([{ permission: 'cash:withdraw', branchId: null }]), 'cash:withdraw', {
      organizationId: ORG_A, branchId: BRANCH_1, amountCents: 1000n, reason: '   ',
    });
    expect(d.outcome).toBe('DENY');
  });
});

describe('maker-checker', () => {
  it('exige aprobación cuando el permiso lo pide siempre', () => {
    const d = can(ctx([{ permission: 'payments:refund', branchId: null }]), 'payments:refund', {
      organizationId: ORG_A, amountCents: 100n, reason: 'cobro duplicado',
    });
    expect(d.outcome).toBe('REQUIRE_APPROVAL');
  });

  it('acepta con aprobador distinto', () => {
    const d = can(ctx([{ permission: 'payments:refund', branchId: null }]), 'payments:refund', {
      organizationId: ORG_A, amountCents: 100n, reason: 'cobro duplicado', approvedByUserId: MANAGER,
    });
    expect(d.outcome).toBe('ALLOW');
  });

  it('NADIE se aprueba a sí mismo', () => {
    const d = can(ctx([{ permission: 'payments:refund', branchId: null }]), 'payments:refund', {
      organizationId: ORG_A, amountCents: 100n, reason: 'x', approvedByUserId: USER,
    });
    expect(d.outcome).toBe('DENY');
  });
});

describe('límites cuantitativos', () => {
  it('descuento dentro del límite pasa', () => {
    const d = can(
      ctx([{ permission: 'billing:discount:apply', branchId: null }], { maxDiscountPercent: 10 }),
      'billing:discount:apply',
      { organizationId: ORG_A, percent: 10, reason: 'promesa de pago' },
    );
    expect(d.outcome).toBe('ALLOW');
  });

  it('descuento por encima del límite exige aprobación, no se deniega', () => {
    const d = can(
      ctx([{ permission: 'billing:discount:apply', branchId: null }], { maxDiscountPercent: 10 }),
      'billing:discount:apply',
      { organizationId: ORG_A, percent: 25, reason: 'promesa de pago' },
    );
    expect(d.outcome).toBe('REQUIRE_APPROVAL');
  });

  it('límite en CERO bloquea: no es cuestión de aprobar', () => {
    const d = can(
      ctx([{ permission: 'billing:waiver:apply', branchId: null }], { maxWaiverAmountCents: 0n }),
      'billing:waiver:apply',
      { organizationId: ORG_A, amountCents: 50000n, reason: 'incobrable', approvedByUserId: MANAGER },
    );
    expect(d.outcome).toBe('DENY');
    if (d.outcome === 'DENY') expect(d.code).toBe('LIMIT_FORBIDDEN');
  });
});

describe('concesión manual de acceso — nunca se bloquea', () => {
  const grants: Grant[] = [{ permission: 'access:manual_grant', branchId: BRANCH_1 }];

  it('dentro del límite: permite en silencio', () => {
    const d = can(ctx(grants, { maxManualAccessGrantsPerShift: 10 }), 'access:manual_grant', {
      organizationId: ORG_A, branchId: BRANCH_1, reason: 'lector no leyó la huella', shiftUsageCount: 3,
    });
    expect(d.outcome).toBe('ALLOW');
  });

  it('por encima del límite: PERMITE pero ALERTA (visibilidad, no prohibición)', () => {
    const d = can(ctx(grants, { maxManualAccessGrantsPerShift: 10 }), 'access:manual_grant', {
      organizationId: ORG_A, branchId: BRANCH_1, reason: 'lector no leyó la huella', shiftUsageCount: 12,
    });
    expect(d.outcome).toBe('ALLOW_WITH_ALERT');
    expect(isAllowed(d)).toBe(true);
  });
});

describe('canPossess — los tres significados de branchId', () => {
  const soloSucursal1 = ctx([{ permission: 'members:read', branchId: BRANCH_1 }]);
  const organizacional = ctx([{ permission: 'members:read', branchId: null }]);

  it('undefined: cualquier alcance basta (gate de ruta)', () => {
    expect(canPossess(soloSucursal1, 'members:read', { organizationId: ORG_A }).outcome).toBe('ALLOW');
  });

  it('null: exige alcance organizacional', () => {
    expect(canPossess(soloSucursal1, 'members:read', { organizationId: ORG_A, branchId: null }).outcome).toBe('DENY');
    expect(canPossess(organizacional, 'members:read', { organizationId: ORG_A, branchId: null }).outcome).toBe('ALLOW');
  });

  it('un id: exige alcance sobre ESA sucursal', () => {
    expect(canPossess(soloSucursal1, 'members:read', { organizationId: ORG_A, branchId: BRANCH_1 }).outcome).toBe('ALLOW');
    expect(canPossess(soloSucursal1, 'members:read', { organizationId: ORG_A, branchId: BRANCH_2 }).outcome).toBe('DENY');
  });

  it('la frontera de tenant se comprueba primero, siempre', () => {
    const d = canPossess(organizacional, 'members:read', { organizationId: ORG_B });
    expect(d.outcome).toBe('DENY');
    if (d.outcome === 'DENY') expect(d.code).toBe('CROSS_TENANT');
  });

  it('NO evalúa motivo ni aprobación: eso es del handler', () => {
    // cash:withdraw exige motivo en can(), pero el gate solo mira tenencia.
    const c = ctx([{ permission: 'cash:withdraw', branchId: BRANCH_1 }]);
    expect(canPossess(c, 'cash:withdraw', { organizationId: ORG_A }).outcome).toBe('ALLOW');
    expect(can(c, 'cash:withdraw', { organizationId: ORG_A, branchId: BRANCH_1, amountCents: 100n }).outcome).toBe('DENY');
  });
});

describe('canApprove · firma quien tiene approvals:grant sobre la sede (2026-10-05)', () => {
  it('un gerente con el permiso de la operación NO firma; el dueño con approvals:grant sí, en su alcance', () => {
    const g = ctx([{ permission: 'payments:refund', branchId: BRANCH_1 }], { maxRefundAmountCents: 300_000n }, MANAGER);
    expect(canApprove(g, 'payments:refund', { organizationId: ORG_A, branchId: BRANCH_1, amountCents: 200_000n }).outcome).toBe('DENY');
    const d = ctx([{ permission: 'approvals:grant', branchId: BRANCH_1 }]);
    expect(canApprove(d, 'payments:refund', { organizationId: ORG_A, branchId: BRANCH_1, amountCents: 3_000_000n }).outcome).toBe('ALLOW');
    expect(canApprove(d, 'payments:refund', { organizationId: ORG_A, branchId: BRANCH_2, amountCents: 100n }).outcome).toBe('DENY');
  });

  it('nadie se aprueba a sí mismo', () => {
    const d = ctx([{ permission: 'payments:reverse', branchId: null }]);
    const base = { organizationId: ORG_A, branchId: BRANCH_1, reason: 'Error de cobro', amountCents: 100n, approvedByUserId: USER };
    expect(can(d, 'payments:reverse', base).outcome).toBe('DENY');
  });
});

describe('el dueño solo consulta y firma (2026-10-05)', () => {
  it('OWNER tiene únicamente permisos de lectura y la segunda firma', async () => {
    const { ROLE_PERMISSIONS } = await import('../src/index.js');
    const deEscritura = ROLE_PERMISSIONS.OWNER.filter((p) => !/:read$|^audit:export$|^approvals:grant$|^staff:unlock$|^staff:rescue$/.test(p));
    expect(deEscritura).toEqual([]);
  });
});
