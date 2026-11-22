/**
 * Credencial del socio.
 *
 * El QR rotativo del Sprint 8 se retiró con ADR-032: el acceso es por rostro
 * y huella, con recepción como vía alterna. Aquí queda lo que sigue en pie
 * mientras las credenciales PIN y RFID no se retiren también.
 *
 * `QR` sigue siendo un valor válido del tipo porque `access_decisions` es
 * append-only (ADR-027): hay historial escrito con él y tiene que poder leerse.
 * Lo que ya no existe es la forma de emitirlo ni de validarlo.
 */

export type CredentialKindValue = 'QR' | 'RFID' | 'PIN' | 'FINGERPRINT' | 'FACE' | 'MANUAL';

// ── PIN ─────────────────────────────────────────────────────────────────────

/**
 * PIN de respaldo.
 *
 * Cuatro dígitos serían adivinables en un torniquete sin límite de intentos;
 * seis con bloqueo por intentos es el equilibrio entre seguridad y algo que
 * una persona recuerde de memoria.
 */
export const PIN_LENGTH = 6;

export function isValidPinFormat(pin: string): boolean {
  if (!new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin)) return false;
  // Un PIN de un solo dígito repetido o una secuencia no es un secreto.
  if (/^(\d)\1+$/.test(pin)) return false;
  const ascendente = '0123456789012345';
  const descendente = '9876543210987654';
  return !ascendente.includes(pin) && !descendente.includes(pin);
}
