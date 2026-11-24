import { formatMoney, money } from './money.js';

/**
 * La bitácora en palabras (DP-05; auditoría 8, 20-07 y 20-10, bloque 1.11).
 *
 * Una frase por acción, en el núcleo, para que el servidor, el panel y el CSV
 * digan lo mismo y una acción nueva sin frase se note en las pruebas y no en
 * la pantalla del dueño. La frase dice A QUIÉN y CUÁNTO con huecos explícitos
 * (nada de pegar « de Ana» por cómo termina la frase):
 *
 *  - `{m}`            el importe: « de $650.00», o nada si el asiento no lo trae.
 *  - `{socio}`        el socio como complemento: «Ana López», o «un socio».
 *                     Con otro texto de respaldo: `{socio|un exsocio}`.
 *  - `{a socio}`      con su preposición (a, de, para, con): « a Ana López», o nada.
 *  - `{persona}`      la persona del personal sobre la que se actuó, o «alguien»
 *                     (`{persona|su gerente}`, `{de persona}` igual que el socio).
 *
 * `auditPhrase` arma la frase completa con los datos del asiento.
 */
export const AUDIT_LABELS: Readonly<Record<string, string>> = {
  // Dinero
  'payments.record': 'registró un cobro{m}{a socio}',
  'payments.reverse': 'revirtió un pago{m}{de socio}',
  'payment.refund': 'hizo un reembolso{m}{a socio}',
  'payments.refund.ledger': 'asentó un reembolso{m}{a socio}',
  'payments.chargeback': 'registró un contracargo{m}{de socio}',
  'payments.chargeback.needs_review': 'dejó un contracargo por revisar{m}{de socio}',
  'payment.refund.unrecorded': 'dejó un reembolso sin asentar{m}{de socio}',
  'payment.attempt.resolve': 'resolvió un cobro en línea pendiente{de socio}',
  'payment.method.add': 'guardó una tarjeta{de socio}',
  'payment.method.revoke': 'quitó una tarjeta{de socio}',
  // Solo lo escribe el cargo fuera del catálogo (28-05): por eso es «Para revisar».
  'billing.charge.create': 'creó un cargo fuera del catálogo{m}{a socio}',
  'billing.charge.void': 'anuló un cargo{m}{de socio}',
  'billing.waiver.apply': 'condonó una deuda{m}{a socio}',
  'billing.discount.apply': 'aplicó un descuento{m}{a socio}',
  'billing.credit.apply': 'aplicó saldo a favor{m}{de socio}',
  // Fase 3 · bloque 3.5 (D-12, D-13): perdonar con monto, lo no usado a favor y las devoluciones.
  'membership.auto_renew.set': 'cambió si una membresía se renueva sola{de socio}',
  'billing.debt.waive': 'perdonó el adeudo{m}{de socio}',
  'billing.credit.unused': 'dejó a favor lo pagado y no usado{m}{de socio}',
  'payments.return': 'devolvió una parte de un cobro{m}{a socio}',
  'payments.credit.return': 'devolvió saldo a favor{m}{a socio}',
  'billing.settlement.deferred': 'difirió un cobro{de socio}',
  'cash.session.open': 'abrió caja',
  'cash.session.close': 'hizo el corte de caja',
  'cash.withdraw': 'retiró efectivo de la caja{m}',
  'cash.movement.create': 'registró un movimiento de caja{m}',
  // Bloque 3.5 (D-15): los topes del cajón de un gimnasio.
  'cash.limits.update': 'cambió los topes del cajón',
  // D-18 (bloque 4.4): los plazos del socio y la deuda que se da por perdida.
  'settings.retention_terms.update': 'cambió los plazos de retención',
  'billing.debt_terms.update': 'cambió los plazos de la deuda',
  // Por socio (queda en su historia) y el resumen de la corrida (ese es el que va a «Para revisar»).
  'billing.debt.lost': 'dio por perdida la deuda{m}{de socio}',
  'billing.debt.lost.summary': 'dio deuda por perdida{m}',
  // Bloque 4.3 (D-17): la gerencia revisa y cierra con su nota un corte con más de $20 de diferencia.
  'cash.variance.review': 'revisó el descuadre de un corte{m}',
  'cash.register.create': 'dio de alta una caja',
  'cash.register.update': 'cambió una caja',
  'pos.sale.create': 'registró una venta de mostrador{m}{a socio}',
  'pos.sale.void': 'anuló una venta de mostrador{m}{a socio}',
  // Bloque 3.5 (D-13): recepción avisa; la gerencia anula el mismo día o devuelve otro día, con firma.
  'pos.sale.flag': 'marcó una venta de mostrador por corregir{m}',
  'pos.sale.unflag': 'descartó el aviso de una venta por corregir',
  'pos.sale.return': 'registró la devolución de una venta de mostrador{m}',
  'pos.product.create': 'dio de alta un producto',
  'pos.product.update': 'cambió un producto',
  'pos.inventory.adjust': 'ajustó inventario',
  'expense.create': 'registró un gasto fijo{m}',
  'expense.void': 'anuló un gasto fijo{m}',
  // D-22 (3.7): lo tardío de un mes cerrado se anota en el mes en curso.
  'expense.adjust': 'anotó un ajuste de un mes cerrado{m}',
  // D-26 (4.5): la nómina por pago (sin decir a quién: eso se ve en Movimientos) y los gastos que se repiten.
  'expense.payroll.pay': 'anotó un pago de nómina{m}',
  'expense.recurring.create': 'dejó un gasto para que se proponga cada periodo{m}',
  'expense.recurring.update': 'cambió el importe de un gasto que se repite{m}',
  'expense.recurring.end': 'dejó de repetir un gasto{m}',
  'expense.recurring.skip': 'descartó un gasto propuesto{m}',
  // Membresías y paquetes
  'membership.sale': 'vendió una membresía{m}{a socio}',
  'membership.create': 'creó una membresía{para socio}',
  'membership.plan_change.billed': 'cambió el plan{de socio}',
  // Transiciones de la membresía (`membership.<trigger>`): las escribe el motor, a menudo el cierre diario.
  'membership.activate': 'activó la membresía{de socio}',
  'membership.cancel': 'canceló la membresía{de socio}',
  'membership.charge_overdue': 'marcó con pago atrasado la membresía{de socio}',
  'membership.debt_forgiven': 'condonó el adeudo de la membresía{de socio}',
  'membership.debt_resumed': 'reanudó el adeudo de la membresía{de socio}',
  'membership.freeze': 'congeló la membresía{de socio}',
  'membership.freeze_limit_exceeded': 'terminó un congelamiento{de socio} que pasó del tope',
  'membership.grace_expired': 'suspendió la membresía{de socio} al vencer la gracia',
  'membership.payment_settled': 'reactivó la membresía{de socio} al pagar',
  'membership.period_ended': 'venció la membresía{de socio}',
  'membership.plan_changed': 'cambió el plan de la membresía{de socio}',
  'membership.recovery_window_expired': 'dio por terminada la membresía suspendida{de socio}',
  'membership.renew': 'renovó la membresía{de socio}',
  'membership.sin_renovar': 'no pudo renovar la membresía{de socio}: la cuota no se emitió',
  'membership.start_trial': 'inició una prueba{de socio}',
  'membership.trial_converted': 'convirtió en membresía la prueba{de socio}',
  'membership.trial_failed': 'terminó sin convertir la prueba{de socio}',
  'membership.unfreeze': 'descongeló la membresía{de socio}',
  'visitpack.sell': 'vendió un paquete de visitas{m}{a socio}',
  'daypass.sell': 'vendió un pase del día{m}{a socio}',
  'visitpack.adjust': 'ajustó las visitas de un paquete{de socio}',
  'visitpack.expire': 'venció un paquete{de socio}',
  // Socios
  'member.create': 'dio de alta a {socio}',
  'member.update': 'editó los datos de {socio}',
  'member.archive': 'dio de baja a {socio}',
  'member.reactivate': 'reactivó a {socio|un exsocio}',
  'member.anonymize': 'anonimizó a {socio} (ARCO)',
  'member.export': 'exportó los datos de {socio} (ARCO)',
  'member.export.self': 'descargó sus datos desde el portal',
  'health.read': 'leyó las notas de salud{de socio}',
  'consent.record': 'registró un consentimiento{de socio}',
  'consent.revoke': 'revocó un consentimiento{de socio}',
  'consent.document.publish': 'publicó un texto de consentimiento',
  'consent.document.retire': 'retiró un texto de consentimiento',
  // D-25 (3.7): el aviso de privacidad no se publica sin la firma de la dueña.
  'consent.document.sign.request': 'pidió la firma de la dueña para publicar el aviso de privacidad',
  'consent.document.sign.reject': 'no firmó el aviso de privacidad',
  // Borradores de los textos (1.10): corregir y borrar lo que todavía no firma nadie.
  'consent.document.update': 'corrigió el borrador de un texto de consentimiento',
  'consent.document.delete': 'borró el borrador de un texto de consentimiento',
  'privacy.request.open': 'registró una solicitud ARCO{de socio}',
  'privacy.request.resolve': 'resolvió una solicitud ARCO{de socio}',
  // El ciclo ARCO completo (1.10): acreditar la identidad y hacer efectivo lo resuelto.
  'privacy.request.identity': 'acreditó la identidad en una solicitud ARCO{de socio}',
  'privacy.request.effect': 'hizo efectiva una solicitud ARCO{de socio}',
  // Conservación (D-32; bloque 3.9): la lista mensual de exsocios por anonimizar y su firma.
  'privacy.conservation.start': 'empezó a aplicar los plazos de conservación de datos',
  'privacy.batch.prepare': 'armó la lista mensual de exsocios por anonimizar',
  'privacy.batch.replace': 'cerró sin firma una lista de exsocios por anonimizar',
  'privacy.batch.sign': 'firmó la lista mensual de exsocios por anonimizar',
  'privacy.batch.sign.fail': 'falló la contraseña al firmar la lista de exsocios por anonimizar',
  'privacy.batch.exclude': 'sacó{a socio} de la lista de exsocios por anonimizar',
  'portal.invite.issue': 'invitó{a socio} al portal',
  'portal.sessions.revoke': 'cerró el portal en los teléfonos de {socio}',
  'intake.approve': 'aprobó el alta digital{de socio}',
  'intake.reject': 'rechazó un alta digital',
  'intake.link': 'vinculó un alta digital{con socio}',
  'members.import.stage': 'cargó un archivo de socios para revisar',
  'members.import.apply': 'aplicó una importación de socios',
  'members.import.cancel': 'canceló una importación de socios',
  // Captación (2.4): correcciones guardadas sin aprobar, y el interesado de punta a punta.
  'intake.correct': 'guardó correcciones en un alta digital sin aprobarla',
  // Altas (3.4): completar lo vacío de la ficha (D-11) y el responsable del celular compartido o tutor (D-09, D-10).
  'member.complete': 'completó datos que faltaban en la ficha de {socio}',
  'member.responsible': 'anotó al responsable del celular de {socio}',
  // Fase 4 · bloque 4.8 (D-36): el socio cambia su celular, su correo o su contacto de emergencia desde el portal
  // (el actor del asiento es «El socio»), y el mostrador confirma con él que fue él.
  'member.contact.self_update': 'actualizó desde el portal los datos de contacto de {socio}',
  'member.contact.review': 'confirmó con {socio} el cambio de contacto que hizo desde el portal',
  'prospect.create': 'registró a un interesado',
  'prospect.close': 'cerró a un interesado que no se inscribió',
  'prospect.reopen': 'reabrió a un interesado',
  // Interesados (D-31, bloque 4.7): el cierre solo a los 60 días sin contacto, que hace el cierre de la noche.
  'prospect.auto_close': 'cerró a un interesado que llevaba mucho sin contacto',
  'prospect.auto_close.start': 'fijó desde qué día los interesados sin contacto se cierran solos',
  'prospect.sources.update': 'cambió la lista de «¿Cómo se enteró?»',
  'prospect.update': 'actualizó un prospecto',
  'prospect.convert': 'convirtió un prospecto en socio',
  'prospect.follow_up': 'registró un contacto con un prospecto',
  'member.follow_up': 'registró un contacto con {socio|un socio en riesgo}',
  // Bandeja de salida (2.9)
  'member.message.send': 'mandó un mensaje por WhatsApp{a socio}',
  'member.message.dismiss': 'decidió no mandar un mensaje{a socio}',
  'member.message.reopen': 'regresó a pendientes un mensaje{a socio}',
  // Acceso
  'access.manual_grant': 'dejó pasar por excepción{a socio}',
  'access.manual_entry': 'registró una entrada por el mostrador{de socio} (excepción)',
  // Fase 3, bloque 3.3 (D-06, D-08)
  'access.entry.authorize_without_face': 'autorizó la entrada sin rostro{de socio}',
  'access.face_rule.change': 'cambió la regla de entrar solo con rostro',
  'access.trial_pass.grant': 'dio un pase de prueba{a socio}',
  'access.biometric.enroll': 'registró la biometría{de socio}',
  'access.biometric.revoke': 'revocó la biometría{de socio}',
  'access.biometric.template_deleted': 'confirmó el borrado de una plantilla biométrica{de socio}',
  'access.credential.issue': 'emitió una credencial{para socio}',
  'access.credential.revoke': 'revocó una credencial{de socio}',
  'access.gateway.create': 'dio de alta un equipo de acceso',
  'access.policy.version_mismatch': 'detectó un equipo con política desactualizada',
  // Clases y rutinas
  'class.type.create': 'creó una clase',
  'class.type.update': 'cambió una clase',
  'class.type.price': 'cambió el precio de una clase',
  'class.type.retire': 'retiró una clase',
  'class.template.create': 'armó un horario de clases',
  'class.template.retire': 'retiró un horario de clases',
  'class.schedule.cancel': 'canceló una sesión',
  'class.booking.override_cancel': 'canceló fuera de tiempo una reserva{de socio}',
  'class.booking.cancel': 'quitó una reserva de clase{de socio}',
  // Bloque 3.5 (D-16): el lugar apartado sin pagar se libera una hora antes y no deja deuda.
  'class.booking.release': 'liberó un lugar apartado sin pagar{m}{de socio}',
  // Horario flexible y reglas de reserva (bloque 2.5).
  'class.template.update': 'cambió un horario de clases',
  'class.schedule.create': 'agregó una sesión única',
  'class.schedule.capacity': 'cambió el cupo de una sesión',
  'class.pause.create': 'pausó el horario de clases por fechas',
  'class.pause.end': 'quitó una pausa del horario de clases',
  'class.settings.update': 'cambió las reglas de reserva de clases',
  'training.exercise.create': 'agregó un ejercicio',
  'training.routine.create': 'creó una rutina',
  'training.routine.update': 'cambió una rutina',
  'training.routine.archive': 'archivó una rutina',
  'training.routine.assign': 'asignó una rutina{a socio}',
  'training.routine.end': 'terminó una rutina{de socio}',
  'training.routine.personalize': 'personalizó la rutina{de socio}',
  // Catálogo y sucursales
  'catalog.plan.create': 'creó un plan',
  'catalog.plan.update': 'cambió un plan',
  'catalog.plan.price_change': 'cambió el precio de un plan para sus socios en su siguiente pago',
  'catalog.price_protection.set': 'marcó que conserva su precio la membresía{de socio}',
  'catalog.price_protection.clear': 'quitó la marca de que conserva su precio a la membresía{de socio}',
  'branch.create': 'abrió una sucursal',
  'branch.update': 'cambió una sucursal',
  // Cerrar y reabrir una sede con su motivo (1.14): hoy la API asienta `branch.update`.
  'branch.close': 'cerró una sucursal',
  'branch.reopen': 'reabrió una sucursal',
  // Personal y seguridad
  'staff.create': 'dio de alta en el personal a {persona|una persona}',
  'staff.update': 'editó los datos de {persona|una persona del personal}',
  'staff.deactivate': 'dio de baja del personal a {persona|una persona}',
  // Reactivar da una temporal nueva (1.14): hoy la API asienta `staff.update` + `staff.password_reset`.
  'staff.reactivate': 'reactivó a {persona|una persona del personal} con una contraseña temporal nueva',
  'staff.role': 'cambió el puesto de {persona}',
  'staff.password_reset': 'restableció la contraseña de {persona}',
  'staff.rescue': 'rescató la cuenta de {persona|su gerente}',
  'staff.unlock': 'cambió las secciones liberadas a {persona}',
  'staff.permissions': 'ajustó los permisos de {persona} sobre su puesto',
  'member.coach': 'asignó o quitó el coach de {socio}',
  'member.coach.handover': 'pasó a otro coach los socios de {persona|una persona}',
  // D-29 (bloque 3.8): el coach elegido al alta, y «Hacerme su coach» con el código del socio.
  'member.coach.at_signup': 'eligió el coach de {socio} al darlo de alta',
  'member.coach.claim': 'se hizo coach de {socio} con el código que el socio le dictó',
  'member.coach.claim.failed': 'tecleó un código de «Hacerme su coach» que no sirvió',
  'member.coach.claim.locked': 'agotó los intentos de «Hacerme su coach» y quedó en espera una hora',
  'class.template.coach': 'cambió quién imparte un horario de clases',
  'class.schedule.coach': 'cambió quién imparte una clase',
  'auth.password_change': 'cambió su contraseña',
  'mfa.enroll': 'activó la verificación en dos pasos',
  'session.revoke_all': 'cerró todas sus sesiones',
  // «Cerrar las demás» desde «Mis sesiones» y la consola de plataforma (24-14, 24-19; bloque 1.12).
  'session.revoke_others': 'cerró su sesión en los demás equipos',
  'settings.approval_policy': 'cambió la política de firmas',
  'settings.module.enable': 'encendió un módulo',
  'settings.module.disable': 'apagó un módulo',
  'settings.module.branch.enable': 'encendió un módulo en una sucursal',
  'settings.module.branch.disable': 'apagó un módulo en una sucursal',
  'settings.setup.update': 'cambió un ajuste del arranque',
  'settings.privacy.update': 'cambió el plazo de supresión de exsocios',
  // D-05 (bloque 4.2): la dueña decide qué avisos suenan en su teléfono. El asiento dice cuál (`afterState.label`).
  'settings.owner_alert.off': 'apagó uno de los avisos de su teléfono',
  'settings.owner_alert.on': 'volvió a encender uno de los avisos de su teléfono',
  'approval.self': 'se autorizó a sí misma{m}',
  'approval.remote.request': 'pidió una autorización al teléfono{m}',
  'approval.remote.approve': 'autorizó desde su teléfono{m}',
  'approval.remote.reject': 'rechazó desde su teléfono{m}',
  // Lo que no se firmó también queda (20-02, 29-04): firmar y fallar en el
  // mostrador, cancelar, vencer y la pausa de la escalera de fallos (24-11).
  'approval.local.issue': 'obtuvo una firma{m} en el mostrador',
  'approval.local.fail': 'falló una firma{m} en el mostrador',
  'approval.remote.fail': 'tecleó mal su contraseña al autorizar desde su teléfono',
  'approval.remote.cancel': 'canceló una solicitud de autorización{m}',
  'approval.remote.expire': 'dio por vencida, sin respuesta, una solicitud de autorización{m}',
  'approval.pause': 'pausó las firmas de {persona|una persona} por intentos fallidos',
  // D-03 (bloque 3.2): el «no» pegado a la operación y «Preguntar».
  'approval.remote.ask': 'preguntó antes de autorizar una solicitud{m}',
  'approval.remote.answer': 'contestó lo que le preguntaron sobre una solicitud{m}',
  'approval.local.after_reject': 'intentó firmar en el mostrador una operación{m} rechazada hace menos de 30 minutos',
  // La 4.ª solicitud de la misma operación en una hora no se crea (D-03), pero queda dicho que se insistió (3.12).
  'approval.remote.over_limit': 'quiso pedir por cuarta vez en una hora la misma autorización{m}',
  // D-02 (bloque 3.1): el apoderado temporal. Quien firma con un nombramiento lleva «· firmó como apoderado de …» en su frase.
  'approval.proxy.grant': 'nombró apoderado temporal a {persona|una persona}',
  'approval.proxy.revoke': 'revocó el nombramiento de apoderado de {persona|una persona}',
  'approval.proxy.replace': 'dio por terminado el nombramiento de apoderado de {persona|una persona} al nombrar a otra',
  'approval.proxy.expire': 'dio por vencido el nombramiento de apoderado de {persona|una persona}',
  'approval.proxy.blocked': 'intentó autorizar como apoderado una operación{m} que otra persona ya había rechazado',
  'audit.export': 'exportó la bitácora',
  'report.month.close': 'cerró el mes',
  // Plataforma (GymFlow sobre la marca)
  'platform.organization.create': 'GymFlow dio de alta la marca',
  'platform.organization.update': 'GymFlow editó los datos de la marca',
  // D-27 (bloque 4.6): los datos y la marca los administra la plataforma; el gimnasio pide el cambio.
  'platform.brand.update': 'GymFlow cambió los datos o la marca del gimnasio',
  'platform.change_request.apply': 'GymFlow aplicó un cambio de datos que el gimnasio pidió',
  'platform.change_request.reject': 'GymFlow rechazó un cambio de datos que el gimnasio pidió',
  'settings.change_request.create': 'pidió a GymFlow un cambio en los datos o la marca del gimnasio',
  'platform.service.activate': 'GymFlow liberó el software',
  'platform.service.suspend': 'GymFlow suspendió el software',
  'platform.service.resume': 'GymFlow reanudó el servicio',
  // D-37 (bloque 3.11): la escalera de cobranza. Suspender a los 15 días de atraso ya no lo confirma una persona.
  'platform.service.auto_suspend': 'GymFlow suspendió el servicio por falta de pago{m}, sin intervención de nadie',
  'platform.notice.send': 'GymFlow le avisó al dueño{m}',
  'platform.notice.deliver': 'quedó constancia de que el dueño recibió un aviso de GymFlow',
  'platform.collections.hold': 'GymFlow dio una prórroga antes de suspender por adeudo',
  'platform.collections.run': 'corrió la cobranza de GymFlow',
  // D-38 (bloque 3.11): cambios de precio o de plan con un mes de aviso.
  'platform.plan.version': 'GymFlow aplicó el cambio anunciado de su plan',
  'platform.catalog.change.schedule': 'anunció un cambio de precio de GymFlow',
  'platform.catalog.change.cancel': 'canceló un cambio de precio anunciado',
  'platform.catalog.change.apply': 'aplicó un cambio de precio anunciado',
  // D-39 (bloque 4.9): descuentos por meses con motivo e IVA de la factura de GymFlow.
  'platform.billing.adjustment.create': 'GymFlow dio un descuento o un precio especial en su factura',
  'platform.billing.adjustment.cancel': 'GymFlow canceló un descuento o un precio especial de su factura',
  'platform.tax.schedule': 'anunció desde cuándo llevan IVA las facturas de GymFlow',
  'platform.tax.cancel': 'canceló un cambio de IVA anunciado',
  'platform.module.grant': 'GymFlow contrató un módulo',
  'platform.module.revoke': 'GymFlow retiró un módulo',
  'platform.plan.assign': 'GymFlow asignó el plan contratado',
  'platform.user.create': 'GymFlow dio una cuenta{a persona}',
  'platform.user.activate': 'GymFlow reactivó la cuenta de {persona|una persona}',
  'platform.user.suspend': 'GymFlow suspendió la cuenta de {persona|una persona}',
  'platform.invoices.issue_month': 'GymFlow emitió las facturas del mes',
  'system.daily_run': 'corrió el cierre diario',
  'platform.user.sections': 'GymFlow cambió lo que ve {persona|el dueño}',
  'platform.password_reset': 'GymFlow restableció la contraseña de {persona|una persona}',
  'platform.invoice.issue': 'GymFlow emitió la factura del mes{m}',
  'platform.invoice.pay': 'GymFlow registró el pago de una factura{m}',
  'platform.invoice.void': 'GymFlow anuló una factura',
  // Un pago registrado por error se deshace con motivo; la factura vuelve a deber ese importe (23-07, bloque 1.13).
  'platform.invoice.payment.undo': 'GymFlow deshizo un pago de una factura{m}',
  // Lo que la plataforma hace en su propia consola (24-19, 23-09): no toca a una
  // marca, así que solo vive en la cadena de plataforma. Quien lo hizo va aparte.
  'platform.console.login': 'entró a la consola de GymFlow',
  'platform.console.logout': 'salió de la consola de GymFlow',
  'platform.console.reauth': 'reconfirmó su contraseña en la consola',
  'platform.console.password_change': 'cambió su contraseña de la consola',
  'platform.console.sessions_close_others': 'cerró sus otras sesiones de la consola',
  'platform.catalog.plan.create': 'creó un plan de GymFlow{m}',
  'platform.catalog.plan.update': 'cambió un plan de GymFlow',
  'platform.catalog.price.update': 'cambió los precios de GymFlow',
};

