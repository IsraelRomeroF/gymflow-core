import { describe, expect, it } from 'vitest';
import {
  APPROVAL_PROXY_END_REASONS, APPROVAL_PROXY_MAX_DAYS, ERROR_REASONS, PERMISSION_BY_KEY, ROLE_PERMISSIONS,
  approvalProxyActive, approvalProxyLastDay, auditCategoryOf, auditNeedsReview, auditPhrase, hasAuditLabel, isApprovalProxyEndReason,
} from '../src/index.js';
import { ApprovalApprover, ApprovalProxyAppointment, ApprovalProxyState } from '../src/contracts/index.js';

/**
 * D-02 (b), bloque 3.1 de la fase 3: APODERADO TEMPORAL. El dueño nombra a
 * una persona con fecha de fin; firma lo de los demás con la autoridad del
 * dueño y la bitácora dice «firmó como apoderado».
 */
describe('apoderado temporal (D-02)', () => {
  it('dura como mucho 30 días contando hoy, y vale mientras esté abierto y su fecha no haya pasado', () => {
    expect(APPROVAL_PROXY_MAX_DAYS).toBe(30);
    expect(approvalProxyLastDay('2026-11-24')).toBe('2026-12-23');
    expect(approvalProxyLastDay('2027-02-01')).toBe('2027-03-02');
    const ahora = new Date('2026-11-24T18:00:00.000Z');
    expect(approvalProxyActive({ endsAt: new Date('2026-11-24T18:00:00.001Z'), endedAt: null }, ahora)).toBe(true);
    expect(approvalProxyActive({ endsAt: ahora, endedAt: null }, ahora)).toBe(false);
    expect(approvalProxyActive({ endsAt: new Date('2026-12-01T06:00:00.000Z'), endedAt: new Date('2026-11-24T10:00:00.000Z') }, ahora)).toBe(false);
  });

  it('termina por una de tres razones, y nada más', () => {
    expect([...APPROVAL_PROXY_END_REASONS]).toEqual(['REVOKED', 'EXPIRED', 'REPLACED']);
    expect(isApprovalProxyEndReason('REVOKED')).toBe(true);
    expect(isApprovalProxyEndReason('DELETED')).toBe(false);
  });

  it('`approvals:proxy` existe en el catálogo y NO es de ningún puesto: lo da un nombramiento', () => {
    expect(PERMISSION_BY_KEY.has('approvals:proxy')).toBe(true);
    for (const [puesto, permisos] of Object.entries(ROLE_PERMISSIONS)) expect(permisos, puesto).not.toContain('approvals:proxy');
    // La segunda firma por puesto sigue siendo solo del dueño.
    expect(ROLE_PERMISSIONS.OWNER).toContain('approvals:grant');
    expect(ROLE_PERMISSIONS.MANAGER).not.toContain('approvals:grant');
  });

  it('nombrar, revocar, reemplazar, vencer y el intento bloqueado tienen frase y van a «Para revisar»', () => {
    for (const accion of ['approval.proxy.grant', 'approval.proxy.revoke', 'approval.proxy.replace', 'approval.proxy.expire', 'approval.proxy.blocked']) {
      expect(hasAuditLabel(accion), accion).toBe(true);
      expect(auditNeedsReview({ action: accion }), accion).toBe(true);
      expect(auditCategoryOf(accion), accion).toBe('personal');
    }
    expect(auditPhrase({ action: 'approval.proxy.grant', afterState: { endsOn: '2026-12-05' } }, { person: 'Ana Ruiz' })).toBe('nombró apoderado temporal a Ana Ruiz, hasta el 5 de diciembre de 2026');
    expect(auditPhrase({ action: 'approval.proxy.grant', afterState: {} })).toBe('nombró apoderado temporal a una persona');
    expect(auditPhrase({ action: 'approval.proxy.revoke' }, { person: 'Ana Ruiz' })).toBe('revocó el nombramiento de apoderado de Ana Ruiz');
    expect(auditPhrase({ action: 'approval.proxy.expire' }, { person: 'Ana Ruiz' })).toBe('dio por vencido el nombramiento de apoderado de Ana Ruiz');
    expect(auditPhrase({ action: 'approval.proxy.blocked', afterState: { amountCents: '15000' } })).toBe('intentó autorizar como apoderado una operación de $150.00 que otra persona ya había rechazado');
  });

  it('la firma dada con un nombramiento se lee «firmó como apoderado de …»; la del dueño, como siempre', () => {
    const como = { asProxy: true, proxyOfName: 'Laura Méndez' };
    expect(auditPhrase({ action: 'approval.remote.approve', afterState: { summary: 'Retiro a caja fuerte', ...como } })).toBe('autorizó desde su teléfono · firmó como apoderado de Laura Méndez · Retiro a caja fuerte');
    expect(auditPhrase({ action: 'approval.remote.reject', afterState: { summary: 'Retiro a caja fuerte', ...como } })).toBe('rechazó desde su teléfono · firmó como apoderado de Laura Méndez · Retiro a caja fuerte');
    expect(auditPhrase({ action: 'approval.local.issue', afterState: { asProxy: true } })).toBe('obtuvo una firma en el mostrador · firmó como apoderado');
    expect(auditPhrase({ action: 'approval.remote.approve', afterState: { summary: 'Retiro a caja fuerte' } })).toBe('autorizó desde su teléfono · Retiro a caja fuerte');
    // Solo los asientos de firmas: otro asiento con ese campo no cambia su frase.
    expect(auditPhrase({ action: 'cash.withdraw', afterState: { asProxy: true, proxyOfName: 'Laura Méndez' } })).not.toMatch(/apoderado/);
  });

  it('los errores del apoderado están en el catálogo', () => {
    for (const r of ['APPROVAL_PROXY_BLOCKED_BY_REJECTION', 'APPROVAL_PROXY_INVALID_PERSON', 'APPROVAL_PROXY_INVALID_END', 'APPROVAL_PROXY_NONE']) {
      expect(Object.keys(ERROR_REASONS), r).toContain(r);
    }
  });

  it('los contratos: el firmante dice de quién es apoderado, y el estado del nombramiento', () => {
    expect(ApprovalApprover.safeParse({ userId: '018f0000-0000-7000-8000-000000000001', fullName: 'Ana Ruiz', pausedUntil: null, reach: 'push', proxyOf: 'Laura Méndez' }).success).toBe(true);
    const n = {
      id: '018f0000-0000-7000-8000-000000000002', proxyUserId: '018f0000-0000-7000-8000-000000000001', proxyName: 'Ana Ruiz',
      grantedByUserId: '018f0000-0000-7000-8000-000000000003', grantedByName: 'Laura Méndez', note: null,
      createdAt: '2026-11-24T18:00:00.000Z', endsAt: '2026-11-28T06:00:00.000Z', endedAt: null, endReason: null, active: true, signedCount: 0, rejectedCount: 0,
    };
    expect(ApprovalProxyAppointment.safeParse(n).success).toBe(true);
    expect(ApprovalProxyAppointment.safeParse({ ...n, endReason: 'DELETED' }).success).toBe(false);
    expect(ApprovalProxyState.safeParse({ canManage: true, mine: false, current: n, candidates: [], history: [], today: '2026-11-24', lastDay: '2026-12-23', maxDays: 30 }).success).toBe(true);
  });
});
