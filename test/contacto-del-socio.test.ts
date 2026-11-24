import { describe, it, expect } from 'vitest';
import {
  CONTACT_CHANGE_LIMITS, CONTACT_FIELDS, auditPhrase, confirmaCon, confirmacionCorrecta, limiteDe, mascaraDeCelular, mascaraDeCorreo, pistaDe, ultimos4,
} from '../src/index.js';
import { MemberContactChanges, PortalContact } from '../src/contracts/index.js';

/** Fase 4 · bloque 4.8 (D-36): las reglas sin base de datos del cambio de contacto desde el portal. */
describe('el socio cambia su contacto desde el portal (4.8)', () => {
  it('el socio cambia cuatro datos y cada uno tiene su tope', () => {
    expect([...CONTACT_FIELDS]).toEqual(['PHONE', 'EMAIL', 'EMERGENCY_NAME', 'EMERGENCY_PHONE']);
    expect(CONTACT_FIELDS.map(limiteDe)).toEqual(['PHONE', 'EMAIL', 'EMERGENCY', 'EMERGENCY']);
    // El celular es con lo que el gimnasio reconoce al socio: su tope no es más holgado que el del contacto de emergencia.
    expect(CONTACT_CHANGE_LIMITS.PHONE).toBeLessThanOrEqual(CONTACT_CHANGE_LIMITS.EMERGENCY);
  });

  it('se confirma con el celular actual; sin celular, con el correo; sin ninguno, no hay qué pedir', () => {
    expect(confirmaCon({ phoneE164: '+525512345678', email: 'ana@correo.mx' })).toBe('PHONE');
    expect(confirmaCon({ phoneE164: null, email: 'ana@correo.mx' })).toBe('EMAIL');
    expect(confirmaCon({ phoneE164: null, email: null })).toBeNull();
  });

  it('la confirmación compara normalizado y no acepta vacío ni otro número', () => {
    const actual = { phoneE164: '+525512345678', email: 'ana@correo.mx' };
    for (const escrito of ['5512345678', '55 1234 5678', '+52 55 1234 5678', '(55) 1234-5678']) expect(confirmacionCorrecta(actual, escrito), escrito).toBe(true);
    for (const escrito of ['', '   ', null, undefined, '5512345679', '5678', 'ana@correo.mx']) expect(confirmacionCorrecta(actual, escrito), String(escrito)).toBe(false);
    const soloCorreo = { phoneE164: null, email: 'ana@correo.mx' };
    expect(confirmacionCorrecta(soloCorreo, ' ANA@correo.mx ')).toBe(true);
    expect(confirmacionCorrecta(soloCorreo, 'ana@correo.com')).toBe(false);
    // Sin celular ni correo no hay nada que confirmar.
    expect(confirmacionCorrecta({ phoneE164: null, email: null }, undefined)).toBe(true);
  });

  it('la pantalla y la bitácora solo dicen la terminación del celular y el correo a medias', () => {
    expect(ultimos4('+525512345678')).toBe('5678');
    expect(mascaraDeCelular('+525512345678')).toBe('•• •••• 5678');
    expect(mascaraDeCelular(null)).toBeNull();
    expect(mascaraDeCorreo('mariana@correo.mx')).toBe('ma•••@correo.mx');
    expect(mascaraDeCorreo('a@correo.mx')).toBe('a•••@correo.mx');
    expect(mascaraDeCorreo('ab@correo.mx')).toBe('a•••@correo.mx');
    expect(mascaraDeCorreo('sin-arroba')).toBeNull();
    expect(pistaDe('PHONE', '+525512345678')).toBe('5678');
    expect(pistaDe('EMERGENCY_PHONE', '+525512345678')).toBe('5678');
    expect(pistaDe('EMAIL', 'mariana@correo.mx')).toBe('ma•••@correo.mx');
    // El nombre del contacto de emergencia es el nombre de una persona: no va a la bitácora ni a medias.
    expect(pistaDe('EMERGENCY_NAME', 'Rosa Luna')).toBeNull();
  });

  it('la bitácora dice «el socio actualizó» y que el mostrador lo confirmó', () => {
    expect(`El socio ${auditPhrase({ action: 'member.contact.self_update' }, { member: 'Ana López' })}`).toBe('El socio actualizó desde el portal los datos de contacto de Ana López');
    expect(auditPhrase({ action: 'member.contact.review' }, { member: 'Ana López' })).toBe('confirmó con Ana López el cambio de contacto que hizo desde el portal');
  });

  it('los contratos aceptan lo que la API manda', () => {
    const limite = { max: 3, left: 2, nextAt: null };
    expect(PortalContact.safeParse({
      hasPhone: true, phoneMasked: '•• •••• 5678', hasEmail: false, emailMasked: null, emergencyContactName: null, emergencyContactPhone: null,
      sharedPhone: false, responsibleKind: null, confirmWith: 'PHONE', windowDays: 30,
      limits: { phone: limite, email: limite, emergency: { max: 10, left: 0, nextAt: '2026-12-01T18:00:00.000Z' } }, lastIdentityChangeAt: null,
    }).success).toBe(true);
    expect(MemberContactChanges.safeParse({
      hidden: false, pending: 1,
      changes: [{ id: '0193aaaa-7c1a-7000-8000-000000000001', field: 'PHONE', oldValue: '+525512345678', newValue: '+525587654321', sharedPhone: false, responsibleKind: null, at: '2026-11-24T18:00:00.000Z', reviewedAt: null, reviewedByName: null }],
    }).success).toBe(true);
  });
});