/**
 * Categorías de la bitácora: un prefijo terminado en punto abarca a todas las
 * acciones que empiezan así.
 *
 * `sensibles` es «PARA REVISAR»: lo que la dueña mira cada día. Desde la
 * auditoría 8 (20-06, bloque 1.11) la regla es **el dinero que sale, el poder
 * que cambia y las excepciones**, y nada de rutina:
 *
 *  - Dinero que sale: reembolsos, reversas, contracargos, condonaciones, cargos
 *    y ventas anulados, cargos fuera del catálogo, retiros de caja, gastos
 *    anulados, ajustes de visitas, correcciones de membresía y bajas de socios.
 *  - Poder que cambia: puesto, permisos, secciones, contraseñas restablecidas,
 *    rescates, política de firmas, módulos, precios (planes y clases), cierre
 *    de mes, importaciones aplicadas.
 *  - Datos: anonimizar, exportar, solicitudes ARCO y lectura de notas de salud.
 *  - Excepciones: firmas falladas con contraseña ajena y firmas en pausa.
 *
 * Lo que aquí aparece SIEMPRE es para revisar. Lo que depende del asiento
 * (el corte solo con diferencia, el descuento solo si pidió firma, la venta
 * solo con fecha anterior) está en `AUDIT_REVIEW_CONDITIONAL` y lo decide
 * `auditNeedsReview`. Las entradas por excepción ya no entran una por una: se
 * resumen por persona y día (`access.manual_*`, ver `AUDIT_SUMMARIZED`).
 */
