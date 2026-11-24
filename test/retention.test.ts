import { describe, it, expect } from 'vitest';
import {
  classifyEngagement, expectedGapDays, rankOutreach, outreachPriority,
  exceptionOptions, RETENTION_THRESHOLDS, contactStatus, PLAZOS_DEL_SOCIO,
  type EngagementInput, type OutreachCandidate,
} from '../src/index.js';

const AHORA = new Date('2026-09-24T12:00:00.000Z');
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

const socio = (over: Partial<EngagementInput> = {}): EngagementInput => ({
  joinedAt: haceDias(365),
  lastVisitAt: haceDias(1),
  totalVisits: 150,
  baselineVisitsPerWeek: 3,
  now: AHORA,
  ...over,
});

describe('intervalo esperado según el hábito propio', () => {
  it('quien viene 4 veces por semana se espera cada 1.75 días', () => {
    expect(expectedGapDays(4)).toBeCloseTo(1.75);
  });

  it('quien viene 1 vez por semana, cada 7', () => {
    expect(expectedGapDays(1)).toBe(7);
  });

  it('sin hábito medible se usa el valor por defecto, no se inventa', () => {
    expect(expectedGapDays(null)).toBe(RETENTION_THRESHOLDS.fallbackExpectedGapDays);
    expect(expectedGapDays(0)).toBe(RETENTION_THRESHOLDS.fallbackExpectedGapDays);
  });
});

describe('el umbral es RELATIVO al hábito de cada socio', () => {
  /**
   * Es la decisión central del módulo. Un umbral fijo de catorce días llega
   * tarde para el primero y produce ruido para el segundo — y una alerta con
   * ruido se ignora, que es peor que no tenerla.
   */
  it('diez días sin venir ES alarma para quien viene 4 veces por semana', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 4, lastVisitAt: haceDias(10) }));
    expect(v.state).toBe('DORMANT');
    expect(v.needsOutreach).toBe(true);
  });

  it('…y NO lo es para quien viene 1 vez por semana', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 1, lastVisitAt: haceDias(10) }));
    expect(v.state).toBe('REGULAR');
    expect(v.needsOutreach).toBe(false);
  });

  it('cuenta VISITAS falladas, no días', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 2, lastVisitAt: haceDias(7) }));
    expect(v.missedVisits).toBe(2);   // 7 / 3.5
  });
});

describe('estados', () => {
  it('NEW: recién inscrito, todavía no hay hábito que medir', () => {
    const v = classifyEngagement(socio({
      joinedAt: haceDias(5), lastVisitAt: null, totalVisits: 0, baselineVisitsPerWeek: null,
    }));
    expect(v.state).toBe('NEW');
    expect(v.needsOutreach).toBe(false);
  });

  /**
   * La ventana de rescate más valiosa: no cogió el hábito y TODAVÍA paga.
   */
  it('ONBOARDING_AT_RISK: pasó el margen y casi no ha venido', () => {
    const v = classifyEngagement(socio({
      joinedAt: haceDias(30), lastVisitAt: haceDias(20), totalVisits: 2, baselineVisitsPerWeek: null,
    }));
    expect(v.state).toBe('ONBOARDING_AT_RISK');
    expect(v.needsOutreach).toBe(true);
    expect(v.detail).toMatch(/hábito/);
  });

  it('un socio nuevo que SÍ vino lo suficiente no es alarma', () => {
    const v = classifyEngagement(socio({
      joinedAt: haceDias(30), lastVisitAt: haceDias(1), totalVisits: 12, baselineVisitsPerWeek: 3,
    }));
    expect(v.state).toBe('REGULAR');
  });

  it('SLIPPING: se está saliendo de su rutina', () => {
    // Siete días para quien viene tres veces por semana: tres visitas falladas y ya pasó el puente (15-04).
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 3, lastVisitAt: haceDias(7) }));
    expect(v.state).toBe('SLIPPING');
    expect(v.needsOutreach).toBe(true);
  });

  it('DORMANT: lleva mucho fuera de su rutina', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 3, lastVisitAt: haceDias(14) }));
    expect(v.state).toBe('DORMANT');
  });

  it('LOST gana sobre todo: dos meses sin venir es perdido, venga como viniera', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 5, lastVisitAt: haceDias(70) }));
    expect(v.state).toBe('LOST');
    // Ya no se contacta: eso es reactivación, otra campaña.
    expect(v.needsOutreach).toBe(false);
  });

  it('quien se inscribió y NUNCA vino acaba en LOST', () => {
    const v = classifyEngagement(socio({
      joinedAt: haceDias(90), lastVisitAt: null, totalVisits: 0, baselineVisitsPerWeek: null,
    }));
    expect(v.state).toBe('LOST');
    expect(v.detail).toMatch(/NUNCA/);
  });

  it('REGULAR: dentro de su rutina', () => {
    expect(classifyEngagement(socio()).state).toBe('REGULAR');
  });

  it('el estado es estable: la misma entrada da el mismo veredicto', () => {
    const s = socio({ lastVisitAt: haceDias(5) });
    expect(classifyEngagement(s)).toEqual(classifyEngagement(s));
  });
});

