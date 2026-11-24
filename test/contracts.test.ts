import { describe, it, expect } from 'vitest';
import {
  AccessAttemptPreview, AccessAttemptResult, AccessException, AccessSummaryResponse, CollectAndOpenResult, DayPassSaleResult, MemberDayPasses, OpenCashSessionsLite, BiometricEnrollmentList, Centavos, CloseCashSessionResult, Dashboard,
  ErrorDeLaApi, FaceAccessResult, Fecha, Instante, MemberDetail, MemberListPage, MemberMemberships, MemberSearchResponse,
  MemberStatement, MonthlyClose, MonthlyCloseList, MonthlyClosePreview, OrganizationModules, PaymentReceipt, PendingTemplateDeletions, PortalStatement, PosSale, ProductList, Pulse,
  IntakeList, InventoryMovementList, PortalMe, ProspectList, StatementChargesPage, StatementPaymentsPage,
  RecordPaymentResult, RetentionAlert, RetentionAlerts, RetentionSummary, FollowUpContact, FollowUpLatest, SessionEnded, SessionMe, Setup, Shift, ShiftReport, diferenciasConElContrato,
} from '../src/contracts/index.js';
import { SESSION_END_REASONS, TEXTO_DE_FIN_DE_SESION, isSessionEndReason } from '../src/vocabulario.js';
import { MODULES, ROLE_PERMISSIONS } from '../src/index.js';

const ID = (n: number) => `0193${String(n).padStart(4, '0')}-7c1a-7000-8000-${String(n).padStart(12, '0')}`;
const AHORA = '2026-11-19T18:20:00.000Z';

describe('piezas comunes', () => {
  it('el dinero viaja como centavos enteros en texto, con signo', () => {
    expect(Centavos.safeParse('125050').success).toBe(true);
    expect(Centavos.safeParse('-15000').success).toBe(true);
    expect(Centavos.safeParse('12.50').success).toBe(false);
    expect(Centavos.safeParse(1250).success).toBe(false);
  });

  it('un instante es ISO con zona y una fecha de calendario no lleva hora', () => {
    expect(Instante.safeParse(AHORA).success).toBe(true);
    expect(Instante.safeParse('2026-11-19').success).toBe(false);
    expect(Fecha.safeParse('2026-11-19').success).toBe(true);
    expect(Fecha.safeParse(AHORA).success).toBe(false);
  });

  it('el cuerpo de error: `error`, `message` y `requestId` siempre; lo demás según el caso', () => {
    expect(ErrorDeLaApi.safeParse({ error: 'VALIDATION', message: 'Datos de entrada inválidos', requestId: 'abc12345', issues: [{ path: 'amountCents', message: 'Requerido' }] }).success).toBe(true);
    expect(ErrorDeLaApi.safeParse({ error: 'FORBIDDEN', message: 'Operación no permitida', detail: 'Este turno lo abrió otra persona', requestId: 'abc12345' }).success).toBe(true);
    expect(ErrorDeLaApi.safeParse({ error: 'RATE_LIMITED', message: 'Espera', retryAfterSeconds: 60, requestId: 'abc12345' }).success).toBe(true);
    expect(ErrorDeLaApi.safeParse({ message: 'sin código' }).success).toBe(false);
  });
});

describe('por qué terminó una sesión (1.12)', () => {
  it('el 401 de sesión trae un motivo de la lista y cada motivo tiene su texto', () => {
    expect(SESSION_END_REASONS).toHaveLength(18);
    for (const r of SESSION_END_REASONS) expect(TEXTO_DE_FIN_DE_SESION[r], r).toBeTruthy();
    // Viaja sin Zod: el panel lo usa en el navegador.
    expect(Object.keys(TEXTO_DE_FIN_DE_SESION).sort()).toEqual([...SESSION_END_REASONS].sort());
    expect(SessionEnded.safeParse({ error: 'UNAUTHENTICATED', message: TEXTO_DE_FIN_DE_SESION.SESSION_IDLE, reason: 'SESSION_IDLE', requestId: 'abc12345' }).success).toBe(true);
  });

  it('un 401 de credenciales (sin motivo de sesión) no saca a nadie al login', () => {
    expect(isSessionEndReason('SESSION_EXPIRED')).toBe(true);
    expect(isSessionEndReason('PLATFORM_ACCOUNT')).toBe(true);
    expect(isSessionEndReason(undefined)).toBe(false);
    expect(isSessionEndReason('BAD_PASSWORD')).toBe(false);
    expect(SessionEnded.safeParse({ error: 'UNAUTHENTICATED', message: 'La contraseña actual no es correcta', requestId: 'abc12345' }).success).toBe(false);
  });
});

