import { describe, it, expect } from 'vitest';
import {
  PROSPECT_OUTCOMES, closesProspect, deriveStage, dueOn, prospectQueue, intakeFolio, looksLikeFolio,
  onboardingSteps, nextOnboardingStep, DEFAULT_PROSPECT_SOURCES, REFERRAL_SOURCE,
} from '../src/captacion.js';
import { FOLLOW_UP_OUTCOMES, MEMBER_OUTCOMES } from '../src/retention.js';
import { GRUPO_DE_INTERESADOS, INSIGNIA_DE_ALTA, PASO_DEL_ALTA, TIPO_DE_PERSONA, RESULTADO_DE_CONTACTO } from '../src/vocabulario.js';
import { INTAKE_FLAGS, IdentityCheck, Prospect, ProspectPending } from '../src/contracts/index.js';
import { IDENTITY_KINDS, ONBOARDING_STEPS, PROSPECT_QUEUES } from '../src/captacion.js';

/** Captación (auditoría 8, bloque 2.4): la etapa se deriva, la bandeja tiene tres grupos y el alta se cierra por el estado del socio. */
describe('etapa derivada de los contactos (10-05)', () => {
  const c = (channel: string, outcome: string) => ({ channel, outcome });

  it('sin contactos, o si nunca contestó, sigue «Nuevo»', () => {
    expect(deriveStage([])).toBe('NEW');
    expect(deriveStage([c('CALL', 'NO_ANSWER'), c('WHATSAPP', 'NO_ANSWER')])).toBe('NEW');
  });

  it('cualquier contacto contestado lo pasa a «Contactado», también mandarle el alta digital', () => {
    expect(deriveStage([c('CALL', 'ANSWERED')])).toBe('CONTACTED');
    expect(deriveStage([c('WHATSAPP', 'INTERESTED')])).toBe('CONTACTED');
    expect(deriveStage([c('WHATSAPP', 'INTAKE_SENT')])).toBe('CONTACTED');
  });

  it('hablar en persona es «Visitó» y venir a probar es «En prueba»', () => {
    expect(deriveStage([c('VISIT', 'INTERESTED')])).toBe('VISITED');
    expect(deriveStage([c('VISIT', 'TRIAL_VISIT')])).toBe('TRIAL');
    // «Vino a probar» manda aunque se haya anotado por otro canal.
    expect(deriveStage([c('OTHER', 'TRIAL_VISIT')])).toBe('TRIAL');
  });

  it('no retrocede: quien visitó y luego no contesta sigue en «Visitó» (por eso reabrir conserva la etapa, 10-09)', () => {
    expect(deriveStage([c('VISIT', 'ANSWERED'), c('CALL', 'NO_ANSWER')])).toBe('VISITED');
    expect(deriveStage([c('CALL', 'NO_ANSWER'), c('VISIT', 'TRIAL_VISIT'), c('CALL', 'ANSWERED')])).toBe('TRIAL');
    // Un «No le interesa» anterior no borra lo avanzado.
    expect(deriveStage([c('VISIT', 'INTERESTED'), c('CALL', 'NOT_INTERESTED')])).toBe('VISITED');
  });

  it('los resultados de un interesado son del catálogo común, y solo «No le interesa» lo cierra', () => {
    for (const o of PROSPECT_OUTCOMES) expect(FOLLOW_UP_OUTCOMES).toContain(o);
    expect(PROSPECT_OUTCOMES.filter(closesProspect)).toEqual(['NOT_INTERESTED']);
    // «Vino a probar» y «Se le mandó el alta» no se ofrecen para un socio en riesgo.
    expect(MEMBER_OUTCOMES as readonly string[]).not.toContain('TRIAL_VISIT');
    expect(MEMBER_OUTCOMES as readonly string[]).not.toContain('INTAKE_SENT');
    for (const o of PROSPECT_OUTCOMES) expect(RESULTADO_DE_CONTACTO[o], o).toBeTruthy();
  });
});