describe('prioridad de contacto', () => {
  const c = (over: Partial<OutreachCandidate> = {}): OutreachCandidate => ({
    memberId: 'm1', state: 'SLIPPING', missedVisits: 2,
    tenureDays: 365, monthlyValueCents: 65_000n, ...over,
  });

  it('quien no necesita contacto NO entra en la lista', () => {
    const r = rankOutreach([c({ state: 'REGULAR' }), c({ memberId: 'm2', state: 'LOST' })]);
    expect(r).toEqual([]);
  });

  /**
   * Recepción no puede llamar a doscientas personas: la lista viene ordenada
   * por dónde está el retorno.
   */
  it('el onboarding fallido va PRIMERO: es la ventana más corta y recuperable', () => {
    const r = rankOutreach([
      c({ memberId: 'dormido', state: 'DORMANT' }),
      c({ memberId: 'nuevo', state: 'ONBOARDING_AT_RISK' }),
      c({ memberId: 'saliendo', state: 'SLIPPING' }),
    ]);
    expect(r.map((x) => x.memberId)).toEqual(['nuevo', 'saliendo', 'dormido']);
  });

  it('a igual estado, pesa más el socio ANTIGUO', () => {
    const r = rankOutreach([
      c({ memberId: 'nuevo', tenureDays: 60 }),
      c({ memberId: 'veterano', tenureDays: 1200 }),
    ]);
    expect(r[0]!.memberId).toBe('veterano');
  });

  it('a igual estado y antigüedad, pesa más la cuota', () => {
    const r = rankOutreach([
      c({ memberId: 'barato', monthlyValueCents: 30_000n }),
      c({ memberId: 'caro', monthlyValueCents: 200_000n }),
    ]);
    expect(r[0]!.memberId).toBe('caro');
  });

  it('el orden es DETERMINISTA ante empate', () => {
    const r = rankOutreach([c({ memberId: 'z' }), c({ memberId: 'a' })]);
    expect(r.map((x) => x.memberId)).toEqual(['a', 'z']);
  });

  it('los estados que no necesitan contacto puntúan cero', () => {
    expect(outreachPriority(c({ state: 'REGULAR' }))).toBe(0);
    expect(outreachPriority(c({ state: 'LOST' }))).toBe(0);
  });
});

describe('pantalla de excepción: las tres acciones', () => {
  it('ante una DEUDA, el botón principal es COBRAR', () => {
    const o = exceptionOptions({
      reason: 'MEMBERSHIP_PAST_DUE', overridable: true, outstandingCents: 65_000n,
    });
    expect(o.find((x) => x.primary)!.action).toBe('COLLECT_AND_OPEN');
    expect(o).toHaveLength(3);
  });

  it('ante otro rechazo levantable, el principal es DEJAR PASAR', () => {
    const o = exceptionOptions({
      reason: 'BRANCH_NOT_ALLOWED', overridable: true, outstandingCents: null,
    });
    expect(o.find((x) => x.primary)!.action).toBe('GRANT_ONCE');
    expect(o.some((x) => x.action === 'COLLECT_AND_OPEN')).toBe(false);
  });

  it('dejar pasar SIEMPRE exige motivo: es lo que lo convierte en dato', () => {
    const o = exceptionOptions({
      reason: 'MEMBERSHIP_PAST_DUE', overridable: true, outstandingCents: 65_000n,
    });
    expect(o.find((x) => x.action === 'GRANT_ONCE')!.requiresReason).toBe(true);
  });

  it('un rechazo NO levantable ofrece una sola salida', () => {
    const o = exceptionOptions({
      reason: 'CREDENTIAL_REVOKED', overridable: false, outstandingCents: null,
    });
    expect(o).toEqual([
      { action: 'REFUSE', label: 'No dejar pasar', requiresReason: false, primary: true },
    ]);
  });

  it('en mora SIN saldo pendiente no se ofrece cobrar', () => {
    const o = exceptionOptions({
      reason: 'MEMBERSHIP_PAST_DUE', overridable: true, outstandingCents: 0n,
    });
    expect(o.some((x) => x.action === 'COLLECT_AND_OPEN')).toBe(false);
  });

  it('nunca hay más de TRES: la pantalla se usa con una cola detrás', () => {
    for (const reason of ['MEMBERSHIP_PAST_DUE', 'BRANCH_NOT_ALLOWED', 'NO_VISITS_LEFT']) {
      expect(exceptionOptions({ reason, overridable: true, outstandingCents: 65_000n }).length)
        .toBeLessThanOrEqual(3);
    }
  });
});

