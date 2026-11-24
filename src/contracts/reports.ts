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
  /**
   * `fromSnapshot`: las cifras de dinero, cartera y sucursales salen de la FOTO
   * del cierre (D-22) y ya no cambian. Es `false` solo cuando la foto es
   * anterior a la foto completa (3.7) o no cubre las sedes de quien mira.
   */
  closed: z.object({ closedAt: Instante, closedByUserId: Id, note: z.string().nullable(), fromSnapshot: z.boolean() }).nullable(),
  /**
   * Lo que llegó tarde a un mes ya cerrado y se anotó en este periodo (D-22):
   * «ajuste de octubre». `cents` con el signo del gasto: positivo resta de la
   * ganancia, negativo corrige un gasto de más. Sustituye a
   * `priorAdjustmentsCents`, que sumaba cobros por fecha de recepción.
   */
  adjustments: z.array(z.object({ month: z.string(), cents: Centavos, count: z.number().int() })),
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
    /** Retiros del dueño de los meses del periodo: se informan, NO restan de la utilidad (D-23). */
    ownerDrawsCents: Centavos,
    /** Costo de lo vendido en la tienda en el periodo (negativo): la utilidad ya lo resta (D-21). */
    costOfGoodsCents: Centavos,
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
    /** Piezas vendidas en el periodo de productos sin costo registrado: su costo no se pudo restar (D-21). */
    soldWithoutCost: z.number().int(),
  }),
});
export type Dashboard = z.infer<typeof Dashboard>;

// ── Cierre de mes: finance/monthly-close.routes.ts (bloque 1.9) ─────────────

/** Un mes `AAAA-MM`. */
export const Mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes como AAAA-MM');
export type Mes = z.infer<typeof Mes>;

/**
 * Lo de Movimientos (caja) del mes, dentro de la foto completa (3.7, D-22):
 * las mismas cifras y los mismos signos que `GET /reports/daily`.
 */
export const CajaDelCierre = z.object({
  incomeCents: Centavos, refundsCents: Centavos, expensesCents: Centavos,
  shortageCents: Centavos, overageCents: Centavos, netCents: Centavos, toBankCents: Centavos,
  creditNotesCents: Centavos, fixedExpensesCents: Centavos, profitCents: Centavos,
  byMethod: z.record(z.string(), Centavos),
});
export type CajaDelCierre = z.infer<typeof CajaDelCierre>;

/** Lo que la foto completa (3.7) agrega al total y a cada sucursal. Las fotos anteriores no lo traen. */
const FotoCompleta = {
  /** Sobrantes de los cortes: no suman, se informan «por aclarar». */
  cashOverageCents: Centavos.optional(),
  /** Retiros del dueño del mes: no restan de la utilidad (D-23). */
  ownerDrawsCents: Centavos.optional(),
  /** Costo de lo vendido en la tienda (negativo): la utilidad ya lo resta (D-21). */
  costOfGoodsCents: Centavos.optional(),
  membersBehind: z.number().int().optional(),
  membersBase: z.number().int().optional(),
  /** Movimientos del mes (caja). */
  cash: CajaDelCierre.optional(),
};

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
  /** 2 = foto completa (3.7): con ella el Tablero y Movimientos sirven el mes cerrado desde la foto. */
  version: z.number().int().optional(),
  ...FotoCompleta,
});
export type TotalesDelCierre = z.infer<typeof TotalesDelCierre>;

const SucursalDelCierre = z.object({
  branchId: Id.nullable(),
  collectedCents: Centavos,
  accruedCents: Centavos,
  outstandingCents: Centavos,
  activeMembers: z.number().int(),
  // Foto completa (3.7): lo demás del Tablero, por sucursal. `null` (sin sucursal) no lo trae.
  deferredCents: Centavos.optional(),
  mrrCents: Centavos.optional(),
  overdueCents: Centavos.optional(),
  cashExpensesCents: Centavos.optional(),
  fixedExpensesCents: Centavos.optional(),
  profitCents: Centavos.optional(),
  ...FotoCompleta,
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
  /**
   * Cómo se firma este cierre (D-23): `approver`, lo cierra la gerencia y firma
   * la dueña; `own-password`, no hay gerente que administre y lo cierra la
   * dueña con su contraseña.
   */
  signature: z.enum(['approver', 'own-password']),
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
    /** Pases de prueba gratis dados en el mes (D-08; 3.12). */
    trialPasses: z.number().int(),
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
    /** Entradas autorizadas sin rostro en los últimos 7 días (D-06; 3.12). */
    entriesWithoutFace7d: z.number().int(),
  }),
  owed: z.object({
    overdueCents: Centavos, outstandingCents: Centavos, membersBehind: z.number().int(),
    /** La deuda por sucursal, en cifras y sin nombres (D-25). La sede es la de casa del socio. */
    byBranch: z.array(z.object({ branchId: Id.nullable(), outstandingCents: Centavos, membersBehind: z.number().int() })),
  }),
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

