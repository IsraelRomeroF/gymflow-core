import { normalizeEmail, normalizePhoneMx } from './identity.js';

/**
 * EL SOCIO CAMBIA SUS DATOS DE CONTACTO DESDE EL PORTAL (auditoría 8, fase 4,
 * bloque 4.8; decisión D-36, opción c: «todo directo, incluido el celular»).
 *
 * Las reglas que no necesitan base de datos, para que la API y sus pruebas
 * digan lo mismo:
 *
 *  - QUÉ cambia el socio: su celular, su correo y su contacto de emergencia
 *    (nombre y teléfono). Nombre, fecha de nacimiento, CURP, plan y coach
 *    siguen en el mostrador o por solicitud de corrección.
 *  - CUÁNTAS veces: un tope por dato en una ventana de días. El celular es el
 *    dato con que el gimnasio reconoce al socio; quien lo cambia tres veces en
 *    un mes ya necesita a una persona.
 *  - CON QUÉ se confirma: el portal no tiene contraseña ni manda códigos
 *    (D-34: ninguna conexión con costo). Lo único que el titular sabe y la
 *    pantalla no enseña completo es su dato ACTUAL: para cambiar celular o
 *    correo escribe completo el celular que tiene registrado (o su correo, si
 *    no tiene celular). La pantalla solo enseña la terminación.
 */

/** Los datos de contacto que el socio cambia por su cuenta. */
export const CONTACT_FIELDS = ['PHONE', 'EMAIL', 'EMERGENCY_NAME', 'EMERGENCY_PHONE'] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** Los que piden confirmación y de los que se avisa al propio socio: con ellos el gimnasio lo reconoce y le escribe. */
export const CONTACT_FIELDS_DE_IDENTIDAD: readonly ContactField[] = ['PHONE', 'EMAIL'];

/** La ventana en que se cuentan los cambios. */
export const CONTACT_CHANGE_WINDOW_DAYS = 30;

/** Cuántos cambios de cada dato caben en la ventana. El contacto de emergencia cuenta junto (nombre y teléfono). */
export const CONTACT_CHANGE_LIMITS = { PHONE: 3, EMAIL: 3, EMERGENCY: 10 } as const;
export type ContactLimitKey = keyof typeof CONTACT_CHANGE_LIMITS;

export const limiteDe = (campo: ContactField): ContactLimitKey => (campo === 'PHONE' || campo === 'EMAIL' ? campo : 'EMERGENCY');

/** Cuántas confirmaciones fallidas seguidas se toleran en una hora antes de mandar al socio a recepción. */
export const CONTACT_CONFIRM_MAX_FAILURES = 5;
export const CONTACT_CONFIRM_WINDOW_MINUTES = 60;

/**
 * Quién responde por un celular que ya es de otro socio (D-09), dicho desde
 * el portal. A diferencia del mostrador, aquí no se elige a un socio de una
 * lista: al socio no se le dice de quién es el número.
 *  - `SELF`    «Es mío: yo respondo por este número».
 *  - `HOLDER`  «Es de un familiar que ya es socio aquí: esa persona responde» (sin decir quién; lo resuelve el servidor).
 *  - `ADULT`   «Es de un adulto que no es socio», con su nombre.
 */
export const PORTAL_RESPONSIBLE_KINDS = ['SELF', 'HOLDER', 'ADULT'] as const;
export type PortalResponsibleKind = (typeof PORTAL_RESPONSIBLE_KINDS)[number];

/** Con qué confirma el socio que es él: su celular actual; sin celular, su correo; sin ninguno, nada que pedir. */
export type ContactConfirmKind = 'PHONE' | 'EMAIL';
export function confirmaCon(actual: { phoneE164: string | null; email: string | null }): ContactConfirmKind | null {
  if (normalizePhoneMx(actual.phoneE164)) return 'PHONE';
  if (normalizeEmail(actual.email)) return 'EMAIL';
  return null;
}

/** ¿Lo que escribió es su dato actual? Se compara normalizado: «55 1234 5678» y «+52 55 1234 5678» son el mismo celular. */
export function confirmacionCorrecta(actual: { phoneE164: string | null; email: string | null }, escrito: string | null | undefined): boolean {
  const con = confirmaCon(actual);
  if (con === null) return true;
  if (!escrito || !escrito.trim()) return false;
  if (con === 'PHONE') {
    const a = normalizePhoneMx(actual.phoneE164);
    return a !== null && normalizePhoneMx(escrito) === a;
  }
  const a = normalizeEmail(actual.email);
  return a !== null && normalizeEmail(escrito) === a;
}

/** Los últimos cuatro dígitos de un celular: lo único de un teléfono que va a la bitácora. */
export function ultimos4(phoneE164: string | null | undefined): string | null {
  const d = (phoneE164 ?? '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : null;
}

/** «•• •••• 5678»: el celular como lo ve el socio en «Tus datos». */
export function mascaraDeCelular(phoneE164: string | null | undefined): string | null {
  const u = ultimos4(phoneE164);
  return u ? `•• •••• ${u}` : null;
}

/** «ma•••@correo.mx»: las dos primeras letras y el dominio. */
export function mascaraDeCorreo(email: string | null | undefined): string | null {
  const e = (email ?? '').trim();
  const arroba = e.lastIndexOf('@');
  if (arroba < 1) return null;
  const local = e.slice(0, arroba);
  return `${local.slice(0, Math.min(2, Math.max(1, local.length - 1)))}•••${e.slice(arroba)}`;
}

/** Un dato de contacto dicho sin revelarlo: para la bitácora y para el aviso al propio socio. */
export function pistaDe(campo: ContactField, valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (campo === 'PHONE' || campo === 'EMERGENCY_PHONE') return ultimos4(valor);
  if (campo === 'EMAIL') return mascaraDeCorreo(valor);
  return null;
}
