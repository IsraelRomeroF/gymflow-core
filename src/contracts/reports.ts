import { z } from 'zod';
import { Centavos, Fecha, Id, Instante, RangoDeFechas } from './comun.js';

/**
 * LAS CIFRAS DEL INICIO Y DEL TABLERO (`analytics/analytics.routes.ts`).
 *
 * Antes cada pantalla tenía su copia del tipo (`Dashboard` en Inicio y en
 * Tablero, `Pulso` en el inicio de la dueña, `Turno` en «Mi turno»; 1-18) y
 * nadie avisaba cuando la API cambiaba un campo.
 */

// ── Tablero: GET /dashboard ─────────────────────────────────────────────────

/** Una caja abierta, como la cuenta el Tablero. */
const CajaAbiertaDelTablero = z.object({
  id: Id,
  branchId: Id,
  registerCode: z.string(),
  openedAt: Instante,
  openingFloatCents: Centavos,
});

/** Una sucursal en el Tablero, ordenadas por lo GANADO (devengado), no por lo cobrado (`rankBranches`). */
const SucursalDelTablero = z.object({
  /** `null` = lo que no tiene sucursal. */
  branchId: Id.nullable(),
  collectedCents: Centavos,
  accruedCents: Centavos,
  activeMembers: z.number().int(),
  outstandingCents: Centavos,
});

/**
 * `GET /dashboard?days=N | from=&to=[&compare=mes][&branchId=]`. Las tres
 * cifras que no son lo mismo: lo que entró, lo ganado y lo que queda por
 * prestar, con su explicación (glosario financiero).
 */
export const Dashboard = z.object({
  /** Fin semiabierto: `to` ya no entra. */
  range: RangoDeFechas,
  /** El rango es un mes ya cerrado (cierre de mes): sus cifras quedan fijas. */
  closed: z.object({ closedAt: Instante, closedByUserId: Id, note: z.string().nullable() }).nullable(),
  /** Lo que entró en el rango pero pertenece a meses ya cerrados («ajuste de octubre»). */
  priorAdjustmentsCents: Centavos,
  money: z.object({
    collectedCents: Centavos, collectedLabel: z.string(),
    accruedCents: Centavos, accruedLabel: z.string(),
    deferredCents: Centavos, deferredLabel: z.string(),
    mrrCents: Centavos, mrrLabel: z.string(),
    /** Gastos de caja y FALTANTES de los cortes del periodo (negativo). */
    cashExpensesCents: Centavos,
    /** Sobrantes de los cortes: no suman a la utilidad, se informan «por aclarar» (13-05). */
    cashOverageCents: Centavos,
    /** Gastos fijos (renta, nómina) prorrateados al periodo (negativo). */
    fixedExpensesCents: Centavos,
    /** Utilidad contable: lo ganado menos gastos de caja y fijos. */
    profitCents: Centavos,
  }),
  /** El periodo anterior de la misma duración (o las mismas fechas del mes pasado con `compare=mes`). */
  previous: z.object({ from: Fecha, to: Fecha, collectedCents: Centavos, accruedCents: Centavos, profitCents: Centavos }),
  portfolio: z.object({
    outstandingCents: Centavos,
    overdueCents: Centavos,
    /** Fracción de 0 a 1 (vencido entre lo que se debe). */
    delinquencyRate: z.number(),
    /** En socios: «24 de 248 atrasados» dice más que «vencido 100 %». */
    membersBehind: z.number().int(),
    membersBase: z.number().int(),
  }),
  activeMembers: z.number().int(),
  openCashSessions: z.array(CajaAbiertaDelTablero),
  branches: z.array(SucursalDelTablero),
  notes: z.object({
    /** Paquetes de visitas sin cargo enlazado, valorados a precio de lista. */
    packsValuedByListPrice: z.number().int(),
    /** Solo si hay alguno: por qué la cifra ganada es aproximada. */
    warning: z.string().optional(),
  }),
});
export type Dashboard = z.infer<typeof Dashboard>;

// ── Cierre de mes: finance/monthly-close.routes.ts (bloque 1.9) ─────────────

/** Un mes `AAAA-MM`. */
export const Mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes como AAAA-MM');
export type Mes = z.infer<typeof Mes>;