export const AUDIT_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  dinero: ['payments.', 'payment.', 'billing.', 'cash.', 'pos.sale.', 'visitpack.', 'daypass.', 'expense.', 'report.', 'membership.sale', 'membership.plan_change.billed'],
  sensibles: [
    'payments.reverse', 'payment.refund', 'payments.refund.ledger', 'payment.refund.unrecorded', 'payments.chargeback', 'payments.chargeback.needs_review',
    'billing.waiver.apply', 'billing.charge.void', 'billing.charge.create', 'cash.withdraw', 'pos.sale.void', 'expense.void', 'visitpack.adjust',
    // Bloque 3.5 (D-12, D-13): todo perdón y toda devolución, con o sin firma, se revisa.
    'billing.debt.waive', 'payments.return', 'payments.credit.return', 'pos.sale.return', 'cash.limits.update',
    // D-18 (4.4): la deuda que sale de «Por cobrar» y quien cambia cuándo sale.
    'billing.debt.lost.summary', 'billing.debt_terms.update', 'settings.retention_terms.update',
    'membership.override.', 'member.archive', 'approval.self',
    'class.type.price', 'catalog.plan.create', 'catalog.plan.update', 'catalog.plan.price_change', 'catalog.price_protection.', 'member.anonymize', 'member.export', 'health.read',
    'staff.password_reset', 'staff.reactivate', 'staff.role', 'staff.rescue', 'staff.unlock', 'staff.permissions', 'settings.approval_policy', 'settings.module.',
    'members.import.apply', 'privacy.request.', 'privacy.batch.', 'report.month.close',
    // Alguien probó una contraseña ajena para firmar, o la escalera pausó una firma (20-02, 24-11).
    'approval.local.fail', 'approval.pause',
    // Encender o apagar «nadie entra sin su rostro» cambia quién entra (D-06, bloque 3.3).
    'access.face_rule.change',
    // Tras un «no», alguien quiso firmarla en el mostrador antes de los 30 minutos (D-03).
    'approval.local.after_reject',
    // Alguien insistió una cuarta vez en una hora con la misma operación (D-03; 3.12).
    'approval.remote.over_limit',
    // El poder de firmar cambia de manos (D-02), y un apoderado quiso pasar por encima de un «no».
    'approval.proxy.',
  ],
  socios: ['member.', 'members.import.', 'membership.', 'intake.', 'prospect.', 'consent.', 'privacy.', 'portal.', 'health.read'],
  acceso: ['access.'],
  personal: ['staff.', 'auth.', 'mfa.', 'session.', 'settings.', 'approval.', 'audit.export', 'system.'],
  clases: ['class.', 'training.'],
  catalogo: ['catalog.', 'branch.', 'pos.product.', 'pos.inventory.'],
  plataforma: ['platform.'],
};

