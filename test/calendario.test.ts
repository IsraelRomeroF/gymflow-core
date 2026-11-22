import { describe, it, expect } from 'vitest';
import {
  ZONAS_DE_MEXICO, businessDateIn, diasEntre, esFechaDeCalendario, hoyEn, inicioDeMes, inicioDelMesSiguiente, isoDate, masDias, mesTerminado, ultimoDia, zonaDe,
} from '../src/index.js';

describe('calendario: hoy en la zona del gimnasio (13-12, 26-06)', () => {
  it('cuenta igual que el servidor al escribir (`businessDateIn`)', () => {
    const casos = ['2026-11-19T05:59:00.000Z', '2026-11-19T06:00:00.000Z', '2026-03-08T09:59:00.000Z', '2026-12-31T23:30:00.000Z'];
    for (const iso of casos) {
      for (const [zona] of ZONAS_DE_MEXICO) {
        expect(hoyEn(zona, new Date(iso)), `${zona} ${iso}`).toBe(isoDate(businessDateIn(zona, new Date(iso))));
      }
    }
  });

  it('a las 23:30 de CDMX sigue siendo hoy aunque en UTC ya sea mañana', () => {
    // 2026-11-19 23:30 en CDMX (UTC-6) = 2026-11-20 05:30 UTC.
    expect(hoyEn('America/Mexico_City', new Date('2026-11-20T05:30:00.000Z'))).toBe('2026-11-19');
    expect(hoyEn('America/Tijuana', new Date('2026-11-20T05:30:00.000Z'))).toBe('2026-11-19');
    expect(hoyEn('America/Cancun', new Date('2026-11-20T05:30:00.000Z'))).toBe('2026-11-20');
  });

  it('la frontera con horario de verano cambia de día a su hora, no a la de CDMX', () => {
    // 1 de julio, 23:30 en Tijuana (UTC-7 en verano) = 06:30 UTC del día 2.
    expect(hoyEn('America/Tijuana', new Date('2026-07-02T06:30:00.000Z'))).toBe('2026-07-01');
  });
});

describe('calendario: días sin moverse de zona', () => {
  it('suma y resta días cruzando meses, años y bisiestos', () => {
    expect(masDias('2026-01-31', 1)).toBe('2026-02-01');
    expect(masDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(masDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(masDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(masDias('2026-11-19', 0)).toBe('2026-11-19');
    // Con hora, toma su fecha.
    expect(masDias('2026-11-19T23:59:00.000Z', 1)).toBe('2026-11-20');
    expect(() => masDias('19/11/2026', 1)).toThrow(RangeError);
  });

  it('el último día cubierto es el anterior al fin semiabierto', () => {
    // «Mensualidad · 19 nov – 19 dic»: el 19 de diciembre ya no está pagado.
    expect(ultimoDia('2026-12-19')).toBe('2026-12-18');
    expect(ultimoDia('2026-03-01')).toBe('2026-02-28');
    expect(ultimoDia('2026-12-19T00:00:00.000Z')).toBe('2026-12-18');
  });

  it('días entre dos fechas', () => {
    expect(diasEntre('2026-11-01', '2026-12-01')).toBe(30);
    expect(diasEntre('2026-12-01', '2026-11-01')).toBe(-30);
    expect(diasEntre('2026-11-19', '2026-11-19')).toBe(0);
    expect(diasEntre('2028-02-01', '2028-03-01')).toBe(29);
  });

  it('inicio del mes y del siguiente (el fin semiabierto de un mes)', () => {
    expect(inicioDeMes('2026-11-19')).toBe('2026-11-01');
    expect(inicioDelMesSiguiente('2026-11-19')).toBe('2026-12-01');
    expect(inicioDelMesSiguiente('2026-12-31')).toBe('2027-01-01');
  });

  it('reconoce una fecha de calendario y rechaza días que no existen', () => {
    expect(esFechaDeCalendario('2026-02-28')).toBe(true);
    expect(esFechaDeCalendario('2026-02-29')).toBe(false);
    expect(esFechaDeCalendario('2028-02-29')).toBe(true);
    expect(esFechaDeCalendario('2026-13-01')).toBe(false);
    expect(esFechaDeCalendario('2026-11-19T00:00:00Z')).toBe(false);
  });
});

describe('calendario: la zona de una sucursal', () => {
  it('la suya o, si no tiene, la del gimnasio', () => {
    const gimnasio = { timezone: 'America/Mexico_City' };
    expect(zonaDe({ timezone: 'America/Tijuana' }, gimnasio)).toBe('America/Tijuana');
    expect(zonaDe({ timezone: null }, gimnasio)).toBe('America/Mexico_City');
    expect(zonaDe(null, gimnasio)).toBe('America/Mexico_City');
  });

  it('las zonas de México son zonas reales del sistema', () => {
    for (const [zona, nombre] of ZONAS_DE_MEXICO) {
      expect(() => new Intl.DateTimeFormat('es-MX', { timeZone: zona })).not.toThrow();
      expect(nombre.length).toBeGreaterThan(3);
    }
  });
});

describe('calendario: el mes terminó en todas las sedes (13-12, 14-04; bloque 1.9)', () => {
  it('se cierra cuando el día 1 siguiente llegó en CADA sede', () => {
    expect(mesTerminado('2026-10', ['2026-11-01'])).toBe(true);
    expect(mesTerminado('2026-10', ['2026-11-19', '2026-11-19'])).toBe(true);
    // En la Ciudad de México ya es 1 de noviembre; en Tijuana todavía 31 de octubre.
    expect(mesTerminado('2026-10', ['2026-11-01', '2026-10-31'])).toBe(false);
    expect(mesTerminado('2026-10', ['2026-10-31'])).toBe(false);
    expect(mesTerminado('2026-12', ['2027-01-01'])).toBe(true);
    expect(mesTerminado('2099-01', ['2026-11-19'])).toBe(false);
  });

  it('cuenta con la fecha del gimnasio, no con el reloj: a las 23:30 del 31 en CDMX, octubre sigue abierto', () => {
    const instante = new Date('2026-11-01T05:30:00.000Z'); // 23:30 del 31 de octubre en la Ciudad de México
    const gimnasio = { timezone: 'America/Mexico_City' };
    const sedes = [{ timezone: null }, { timezone: 'America/Tijuana' }];
    expect(mesTerminado('2026-10', sedes.map((s) => hoyEn(zonaDe(s, gimnasio), instante)))).toBe(false);
    const yaEsDia1 = new Date('2026-11-01T08:00:00.000Z'); // 00:00 en Tijuana, 02:00 en CDMX
    expect(mesTerminado('2026-10', sedes.map((s) => hoyEn(zonaDe(s, gimnasio), yaEsDia1)))).toBe(true);
  });

  it('sin sedes no se sabe y no se cierra; un mes mal escrito revienta', () => {
    expect(mesTerminado('2026-10', [])).toBe(false);
    expect(() => mesTerminado('2026-13', ['2027-01-01'])).toThrow(RangeError);
    expect(() => mesTerminado('octubre', ['2027-01-01'])).toThrow(RangeError);
  });
});