/** Las cifras que congela el cierre: las del Tablero de ese mes para todo el gimnasio. */
export const TotalesDelCierre = z.object({
  collectedCents: Centavos,
  accruedCents: Centavos,
  deferredCents: Centavos,
  mrrCents: Centavos,
  outstandingCents: Centavos,
  overdueCents: Centavos,
  activeMembers: z.number().int(),
  /** Gastos de caja y faltantes de los cortes (negativo). Las fotos anteriores a 1.9 no lo traen. */
  cashExpensesCents: Centavos.optional(),
  /** Gastos fijos prorrateados al mes (negativo). Las fotos anteriores a 1.9 no lo traen. */
  fixedExpensesCents: Centavos.optional(),
  /** Utilidad contable del mes. Las fotos anteriores a 1.9 no lo traen. */
  profitCents: Centavos.optional(),
});
export type TotalesDelCierre = z.infer<typeof TotalesDelCierre>;

const SucursalDelCierre = z.object({
  branchId: Id.nullable(),
  collectedCents: Centavos,
  accruedCents: Centavos,
  outstandingCents: Centavos,
  activeMembers: z.number().int(),
});

/**
 * Un mes cerrado: la foto que firmó el dueño, con quién cerró y quién firmó
 * (14-04). `approvedByUserId` es `null` cuando cerró el dueño con su propia
 * contraseña (sin gerente, D-23) o en fotos anteriores sin firma asentada.
 */
export const MonthlyClose = z.object({
  id: Id,
  month: Mes,
  totals: TotalesDelCierre,
  byBranch: z.array(SucursalDelCierre),
  closedAt: Instante,
  closedByUserId: Id,
  closedByName: z.string().nullable(),
  approvedByUserId: Id.nullable(),
  approvedByName: z.string().nullable(),
  note: z.string().nullable(),
});
export type MonthlyClose = z.infer<typeof MonthlyClose>;

/**
 * `GET /reports/monthly-closes`: los meses cerrados, del más reciente al más
 * viejo, y los meses ya terminados que siguen sin cerrar (`pending`, del más
 * viejo al más reciente: en diciembre todavía se puede cerrar octubre, 14-04).
 */
export const MonthlyCloseList = z.object({
  closes: z.array(MonthlyClose),
  pending: z.array(Mes),
});
export type MonthlyCloseList = z.infer<typeof MonthlyCloseList>;

/** Lo que impide cerrar o conviene saber antes, con su código estable y su texto para quien lo lee. */
const AvisoDelCierre = z.object({ code: z.string(), message: z.string() });

/**
 * `GET /reports/monthly-close/preview?month=AAAA-MM`: lo que va a pasar al
 * cerrar ese mes, antes de pedir la firma (`VistaPrevia`). Con un bloqueo
 * (`blockers`) no se cierra; los `warnings` se leen y se sigue. Las cifras
 * son las que quedarían congeladas.
 */
export const MonthlyClosePreview = z.object({
  month: Mes,
  closable: z.boolean(),
  blockers: z.array(AvisoDelCierre),
  warnings: z.array(AvisoDelCierre),
  /** Ya está cerrado: la foto que hay. `null` si sigue abierto. */
  closed: MonthlyClose.nullable(),
  totals: TotalesDelCierre,
  byBranch: z.array(SucursalDelCierre),
  /** Hoy en cada sede, según el servidor (A3 T9): el panel no decide con el reloj del navegador. */
  businessDates: z.object({
    organization: Fecha,
    byBranch: z.array(z.object({ branchId: Id, date: Fecha })),
  }),
  /** Cajas de ese mes todavía abiertas: la foto no las incluye. */
  openCashSessions: z.array(z.object({ id: Id, branchId: Id, registerCode: z.string(), openedAt: Instante })),
  /** Gastos fijos registrados en el mes (vigentes). */
  fixedExpensesCount: z.number().int(),
});
export type MonthlyClosePreview = z.infer<typeof MonthlyClosePreview>;

// ── Inicio de la dueña: GET /reports/pulse ──────────────────────────────────

const CajaAbierta = z.object({
  id: Id,
  branchId: Id,
  registerName: z.string(),
  openedByName: z.string().nullable(),
  openedByUserId: Id.nullable(),
  openedAt: Instante,
});

/**
 * `GET /reports/pulse[?branchId=]`: cómo va hoy, cuánto se lleva el mes y qué
 * revisar, en una llamada (UXD-01). Todo el dinero en centavos como texto.
 */
