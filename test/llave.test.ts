import { describe, it, expect } from 'vitest';
import {
  ALL_SECTIONS_UNLOCKED, LOCKABLE_SECTIONS, OPEN_BY_ROLE_SECTIONS, PERMISSIONS, ROLE_PERMISSIONS, SECTION_GROUP_NAMES, effectiveSections,
  isSectionOpen, normalizeUnlocked, onlyEffectiveSections, setSectionOpen,
} from '../src/index.js';

describe('la llave en pantalla sale del núcleo (17-14, 27-02)', () => {
  it('las abiertas por puesto son las de `defaultOpen` (antes `LLAVES_ABIERTAS` a mano en el panel)', () => {
    expect([...OPEN_BY_ROLE_SECTIONS].sort()).toEqual(['caja', 'pos']);
    expect([...OPEN_BY_ROLE_SECTIONS].sort()).toEqual(LOCKABLE_SECTIONS.filter((s) => s.defaultOpen).map((s) => s.key).sort());
  });

  it('«todo liberado» libera Dirección y Cumplimiento y no quita nada', () => {
    expect(ALL_SECTIONS_UNLOCKED.some((k) => k.startsWith('-'))).toBe(false);
    for (const s of LOCKABLE_SECTIONS) expect(isSectionOpen(s.key, ALL_SECTIONS_UNLOCKED), s.key).toBe(true);
    expect(normalizeUnlocked(ALL_SECTIONS_UNLOCKED)).toEqual([...ALL_SECTIONS_UNLOCKED]);
  });

  it('cada grupo tiene su nombre para el dueño', () => {
    for (const s of LOCKABLE_SECTIONS) expect(SECTION_GROUP_NAMES[s.group]).toBeTruthy();
    expect(Object.values(SECTION_GROUP_NAMES)).toEqual(['Operación', 'Dirección', 'Cumplimiento']);
  });
});

describe('abrir y cerrar una sección de la lista guardada', () => {
  it('una de Dirección se libera con su clave y se cierra quitándola', () => {
    const abierta = setSectionOpen('tablero', [], true);
    expect(abierta).toEqual(['tablero']);
    expect(isSectionOpen('tablero', abierta)).toBe(true);
    expect(setSectionOpen('tablero', abierta, false)).toEqual([]);
  });

  it('una de Operación se QUITA con `-clave` y se devuelve borrándola', () => {
    const sinCaja = setSectionOpen('caja', ['tablero'], false);
    expect(sinCaja).toEqual(['tablero', '-caja']);
    expect(isSectionOpen('caja', sinCaja)).toBe(false);
    expect(setSectionOpen('caja', sinCaja, true)).toEqual(['tablero']);
  });

  it('no repite claves y una clave que no es de la llave no cambia nada', () => {
    expect(setSectionOpen('tablero', ['tablero'], true)).toEqual(['tablero']);
    expect(setSectionOpen('caja', ['-caja'], false)).toEqual(['-caja']);
    expect(setSectionOpen('inventada', ['tablero'], true)).toEqual(['tablero']);
  });

  it('lo que produce siempre es una lista válida para la API', () => {
    let lista: string[] = [];
    for (const s of LOCKABLE_SECTIONS) {
      lista = setSectionOpen(s.key, lista, !s.defaultOpen);
      lista = setSectionOpen(s.key, lista, Boolean(s.defaultOpen));
      lista = setSectionOpen(s.key, lista, !s.defaultOpen);
    }
    expect(normalizeUnlocked(lista)).toEqual(lista);
    for (const s of LOCKABLE_SECTIONS) expect(isSectionOpen(s.key, lista), s.key).toBe(!s.defaultOpen);
  });
});

describe('las secciones con efecto para cada puesto (17-05)', () => {
  it('el puesto solo tiene efecto en lo que su pantalla le mostraría', () => {
    // Las mismas que `puestos` en el registro del panel (`modules/registro.test.ts` las compara).
    expect(effectiveSections('RECEPTION')).toEqual(['caja', 'pos', 'retencion', 'planes', 'consentimientos']);
    expect(effectiveSections('COACH')).toEqual(['planes']);
    // Fase 3 · 3.7 (D-25): la dueña lee los textos legales y firma el aviso, así que Textos de consentimiento también es suya.
    expect(effectiveSections('OWNER')).toEqual(['caja', 'tablero', 'movimientos', 'planes', 'personal', 'sucursales', 'modulos', 'bitacora', 'biometria', 'consentimientos']);
    expect(effectiveSections('MANAGER')).toEqual(LOCKABLE_SECTIONS.map((s) => s.key));
    expect(effectiveSections('NADIE')).toEqual([]);
  });

  it('la dueña consulta Sucursales y Módulos aunque no tenga el permiso de cambiarlos (D-23, D-25)', () => {
    expect(ROLE_PERMISSIONS.OWNER).not.toContain('settings:branch');
    expect(effectiveSections('OWNER')).toEqual(expect.arrayContaining(['sucursales', 'modulos']));
  });

  it('cada sección dice qué hace aparecer su pantalla, con permisos que existen', () => {
    const claves = new Set(PERMISSIONS.map((p) => p.key as string));
    for (const s of LOCKABLE_SECTIONS) {
      expect(s.menuPermissions.length, s.key).toBeGreaterThan(0);
      for (const p of s.menuPermissions) expect(claves.has(p), `${s.key}: ${p}`).toBe(true);
    }
  });

  it('al guardar, solo vale lo que tiene efecto: claves conocidas y sin repetir', () => {
    expect(onlyEffectiveSections(['tablero', 'retencion', 'retencion', '-caja', 'inventada', 'planes'], 'RECEPTION')).toEqual(['retencion', '-caja', 'planes']);
    expect(onlyEffectiveSections(['tablero', '-pos'], 'COACH')).toEqual([]);
    expect(onlyEffectiveSections(ALL_SECTIONS_UNLOCKED, 'MANAGER')).toEqual([...ALL_SECTIONS_UNLOCKED]);
  });
});