describe('diferencias con el contrato', () => {
  it('detecta lo que falta, el tipo equivocado y lo que sobra, con su ruta', () => {
    const d = diferenciasConElContrato(FaceAccessResult, { reconocido: false, motivo: 'No se detectó ningún rostro.', sinRostro: true, extra: 1 });
    expect(d).toEqual([{ ruta: 'extra', problema: 'la respuesta lo trae y el contrato no lo declara' }]);
    const turno = { ...turnoAbierto(), countAttempts: '0', nuevo: true };
    const d2 = diferenciasConElContrato(ShiftReport, { ...corte(), session: turno });
    expect(d2.map((x) => x.ruta)).toEqual(['session.countAttempts', 'session.nuevo']);
  });

  it('recorre listas, uniones y registros', () => {
    const me = { ...sesion(), disabledByBranch: { [ID(2)]: ['classes'] }, roleKeys: ['MANAGER'], otro: 'x' };
    expect(diferenciasConElContrato(SessionMe, me).map((x) => x.ruta)).toEqual(['otro']);
    const pulso = { ...pulse(), staff: [{ ...pulse().staff[0], secreto: 'x' }] };
    expect(diferenciasConElContrato(Pulse, pulso).map((x) => x.ruta)).toEqual(['staff.0.secreto']);
    expect(diferenciasConElContrato(MemberMemberships, [{ ...membresia(), planName: 'Mensual' }]).map((x) => x.ruta)).toEqual(['0.planName']);
  });

  it('una respuesta que cumple no tiene diferencias', () => {
    expect(diferenciasConElContrato(Dashboard, tablero())).toEqual([]);
    expect(diferenciasConElContrato(MemberStatement, estadoDeCuenta())).toEqual([]);
  });
});

