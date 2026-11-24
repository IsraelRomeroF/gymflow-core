import { describe, it, expect } from 'vitest';
import {
  APPROVAL_NOTE_MAX, APPROVAL_NOTE_MIN, APPROVAL_QUESTION_SUGGESTIONS, APPROVAL_REASK_LIMIT, APPROVAL_REJECTION_MEMORY_MS, APPROVAL_REJECT_LOCK_MS,
  APPROVAL_REQUEST_STATUSES, approvalRejectLockUntil,
} from '../src/approvals.js';
import { auditCategoryOf, auditNeedsReview, auditPhrase, hasAuditLabel } from '../src/audit-labels.js';
import { ERROR_REASONS } from '../src/errors.js';
import { ApprovalApprovers, ApprovalRequest } from '../src/contracts/approvals.js';

/** D-03, opción (b): el «no» queda pegado a la operación (auditoría 8, bloque 3.2). */
describe('firmas · D-03 en el núcleo', () => {
  it('las cifras de la decisión: 3 por hora, 30 minutos sin firma en el mostrador, y el «no» se recuerda un día', () => {
    expect(APPROVAL_REASK_LIMIT).toEqual({ max: 3, perMs: 60 * 60_000 });
    expect(APPROVAL_REJECT_LOCK_MS).toBe(30 * 60_000);
    expect(APPROVAL_REJECTION_MEMORY_MS).toBe(24 * 60 * 60_000);
    expect([APPROVAL_NOTE_MIN, APPROVAL_NOTE_MAX]).toEqual([3, 300]);
  });

  it('el candado del mostrador dura 30 minutos exactos desde el «no»', () => {
    const no = new Date('2026-06-10T15:26:00.000Z');
    expect(approvalRejectLockUntil(no, new Date('2026-06-10T15:26:01.000Z'))?.toISOString()).toBe('2026-06-10T15:56:00.000Z');
    expect(approvalRejectLockUntil(no, new Date('2026-06-10T15:55:59.999Z'))).not.toBeNull();
    expect(approvalRejectLockUntil(no, new Date('2026-06-10T15:56:00.000Z'))).toBeNull();
  });

  it('preguntar no es un estado nuevo: la solicitud sigue pendiente', () => {
    expect(APPROVAL_REQUEST_STATUSES).toEqual(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELED']);
    for (const q of APPROVAL_QUESTION_SUGGESTIONS) expect(q.length).toBeGreaterThanOrEqual(APPROVAL_NOTE_MIN);
  });

  it('las tres acciones nuevas tienen frase; el intento de firmar lo recién rechazado entra a «Para revisar»', () => {
    for (const a of ['approval.remote.ask', 'approval.remote.answer', 'approval.local.after_reject']) {
      expect(hasAuditLabel(a), a).toBe(true);
      expect(auditCategoryOf(a), a).toBe('personal');
    }
    expect(auditNeedsReview({ action: 'approval.local.after_reject' })).toBe(true);
    expect(auditNeedsReview({ action: 'approval.remote.ask' })).toBe(false);
    expect(auditNeedsReview({ action: 'approval.remote.answer' })).toBe(false);
    expect(auditPhrase({ action: 'approval.remote.ask', afterState: { summary: 'Retiro a caja fuerte', amountCents: '15000' } })).toBe('preguntó antes de autorizar una solicitud de $150.00 · Retiro a caja fuerte');
    expect(auditPhrase({ action: 'approval.local.after_reject', afterState: { amountCents: '15000' } })).toBe('intentó firmar en el mostrador una operación de $150.00 rechazada hace menos de 30 minutos');
  });

  it('los dos porqués nuevos están en el catálogo de errores', () => {
    expect(Object.keys(ERROR_REASONS)).toEqual(expect.arrayContaining(['APPROVAL_REPLY_REQUIRED', 'APPROVAL_REJECTED_RECENTLY']));
  });

  it('los contratos llevan el «no» anterior, la respuesta, la vez y la pregunta', () => {
    const solicitud = {
      id: '0190e000-0000-7000-8000-000000000001', permission: 'cash:withdraw', branchId: null, resourceType: 'CashSession', resourceId: '0190e000-0000-7000-8000-000000000002',
      amountCents: '15000', summary: 'Retiro a caja fuerte', reason: null, status: 'PENDING', decidedAt: null, rejectReason: null,
      expiresAt: '2026-06-10T15:40:00.000Z', createdAt: '2026-06-10T15:30:00.000Z', secondsLeft: 600, notifiedCount: 0, seenAt: null,
      previousRejection: { requestId: '0190e000-0000-7000-8000-000000000003', at: '2026-06-10T15:26:00.000Z', byUserId: '0190e000-0000-7000-8000-000000000009', byName: 'Persona Dueña', reason: 'Ese efectivo lo cuento yo mañana' },
      reply: 'Es para el depósito de hoy', attempt: 2,
      question: { text: '¿Ya contaste el cajón?', at: '2026-06-10T15:31:00.000Z', byUserId: '0190e000-0000-7000-8000-000000000009', byName: 'Persona Dueña', answer: null, answeredAt: null },
    };
    expect(ApprovalRequest.safeParse(solicitud).success).toBe(true);
    expect(ApprovalRequest.safeParse({ ...solicitud, attempt: undefined }).success).toBe(false);
    expect(ApprovalApprovers.safeParse({ approvers: [], requestTtlSeconds: 600, grantTtlSeconds: 300, operation: null }).success).toBe(true);
    expect(ApprovalApprovers.safeParse({
      approvers: [], requestTtlSeconds: 600, grantTtlSeconds: 300,
      operation: { previousRejection: solicitud.previousRejection, localLockedUntil: '2026-06-10T15:56:00.000Z', requestsUsed: 3, requestsMax: 3, nextRequestAt: '2026-06-10T16:20:00.000Z' },
    }).success).toBe(true);
  });
});
