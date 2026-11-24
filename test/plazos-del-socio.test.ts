import { describe, it, expect } from 'vitest';
import {
  PLAZOS_DEL_SOCIO, DEFINICION_DE_PLAZOS, PLAZO_KEYS, plazosDelGrupo, resolverPlazos, erroresDePlazos, plazosCambiados,
  sumarDias, sumarMeses, bajaDelSocio, recuperarHasta, enRecuperar, frasesDePlazos, plazoEnPalabras, classifyEngagement,
  PERMISSION_BY_KEY, ROLE_PERMISSIONS, LOCKABLE_SECTIONS, approvalResourceTypesFor, AUDIT_LABELS, auditNeedsReview, ADJUSTABLE_PERMISSIONS,
} from '../src/index.js';
import { MemberTerms, MemberStanding, WinbackList } from '../src/contracts/index.js';

/** Auditoría 8, fase 4, bloque 4.4 · D-18: una sola definición de cada plazo del socio. */
describe('los plazos del socio (D-18)', () => {
  it('los valores de fábrica son los que decidió Israel', () => {
    expect(PLAZOS_DEL_SOCIO).toEqual({ dormantDays: 21, churnDays: 30, lostDays: 60, winbackMonths: 6, unpaidSaleDays: 7, lostDebtDays: 90 });
  });

  it('cada plazo tiene su definición, y el valor de fábrica cabe en sus límites', () => {
    expect([...PLAZO_KEYS].sort()).toEqual(Object.keys(PLAZOS_DEL_SOCIO).sort());
    for (const d of DEFINICION_DE_PLAZOS) {
      expect(PLAZOS_DEL_SOCIO[d.key], d.key).toBeGreaterThanOrEqual(d.min);
      expect(PLAZOS_DEL_SOCIO[d.key], d.key).toBeLessThanOrEqual(d.max);
    }
  });

  it('la gerencia ajusta los de retención; los de la deuda son otro grupo (firma de la dueña)', () => {
    expect(plazosDelGrupo('retention').map((d) => d.key)).toEqual(['dormantDays', 'lostDays', 'churnDays', 'winbackMonths']);
    expect(plazosDelGrupo('debt').map((d) => d.key)).toEqual(['unpaidSaleDays', 'lostDebtDays']);
  });

  it('sin ajuste valen los de fábrica; lo guardado manda solo si es válido', () => {
    expect(resolverPlazos(null)).toEqual(PLAZOS_DEL_SOCIO);
    expect(resolverPlazos({ dormantDays: 28, lostDebtDays: 120, churnDays: null })).toEqual({ ...PLAZOS_DEL_SOCIO, dormantDays: 28, lostDebtDays: 120 });
    // Fuera de límites o no entero: se ignora, no revienta.
    expect(resolverPlazos({ dormantDays: 3, lostDebtDays: 5, winbackMonths: 2.5 })).toEqual(PLAZOS_DEL_SOCIO);
    // «Perdido» no puede quedar antes de «dejó de venir»: mandan los dos de fábrica.
    expect(resolverPlazos({ dormantDays: 50, lostDays: 40 })).toEqual(PLAZOS_DEL_SOCIO);
  });

  it('los errores de un ajuste se dicen en frases, y «perdido» va después de «dejó de venir»', () => {
    expect(erroresDePlazos({ dormantDays: 28 })).toEqual([]);
    expect(erroresDePlazos({ dormantDays: 6 })).toEqual(['«Dejó de venir» va de 7 a 60 días.']);
    expect(erroresDePlazos({ winbackMonths: 25 })).toEqual(['«Recuperar» va de 1 a 24 meses.']);
    expect(erroresDePlazos({ lostDebtDays: 29 })).toEqual(['«Deuda que se da por perdida» va de 30 a 365 días.']);
    expect(erroresDePlazos({ lostDays: 21 })).toEqual(['«Perdido» tiene que ser más días que «Dejó de venir».']);
    expect(erroresDePlazos({ lostDays: 30 }, { ...PLAZOS_DEL_SOCIO, dormantDays: 45 })).toEqual(['«Perdido» tiene que ser más días que «Dejó de venir».']);
    expect(erroresDePlazos({ churnDays: 1.5 })).toEqual(['«Baja» va en días enteros.']);
  });

  it('plazosCambiados dice qué llaves cambian', () => {
    expect(plazosCambiados(PLAZOS_DEL_SOCIO, PLAZOS_DEL_SOCIO)).toEqual([]);
    expect(plazosCambiados(PLAZOS_DEL_SOCIO, { ...PLAZOS_DEL_SOCIO, lostDays: 75, lostDebtDays: 60 })).toEqual(['lostDays', 'lostDebtDays']);
  });

  it('las frases dicen el número del gimnasio, no uno escrito en la pantalla', () => {
    const f = frasesDePlazos({ ...PLAZOS_DEL_SOCIO, dormantDays: 28, winbackMonths: 1, unpaidSaleDays: 1 });
    expect(f.dormantDays).toContain('28 días');
    expect(f.lostDays).toContain('60 días');
    expect(f.churnDays).toContain('30 días');
    expect(f.winbackMonths).toContain('1 mes ');
    expect(f.unpaidSaleDays).toContain('1 día.');
    expect(f.lostDebtDays).toContain('90 días');
    expect(f.lostDebtDays).toContain('se puede cobrar');
    expect(plazoEnPalabras('winbackMonths', 6)).toBe('6 meses');
    expect(plazoEnPalabras('churnDays', 30)).toBe('30 días');
  });
});