// ── Gastos fijos y retiros del dueño: finance/expenses.routes.ts (3.7) ──────

/**
 * Un gasto del gimnasio. `category = 'OWNER_DRAW'` es un «Retiro del dueño»:
 * se anota y se ve, pero no resta de la ganancia (D-23). Con `adjustsMonth`
 * es un «ajuste de ‹mes›»: llegó tarde a un mes cerrado y cuenta en `month`,
 * el mes en curso (D-22); si además trae `adjustsExpenseId`, corrige (en
 * negativo) ese gasto del mes cerrado.
 */
export const Expense = z.object({
  id: Id,
  branchId: Id.nullable(),
  category: z.string(),
  description: z.string(),
  /** Negativo solo en el ajuste que corrige un gasto de un mes cerrado. */
  amountCents: Centavos,
  month: Mes,
  createdAt: Instante,
  voidedAt: Instante.nullable(),
  voidReason: z.string().nullable(),
  adjustsMonth: Mes.nullable(),
  adjustsExpenseId: Id.nullable(),
  /** Este gasto (de un mes cerrado) ya se corrigió con un ajuste anotado en ese mes. */
  correctedInMonth: Mes.nullable(),
});
export type Expense = z.infer<typeof Expense>;

/** `GET /expenses?month=AAAA-MM`. `closed`: el mes está cerrado y lo nuevo va como ajuste al mes en curso (`currentMonth`). */
export const ExpenseList = z.object({ month: Mes, closed: z.boolean(), currentMonth: Mes, expenses: z.array(Expense) });
export type ExpenseList = z.infer<typeof ExpenseList>;

// ── La tienda, para quien consulta: GET /reports/store (3.7, D-25) ──────────

/**
 * Ventas y existencias de la tienda en cifras. La dueña las consulta sin
 * operar el punto de venta. `month` va del día 1 a hoy (incluido).
 */
export const StoreSummary = z.object({
  asOf: Instante,
  today: z.object({ sales: z.number().int(), totalCents: Centavos }),
  month: z.object({ from: Fecha, to: Fecha, sales: z.number().int(), totalCents: Centavos, voided: z.number().int() }),
  /** Lo más vendido del mes (hasta 8), por importe. */
  top: z.array(z.object({ productId: Id, name: z.string(), quantity: z.number().int(), totalCents: Centavos })),
  /** Existencias de los productos activos que llevan inventario, de menos a más. */
  stock: z.array(z.object({ productId: Id, branchId: Id.nullable(), name: z.string(), stock: z.number().int() })),
  /** Cuántos productos activos hay y cuántos están agotados. */
  products: z.object({ active: z.number().int(), outOfStock: z.number().int() }),
});
export type StoreSummary = z.infer<typeof StoreSummary>;

// ── Lo que ve quien firma: GET /reports/signature-brief (3.7, D-25) ─────────

/**
 * `GET /reports/signature-brief?resourceType=&resourceId=`: resumen de a quién
 * toca la operación que se va a firmar, sin abrir su expediente ni decir su
 * nombre: desde cuándo es socio, cuánto debe y cuántas correcciones de dinero
 * lleva (devoluciones, cargos anulados y cargos con descuento o condonación).
 * `member` es `null` cuando la operación no toca a un socio (un retiro de
 * caja, el cierre de mes).
 */
export const SignatureBrief = z.object({
  member: z.object({
    memberSince: Fecha,
    outstandingCents: Centavos,
    overdueCents: Centavos,
    corrections: z.object({ last90Days: z.number().int(), total: z.number().int() }),
  }).nullable(),
});
export type SignatureBrief = z.infer<typeof SignatureBrief>;
