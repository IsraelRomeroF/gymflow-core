import { z } from 'zod';
import { Centavos, Id, Instante } from './comun.js';

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