describe('bandeja de interesados (10-16)', () => {
  const hoy = '2026-11-21';

  it('desde cuándo toca: el próximo paso; si fue contactado y no lo tiene, el día del contacto; si no, nunca', () => {
    expect(dueOn({ nextStepOn: '2026-11-25', lastContactOn: '2026-11-20' })).toBe('2026-11-25');
    expect(dueOn({ nextStepOn: null, lastContactOn: '2026-11-20' })).toBe('2026-11-20');
    expect(dueOn({ nextStepOn: null, lastContactOn: null })).toBeNull();
  });

  it('tres grupos: toca hoy (o ya pasó), sin contactar y esperando', () => {
    expect(prospectQueue(null, hoy)).toBe('UNCONTACTED');
    expect(prospectQueue(hoy, hoy)).toBe('TODAY');
    expect(prospectQueue('2026-11-01', hoy)).toBe('TODAY');
    expect(prospectQueue('2026-11-22', hoy)).toBe('WAITING');
  });

  it('el contactado sin próximo paso toca hoy: nadie se queda sin que alguien lo vea', () => {
    expect(prospectQueue(dueOn({ nextStepOn: null, lastContactOn: '2026-11-10' }), hoy)).toBe('TODAY');
  });

  it('cada grupo, insignia, tipo de persona y paso tiene su palabra', () => {
    for (const g of PROSPECT_QUEUES) expect(GRUPO_DE_INTERESADOS[g]?.titulo, g).toBeTruthy();
    for (const f of INTAKE_FLAGS) expect(INSIGNIA_DE_ALTA[f]?.label, f).toBeTruthy();
    for (const k of IDENTITY_KINDS) expect(TIPO_DE_PERSONA[k], k).toBeTruthy();
    for (const p of ONBOARDING_STEPS) expect(PASO_DEL_ALTA[p]?.porHacer, p).toBeTruthy();
    expect(Object.keys(GRUPO_DE_INTERESADOS).sort()).toEqual([...PROSPECT_QUEUES].sort());
    expect(Object.keys(INSIGNIA_DE_ALTA).sort()).toEqual([...INTAKE_FLAGS].sort());
  });

  it('las fuentes de fábrica traen la que pide «¿quién lo recomendó?»', () => {
    expect(DEFAULT_PROSPECT_SOURCES).toContain(REFERRAL_SOURCE);
    expect(new Set(DEFAULT_PROSPECT_SOURCES).size).toBe(DEFAULT_PROSPECT_SOURCES.length);
  });
});

describe('folio del alta digital (9-06)', () => {
  it('son los últimos 6 del id, en mayúsculas y sin guiones', () => {
    expect(intakeFolio('019aa5f0-1c2d-7e3f-8a4b-5c6d7e8f9a0b')).toBe('8F9A0B');
    // Sin guiones aunque el corte caiga sobre uno.
    expect(intakeFolio('019aa5f0-1c2d-7e3f-8a4b5c6d-7e8f')).toBe('6D7E8F');
  });

  it('el buscador reconoce un folio escrito a mano', () => {
    expect(looksLikeFolio('8f9a0b')).toBe(true);
    expect(looksLikeFolio(' 8F9A0B ')).toBe(true);
    expect(looksLikeFolio('Gómez')).toBe(false);
    expect(looksLikeFolio('5512345678')).toBe(false);
  });
});

