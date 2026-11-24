/**
 * CONTRATOS DE LA API (auditoría 8: 28-11, 27-09, 1-18, 2-13, 5-21, 6-17, 8-19).
 *
 * Lo que devuelve cada ruta, escrito UNA vez como esquema Zod. Panel y portal
 * importan los TIPOS (`import type { Dashboard } from '@gymflow/core/contracts'`,
 * sin costo en el navegador); la API usará los esquemas como `schema.response`
 * y en sus pruebas (`diferenciasConElContrato`). Si la API cambia un campo, el
 * panel deja de compilar en vez de romperse en pantalla.
 *
 * Mismo nombre para el esquema y su tipo: `Dashboard` es el valor (Zod) y
 * `Dashboard` el tipo (`z.infer`).
 */
export * from './comun.js';
export * from './enums.js';
export * from './lista.js';
export * from './session.js';
export * from './organization.js';
export * from './datos-y-marca.js';
export * from './catalog.js';
export * from './reports.js';
export * from './inicio.js';
export * from './members.js';
export * from './access.js';
export * from './biometrics.js';
export * from './billing.js';
export * from './dinero-del-socio.js';
export * from './cash.js';
export * from './pos.js';
export * from './ficha.js';
export * from './classes.js';
export * from './portal.js';
export * from './contacto.js';
export * from './captacion.js';
export * from './retention.js';
export * from './plazos.js';
export * from './outbound.js';
export * from './privacy.js';
export * from './approvals.js';
export * from './platform.js';
export * from './training.js';
export * from './verificar.js';
