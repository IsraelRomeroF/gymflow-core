import { describe, it, expect } from 'vitest';
import {
  expandWeekly, occurrenceKeyOf, isValidSlot,
  evaluateBooking, evaluateCancellation, evaluateNoShowPenalty,
  closeBookingStatus, canSetCapacity, DEFAULT_BOOKING_SETTINGS,
  resolveWallTime,
  type BookingSubject, type BookingOccasion, type RecurrenceTemplate,
} from '../src/index.js';

const CDMX = 'America/Mexico_City';
const TIJUANA = 'America/Tijuana';
const SEDE = 'sucursal-casa';
const OTRA = 'sucursal-otra';
const AHORA = new Date('2026-09-24T18:00:00.000Z'); // jueves

function plantilla(over: Partial<RecurrenceTemplate> = {}): RecurrenceTemplate {
  return {
    id: 'tpl-1',
    slots: [{ weekday: 1, startMinute: 7 * 60, durationMin: 60, capacity: 20 }],
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    ...over,
  };
}

function socio(over: Partial<BookingSubject> = {}): BookingSubject {
  return {
    memberId: 'socio-1',
    archived: false,
    membership: {
      status: 'ACTIVE',
      homeBranchId: SEDE,
      allowedBranchIds: [],
      allBranches: false,
      coveredUntil: new Date('2026-12-31T00:00:00.000Z'),
      includesClasses: true,
    },
    blockedUntil: null,
    alreadyBooked: false,
    ...over,
  };
}

function clase(over: Partial<BookingOccasion> = {}): BookingOccasion {
  return {
    branchId: SEDE,
    startsAt: new Date('2026-09-25T13:00:00.000Z'),
    status: 'SCHEDULED',
    capacity: 20,
    bookedCount: 5,
    dropInPriceCents: 15000n,
    ...over,
  };
}

describe('hora de pared y horario de verano', () => {
  it('resuelve una hora normal en la zona del centro', () => {
    const r = resolveWallTime(CDMX, 2026, 9, 25, 7, 0);
    expect(r.resolution).toBe('EXACT');
    expect(r.at.toISOString()).toBe('2026-09-25T13:00:00.000Z');
  });

  it('la sucursal de la frontera SÍ cambia de hora, y el desfase se resuelve por fecha', () => {
    // Tijuana sigue el horario de verano de EE. UU.; el resto de México lo
    // abolió en 2022. La misma clase de las 07:00 cae en dos instantes UTC
    // distintos según el mes, y ESO es lo que rompe guardar un desfase fijo.
    const verano = resolveWallTime(TIJUANA, 2026, 7, 6, 7, 0);
    const invierno = resolveWallTime(TIJUANA, 2026, 12, 7, 7, 0);
    expect(verano.at.toISOString()).toBe('2026-07-06T14:00:00.000Z');
    expect(invierno.at.toISOString()).toBe('2026-12-07T15:00:00.000Z');
  });

  it('en el centro NO hay cambio de hora: julio y diciembre caen igual', () => {
    const julio = resolveWallTime(CDMX, 2026, 7, 6, 7, 0);
    const diciembre = resolveWallTime(CDMX, 2026, 12, 7, 7, 0);
    expect(julio.at.toISOString()).toBe('2026-07-06T13:00:00.000Z');
    expect(diciembre.at.toISOString()).toBe('2026-12-07T13:00:00.000Z');
  });

  it('marca la hora que no existe en el salto de primavera', () => {
    // 2026-03-08, Tijuana salta de 02:00 a 03:00. Las 02:30 no existen.
    const r = resolveWallTime(TIJUANA, 2026, 3, 8, 2, 30);
    expect(r.resolution).toBe('SHIFTED');
  });

  it('marca la hora ambigua de la vuelta de otoño', () => {
    // 2026-11-01, Tijuana repite la hora 01:00-02:00.
    const r = resolveWallTime(TIJUANA, 2026, 11, 1, 1, 30);
    expect(r.resolution).toBe('AMBIGUOUS');
  });
});