/** Lo mínimo de un asiento para armar su frase y decidir si es para revisar. */
export type AuditEntryData = {
  readonly action: string;
  readonly beforeState?: unknown;
  readonly afterState?: unknown;
  readonly approvedByUserId?: string | null | undefined;
};

const campo = (estado: unknown, llave: string): unknown =>
  estado && typeof estado === 'object' && !Array.isArray(estado) ? (estado as Record<string, unknown>)[llave] : undefined;
const centavos = (v: unknown): bigint | null => (typeof v === 'string' && /^-?\d+$/.test(v) ? BigInt(v) : typeof v === 'number' && Number.isSafeInteger(v) ? BigInt(v) : null);

/**
 * Para revisar SEGÚN EL ASIENTO (20-06). Cada regla dice por qué:
 *  - el corte de caja, solo si tuvo diferencia (el asiento trae `varianceCents`);
 *  - el descuento, solo si pasó del tope de quien lo aplicó y pidió firma;
 *  - la venta de membresía, solo si se fechó hacia atrás (`backdated`).
 * La consulta de la API traduce estas mismas tres reglas a SQL; una prueba del
 * backend comprueba que las dos digan lo mismo.
 */
export const AUDIT_REVIEW_CONDITIONAL: Readonly<Record<string, { readonly why: string; readonly test: (e: AuditEntryData) => boolean }>> = {
  'cash.session.close': {
    why: 'El corte tuvo diferencia',
    test: (e) => { const v = centavos(campo(e.afterState, 'varianceCents')); return v !== null && v !== 0n; },
  },
  'billing.discount.apply': {
    why: 'El descuento pasó del tope y pidió firma',
    test: (e) => !!e.approvedByUserId,
  },
  'membership.sale': {
    why: 'La venta se fechó hacia atrás',
    test: (e) => campo(e.afterState, 'backdated') === true,
  },
};