describe('fechas de calendario', () => {
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-12-15', 30)).toBe('2027-01-14');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('sumarMeses: el 31 de un mes corto cae en su último día', () => {
    expect(sumarMeses('2026-08-31', 6)).toBe('2027-02-28');
    expect(sumarMeses('2026-05-15', 6)).toBe('2026-11-15');
    expect(sumarMeses('2026-11-30', -9)).toBe('2026-02-28');
  });
});

describe('baja = cancelada, o terminada hace 30 días sin renovar (D-18)', () => {
  const base = { archivedOn: null, hasLiveMembership: false, lastEnded: null, today: '2026-11-24', churnDays: 30 } as const;

  it('quien nunca tuvo una membresía que diera acceso no es baja', () => {
    expect(bajaDelSocio(base)).toBeNull();
  });
  it('el acto «Dar de baja» es baja desde ese día, tenga lo que tenga', () => {
    expect(bajaDelSocio({ ...base, archivedOn: '2026-11-20', hasLiveMembership: true })).toEqual({ cause: 'ARCHIVED', since: '2026-11-20', endedOn: null });
  });
  it('con una membresía sin terminar no es baja, aunque la anterior se haya cancelado', () => {
    expect(bajaDelSocio({ ...base, hasLiveMembership: true, lastEnded: { status: 'CANCELED', endedOn: '2026-10-01' } })).toBeNull();
  });
  it('cancelada: baja desde el día de la cancelación', () => {
    expect(bajaDelSocio({ ...base, lastEnded: { status: 'CANCELED', endedOn: '2026-11-24' } })).toEqual({ cause: 'CANCELED', since: '2026-11-24', endedOn: null });
  });
  it('terminada: el día 29 todavía no; el día 30 sí, y la baja es de ese día', () => {
    expect(bajaDelSocio({ ...base, lastEnded: { status: 'EXPIRED', endedOn: '2026-10-26' } })).toBeNull();
    expect(bajaDelSocio({ ...base, lastEnded: { status: 'EXPIRED', endedOn: '2026-10-25' } })).toEqual({ cause: 'EXPIRED', since: '2026-11-24', endedOn: '2026-10-25' });
    expect(bajaDelSocio({ ...base, lastEnded: { status: 'EXPIRED', endedOn: '2026-08-01' } })).toEqual({ cause: 'EXPIRED', since: '2026-08-31', endedOn: '2026-08-01' });
  });
  it('el plazo de baja es el del gimnasio', () => {
    expect(bajaDelSocio({ ...base, churnDays: 45, lastEnded: { status: 'EXPIRED', endedOn: '2026-10-25' } })).toBeNull();
    expect(bajaDelSocio({ ...base, churnDays: 10, lastEnded: { status: 'EXPIRED', endedOn: '2026-11-13' } })?.since).toBe('2026-11-23');
  });
});

describe('«Recuperar»: se le busca 6 meses', () => {
  it('desde el día en que se perdió o se dio de baja hasta el mismo día seis meses después, inclusive', () => {
    expect(recuperarHasta('2026-05-24', 6)).toBe('2026-11-24');
    expect(enRecuperar('2026-05-24', '2026-11-24', 6)).toBe(true);
    expect(enRecuperar('2026-05-23', '2026-11-24', 6)).toBe(false);
    expect(enRecuperar('2026-11-25', '2026-11-24', 6)).toBe(false);
    expect(enRecuperar('2026-10-24', '2026-11-24', 1)).toBe(true);
    expect(enRecuperar('2026-10-23', '2026-11-24', 1)).toBe(false);
  });
});

