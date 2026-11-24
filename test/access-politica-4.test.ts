import { describe, it, expect } from 'vitest';
import {
  evaluateAccess, checkPolicyVersion, isOverridable,
  ACCESS_POLICY_VERSION, AVISO_PASE_DEL_DIA, AVISO_PASE_DE_PRUEBA, MOTIVO_DE_RECHAZO,
  type AccessRequest, type AccessSubject, type MembershipStatus, type VisitPackStatus,
} from '../src/index.js';
import { DENIAL_REASONS } from '../src/contracts/enums.js';
import { MOTIVOS, codigoDeTexto, textosDeMotivo } from '../src/motivos.js';
import { PERMISSIONS } from '../src/permissions.js';
import { ROLE_PERMISSIONS } from '../src/roles.js';
import { ADJUSTABLE_PERMISSIONS } from '../src/permisos-persona.js';
import { approvalResourceTypesFor } from '../src/approvals.js';

/**
 * POLÍTICA DE ACCESO 4.0.0 (auditoría 8, fase 3, bloque 3.3).
 *
 *   D-07 · una entrada por día y sucursal: la segunda es reentrada.
 *   D-06 · sin rostro no se entra por el mostrador, salvo autorización.
 *   D-08 · el pase de prueba.
 */
const AHORA = new Date('2026-11-23T18:30:00.000Z');
const CASA = 'sucursal-casa';
const OTRA = 'sucursal-otra';

const manual = { kind: 'MANUAL' as const, revoked: false, expiresAt: null, alreadyUsed: false };
const rostro = { ...manual, kind: 'FACE' as const };

function membresia(over: Partial<NonNullable<AccessSubject['membership']>> = {}) {
  return {
    status: 'ACTIVE' as MembershipStatus, homeBranchId: CASA, branchAccessScope: 'ALL_BRANCHES' as const,
    allowedBranchIds: [] as string[], accessTimeWindows: null, ...over,
  };
}
const paquete = (balance: number, status: VisitPackStatus = 'ACTIVE', expired = false) => ({ packId: 'p1', balance, expired, status });
const conPlan: AccessSubject = { memberId: 'm1', archived: false, membership: membresia(), visitPack: null };
const conPaquete = (balance: number, status: VisitPackStatus = 'ACTIVE'): AccessSubject => ({ memberId: 'm1', archived: false, membership: null, visitPack: paquete(balance, status) });

function peticion(over: Partial<AccessRequest> = {}): AccessRequest {
  return { at: AHORA, localMinuteOfDay: 12 * 60, localWeekday: 1, branchId: CASA, credential: manual, subject: conPlan, ...over };
}

describe('versión 4.0.0', () => {
  it('es un salto MAYOR: un gateway en 3.x queda marcado como incidente', () => {
    expect(ACCESS_POLICY_VERSION).toBe('4.0.0');
    const v = checkPolicyVersion('3.2.0');
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.severity).toBe('BLOCK');
    expect(checkPolicyVersion('4.0.0')).toEqual({ ok: true });
  });

  it('toda decisión dice si es reentrada, y un rechazo nunca lo es', () => {
    expect(evaluateAccess(peticion()).reentry).toBe(false);
    expect(evaluateAccess(peticion({ subject: null, entryToday: { visitPackId: null } })).reentry).toBe(false);
  });
});

