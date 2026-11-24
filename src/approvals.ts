/**
 * LA SEGUNDA FIRMA, en el núcleo (auditoría 8, bloque 0.9).
 *
 * Lo que el servidor y el panel tienen que decir igual: cuánto vale una
 * firma, cuánto espera una solicitud a distancia, de qué registro se trata
 * cada operación que se firma y cuándo se pausan las firmas de alguien por
 * intentos fallidos. Antes los diez minutos estaban escritos a mano en tres
 * lugares (29-09) y el tipo de registro no lo mandaba nadie (29-01).
 */

/** Una firma emitida vale cinco minutos: lo que tarda en usarse en el mostrador. */
export const APPROVAL_GRANT_TTL_MS = 5 * 60_000;

/** Una solicitud a distancia espera diez minutos la respuesta de quien firma. */
export const APPROVAL_REQUEST_TTL_MS = 10 * 60_000;

/**
 * Los desenlaces de una solicitud a distancia. El panel los pinta con un
 * `switch` sin `default`: un estado nuevo (la pregunta de D-03, por ejemplo)
 * no compila hasta que alguien decide cómo se ve (29-09).
 */
export const APPROVAL_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELED'] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];

export function isApprovalRequestStatus(v: string): v is ApprovalRequestStatus {
  return (APPROVAL_REQUEST_STATUSES as readonly string[]).includes(v);
}

/**
 * La firma de una solicitud aprobada, vista por quien la pidió (29-03):
 * `ready` mientras no se use ni venza (se vuelve a entregar si se perdió la
 * respuesta que la traía), `used` ya se usó, `expired` venció sin usarse.
 */
export const APPROVAL_DELIVERIES = ['ready', 'used', 'expired'] as const;
export type ApprovalDelivery = (typeof APPROVAL_DELIVERIES)[number];

/** De qué registro se trata lo que se firma: la bandeja lo lee de la base, no del texto de quien pide (29-01, UXG-05). */
export const APPROVAL_RESOURCE_TYPES = ['CashSession', 'Payment', 'Charge', 'Membership', 'Member', 'VisitPack', 'MonthlyClose', 'PosSale', 'CashLimits'] as const;
export type ApprovalResourceType = (typeof APPROVAL_RESOURCE_TYPES)[number];

export function isApprovalResourceType(v: string): v is ApprovalResourceType {
  return (APPROVAL_RESOURCE_TYPES as readonly string[]).includes(v);
}

/**
 * Qué registro lleva cada operación que puede pedir firma: las que la piden
 * siempre (`approval: true` en el catálogo) y las que la piden al pasar un
 * tope (descuento, retiro, condonación, reembolso, ajuste de saldo). La
 * condonación puede ser de un cargo o del adeudo de una membresía suspendida.
 */
export const APPROVAL_RESOURCES_BY_PERMISSION: Readonly<Record<string, readonly ApprovalResourceType[]>> = {
  'cash:withdraw': ['CashSession'],
  'payments:reverse': ['Payment'],
  // D-13 (bloque 3.5): también el saldo a favor de un socio, cuando pide que se le devuelva.
  'payments:refund': ['Payment', 'Member'],
  'billing:charge:void': ['Charge'],
  'billing:discount:apply': ['Charge'],
  // D-12 (bloque 3.5): también el adeudo entero de un socio, al darlo de baja o al cancelar.
  'billing:waiver:apply': ['Charge', 'Membership', 'Member'],
  'members:anonymize': ['Member'],
  // D-06 (bloque 3.3): la entrada de un socio sin rostro. Si la gerencia no está, la firma la dueña.
  'access:entry:authorize': ['Member'],
  'members:balance:adjust': ['Member'],
  'memberships:visitpack:adjust': ['VisitPack'],
  // D-13 (bloque 3.5): la devolución de una venta de tienda de otro día.
  'pos:sale:return': ['PosSale'],
  // D-15: los topes del cajón de un gimnasio (el registro es el gimnasio mismo).
  'cash:limits:set': ['CashLimits'],
  'reports:month:close': ['MonthlyClose'],
};

