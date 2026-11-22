import { describe, it, expect } from 'vitest';
import {
  ACCION_POR_SOLICITUD, CANAL_DE_CONSENTIMIENTO_SOCIO, CANAL_DE_SOLICITUD_ARCO, CONSECUENCIA_DE_RETIRAR, ESTADO_DE_SOLICITUD_ARCO,
  LISTA_DEL_AVISO_DE_PRIVACIDAD, PLAZOS_ARCO, PERMISSION_BY_KEY, REVOCABLES_EN_RECEPCION, REVOCABLES_POR_EL_SOCIO, ROLES,
  SOLICITUDES_DESDE_EL_PORTAL, TIPOS_DE_SOLICITUD_ARCO, TIPO_DE_SOLICITUD_ARCO, TIPO_DE_SOLICITUD_ARCO_PERSONAL, TIPO_DE_SOLICITUD_ARCO_SOCIO,
  corchetesSinCompletar, estadoDeSolicitud, faltantesDelAviso, folioDeSolicitud, modeloDeTexto, plazoVigente, puntosSinRevisar,
  solicitudVencida, textoDelMandato, venceHacerEfectiva, venceResponder, type FechasDeSolicitud,
} from '../src/index.js';
import {
  ConsentDocumentReview, MemberConsents, PrivacyInbox, PrivacyRequest, PrivacyRequestReceipt, PrivacyRequestsSummary, diferenciasConElContrato,
} from '../src/contracts/index.js';

const dia = (n: number) => new Date(Date.UTC(2026, 10, n, 18));
const base: FechasDeSolicitud = { identityVerifiedAt: dia(1), dueAt: dia(29), resolvedAt: null, outcome: null, effectiveDueAt: null, effectedAt: null };

describe('solicitudes ARCO: vocabulario', () => {
  it('cada tipo, canal y estado tiene su palabra en las dos voces', () => {
    for (const t of TIPOS_DE_SOLICITUD_ARCO) {
      expect(TIPO_DE_SOLICITUD_ARCO[t]!.personal.length).toBeGreaterThan(5);
      expect(TIPO_DE_SOLICITUD_ARCO_PERSONAL[t]).toBe(TIPO_DE_SOLICITUD_ARCO[t]!.personal);
      expect(TIPO_DE_SOLICITUD_ARCO_SOCIO[t]).toBe(TIPO_DE_SOLICITUD_ARCO[t]!.socio);
      expect(ACCION_POR_SOLICITUD[t].texto.length).toBeGreaterThan(10);
    }
    expect(Object.keys(CANAL_DE_SOLICITUD_ARCO).sort()).toEqual(['EMAIL', 'FRONT_DESK', 'PORTAL', 'WRITTEN']);
    expect(ESTADO_DE_SOLICITUD_ARCO.IDENTITY_PENDING.personal).toBe('Falta acreditar identidad');
    // El socio pide desde su teléfono lo que no exige a nadie en el mostrador.
    expect(SOLICITUDES_DESDE_EL_PORTAL).not.toContain('REVOCATION');
  });

  it('la descarga dice «desde tu teléfono» con el canal que la API escribe (SELF_SERVICE)', () => {
    expect(CANAL_DE_CONSENTIMIENTO_SOCIO.SELF_SERVICE).toBe('Firmado desde tu teléfono');
    expect(CANAL_DE_CONSENTIMIENTO_SOCIO.ASSISTED).toBe('Firmado en recepción');
    expect(CANAL_DE_CONSENTIMIENTO_SOCIO.SELF).toBeUndefined();
  });

  it('lo que se retira: lo opcional desde el teléfono; la biometría, en recepción; lo obligatorio, con la baja', () => {
    expect([...REVOCABLES_POR_EL_SOCIO].sort()).toEqual(['HEALTH_DATA', 'MARKETING', 'RECURRING_CHARGE']);
    expect(REVOCABLES_EN_RECEPCION).toContain('BIOMETRIC');
    expect(REVOCABLES_EN_RECEPCION).not.toContain('PRIVACY_NOTICE');
    for (const t of ['MARKETING', 'HEALTH_DATA', 'RECURRING_CHARGE', 'BIOMETRIC', 'PRIVACY_NOTICE', 'HOUSE_RULES']) {
      expect(CONSECUENCIA_DE_RETIRAR[t]!.socio.length, t).toBeGreaterThan(20);
    }
  });
});