export const Pulse = z.object({
  asOf: Instante,
  /** La zona con la que se contó «hoy». */
  timezone: z.string(),
  today: z.object({
    collectedCents: Centavos,
    yesterdaySameTimeCents: Centavos,
    lastWeekSameTimeCents: Centavos,
    /** Las 24 horas del día, de 0 a 23. */
    byHour: z.array(z.object({ hour: z.number().int(), cents: Centavos, lastWeekCents: Centavos })),
    visits: z.number().int(),
    visitsYesterdaySameTime: z.number().int(),
    newMembers: z.number().int(),
  }),
  month: z.object({
    from: Fecha,
    /** Hoy (incluido). */
    to: Fecha,
    profitCents: Centavos,
    incomeCents: Centavos,
    /** Gastos, FALTANTES de los cortes y fijos: la misma suma que la tarjeta «Gastos» de Movimientos. */
    expensesCents: Centavos,
    /** Sobrantes de caja del mes: no suman, se informan «por aclarar» (14-09). */
    cashOverageCents: Centavos,
    /** Aparte, para avisar cuando falta registrar renta y nómina (UX5-D-05). */
    fixedExpensesCents: Centavos,
    lastMonthSameDayProfitCents: Centavos,
    lastMonthTotalProfitCents: Centavos,
    newMembers: z.number().int(),
    leftMembers: z.number().int(),
  }),
  alerts: z.object({
    /** Cortes con faltante de los últimos 7 días (hasta 10). */
    shortCounts: z.array(z.object({
      id: Id,
      branchId: Id,
      registerName: z.string(),
      closedByName: z.string().nullable(),
      varianceCents: Centavos,
      reason: z.string().nullable(),
      closedAt: Instante,
    })),
    refundsToday: z.object({ count: z.number().int(), cents: Centavos }),
    cashOpenSinceYesterday: z.array(CajaAbierta),
    pendingApprovals: z.object({ count: z.number().int(), oldest: Instante.nullable() }),
    /** Operaciones «para revisar» de hoy (bitácora). */
    sensitiveToday: z.number().int(),
  }),
  owed: z.object({ overdueCents: Centavos, outstandingCents: Centavos, membersBehind: z.number().int() }),
  /** `base` = los vivos más los suspendidos: la misma base que el Tablero para «N de M atrasados». */
  members: z.object({ active: z.number().int(), base: z.number().int() }),
  branches: z.array(z.object({ branchId: Id, todayCents: Centavos, yesterdaySameTimeCents: Centavos, visits: z.number().int() })),
  openCash: z.array(CajaAbierta),
  /** A qué hora abrió cada sede y hasta cuándo hubo movimiento. */
  doors: z.array(z.object({
    branchId: Id,
    firstEntryAt: Instante,
    lastEntryAt: Instante,
    entries: z.number().int(),
    cashOpenedAt: Instante.nullable(),
    cashClosedAt: Instante.nullable(),
  })),
  /** Quién entró hace un momento (las últimas 12). */
  recentEntries: z.array(z.object({ branchId: Id, memberId: Id, memberName: z.string(), memberCode: z.string(), at: Instante })),
  /** Su equipo hoy (ADR-039): quién entró al panel, qué hizo y cuánto cobró. Sin expedientes de socios. */
  staff: z.array(z.object({
    userId: Id,
    fullName: z.string(),
    roleKey: z.string(),
    roleName: z.string(),
    /** `null` = abarca varias sedes o todo el gimnasio. */
    branchId: Id.nullable(),
    lastLoginAt: Instante.nullable(),
    lastActionAt: Instante.nullable(),
    actionsToday: z.number().int(),
    paymentsToday: z.number().int(),
    manualEntriesToday: z.number().int(),
    openCash: z.boolean(),
  })),
});
export type Pulse = z.infer<typeof Pulse>;

// ── Mi turno: GET /me/shift ─────────────────────────────────────────────────

/**
 * `GET /me/shift`: el inicio de quien atiende (UX5-M-02). Sus sedes, su caja,
 * las entradas y las clases de hoy. Sin cifras del negocio. Lo que su puesto
 * no ve llega vacío o en `null`, nunca a medias.
 */
export const Shift = z.object({
  asOf: Instante,
  branches: z.array(z.object({
    id: Id,
    name: z.string(),
    /** `null` = su puesto no ve cuánta gente entró (el coach, 1-05). */
    entriesToday: z.number().int().nullable(),
    lastEntryAt: Instante.nullable(),
    registers: z.array(z.object({ id: Id, name: z.string() })),
    openSessions: z.array(z.object({
      id: Id,
      registerName: z.string(),
      openedByName: z.string().nullable(),
      openedAt: Instante,
      /** La abrió quien mira. */
      mine: z.boolean(),
    })),
  })),
  canSeeCash: z.boolean(),
  /** Cuánta gente entró es del mostrador y la gerencia: el coach no lo recibe (1-05). */
  canSeeEntries: z.boolean(),
  /** `null` = su puesto no revisa altas digitales. */
  pendingIntakes: z.number().int().nullable(),
  classesToday: z.array(z.object({
    id: Id,
    branchId: Id,
    name: z.string(),
    startsAt: Instante,
    capacity: z.number().int(),
    booked: z.number().int(),
  })),
});
export type Shift = z.infer<typeof Shift>;
