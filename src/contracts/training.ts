import { z } from 'zod';
import { Fecha, Id, Instante } from './comun.js';

/**
 * RUTINAS Y EL DÍA DEL COACH (auditoría 8, fase 2, bloque 2.6).
 *
 * Lo que devuelven las rutas de `training` que nacieron o cambiaron en el
 * bloque: la rutina completa, la que tiene un socio (con su revisión y su
 * avance de la semana), lo que ve el socio en su teléfono («Hoy toca») y el
 * inicio del coach.
 */

export const RoutineItem = z.object({
  exerciseId: Id,
  sets: z.number().int(),
  reps: z.string(),
  restSeconds: z.number().int().nullable(),
  notes: z.string().nullable(),
  exercise: z.object({ name: z.string(), muscleGroup: z.string(), equipment: z.string().nullable(), instructions: z.string().nullable() }),
});
export type RoutineItem = z.infer<typeof RoutineItem>;

/** Una rutina con sus días y ejercicios en orden. */
export const Routine = z.object({
  id: Id,
  name: z.string(),
  goal: z.string().nullable(),
  level: z.string().nullable(),
  notes: z.string().nullable(),
  updatedAt: Instante,
  archived: z.boolean(),
  /** Cuántos socios la tienen hoy: editarla les cambia la suya al instante (12-05). */
  activeMembers: z.number().int(),
  /** Copia personal de un socio («Personalizar para…»): no sale en el catálogo. `name` nulo si quien mira no ve a ese socio. */
  personalFor: z.object({ memberId: Id, name: z.string().nullable() }).nullable(),
  days: z.array(z.object({ name: z.string(), items: z.array(RoutineItem) })),
});
export type Routine = z.infer<typeof Routine>;

/** `GET /routines`: el catálogo del gimnasio (sin las copias personales ni las archivadas). */
export const RoutineList = z.object({
  routines: z.array(z.object({
    id: Id, name: z.string(), goal: z.string().nullable(), level: z.string().nullable(),
    days: z.number().int(), dayNames: z.array(z.string()), exercises: z.number().int(),
    activeMembers: z.number().int(), updatedAt: Instante,
  })),
});
export type RoutineList = z.infer<typeof RoutineList>;

/**
 * El avance del socio en su rutina.
 *  - `nextDay`: el día que toca (1..n): el siguiente al último que marcó; el 1 si nunca ha marcado.
 *  - `doneToday`: el día que marcó hoy, si marcó alguno (entonces «hoy toca» ya está hecho).
 *  - `doneThisWeek`: los días de la rutina marcados de lunes a domingo de esta semana, sin repetir.
 *  - `lastDone`: el último día marcado, con su fecha.
 */
export const RoutineProgress = z.object({
  today: Fecha,
  nextDay: z.number().int().positive(),
  doneToday: z.number().int().positive().nullable(),
  doneThisWeek: z.array(z.number().int().positive()),
  lastDone: z.object({ day: z.number().int().positive(), on: Fecha }).nullable(),
});
export type RoutineProgress = z.infer<typeof RoutineProgress>;

/** `GET /members/:id/routine`: la rutina que el socio tiene hoy, o ninguna. */
export const MemberRoutine = z.object({
  assignment: z.object({
    id: Id,
    assignedAt: Instante,
    assignedBy: z.string().nullable(),
    notes: z.string().nullable(),
    /** Cuándo toca revisarla («Revisar en»); nula en las asignadas antes de que existiera. */
    reviewOn: Fecha.nullable(),
    /** Ya llegó (o pasó) el día de revisarla. */
    reviewDue: z.boolean(),
    routine: Routine.nullable(),
    progress: RoutineProgress.nullable(),
  }).nullable(),
});
export type MemberRoutine = z.infer<typeof MemberRoutine>;

/** `POST /members/:id/routine`. */
export const RoutineAssigned = z.object({ assignmentId: Id, assignedAt: Instante, reviewOn: Fecha.nullable() });
export type RoutineAssigned = z.infer<typeof RoutineAssigned>;

/** `POST /members/:id/routine/personalize`: la copia personal que quedó asignada. */
export const RoutinePersonalized = z.object({ routineId: Id, assignmentId: Id, created: z.boolean() });
export type RoutinePersonalized = z.infer<typeof RoutinePersonalized>;

/** `GET /portal/routine`: la rutina del socio en su teléfono, con «Hoy toca». */
export const PortalRoutine = z.object({
  routine: Routine.nullable(),
  assignedAt: Instante.optional(),
  /** Su coach (el de su ficha); si no tiene, quien le asignó la rutina (12-12). */
  coach: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  reviewDue: z.boolean().optional(),
  progress: RoutineProgress.optional(),
});
export type PortalRoutine = z.infer<typeof PortalRoutine>;

/** `POST /portal/routine/done` y `/portal/routine/undo`: cómo quedó el avance. */
export const PortalRoutineProgress = z.object({ progress: RoutineProgress });
export type PortalRoutineProgress = z.infer<typeof PortalRoutineProgress>;

/** Un socio del coach en una de las listas de su inicio. */
export const CoachMember = z.object({
  id: Id,
  name: z.string(),
  memberCode: z.string(),
  /** La rutina que tiene hoy, si tiene. */
  routine: z.string().nullable(),
  reviewOn: Fecha.nullable(),
  /** Su última entrada al gimnasio (día de operación), o nula si nunca ha entrado. */
  lastVisitOn: Fecha.nullable(),
});
export type CoachMember = z.infer<typeof CoachMember>;

/**
 * `GET /coach/today`: el inicio del coach (12-04). Solo SUS socios y SUS
 * rutinas; nada de la afluencia del gimnasio. Las clases de hoy las pide el
 * panel a la API de clases.
 */
export const CoachToday = z.object({
  today: Fecha,
  members: z.object({
    total: z.number().int(),
    /** Sin rutina asignada. */
    withoutRoutine: z.array(CoachMember),
    /** Sin entrar al gimnasio en 7 días o más (o nunca). */
    away: z.array(CoachMember),
    /** Con la rutina por revisar: ya llegó su fecha. */
    toReview: z.array(CoachMember),
  }),
  /** Las rutinas que armó esta persona, las editadas más recientemente primero. */
  routines: z.array(z.object({
    id: Id, name: z.string(), goal: z.string().nullable(), level: z.string().nullable(),
    days: z.number().int(), activeMembers: z.number().int(), updatedAt: Instante,
  })),
});
export type CoachToday = z.infer<typeof CoachToday>;

/** `GET /coaches/:id/members`: cuántos socios tiene asignados un coach (para preguntar a quién pasan al darlo de baja). */
export const CoachLoad = z.object({ count: z.number().int() });
export type CoachLoad = z.infer<typeof CoachLoad>;
