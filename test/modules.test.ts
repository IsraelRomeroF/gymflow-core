import { describe, it, expect } from 'vitest';
import {
  MODULES, MODULE_BY_KEY, MODULE_GROUPS, MODULE_TEMPLATES, templateState, PERMISSIONS, ROLE_PERMISSIONS, PERMISSION_BY_KEY,
  effectiveModules, effectiveModulesAt, canDisableAtBranch, isModuleEnabled, dependentsOf, changeModule, moduleOfPermission,
  type ModuleKey,
} from '../src/index.js';

const opcionales = MODULES.filter((m) => m.kind === 'optional');
const fijos = MODULES.filter((m) => m.kind === 'fixed');

describe('catálogo de módulos', () => {
  it('las claves son únicas y los requisitos existen', () => {
    expect(new Set(MODULES.map((m) => m.key)).size).toBe(MODULES.length);
    for (const m of MODULES) for (const r of m.requires) expect(MODULE_BY_KEY.has(r), `${m.key} requiere ${r}`).toBe(true);
  });

  it('las dependencias no forman círculos', () => {
    const baja = (key: string, camino: string[]): void => {
      expect(camino, `círculo: ${[...camino, key].join(' → ')}`).not.toContain(key);
      for (const r of MODULE_BY_KEY.get(key)!.requires) baja(r, [...camino, key]);
    };
    for (const m of MODULES) baja(m.key, []);
  });

  it('lo fijo no depende de lo opcional: nunca se podría quedar sin su requisito', () => {
    for (const m of fijos) for (const r of m.requires) expect(MODULE_BY_KEY.get(r)!.kind, `${m.key} → ${r}`).toBe('fixed');
  });

  it('todo permiso pertenece a un módulo que existe', () => {
    for (const p of PERMISSIONS) expect(MODULE_BY_KEY.has(p.module), `${p.key} → ${p.module}`).toBe(true);
    expect(moduleOfPermission('classes:read')).toBe('classes');
    expect(moduleOfPermission('members:intake:read')).toBe('intake');
    expect(moduleOfPermission('no:existe')).toBeUndefined();
  });

  it('todo módulo dice para qué sirve, quién lo usa y qué pantallas trae', () => {
    for (const m of MODULES) {
      expect(m.name.length, m.key).toBeGreaterThan(2);
      expect(m.description.endsWith('.'), m.key).toBe(true);
      expect(m.usedBy.length, m.key).toBeGreaterThan(2);
      expect(m.screens.length, m.key).toBeGreaterThan(0);
      // Los opcionales van en un grupo de la pantalla; lo fijo, aparte.
      expect(m.group === null, m.key).toBe(m.kind === 'fixed');
      if (m.group) expect(Object.keys(MODULE_GROUPS)).toContain(m.group);
    }
  });
});

