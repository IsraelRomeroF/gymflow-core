import { describe, it, expect } from 'vitest';
import {
  PROSPECT_AUTO_CLOSE_CODE, PROSPECT_AUTO_CLOSE_DAYS, PROSPECT_AUTO_CLOSE_NOTICE_DAYS, codigosDeMotivo,
  prospectAutoCloseOn, prospectAutoCloseReason, prospectClosesItself, prospectClosesSoon,
} from '../src/index.js';
import { PLAZOS_DEL_INTERESADO } from '../src/plazos-del-socio.js';

/**
 * EL CIERRE SOLO DE UN INTERESADO (D-31, bloque 4.7): 60 días sin contacto ni
 * fecha pendiente, contados desde lo último que pasó con él. Sin base y sin
 * reloj: los días llegan como texto, ya en la zona de su sede.
 */
describe('interesados: cierre solo a los 60 días sin contacto (D-31)', () => {
  const base = { createdOn: '2026-01-10', lastContactOn: null, nextStepOn: null, reopenedOn: null };

  it('el plazo sale de la definición única de plazos, no de un número suelto', () => {
    expect(PROSPECT_AUTO_CLOSE_DAYS).toBe(PLAZOS_DEL_INTERESADO.autoCloseDays);
    expect(PROSPECT_AUTO_CLOSE_DAYS).toBe(60);
    expect(PROSPECT_AUTO_CLOSE_NOTICE_DAYS).toBe(PLAZOS_DEL_INTERESADO.autoCloseNoticeDays);
    expect(prospectAutoCloseReason()).toBe('60 días sin contacto');
  });

  it('nunca contactado: cuenta desde el día en que se registró', () => {
    expect(prospectAutoCloseOn(base)).toBe('2026-03-11');
  });

  it('contactado: cuenta desde su último contacto, aunque fuera «No contestó»', () => {
    expect(prospectAutoCloseOn({ ...base, lastContactOn: '2026-02-01' })).toBe('2026-04-02');
  });

  it('una fecha pendiente lo protege: cuenta desde el próximo paso', () => {
    expect(prospectAutoCloseOn({ ...base, lastContactOn: '2026-02-01', nextStepOn: '2026-06-15' })).toBe('2026-08-14');
    // Un próximo paso viejo que nadie atendió no gana a un contacto posterior.
    expect(prospectAutoCloseOn({ ...base, lastContactOn: '2026-02-01', nextStepOn: '2026-01-20' })).toBe('2026-04-02');
  });

  it('reabrirlo cuenta: no se vuelve a cerrar esa misma noche', () => {
    expect(prospectAutoCloseOn({ ...base, reopenedOn: '2026-05-01' })).toBe('2026-06-30');
  });

  it('se cierra el día 60, no el 59', () => {
    expect(prospectClosesItself(base, '2026-03-10', '2026-01-01')).toBe(false);
    expect(prospectClosesItself(base, '2026-03-11', '2026-01-01')).toBe(true);
    expect(prospectClosesItself(base, '2026-07-01', '2026-01-01')).toBe(true);
  });

  it('en un gimnasio donde el cierre solo aún no empieza, no se cierra nadie', () => {
    expect(prospectClosesItself(base, '2026-07-01', null)).toBe(false);
    expect(prospectClosesItself(base, '2026-07-01', '2026-07-02')).toBe(false);
    expect(prospectClosesItself(base, '2026-07-02', '2026-07-02')).toBe(true);
  });

  it('la fila avisa cuando faltan 7 días o menos', () => {
    expect(prospectClosesSoon('2026-03-11', '2026-03-03')).toBe(false);
    expect(prospectClosesSoon('2026-03-11', '2026-03-04')).toBe(true);
    expect(prospectClosesSoon('2026-03-11', '2026-04-01')).toBe(true);
  });

  it('el código del cierre solo no se puede elegir a mano', () => {
    expect(codigosDeMotivo('interesadoPerdido')).not.toContain(PROSPECT_AUTO_CLOSE_CODE);
    // La lista corta de D-31: precio, horario, le queda lejos, otro gimnasio y otro.
    expect(codigosDeMotivo('interesadoPerdido')).toEqual(expect.arrayContaining(['PRECIO', 'HORARIO', 'LE_QUEDA_LEJOS', 'OTRO_GIMNASIO', 'OTRO']));
  });
});
