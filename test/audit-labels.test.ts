import { describe, it, expect } from 'vitest';
import {
  AUDIT_CATEGORIES, AUDIT_LABELS, AUDIT_REVIEW_CONDITIONAL, AUDIT_SUMMARIZED, auditAmountCents, auditCategoryOf, auditLabel, auditLabelNames,
  auditNeedsReview, auditPhrase, auditReviewReason,
} from '../src/audit-labels.js';

describe('bitácora en palabras (DP-05)', () => {
  it('cada frase está en español llano y usa {m} a lo sumo una vez', () => {
    for (const [accion, frase] of Object.entries(AUDIT_LABELS)) {
      expect(frase.length, accion).toBeGreaterThan(5);
      expect((frase.match(/\{m\}/g) ?? []).length, accion).toBeLessThanOrEqual(1);
      expect(frase, accion).not.toMatch(/[._][a-z]+[._]/);
    }
  });

  it('el importe entra en la frase y sin importe desaparece la marca', () => {
    expect(auditLabel('payments.record', { amount: '$650.00' })).toBe('registró un cobro de $650.00');
    expect(auditLabel('payments.record')).toBe('registró un cobro');
    expect(auditLabel('membership.override.extend')).toBe('corrigió a mano la membresía (extender la vigencia)');
    expect(auditLabel('membership.override.change-plan', { member: 'Ana López' })).toBe('corrigió a mano la membresía de Ana López (cambiar el plan)');
    expect(auditLabel('algo.raro')).toBe('algo raro');
  });

  it('toda acción con frase cae en una categoría visible para el dueño', () => {
    for (const accion of Object.keys(AUDIT_LABELS)) {
      expect(auditCategoryOf(accion), accion).not.toBeNull();
    }
  });


  it('las categorías no se pisan salvo "sensibles", que es transversal', () => {
    const vistas = new Map<string, string>();
    for (const [cat, prefijos] of Object.entries(AUDIT_CATEGORIES)) {
      if (cat === 'sensibles') continue;
      for (const p of prefijos) {
        // `health.read` vive en socios a propósito; lo demás no se repite.
        if (p === 'health.read') continue;
        expect(vistas.has(p), `${p} en ${cat} y ${vistas.get(p)}`).toBe(false);
        vistas.set(p, cat);
      }
    }
  });

  it('firmar, fallar, cancelar, vencer y la pausa de la firma tienen frase y van a Personal (20-02, 29-04, 24-11)', () => {
    for (const a of ['approval.local.issue', 'approval.local.fail', 'approval.remote.fail', 'approval.remote.cancel', 'approval.remote.expire', 'approval.pause']) {
      expect(AUDIT_LABELS[a], a).toBeTruthy();
      expect(auditCategoryOf(a), a).toBe('personal');
    }
    expect(auditLabel('approval.local.fail', { amount: '$150.00' })).toBe('falló una firma de $150.00 en el mostrador');
    expect(auditLabel('approval.remote.cancel', { amount: '$150.00' })).toBe('canceló una solicitud de autorización de $150.00');
    // Una contraseña ajena probada para firmar, y la pausa, son para revisar; firmar bien no.
    const sensibles = AUDIT_CATEGORIES.sensibles!;
    expect(sensibles).toContain('approval.local.fail');
    expect(sensibles).toContain('approval.pause');
    expect(sensibles).not.toContain('approval.local.issue');
  });

  it('la firma a distancia dice qué se pidió, no solo cuánto (20-05, bloque 2.10)', () => {
    const asiento = { action: 'approval.remote.request', afterState: { summary: 'Retiro a caja fuerte', amountCents: '15000' } };
    expect(auditPhrase(asiento)).toBe('pidió una autorización al teléfono de $150.00 · Retiro a caja fuerte');
    expect(auditPhrase({ ...asiento, action: 'approval.remote.expire' })).toBe('dio por vencida, sin respuesta, una solicitud de autorización de $150.00 · Retiro a caja fuerte');
    // Los asientos anteriores, sin resumen, se leen como antes.
    expect(auditPhrase({ action: 'approval.remote.approve', afterState: { amountCents: '15000' } })).toBe('autorizó desde su teléfono de $150.00');
  });

  it('cada transición de la membresía tiene frase propia, no "membresía: renew"', async () => {
    const { MEMBERSHIP_TRANSITIONS } = await import('../src/membership.js');
    for (const t of MEMBERSHIP_TRANSITIONS) expect(AUDIT_LABELS[`membership.${t.trigger.toLowerCase()}`], t.trigger).toBeTruthy();
  });

  it('reactivar a alguien y cerrar o reabrir una sede tienen frase propia (1.14)', () => {
    expect(auditLabel('staff.reactivate')).toBe('reactivó a una persona del personal con una contraseña temporal nueva');
    expect(auditCategoryOf('staff.reactivate')).toBe('personal');
    // Recuperar el acceso con una temporal es para revisar, como restablecer la contraseña.
    expect(AUDIT_CATEGORIES.sensibles).toContain('staff.reactivate');
    expect(auditLabel('branch.close')).toBe('cerró una sucursal');
    expect(auditLabel('branch.reopen')).toBe('reabrió una sucursal');
    expect(auditCategoryOf('branch.close')).toBe('catalogo');
  });

  it('«Cerrar las demás» tiene frase y va a Personal (24-14, 1.12)', () => {
    expect(auditLabel('session.revoke_others')).toBe('cerró su sesión en los demás equipos');
    expect(auditCategoryOf('session.revoke_others')).toBe('personal');
  });

  // ── Auditoría 8, bloque 1.11 ────────────────────────────────────────────────

  it('ninguna frase deja un hueco sin llenar, con datos o sin ellos (20-07)', () => {
    for (const accion of [...Object.keys(AUDIT_LABELS), 'membership.override.renew', 'membership.algo_nuevo']) {
      for (const datos of [{}, { amount: '$1.00', member: 'Ana López', person: 'Paola Núñez' }]) {
        const frase = auditLabel(accion, datos);
        expect(frase, accion).not.toMatch(/[{}|]/);
        expect(frase, accion).not.toMatch(/ {2,}| $|^ /);
      }
    }
  });

  it('la frase dice a quién y cuánto con huecos explícitos (20-07)', () => {
    expect(auditLabel('payments.record', { amount: '$650.00', member: 'Ana López' })).toBe('registró un cobro de $650.00 a Ana López');
    expect(auditLabel('member.create', { member: 'Ana López' })).toBe('dio de alta a Ana López');
    expect(auditLabel('member.create')).toBe('dio de alta a un socio');
    expect(auditLabel('member.reactivate')).toBe('reactivó a un exsocio');
    expect(auditLabel('portal.invite.issue', { member: 'Ana López' })).toBe('invitó a Ana López al portal');
    expect(auditLabel('portal.invite.issue')).toBe('invitó al portal');
    expect(auditLabel('pos.sale.create', { amount: '$85.00' })).toBe('registró una venta de mostrador de $85.00');
    expect(auditLabel('membership.renew', { member: 'Ana López' })).toBe('renovó la membresía de Ana López');
    expect(auditLabel('staff.role', { person: 'Paola Núñez' })).toBe('cambió el puesto de Paola Núñez');
    expect(auditLabel('staff.role')).toBe('cambió el puesto de alguien');
    expect(auditLabel('staff.rescue')).toBe('rescató la cuenta de su gerente');
    // El nombre de la persona no se cuela en una frase de socio ni al revés.
    expect(auditLabel('member.archive', { person: 'Paola Núñez' })).toBe('dio de baja a un socio');
    expect(auditLabelNames('member.archive', 'socio')).toBe(true);
    expect(auditLabelNames('member.archive', 'persona')).toBe(false);
    expect(auditLabelNames('cash.withdraw', 'socio')).toBe(false);
    expect(auditLabelNames('membership.override.renew', 'socio')).toBe(true);
  });

  it('el importe sale del asiento: importe, total, saldo aplicado o la diferencia del ajuste', () => {
    expect(auditAmountCents({ action: 'payments.record', afterState: { amountCents: '65000' } })).toBe(65000n);
    expect(auditAmountCents({ action: 'payments.reverse', afterState: { amountCents: '-65000' } })).toBe(65000n);
    expect(auditAmountCents({ action: 'pos.sale.create', afterState: { totalCents: '8500' } })).toBe(8500n);
    expect(auditAmountCents({ action: 'billing.credit.apply', afterState: { appliedCents: '1200' } })).toBe(1200n);
    expect(auditAmountCents({ action: 'billing.discount.apply', beforeState: { adjustedCents: '0' }, afterState: { adjustedCents: '-5000' } })).toBe(5000n);
    expect(auditAmountCents({ action: 'member.update', afterState: { firstName: 'Ana' } })).toBeNull();
    expect(auditAmountCents({ action: 'cash.withdraw', afterState: null, beforeState: undefined })).toBeNull();
  });

  it('la frase completa se arma con los datos del asiento (20-07, 20-10)', () => {
    expect(auditPhrase({ action: 'pos.sale.create', afterState: { totalCents: '8500', folio: 'A-1' } })).toBe('registró una venta de mostrador de $85.00');
    expect(auditPhrase({ action: 'payment.refund', afterState: { amountCents: '15000' } }, { member: 'Ana López' })).toBe('hizo un reembolso de $150.00 a Ana López');
    expect(auditPhrase({ action: 'billing.waiver.apply', beforeState: { adjustedCents: '0' }, afterState: { adjustedCents: '-65000' } }, { member: 'Ana López' }))
      .toBe('condonó una deuda de $650.00 a Ana López');
    expect(auditPhrase({ action: 'cash.session.close', afterState: { varianceCents: '0' } })).toBe('hizo el corte de caja, sin diferencia');
    expect(auditPhrase({ action: 'cash.session.close', afterState: { varianceCents: '-5000' } })).toBe('hizo el corte de caja con un faltante de $50.00');
    expect(auditPhrase({ action: 'cash.session.close', afterState: { varianceCents: '2050' } })).toBe('hizo el corte de caja con un sobrante de $20.50');
    expect(auditPhrase({ action: 'cash.session.close' })).toBe('hizo el corte de caja');
    expect(auditPhrase({ action: 'cash.session.open', afterState: { openingFloatCents: '50000' } })).toBe('abrió caja con $500.00 de fondo');
    expect(auditPhrase({ action: 'settings.module.enable', afterState: { name: 'Clases', alsoEnabled: ['Caja'] } })).toBe('encendió el módulo Clases (y también Caja)');
    expect(auditPhrase({ action: 'settings.module.disable', afterState: { name: 'Tienda' } })).toBe('apagó el módulo Tienda');
    expect(auditPhrase({ action: 'settings.module.branch.disable', afterState: { name: 'Caja', branchName: 'Centro' } })).toBe('apagó el módulo Caja en Centro');
    expect(auditPhrase({ action: 'settings.module.enable' })).toBe('encendió un módulo');
    expect(auditPhrase({ action: 'staff.password_reset' }, { person: 'Paola Núñez' })).toBe('restableció la contraseña de Paola Núñez');
    expect(auditPhrase({ action: 'report.month.close', afterState: { month: '2026-10', profitCents: '100' } })).toBe('cerró el mes de octubre de 2026');
    expect(auditPhrase({ action: 'report.month.close' })).toBe('cerró el mes');
    expect(auditPhrase({ action: 'privacy.request.effect' }, { member: 'Ana López' })).toBe('hizo efectiva una solicitud ARCO de Ana López');
  });

  it('«Para revisar» es el dinero que sale, el poder que cambia y las excepciones (20-06)', () => {
    const si = ['payment.refund', 'payments.reverse', 'billing.waiver.apply', 'billing.charge.void', 'billing.charge.create', 'cash.withdraw', 'pos.sale.void',
      'expense.void', 'visitpack.adjust', 'membership.override.renew', 'member.archive', 'member.anonymize', 'member.export', 'staff.role', 'staff.permissions',
      'staff.unlock', 'staff.password_reset', 'staff.rescue', 'settings.module.enable', 'settings.module.branch.disable', 'settings.approval_policy',
      'report.month.close', 'approval.local.fail', 'approval.pause', 'privacy.request.open'];
    for (const a of si) expect(auditNeedsReview({ action: a }), a).toBe(true);
    const no = ['payments.record', 'cash.session.open', 'cash.movement.create', 'pos.sale.create', 'member.create', 'member.update', 'membership.renew',
      'approval.local.issue', 'approval.remote.approve', 'auth.password_change', 'audit.export', 'system.daily_run'];
    for (const a of no) expect(auditNeedsReview({ action: a }), a).toBe(false);
  });

  it('el corte solo entra con diferencia, el descuento solo si pidió firma y la venta solo con fecha anterior (20-06, 20-03)', () => {
    expect(auditNeedsReview({ action: 'cash.session.close', afterState: { varianceCents: '0' } })).toBe(false);
    expect(auditNeedsReview({ action: 'cash.session.close', afterState: { varianceCents: '-100' } })).toBe(true);
    expect(auditNeedsReview({ action: 'cash.session.close' })).toBe(false);
    expect(auditReviewReason({ action: 'cash.session.close', afterState: { varianceCents: '-100' } })).toBe('El corte tuvo diferencia');
    expect(auditNeedsReview({ action: 'billing.discount.apply' })).toBe(false);
    expect(auditNeedsReview({ action: 'billing.discount.apply', approvedByUserId: 'u1' })).toBe(true);
    expect(auditNeedsReview({ action: 'membership.sale', afterState: { totalCents: '65000' } })).toBe(false);
    expect(auditNeedsReview({ action: 'membership.sale', afterState: { backdated: true } })).toBe(true);
    expect(auditReviewReason({ action: 'payment.refund' })).toBeNull();
    // Una condicional no puede estar además en la lista fija: entraría siempre.
    for (const a of Object.keys(AUDIT_REVIEW_CONDITIONAL)) expect(AUDIT_CATEGORIES.sensibles, a).not.toContain(a);
  });

  it('las entradas por excepción no van una por una: se resumen por persona y día (20-06)', () => {
    expect(AUDIT_SUMMARIZED).toEqual(['access.manual_grant', 'access.manual_entry']);
    for (const a of AUDIT_SUMMARIZED) {
      expect(auditNeedsReview({ action: a }), a).toBe(false);
      expect(auditCategoryOf(a)).toBe('acceso');
    }
  });

  it('lo que la plataforma hace en su consola tiene frase y categoría (24-19, 23-09)', () => {
    for (const a of ['platform.console.login', 'platform.console.logout', 'platform.console.reauth', 'platform.console.password_change',
      'platform.console.sessions_close_others', 'platform.catalog.plan.create', 'platform.catalog.plan.update', 'platform.catalog.price.update']) {
      expect(AUDIT_LABELS[a], a).toBeTruthy();
      expect(auditCategoryOf(a), a).toBe('plataforma');
    }
  });
});