describe('cada contrato acepta una respuesta real de su ruta', () => {
  const casos: Array<[string, { safeParse: (v: unknown) => { success: boolean } }, unknown]> = [
    ['GET /auth/me', SessionMe, sesion()],
    ['GET /organization/setup', Setup, {
      complete: false, required: 4, requiredDone: 2, canAct: true,
      steps: [{ key: 'textos', required: true, done: false, href: '/consentimientos', permission: 'settings:consent:manage', title: 'Publicar el Aviso de privacidad y el Reglamento', text: 'Sin ellos no se puede dar de alta a nadie.', canAct: true }],
    }],
    ['GET /organization/modules', OrganizationModules, modulos()],
    ['GET /dashboard', Dashboard, tablero()],
    ['GET /reports/pulse', Pulse, pulse()],
    ['GET /reports/monthly-closes', MonthlyCloseList, { closes: [cierre()], pending: ['2026-09', '2026-10'] }],
    ['POST /reports/monthly-close', MonthlyClose, { ...cierre(), approvedByUserId: null, approvedByName: null }],
    ['GET /reports/monthly-close/preview', MonthlyClosePreview, {
      month: '2026-10', closable: false,
      blockers: [{ code: 'ALREADY_CLOSED', message: 'Ese mes ya está cerrado' }],
      warnings: [{ code: 'NO_FIXED_EXPENSES', message: 'No hay gastos fijos registrados en ese mes' }],
      closed: cierre(), totals: cierre().totals, byBranch: cierre().byBranch,
      businessDates: { organization: '2026-11-19', byBranch: [{ branchId: ID(2), date: '2026-11-19' }] },
      openCashSessions: [{ id: ID(6), branchId: ID(2), registerCode: 'C1', openedAt: AHORA }],
      fixedExpensesCount: 2,
      signature: 'approver',
    }],
    ['GET /me/shift', Shift, {
      asOf: AHORA, canSeeCash: true, canSeeEntries: false, pendingIntakes: null,
      branches: [{ id: ID(2), name: 'Centro', entriesToday: null, lastEntryAt: null, registers: [{ id: ID(5), name: 'Caja 1' }], openSessions: [{ id: ID(6), registerName: 'Caja 1', openedByName: null, openedAt: AHORA, mine: true }] }],
      classesToday: [{ id: ID(7), branchId: ID(2), name: 'Spinning', startsAt: AHORA, capacity: 20, booked: 12 }],
    }],
    ['GET /members/search', MemberSearchResponse, { query: 'ana', elapsedMs: 3.21, results: [{ ...socio(), emergencyContactName: null, emergencyContactPhone: null, similarity: 0.875 }] }],
    ['GET /members', MemberListPage, { members: [socio(), { ...socio(), phoneE164: null, email: null, balanceCents: null, hidden: ['contact', 'balance'] }], total: 2, nextCursor: null }],
    ['GET /members/:id', MemberDetail, { ...socio(), status: 'ARCHIVED', anonymizedAt: AHORA, coachUserId: null }],
    ['GET /members/access-summary', AccessSummaryResponse, {
      allowAccessWhilePastDue: false,
      members: [
        { memberId: ID(3), membership: { status: 'PAST_DUE', planName: 'Mensual', coveredThrough: '2026-12-18', paidThrough: '2026-11-18', graceUntil: '2026-11-22' }, pack: null, dayPass: null, canEnter: false },
        { memberId: ID(4), membership: null, pack: { status: 'ACTIVE', visitsLeft: 3, expiresOn: null }, dayPass: null, canEnter: true },
        { memberId: ID(13), membership: null, pack: null, dayPass: { branchId: ID(2), validOn: '2026-11-21' }, canEnter: true },
      ],
    }],
    ['POST /members/:id/day-passes', DayPassSaleResult, {
      created: true, creditAppliedCents: '0', payment: { id: ID(12), folio: 'CEN-000123', amountCents: '15000' },
      pass: { id: ID(14), memberId: ID(13), branchId: ID(2), validOn: '2026-11-21', concept: 'Pase del día · Visita suelta', amountCents: '15000', paid: true, validToday: true },
    }],
    ['GET /members/:id/day-passes', MemberDayPasses, { today: null, total: 0, recent: [] }],
    ['POST /access/attempts', AccessAttemptResult, {
      outcome: 'DENIED', reason: 'MEMBERSHIP_SUSPENDED', warning: null, consumedVisit: false, reentry: false, policyVersion: '4.0.0', decisionId: ID(8),
      attendanceId: null, overridable: true, outstandingCents: '65000', minimumCents: '65000', periodsOwed: 1,
    }],
    ['POST /access/face (no reconoció)', FaceAccessResult, { reconocido: false, motivo: 'No te reconocí. Pasa con recepción.', sinRostro: false }],
    ['POST /access/face (reconoció)', FaceAccessResult, {
      reconocido: true, memberId: ID(3), memberName: 'Ana López', outcome: 'GRANTED', reason: null, warning: 'Es su última visita del paquete',
      consumedVisit: true, reentry: false, decisionId: ID(8), outstandingCents: null, debeVolverAFirmar: false,
    }],
    ['POST /access/attempts/preview', AccessAttemptPreview, {
      outcome: 'DENIED', reason: 'MEMBERSHIP_SUSPENDED', warning: null, wouldConsumeVisit: false, reentry: false, overridable: true, policyVersion: '4.0.0',
      outstandingCents: '65000', minimumCents: '65000', periodsOwed: 1, creditCents: '20000', policy: { requiresReason: true, hasBiometric: false, faceRequired: false },
    }],
    ['POST /access/decisions/:id/collect', CollectAndOpenResult, {
      paymentId: ID(12), folio: 'CEN-000122', decisionId: ID(9), attendanceId: ID(10), creditAppliedCents: '20000',
      membership: { id: ID(5), status: 'ACTIVE', canEnter: true, paidThrough: '2026-12-18' }, toEnterCents: null,
    }],
    ['GET /cash-sessions/open-lite', OpenCashSessionsLite, {
      sessions: [{ id: ID(6), cashRegisterId: ID(7), registerCode: 'C1', registerName: 'Caja 1', openedByUserId: ID(1), openedByName: 'Recepción Centro', openedAt: AHORA }],
    }],
    ['GET /access/decisions/:id/exception', AccessException, {
      decision: { id: ID(8), outcome: 'DENIED', reason: 'MEMBERSHIP_PAST_DUE', at: AHORA, branchId: ID(2) },
      member: { id: ID(3), memberCode: 'CEN-00042', fullName: 'Ana López', photoUrl: null, joinedAt: '2025-01-15', tenureDays: 673 },
      membershipStatus: 'PAST_DUE', outstandingCents: '65000', outstandingLabel: '$650.00', creditCents: '0', minimumCents: '65000', periodsOwed: 1,
      recentVisits: [{ at: AHORA, branchId: ID(2) }],
      options: [
        { action: 'COLLECT_AND_OPEN', label: 'Cobrar y abrir', requiresReason: false, primary: true },
        { action: 'GRANT_ONCE', label: 'Dejar pasar por hoy', requiresReason: true, primary: false },
        { action: 'REFUSE', label: 'No dejar pasar', requiresReason: false, primary: false },
      ],
      resolution: null,
    }],
    ['GET /members/:id/biometric-enrollments', BiometricEnrollmentList, {
      enrollments: [{ id: ID(9), modality: 'FACE', branchId: ID(2), algorithmVendor: 'insightface/buffalo_sc', consentId: ID(10), enrolledAt: AHORA, revokedAt: AHORA, templateDeletedAt: null, gaps: ['REVOKED'] }],
    }],
    ['GET /biometric-enrollments/pending-deletion', PendingTemplateDeletions, {
      overdue: [{ id: ID(9), memberId: ID(3), branchId: ID(2), memberName: 'Socio anonimizado', memberCode: 'CEN-00042', revokedAt: AHORA }], waiting: [],
    }],
    ['GET /members/:id/statement', MemberStatement, estadoDeCuenta()],
    ['POST /members/:id/payments', RecordPaymentResult, {
      payment: pago(), allocations: [{ chargeId: ID(11), amountCents: '65000' }], unappliedCents: '0', creditAppliedCents: '0', created: true,
      membership: { id: ID(13), status: 'ACTIVE', canEnter: true, paidThrough: '2026-12-18' }, toEnterCents: null,
    }],
    ['GET /payments/:id/receipt', PaymentReceipt, {
      payment: pago(), member: { id: ID(3), memberCode: 'CEN-00042', fullName: 'Ana López' },
      lines: [{ concept: 'Mensualidad · 2026-11-19 a 2026-12-19', amountCents: '65000' }], coverage: { planName: 'Mensual', paidThrough: '2026-12-18' }, collectedByName: 'Lucía Fernández',
    }],
    ['GET /members/:id/memberships', MemberMemberships, [membresia()]],
    ['GET /cash-sessions/:id (ciego)', ShiftReport, corte()],
    ['POST /cash-sessions/:id/close', CloseCashSessionResult, {
      ...turnoAbierto(), status: 'CLOSED', closedByUserId: ID(1), closedByName: 'Recepción Centro', expectedCashCents: '150000', countedCashCents: '149000',
      varianceCents: '-1000', varianceReason: 'Cambio de más', closedAt: AHORA, varianceLabel: '-$10.00', varianceKind: 'SHORT',
    }],
    ['GET /products', ProductList, { products: [{ id: ID(14), sku: 'AGUA-1L', name: 'Agua 1 L', priceCents: '2500', priceLabel: '$25.00', memberPriceCents: '2000', costCents: '1200', tracksInventory: true, isActive: true }], memberPricing: null }],
    ['POST /pos/sales', PosSale, {
      id: ID(15), branchId: ID(2), cashSessionId: ID(6), memberId: null, status: 'COMPLETED', totalCents: '5000', totalLabel: '$50.00', method: 'CASH',
      folio: 'CEN-000123', voidReason: null, soldAt: AHORA, businessDate: '2026-11-19', lines: [{ productId: ID(14), quantity: 2, unitPriceCents: '2500', lineTotalCents: '5000', priceKind: 'PUBLIC' }],
    }],
    ['GET /portal/statement', PortalStatement, {
      computedAt: AHORA, outstandingCents: '0', creditCents: '0', netBalanceCents: '0', netBalanceLabel: '$0.00',
      charges: [{ id: ID(11), concept: 'Mensualidad · 2026-11-19 a 2026-12-19', status: 'PAID', amountCents: '65000', amountLabel: '$650.00', balanceCents: '0', dueDate: '2026-11-19', settledBy: 'PAYMENT' }],
      payments: [{ id: ID(12), method: 'CARD_TERMINAL', amountCents: '65000', amountLabel: '$650.00', folio: 'CEN-000122', businessDate: '2026-11-19', hasReceipt: true }],
      pages: { charges: { total: 1, nextCursor: null, hasMore: false }, payments: { total: 1, nextCursor: null, hasMore: false } },
    }],
    // ── 1.6: listas por páginas ──
    ['GET /members/:id/statement/charges', StatementChargesPage, { items: [{ ...cargo(), settledBy: 'PAYMENT', adjustments: [] }], total: 61, nextCursor: null, hasMore: false }],
    ['GET /members/:id/statement/payments', StatementPaymentsPage, { items: [{ ...pago(), collectedByUserId: null, collectedByName: null, covers: [] }], total: 1, nextCursor: null, hasMore: false }],
    ['GET /portal/me', PortalMe, {
      memberId: ID(3), memberCode: 'CEN-00042', fullName: 'Ana López', joinedAt: '2025-01-15', tenureDays: 673, membershipStatus: 'ACTIVE', planName: 'Mensual',
      currentPeriodEnd: '2026-12-19', paidThrough: '2026-12-18', graceUntil: null, nextPayment: { amountCents: '65000', date: '2026-12-19' }, gymName: 'Gimnasio Centro',
      homeBranchName: 'Centro', timezone: 'America/Mexico_City', accessMethods: [{ modality: 'FACE', branchName: 'Centro', enrolledAt: AHORA }],
      modules: ['member_portal', 'classes'], onlinePayments: false, hasCardOnFile: false,
      // 2.8: lo que diría la puerta, su paquete, su pase de hoy y lo que el gimnasio le ofrece.
      canEnter: true, accessReason: null, accessBranchName: 'Centro', accessUsesVisit: false,
      visitPack: { status: 'ACTIVE', visitsLeft: 3, visitsPurchased: 10, expiresOn: '2026-12-02' }, dayPass: null, planEnded: null,
      features: { classes: true, routines: false, onlinePayments: false },
    }],
    ['GET /prospects', ProspectList, {
      items: [{
        id: ID(21), firstName: 'Ximena', lastName: 'Ruiz', phoneE164: '+525511112222', email: null, source: 'Instagram', status: 'CONTACTED', branchId: ID(2),
        assignedToUserId: ID(1), convertedMemberId: null, notes: null, createdAt: AHORA, updatedAt: AHORA,
        lastFollowUp: { id: ID(22), channel: 'CALL', outcome: 'INTERESTED', note: 'Viene el lunes', nextStepOn: '2026-11-23', createdAt: AHORA, createdByName: 'Recepción Centro' },
        followUps: 1,
        // 2.4: grupo de la bandeja, próximo paso, quién lo recomendó y por qué se cerró.
        nextStepOn: '2026-11-23', dueOn: '2026-11-23', queue: 'WAITING', referredByMemberId: null, referredByName: null,
        lostReasonCode: null, lostReason: null, closedAt: null,
      }],
      total: 73, nextCursor: 'eyJ0IjoiMjAyNi0xMS0xOSJ9', hasMore: true, counts: { open: 73, closed: 12, today: 9, uncontacted: 20, waiting: 44 },
    }],
    ['GET /intakes', IntakeList, {
      items: [{
        id: ID(23), branchId: ID(2), status: 'REJECTED', fullName: 'Datos borrados', phoneE164: null, email: null, memberSince: null, submittedAt: AHORA,
        memberId: null, rejectionReason: 'Caducó sin revisar', reviewedAt: AHORA, reviewedByUserId: null, reviewedByName: null, scrubbed: true,
        folio: '0A1B2C', flags: [],
      }],
      total: 1, nextCursor: null, hasMore: false, pending: 120,
    }],
    ['GET /inventory/movements', InventoryMovementList, {
      items: [{
        id: ID(24), branchId: ID(2), productId: ID(14), sku: 'AGUA-1L', productName: 'Agua 1 L', movementType: 'SHRINKAGE', quantityDelta: -13, reason: 'Caducó',
        posSaleId: null, createdByUserId: ID(1), createdByName: 'Gerencia Centro', at: AHORA, businessDate: '2026-11-19',
      }],
      total: 1, nextCursor: null, hasMore: false,
    }],
  ];

  for (const [ruta, contrato, respuesta] of casos) {
    it(ruta, () => {
      const d = diferenciasConElContrato(contrato as never, respuesta);
      expect(d, JSON.stringify(d)).toEqual([]);
    });
  }

  it('en `branchScopes` solo van ids de sucursal o null (toda la organización)', () => {
    expect(SessionMe.safeParse({ ...sesion(), branchScopes: ['todas'] }).success).toBe(false);
  });

  it('un estado que la API no conoce no pasa', () => {
    expect(MemberDetail.safeParse({ ...socio(), status: 'SUSPENDIDO', coachUserId: null }).success).toBe(false);
    expect(AccessAttemptResult.safeParse({ outcome: 'MAYBE' }).success).toBe(false);
  });

  it('el catálogo de módulos del núcleo cabe en el contrato de módulos', () => {
    const r = OrganizationModules.safeParse({
      canManage: true,
      modules: MODULES.map((m) => ({
        key: m.key, name: m.name, description: m.description, kind: m.kind, group: m.group, groupName: null, usedBy: m.usedBy,
        screens: [...m.screens], requires: m.requires.map((k) => ({ key: k, name: k, fixed: false })), enabled: m.defaultEnabled,
        contracted: true, scope: m.scope, dependents: [], branches: [],
      })),
    });
    expect(r.success).toBe(true);
  });
});

