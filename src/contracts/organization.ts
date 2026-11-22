import { z } from 'zod';
import { MODULE_GROUPS, type ModuleGroup } from '../modules.js';
import { Id, Instante } from './comun.js';

const GRUPOS_DE_MODULO = Object.keys(MODULE_GROUPS) as [ModuleGroup, ...ModuleGroup[]];

/**
 * EL GIMNASIO: datos, sucursales, primer arranque y módulos
 * (`organization/organization.routes.ts`, `organization/modules.routes.ts`).
 */

/** `GET /organization`. */
export const Organization = z.object({
  id: Id,
  legalName: z.string(),
  tradeName: z.string(),
  /** Zona del gimnasio (IANA): manda en «hoy», el corte y los vencimientos. */
  timezone: z.string(),
  defaultCurrency: z.string(),
});
export type Organization = z.infer<typeof Organization>;

/** Una sucursal: `GET /branches` (lista) y `GET /branches/:id`. */
export const Branch = z.object({
  id: Id,
  /** Corto; sus tres primeras letras son el prefijo de los socios de la sede (CEN-00042). */
  code: z.string(),
  name: z.string(),
  addressLine: z.string().nullable(),
  /** El enlace corto del alta digital (`/alta/<slug>`). */
  publicSlug: z.string().nullable(),
  /** `null` = usa la zona del gimnasio. */
  timezone: z.string().nullable(),
  isActive: z.boolean(),
});
export type Branch = z.infer<typeof Branch>;

/** `GET /branches`. */
export const BranchList = z.array(Branch);
export type BranchList = z.infer<typeof BranchList>;

// ── Primer arranque (ADR-038) ───────────────────────────────────────────────

/** Un paso de la lista de arranque. */
export const SetupStep = z.object({
  key: z.string(),
  /** Obligatorio para operar; los demás se sugieren. */
  required: z.boolean(),
  done: z.boolean(),
  /** A dónde ir a resolverlo. */
  href: z.string(),
  /** El permiso con el que se resuelve. */
  permission: z.string(),
  title: z.string(),
  text: z.string(),
  /** ¿Quien mira puede resolverlo? (lo tiene sobre toda la organización). */
  canAct: z.boolean(),
});
export type SetupStep = z.infer<typeof SetupStep>;

/** `GET /organization/setup`: qué le falta a la marca para operar. */
export const Setup = z.object({
  complete: z.boolean(),
  required: z.number().int(),
  requiredDone: z.number().int(),
  steps: z.array(SetupStep),
  /** La tarjeta se muestra a quien puede resolver algo pendiente (DP-07). */
  canAct: z.boolean(),
});
export type Setup = z.infer<typeof Setup>;

// ── Módulos (ADR-036) ───────────────────────────────────────────────────────

/** Un cambio de módulo, con quién y por qué (solo para quien dirige o audita). */
const CambioDeModulo = z.object({
  enabled: z.boolean(),
  reason: z.string().nullable(),
  at: Instante,
  byName: z.string().nullable(),
});

/** Cómo va un módulo en una sucursal (solo los opcionales de alcance por sucursal). */
export const ModuleAtBranch = z.object({
  branchId: Id,
  name: z.string(),
  enabled: z.boolean(),
  /** Quien mira puede cambiarlo en esa sede (`settings:branch` ahí). */
  canChange: z.boolean(),
  /** Solo para quien dirige o audita, y solo si la sede lo apagó. */
  reason: z.string().nullable().optional(),
  at: Instante.optional(),
  byName: z.string().nullable().optional(),
});
export type ModuleAtBranch = z.infer<typeof ModuleAtBranch>;

/** Un módulo del gimnasio tal como lo cuenta `GET /organization/modules`. */
export const OrganizationModule = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  kind: z.enum(['fixed', 'optional']),
  /** Solo los opcionales: el grupo de la pantalla (`MODULE_GROUPS`). */
  group: z.enum(GRUPOS_DE_MODULO).nullable(),
  groupName: z.string().nullable(),
  usedBy: z.string(),
  screens: z.array(z.string()),
  requires: z.array(z.object({ key: z.string(), name: z.string(), fixed: z.boolean() })),
  enabled: z.boolean(),
  /** Lo decide la plataforma: sin contrato no se puede encender. */
  contracted: z.boolean(),
  /** `branch`: una sucursal puede dejar de usarlo aunque el gimnasio lo tenga encendido. */
  scope: z.enum(['org', 'branch']),
  /** Los NOMBRES de los módulos encendidos que lo necesitan: mientras haya alguno, no se apaga. */
  dependents: z.array(z.string()),
  /** Qué sucursales lo usan; vacío si no es de alcance por sucursal. */
  branches: z.array(ModuleAtBranch),
  /** Solo para quien dirige o audita, y solo en los opcionales: qué hay vivo y qué impide apagarlo. */
  usage: z.object({ inUse: z.array(z.string()), blockers: z.array(z.string()) }).optional(),
  /**
   * «Falta configurar» (19-08): encendido y sin nada preparado. Qué falta, cómo
   * se llama la acción y a dónde ir. `null`: ya está listo o no aplica. Solo
   * para quien dirige o audita.
   */
  setup: z.object({ text: z.string(), action: z.string(), href: z.string() }).nullable().optional(),
  lastChange: CambioDeModulo.nullable().optional(),
});
export type OrganizationModule = z.infer<typeof OrganizationModule>;

/** `GET /organization/modules` (y la respuesta de los dos `PUT` que los cambian). */
export const OrganizationModules = z.object({
  /** Puede cambiarlos: `settings:org` sobre todo el gimnasio. */
  canManage: z.boolean(),
  modules: z.array(OrganizationModule),
  /**
   * Lo contratado (19-09), solo para quien dirige o audita: el plan de la
   * plataforma (`name: null` = contrato a la medida), cuántos módulos
   * opcionales trae y cuántos se agregaron aparte.
   */
  plan: z.object({ name: z.string().nullable(), included: z.number().int(), addOns: z.number().int() }).optional(),
});
export type OrganizationModules = z.infer<typeof OrganizationModules>;

// ── Mi gimnasio · Datos (D-27) ──────────────────────────────────────────────

/**
 * `GET /organization/profile`: los datos de la marca y lo contratado. Todo es
 * de solo consulta en el panel: los administra la plataforma (D-27).
 */
export const GymProfile = z.object({
  tradeName: z.string(),
  legalName: z.string(),
  /** Zona del gimnasio (IANA). */
  timezone: z.string(),
  defaultCurrency: z.string(),
  /** A quién le llega el estado de cuenta de GymFlow. */
  billingEmail: z.string().nullable(),
  /** Desde cuándo usa GymFlow. */
  activatedAt: Instante.nullable(),
  plan: z.object({
    /** `null`: contrato a la medida, módulo por módulo. */
    name: z.string().nullable(),
    description: z.string().nullable(),
    /** Nombres de los módulos opcionales que trae el plan (o todos los contratados, si es a la medida). */
    included: z.array(z.string()),
    /** Contratados aparte del plan. */
    addOns: z.array(z.string()),
    notContracted: z.array(z.string()),
  }),
  /** Reglas del gimnasio que hoy solo fija la plataforma o el arranque. */
  rules: z.object({
    allowAccessWhilePastDue: z.boolean(),
    managerAttendsFrontDesk: z.boolean(),
    /** Meses tras la baja para proponer anonimizar; `null` = sin fijar. */
    monthsAfterArchive: z.number().int().nullable(),
  }),
  branches: z.object({ open: z.number().int(), closed: z.number().int() }),
});
export type GymProfile = z.infer<typeof GymProfile>;
