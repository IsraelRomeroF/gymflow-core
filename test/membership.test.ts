import { describe, it, expect } from 'vitest';
import {
  MEMBERSHIP_TRANSITIONS, LIVE_STATUSES, TERMINAL_STATUSES,
  canTransition, findTransition, allowedTriggers, grantsAccess, isTerminal,
  firstPeriod, nextPeriod, periodLengthDays, isWithinPeriod, applyFreeze,
  evaluateFreeze, prorationBasis, missedPeriods, MAX_MISSED_PERIODS, visitBalance, canConsumeVisit, addDays,
  isoDate, businessDateIn, prorate, fromMajorUnits,
  type MembershipStatus, type Period,
} from '../src/index.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const P = (start: string, end: string): Period => ({ start: d(start), end: d(end) });

describe('máquina de estados', () => {
  it('no hay transiciones duplicadas (from, trigger)', () => {
    const seen = new Set<string>();
    for (const t of MEMBERSHIP_TRANSITIONS) {
      const key = `${t.from}|${t.trigger}`;
      expect(seen.has(key), `duplicada: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('CANCELED y EXPIRED son terminales: no sale ninguna transición', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(allowedTriggers(status)).toEqual([]);
      expect(isTerminal(status)).toBe(true);
    }
  });

  it('todo estado no terminal puede cancelarse', () => {
    const noTerminales: MembershipStatus[] = ['PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'FROZEN', 'SUSPENDED'];
    for (const s of noTerminales) expect(canTransition(s, 'CANCEL'), s).toBe(true);
  });

  it('cancelar SIEMPRE exige motivo', () => {
    for (const t of MEMBERSHIP_TRANSITIONS.filter((x) => x.trigger === 'CANCEL')) {
      expect(t.requiresReason, `${t.from}->CANCEL`).toBe(true);
    }
  });

  it('congelar y cambiar de plan exigen motivo; renovar no', () => {
    expect(findTransition('ACTIVE', 'FREEZE')!.requiresReason).toBe(true);
    expect(findTransition('ACTIVE', 'PLAN_CHANGED')!.requiresReason).toBe(true);
    expect(findTransition('ACTIVE', 'RENEW')!.requiresReason).toBe(false);
  });

  it('el pago reactiva desde mora Y desde suspensión', () => {
    expect(canTransition('PAST_DUE', 'PAYMENT_SETTLED')).toBe(true);
    expect(canTransition('SUSPENDED', 'PAYMENT_SETTLED')).toBe(true);
  });

  it('reanudar u olvidar el adeudo exige motivo y NO da acceso', () => {
    for (const trigger of ['DEBT_RESUMED', 'DEBT_FORGIVEN'] as const) {
      const t = findTransition('SUSPENDED', trigger)!;
      expect(t.to).toBe('SUSPENDED');
      expect(t.requiresReason).toBe(true);
      expect(canTransition('ACTIVE', trigger)).toBe(false);
    }
  });

  it('desde SUSPENDED no se puede congelar: primero hay que pagar', () => {
    expect(canTransition('SUSPENDED', 'FREEZE')).toBe(false);
  });

  it('todos los estados vigentes son alcanzables desde el alta', () => {
    const alcanzables = new Set<MembershipStatus>(['PENDING']);
    let crecio = true;
    while (crecio) {
      crecio = false;
      for (const t of MEMBERSHIP_TRANSITIONS) {
        if (alcanzables.has(t.from) && !alcanzables.has(t.to)) {
          alcanzables.add(t.to);
          crecio = true;
        }
      }
    }
    for (const s of LIVE_STATUSES) expect(alcanzables.has(s), s).toBe(true);
  });
});

describe('derivación del acceso', () => {
  it('PAST_DUE SÍ deja entrar: está dentro de la gracia', () => {
    expect(grantsAccess('PAST_DUE')).toBe(true);
  });
  it('SUSPENDED y FROZEN NO dejan entrar, por razones distintas', () => {
    expect(grantsAccess('SUSPENDED')).toBe(false);
    expect(grantsAccess('FROZEN')).toBe(false);
  });
  it('PENDING no otorga acceso: aún no ha pagado', () => {
    expect(grantsAccess('PENDING')).toBe(false);
  });
  it('los terminales no otorgan acceso', () => {
    expect(grantsAccess('CANCELED')).toBe(false);
    expect(grantsAccess('EXPIRED')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// BATERÍA DE CALENDARIO — criterio de aceptación del Sprint 3.
// Los defectos de calendario se manifiestan meses después y afectan a TODOS
// los socios a la vez: estas pruebas valen más que cualquier test de endpoint.
// ════════════════════════════════════════════════════════════════════════════
describe('BATERÍA DE CALENDARIO', () => {
  const mensual = { unit: 'MONTH', value: 1 } as const;

  it('ancla 31: ene → feb común → MARZO VUELVE AL 31', () => {
    let p = firstPeriod(d('2027-01-31'), mensual, 31);
    expect(isoDate(p.end)).toBe('2027-02-28');
    p = nextPeriod(p, mensual, 31);
    expect(isoDate(p.end)).toBe('2027-03-31'); // no 28: el ancla no se degrada
    p = nextPeriod(p, mensual, 31);
    expect(isoDate(p.end)).toBe('2027-04-30');
    p = nextPeriod(p, mensual, 31);
    expect(isoDate(p.end)).toBe('2027-05-31');
  });

  it('ancla 31 en febrero BISIESTO da 29', () => {
    const p = firstPeriod(d('2028-01-31'), mensual, 31);
    expect(isoDate(p.end)).toBe('2028-02-29');
  });

  it('ancla 29 en año NO bisiesto se recorta y vuelve', () => {
    const p = firstPeriod(d('2028-02-29'), mensual, 29); // alta en bisiesto
    expect(isoDate(p.end)).toBe('2028-03-29');
    // Un año después, febrero no tiene 29.
    let cursor = p;
    for (let i = 0; i < 11; i++) cursor = nextPeriod(cursor, mensual, 29);
    expect(isoDate(cursor.end)).toBe('2029-02-28');
    cursor = nextPeriod(cursor, mensual, 29);
    expect(isoDate(cursor.end)).toBe('2029-03-29'); // recupera el 29
  });

  it('ancla 15 nunca se mueve en 24 ciclos', () => {
    let p = firstPeriod(d('2027-01-15'), mensual, 15);
    for (let i = 0; i < 24; i++) {
      expect(isoDate(p.end).slice(-2)).toBe('15');
      p = nextPeriod(p, mensual, 15);
    }
  });

  it('los periodos son CONTIGUOS y sin huecos ni solapes', () => {
    let p = firstPeriod(d('2027-01-31'), mensual, 31);
    for (let i = 0; i < 18; i++) {
      const siguiente = nextPeriod(p, mensual, 31);
      // Intervalo semiabierto: el fin de uno ES el inicio del siguiente.
      expect(siguiente.start.getTime()).toBe(p.end.getTime());
      expect(isWithinPeriod(p, p.start)).toBe(true);
      expect(isWithinPeriod(p, p.end)).toBe(false); // el fin NO pertenece
      p = siguiente;
    }
  });

  it('un año de ciclos mensuales suma exactamente los días del año', () => {
    let p = firstPeriod(d('2027-01-01'), mensual, 1);
    let total = periodLengthDays(p);
    for (let i = 0; i < 11; i++) {
      p = nextPeriod(p, mensual, 1);
      total += periodLengthDays(p);
    }
    expect(total).toBe(365); // 2027 no es bisiesto
  });

  it('un año bisiesto suma 366', () => {
    let p = firstPeriod(d('2028-01-01'), { unit: 'MONTH', value: 1 }, 1);
    let total = periodLengthDays(p);
    for (let i = 0; i < 11; i++) {
      p = nextPeriod(p, { unit: 'MONTH', value: 1 }, 1);
      total += periodLengthDays(p);
    }
    expect(total).toBe(366);
  });

  it('planes trimestral y anual', () => {
    expect(isoDate(firstPeriod(d('2027-01-31'), { unit: 'MONTH', value: 3 }, 31).end)).toBe('2027-04-30');
    expect(isoDate(firstPeriod(d('2027-02-28'), { unit: 'MONTH', value: 12 }, 28).end)).toBe('2028-02-28');
  });

  it('planes por día y por semana', () => {
    expect(isoDate(firstPeriod(d('2027-01-30'), { unit: 'DAY', value: 3 }).end)).toBe('2027-02-02');
    expect(isoDate(firstPeriod(d('2027-01-30'), { unit: 'WEEK', value: 2 }).end)).toBe('2027-02-13');
  });

  it('un plan por VISITAS no genera periodos', () => {
    expect(() => firstPeriod(d('2027-01-01'), { unit: 'VISIT', value: 10 })).toThrow();
  });

  it('CAMBIO DE PLAN EL DÍA DEL CORTE: no queda ningún día sin cubrir', () => {
    const p = P('2027-01-31', '2027-02-28');
    const enElCorte = prorationBasis(p, d('2027-02-28'));
    expect(enElCorte.usedDays).toBe(28);
    expect(enElCorte.remainingDays).toBe(0); // no se cobra el día de baja
    expect(enElCorte.usedDays + enElCorte.remainingDays).toBe(enElCorte.cycleDays);

    const elDiaDelAlta = prorationBasis(p, d('2027-01-31'));
    expect(elDiaDelAlta.usedDays).toBe(0); // sí se cobra el día de alta
    expect(elDiaDelAlta.remainingDays).toBe(28);
  });

  it('el prorrateo usa DÍAS REALES del ciclo, no 30 fijos', () => {
    const febrero = P('2027-02-01', '2027-03-01'); // 28 días
    const marzo = P('2027-03-01', '2027-04-01');   // 31 días
    const precio = fromMajorUnits('650.00');

    const mitadFebrero = prorationBasis(febrero, d('2027-02-15'));
    const mitadMarzo = prorationBasis(marzo, d('2027-03-15'));
    expect(mitadFebrero.cycleDays).toBe(28);
    expect(mitadMarzo.cycleDays).toBe(31);

    // El mismo "día 15" vale distinto según el mes, y eso es lo correcto.
    const cobroFeb = prorate(precio, mitadFebrero.remainingDays, mitadFebrero.cycleDays);
    const cobroMar = prorate(precio, mitadMarzo.remainingDays, mitadMarzo.cycleDays);
    expect(cobroFeb.cents).not.toBe(cobroMar.cents);
  });

  it('PAUSA QUE CRUZA FIN DE MES: extiende el periodo, NO mueve el ancla', () => {
    const p = P('2027-01-31', '2027-02-28');
    // Se congela 10 días del 25 de febrero al 7 de marzo.
    const extendido = applyFreeze(p, 10);
    expect(isoDate(extendido.end)).toBe('2027-03-10');
    expect(isoDate(extendido.start)).toBe('2027-01-31'); // el inicio no se toca

    // El SIGUIENTE periodo vuelve al ancla 31: la pausa no desplaza la fecha
    // de corte para siempre.
    const siguiente = nextPeriod(extendido, { unit: 'MONTH', value: 1 }, 31);
    expect(isoDate(siguiente.start)).toBe('2027-03-10');
    expect(isoDate(siguiente.end)).toBe('2027-04-30');
  });

  it('pausas repetidas no acumulan deriva en el ancla', () => {
    let p = firstPeriod(d('2027-01-31'), { unit: 'MONTH', value: 1 }, 31);
    for (let i = 0; i < 6; i++) {
      p = applyFreeze(p, 7);
      p = nextPeriod(p, { unit: 'MONTH', value: 1 }, 31);
    }
    // Sea cual sea el mes, el día de corte es el 31 o el último del mes.
    const dia = Number(isoDate(p.end).slice(-2));
    const mes = Number(isoDate(p.end).slice(5, 7));
    const ultimoDelMes = new Date(Date.UTC(Number(isoDate(p.end).slice(0, 4)), mes, 0)).getUTCDate();
    expect(dia).toBe(Math.min(31, ultimoDelMes));
  });

  it('SUCURSAL FRONTERIZA: los dos domingos de cambio de horario estacional', () => {
    // México eliminó el horario de verano SALVO la franja fronteriza norte.
    // Segundo domingo de marzo de 2027: 14-mar. Primer domingo de nov: 7-nov.
    const inicioDst = new Date('2027-03-14T09:30:00.000Z'); // 03:30 CDMX / 02:30 Tijuana
    const finDst = new Date('2027-11-07T08:30:00.000Z');

    // CDMX no cambia nunca; Tijuana sí. Las fechas de negocio pueden diferir.
    expect(isoDate(businessDateIn('America/Mexico_City', inicioDst))).toBe('2027-03-14');
    expect(isoDate(businessDateIn('America/Tijuana', inicioDst))).toBe('2027-03-14');
    expect(isoDate(businessDateIn('America/Mexico_City', finDst))).toBe('2027-11-07');
    expect(isoDate(businessDateIn('America/Tijuana', finDst))).toBe('2027-11-07');

    // Justo tras la medianoche de CDMX, Tijuana sigue en el día anterior.
    const cruce = new Date('2027-03-14T06:30:00.000Z');
    expect(isoDate(businessDateIn('America/Mexico_City', cruce))).toBe('2027-03-14');
    expect(isoDate(businessDateIn('America/Tijuana', cruce))).toBe('2027-03-13');
  });

  it('el corte nunca cae en un día inexistente, para cualquier ancla y mes', () => {
    for (let anchor = 1; anchor <= 31; anchor++) {
      let p = firstPeriod(d('2027-01-01'), { unit: 'MONTH', value: 1 }, anchor);
      for (let i = 0; i < 26; i++) {
        const iso = isoDate(p.end);
        expect(new Date(`${iso}T00:00:00.000Z`).getTime(), `ancla ${anchor}: ${iso}`).not.toBeNaN();
        expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        p = nextPeriod(p, { unit: 'MONTH', value: 1 }, anchor);
      }
    }
  });
});

describe('reglas de congelamiento', () => {
  const rules = { allowFreeze: true, minFreezeDays: 7, maxFreezeDaysPerYear: 30 };

  it('rechaza si el plan no lo permite', () => {
    const r = evaluateFreeze({ ...rules, allowFreeze: false }, 10, 0);
    expect(r.ok).toBe(false);
  });
  it('rechaza por debajo del mínimo', () => {
    expect(evaluateFreeze(rules, 3, 0).ok).toBe(false);
  });
  it('rechaza si excede el cupo anual', () => {
    const r = evaluateFreeze(rules, 15, 20);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('10');
  });
  it('acepta dentro del cupo', () => {
    expect(evaluateFreeze(rules, 10, 15).ok).toBe(true);
  });
  it('el cupo se agota exactamente', () => {
    expect(evaluateFreeze(rules, 10, 20).ok).toBe(true);
    expect(evaluateFreeze(rules, 11, 20).ok).toBe(false);
  });
});

describe('paquetes de visitas', () => {
  const compra = { delta: 10, entryType: 'PURCHASE' } as const;
  const consumo = { delta: -1, entryType: 'CONSUME' } as const;

  it('el saldo es la SUMA DEL LIBRO', () => {
    expect(visitBalance([compra, consumo, consumo])).toBe(8);
  });
  it('un ajuste queda reflejado y es auditable', () => {
    expect(visitBalance([compra, consumo, { delta: 2, entryType: 'ADJUST' }])).toBe(11);
  });
  it('permite consumir con saldo y paquete activo', () => {
    expect(canConsumeVisit('ACTIVE', [compra], d('2027-01-01'), d('2027-06-01')).ok).toBe(true);
  });
  it('rechaza sin saldo', () => {
    const r = canConsumeVisit('ACTIVE', [compra, ...Array(10).fill(consumo)], d('2027-01-01'), null);
    expect(r.ok).toBe(false);
  });
  it('rechaza si caducó', () => {
    const r = canConsumeVisit('ACTIVE', [compra], d('2027-07-01'), d('2027-06-01'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('caducó');
  });
  it('rechaza si el paquete no está activo', () => {
    expect(canConsumeVisit('PENDING_PAYMENT', [compra], d('2027-01-01'), null).ok).toBe(false);
    expect(canConsumeVisit('FROZEN', [compra], d('2027-01-01'), null).ok).toBe(false);
  });
  it('el día exacto de caducidad ya NO se puede consumir', () => {
    expect(canConsumeVisit('ACTIVE', [compra], d('2027-06-01'), d('2027-06-01')).ok).toBe(false);
    expect(canConsumeVisit('ACTIVE', [compra], addDays(d('2027-06-01'), -1), d('2027-06-01')).ok).toBe(true);
  });
});

describe('periodos atrasados', () => {
  const MES = { unit: 'MONTH', value: 1 } as const;

  it('periodo en curso: no hay atrasados', () => {
    expect(missedPeriods(P('2026-09-10', '2026-10-10'), MES, 10, d('2026-09-30'))).toEqual([]);
  });

  it('de junio a hoy: julio, agosto y el que contiene hoy, con el ancla', () => {
    const r = missedPeriods(P('2026-06-10', '2026-07-10'), MES, 10, d('2026-09-30'));
    expect(r.map((p) => isoDate(p.start))).toEqual(['2026-07-10', '2026-08-10', '2026-09-10']);
    expect(isoDate(r.at(-1)!.end)).toBe('2026-10-10');
  });

  it('el día que termina el periodo ya cuenta el siguiente', () => {
    expect(missedPeriods(P('2026-08-10', '2026-09-10'), MES, 10, d('2026-09-10'))).toHaveLength(1);
  });

  it(`más de ${MAX_MISSED_PERIODS} periodos no se reconstruyen a ciegas`, () => {
    expect(() => missedPeriods(P('2020-01-01', '2020-01-08'), { unit: 'WEEK', value: 1 }, 1, d('2026-09-30'))).toThrow();
  });
});

describe('precio tras un cambio de precio del plan (D-19, bloque 3.6)', async () => {
  const { precioTrasCambio } = await import('../src/membership.js');
  it('quien paga el de lista queda exacto en el nuevo; quien paga otro conserva su distancia', () => {
    expect(precioTrasCambio({ actualCents: 65000n, fromPriceCents: 65000n, toPriceCents: 70000n })).toBe(70000n);
    expect(precioTrasCambio({ actualCents: 50000n, fromPriceCents: 65000n, toPriceCents: 70000n })).toBe(55000n);
  });
  it('una baja de precio también se aplica y nunca deja un precio negativo', () => {
    expect(precioTrasCambio({ actualCents: 65000n, fromPriceCents: 65000n, toPriceCents: 60000n })).toBe(60000n);
    expect(precioTrasCambio({ actualCents: 3000n, fromPriceCents: 65000n, toPriceCents: 60000n })).toBe(0n);
  });
});