/**
 * Lo que NO va una por una a «Para revisar» sino resumido por persona y día
 * (20-06): cada «déjalo pasar» es rutina; muchas de la misma persona, no.
 */
export const AUDIT_SUMMARIZED: readonly string[] = ['access.manual_grant', 'access.manual_entry'];

/**
 * Las entradas que alguien con autoridad dejó pasar SIN ROSTRO (D-06; 3.12).
 * Tampoco van una por una: con la regla encendida son de todos los días. Se
 * resumen aparte de las excepciones del mostrador, por quién autorizó, día y
 * sede, y sin tope: no gastan el «tope de excepciones por turno» de nadie.
 */
export const AUDIT_SUMMARIZED_WITHOUT_FACE: readonly string[] = ['access.entry.authorize_without_face'];

const coincide = (prefijos: readonly string[], action: string): boolean =>
  prefijos.some((p) => (p.endsWith('.') ? action.startsWith(p) : action === p));

/** ¿Este asiento es «Para revisar»? La regla completa: la lista fija más las tres condicionales. */
export function auditNeedsReview(e: AuditEntryData): boolean {
  if (coincide(AUDIT_CATEGORIES.sensibles!, e.action)) return true;
  return AUDIT_REVIEW_CONDITIONAL[e.action]?.test(e) ?? false;
}