// ── Respuestas de ejemplo, como las arma la API ─────────────────────────────

function sesion() {
  return {
    userId: ID(1), fullName: 'Gerencia Centro', email: 'gerencia@ejemplo.mx', mustChangePassword: false, organizationId: ID(99),
    roleKeys: ['MANAGER'], permissions: [...ROLE_PERMISSIONS.MANAGER].sort(), modules: ['core', 'cash', 'pos'],
    disabledByBranch: {}, branchScopes: [null], unlockedSections: ['tablero', 'movimientos'],
    limits: {
      maxDiscountPercent: 30, maxWaiverAmountCents: '100000', maxManualBalanceAdjustCents: null, maxCashWithdrawalCents: '500000',
      maxRefundAmountCents: null, maxManualAccessGrantsPerShift: null, maxPosVoidsPerShift: 5,
    },
    session: { startedAt: AHORA, endsAt: '2026-11-20T06:20:00.000Z', secondsLeft: 43200 },
  };
}

function modulos() {
  return {
    canManage: true,
    modules: [
      {
        key: 'classes', name: 'Clases', description: 'Horario, reservas y pase de lista.', kind: 'optional', group: 'members', groupName: 'Para tus socios',
        usedBy: 'Coach y recepción', screens: ['Clases'], requires: [{ key: 'core', name: 'Base', fixed: true }], enabled: true, contracted: true,
        scope: 'branch', dependents: [],
        branches: [
          { branchId: ID(2), name: 'Centro', enabled: true, canChange: true },
          { branchId: ID(4), name: 'Norte', enabled: false, canChange: true, reason: 'No tenemos salón', at: AHORA, byName: 'Gerencia Centro' },
        ],
        usage: { inUse: ['3 horarios'], blockers: [] },
        lastChange: { enabled: true, reason: null, at: AHORA, byName: null },
      },
      {
        key: 'core', name: 'Base', description: 'Socios y membresías.', kind: 'fixed', group: null, groupName: null, usedBy: 'Todos',
        screens: ['Socios'], requires: [], enabled: true, contracted: true, scope: 'org', dependents: ['Clases'], branches: [],
      },
    ],
  };
}

