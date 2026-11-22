import { describe, it, expect } from 'vitest';
import {
  APPROVAL_FAILURE_LADDER, APPROVAL_GRANT_TTL_MS, APPROVAL_REQUEST_STATUSES, APPROVAL_REQUEST_TTL_MS, APPROVAL_RESOURCE_OPTIONAL,
  APPROVAL_RESOURCE_TYPES, APPROVAL_RESOURCES_BY_PERMISSION, approvalFailureStep, approvalResourceTypesFor,
  isApprovalRequestStatus, isApprovalResourceType, monthOfMonthlyCloseResourceId, monthlyCloseResourceId,
} from '../src/approvals.js';
import { PERMISSIONS } from '../src/permissions.js';

/** UUID con la forma de RFC 9562 (versión 1 a 8, variante 10xx): lo que exige la API. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('segunda firma en el núcleo (bloque 0.9)', () => {
  it('las vigencias viven en un solo lugar: la firma 5 minutos, la solicitud 10', () => {
    expect(APPROVAL_GRANT_TTL_MS).toBe(5 * 60_000);
    expect(APPROVAL_REQUEST_TTL_MS).toBe(10 * 60_000);
    expect(APPROVAL_REQUEST_TTL_MS).toBeGreaterThan(APPROVAL_GRANT_TTL_MS);
  });

  it('el cierre de un mes tiene un id fijo por mes, con forma de UUID, que se lee de regreso (20-01)', () => {
    const id = monthlyCloseResourceId('2026-10');
    expect(id).toBe('00000000-0000-8000-8000-000000202610');
    expect(id).toMatch(UUID);
    expect(monthOfMonthlyCloseResourceId(id)).toBe('2026-10');
    expect(monthOfMonthlyCloseResourceId(id.toUpperCase())).toBe('2026-10');
    expect(monthlyCloseResourceId('2026-09')).not.toBe(id);
    // Un id cualquiera de la base (versión 7) no es un cierre.
    expect(monthOfMonthlyCloseResourceId('0197a1b2-3c4d-7e5f-8a6b-7c8d9e0f1a2b')).toBeNull();
    expect(monthOfMonthlyCloseResourceId('00000000-0000-8000-8000-000000202613')).toBeNull();
    expect(() => monthlyCloseResourceId('2026-13')).toThrow(/Mes inválido/);
    expect(() => monthlyCloseResourceId('octubre')).toThrow(/Mes inválido/);
  });

  it('toda operación que pide firma dice de qué registro se trata (29-01)', () => {
    const conFirma = PERMISSIONS.filter((p) => p.requiresApproval).map((p) => p.key);
    expect(conFirma.length).toBeGreaterThan(0);
    for (const p of conFirma) expect(approvalResourceTypesFor(p).length, p).toBeGreaterThan(0);
    // Las que la piden al pasar un tope, también.
    for (const p of ['billing:discount:apply', 'cash:withdraw', 'billing:waiver:apply', 'payments:refund']) {
      expect(approvalResourceTypesFor(p).length, p).toBeGreaterThan(0);
    }
    for (const tipos of Object.values(APPROVAL_RESOURCES_BY_PERMISSION)) {
      for (const t of tipos) expect(isApprovalResourceType(t), t).toBe(true);
    }
    // Lo que no lleva segunda firma no tiene tipo: el servidor no la pide a distancia.
    expect(approvalResourceTypesFor('members:read')).toEqual([]);
    // La condonación puede ser de un cargo o del adeudo de una membresía.
    expect(approvalResourceTypesFor('billing:waiver:apply')).toEqual(['Charge', 'Membership']);
    expect(APPROVAL_RESOURCE_OPTIONAL.has('reports:month:close')).toBe(true);
    expect(APPROVAL_RESOURCE_TYPES).toContain('MonthlyClose');
  });

  it('los desenlaces de una solicitud son cinco y se reconocen', () => {
    expect([...APPROVAL_REQUEST_STATUSES]).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELED']);
    expect(isApprovalRequestStatus('APPROVED')).toBe(true);
    expect(isApprovalRequestStatus('USED')).toBe(false);
  });

  it('la escalera avisa al 3.er fallo y pausa al 5.º (24-11, D24-04)', () => {
    expect(APPROVAL_FAILURE_LADDER).toMatchObject({ warnAt: 3, pauseAt: 5, windowMs: 600_000, pauseMs: 600_000 });
    expect([1, 2, 3, 4, 5, 6].map((n) => approvalFailureStep(n))).toEqual(['none', 'none', 'warn', 'none', 'pause', 'pause']);
  });
});
