/**
 * Catálogo de planes: qué hace coherente a un plan.
 *
 * La base ya lo impide con CHECKs, pero una violación de CHECK llega al
 * usuario como un error 500 sin explicación. Estas reglas son las mismas,
 * dichas antes y en palabras de quien arma el catálogo.
 */

export type PlanBillingModel = 'RECURRING' | 'PREPAID_PERIOD' | 'VISIT_PACK' | 'DAY_PASS';
export type PlanDurationUnit = 'DAY' | 'WEEK' | 'MONTH' | 'VISIT';

export type PlanDraft = {
  readonly code: string;
  readonly name: string;
  readonly billingModel: PlanBillingModel;
  readonly durationUnit: PlanDurationUnit;
  readonly durationValue: number;
  readonly priceCents: bigint;
  readonly signupFeeCents: bigint;
  readonly taxRateBps: number | null;
  readonly visitsIncluded: number | null;
  readonly visitValidityDays: number | null;
  readonly defaultGraceDays: number;
  readonly allowFreeze: boolean;
  readonly maxFreezeDaysPerYear: number;
  readonly minFreezeDays: number;
};

export type PlanIssue = { readonly field: keyof PlanDraft; readonly message: string };

/**
 * Todos los problemas de un plan, no el primero: quien arma el catálogo
 * corrige el formulario en una pasada.
 */
export function planIssues(p: PlanDraft): PlanIssue[] {
  const xs: PlanIssue[] = [];
  const add = (field: keyof PlanDraft, message: string) => xs.push({ field, message });

  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(p.code)) {
    add('code', 'El código son de 2 a 20 letras mayúsculas, números, guion o guion bajo');
  }
  if (p.name.trim().length < 3) add('name', 'El nombre necesita al menos 3 caracteres');
  if (!Number.isInteger(p.durationValue) || p.durationValue <= 0) add('durationValue', 'La duración debe ser un entero mayor que cero');
  if (p.priceCents < 0n) add('priceCents', 'El precio no puede ser negativo');
  if (p.signupFeeCents < 0n) add('signupFeeCents', 'La inscripción no puede ser negativa');
  if (p.taxRateBps !== null && (p.taxRateBps < 0 || p.taxRateBps > 10_000)) {
    add('taxRateBps', 'La tasa de impuesto va de 0% a 100%');
  }

  // Un paquete se mide en visitas; todo lo demás, en tiempo. Mezclarlos es
  // lo que produce un "mensual de 10 visitas" que nadie sabe cobrar.
  if (p.billingModel === 'VISIT_PACK') {
    if (p.durationUnit !== 'VISIT') add('durationUnit', 'Un paquete de visitas se mide en visitas');
    if (p.visitsIncluded === null || p.visitsIncluded <= 0) add('visitsIncluded', 'Indica cuántas visitas incluye el paquete');
    if (p.visitValidityDays !== null && p.visitValidityDays <= 0) add('visitValidityDays', 'La vigencia del paquete debe ser mayor que cero');
  } else {
    if (p.durationUnit === 'VISIT') add('durationUnit', 'Solo los paquetes de visitas se miden en visitas');
  }
  if (p.billingModel === 'DAY_PASS' && p.durationUnit !== 'DAY') {
    add('durationUnit', 'Una visita suelta dura días');
  }

  if (!Number.isInteger(p.defaultGraceDays) || p.defaultGraceDays < 0 || p.defaultGraceDays > 60) {
    add('defaultGraceDays', 'La gracia va de 0 a 60 días');
  }
  if (p.allowFreeze && p.maxFreezeDaysPerYear < p.minFreezeDays) {
    add('maxFreezeDaysPerYear', 'El máximo de congelamiento al año no puede ser menor que el mínimo por solicitud');
  }
  return xs;
}