/** Un mes cerrado como lo lista `GET /reports/monthly-closes` (bloque 1.9). */
function cierre() {
  return {
    id: ID(40), month: '2026-10',
    totals: { collectedCents: '1250050', accruedCents: '1100000', deferredCents: '150050', mrrCents: '900000', outstandingCents: '42000', overdueCents: '12000', activeMembers: 248, cashExpensesCents: '-3000', fixedExpensesCents: '-400000', profitCents: '697000',
      // Foto completa (fase 3 · 3.7, D-22): lo demás del Tablero y lo de Movimientos.
      version: 2, cashOverageCents: '0', ownerDrawsCents: '150000', costOfGoodsCents: '0', membersBehind: 2, membersBase: 250,
      cash: { incomeCents: '1250050', refundsCents: '0', expensesCents: '-3000', shortageCents: '0', overageCents: '0', netCents: '1247050', toBankCents: '0', creditNotesCents: '0', fixedExpensesCents: '-400000', profitCents: '847050', byMethod: { CASH: '1250050' } },
    },
    byBranch: [{ branchId: ID(2), collectedCents: '1250050', accruedCents: '1100000', outstandingCents: '42000', activeMembers: 248 }],
    closedAt: AHORA, closedByUserId: ID(8), closedByName: 'Gerencia Demo', approvedByUserId: ID(9), approvedByName: 'Dueña Demo', note: null,
  };
}