/** Los tipos de registro posibles para esa operación; vacío si la operación no lleva segunda firma. */
export function approvalResourceTypesFor(permission: string): readonly ApprovalResourceType[] {
  return APPROVAL_RESOURCES_BY_PERMISSION[permission] ?? [];
}

/**
 * Operaciones cuyo registro no existe antes de hacerse: el cierre de mes. Su
 * firma se ata al MES con `monthlyCloseResourceId`; mientras quede algún
 * cliente que la pida sin mes, el servidor acepta también la firma sin
 * registro (fase 0: se suma antes de quitar).
 */
export const APPROVAL_RESOURCE_OPTIONAL: ReadonlySet<string> = new Set(['reports:month:close']);

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ID_DE_CIERRE = /^00000000-0000-8000-8000-000000(\d{4})(0[1-9]|1[0-2])$/i;

/**
 * El cierre de un mes no es un registro hasta que se cierra, y la firma tiene
 * que ir atada a ESE mes (20-01): un UUID versión 8 fijo (RFC 9562) que el
 * panel y el servidor calculan igual, sin consultar nada. No choca con ningún
 * id real: los de la base son versión 7.
 *
 *   2026-10 → 00000000-0000-8000-8000-000000202610
 */
export function monthlyCloseResourceId(month: string): string {
  const m = MES.exec(month);
  if (!m) throw new Error(`Mes inválido: ${month} (se espera AAAA-MM)`);
  return `00000000-0000-8000-8000-000000${m[1]}${m[2]}`;
}