describe('módulos activos de un gimnasio', () => {
  it('un gimnasio que no eligió nada tiene todo, salvo lo que nace apagado', () => {
    const activos = effectiveModules({});
    for (const m of MODULES) expect(activos.has(m.key as ModuleKey), m.key).toBe(m.defaultEnabled || m.kind === 'fixed');
    expect(isModuleEnabled('turnstile', {})).toBe(false);
  });

  it('lo fijo no se apaga aunque alguien lo escriba a mano', () => {
    const activos = effectiveModules({ core: false });
    expect(activos.has('core')).toBe(true);
    expect(changeModule('core', false, {})).toMatchObject({ ok: false, code: 'FIXED' });
  });

  it('sin Caja no hay Punto de venta: apagar Caja exige apagar antes la tienda', () => {
    expect(isModuleEnabled('pos', { cash: false })).toBe(false);
    expect(dependentsOf('cash', {})).toEqual(['pos']);
    expect(changeModule('cash', false, {})).toMatchObject({ ok: false, code: 'HAS_DEPENDENTS', dependents: ['pos'] });
    expect(changeModule('cash', false, { pos: false }).ok).toBe(true);
  });

  it('una sucursal apaga lo suyo sin tocar al gimnasio, y arrastra lo que depende', () => {
    // El gimnasio tiene todo; la sede Norte no da clases ni tiene caja.
    const norte = effectiveModulesAt({}, ['classes', 'cash']);
    expect(norte.has('classes')).toBe(false);
    expect(norte.has('cash')).toBe(false);
    expect(norte.has('pos'), 'sin Caja en la sede, su tienda tampoco').toBe(false);
    expect(norte.has('prospects')).toBe(true);
    // Lo que es de todo el gimnasio no se apaga por sede; lo fijo tampoco.
    expect(effectiveModulesAt({}, ['training', 'core']).has('training')).toBe(true);
    expect(canDisableAtBranch('classes')).toBe(true);
    expect(canDisableAtBranch('training')).toBe(false);
    expect(canDisableAtBranch('core')).toBe(false);
    // Una sede no enciende lo que el gimnasio tiene apagado.
    expect(effectiveModulesAt({ classes: false }, []).has('classes')).toBe(false);
  });

  it('apagar y volver a encender deja el gimnasio como estaba', () => {
    const apagado = changeModule('classes', false, {});
    expect(apagado.ok).toBe(true);
    if (!apagado.ok) return;
    expect(isModuleEnabled('classes', apagado.state)).toBe(false);
    const encendido = changeModule('classes', true, apagado.state);
    expect(encendido).toMatchObject({ ok: true, alsoEnabled: [] });
    if (encendido.ok) expect(effectiveModules(encendido.state)).toEqual(effectiveModules({}));
  });

  it('las dependencias entre opcionales se respetan en los dos sentidos', () => {
    // El catálogo de hoy no tiene ninguna entre opcionales; la regla se
    // prueba con cada par que exista, para que valga el día que nazca una.
    for (const m of opcionales) for (const r of m.requires) {
      if (MODULE_BY_KEY.get(r)!.kind === 'fixed') continue;
      expect(isModuleEnabled(m.key, { [r]: false }), `${m.key} sin ${r}`).toBe(false);
      expect(changeModule(r, false, {}), `apagar ${r}`).toMatchObject({ ok: false, code: 'HAS_DEPENDENTS' });
      expect(changeModule(m.key, true, { [r]: false, [m.key]: false })).toMatchObject({ ok: true, alsoEnabled: [r] });
    }
  });

  it('una clave que no está en el catálogo no se guarda', () => {
    expect(changeModule('inventado', true, {})).toMatchObject({ ok: false, code: 'UNKNOWN' });
  });

  it('apagar cualquier módulo opcional no le quita a ningún rol sus permisos de lo fijo', () => {
    for (const m of opcionales) {
      const activos = effectiveModules({ [m.key]: false }) as ReadonlySet<string>;
      for (const [rol, permisos] of Object.entries(ROLE_PERMISSIONS)) {
        const fijosDelRol = permisos.filter((p) => MODULE_BY_KEY.get(PERMISSION_BY_KEY.get(p)!.module)!.kind === 'fixed');
        const quedan = permisos.filter((p) => activos.has(PERMISSION_BY_KEY.get(p)!.module));
        for (const p of fijosDelRol) expect(quedan, `${rol} pierde ${p} al apagar ${m.key}`).toContain(p);
      }
    }
  });
});

describe('plantillas de arranque', () => {
  it('cada plantilla apaga solo módulos opcionales que existen y deja todo lo fijo', () => {
    for (const t of MODULE_TEMPLATES) {
      const estado = templateState(t.key);
      const activos = effectiveModules(estado);
      for (const k of t.off) expect(MODULE_BY_KEY.get(k)?.kind, `${t.key} apaga ${k}`).toBe('optional');
      for (const m of MODULES) if (m.kind === 'fixed') expect(activos.has(m.key as ModuleKey), `${t.key} sin ${m.key}`).toBe(true);
      // Lo que la plantilla no apaga y depende de algo apagado queda apagado por arrastre, sin error.
      for (const k of t.off) expect(activos.has(k), `${t.key}: ${k} debería estar apagado`).toBe(false);
    }
    expect(() => templateState('inventada')).toThrow();
    expect(effectiveModules(templateState('cadena')).size).toBe(effectiveModules({}).size);
  });
});