// ── Auditoría 8, bloque 1.15: plazos como parámetros y reglas corregidas ─────

describe('los plazos son parámetros con los valores que decidió Israel (D-18, D15-03, D15-04, D15-07)', () => {
  it('21 días dejó de venir · 60 perdido · 6 días antes de cualquier alerta · una semana tras descongelar · 14 días de contacto', () => {
    // Desde el bloque 4.4 los dos plazos de D-18 tienen UNA definición, fuera de aquí.
    expect(PLAZOS_DEL_SOCIO.dormantDays).toBe(21);
    expect(PLAZOS_DEL_SOCIO.lostDays).toBe(60);
    expect(RETENTION_THRESHOLDS).not.toHaveProperty('dormantMinDays');
    expect(RETENTION_THRESHOLDS).not.toHaveProperty('lostDays');
    expect(RETENTION_THRESHOLDS.slippingMinDays).toBe(6);
    expect(RETENTION_THRESHOLDS.unfrozenGraceDays).toBe(7);
    expect(RETENTION_THRESHOLDS.contactValidDays).toBe(14);
    // La ventana de la línea base: seis semanas que terminan dos semanas antes de hoy.
    expect(RETENTION_THRESHOLDS.baselineWeeks).toBe(6);
    expect(RETENTION_THRESHOLDS.baselineLagDays).toBe(14);
  });
});

describe('15-03: a los 21 días dejó de venir, venga como viniera', () => {
  it('quien venía cada 11 días y lleva 45 sin venir ya no «afloja»: dejó de venir', () => {
    // 7 / (7/11) ≈ cada 11 días → 45 días son 4 visitas falladas: antes quedaba en SLIPPING hasta los 55.
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 7 / 11, lastVisitAt: haceDias(45) }));
    expect(v.state).toBe('DORMANT');
    expect(v.detail).toMatch(/45 días sin venir/);
  });

  it('a los 21 días exactos ya es «dejó de venir»; a los 20, todavía afloja', () => {
    expect(classifyEngagement(socio({ baselineVisitsPerWeek: 1, lastVisitAt: haceDias(21) })).state).toBe('DORMANT');
    expect(classifyEngagement(socio({ baselineVisitsPerWeek: 1, lastVisitAt: haceDias(20) })).state).toBe('SLIPPING');
  });
});

describe('15-04: un puente no es aflojar', () => {
  it('quien viene a diario y faltó 4 días (puente con fin de semana) NO sale en la lista', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 5, lastVisitAt: haceDias(4) }));
    expect(v.state).toBe('REGULAR');
    expect(v.needsOutreach).toBe(false);
  });

  it('…ni a los 5 días; al sexto ya cuenta su hábito (5 por semana → dejó de venir por visitas falladas)', () => {
    expect(classifyEngagement(socio({ baselineVisitsPerWeek: 5, lastVisitAt: haceDias(5) })).state).toBe('REGULAR');
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 5, lastVisitAt: haceDias(6) }));
    expect(v.state).toBe('SLIPPING');
    expect(v.missedVisits).toBe(4);
  });
});

