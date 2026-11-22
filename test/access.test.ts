import { describe, it, expect } from 'vitest';
import {
  evaluateAccess, branchAllowed, withinTimeWindow, checkPolicyVersion,
  ACCESS_POLICY_VERSION, AVISO_PASE_DEL_DIA,
  isOverridable, DEFAULT_ACCESS_SETTINGS,
  type AccessRequest, type AccessSubject, type MembershipStatus,
} from '../src/index.js';

const AHORA = new Date('2026-09-24T18:30:00.000Z');
const CASA = 'sucursal-casa';
const OTRA = 'sucursal-otra';

const credencialOk = { kind: 'QR' as const, revoked: false, expiresAt: null, alreadyUsed: false };

function membresia(over: Partial<NonNullable<AccessSubject['membership']>> = {}) {
  return {
    status: 'ACTIVE' as MembershipStatus,
    homeBranchId: CASA,
    branchAccessScope: 'ALL_BRANCHES' as const,
    allowedBranchIds: [] as string[],
    accessTimeWindows: null,
    ...over,
  };
}

function peticion(over: Partial<AccessRequest> = {}): AccessRequest {
  return {
    at: AHORA,
    localMinuteOfDay: 12 * 60,
    localWeekday: 4,
    branchId: CASA,
    credential: credencialOk,
    subject: { memberId: 'm1', archived: false, membership: membresia(), visitPack: null },
    ...over,
  };
}

