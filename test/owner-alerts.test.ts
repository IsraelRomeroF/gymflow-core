import { describe, it, expect } from 'vitest';
import {
  OWNER_ALERT_CATALOG, OWNER_ALERT_KINDS, OWNER_ALERTS_ALWAYS, OWNER_ALERTS_IN_LIST, esperanFirma, rangoDeSemana, semanaDelResumen, textoDeAviso, textoDelResumen,
  type WeeklyFigures,
} from '../src/owner-alerts.js';
import { OwnerAlerts, WeeklyFigures as WeeklyFiguresContract } from '../src/contracts/owner-alerts.js';

const CDMX = 'America/Mexico_City';
const TIJUANA = 'America/Tijuana';

const cifras = (cambios: Partial<WeeklyFigures> = {}): WeeklyFigures => ({
  entries: { total: 1240, previous: 1180 },
  members: { joined: 12, left: 3 },
  money: {
    collectedCents: '8430000', previousCollectedCents: '7900000', outstandingCents: '1250000', overdueCents: '400000',
    refunds: { count: 2, cents: '-90000' }, discounts: 4, backdatedSales: 1, lostDebtCents: '0',
  },
  cash: { variances: 2, shortCents: '15000', overCents: '0', pendingReview: 1 },
  signatures: { requested: 9, approved: 7, rejected: 1 },
  awaiting: { approvals: 1, privacyNotice: 1, exMembersList: 1 },
  exceptions: { manualEntries: 14, overLimit: 1, withoutFace: 3, sharedPhoneChanges: 0 },
  audit: { intact: true, checked: 5000 },
  ...cambios,
});