describe('expansión de horarios recurrentes', () => {
  it('genera una ocurrencia por cada lunes del horizonte', () => {
    const occ = expandWeekly(
      plantilla(), CDMX,
      new Date('2026-09-21T00:00:00.000Z'),
      new Date('2026-10-19T00:00:00.000Z'),
    );
    expect(occ).toHaveLength(4);
    expect(occ.every((o) => o.businessDate.getUTCDay() === 1)).toBe(true);
  });

  it('respeta el intervalo semiabierto de vigencia', () => {
    const occ = expandWeekly(
      plantilla({
        effectiveFrom: new Date('2026-09-28T00:00:00.000Z'),
        effectiveTo: new Date('2026-10-12T00:00:00.000Z'),
      }),
      CDMX,
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-11-01T00:00:00.000Z'),
    );
    expect(occ.map((o) => o.businessDate.toISOString().slice(0, 10)))
      .toEqual(['2026-09-28', '2026-10-05']);
  });

  it('la clave es determinista: reexpandir el mismo día no duplica', () => {
    const rango = [new Date('2026-09-21T00:00:00.000Z'), new Date('2026-10-05T00:00:00.000Z')] as const;
    const a = expandWeekly(plantilla(), CDMX, rango[0], rango[1]);
    const b = expandWeekly(plantilla(), CDMX, rango[0], rango[1]);
    expect(a.map((o) => o.occurrenceKey)).toEqual(b.map((o) => o.occurrenceKey));
    expect(new Set(a.map((o) => o.occurrenceKey)).size).toBe(a.length);
  });

  it('la clave no depende de la zona horaria, solo del horario y la fecha', () => {
    expect(occurrenceKeyOf('tpl-1', 1, 420, new Date('2026-09-28T00:00:00.000Z')))
      .toBe('tpl-1:2026-09-28:1:420');
  });

  it('ignora franjas imposibles en vez de generar clases absurdas', () => {
    expect(isValidSlot({ weekday: 7, startMinute: 0, durationMin: 60, capacity: 1 })).toBe(false);
    expect(isValidSlot({ weekday: 1, startMinute: 1440, durationMin: 60, capacity: 1 })).toBe(false);
    expect(isValidSlot({ weekday: 1, startMinute: 0, durationMin: 0, capacity: 1 })).toBe(false);
    expect(isValidSlot({ weekday: 1, startMinute: 0, durationMin: 60, capacity: 0 })).toBe(false);
  });

  it('ordena por instante, no por franja declarada', () => {
    const occ = expandWeekly(
      plantilla({
        slots: [
          { weekday: 3, startMinute: 20 * 60, durationMin: 60, capacity: 10 },
          { weekday: 1, startMinute: 7 * 60, durationMin: 60, capacity: 10 },
        ],
      }),
      CDMX,
      new Date('2026-09-21T00:00:00.000Z'),
      new Date('2026-09-28T00:00:00.000Z'),
    );
    expect(occ.map((o) => o.startsAt.getTime())).toEqual([...occ.map((o) => o.startsAt.getTime())].sort((a, b) => a - b));
  });
});