describe('solicitudes ARCO: plazos y estado', () => {
  it('20 días hábiles para responder y 15 para hacerlo efectivo, guardados en naturales a favor del socio', () => {
    expect(PLAZOS_ARCO.responder).toEqual({ habiles: 20, naturales: 28 });
    expect(PLAZOS_ARCO.hacerEfectiva).toEqual({ habiles: 15, naturales: 21 });
    expect(venceResponder(dia(1)).toISOString()).toBe(dia(29).toISOString());
    expect(venceHacerEfectiva(dia(1)).toISOString()).toBe(dia(22).toISOString());
  });

  it('sin identidad acreditada el plazo no corre', () => {
    const r = { ...base, identityVerifiedAt: null };
    expect(estadoDeSolicitud(r)).toBe('IDENTITY_PENDING');
    expect(plazoVigente(r)).toBeNull();
    expect(solicitudVencida(r, dia(30))).toBe(false);
  });

  it('abierta: corre el plazo de respuesta y vence al pasarlo', () => {
    expect(estadoDeSolicitud(base)).toBe('OPEN');
    expect(plazoVigente(base)).toEqual(dia(29));
    expect(solicitudVencida(base, dia(28))).toBe(false);
    expect(solicitudVencida(base, dia(30))).toBe(true);
  });

  it('procede: corre el segundo plazo hasta que se hace efectiva', () => {
    const r = { ...base, resolvedAt: dia(5), outcome: 'GRANTED' as const, effectiveDueAt: dia(26) };
    expect(estadoDeSolicitud(r)).toBe('EFFECT_PENDING');
    expect(plazoVigente(r)).toEqual(dia(26));
    expect(solicitudVencida(r, dia(27))).toBe(true);
    expect(estadoDeSolicitud({ ...r, effectedAt: dia(6) })).toBe('CLOSED');
  });

  it('no procede, o una resuelta de antes del ciclo completo: cerrada y sin plazo', () => {
    expect(estadoDeSolicitud({ ...base, resolvedAt: dia(5), outcome: 'DENIED' })).toBe('CLOSED');
    expect(estadoDeSolicitud({ ...base, resolvedAt: dia(5), outcome: null })).toBe('CLOSED');
    expect(plazoVigente({ ...base, resolvedAt: dia(5), outcome: 'DENIED' })).toBeNull();
  });

  it('el folio de la constancia no dice quién es el socio', () => {
    expect(folioDeSolicitud('019a1b2c-3d4e-7f50-8a9b-0c1d2e4f2a9c', dia(19))).toBe('ARCO-2611-4F2A9C');
  });
});

describe('lista de verificación del aviso de privacidad (21-08)', () => {
  const gym = { razonSocial: 'Gimnasios del Centro, S.A. de C.V.', nombreComercial: 'Gimnasio Centro', sucursales: ['Centro', 'Norte'], mesesDeConservacion: 24 };

  it('el modelo del aviso trata todos los puntos de la lista', () => {
    const modelo = modeloDeTexto('PRIVACY_NOTICE', gym)!;
    expect(faltantesDelAviso(modelo.texto).map((p) => p.clave)).toEqual([]);
    // El plazo ARCO ya no es un corchete que cada gimnasio llena distinto.
    expect(modelo.texto).toContain('20 días hábiles');
    expect(modelo.texto).not.toContain('[PLAZO');
    expect(modelo.texto).toContain('24 meses');
  });

  it('un aviso de cuatro líneas no pasa: dice qué le falta', () => {
    const faltan = faltantesDelAviso('Aviso de privacidad. El gimnasio es responsable de tus datos. Puedes pedir acceso en recepción.').map((p) => p.clave);
    expect(faltan).toEqual(['responsable', 'datos', 'finalidades', 'transferencias', 'arco', 'conservacion', 'cambios']);
  });

  it('los corchetes sin completar se listan sin repetir', () => {
    const modelo = modeloDeTexto('PRIVACY_NOTICE', { ...gym, mesesDeConservacion: null })!;
    const corchetes = corchetesSinCompletar(modelo.texto);
    expect(corchetes).toContain('[DOMICILIO COMPLETO]');
    expect(corchetes).toContain('[MESES DE CONSERVACIÓN TRAS LA BAJA]');
    expect(corchetes.filter((c) => c === '[CORREO DE PRIVACIDAD]')).toHaveLength(1);
    expect(corchetesSinCompletar('Sin nada [entre minúsculas] que completar.')).toEqual([]);
  });

  it('la gerencia marca punto por punto: lo que no marcó se dice', () => {
    const todas = LISTA_DEL_AVISO_DE_PRIVACIDAD.map((p) => p.clave);
    expect(puntosSinRevisar(todas)).toEqual([]);
    expect(puntosSinRevisar(todas.slice(0, 5))).toEqual(['conservacion', 'cambios']);
    expect(puntosSinRevisar(null)).toHaveLength(7);
  });

  it('hay modelo para los seis tipos y el del mandato deja el monto al servidor', () => {
    for (const t of ['PRIVACY_NOTICE', 'HOUSE_RULES', 'BIOMETRIC', 'RECURRING_CHARGE', 'MARKETING', 'HEALTH_DATA']) expect(modeloDeTexto(t, gym), t).not.toBeNull();
    const firmado = textoDelMandato(modeloDeTexto('RECURRING_CHARGE', gym)!.texto, { plan: 'Mensual', importe: '$650.00', tarjeta: 'VISA terminación 4242', firmadoEl: '19 de noviembre de 2026' });
    expect(firmado).toContain('Plan: Mensual');
    expect(firmado).toContain('Importe de cada cargo: $650.00');
    expect(firmado).toContain('VISA terminación 4242');
  });
});