describe('pureza y determinismo', () => {
  it('la misma petición da EXACTAMENTE la misma decisión', () => {
    const p = peticion();
    expect(evaluateAccess(p)).toEqual(evaluateAccess(p));
  });

  it('el instante viene por PARÁMETRO, no del reloj', () => {
    const d = evaluateAccess(peticion({ at: new Date('2020-01-01T00:00:00.000Z') }));
    expect(d.evaluatedAt.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });

  it('toda decisión declara la versión de política que la produjo', () => {
    expect(evaluateAccess(peticion()).policyVersion).toBe(ACCESS_POLICY_VERSION);
    expect(evaluateAccess(peticion({ subject: null })).policyVersion).toBe(ACCESS_POLICY_VERSION);
  });
});

describe('credencial', () => {
  it('revocada: no llega ni a mirar al socio', () => {
    const d = evaluateAccess(peticion({
      credential: { ...credencialOk, revoked: true },
      subject: null,           // aunque no haya socio, gana la credencial
    }));
    expect(d.reason).toBe('CREDENTIAL_REVOKED');
  });

  it('caducada', () => {
    const d = evaluateAccess(peticion({
      credential: { ...credencialOk, expiresAt: new Date(AHORA.getTime() - 1) },
    }));
    expect(d.reason).toBe('CREDENTIAL_EXPIRED');
  });

  it('el instante EXACTO de caducidad ya no vale', () => {
    expect(evaluateAccess(peticion({
      credential: { ...credencialOk, expiresAt: AHORA },
    })).reason).toBe('CREDENTIAL_EXPIRED');
  });

  it('un QR reutilizado se rechaza: es el anti-replay', () => {
    expect(evaluateAccess(peticion({
      credential: { ...credencialOk, alreadyUsed: true },
    })).reason).toBe('DUPLICATE_SCAN');
  });
});

describe('socio', () => {
  it('desconocido', () => {
    expect(evaluateAccess(peticion({ subject: null })).reason).toBe('MEMBER_UNKNOWN');
  });

  /**
   * El caso que motivó la regla. Al ejecutar la plataforma aparecieron 15,073
   * membresías vivas de socios archivados: sin esto, todas abrían la puerta.
   */
  it('ARCHIVADO no entra, aunque su membresía figure ACTIVA', () => {
    const d = evaluateAccess(peticion({
      subject: { memberId: 'm1', archived: true, membership: membresia({ status: 'ACTIVE' }), visitPack: null },
    }));
    expect(d.outcome).toBe('DENIED');
    expect(d.reason).toBe('MEMBER_ARCHIVED');
  });

  it('archivado tampoco entra con un paquete de visitas con saldo', () => {
    expect(evaluateAccess(peticion({
      subject: {
        memberId: 'm1', archived: true, membership: null,
        visitPack: { packId: 'p1', balance: 5, expired: false, status: 'ACTIVE' },
      },
    })).reason).toBe('MEMBER_ARCHIVED');
  });
});

describe('estado de la membresía', () => {
  const casos: Array<[MembershipStatus, 'GRANTED' | 'DENIED', string | null]> = [
    ['ACTIVE', 'GRANTED', null],
    ['TRIALING', 'GRANTED', null],
    ['PAST_DUE', 'DENIED', 'MEMBERSHIP_PAST_DUE'],
    ['FROZEN', 'DENIED', 'MEMBERSHIP_FROZEN'],
    ['SUSPENDED', 'DENIED', 'MEMBERSHIP_SUSPENDED'],
    ['CANCELED', 'DENIED', 'MEMBERSHIP_ENDED'],
    ['EXPIRED', 'DENIED', 'MEMBERSHIP_ENDED'],
    ['PENDING', 'DENIED', 'MEMBERSHIP_ENDED'],
  ];

  for (const [estado, resultado, motivo] of casos) {
    it(`${estado} -> ${resultado}${motivo ? ` (${motivo})` : ''}`, () => {
      const d = evaluateAccess(peticion({
        subject: { memberId: 'm1', archived: false, membership: membresia({ status: estado }), visitPack: null },
      }));
      expect(d.outcome).toBe(resultado);
      expect(d.reason).toBe(motivo);
    });
  }

  it('MORA: no entra por defecto — el torniquete es donde la deuda se cobra', () => {
    const d = evaluateAccess(peticion({
      subject: { memberId: 'm1', archived: false, membership: membresia({ status: 'PAST_DUE' }), visitPack: null },
    }));
    expect(d.outcome).toBe('DENIED');
    expect(d.reason).toBe('MEMBERSHIP_PAST_DUE');
  });

  it('el rechazo por mora es LEVANTABLE: recepción puede dar el paso', () => {
    const d = evaluateAccess(peticion({
      subject: { memberId: 'm1', archived: false, membership: membresia({ status: 'PAST_DUE' }), visitPack: null },
    }));
    expect(d.overridable).toBe(true);
  });

  it('un gimnasio PUEDE configurar que la mora sí entre', () => {
    const d = evaluateAccess(peticion({
      subject: { memberId: 'm1', archived: false, membership: membresia({ status: 'PAST_DUE' }), visitPack: null },
      settings: { allowAccessWhilePastDue: true },
    }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.warning).toMatch(/pago pendiente/);
  });

  it('una credencial REVOCADA nunca es levantable: no es trámite de mostrador', () => {
    const d = evaluateAccess(peticion({ credential: { ...credencialOk, revoked: true } }));
    expect(d.overridable).toBe(false);
  });

  it('un socio DADO DE BAJA tampoco es levantable', () => {
    const d = evaluateAccess(peticion({
      subject: { memberId: 'm1', archived: true, membership: membresia(), visitPack: null },
    }));
    expect(d.overridable).toBe(false);
  });

  it('sin membresía ni paquete', () => {
    expect(evaluateAccess(peticion({
      subject: { memberId: 'm1', archived: false, membership: null, visitPack: null },
    })).reason).toBe('NO_MEMBERSHIP');
  });
});

describe('alcance por sucursal', () => {
  it('ALL_BRANCHES entra en cualquiera', () => {
    expect(branchAllowed(membresia({ branchAccessScope: 'ALL_BRANCHES' }), OTRA)).toBe(true);
  });

  it('HOME_BRANCH solo en la suya', () => {
    const m = membresia({ branchAccessScope: 'HOME_BRANCH' });
    expect(branchAllowed(m, CASA)).toBe(true);
    expect(branchAllowed(m, OTRA)).toBe(false);
  });

  it('LISTED_BRANCHES solo en las listadas', () => {
    const m = membresia({ branchAccessScope: 'LISTED_BRANCHES', allowedBranchIds: [OTRA] });
    expect(branchAllowed(m, OTRA)).toBe(true);
    expect(branchAllowed(m, CASA)).toBe(false);
  });

  it('la sucursal equivocada da un motivo PROPIO, no un rechazo genérico', () => {
    const d = evaluateAccess(peticion({
      branchId: OTRA,
      subject: {
        memberId: 'm1', archived: false,
        membership: membresia({ branchAccessScope: 'HOME_BRANCH' }), visitPack: null,
      },
    }));
    expect(d.reason).toBe('BRANCH_NOT_ALLOWED');
  });
});

describe('ventanas horarias', () => {
  const manana = [{ weekday: 4, fromMinute: 6 * 60, toMinute: 12 * 60 }];

  it('SIN ventanas declaradas no hay restricción', () => {
    expect(withinTimeWindow(null, 4, 3 * 60)).toBe(true);
    expect(withinTimeWindow([], 4, 3 * 60)).toBe(true);
  });

  it('dentro de la ventana entra; fuera, no', () => {
    expect(withinTimeWindow(manana, 4, 8 * 60)).toBe(true);
    expect(withinTimeWindow(manana, 4, 13 * 60)).toBe(false);
  });

  it('el límite superior es EXCLUSIVO: dos ventanas contiguas no solapan', () => {
    expect(withinTimeWindow(manana, 4, 12 * 60)).toBe(false);
    expect(withinTimeWindow(manana, 4, 6 * 60)).toBe(true);
  });

  it('otro día de la semana no cuenta', () => {
    expect(withinTimeWindow(manana, 5, 8 * 60)).toBe(false);
  });

  it('fuera de horario da su propio motivo', () => {
    const d = evaluateAccess(peticion({
      localMinuteOfDay: 22 * 60,
      subject: {
        memberId: 'm1', archived: false,
        membership: membresia({ accessTimeWindows: manana }), visitPack: null,
      },
    }));
    expect(d.reason).toBe('OUTSIDE_TIME_WINDOW');
  });
});

describe('paquetes de visitas', () => {
  const conPaquete = (balance: number, expired = false): AccessSubject => ({
    memberId: 'm1', archived: false, membership: null,
    visitPack: { packId: 'p1', balance, expired },
  });

  it('con saldo entra y CONSUME una visita', () => {
    const d = evaluateAccess(peticion({ subject: conPaquete(5) }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.consumesVisit).toBe(true);
  });

  it('en la última visita se avisa', () => {
    expect(evaluateAccess(peticion({ subject: conPaquete(1) })).warning).toMatch(/última visita/);
  });

  it('sin saldo no entra', () => {
    expect(evaluateAccess(peticion({ subject: conPaquete(0) })).reason).toBe('NO_VISITS_LEFT');
  });

  it('caducado no entra aunque le queden visitas', () => {
    expect(evaluateAccess(peticion({ subject: conPaquete(9, true) })).reason).toBe('VISIT_PACK_EXPIRED');
  });

  it('una membresía vigente NO consume visita del paquete', () => {
    const d = evaluateAccess(peticion({
      subject: {
        memberId: 'm1', archived: false, membership: membresia(),
        visitPack: { packId: 'p1', balance: 5, expired: false, status: 'ACTIVE' },
      },
    }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.consumesVisit).toBe(false);
  });

  it('con la membresía congelada SÍ se recurre al paquete', () => {
    const d = evaluateAccess(peticion({
      subject: {
        memberId: 'm1', archived: false, membership: membresia({ status: 'FROZEN' }),
        visitPack: { packId: 'p1', balance: 3, expired: false, status: 'ACTIVE' },
      },
    }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.consumesVisit).toBe(true);
  });
});

describe('política del gimnasio', () => {
  it('por defecto, la mora NO entra', () => {
    expect(DEFAULT_ACCESS_SETTINGS.allowAccessWhilePastDue).toBe(false);
  });

  it('los rechazos de mostrador son levantables; los de seguridad, no', () => {
    for (const r of ['MEMBERSHIP_PAST_DUE', 'BRANCH_NOT_ALLOWED', 'NO_VISITS_LEFT'] as const) {
      expect(isOverridable(r), r).toBe(true);
    }
    for (const r of ['CREDENTIAL_REVOKED', 'MEMBER_ARCHIVED', 'MEMBER_UNKNOWN', 'DUPLICATE_SCAN'] as const) {
      expect(isOverridable(r), r).toBe(false);
    }
  });
});

describe('handshake de versión entre nube y gateway', () => {
  it('misma versión: todo en orden', () => {
    expect(checkPolicyVersion(ACCESS_POLICY_VERSION)).toEqual({ ok: true });
  });

  it('cambio MAYOR: es un incidente, no un aviso', () => {
    // El caso real: un gateway en 1.x dejaría pasar a los morosos que 2.0
    // rechaza. Sin esta comparación, ocurriría sin que nadie se enterara.
    const r = checkPolicyVersion('1.0.0', '2.0.0');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.severity).toBe('BLOCK');
      expect(r.detail).toMatch(/decidiendo distinto/);
    }
  });

  it('cambio MENOR: compatible, pero hay que actualizar', () => {
    const r = checkPolicyVersion('2.1.0', '2.0.0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.severity).toBe('WARN');
  });

  it('una versión ilegible NO se da por buena', () => {
    expect(checkPolicyVersion('desconocida', '2.0.0').ok).toBe(false);
  });
});

/**
 * Un paquete vendido a cuenta y sin liquidar abría la puerta Y descontaba la
 * visita. El dominio ya tenía la regla bien puesta en `canConsumeVisit`, que
 * exige ACTIVE; aquí había una segunda implementación de la misma regla y era
 * ciega, porque el estado ni siquiera llegaba hasta ella.
 */
describe('paquete de visitas: estado, no solo saldo', () => {
  const conEstado = (status: 'PENDING_PAYMENT' | 'FROZEN' | 'EXHAUSTED' | 'EXPIRED' | 'ACTIVE') =>
    evaluateAccess({
      at: AHORA, localMinuteOfDay: 600, localWeekday: 4, branchId: CASA,
      credential: credencialOk,
      subject: {
        memberId: 'socio-1', archived: false, membership: null,
        visitPack: { packId: 'p1', balance: 8, expired: false, status },
      },
    });

  it('SIN PAGAR no abre la puerta ni consume visita', () => {
    const d = conEstado('PENDING_PAYMENT');
    expect(d.outcome).toBe('DENIED');
    expect(d.reason).toBe('VISIT_PACK_UNPAID');
    expect(d.consumesVisit).toBe(false);
  });

  it('y es LEVANTABLE: el socio está delante y ahí se cobra', () => {
    expect(isOverridable('VISIT_PACK_UNPAID')).toBe(true);
  });

  it('congelado, agotado y caducado tampoco abren', () => {
    expect(conEstado('FROZEN').outcome).toBe('DENIED');
    expect(conEstado('EXHAUSTED').reason).toBe('NO_VISITS_LEFT');
    expect(conEstado('EXPIRED').reason).toBe('VISIT_PACK_EXPIRED');
  });

  it('activo sí abre y consume', () => {
    const d = conEstado('ACTIVE');
    expect(d.outcome).toBe('GRANTED');
    expect(d.consumesVisit).toBe(true);
  });

  it('la versión de política sube de MAYOR: un gateway viejo abriría de más', () => {
    // Es el caso exacto para el que existe el handshake.
    expect(ACCESS_POLICY_VERSION.split('.')[0]).toBe('3');
    expect(checkPolicyVersion('2.0.0', ACCESS_POLICY_VERSION).ok).toBe(false);
  });
});

describe('clase suelta pagada (2026-10-09)', () => {
  it('sin plan, entra a su clase pagada en esa sucursal y no en otra', () => {
    const subject = { memberId: 'm1', archived: false, membership: null, visitPack: null, classPass: { branchId: CASA, className: 'Spinning' } };
    const d = evaluateAccess(peticion({ subject }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.consumesVisit).toBe(false);
    expect(d.warning).toMatch(/Spinning/);
    expect(evaluateAccess(peticion({ subject, branchId: OTRA })).outcome).toBe('DENIED');
    expect(evaluateAccess(peticion({ subject: { ...subject, classPass: null } })).reason).toBe('NO_MEMBERSHIP');
  });
});

describe('pase del día pagado (bloque 1.8, 4-01)', () => {
  const subject = { memberId: 'm1', archived: false, membership: null, visitPack: null, dayPass: { branchId: CASA } };

  it('sin plan, entra con su pase de hoy en la sede del pase y no en otra', () => {
    const d = evaluateAccess(peticion({ subject }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.consumesVisit).toBe(false);
    expect(d.warning).toBe(AVISO_PASE_DEL_DIA);
    expect(evaluateAccess(peticion({ subject, branchId: OTRA })).reason).toBe('NO_MEMBERSHIP');
    expect(evaluateAccess(peticion({ subject: { ...subject, dayPass: null } })).reason).toBe('NO_MEMBERSHIP');
  });

  it('no gasta una visita del paquete: el pase va antes', () => {
    const conPaquete = { ...subject, visitPack: { packId: 'p1', balance: 3, expired: false, status: 'ACTIVE' as const } };
    const d = evaluateAccess(peticion({ subject: conPaquete }));
    expect(d.outcome).toBe('GRANTED');
    expect(d.consumesVisit).toBe(false);
  });

  it('no salta al socio dado de baja ni a la credencial revocada, y la membresía que habilita manda', () => {
    expect(evaluateAccess(peticion({ subject: { ...subject, archived: true } })).reason).toBe('MEMBER_ARCHIVED');
    const mora = {
      ...subject,
      membership: { status: 'PAST_DUE' as const, homeBranchId: CASA, branchAccessScope: 'ALL_BRANCHES' as const, allowedBranchIds: [], accessTimeWindows: null },
    };
    // Una membresía viva decide ella (aquí, la mora cierra): el pase es para quien viene sin plan.
    expect(evaluateAccess(peticion({ subject: mora })).reason).toBe('MEMBERSHIP_PAST_DUE');
    // Con una membresía terminada, el pase sí abre.
    const terminada = { ...mora, membership: { ...mora.membership, status: 'EXPIRED' as const } };
    expect(evaluateAccess(peticion({ subject: terminada })).outcome).toBe('GRANTED');
  });
});
