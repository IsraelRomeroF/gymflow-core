import { z } from 'zod';
import { Centavos, Fecha, Id, Instante } from './comun.js';

/**
 * LA CONSOLA DE PLATAFORMA: marcas, alta y cuentas (`tenants/tenants.routes.ts`;
 * auditoría 8, bloque 2.11, hallazgo 22-16). Antes cada pantalla de la consola
 * copiaba a mano estos tipos (`Marca`, `Detalle`, `Usuario`, `Credencial`) en
 * tres archivos. El cobro de plataforma (facturas, pagos) no está aquí: sus
 * tipos siguen en `plataforma/cobro/textos.ts` (bloque 1.13).
 */

/** Si la marca puede usar el software: sin liberar, en uso o suspendido. */
export const PlatformServiceStatus = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']);
export type PlatformServiceStatus = z.infer<typeof PlatformServiceStatus>;

/** El estado de cobro de una marca (`tenants/cobro-reglas.ts`, 23-02): uno solo para la lista, la ficha, la bandeja y Cobranza. */
export const PlatformBillingStatus = z.enum(['VENCIDA', 'NO_FACTURABLE', 'SIN_FACTURA_DEL_MES', 'POR_VENCER', 'AL_CORRIENTE', 'SIN_COBRO']);
export type PlatformBillingStatus = z.infer<typeof PlatformBillingStatus>;

/**
 * Lo que se entrega UNA vez a UNA persona (22-03): su contraseña temporal y
 * su celular, para mandársela a ella y a nadie más. No se guarda en claro.
 */
export const PlatformCredential = z.object({
  roleKey: z.string(),
  roleName: z.string(),
  fullName: z.string(),
  email: z.string(),
  phoneE164: z.string().nullable(),
  password: z.string(),
});
export type PlatformCredential = z.infer<typeof PlatformCredential>;

/** `POST /platform/organizations` (201). */
export const PlatformOrganizationCreated = z.object({
  organizationId: Id,
  branchId: Id,
  /** `ACTIVE` si se pidió «Liberar al terminar» (`releaseNow`); si no, `PENDING`: nadie entra hasta liberarla. */
  serviceStatus: PlatformServiceStatus,
  credentials: z.array(PlatformCredential),
});
export type PlatformOrganizationCreated = z.infer<typeof PlatformOrganizationCreated>;

/** `POST /platform/organizations/:id/users` (201): la credencial de la cuenta nueva. */
export const PlatformUserCreated = PlatformCredential.extend({
  userId: Id,
  /**
   * Nació con Dirección y Cumplimiento liberados: solo un gerente que llega
   * cuando la marca no tiene otro gerente activo (22-09). Cualquier otra
   * cuenta nace cerrada y la libera el dueño.
   */
  sectionsUnlocked: z.boolean(),
});
export type PlatformUserCreated = z.infer<typeof PlatformUserCreated>;

/** `POST /platform/organizations/:id/service`. */
export const PlatformServiceChanged = z.object({
  ok: z.literal(true),
  serviceStatus: z.enum(['ACTIVE', 'SUSPENDED']),
  /** Lo que quedó en la bitácora: liberar por primera vez, reanudar tras una suspensión o suspender. */
  action: z.enum(['platform.service.activate', 'platform.service.resume', 'platform.service.suspend']),
  /**
   * Solo al reanudar a una marca que todavía debe algo vencido (D-37, bloque
   * 3.11): hasta ese día, incluido, la suspensión automática no la vuelve a tocar.
   */
  holdUntil: z.string().nullable().optional(),
});
export type PlatformServiceChanged = z.infer<typeof PlatformServiceChanged>;

/** Una marca en la lista de la consola. */
export const PlatformOrganizationSummary = z.object({
  id: Id,
  legalName: z.string(),
  tradeName: z.string(),
  timezone: z.string(),
  createdAt: Instante,
  serviceStatus: PlatformServiceStatus,
  /** La PRIMERA liberación: reanudar tras una suspensión no la mueve. */
  activatedAt: Instante.nullable(),
  suspendedAt: Instante.nullable(),
  /** El plan contratado (ADR-039); `null` = a la medida. */
  plan: z.object({ id: Id, name: z.string() }).nullable(),
  branches: z.number().int(),
  activeMembers: z.number().int(),
  staff: z.number().int(),
  entriesLast24h: z.number().int(),
  notContracted: z.number().int(),
  /**
   * Lo último que hizo LA GENTE DEL GIMNASIO (22-06): el último asiento de su
   * bitácora que no es de la plataforma (`platform.*`) ni del sistema
   * (`system.*`). Facturarle o darle una cuenta ya no «revive» a una marca que nadie usa.
   */
  lastActivityAt: Instante.nullable(),
  /** La última vez que alguien de su personal entró al panel; `null` = nadie ha entrado nunca. */
  lastStaffLoginAt: Instante.nullable(),
  billing: z.object({ status: PlatformBillingStatus, pendingCents: Centavos, overdueDays: z.number().int() }),
  /** Último cierre diario: tareas que fallaron y si la bitácora está íntegra. */
  lastDailyRun: z.object({ at: Instante, failed: z.array(z.string()), chain: z.string() }).nullable(),
});
export type PlatformOrganizationSummary = z.infer<typeof PlatformOrganizationSummary>;