function tablero() {
  return {
    range: { from: '2026-11-01', to: '2026-11-20' },
    closed: null,
    adjustments: [{ month: '2026-09', cents: '-750000', count: 2 }],
    money: {
      collectedCents: '1250000', collectedLabel: '$12,500.00', accruedCents: '980000', accruedLabel: '$9,800.00',
      deferredCents: '270000', deferredLabel: '$2,700.00', mrrCents: '1500000', mrrLabel: '$15,000.00',
      cashExpensesCents: '-35000', cashOverageCents: '1000', fixedExpensesCents: '-400000', profitCents: '545000', ownerDrawsCents: '0', costOfGoodsCents: '-12000',
    },
    previous: { from: '2026-10-01', to: '2026-10-20', collectedCents: '1100000', accruedCents: '900000', profitCents: '500000' },
    portfolio: { outstandingCents: '130000', overdueCents: '65000', delinquencyRate: 0.5, membersBehind: 2, membersBase: 248 },
    activeMembers: 246,
    openCashSessions: [{ id: ID(6), branchId: ID(2), registerCode: 'C1', openedAt: AHORA, openingFloatCents: '50000' }],
    branches: [{ branchId: ID(2), collectedCents: '1250000', accruedCents: '980000', activeMembers: 246, outstandingCents: '130000' }, { branchId: null, collectedCents: '0', accruedCents: '0', activeMembers: 0, outstandingCents: '0' }],
    notes: { packsValuedByListPrice: 1, warning: '1 paquete(s) de visitas sin cargo enlazado se valoraron a precio de lista.', soldWithoutCost: 0 },
  };
}

