import { describe, it, expect } from 'vitest';
import {
  arranqueDeLaBaja, bajaParaConservar, modeloDeTexto, rostroSeBorraEl, type BajaDelSocio, type DatosDeBajaParaConservar,
} from '../src/index.js';

/**
 * FASE 4 · BLOQUE 4.18 · P-01: la conservación cuenta también la baja
 * calculada de D-18, menos a quien sigue viniendo sin membresía; y su rostro
 * cuenta sus 30 días desde el arranque de la regla (arranque suave).
 */
const HOY = '2026-06-15';
const d = (o: Partial<DatosDeBajaParaConservar> & { baja: BajaDelSocio | null }): DatosDeBajaParaConservar => ({
  ultimaEntrada: null, paqueteVivo: false, churnDays: 30, today: HOY, ...o,
});
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('4.18 · la baja para la conservación (P-01)', () => {
  it('sin baja de D-18 no es baja', () => {
    expect(bajaParaConservar(d({ baja: null }))).toBeNull();
  });

  it('la del acto «Dar de baja» cuenta siempre, aunque haya venido ayer', () => {
    expect(bajaParaConservar(d({ baja: { cause: 'ARCHIVED', since: '2026-06-01', endedOn: null }, ultimaEntrada: '2026-06-14', paqueteVivo: true })))
      .toEqual({ cuenta: true, cause: 'ARCHIVED', since: '2026-06-01' });
  });

  it('la calculada cuenta desde su día si no ha vuelto a venir', () => {
    expect(bajaParaConservar(d({ baja: { cause: 'CANCELED', since: '2026-03-01', endedOn: null } })))
      .toEqual({ cuenta: true, cause: 'CANCELED', since: '2026-03-01' });
    // Una visita de antes de su baja no la mueve.
    expect(bajaParaConservar(d({ baja: { cause: 'EXPIRED', since: '2026-03-01', endedOn: '2026-01-30' }, ultimaEntrada: '2026-01-20' })))
      .toEqual({ cuenta: true, cause: 'EXPIRED', since: '2026-03-01' });
  });

  it('EXCEPCIÓN: con una entrada dentro del plazo de baja no cuenta; el día del plazo, sí', () => {
    const baja: BajaDelSocio = { cause: 'EXPIRED', since: '2026-03-01', endedOn: '2026-01-30' };
    // Vino hace 29 días: todavía lo protege; contará el día 30 después de esa visita.
    expect(bajaParaConservar(d({ baja, ultimaEntrada: '2026-05-17' })))
      .toEqual({ cuenta: false, cause: 'EXPIRED', porque: 'ENTRADA_RECIENTE', contaraDesde: '2026-06-16' });
    // Vino hace 30 días: ya cuenta, desde hoy (no desde su baja de marzo).
    expect(bajaParaConservar(d({ baja, ultimaEntrada: '2026-05-16' })))
      .toEqual({ cuenta: true, cause: 'EXPIRED', since: '2026-06-15' });
    // El plazo es el del gimnasio.
    expect(bajaParaConservar(d({ baja, ultimaEntrada: '2026-05-16', churnDays: 45 })))
      .toEqual({ cuenta: false, cause: 'EXPIRED', porque: 'ENTRADA_RECIENTE', contaraDesde: '2026-06-30' });
  });

  it('EXCEPCIÓN: con un paquete de visitas vivo no cuenta, venga o no', () => {
    expect(bajaParaConservar(d({ baja: { cause: 'CANCELED', since: '2025-01-01', endedOn: null }, paqueteVivo: true })))
      .toEqual({ cuenta: false, cause: 'CANCELED', porque: 'PAQUETE_VIVO', contaraDesde: null });
  });

  it('ARRANQUE SUAVE: cada baja con su arranque; la calculada anterior al arranque cuenta 30 días desde él', () => {
    const arranques = { ficha: dia('2026-01-10'), calculada: dia('2026-06-15') };
    expect(arranqueDeLaBaja('ARCHIVED', arranques)).toEqual(dia('2026-01-10'));
    expect(arranqueDeLaBaja('EXPIRED', arranques)).toEqual(dia('2026-06-15'));
    // Baja calculada de marzo: su rostro no se va la primera noche, sino el 15 de julio.
    expect(rostroSeBorraEl(dia('2026-03-01'), arranqueDeLaBaja('EXPIRED', arranques))).toEqual(dia('2026-07-15'));
    // Una baja calculada posterior al arranque cuenta desde su día.
    expect(rostroSeBorraEl(dia('2026-06-20'), arranqueDeLaBaja('CANCELED', arranques))).toEqual(dia('2026-07-20'));
  });

  it('el aviso modelo dice qué es baja, con el plazo del gimnasio, y qué pasa con el rostro', () => {
    const g = { razonSocial: 'Gimnasio de Prueba, S.A. de C.V.', nombreComercial: 'Gimnasio Prueba', sucursales: ['Norte'], mesesDeConservacion: 24 };
    const de30 = modeloDeTexto('PRIVACY_NOTICE', g)!.texto;
    expect(de30).toContain('o 30 días después de que tu membresía termine sin que la renueves');
    expect(de30).toContain('se cuenta 30 días después de tu última visita');
    expect(de30).toContain('su plantilla se borra a los 30 días de tu baja si no regresas');
    expect(modeloDeTexto('PRIVACY_NOTICE', { ...g, diasDeBaja: 45 })!.texto).toContain('o 45 días después de que tu membresía termine');
    expect(modeloDeTexto('BIOMETRIC', g)!.texto).toContain('la plantilla se borra a los 30 días de mi baja');
  });
});