describe('pasos para terminar un alta, por el estado del socio (9-01, 9-17)', () => {
  const base = { hasMembership: false, owesCents: 0, portalActive: false, biometricsOn: true, enrolled: false, missingFields: [] as string[] };
  const claves = (s: typeof base) => onboardingSteps(s).map((p) => `${p.key}${p.done ? '✓' : ''}`);

  it('socio recién aprobado: vender, portal y rostro; lo primero es vender', () => {
    expect(claves(base)).toEqual(['SELL', 'PORTAL', 'FACE']);
    expect(nextOnboardingStep(onboardingSteps(base))?.key).toBe('SELL');
  });

  it('exsocio vinculado que ya tiene plan: no se le ofrece vender otra', () => {
    const pasos = onboardingSteps({ ...base, hasMembership: true });
    expect(pasos[0]).toEqual({ key: 'SELL', done: true, optional: false });
    expect(nextOnboardingStep(pasos)?.key).toBe('PORTAL');
  });

  it('con plan y adeudo, lo que sigue es cobrar', () => {
    expect(claves({ ...base, hasMembership: true, owesCents: 65000n as unknown as number })).toEqual(['SELL✓', 'COLLECT', 'PORTAL', 'FACE']);
    // Deber sin membresía no inventa un cobro: primero se vende.
    expect(claves({ ...base, owesCents: 100 })).toEqual(['SELL', 'PORTAL', 'FACE']);
  });

  it('sin biometría en la sede no existe el paso del rostro; con datos vacíos aparece «completar»', () => {
    expect(claves({ ...base, biometricsOn: false, missingFields: ['birthDate'] })).toEqual(['SELL', 'PORTAL', 'DATA']);
    // Y sin portal del socio en el gimnasio, tampoco el del código.
    expect(onboardingSteps({ ...base, portalOn: false }).map((p) => p.key)).toEqual(['SELL', 'FACE']);
  });

  it('con todo hecho no falta nada', () => {
    const pasos = onboardingSteps({ ...base, hasMembership: true, portalActive: true, enrolled: true });
    expect(nextOnboardingStep(pasos)).toBeNull();
    expect(pasos.every((p) => p.done)).toBe(true);
  });
});

describe('contratos de captación (2.4)', () => {
  const contacto = { id: '019aa5f0-1c2d-7e3f-8a4b-5c6d7e8f9a0b', channel: 'VISIT', outcome: 'TRIAL_VISIT', note: null, nextStepOn: '2026-11-25', createdAt: '2026-11-21T18:00:00.000Z', createdByName: 'Paola' };

  it('un interesado viaja con su grupo, su próximo paso y por qué se cerró', () => {
    const r = Prospect.safeParse({
      id: contacto.id, firstName: 'Ana', lastName: 'López', phoneE164: '+525512345678', email: null, source: 'Recomendación', status: 'TRIAL',
      branchId: contacto.id, assignedToUserId: null, convertedMemberId: null, notes: null,
      createdAt: contacto.createdAt, updatedAt: contacto.createdAt, lastFollowUp: contacto, followUps: 1,
      nextStepOn: '2026-11-25', dueOn: '2026-11-25', queue: 'WAITING', referredByMemberId: null, referredByName: 'Juan Pérez',
      lostReasonCode: null, lostReason: null, closedAt: null,
    });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });

  it('el pendiente del Inicio tiene la forma común de los pendientes de módulo', () => {
    expect(ProspectPending.safeParse({ clave: 'prospects', cuantos: 6, masAntiguo: contacto.createdAt, href: '/prospectos', tono: 'warn', today: 2, uncontacted: 4 }).success).toBe(true);
    expect(ProspectPending.safeParse({ clave: 'prospects', cuantos: 0, masAntiguo: null, href: '/prospectos', tono: 'neutral', today: 0, uncontacted: 0 }).success).toBe(true);
  });

  it('el buscador de identidad dice qué es cada persona y si solo comparte celular', () => {
    const r = IdentityCheck.safeParse({
      candidates: [], blocking: false,
      people: [
        { kind: 'PROSPECT', id: null, fullName: 'Ana López', memberCode: null, phoneE164: null, status: 'CONTACTED', branchId: contacto.id, score: 95, explanation: 'Teléfono y nombre idénticos', sharedPhone: false },
        { kind: 'MEMBER', id: contacto.id, fullName: 'Rosa López', memberCode: 'CEN-00033', phoneE164: '+525512345678', status: 'ACTIVE', branchId: contacto.id, score: 70, explanation: 'Mismo teléfono pero nombres distintos (posible teléfono familiar)', sharedPhone: true },
      ],
    });
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });
});