/** `GET /platform/organizations`. */
export const PlatformOrganizationList = z.object({
  /** Cuánto factura GymFlow al mes si todas las marcas en uso pagan (DP-03). */
  monthlyIncomeCents: Centavos,
  /** Conceptos del catálogo (lo básico y cada módulo) sin precio: sin ellos no se puede facturar. */
  pricesMissing: z.number().int(),
  organizations: z.array(PlatformOrganizationSummary),
});
export type PlatformOrganizationList = z.infer<typeof PlatformOrganizationList>;

/** Una cuenta del personal de la marca, como la ve la consola. */
export const PlatformUser = z.object({
  id: Id,
  fullName: z.string(),
  email: z.string(),
  /** Su celular: una temporal nueva se le manda a esa persona y a nadie más (22-03). */
  phoneE164: z.string().nullable(),
  isActive: z.boolean(),
  lastLoginAt: Instante.nullable(),
  mustChangePassword: z.boolean(),
  /** Lo que la plataforma deja ver al dueño; `null` = todo. */
  platformSections: z.array(z.string()).nullable(),
  roleKeys: z.array(z.string()),
  /** `null` = todo el gimnasio. */
  branchIds: z.array(Id).nullable(),
});
export type PlatformUser = z.infer<typeof PlatformUser>;

/** `GET /platform/organizations/:id`. */
export const PlatformOrganizationDetail = z.object({
  id: Id,
  legalName: z.string(),
  tradeName: z.string(),
  timezone: z.string(),
  billingEmail: z.string().nullable(),
  createdAt: Instante,
  serviceStatus: PlatformServiceStatus,
  activatedAt: Instante.nullable(),
  suspendedAt: Instante.nullable(),
  suspendedReason: z.string().nullable(),
  /** La suspensión vigente la hizo el sistema a los 15 días de atraso, no una persona (D-37, bloque 3.11). */
  suspendedAutomatically: z.boolean(),
  /** Prórroga de la suspensión automática: hasta ese día (`AAAA-MM-DD`), incluido. */
  autoSuspendHoldUntil: z.string().nullable(),
  /** El plan como lo tiene ESTA marca (su versión, D-38): un cambio anunciado no lo mueve hasta su fecha. */
  plan: z.object({ id: Id, name: z.string(), modules: z.array(z.string()), monthlyCents: Centavos.nullable() }).nullable(),
  branches: z.array(z.object({ id: Id, code: z.string(), name: z.string(), isActive: z.boolean(), publicSlug: z.string().nullable() })),
  users: z.array(PlatformUser),
  activeMembers: z.number().int(),
  entriesLast24h: z.number().int(),
  modules: z.array(z.object({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    groupName: z.string().nullable(),
    /** Lo decide la plataforma. */
    contracted: z.boolean(),
    /** Contratado y encendido por la gerencia. */
    enabled: z.boolean(),
    /** Viene con el plan contratado (lo demás contratado es un agregado). */
    inPlan: z.boolean(),
  })),
});
export type PlatformOrganizationDetail = z.infer<typeof PlatformOrganizationDetail>;

// ── Escalera de cobranza y cambios con un mes de aviso (auditoría 8, fase 3, bloque 3.11; D-37 y D-38) ──

/** Un aviso de GymFlow al dueño de una marca. `deliveredOn` es el primer día con constancia de que le llegó. */
export const PlatformNotice = z.object({
  id: Id,
  organizationId: Id,
  kind: z.enum(['INVOICE_ISSUED', 'INVOICE_OVERDUE', 'SERVICE_SUSPENDED', 'PRICE_CHANGE', 'PRICE_CHANGE_CANCELED']),
  invoiceId: Id.nullable(),
  title: z.string(),
  body: z.string(),
  noticeOn: Fecha,
  createdAt: Instante,
  /** Por dónde hay constancia: notificación entregada a su teléfono, visto en su panel, mandado por una persona de GymFlow. */
  pushedAt: Instante.nullable(),
  pushDevices: z.number().int(),
  seenAt: Instante.nullable(),
  sentAt: Instante.nullable(),
  deliveredOn: Fecha.nullable(),
  closedAt: Instante.nullable(),
  closeReason: z.string().nullable(),
});
export type PlatformNotice = z.infer<typeof PlatformNotice>;

/**
 * Cómo va la cobranza de una marca (`tenants/cobranza-reglas.ts`). `state`:
 * sin adeudo vencido; con el aviso de vencida sin constancia de entrega (no
 * se suspende hasta que le llegue); en plazo (se suspende `suspendsOn`); en
 * prórroga; o no está en uso.
 */