function pulse() {
  return {
    asOf: AHORA, timezone: 'America/Mexico_City',
    today: {
      collectedCents: '120000', yesterdaySameTimeCents: '90000', lastWeekSameTimeCents: '0',
      byHour: Array.from({ length: 24 }, (_, hour) => ({ hour, cents: '0', lastWeekCents: '0' })),
      visits: 37, visitsYesterdaySameTime: 30, newMembers: 2,
    },
    month: {
      from: '2026-11-01', to: '2026-11-19', profitCents: '545000', incomeCents: '1250000', expensesCents: '-435000', cashOverageCents: '0',
      fixedExpensesCents: '-400000', lastMonthSameDayProfitCents: '500000', lastMonthTotalProfitCents: '800000', newMembers: 14, leftMembers: 3,
    },
    alerts: {
      shortCounts: [{ id: ID(6), branchId: ID(2), registerName: 'Caja 1', closedByName: 'Recepción Centro', varianceCents: '-1000', reason: 'Cambio de más', closedAt: AHORA }],
      refundsToday: { count: 0, cents: '0' },
      cashOpenSinceYesterday: [],
      pendingApprovals: { count: 1, oldest: AHORA },
      sensitiveToday: 0,
    },
    owed: { overdueCents: '65000', outstandingCents: '130000', membersBehind: 2, byBranch: [{ branchId: ID(2), outstandingCents: '130000', membersBehind: 2 }] },
    members: { active: 246, base: 248 },
    branches: [{ branchId: ID(2), todayCents: '120000', yesterdaySameTimeCents: '90000', visits: 37 }],
    openCash: [{ id: ID(6), branchId: ID(2), registerName: 'Caja 1', openedByName: 'Recepción Centro', openedByUserId: ID(1), openedAt: AHORA }],
    doors: [{ branchId: ID(2), firstEntryAt: AHORA, lastEntryAt: AHORA, entries: 37, cashOpenedAt: AHORA, cashClosedAt: null }],
    recentEntries: [{ branchId: ID(2), memberId: ID(3), memberName: 'Ana López', memberCode: 'CEN-00042', at: AHORA }],
    staff: [{
      userId: ID(1), fullName: 'Recepción Centro', roleKey: 'RECEPTION', roleName: 'Recepción', branchId: ID(2), lastLoginAt: AHORA, lastActionAt: null,
      actionsToday: 12, paymentsToday: 4, manualEntriesToday: 1, openCash: true,
    }],
  };
}

function socio() {
  return {
    id: ID(3), memberCode: 'CEN-00042', firstName: 'Ana', lastName: 'López', phoneE164: '+525512345678', email: 'ana@ejemplo.mx',
    birthDate: '1990-05-01', status: 'ACTIVE', homeBranchId: ID(2), joinedAt: '2025-01-15T18:00:00.000Z', emergencyContactName: 'Luis',
    emergencyContactPhone: '+525598765432', anonymizedAt: null, balanceCents: '0', hidden: [],
  };
}

function cargo() {
  return {
    id: ID(11), memberId: ID(3), membershipId: ID(13), branchId: ID(2), chargeType: 'MEMBERSHIP_PERIOD', status: 'PAID',
    concept: 'Mensualidad · 2026-11-19 a 2026-12-19', subtotalCents: '65000', taxCents: '0', discountCents: '0', amountCents: '65000',
    allocatedCents: '65000', adjustedCents: '0', balanceCents: '0', amountLabel: '$650.00', periodStart: '2026-11-19', periodEnd: '2026-12-19',
    dueDate: '2026-11-19', createdAt: AHORA,
  };
}

function pago() {
  return {
    id: ID(12), memberId: ID(3), branchId: ID(2), method: 'CASH', status: 'SUCCEEDED', amountCents: '65000', unappliedCents: '0',
    amountLabel: '$650.00', externalRef: null, folio: 'CEN-000122', cashSessionId: ID(6), receivedAt: AHORA, businessDate: '2026-11-19',
    reversesPaymentId: null, reversalReason: null,
  };
}

function estadoDeCuenta() {
  return {
    memberId: ID(3), outstandingCents: '0', creditCents: '0', netBalanceCents: '0', netBalanceLabel: '$0.00',
    charges: [
      { ...cargo(), settledBy: 'PAYMENT', adjustments: [] },
      { ...cargo(), id: ID(16), status: 'VOID', balanceCents: '65000', allocatedCents: '0', settledBy: null, adjustments: [] },
      {
        ...cargo(), id: ID(19), allocatedCents: '0', adjustedCents: '65000', settledBy: 'WAIVER',
        adjustments: [{ id: ID(20), chargeId: ID(19), adjustmentType: 'WAIVER', amountCents: '65000', reasonCode: null, reason: 'Estuvo hospitalizado', approvedByUserId: ID(1), approvedByName: 'Gerencia Centro', createdAt: AHORA }],
      },
    ],
    payments: [
      { ...pago(), collectedByUserId: ID(1), collectedByName: 'Recepción Centro', covers: [{ chargeId: ID(11), concept: 'Mensualidad · 2026-11-19 a 2026-12-19', amountCents: '65000' }] },
      { ...pago(), id: ID(17), amountCents: '-65000', amountLabel: '-$650.00', reversesPaymentId: ID(12), reversalReason: 'Se cobró dos veces', collectedByUserId: null, collectedByName: null, covers: [] },
    ],
    pages: { charges: { total: 61, nextCursor: 'eyJkIjoiMjAyNi0xMS0xOSJ9', hasMore: true }, payments: { total: 2, nextCursor: null, hasMore: false } },
    today: '2026-11-19',
    cobro: { membership: { id: ID(13), status: 'ACTIVE', canEnter: true, paidThrough: '2026-12-18' }, toEnterCents: null },
  };
}