describe('15-17: sin cuatro visitas en la ventana no hay hábito que medir', () => {
  it('una visita en seis semanas NO «mide» un hábito de cada 42 días: se usa el intervalo por defecto', () => {
    // 1 visita / 6 semanas = 0.1667 por semana → antes salía «cada 42 días» y ese socio nunca aflojaba.
    expect(expectedGapDays(1 / 6)).toBe(RETENTION_THRESHOLDS.fallbackExpectedGapDays);
    expect(expectedGapDays(3 / 6)).toBe(RETENTION_THRESHOLDS.fallbackExpectedGapDays);
  });

  it('con cuatro visitas en la ventana sí hay hábito: cada diez días y medio', () => {
    expect(expectedGapDays(4 / 6)).toBeCloseTo(10.5);
  });

  it('con una sola visita hace 15 días, el socio de hábito flojo SÍ afloja', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 1 / 6, lastVisitAt: haceDias(15) }));
    expect(v.state).toBe('SLIPPING');
    expect(v.expectedGapDays).toBe(7);
  });
});

describe('D15-07: congelado no es «dejó de venir»', () => {
  it('recién descongelado tiene una semana para retomar, aunque su última visita sea de hace 40 días', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 3, lastVisitAt: haceDias(40), resumedAt: haceDias(2) }));
    expect(v.state).toBe('REGULAR');
    expect(v.needsOutreach).toBe(false);
    expect(v.detail).toMatch(/Descongeló hace 2 días/);
    // Los días REALES sin venir se siguen diciendo tal cual.
    expect(v.daysSinceLastVisit).toBe(40);
  });

  it('a la semana de descongelar sin venir, los días se cuentan desde que se reanudó', () => {
    const v = classifyEngagement(socio({ baselineVisitsPerWeek: 3, lastVisitAt: haceDias(40), resumedAt: haceDias(8) }));
    expect(v.state).toBe('SLIPPING');
    expect(v.detail).toMatch(/Descongeló hace 8 días y no ha vuelto/);
    expect(v.missedVisits).toBe(3);   // 8 / 2.33, no 40 / 2.33
  });

  it('…y a las tres semanas de descongelar ya dejó de venir', () => {
    expect(classifyEngagement(socio({ baselineVisitsPerWeek: 3, lastVisitAt: haceDias(90), resumedAt: haceDias(21) })).state).toBe('DORMANT');
  });

  it('una pausa ANTERIOR a la última visita no cambia nada', () => {
    const con = classifyEngagement(socio({ baselineVisitsPerWeek: 3, lastVisitAt: haceDias(14), resumedAt: haceDias(30) }));
    const sin = classifyEngagement(socio({ baselineVisitsPerWeek: 3, lastVisitAt: haceDias(14) }));
    expect(con).toEqual(sin);
  });

  it('quien nunca vino y descongeló hoy no es «no arrancó» todavía', () => {
    const v = classifyEngagement(socio({ joinedAt: haceDias(30), lastVisitAt: null, totalVisits: 0, baselineVisitsPerWeek: null, resumedAt: haceDias(0) }));
    expect(v.state).toBe('REGULAR');
    expect(v.detail).toMatch(/Descongeló hoy/);
  });
});

describe('contactStatus: qué hace la lista con el último contacto', () => {
  const HOY = '2026-09-24';
  it('sin contacto, se le llama', () => {
    expect(contactStatus(null, HOY, AHORA)).toBe('POR_LLAMAR');
    expect(contactStatus(undefined, HOY, AHORA)).toBe('POR_LLAMAR');
  });

  it('con un contacto reciente y sin próximo paso pendiente, ya está contactado', () => {
    expect(contactStatus({ createdAt: haceDias(2), nextStepOn: null }, HOY, AHORA)).toBe('CONTACTADO');
    expect(contactStatus({ createdAt: haceDias(2).toISOString(), nextStepOn: '2026-09-30' }, HOY, AHORA)).toBe('CONTACTADO');
  });

  it('si el próximo paso es hoy o ya pasó, vuelve a la lista', () => {
    expect(contactStatus({ createdAt: haceDias(2), nextStepOn: HOY }, HOY, AHORA)).toBe('POR_LLAMAR');
    expect(contactStatus({ createdAt: haceDias(2), nextStepOn: '2026-09-20' }, HOY, AHORA)).toBe('POR_LLAMAR');
  });

  it('un contacto de hace más de 14 días ya no cuenta', () => {
    expect(contactStatus({ createdAt: haceDias(13), nextStepOn: null }, HOY, AHORA)).toBe('CONTACTADO');
    expect(contactStatus({ createdAt: haceDias(14), nextStepOn: null }, HOY, AHORA)).toBe('POR_LLAMAR');
  });
});
