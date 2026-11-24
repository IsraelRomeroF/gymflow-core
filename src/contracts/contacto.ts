import { z } from 'zod';
import { Id, Instante } from './comun.js';
import { CONTACT_FIELDS, PORTAL_RESPONSIBLE_KINDS } from '../contacto-del-socio.js';

/**
 * EL SOCIO CAMBIA SUS DATOS DE CONTACTO (auditoría 8, fase 4, bloque 4.8; D-36 c).
 *
 * Dos caras del mismo hecho:
 *  - el portal: `GET` y `PATCH /portal/me/contact` (`PortalContact`);
 *  - el mostrador: `GET /members/:id/contact-changes` y su «ya lo confirmé»
 *    (`MemberContactChanges`), que es como se le AVISA a recepción.
 */

export const ContactFieldSchema = z.enum(CONTACT_FIELDS);

/** Cuántos cambios le quedan de un dato en la ventana y, si ya no le quedan, desde cuándo puede otra vez. */
export const ContactLimit = z.object({
  max: z.number().int(),
  left: z.number().int(),
  /** Cuándo se libera el siguiente cambio; `null` si todavía le quedan. */
  nextAt: Instante.nullable(),
});
export type ContactLimit = z.infer<typeof ContactLimit>;

/**
 * `GET /portal/me/contact` y la respuesta de `PATCH /portal/me/contact`.
 *
 * El celular y el correo viajan ENMASCARADOS (`•• •••• 5678`, `ma•••@correo.mx`):
 * para cambiarlos el socio escribe completo el que tiene registrado, y esa
 * confirmación no valdría nada si la pantalla se lo dictara.
 */
export const PortalContact = z.object({
  hasPhone: z.boolean(),
  phoneMasked: z.string().nullable(),
  hasEmail: z.boolean(),
  emailMasked: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  /** Su celular también es el de otro socio (D-09). Nunca se dice de quién. */
  sharedPhone: z.boolean(),
  /** Quién responde por el número que comparte, como él lo dijo; `null` si nadie está anotado. */
  responsibleKind: z.enum(['SELF', 'MEMBER', 'ADULT']).nullable(),
  /** Qué tiene que escribir completo para cambiar celular o correo; `null` si el gimnasio no tiene ninguno de los dos. */
  confirmWith: z.enum(['PHONE', 'EMAIL']).nullable(),
  /** Los días de la ventana en que se cuentan los cambios. */
  windowDays: z.number().int(),
  limits: z.object({ phone: ContactLimit, email: ContactLimit, emergency: ContactLimit }),
  /** La última vez que él mismo cambió su celular o su correo desde el portal. */
  lastIdentityChangeAt: Instante.nullable(),
});
export type PortalContact = z.infer<typeof PortalContact>;

export const PortalResponsibleKindSchema = z.enum(PORTAL_RESPONSIBLE_KINDS);

/** Un cambio que el socio hizo desde su teléfono, como lo ve el mostrador. */
export const MemberContactChange = z.object({
  id: Id,
  field: ContactFieldSchema,
  /** El valor de antes y el de ahora. `null` los dos si quien mira no ve teléfonos, o si la ficha ya se anonimizó. */
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  /** El celular nuevo es también el de otro socio, y quién dijo el socio que responde por él. */
  sharedPhone: z.boolean(),
  responsibleKind: z.string().nullable(),
  at: Instante,
  reviewedAt: Instante.nullable(),
  reviewedByName: z.string().nullable(),
});
export type MemberContactChange = z.infer<typeof MemberContactChange>;

/**
 * `GET /members/:id/contact-changes`: lo que el socio cambió desde su
 * teléfono. `pending` son los que nadie del mostrador ha confirmado con él.
 */
export const MemberContactChanges = z.object({
  /** Quien mira no ve teléfonos ni correos: se le dice QUÉ cambió, no los valores. */
  hidden: z.boolean(),
  pending: z.number().int(),
  changes: z.array(MemberContactChange),
});
export type MemberContactChanges = z.infer<typeof MemberContactChanges>;

/** `POST /members/:id/contact-changes/review`: cuántos quedaron confirmados. */
export const MemberContactChangesReviewed = z.object({ reviewed: z.number().int() });
export type MemberContactChangesReviewed = z.infer<typeof MemberContactChangesReviewed>;