/** Por qué un asiento condicional entró a «Para revisar» (para el aviso de la pantalla), o null. */
export function auditReviewReason(e: AuditEntryData): string | null {
  const regla = AUDIT_REVIEW_CONDITIONAL[e.action];
  return regla && regla.test(e) ? regla.why : null;
}

/** Cómo se le dice a cada corrección manual de membresía (`membership.override.<clave>`). */
const CORRECCION: Readonly<Record<string, string>> = {
  activate: 'activarla', 'change-plan': 'cambiar el plan', create: 'crearla', reactivate: 'reactivarla', renew: 'renovarla',
  extend: 'extender la vigencia', cancel: 'cancelarla', freeze: 'congelarla', unfreeze: 'descongelarla',
};

/** Prefijos que no tienen frase propia pero sí una familia. */
const FAMILIAS: ReadonlyArray<[string, (action: string) => string]> = [
  ['membership.override.', (a) => { const c = a.split('.').pop()!; return `corrigió a mano la membresía{de socio} (${CORRECCION[c] ?? c.replace(/[-_]/g, ' ')})`; }],
  ['membership.', (a) => `membresía{de socio}: ${a.split('.').slice(1).join(' ').replace(/_/g, ' ')}`],
];

/** Lo que llena los huecos de una frase. Los importes llegan ya formateados ("$650.00"). */
export type AuditPhraseData = {
  amount?: string | null | undefined;
  /** Nombre del socio al que toca el asiento. */
  member?: string | null | undefined;
  /** Nombre de la persona del personal sobre la que se actuó. */
  person?: string | null | undefined;
};

