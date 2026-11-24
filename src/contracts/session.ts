import { z } from 'zod';
import { SESSION_END_REASONS } from '../vocabulario.js';
import { Centavos, Id, Instante } from './comun.js';

/**
 * LA SESIÓN DEL PERSONAL: `GET /auth/me` (`identity/auth.routes.ts`).
 *
 * Quién está dentro, de qué gimnasio y qué puede hacer. El panel la pide UNA
 * vez al entrar y de aquí arma su menú y la puerta de cada pantalla con los
 * mismos permisos que usa la API (antes: `Me`, escrito a mano en
 * `components/session.tsx`, 1-18).
 */

/** Los topes del puesto (`RoleLimits`), con el dinero en centavos como texto. `null` = sin tope. */
export const TopesDelPuesto = z.object({
  maxDiscountPercent: z.number().nullable(),
  maxWaiverAmountCents: Centavos.nullable(),
  maxManualBalanceAdjustCents: Centavos.nullable(),
  maxCashWithdrawalCents: Centavos.nullable(),
  maxRefundAmountCents: Centavos.nullable(),
  maxManualAccessGrantsPerShift: z.number().int().nullable(),
  maxPosVoidsPerShift: z.number().int().nullable(),
});
export type TopesDelPuesto = z.infer<typeof TopesDelPuesto>;

/** Los lugares de una sesión del personal (D-04): `sessions.kind`. */
export const SESSION_KINDS = ['COUNTER', 'OWNER_PHONE'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SessionMe = z.object({
  /** `null` solo en una sesión sin persona (no la da el panel). */
  userId: Id.nullable(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  /** La contraseña la puso otra persona: se cambia antes de seguir (SEC2-08). */
  mustChangePassword: z.boolean(),
  organizationId: Id,
  /** OWNER, MANAGER, RECEPTION, COACH: el rol se dice, no se adivina por los permisos (EST-10). */
  roleKeys: z.array(z.string()),
  /** Sin repetir y en orden alfabético. */
  permissions: z.array(z.string()),
  /** Los módulos que el gimnasio tiene encendidos (ADR-036). */
  modules: z.array(z.string()),
  /** Lo que cada sucursal dejó de usar aunque el gimnasio lo tenga encendido: `{ [branchId]: [módulo] }`. */
  disabledByBranch: z.record(z.string(), z.array(z.string())),
  /** Las sucursales de sus permisos; `null` en la lista = toda la organización. */
  branchScopes: z.array(Id.nullable()),
  /**
   * Las secciones de Dirección y Cumplimiento que el dueño le liberó (y las
   * de Operación que le quitó, como `-clave`). `null` = no tiene llave: es el
   * dueño y la plataforma no lo limita.
   */
  unlockedSections: z.array(z.string()).nullable(),
  limits: TopesDelPuesto,
  /**
   * Desde cuándo y hasta cuándo vale ESTA sesión (24-04, bloque 1.12): el
   * panel dice a qué hora se cierra. `null` si la sesión no se encontró.
   */
  session: z.object({
    startedAt: Instante, endsAt: Instante, secondsLeft: z.number().int(),
    /**
     * De qué LUGAR es (D-04, bloque 4.1): `COUNTER`, el mostrador y cualquier
     * otro equipo (dura un tiempo fijo desde que se entra); `OWNER_PHONE`, el
     * teléfono de la dueña (se renueva con el uso). Con `renews`, `endsAt` es
     * cuándo se cerraría si no se volviera a usar, `idleDays` los días sin uso
     * que aguanta y `maxEndsAt` el día en que se cierra aunque se use a diario.
     */
    kind: z.enum(SESSION_KINDS), renews: z.boolean(), idleDays: z.number().int().nullable(), maxEndsAt: Instante,
  }).nullable(),
});
export type SessionMe = z.infer<typeof SessionMe>;

// ── Por qué terminó una sesión (24-06, 24-07, 24-13; bloque 1.12) ───────────
// Los códigos y sus textos viven en `vocabulario.ts` (sin Zod: el panel los
// usa en el navegador); aquí, el esquema del 401 que los trae.

export const SessionEndReasonSchema = z.enum(SESSION_END_REASONS);

/**
 * El cuerpo del 401 de una sesión que terminó. Solo los 401 de SESIÓN llevan
 * `reason`; los de credenciales (contraseña del autorizador, «La contraseña
 * actual no es correcta», reconfirmar en la consola) no, porque el panel
 * saca al login a quien recibe uno de esta lista.
 */
export const SessionEnded = z.object({
  error: z.literal('UNAUTHENTICATED'),
  message: z.string(),
  reason: SessionEndReasonSchema,
  requestId: z.string(),
});
export type SessionEnded = z.infer<typeof SessionEnded>;