describe('permiso para registrar solicitudes (21-04)', () => {
  it('recepción y gerencia registran; la dueña y el coach no', () => {
    expect(PERMISSION_BY_KEY.has('members:privacy:request')).toBe(true);
    const tiene = (k: string) => (ROLES.find((r) => r.key === k)!.permissions as readonly string[]).includes('members:privacy:request');
    expect(tiene('RECEPTION')).toBe(true);
    expect(tiene('MANAGER')).toBe(true);
    expect(tiene('OWNER')).toBe(false);
    expect(tiene('COACH')).toBe(false);
  });
});

describe('contratos de privacidad', () => {
  const solicitud = {
    id: '019a1b2c-3d4e-7f50-8a9b-0c1d2e4f2a9c', folio: 'ARCO-2611-4F2A9C', memberId: '019a1b2c-3d4e-7f50-8a9b-0c1d2e4f2a9d', kind: 'OPPOSITION', channel: 'FRONT_DESK',
    consentType: 'MARKETING', note: 'Ya no quiere promociones', receivedAt: '2026-11-19T18:00:00.000Z', status: 'OPEN',
    identityVerifiedAt: '2026-11-19T18:00:00.000Z', identityNote: 'INE', dueAt: '2026-12-17T18:00:00.000Z', resolvedAt: null, outcome: null, resolution: null,
    effectiveDueAt: null, effectedAt: null, effectNote: null, deadlineAt: '2026-12-17T18:00:00.000Z', overdue: false,
  };

  it('una solicitud, la bandeja, el resumen y la constancia', () => {
    expect(diferenciasConElContrato(PrivacyRequest, solicitud)).toEqual([]);
    expect(diferenciasConElContrato(PrivacyInbox, { requests: [{ ...solicitud, member: { fullName: 'Ana Ruiz', memberCode: 'CEN-000123', homeBranchId: null } }] })).toEqual([]);
    expect(diferenciasConElContrato(PrivacyRequestsSummary, { open: 3, identityPending: 1, toAnswer: 1, toEffect: 1, overdue: 0, nextDeadlineAt: '2026-12-17T18:00:00.000Z' })).toEqual([]);
    expect(diferenciasConElContrato(PrivacyRequestReceipt, {
      folio: solicitud.folio, gym: { legalName: 'Gimnasios del Centro, S.A. de C.V.', tradeName: 'Gimnasio Centro' }, member: { fullName: 'Ana Ruiz', memberCode: 'CEN-000123' },
      request: solicitud, deadlines: { answerBusinessDays: 20, effectBusinessDays: 15 }, issuedAt: '2026-11-19T18:00:05.000Z',
    })).toEqual([]);
    expect(diferenciasConElContrato(PrivacyRequest, { ...solicitud, status: 'RESUELTA' })).not.toEqual([]);
  });

  it('las firmas de la ficha y la revisión de un texto', () => {
    expect(diferenciasConElContrato(MemberConsents, [{
      id: solicitud.id, consentType: 'BIOMETRIC', documentVersion: '2026-10', granted: true, grantedAt: '2026-10-09T18:00:00.000Z', revokedAt: null,
      channel: 'ASSISTED', ip: '127.0.0.1', evidenceHash: 'abc', needsResign: true, currentVersion: '2026-11', hasText: true,
    }])).toEqual([]);
    expect(diferenciasConElContrato(ConsentDocumentReview, {
      id: solicitud.id, consentType: 'PRIVACY_NOTICE', version: '2026-11', title: 'Aviso', bodyText: 'Texto',
      current: { id: solicitud.memberId, version: '2026-10', bodyText: 'Antes', publishedAt: '2026-10-01T18:00:00.000Z' },
      placeholders: ['[FECHA]'], checklist: [{ key: 'responsable', text: 'Dice quién es el responsable y su domicilio', found: false }], publishable: false,
    })).toEqual([]);
  });
});