describe('reserva', () => {
  it('permite reservar en el caso normal', () => {
    const d = evaluateBooking(socio(), clase(), AHORA);
    expect(d.outcome).toBe('ALLOW');
  });

  it('rechaza la clase llena', () => {
    const d = evaluateBooking(socio(), clase({ bookedCount: 20 }), AHORA);
    expect(d).toEqual({ outcome: 'DENY', reason: 'CLASS_FULL' });
  });

  it('rechaza reservar dos veces la misma clase', () => {
    const d = evaluateBooking(socio({ alreadyBooked: true }), clase(), AHORA);
    expect(d).toEqual({ outcome: 'DENY', reason: 'ALREADY_BOOKED' });
  });

  it('rechaza una clase que ya empezó', () => {
    const d = evaluateBooking(socio(), clase({ startsAt: new Date(AHORA.getTime() - 1) }), AHORA);
    expect(d).toEqual({ outcome: 'DENY', reason: 'CLASS_ALREADY_STARTED' });
  });

  it('rechaza reservar más allá de la ventana de antelación', () => {
    const lejos = new Date(AHORA.getTime() + 30 * 86_400_000);
    const d = evaluateBooking(socio(), clase({ startsAt: lejos }), AHORA);
    expect(d).toEqual({ outcome: 'DENY', reason: 'BOOKING_WINDOW_NOT_OPEN' });
  });

  it('rechaza la sucursal que la membresía no cubre', () => {
    const d = evaluateBooking(socio(), clase({ branchId: OTRA }), AHORA);
    expect(d).toEqual({ outcome: 'DENY', reason: 'BRANCH_NOT_ALLOWED' });
  });

  it('acepta otra sucursal si la membresía es de acceso total', () => {
    const s = socio({ membership: { ...socio().membership!, allBranches: true } });
    expect(evaluateBooking(s, clase({ branchId: OTRA }), AHORA).outcome).toBe('ALLOW');
  });

  it('rechaza al socio archivado', () => {
    expect(evaluateBooking(socio({ archived: true }), clase(), AHORA))
      .toEqual({ outcome: 'DENY', reason: 'MEMBER_ARCHIVED' });
  });

  it('rechaza la membresía congelada', () => {
    const s = socio({ membership: { ...socio().membership!, status: 'FROZEN' } });
    expect(evaluateBooking(s, clase(), AHORA)).toEqual({ outcome: 'DENY', reason: 'MEMBERSHIP_FROZEN' });
  });

  it('NO deja reservar una clase posterior al fin del periodo cubierto', () => {
    // Es la trampa silenciosa: la membresía está viva HOY, así que una
    // comprobación ingenua deja reservar; el día de la clase el socio ya no
    // tiene derecho y la plaza se perdió sin que nadie se entere.
    const s = socio({
      membership: { ...socio().membership!, coveredUntil: new Date('2026-09-25T00:00:00.000Z') },
    });
    expect(evaluateBooking(s, clase({ dropInPriceCents: 0n }), AHORA))
      .toEqual({ outcome: 'DENY', reason: 'MEMBERSHIP_NOT_VALID_AT_CLASS_TIME' });
    // Con precio de clase suelta, la toma pagando esa sola clase (2026-10-09).
    expect(evaluateBooking(s, clase(), AHORA))
      .toMatchObject({ outcome: 'ALLOW', requiresPayment: true, priceCents: 15000n, warnings: ['REQUIRES_PAYMENT', 'DROP_IN_ONLY'] });
  });

  it('sin plan, la clase suelta se toma pagando; sin precio, pide plan (2026-10-09)', () => {
    const sinPlan = socio({ membership: null });
    expect(evaluateBooking(sinPlan, clase(), AHORA)).toMatchObject({ outcome: 'ALLOW', requiresPayment: true, priceCents: 15000n });
    expect(evaluateBooking(sinPlan, clase({ dropInPriceCents: 0n }), AHORA)).toEqual({ outcome: 'DENY', reason: 'NO_MEMBERSHIP' });
    // Congelado no: primero se descongela.
    expect(evaluateBooking(socio({ membership: { ...socio().membership!, status: 'FROZEN' } }), clase(), AHORA)).toEqual({ outcome: 'DENY', reason: 'MEMBERSHIP_FROZEN' });
  });

  it('el socio en mora SÍ puede reservar, pero se le avisa de la puerta', () => {
    const s = socio({ membership: { ...socio().membership!, status: 'PAST_DUE' } });
    const d = evaluateBooking(s, clase(), AHORA);
    expect(d.outcome).toBe('ALLOW');
    if (d.outcome !== 'ALLOW') throw new Error('inalcanzable');
    expect(d.warnings).toContain('WILL_BE_DENIED_AT_DOOR');
  });

  it('rechaza al socio bloqueado por faltas, y lo admite cuando expira', () => {
    const bloqueado = socio({ blockedUntil: new Date(AHORA.getTime() + 86_400_000) });
    expect(evaluateBooking(bloqueado, clase(), AHORA))
      .toEqual({ outcome: 'DENY', reason: 'BLOCKED_BY_NO_SHOWS' });

    const liberado = socio({ blockedUntil: new Date(AHORA.getTime() - 1) });
    expect(evaluateBooking(liberado, clase(), AHORA).outcome).toBe('ALLOW');
  });

  it('cobra clase suelta solo si el plan no incluye clases', () => {
    const conPlan = evaluateBooking(socio(), clase(), AHORA);
    expect(conPlan.outcome === 'ALLOW' && conPlan.requiresPayment).toBe(false);

    const sinClases = socio({ membership: { ...socio().membership!, includesClasses: false } });
    const d = evaluateBooking(sinClases, clase(), AHORA);
    if (d.outcome !== 'ALLOW') throw new Error('debería permitir');
    expect(d.requiresPayment).toBe(true);
    expect(d.priceCents).toBe(15000n);
    expect(d.warnings).toContain('REQUIRES_PAYMENT');
  });

  it('no cobra si la clase suelta vale cero, aunque el plan no incluya clases', () => {
    const sinClases = socio({ membership: { ...socio().membership!, includesClasses: false } });
    const d = evaluateBooking(sinClases, clase({ dropInPriceCents: 0n }), AHORA);
    expect(d.outcome === 'ALLOW' && d.requiresPayment).toBe(false);
  });

  it('avisa de los últimos lugares', () => {
    const d = evaluateBooking(socio(), clase({ bookedCount: 18 }), AHORA);
    expect(d.outcome === 'ALLOW' && d.warnings.includes('LAST_SPOTS')).toBe(true);
  });

  it('la clase cancelada gana a cualquier otro motivo', () => {
    const d = evaluateBooking(socio({ archived: true }), clase({ status: 'CANCELED', bookedCount: 99 }), AHORA);
    expect(d).toEqual({ outcome: 'DENY', reason: 'CLASS_CANCELED' });
  });
});