const HUECO = /\{(?:(a|de|para|con) )?(socio|persona)(?:\|([^}]+))?\}/g;

function llenar(plantilla: string, d: AuditPhraseData): string {
  return plantilla
    .replace('{m}', d.amount ? ` de ${d.amount}` : '')
    .replace(HUECO, (_t, prep: string | undefined, quien: string, respaldo: string | undefined) => {
      const nombre = (quien === 'socio' ? d.member : d.person)?.trim();
      if (prep) return nombre ? ` ${prep} ${nombre}` : '';
      return nombre || respaldo || (quien === 'socio' ? 'un socio' : 'alguien');
    });
}

/**
 * La frase de una acción con sus huecos llenos. Sin importe, `{m}` desaparece;
 * sin nombre, `{socio}` dice «un socio» y `{a socio}` desaparece.
 */
export function auditLabel(action: string, opts: AuditPhraseData = {}): string {
  const base = AUDIT_LABELS[action];
  if (base) return llenar(base, opts);
  const familia = FAMILIAS.find(([p]) => action.startsWith(p));
  if (familia) return llenar(familia[1](action), opts);
  return action.replace(/[._]/g, ' ');
}

/** ¿Tiene frase propia o de familia? Lo usan las pruebas para no dejar claves crudas. */
export function hasAuditLabel(action: string): boolean {
  return action in AUDIT_LABELS || FAMILIAS.some(([p]) => action.startsWith(p));
}

/** ¿La frase de esta acción nombra al socio (o a la persona) por sí misma? */
export function auditLabelNames(action: string, quien: 'socio' | 'persona'): boolean {
  const base = AUDIT_LABELS[action] ?? FAMILIAS.find(([p]) => action.startsWith(p))?.[1](action) ?? '';
  return [...base.matchAll(HUECO)].some((m) => m[2] === quien);
}

/** En qué campo del estado viene el importe cuando no es `amountCents` ni `totalCents`. */
const IMPORTE_EN: Readonly<Record<string, string>> = {
  'billing.credit.apply': 'appliedCents',
};

/**
 * El importe de un asiento, en centavos y sin signo, o null si no lo trae.
 * Descuentos y condonaciones no guardan «cuánto» sino el ajustado antes y
 * después: el importe es la diferencia.
 */
export function auditAmountCents(e: AuditEntryData): bigint | null {
  const abs = (v: bigint) => (v < 0n ? -v : v);
  if (e.action === 'billing.discount.apply' || e.action === 'billing.waiver.apply') {
    const antes = centavos(campo(e.beforeState, 'adjustedCents'));
    const despues = centavos(campo(e.afterState, 'adjustedCents'));
    if (antes !== null && despues !== null && antes !== despues) return abs(despues - antes);
  }
  const llaves = [IMPORTE_EN[e.action], 'amountCents', 'totalCents'].filter((k): k is string => !!k);
  for (const estado of [e.afterState, e.beforeState]) {
    for (const k of llaves) {
      const v = centavos(campo(estado, k));
      if (v !== null) return abs(v);
    }
  }
  return null;
}