describe('la regla de hábito usa los plazos del gimnasio', () => {
  const now = new Date('2026-11-24T12:00:00.000Z');
  const hace = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const socio = (dias: number, plazos?: { dormantDays: number; lostDays: number }) => classifyEngagement({
    joinedAt: hace(400), lastVisitAt: hace(dias), totalVisits: 80, baselineVisitsPerWeek: 0.6, now, ...(plazos ? { plazos } : {}),
  }).state;

  it('de fábrica: 20 días afloja, 21 dejó de venir, 59 sigue en la lista, 60 perdido', () => {
    expect(socio(20)).toBe('SLIPPING');
    expect(socio(21)).toBe('DORMANT');
    expect(socio(59)).toBe('DORMANT');
    expect(socio(60)).toBe('LOST');
  });
  it('con 28 y 75 del gimnasio, los cortes se mueven', () => {
    const p = { dormantDays: 28, lostDays: 75 };
    expect(socio(21, p)).toBe('SLIPPING');
    expect(socio(28, p)).toBe('DORMANT');
    expect(socio(60, p)).toBe('DORMANT');
    expect(socio(75, p)).toBe('LOST');
  });
});

describe('quién ajusta los plazos', () => {
  it('los de retención: la gerencia, con motivo y sin firma; recepción, coach y dueña no', () => {
    expect(PERMISSION_BY_KEY.get('retention:terms:set')).toMatchObject({ requiresReason: true, requiresApproval: false });
    expect(ROLE_PERMISSIONS.MANAGER).toContain('retention:terms:set');
    for (const r of ['RECEPTION', 'COACH', 'OWNER'] as const) expect(ROLE_PERMISSIONS[r], r).not.toContain('retention:terms:set');
  });
  it('los de la deuda: la gerencia, SIEMPRE con la firma de la dueña', () => {
    expect(PERMISSION_BY_KEY.get('billing:debt-terms:set')).toMatchObject({ requiresReason: true, requiresApproval: true });
    expect(ROLE_PERMISSIONS.MANAGER).toContain('billing:debt-terms:set');
    for (const r of ['RECEPTION', 'COACH', 'OWNER'] as const) expect(ROLE_PERMISSIONS[r], r).not.toContain('billing:debt-terms:set');
    expect(approvalResourceTypesFor('billing:debt-terms:set')).toEqual(['MemberTerms']);
  });
  it('ninguno de los dos se le puede encender a una persona de recepción ni a un coach («Qué puede hacer»)', () => {
    expect(ADJUSTABLE_PERMISSIONS.has('retention:terms:set')).toBe(false);
    expect(ADJUSTABLE_PERMISSIONS.has('billing:debt-terms:set')).toBe(false);
  });
  it('cada uno va bajo la llave de su sección: Retención y Tablero', () => {
    const de = (k: string) => LOCKABLE_SECTIONS.find((s) => s.key === k)!.permissions;
    expect(de('retencion')).toContain('retention:terms:set');
    expect(de('tablero')).toContain('billing:debt-terms:set');
  });
  it('los asientos tienen su frase; a «Para revisar» va el resumen de la corrida, no un asiento por socio', () => {
    for (const a of ['settings.retention_terms.update', 'billing.debt_terms.update', 'billing.debt.lost', 'billing.debt.lost.summary']) expect(AUDIT_LABELS[a], a).toBeTruthy();
    const revisar = (action: string) => auditNeedsReview({ action });
    expect(revisar('billing.debt.lost.summary')).toBe(true);
    expect(revisar('billing.debt_terms.update')).toBe(true);
    expect(revisar('settings.retention_terms.update')).toBe(true);
    expect(revisar('billing.debt.lost')).toBe(false);
  });
});

describe('contratos', () => {
  const valores = { ...PLAZOS_DEL_SOCIO };
  it('MemberTerms, WinbackList y MemberStanding aceptan lo que la API manda', () => {
    expect(MemberTerms.safeParse({ terms: valores, defaults: valores, customized: [], updatedAt: null, updatedByName: null }).success).toBe(true);
    expect(WinbackList.safeParse({
      asOf: '2026-11-24', terms: valores, total: 1, counts: { LOST: 0, ARCHIVED: 0, CANCELED: 1, EXPIRED: 0 },
      members: [{ memberId: '018f4b7a-0000-7000-8000-000000000001', memberCode: 'S-1', fullName: 'Persona De Prueba', homeBranchId: null, phoneE164: null,
        cause: 'CANCELED', since: '2026-11-01', until: '2027-05-01', lastVisitOn: null, planName: 'Mensual', reason: 'Se mudó', archived: false }],
    }).success).toBe(true);
    expect(MemberStanding.safeParse({ memberId: '018f4b7a-0000-7000-8000-000000000001', asOf: '2026-11-24', churn: { cause: 'EXPIRED', since: '2026-11-24', endedOn: '2026-10-25' }, churnsOn: null, lostDebtCents: '65000' }).success).toBe(true);
  });
});
