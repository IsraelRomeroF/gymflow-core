import { describe, expect, it } from 'vitest';
import { isMinor, validateIntake, type IntakeDraft } from '../src/intake.js';
import { INSIGNIA_DE_ALTA } from '../src/vocabulario.js';
import { INTAKE_FLAGS, MemberSharedPhone } from '../src/contracts/captacion.js';
import { matchIdentity } from '../src/identity.js';

/** Fase 3 · bloque 3.4 · Altas: menores con tutor (D-10) y celular compartido (D-09). */
const HOY = new Date('2026-11-23T00:00:00.000Z');
const base: IntakeDraft = {
  firstName: 'Renata', lastName: 'Prueba Uno', phone: '5512345678', email: null, birthDate: null,
  emergencyContactName: null, emergencyContactPhone: null, memberSince: null, healthNotes: null,
};
const campos = (d: IntakeDraft) => validateIntake(d, HOY).map((e) => e.field);

describe('D-10 · menores de 15 a 17 en el alta por QR', () => {
  it('es menor hasta el día en que cumple 18', () => {
    expect(isMinor(new Date('2008-11-24'), HOY)).toBe(true);
    expect(isMinor(new Date('2008-11-23'), HOY)).toBe(false);
    expect(isMinor(null, HOY)).toBe(false);
  });

  it('quien dice no tener 18 tiene que dar su fecha de nacimiento', () => {
    expect(campos({ ...base, adult: false })).toEqual(['birthDate']);
    expect(campos({ ...base, adult: true })).toEqual([]);
    expect(campos(base)).toEqual([]);
  });

  it('de 15 a 17 años pide el nombre y el celular del tutor', () => {
    const menor = { ...base, adult: false, birthDate: new Date('2010-05-02') };
    expect(campos(menor)).toEqual(['guardianName', 'guardianPhone']);
    expect(campos({ ...menor, guardianName: 'Mariana Prueba', guardianPhone: '123' })).toEqual(['guardianPhone']);
    expect(campos({ ...menor, guardianName: 'Mariana Prueba', guardianPhone: '5587654321' })).toEqual([]);
  });

  it('la fecha manda aunque diga que es mayor, y un adulto no necesita tutor', () => {
    expect(campos({ ...base, adult: true, birthDate: new Date('2010-05-02') })).toEqual(['guardianName', 'guardianPhone']);
    expect(campos({ ...base, adult: false, birthDate: new Date('1990-05-02') })).toEqual([]);
  });

  it('menos de 15 sigue sin poder inscribirse en línea, y no se le pide tutor', () => {
    expect(campos({ ...base, adult: false, birthDate: new Date('2013-05-02') })).toEqual(['birthDate']);
  });

  it('la insignia «Falta su tutor» existe en el contrato y en el vocabulario', () => {
    expect(INTAKE_FLAGS).toContain('NEEDS_GUARDIAN');
    expect(INSIGNIA_DE_ALTA.NEEDS_GUARDIAN?.label).toBe('Falta su tutor');
    for (const f of INTAKE_FLAGS) expect(INSIGNIA_DE_ALTA[f], f).toBeDefined();
  });
});

describe('D-09 · el celular solo nunca une a dos personas', () => {
  const mama = { id: 'a', firstName: 'Mariana', lastName: 'Prueba Uno', phoneE164: '+525512345678' };
  it('mismo celular y otro nombre: se avisa, no se fusiona', () => {
    const m = matchIdentity({ id: 'n', firstName: 'Renata', lastName: 'Prueba Uno', phoneE164: '+525512345678' }, mama);
    expect(m.method).toBe('PHONE');
    expect(m.action).toBe('REVIEW');
    expect(m.score).toBeLessThan(90);
  });
  it('mismo celular y mismo nombre: es la misma persona', () => {
    expect(matchIdentity({ ...mama, id: 'n' }, mama).action).toBe('AUTO_MERGE');
  });
  it('el contrato de «comparte celular» acepta a un adulto que no es socio', () => {
    expect(MemberSharedPhone.safeParse({
      hidden: false, missingResponsible: false,
      sharedWith: [{ id: '018f0000-0000-7000-8000-000000000001', fullName: 'Mariana Prueba Uno', memberCode: 'CEN-00001', status: 'ACTIVE' }],
      responsible: { kind: 'ADULT', memberId: null, memberCode: null, name: 'Abuela Prueba', phoneE164: null, guardianSignedAt: null },
    }).success).toBe(true);
  });
});