const pesos = (c: bigint): string => formatMoney(money(c));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] as const;

/**
 * LA FRASE COMPLETA DE UN ASIENTO (20-07): la arma el núcleo con los datos del
 * propio asiento (importe, diferencia del corte, nombre del módulo) y los
 * nombres que quien llama ya resolvió (socio, persona). Ninguna pantalla
 * vuelve a componerla.
 */
export function auditPhrase(e: AuditEntryData, nombres: { member?: string | null | undefined; person?: string | null | undefined } = {}): string {
  // La OPERACIÓN que se registró con la firma de un apoderado lo dice (D-02; bloque 3.16): el dato viaja
  // en el asiento (`approvedAsProxy`, `approvedProxyOfName`). El asiento de la firma misma lo dice abajo.
  const de = campo(e.afterState, 'approvedProxyOfName');
  const conApoderado = !e.action.startsWith('approval.') && campo(e.afterState, 'approvedAsProxy') === true
    ? ` · se autorizó como apoderado${typeof de === 'string' && de.trim() ? ` de ${de.trim()}` : ''}` : '';
  return `${fraseDelAsiento(e, nombres)}${conApoderado}`;
}

function fraseDelAsiento(e: AuditEntryData, nombres: { member?: string | null | undefined; person?: string | null | undefined }): string {
  const importe = auditAmountCents(e);
  const datos: AuditPhraseData = { amount: importe === null ? null : pesos(importe), member: nombres.member, person: nombres.person };
  const texto = (k: string): string | null => { const v = campo(e.afterState, k); return typeof v === 'string' && v.trim() ? v.trim() : null; };

  // El corte dice su diferencia: sin ella no es para revisar (20-06).
  if (e.action === 'cash.session.close') {
    const v = centavos(campo(e.afterState, 'varianceCents'));
    if (v === null) return llenar(AUDIT_LABELS[e.action]!, datos);
    return v === 0n ? 'hizo el corte de caja, sin diferencia' : `hizo el corte de caja con un ${v < 0n ? 'faltante' : 'sobrante'} de ${pesos(v < 0n ? -v : v)}`;
  }
  if (e.action === 'cash.session.open') {
    const fondo = centavos(campo(e.afterState, 'openingFloatCents'));
    return fondo === null ? llenar(AUDIT_LABELS[e.action]!, datos) : `abrió caja con ${pesos(fondo)} de fondo`;
  }
  // El cierre dice de qué mes (`afterState.month`, "2026-10").
  if (e.action === 'report.month.close') {
    const mes = /^(\d{4})-(\d{2})$/.exec(texto('month') ?? '');
    const nombre = mes ? MESES[Number(mes[2]) - 1] : undefined;
    return nombre ? `cerró el mes de ${nombre} de ${mes![1]}` : llenar(AUDIT_LABELS[e.action]!, datos);
  }
  // Módulos (ADR-036): el nombre viaja en el asiento.
  const modulo = /^settings\.module\.(branch\.)?(enable|disable)$/.exec(e.action);
  if (modulo) {
    const nombre = texto('name');
    if (!nombre) return llenar(AUDIT_LABELS[e.action]!, datos);
    const tambien = campo(e.afterState, 'alsoEnabled');
    const extra = Array.isArray(tambien) && tambien.length > 0 && tambien.every((x) => typeof x === 'string') ? ` (y también ${tambien.join(', ')})` : '';
    const sede = modulo[1] ? texto('branchName') : null;
    return `${modulo[2] === 'enable' ? 'encendió' : 'apagó'} el módulo ${nombre}${sede ? ` en ${sede}` : modulo[1] ? ' en una sucursal' : ''}${extra}`;
  }
  // La firma a distancia dice QUÉ se pidió (20-05): el resumen viaja en el asiento.
  // «Firmó como apoderado» (D-02): el asiento de quien firma con un nombramiento lo dice, con de quién.
  const apoderado = e.action.startsWith('approval.') && campo(e.afterState, 'asProxy') === true
    ? ` · firmó como apoderado${texto('proxyOfName') ? ` de ${texto('proxyOfName')}` : ''}` : '';
  // El nombramiento dice hasta cuándo (`afterState.endsOn`, "2026-12-05").
  if (e.action === 'approval.proxy.grant') {
    const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto('endsOn') ?? '');
    const mes = dia ? MESES[Number(dia[2]) - 1] : undefined;
    return `${auditLabel(e.action, datos)}${mes ? `, hasta el ${Number(dia![3])} de ${mes} de ${dia![1]}` : ''}`;
  }
  if (e.action.startsWith('approval.remote.')) {
    const resumen = texto('summary');
    if (resumen) return `${auditLabel(e.action, datos)}${apoderado} · ${resumen}`;
  }
  return `${auditLabel(e.action, datos)}${apoderado}`;
}

/** La categoría de una acción, si cae en alguna (sin contar `sensibles`, que es transversal). */
export function auditCategoryOf(action: string): string | null {
  for (const [cat, prefijos] of Object.entries(AUDIT_CATEGORIES)) {
    if (cat === 'sensibles') continue;
    if (coincide(prefijos, action)) return cat;
  }
  return null;
}