function membresia() {
  return {
    id: ID(13), memberId: ID(3), planId: ID(18), soldAtBranchId: ID(2), status: 'ACTIVE', startDate: '2025-01-15',
    currentPeriodStart: '2026-11-19', currentPeriodEnd: '2026-12-19', coveredThrough: '2026-12-18', paidThrough: '2026-12-18', missedPeriods: null,
    billingAnchorDay: 19, graceUntil: null, autoRenew: true, frozenDaysUsedThisYear: 0, frozenSince: null, frozenUntil: null,
    replacesMembershipId: null, cancellationReason: null, grantsAccess: true,
  };
}

function turnoAbierto() {
  return {
    id: ID(6), branchId: ID(2), cashRegisterId: ID(5), status: 'OPEN', shiftLabel: 'MORNING', businessDate: '2026-11-19', openedByUserId: ID(1),
    openedByName: 'Recepción Centro', closedByUserId: null, closedByName: null, openingFloatCents: '50000', expectedCashCents: null,
    countedCashCents: null, varianceCents: null, varianceReason: null, firstCountedCashCents: null, countAttempts: 0, openedAt: AHORA, closedAt: null,
  };
}

function corte() {
  return {
    session: turnoAbierto(), register: { id: ID(5), code: 'C1', name: 'Caja 1' },
    byMethod: [{ method: 'CARD_TERMINAL', amountCents: '65000' }],
    contributions: [{ source: 'POS', byMethod: [{ method: 'CARD_TERMINAL', amountCents: '0' }] }],
    totalCollectedCents: null, cashCollectedCents: null, movementsCents: '-20000',
    movements: [{ id: ID(19), movementType: 'WITHDRAWAL', amountCents: '-20000', amountLabel: '-$200.00', reason: 'Retiro a caja fuerte', createdByUserId: ID(1), approvedByUserId: null, at: AHORA }],
    expectedCashCents: null, expectedCashLabel: null, blind: true, countedCashCents: null, varianceCents: null,
  };
}

describe('retención y seguimiento (1.15)', () => {
  const counts = { NEW: 3, ONBOARDING_AT_RISK: 2, REGULAR: 40, SLIPPING: 5, DORMANT: 4, LOST: 9 };
  const alerta = {
    memberId: ID(1), memberCode: 'CEN-00042', fullName: 'Alejandro Ruiz', homeBranchId: ID(2), phoneE164: '+525512345678',
    state: 'DORMANT', daysSinceLastVisit: 23, missedVisits: 3, expectedGapDays: 7, tenureDays: 400,
    detail: 'Lleva 23 días sin venir; suele venir cada semana',
  };

  it('la lista trae el día, los seis conteos, el total real y las alertas', () => {
    expect(diferenciasConElContrato(RetentionAlerts, { asOf: '2026-11-19', counts, total: 11, outreach: [alerta] })).toEqual([]);
    // Un conteo que falta o un estado inventado se notan.
    expect(diferenciasConElContrato(RetentionAlerts, { asOf: '2026-11-19', counts: { ...counts, LOST: undefined }, total: 11, outreach: [] })).not.toEqual([]);
    expect(diferenciasConElContrato(RetentionAlert, { ...alerta, state: 'GONE' })).not.toEqual([]);
  });

  it('el resumen para la dueña no lleva nombres: solo cifras', () => {
    expect(diferenciasConElContrato(RetentionSummary, { asOf: '2026-11-19', branchId: null, counts, atRisk: 11 })).toEqual([]);
    expect(diferenciasConElContrato(RetentionSummary, { asOf: '2026-11-19', branchId: null, counts, atRisk: 11, outreach: [alerta] }).map((d) => d.ruta)).toEqual(['outreach']);
  });

  it('el último contacto por socio, con el mismo contrato que el de un prospecto', () => {
    const contacto = { id: ID(5), channel: 'CALL', outcome: 'NO_ANSWER', note: null, nextStepOn: '2026-11-20', createdAt: AHORA, createdByName: 'Paola Ríos' };
    expect(diferenciasConElContrato(FollowUpLatest, { latest: [{ memberId: ID(1), count: 2, last: contacto }] })).toEqual([]);
    expect(diferenciasConElContrato(FollowUpContact, { ...contacto, channel: 'FAX' })).not.toEqual([]);
  });
});
