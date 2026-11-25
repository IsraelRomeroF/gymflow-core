/**
 * MODELOS DE TEXTO DE CONSENTIMIENTO (UX5-PL-06; auditoría 8, 21-08).
 *
 * Son un PUNTO DE PARTIDA para que un gimnasio nuevo no empiece con la hoja
 * en blanco, no un dictamen legal (ADR-033: GymFlow no da asesoría jurídica).
 * Llevan los datos del gimnasio ya puestos y marcan entre [CORCHETES] lo que
 * solo el gimnasio sabe. Se guardan como BORRADOR: nadie firma nada hasta que
 * la gerencia lo revisa, lo completa y lo publica.
 *
 * Viven en el núcleo para que el servidor compruebe la lista de verificación
 * del aviso (`LISTA_DEL_AVISO_DE_PRIVACIDAD`) contra el mismo modelo que la
 * pantalla ofrece: el modelo del aviso, una vez completado, la cumple (hay
 * prueba).
 */
export type DatosDelGimnasio = {
  readonly razonSocial: string;
  readonly nombreComercial: string;
  readonly sucursales: readonly string[];
  /** Meses que se guardan los datos tras la baja (Conservación); sin plazo fijado queda un corchete. */
  readonly mesesDeConservacion?: number | null;
  /**
   * El plazo de baja del gimnasio (D-18, `churnDays`): días de terminada la
   * membresía sin renovar para contar como baja. Sin él, el de fábrica (30).
   * El aviso lo dice porque desde P-01 (bloque 4.18) la conservación cuenta
   * también esa baja, no solo la de recepción.
   */
  readonly diasDeBaja?: number | null;
};

const lista = (xs: readonly string[]) => (xs.length === 0 ? '[SUCURSALES]' : xs.join(', '));
/** El plazo de baja que dice el aviso: el del gimnasio, o el de fábrica (D-18: 30 días). */
const diasDeBaja = (g: DatosDelGimnasio): number => (typeof g.diasDeBaja === 'number' && Number.isInteger(g.diasDeBaja) && g.diasDeBaja > 0 ? g.diasDeBaja : 30);