export const PlatformCollections = z.object({
  state: z.enum(['NO_EN_USO', 'SIN_ADEUDO_VENCIDO', 'AVISO_SIN_ENTREGAR', 'EN_PLAZO', 'PRORROGA', 'SUSPENDER']),
  folio: z.string().nullable(),
  invoiceId: Id.nullable(),
  balanceCents: Centavos.nullable(),
  /** Días desde el vencimiento. */
  overdueDays: z.number().int(),
  /** Días de atraso con el aviso ya entregado: los que cuentan para suspender. */
  noticedDays: z.number().int(),
  suspendsOn: Fecha.nullable(),
  holdUntil: Fecha.nullable(),
  suspendsAfterDays: z.number().int(),
});
export type PlatformCollections = z.infer<typeof PlatformCollections>;

/** `GET /platform/collections`. */
export const PlatformCollectionsBoard = z.object({
  suspendsAfterDays: z.number().int(),
  atRisk: z.array(PlatformCollections.extend({ organizationId: Id, tradeName: z.string() })),
  /** Avisos abiertos sin constancia de entrega, con a quién mandárselos. */
  toSend: z.array(PlatformNotice.extend({
    tradeName: z.string(),
    owners: z.array(z.object({ id: Id, fullName: z.string(), phoneE164: z.string().nullable() })),
  })),
});
export type PlatformCollectionsBoard = z.infer<typeof PlatformCollectionsBoard>;

/** `PUT /platform/organizations/:id/collections-hold`. */
export const PlatformCollectionsHold = z.object({ holdUntil: Fecha.nullable() });
export type PlatformCollectionsHold = z.infer<typeof PlatformCollectionsHold>;

/** Un cambio de precio o de plan anunciado, aplicado o cancelado (D-38). */
export const PlatformPriceChange = z.object({
  id: Id,
  kind: z.enum(['PRICE', 'PLAN']),
  moduleKey: z.string().nullable(),
  planId: Id.nullable(),
  /** El concepto o el nombre del plan. */
  concept: z.string(),
  beforeCents: Centavos.nullable(),
  afterCents: Centavos.nullable(),
  beforeModules: z.array(z.string()).optional(),
  afterModules: z.array(z.string()).optional(),
  /** Día 1 del mes de la primera factura con lo nuevo. */
  effectiveFrom: Fecha,
  announcedOn: Fecha,
  status: z.enum(['PENDING', 'APPLIED', 'CANCELED']),
  cancelReason: z.string().nullable(),
});
export type PlatformPriceChange = z.infer<typeof PlatformPriceChange>;

/** `GET /platform/price-changes`. */
export const PlatformPriceChangeList = z.object({ minEffectiveFrom: Fecha, changes: z.array(PlatformPriceChange) });
export type PlatformPriceChangeList = z.infer<typeof PlatformPriceChangeList>;

/** `POST /platform/prices/preview` y `POST /platform/plans/:id/change-preview`: no guardan nada. */
export const PlatformPriceChangePreview = z.object({
  /** La primera factura que puede llevar un cambio anunciado hoy (un mes de aviso). */
  minEffectiveFrom: Fecha,
  effectiveFrom: Fecha,
  /** No le mueve la mensualidad a ninguna marca: se guarda en el acto. */
  immediate: z.boolean(),
  affected: z.array(z.object({ organizationId: Id, tradeName: z.string(), beforeCents: Centavos, afterCents: Centavos })),
  /** Solo en planes: cuántas marcas lo tienen. */
  organizations: z.number().int().optional(),
});
export type PlatformPriceChangePreview = z.infer<typeof PlatformPriceChangePreview>;

/**
 * `GET /gymflow-account`: la cuenta del gimnasio con GymFlow, como la ve su
 * dueño en el panel (solo consulta). Para quien no es dueño, `visible` es
 * falso y lo demás va vacío.
 */
export const GymflowAccount = z.object({
  visible: z.boolean(),
  serviceStatus: PlatformServiceStatus,
  status: z.object({ code: PlatformBillingStatus, overdueDays: z.number().int(), pendingCents: Centavos }),
  /** Cuándo se suspendería el servicio si no se registra el pago; `null` si no hay fecha. */
  suspendsOn: Fecha.nullable(),
  suspendsAfterDays: z.number().int(),
  monthly: z.object({ lines: z.array(z.object({ key: z.string(), name: z.string(), monthlyCents: Centavos })), totalCents: Centavos }),
  /** La mensualidad ya anunciada para una fecha próxima, si cambia. */
  upcoming: z.object({ effectiveFrom: Fecha, totalCents: Centavos }).nullable(),
  invoices: z.array(z.object({
    id: Id, folio: z.string(), periodStart: Fecha, dueDate: Fecha, totalCents: Centavos, balanceCents: Centavos,
    state: z.enum(['PENDIENTE', 'PAGADA_EN_PARTE', 'VENCIDA', 'PAGADA', 'ANULADA']), overdueDays: z.number().int(),
  })),
  /** Los avisos abiertos de GymFlow. */
  notices: z.array(z.object({ id: Id, kind: PlatformNotice.shape.kind, title: z.string(), body: z.string(), noticeOn: Fecha, seen: z.boolean() })),
});
export type GymflowAccount = z.infer<typeof GymflowAccount>;

/** `POST /gymflow-account/seen`. */
export const GymflowAccountSeen = z.object({ seen: z.number().int() });
export type GymflowAccountSeen = z.infer<typeof GymflowAccountSeen>;