/** El mes (AAAA-MM) de un id de cierre, o null si el id no es de un cierre de mes. */
export function monthOfMonthlyCloseResourceId(id: string): string | null {
  const m = ID_DE_CIERRE.exec(id);
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * ESCALERA DE FALLOS DE LA FIRMA (24-11, D24-04), aparte del inicio de
 * sesión. Cuenta los fallos con la contraseña de una persona al firmar, en
 * el mostrador o desde su teléfono: al 3.º dentro de 10 minutos se le avisa;
 * al 5.º sus firmas quedan en pausa 10 minutos y se avisa a la dueña. Su
 * entrada al panel no se toca: un error con prisa, o alguien de mala fe en
 * el mostrador, ya no deja a nadie fuera del sistema.
 */
export const APPROVAL_FAILURE_LADDER = {
  windowMs: 10 * 60_000,
  warnAt: 3,
  pauseAt: 5,
  pauseMs: 10 * 60_000,
} as const;

export type ApprovalFailureStep = 'none' | 'warn' | 'pause';

/** El escalón al que llega un fallo, dado cuántos lleva la ventana (contando este). */
export function approvalFailureStep(failedCount: number, ladder: { warnAt: number; pauseAt: number } = APPROVAL_FAILURE_LADDER): ApprovalFailureStep {
  if (failedCount >= ladder.pauseAt) return 'pause';
  if (failedCount === ladder.warnAt) return 'warn';
  return 'none';
}

/**
 * ALCANCE DE QUIEN FIRMA (29-05, bloque 2.10): cómo se va a enterar de una
 * solicitud a distancia. `push`: tiene vivo el aviso en su teléfono; `panel`:
 * no lo tiene, pero usó el panel hace poco y la verá en su bandeja; `none`:
 * ninguna de las dos, solo la verá si abre el panel. El mostrador lo lee
 * antes de pedir y decide si espera, insiste o le llama.
 */
export const APPROVAL_REACHES = ['push', 'panel', 'none'] as const;
export type ApprovalReach = (typeof APPROVAL_REACHES)[number];

/** Con actividad en el panel en este lapso, se da por hecho que quien firma lo tiene abierto. */
export const APPROVAL_PANEL_ACTIVE_MS = 15 * 60_000;

/** «Resueltas hoy»: lo aprobado, rechazado, vencido y cancelado de las últimas 24 horas (20-05). */
export const APPROVAL_HISTORY_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Qué pasó con una solicitud que venció sin respuesta (29-05), con lo que la
 * propia solicitud guardó: si algún firmante la tuvo en su bandeja (`seenAt`)
 * y a cuántos teléfonos salió el aviso (`notifiedCount`). Nunca «nadie la
 * contestó» a secas: el mostrador necesita saber si insistir o llamar.
 */
export type ApprovalExpiryCause = 'seen' | 'notified' | 'unseen';
export function approvalExpiryCause(s: { seenAt: unknown; notifiedCount: number }): ApprovalExpiryCause {
  if (s.seenAt) return 'seen';
  return s.notifiedCount > 0 ? 'notified' : 'unseen';
}

/**
 * EL «NO» QUEDA PEGADO A LA OPERACIÓN (D-03, opción b; auditoría 8, bloque 3.2).
 *
 * «La misma operación» es el mismo permiso sobre el mismo registro (el pago,
 * el cargo, el turno de caja, el mes), la pida quien la pida. Antes un «no»
 * solo cerraba esa solicitud: se podía volver a pedir al instante, sin
 * límite, y firmarla en el mostrador un minuto después.
 */

/** Cuánto tiempo recuerda una operación que la rechazaron: quien la vuelve a pedir tiene que contestar ese «no». */
export const APPROVAL_REJECTION_MEMORY_MS = 24 * 60 * 60_000;

/** La misma operación se pide al teléfono, como mucho, 3 veces en una hora. Las ya autorizadas no cuentan. */
export const APPROVAL_REASK_LIMIT = { max: 3, perMs: 60 * 60_000 } as const;

/**
 * Tras un «no», durante 30 minutos nadie firma esa operación en el mostrador
 * con la contraseña de quien firma: solo desde su propia sesión, contestando
 * una solicitud a distancia.
 */
export const APPROVAL_REJECT_LOCK_MS = 30 * 60_000;

/** La respuesta al «no» anterior, la pregunta de quien firma y su contestación: de 3 a 300 caracteres. */
export const APPROVAL_NOTE_MIN = 3;
export const APPROVAL_NOTE_MAX = 300;

/** Preguntas de un toque para quien firma: «Preguntar» en vez de «No autorizar». */
export const APPROVAL_QUESTION_SUGGESTIONS = ['¿De qué socio es?', '¿Para qué es?', '¿Ya contaste el cajón?', 'Llámame antes'] as const;

/**
 * APODERADO TEMPORAL (D-02, bloque 3.1).
 *
 * Solo el dueño da la segunda firma; si estaba sin señal o enfermo, nada se
 * hacía. Ahora nombra desde su teléfono a UNA persona con fecha de fin, que
 * firma lo que piden los demás (nunca lo suyo) con la autoridad del dueño, y
 * la bitácora dice «firmó como apoderado». El nombramiento se apaga solo.
 */

/** Lo más que dura un nombramiento de apoderado, en días naturales contando hoy. */
export const APPROVAL_PROXY_MAX_DAYS = 30;

/** Por qué dejó de valer un nombramiento antes de leerse como vencido. */
export const APPROVAL_PROXY_END_REASONS = ['REVOKED', 'EXPIRED', 'REPLACED'] as const;
export type ApprovalProxyEndReason = (typeof APPROVAL_PROXY_END_REASONS)[number];

export function isApprovalProxyEndReason(v: string): v is ApprovalProxyEndReason {
  return (APPROVAL_PROXY_END_REASONS as readonly string[]).includes(v);
}

/** ¿Vale el nombramiento en este instante? Abierto y con su fecha de fin por delante. */
export function approvalProxyActive(p: { endsAt: Date; endedAt: Date | null }, now: Date = new Date()): boolean {
  return p.endedAt === null && p.endsAt > now;
}

/**
 * El último día que se puede elegir como fin: hoy más `APPROVAL_PROXY_MAX_DAYS - 1`
 * (30 días contando hoy). `today` y el resultado, como fecha del gimnasio (`YYYY-MM-DD`).
 */
export function approvalProxyLastDay(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + APPROVAL_PROXY_MAX_DAYS - 1);
  return d.toISOString().slice(0, 10);
}

/** ¿Sigue cerrada la firma en el mostrador por un «no» dado en `rejectedAt`? Devuelve hasta cuándo, o null. */
export function approvalRejectLockUntil(rejectedAt: Date, now: Date = new Date()): Date | null {
  const hasta = new Date(rejectedAt.getTime() + APPROVAL_REJECT_LOCK_MS);
  return hasta > now ? hasta : null;
}