describe('cancelación', () => {
  const dentro = new Date('2026-09-25T09:00:00.000Z'); // 4 h antes
  const fuera = new Date('2026-09-25T12:00:00.000Z'); // 1 h antes

  it('en plazo: libera plaza, anula el cargo y no cuenta como falta', () => {
    const d = evaluateCancellation({ status: 'BOOKED', hasCharge: true }, clase(), dentro);
    expect(d).toEqual({ outcome: 'ALLOW', late: false, voidsCharge: true, countsAsNoShow: false });
  });

  it('fuera de plazo: libera plaza igual, pero cuenta como falta y NO anula el cargo', () => {
    const d = evaluateCancellation({ status: 'BOOKED', hasCharge: true }, clase(), fuera);
    expect(d).toEqual({ outcome: 'ALLOW', late: true, voidsCharge: false, countsAsNoShow: true });
  });

  it('no se puede cancelar una reserva que ya no está reservada', () => {
    expect(evaluateCancellation({ status: 'CANCELED', hasCharge: false }, clase(), dentro))
      .toEqual({ outcome: 'DENY', reason: 'NOT_BOOKED' });
  });

  it('no se puede cancelar una clase que ya empezó', () => {
    const d = evaluateCancellation({ status: 'BOOKED', hasCharge: false }, clase(), new Date('2026-09-25T13:00:00.000Z'));
    expect(d).toEqual({ outcome: 'DENY', reason: 'CLASS_ALREADY_STARTED' });
  });
});

describe('sanción por faltas (ADR-025)', () => {
  const hoy = new Date('2026-09-24T00:00:00.000Z');

  it('no sanciona la primera falta', () => {
    expect(evaluateNoShowPenalty(1, hoy).kind).toBe('NONE');
  });

  it('avisa en la anterior al umbral', () => {
    expect(evaluateNoShowPenalty(2, hoy)).toEqual({ kind: 'WARNING', count: 2 });
  });

  it('bloquea reservas al alcanzar el umbral', () => {
    const p = evaluateNoShowPenalty(3, hoy);
    expect(p.kind).toBe('BOOKING_BLOCK');
    if (p.kind !== 'BOOKING_BLOCK') throw new Error('inalcanzable');
    expect(p.days).toBe(DEFAULT_BOOKING_SETTINGS.blockDays);
    expect(p.untilDate.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('NUNCA convierte la falta en dinero, por muchas que sean', () => {
    // ADR-025: cobrar la penalización a la tarjeta tokenizada no está cubierto
    // por el mandato de domiciliación, y el contracargo casi siempre se pierde.
    for (const n of [3, 10, 50]) {
      const p = evaluateNoShowPenalty(n, hoy);
      expect(Object.keys(p)).not.toContain('amountCents');
      expect(p.kind).toBe('BOOKING_BLOCK');
    }
  });
});

describe('cierre de la clase', () => {
  it('quien pasó check-in queda como asistente', () => {
    expect(closeBookingStatus({ status: 'BOOKED', checkedIn: true })).toBe('ATTENDED');
  });

  it('quien reservó y no apareció queda como falta', () => {
    expect(closeBookingStatus({ status: 'BOOKED', checkedIn: false })).toBe('NO_SHOW');
  });

  it('no reabre una reserva ya cancelada', () => {
    expect(closeBookingStatus({ status: 'CANCELED', checkedIn: false })).toBe('CANCELED');
  });
});

describe('cupo', () => {
  it('no deja bajar el cupo por debajo de lo ya reservado', () => {
    expect(canSetCapacity(5, 8)).toBe(false);
    expect(canSetCapacity(8, 8)).toBe(true);
    expect(canSetCapacity(0, 0)).toBe(false);
  });
});