describe('D-07 · una entrada por día y sucursal', () => {
  const yaEntro = { visitPackId: null };

  it('con plan: la segunda pasa, pero como reentrada', () => {
    const d = evaluateAccess(peticion({ entryToday: yaEntro }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.reentry).toBe(true);
    expect(d.consumesVisit).toBe(false);
  });

  it('con paquete: la primera descuenta; la segunda del día no', () => {
    const primera = evaluateAccess(peticion({ subject: conPaquete(5) }));
    expect(primera).toMatchObject({ outcome: 'GRANTED', consumesVisit: true, reentry: false });
    const segunda = evaluateAccess(peticion({ subject: conPaquete(4), entryToday: { visitPackId: 'p1' } }));
    expect(segunda).toMatchObject({ outcome: 'GRANTED', consumesVisit: false, reentry: true });
  });

  it('la última visita del paquete paga el día entero: vuelve a entrar con saldo cero', () => {
    // Esta mañana gastó su última visita: el paquete quedó agotado.
    for (const agotado of [conPaquete(0, 'EXHAUSTED'), conPaquete(0, 'ACTIVE')]) {
      const d = evaluateAccess(peticion({ subject: agotado, entryToday: { visitPackId: 'p1' } }));
      expect(d).toMatchObject({ outcome: 'GRANTED', consumesVisit: false, reentry: true, warning: null });
    }
    // Sin entrada de hoy, o si la de hoy no fue con ESTE paquete, el saldo cero no abre.
    expect(evaluateAccess(peticion({ subject: conPaquete(0, 'EXHAUSTED') })).reason).toBe('NO_VISITS_LEFT');
    expect(evaluateAccess(peticion({ subject: conPaquete(0, 'EXHAUSTED'), entryToday: { visitPackId: 'otro' } })).reason).toBe('NO_VISITS_LEFT');
    expect(evaluateAccess(peticion({ subject: conPaquete(0, 'EXHAUSTED'), entryToday: yaEntro })).reason).toBe('NO_VISITS_LEFT');
  });

  it('con saldo y una entrada de hoy que no fue con el paquete: pasa y tampoco descuenta', () => {
    const d = evaluateAccess(peticion({ subject: conPaquete(3), entryToday: yaEntro }));
    expect(d).toMatchObject({ outcome: 'GRANTED', consumesVisit: false, reentry: true });
  });

  it('en la reentrada no se anuncia «es su última visita»: no se descuenta nada', () => {
    expect(evaluateAccess(peticion({ subject: conPaquete(1) })).warning).toMatch(/última visita/);
    expect(evaluateAccess(peticion({ subject: conPaquete(1), entryToday: { visitPackId: 'p1' } })).warning).toBeNull();
  });

  it('el pase del día y el de prueba también vuelven a entrar como reentrada', () => {
    const delDia: AccessSubject = { memberId: 'm1', archived: false, membership: null, visitPack: null, dayPass: { branchId: CASA } };
    expect(evaluateAccess(peticion({ subject: delDia, entryToday: yaEntro }))).toMatchObject({ outcome: 'GRANTED', reentry: true, warning: AVISO_PASE_DEL_DIA });
    const dePrueba: AccessSubject = { memberId: 'm1', archived: false, membership: null, visitPack: null, trialPass: { branchId: CASA } };
    expect(evaluateAccess(peticion({ subject: dePrueba, entryToday: yaEntro }))).toMatchObject({ outcome: 'GRANTED', reentry: true, warning: AVISO_PASE_DE_PRUEBA });
  });

  it('la reentrada NO abre lo que hoy dejó de abrir', () => {
    const suspendida = { ...conPlan, membership: membresia({ status: 'SUSPENDED' }) };
    expect(evaluateAccess(peticion({ subject: suspendida, entryToday: yaEntro })).reason).toBe('MEMBERSHIP_SUSPENDED');
    const mora = { ...conPlan, membership: membresia({ status: 'PAST_DUE' }) };
    expect(evaluateAccess(peticion({ subject: mora, entryToday: yaEntro })).reason).toBe('MEMBERSHIP_PAST_DUE');
    const deManana = { ...conPlan, membership: membresia({ accessTimeWindows: [{ weekday: 1, fromMinute: 6 * 60, toMinute: 11 * 60 }] }) };
    expect(evaluateAccess(peticion({ subject: deManana, entryToday: yaEntro })).reason).toBe('OUTSIDE_TIME_WINDOW');
    expect(evaluateAccess(peticion({ subject: { ...conPlan, archived: true }, entryToday: yaEntro })).reason).toBe('MEMBER_ARCHIVED');
    expect(evaluateAccess(peticion({ credential: { ...manual, revoked: true }, entryToday: yaEntro })).reason).toBe('CREDENTIAL_REVOKED');
    // El paquete sin pagar o congelado tampoco, aunque la entrada de hoy fuera suya.
    expect(evaluateAccess(peticion({ subject: conPaquete(2, 'PENDING_PAYMENT'), entryToday: { visitPackId: 'p1' } })).reason).toBe('VISIT_PACK_UNPAID');
    expect(evaluateAccess(peticion({ subject: conPaquete(2, 'FROZEN'), entryToday: { visitPackId: 'p1' } })).reason).toBe('MEMBERSHIP_FROZEN');
  });

  it('el doble paso de los 8 segundos sigue siendo doble paso, no reentrada', () => {
    const d = evaluateAccess(peticion({ credential: { ...manual, alreadyUsed: true }, entryToday: yaEntro }));
    expect(d).toMatchObject({ outcome: 'DENIED', reason: 'DUPLICATE_SCAN', reentry: false });
  });

  it('sin `entryToday` todo decide como antes', () => {
    expect(evaluateAccess(peticion({ entryToday: null }))).toEqual(evaluateAccess(peticion()));
  });
});

describe('D-06 · sin rostro no se entra por el mostrador, salvo autorización de la gerencia', () => {
  const sinRostro = { enrolled: false, authorized: false };

  it('con plan al corriente y sin rostro: no entra', () => {
    const d = evaluateAccess(peticion({ biometricGate: sinRostro }));
    expect(d).toMatchObject({ outcome: 'DENIED', reason: 'BIOMETRIC_REQUIRED', consumesVisit: false });
  });

  it('recepción no lo levanta: no es un rechazo de mostrador', () => {
    expect(isOverridable('BIOMETRIC_REQUIRED')).toBe(false);
    expect(evaluateAccess(peticion({ biometricGate: sinRostro })).overridable).toBe(false);
  });

  it('con la autorización de la gerencia para esa visita, entra', () => {
    const d = evaluateAccess(peticion({ biometricGate: { enrolled: false, authorized: true } }));
    expect(d).toMatchObject({ outcome: 'GRANTED', reason: null, reentry: false });
  });

  it('con rostro registrado entra por el mostrador como siempre', () => {
    expect(evaluateAccess(peticion({ biometricGate: { enrolled: true, authorized: false } })).outcome).toBe('GRANTED');
  });

  it('con paquete: sin rostro no entra y NO se le descuenta la visita', () => {
    const d = evaluateAccess(peticion({ subject: conPaquete(5), biometricGate: sinRostro }));
    expect(d).toMatchObject({ outcome: 'DENIED', reason: 'BIOMETRIC_REQUIRED', consumesVisit: false });
    const autorizada = evaluateAccess(peticion({ subject: conPaquete(5), biometricGate: { enrolled: false, authorized: true } }));
    expect(autorizada).toMatchObject({ outcome: 'GRANTED', consumesVisit: true });
  });

  it('primero el plan, después el rostro: al que debe se le dice que debe', () => {
    const mora = { ...conPlan, membership: membresia({ status: 'PAST_DUE' }) };
    expect(evaluateAccess(peticion({ subject: mora, biometricGate: sinRostro })).reason).toBe('MEMBERSHIP_PAST_DUE');
    expect(evaluateAccess(peticion({ subject: { ...conPlan, membership: null }, biometricGate: sinRostro })).reason).toBe('NO_MEMBERSHIP');
    expect(evaluateAccess(peticion({ subject: conPaquete(0), biometricGate: sinRostro })).reason).toBe('NO_VISITS_LEFT');
    const otraSede = { ...conPlan, membership: membresia({ branchAccessScope: 'HOME_BRANCH' }) };
    expect(evaluateAccess(peticion({ subject: otraSede, branchId: OTRA, biometricGate: sinRostro })).reason).toBe('BRANCH_NOT_ALLOWED');
  });

  it('donde no se exige (`biometricGate` ausente) nada cambia', () => {
    expect(evaluateAccess(peticion()).outcome).toBe('GRANTED');
    expect(evaluateAccess(peticion({ biometricGate: null })).outcome).toBe('GRANTED');
  });

  it('solo pesa en el mostrador: quien pasa con su rostro ya lo demostró', () => {
    expect(evaluateAccess(peticion({ credential: rostro, biometricGate: sinRostro })).outcome).toBe('GRANTED');
  });

  it('la autorización vale la visita del día: la reentrada no la vuelve a pedir', () => {
    const d = evaluateAccess(peticion({ biometricGate: sinRostro, entryToday: { visitPackId: null } }));
    expect(d).toMatchObject({ outcome: 'GRANTED', reentry: true });
  });

  it('no alcanza al pase del día, al de prueba ni a la clase suelta', () => {
    const base = { memberId: 'm1', archived: false, membership: null, visitPack: null };
    expect(evaluateAccess(peticion({ subject: { ...base, dayPass: { branchId: CASA } }, biometricGate: sinRostro })).outcome).toBe('GRANTED');
    expect(evaluateAccess(peticion({ subject: { ...base, trialPass: { branchId: CASA } }, biometricGate: sinRostro })).outcome).toBe('GRANTED');
    expect(evaluateAccess(peticion({ subject: { ...base, classPass: { branchId: CASA, className: 'Yoga' } }, biometricGate: sinRostro })).outcome).toBe('GRANTED');
  });
});

describe('D-08 · pase de prueba', () => {
  const dePrueba: AccessSubject = { memberId: 'm1', archived: false, membership: null, visitPack: null, trialPass: { branchId: CASA } };

  it('sin plan, entra con su pase de prueba en la sede donde se dio y no en otra', () => {
    const d = evaluateAccess(peticion({ subject: dePrueba }));
    expect(d).toMatchObject({ outcome: 'GRANTED', consumesVisit: false, reentry: false, warning: AVISO_PASE_DE_PRUEBA });
    expect(evaluateAccess(peticion({ subject: dePrueba, branchId: OTRA })).reason).toBe('NO_MEMBERSHIP');
    expect(evaluateAccess(peticion({ subject: { ...dePrueba, trialPass: null } })).reason).toBe('NO_MEMBERSHIP');
  });

  it('no salta la baja ni gasta una visita del paquete', () => {
    expect(evaluateAccess(peticion({ subject: { ...dePrueba, archived: true } })).reason).toBe('MEMBER_ARCHIVED');
    const d = evaluateAccess(peticion({ subject: { ...dePrueba, visitPack: paquete(3) } }));
    expect(d).toMatchObject({ outcome: 'GRANTED', consumesVisit: false });
  });
});

describe('lo que acompaña a la política en el núcleo', () => {
  it('el rechazo nuevo tiene palabra y está en la lista de los contratos', () => {
    expect(MOTIVO_DE_RECHAZO.BIOMETRIC_REQUIRED).toBe('Sin rostro registrado');
    expect(DENIAL_REASONS).toContain('BIOMETRIC_REQUIRED');
  });

  it('autorizar sin rostro es de la gerencia: exige motivo, no viene con el mostrador y no se le libera a recepción', () => {
    const permiso = PERMISSIONS.find((p) => p.key === 'access:entry:authorize');
    expect(permiso).toMatchObject({ requiresReason: true, requiresApproval: false, module: 'biometrics' });
    expect(ROLE_PERMISSIONS.MANAGER).toContain('access:entry:authorize');
    for (const puesto of ['RECEPTION', 'COACH', 'OWNER'] as const) expect(ROLE_PERMISSIONS[puesto]).not.toContain('access:entry:authorize');
    expect(ADJUSTABLE_PERMISSIONS.has('access:entry:authorize')).toBe(false);
    // Si la gerencia no está, la firma de la dueña va atada al socio.
    expect(approvalResourceTypesFor('access:entry:authorize')).toEqual(['Member']);
  });

  it('los motivos de la autorización son de un toque y se vuelven a contar por código', () => {
    expect(textosDeMotivo('entradaSinRostro')).toContain('No quiere registrar su rostro');
    expect(codigoDeTexto('entradaSinRostro', 'No quiere registrar su rostro')).toBe('NO_QUIERE_BIOMETRIA');
    expect(codigoDeTexto('entradaSinRostro', 'Viene con su papá')).toBe('OTRO');
    expect(MOTIVOS.entradaSinRostro.motivos.length).toBeGreaterThanOrEqual(4);
  });
});