export function modeloDeTexto(tipo: string, g: DatosDelGimnasio): { titulo: string; texto: string } | null {
  switch (tipo) {
    case 'PRIVACY_NOTICE':
      return {
        titulo: 'Aviso de privacidad integral',
        texto: `AVISO DE PRIVACIDAD INTEGRAL

${g.razonSocial} ("${g.nombreComercial}"), con domicilio en [DOMICILIO COMPLETO], es responsable del tratamiento de tus datos personales.

¿Qué datos usamos?
Nombre, fecha de nacimiento, teléfono, correo electrónico, contacto de emergencia, tu historial de pagos y de asistencia en nuestras sucursales (${lista(g.sucursales)}). Datos sensibles, solo si los autorizas por separado: datos sobre tu salud y la plantilla de tu rostro para entrar al gimnasio (cifrada en nuestro servidor; la foto no se guarda).

¿Para qué los usamos?
Finalidades necesarias: darte de alta como socio, administrar tu membresía, cobrarte y emitir tus comprobantes, controlar el acceso a las instalaciones y contactarte en caso de emergencia.
Finalidades adicionales (puedes negarte sin que afecte tu membresía): enviarte promociones y avisos de clases. Si no quieres que usemos tus datos para esto, retira ese permiso desde tu portal de socio, dilo en recepción o escríbenos a [CORREO DE PRIVACIDAD].

¿Con quién los compartimos?
Con el procesador de pagos que usamos para cobrar con tarjeta y con los proveedores de software que nos ayudan a administrar el gimnasio, solo para esas finalidades. [AGREGA AQUÍ CUALQUIER OTRA TRANSFERENCIA, O BORRA ESTE CORCHETE.]

Tus derechos (ARCO)
Puedes pedir acceso, rectificación, cancelación u oposición sobre tus datos, o revocar tu consentimiento, en recepción, desde tu portal de socio o escribiendo a [CORREO DE PRIVACIDAD]. Desde tu portal de socio puedes descargar tus datos, retirar permisos y pedir correcciones. Te responderemos en un plazo máximo de 20 días hábiles y, si procede, lo haremos efectivo en los 15 días hábiles siguientes.

¿Cuánto tiempo guardamos tus datos?
Mientras seas socio. Después de tu baja los conservamos ${g.mesesDeConservacion ? `${g.mesesDeConservacion} meses` : '[MESES DE CONSERVACIÓN TRAS LA BAJA]'} y luego se anonimizan; lo contable se conserva el tiempo que exige la ley fiscal. Para esto, tu baja es el día en que te damos de baja en recepción o cancelas tu membresía, o ${diasDeBaja(g)} días después de que tu membresía termine sin que la renueves; si sigues viniendo sin membresía (visitas sueltas, un paquete o clases), se cuenta ${diasDeBaja(g)} días después de tu última visita, y mientras tengas un paquete vigente no cuenta. Si registraste tu rostro, su plantilla se borra a los 30 días de tu baja si no regresas; si te damos de baja en recepción, además deja de usarse ese mismo día. Si el gimnasio deja de usar el reconocimiento de rostro, las plantillas dejan de usarse ese día y se borran a los 30 días si no lo retoma.

Cambios a este aviso
Cualquier cambio te lo daremos a conocer en recepción y en tu portal de socio.

Última actualización: [FECHA].`,
      };
    case 'HOUSE_RULES':
      return {
        titulo: 'Reglamento del gimnasio',
        texto: `REGLAMENTO DE ${g.nombreComercial.toUpperCase()}

1. Acceso. Entras con tu membresía vigente por los medios que el gimnasio tenga habilitados. Tu acceso es personal e intransferible.
2. Pagos. La membresía se paga por adelantado. Con pago pendiente, el acceso puede suspenderse hasta que te pongas al corriente.
3. Horario. El horario de cada sucursal (${lista(g.sucursales)}) está publicado en recepción: [HORARIO].
4. Uso de equipo. Regresa pesas y discos a su lugar, limpia el equipo después de usarlo y respeta los tiempos en los aparatos cuando haya fila.
5. Vestimenta. Ropa deportiva y calzado cerrado. [AGREGA LO QUE APLIQUE: TOALLA, CANDADO, ETC.]
6. Clases. Reserva con anticipación; si no puedes asistir, cancela para liberar tu lugar. [POLÍTICA DE FALTAS, SI LA HAY.]
7. Salud. Consulta a tu médico antes de iniciar un programa de ejercicio y avisa al personal si tienes alguna condición que debamos conocer.
8. Pertenencias. El gimnasio no se hace responsable por objetos olvidados o dejados fuera de los lockers. [AJUSTA SEGÚN TU POLÍTICA.]
9. Convivencia. Trato respetuoso con socios y personal. El gimnasio puede suspender la membresía a quien no respete este reglamento.

Al firmar aceptas este reglamento.`,
      };
    // Describe el tratamiento REAL de la cámara de recepción (ADR-040; 6-03,
    // 21-09): plantilla cifrada en el servidor del gimnasio, nunca la foto,
    // reconocimiento en la Estación de acceso de la sucursal donde se registra
    // y borrado en el acto al revocar. Si una sucursal instala un lector de
    // huella, su texto tiene que agregarlo en una versión nueva.
    case 'BIOMETRIC':
      return {
        titulo: 'Consentimiento para entrar con tu rostro',
        texto: `CONSENTIMIENTO EXPRESO PARA EL USO DE DATOS BIOMÉTRICOS

Autorizo a ${g.razonSocial} ("${g.nombreComercial}") a registrar mi rostro con el único fin de identificarme al entrar a la sucursal donde lo registro.

- Mi rostro se registra con la cámara de recepción. La foto no se guarda: solo una plantilla, que es una serie de números que sirve para reconocerme. La plantilla se guarda cifrada en el servidor del gimnasio, ligada a este consentimiento, y no se comparte con terceros.
- Se usa únicamente en la Estación de acceso de esa sucursal: me paro frente a la cámara, hago el movimiento que me pide y, si me reconoce, la entrada se decide igual que en recepción (membresía, horario y pagos).
- Es opcional: si no la autorizo, entro por recepción sin ningún costo. Si el gimnasio exige el rostro para entrar, cada una de mis visitas la autoriza la gerencia en recepción.
- Puedo revocar este consentimiento cuando quiera en recepción; la plantilla se borra en el acto y queda constancia del borrado. Si me dan de baja en recepción, mi rostro deja de reconocerse ese día; y en cualquier caso la plantilla se borra a los 30 días de mi baja (como la define el Aviso de privacidad) si no regreso. Si el gimnasio deja de usar el reconocimiento de rostro, la plantilla se borra a los 30 días si no lo retoma.

Este consentimiento es adicional al Aviso de privacidad, que conozco.`,
      };
    // El mandato de domiciliación (21-05). El monto y la tarjeta NO van en
    // este texto: los agrega el servidor al firmar, con el plan del socio de
    // ese día (`textoDelMandato`), para que la firma pruebe cuánto aceptó.
    case 'RECURRING_CHARGE':
      return {
        titulo: 'Autorización de cargo recurrente',
        texto: `AUTORIZACIÓN DE CARGO RECURRENTE A MI TARJETA

Autorizo a ${g.razonSocial} ("${g.nombreComercial}") a cobrar a la tarjeta que registro la cuota de mi membresía cada vez que se renueve, por el importe de mi plan vigente, hasta que yo retire esta autorización.

- El cargo se hace el día en que vence mi periodo. Si el precio de mi plan cambia, el gimnasio me avisa antes del siguiente cargo.
- Si un cargo no pasa, el gimnasio puede reintentarlo en los días siguientes y avisarme; mientras tanto puedo pagar en recepción.
- Puedo retirar esta autorización cuando quiera desde mi portal de socio o en recepción: mis tarjetas dejan de cobrarse solas en el acto y sigo pagando en recepción o desde mi portal.
- Los datos de mi tarjeta los guarda el procesador de pagos; el gimnasio solo conserva la marca y los últimos cuatro dígitos.

Abajo de este texto quedan anotados el plan, el importe y la tarjeta con que firmo.`,
      };
    case 'MARKETING':
      return {
        titulo: 'Avisos y promociones',
        texto: `AUTORIZACIÓN PARA RECIBIR AVISOS Y PROMOCIONES

Autorizo a ${g.razonSocial} ("${g.nombreComercial}") a enviarme promociones, novedades y avisos de clases por los medios de contacto que di.

Es opcional y no afecta mi membresía. Puedo retirar esta autorización cuando quiera desde mi portal de socio o en recepción.`,
      };
    case 'HEALTH_DATA':
      return {
        titulo: 'Datos de salud',
        texto: `CONSENTIMIENTO EXPRESO PARA EL USO DE DATOS DE SALUD

Autorizo a ${g.razonSocial} ("${g.nombreComercial}") a guardar la nota de salud que doy (lesiones, padecimientos o indicaciones médicas) con el único fin de que mi coach y el personal me atiendan con cuidado.

- Es un dato sensible: se guarda cifrado, solo lo ve el personal autorizado y cada consulta queda registrada.
- Es opcional y no afecta mi membresía.
- Puedo retirar este consentimiento cuando quiera desde mi portal de socio o en recepción: la nota se borra en el acto.`,
      };
    default:
      return null;
  }
}

/**
 * Lo que el servidor agrega al texto del mandato al firmarlo (21-05): el plan,
 * el importe y la tarjeta. Es parte de lo firmado (entra en la huella de la
 * evidencia), no un dato suelto en otra tabla.
 */
export function textoDelMandato(textoPublicado: string, d: { readonly plan: string | null; readonly importe: string | null; readonly tarjeta: string | null; readonly firmadoEl: string }): string {
  const lineas = [
    d.plan ? `Plan: ${d.plan}` : 'Plan: sin membresía vigente al firmar',
    d.importe ? `Importe de cada cargo: ${d.importe} (el de tu plan al firmar; si cambia, se te avisa antes)` : 'Importe de cada cargo: el de tu plan vigente el día del cargo',
    ...(d.tarjeta ? [`Tarjeta: ${d.tarjeta}`] : []),
    `Firmado el ${d.firmadoEl}`,
  ];
  return `${textoPublicado.trimEnd()}\n\n— Lo que autorizas —\n${lineas.join('\n')}`;
}