describe('avisos a la dueña (D-05)', () => {
  it('el catálogo tiene una ficha por tipo, sin repetir nombres', () => {
    expect(Object.keys(OWNER_ALERT_CATALOG).sort()).toEqual([...OWNER_ALERT_KINDS].sort());
    const nombres = OWNER_ALERT_KINDS.map((k) => OWNER_ALERT_CATALOG[k].label);
    expect(new Set(nombres).size).toBe(nombres.length);
    for (const k of OWNER_ALERT_KINDS) expect(OWNER_ALERT_CATALOG[k].description.length).toBeGreaterThan(10);
  });

  it('lo que ya avisaba otro módulo no entra a la lista de este bloque (no se manda dos veces)', () => {
    expect(OWNER_ALERT_KINDS).not.toContain('GYMFLOW_ACCOUNT');
    expect(OWNER_ALERTS_ALWAYS.map((a) => a.label)).toEqual(['Solicitudes de firma', 'Tu cuenta con GymFlow']);
    expect(OWNER_ALERTS_IN_LIST).not.toContain('EXMEMBERS_LIST');
    expect(OWNER_ALERTS_IN_LIST).not.toContain('PASSWORD_FAILS');
    expect(OWNER_ALERTS_IN_LIST).toContain('CASH_VARIANCE');
    expect(OWNER_ALERTS_IN_LIST).toContain('WEEKLY_SUMMARY');
  });

  it('los textos dicen dónde y cuánto', () => {
    expect(textoDeAviso({ kind: 'CASH_VARIANCE', registerName: 'Caja 1', branchName: 'Centro', varianceCents: '-15000' }))
      .toEqual({ title: 'Corte con faltante', body: 'El corte de Caja 1 (Centro) cerró con un faltante de $150.00. Queda por revisar.', url: '/avisos' });
    expect(textoDeAviso({ kind: 'CASH_VARIANCE', registerName: 'Caja 1', branchName: null, varianceCents: '4000' }).body).toContain('un sobrante de $40.00');
    expect(textoDeAviso({ kind: 'CASH_UNCLOSED', registerName: 'Caja 2', branchName: 'Norte', businessDate: '2026-06-09' }).body).toBe('Caja 2 (Norte) sigue abierta desde el 9 de junio: nadie hizo el corte.');
    expect(textoDeAviso({ kind: 'ENTRY_EXCEPTIONS_OVER_LIMIT', branchName: 'Centro', count: 6, limit: 5 }).body).toContain('6 veces hoy; su tope es 5');
    expect(textoDeAviso({ kind: 'PRIVACY_REQUEST_DUE', daysLeft: 1 }).body).toContain('queda 1 día');
    expect(textoDeAviso({ kind: 'PRIVACY_REQUEST_DUE', daysLeft: 0 }).body).toContain('vence hoy');
    expect(textoDeAviso({ kind: 'PRIVACY_REQUEST_DUE', daysLeft: -2 }).body).toContain('ya pasó del plazo');
    expect(textoDeAviso({ kind: 'DEBT_LOST', amountCents: '250000', members: 3 }).body).toContain('$2,500.00 de 3 socios');
    expect(textoDeAviso({ kind: 'NOTICE_SIGNATURE_PENDING', version: '4' }).url).toBe('/consentimientos');
  });

  it('el lunes a las 7:00 del gimnasio toca la semana anterior, de lunes a domingo', () => {
    // Lunes 8 de junio de 2026, 7:00 en Ciudad de México = 13:00 UTC.
    const s = semanaDelResumen(CDMX, new Date('2026-06-08T13:00:00.000Z'));
    expect(s).toMatchObject({ monday: '2026-06-08', from: '2026-06-01', to: '2026-06-08' });
    expect(s.dueAt.toISOString()).toBe('2026-06-08T13:00:00.000Z');
  });

  it('el lunes a las 6:59 todavía toca el de la semana pasada', () => {
    const s = semanaDelResumen(CDMX, new Date('2026-06-08T12:59:00.000Z'));
    expect(s).toMatchObject({ monday: '2026-06-01', from: '2026-05-25', to: '2026-06-01' });
  });

  it('el domingo por la noche (ya lunes en UTC) sigue siendo la semana del lunes anterior', () => {
    // Domingo 7 de junio 20:00 en Ciudad de México = lunes 8, 02:00 UTC.
    expect(semanaDelResumen(CDMX, new Date('2026-06-08T02:00:00.000Z')).monday).toBe('2026-06-01');
  });

  it('cada gimnasio con su hora: a las 13:30 UTC ya son las 7 en el centro y todavía no en Tijuana', () => {
    const instante = new Date('2026-06-08T13:30:00.000Z');
    expect(semanaDelResumen(CDMX, instante).monday).toBe('2026-06-08');
    expect(semanaDelResumen(TIJUANA, instante).monday).toBe('2026-06-01');
    // Tijuana en junio va 7 horas detrás de UTC: sus 7:00 son las 14:00 UTC.
    expect(semanaDelResumen(TIJUANA, new Date('2026-06-08T14:00:00.000Z')).dueAt.toISOString()).toBe('2026-06-08T14:00:00.000Z');
  });

  it('un jueves toca el del lunes de esa semana (la computadora apagada el lunes lo manda al encender)', () => {
    expect(semanaDelResumen(CDMX, new Date('2026-06-11T18:00:00.000Z')).monday).toBe('2026-06-08');
  });

  it('el rango se dice corto dentro del mes y completo entre dos meses', () => {
    expect(rangoDeSemana('2026-06-01', '2026-06-07')).toBe('1 al 7 de junio');
    expect(rangoDeSemana('2026-06-29', '2026-07-05')).toBe('29 de junio al 5 de julio');
  });

  it('el resumen dice la semana en cifras, sin nombres', () => {
    const t = textoDelResumen({ from: '2026-06-01', to: '2026-06-08' }, cifras());
    expect(t.title).toBe('Tu semana (1 al 7 de junio)');
    expect(t.body).toBe('1,240 entradas · 12 altas y 3 bajas · cobrado $84,300.00 · por cobrar $12,500.00 · 2 cortes con diferencia · 9 firmas pedidas · 3 cosas esperan tu firma.');
    expect(t.url).toBe('/avisos');
  });

  it('una semana quieta también se dice, y la bitácora rota se grita', () => {
    const quieta = cifras({
      entries: { total: 1, previous: 0 }, members: { joined: 1, left: 1 }, cash: { variances: 0, shortCents: '0', overCents: '0', pendingReview: 0 },
      signatures: { requested: 1, approved: 1, rejected: 0 }, awaiting: { approvals: 0, privacyNotice: 0, exMembersList: 0 }, audit: { intact: false, checked: 10 },
    });
    expect(esperanFirma(quieta)).toBe(0);
    const t = textoDelResumen({ from: '2026-06-01', to: '2026-06-08' }, quieta);
    expect(t.body).toContain('1 entrada · 1 alta y 1 baja');
    expect(t.body).toContain('cortes sin diferencia · 1 firma pedida');
    expect(t.body).not.toContain('tu firma');
    expect(t.body).toContain('la bitácora NO verifica');
  });

  it('las cifras cumplen el contrato, y la respuesta vacía de quien no es dueña también', () => {
    expect(WeeklyFiguresContract.safeParse(cifras()).success).toBe(true);
    expect(OwnerAlerts.safeParse({ visible: false, pushConfigured: false, devices: 0, unseen: 0, alerts: [], summaries: [], nextSummaryAt: null, preferences: [], always: [] }).success).toBe(true);
  });
});
