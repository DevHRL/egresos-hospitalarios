/* Lo que se calcula a partir de los movimientos: dónde está cada paciente, el
   estado de cada cama, el censo, RENOXI e indicadores. Nada de esto se digita.
   Funciones puras sobre el estado (ver `hospitalizacion.js`). */

import { bloqueoDelDia, corteDelDia, diaDe, diasDelMes, estancia, hasta, mesDe, sumarDias, sumarHoras } from './tiempo.js'

export const TIPOS_EGRESO = [
  { value: 'alta_medica', label: 'Alta médica' },
  { value: 'alta_voluntaria', label: 'Alta voluntaria' },
  { value: 'fuga', label: 'Retiro sin alta (fuga)' },
  { value: 'referido', label: 'Referido a otro establecimiento' },
  { value: 'fallecido_menor_48', label: 'Fallecido antes de 48 h' },
  { value: 'fallecido_mayor_48', label: 'Fallecido después de 48 h' },
]

/* Sale de los servicios del sistema, pero no es un egreso del hospital. */
export const TRASLADO_NO_INCORPORADO = 'traslado_no_incorporado'

export const CONDICIONES_EGRESO = [
  { value: 'curado', label: 'Curado' },
  { value: 'mejorado', label: 'Mejorado' },
  { value: 'igual', label: 'Igual' },
  { value: 'peor', label: 'Peor' },
  { value: 'fallecido', label: 'Fallecido' },
]

export const ORIGENES = [
  { value: 'consulta_externa', label: 'Consulta externa' },
  { value: 'emergencia', label: 'Emergencia' },
  { value: 'referencia', label: 'Referencia' },
  { value: 'otro_servicio', label: 'Otro servicio' },
]

export const SOPORTES = [
  { value: 'ninguno', label: 'Sin soporte' },
  { value: 'o2', label: 'Con O2' },
  { value: 'vm', label: 'Ventilación mecánica' },
]

export const ESTADOS_EGRESO = {
  pendiente_hc: { label: 'Pendiente de HC', tono: 'warn' },
  completo: { label: 'Completo', tono: 'info' },
  observado: { label: 'Observado', tono: 'crit' },
  validado: { label: 'Validado', tono: 'ok' },
  cerrado: { label: 'Cerrado', tono: 'none' },
}

export const ESTADOS_HC = {
  pendiente_entrega: 'Pendiente de entrega',
  recibida: 'Recibida en Estadística',
  completada: 'Completada',
  devuelta: 'Devuelta a archivo',
}

export const ESTADOS_ORDEN_CAMA = {
  pendiente_retiro: 'Pendiente de retiro',
  en_reparacion: 'En reparación',
  lista_entrega: 'Lista para entregar',
  por_recibir: 'Por recibir en el servicio',
  cerrada: 'Cerrada',
}

export const etiqueta = (lista, valor) => lista.find((x) => x.value === valor)?.label ?? valor ?? '—'
export const etiquetaEgreso = (tipo) => (tipo === TRASLADO_NO_INCORPORADO ? 'Traslado a servicio no incorporado' : etiqueta(TIPOS_EGRESO, tipo))
export const esEgresoHospitalario = (tipo) => tipo !== TRASLADO_NO_INCORPORADO

const porHora = (a, b) => (a.fechaHora === b.fechaHora ? a.seq - b.seq : a.fechaHora < b.fechaHora ? -1 : 1)

/* Una cama dada de baja ya no está en el plano, pero la historia la sigue nombrando. */
export const camaPorId = (e, id) => e.camas.find((c) => c.id === id) ?? e.camasDeBaja?.find((c) => c.id === id)
export const pacientePorId = (e, id) => e.pacientes.find((p) => p.id === id)
export const hospitalizacionPorId = (e, id) => e.hospitalizaciones.find((h) => h.id === id)
export const serviciosConCamas = (e) => [...new Set(e.camas.map((c) => c.servicioId))]
export const departamentosConCamas = (e) => [...new Set(e.camas.map((c) => c.departamentoId))]
export const movimientosDe = (e, hId) => e.movimientos.filter((m) => m.hospitalizacionId === hId && !m.anulado).sort(porHora)

/* Dónde está el paciente justo antes de `limite`: { camaId, servicioId,
   soporte } o null si todavía no ingresó o ya salió. */
export function posicion(e, hId, limite) {
  let actual = null
  for (const m of movimientosDe(e, hId)) {
    if (m.fechaHora >= limite) break
    if (m.tipo === 'ingreso') actual = { camaId: m.camaId, servicioId: m.servicioId, soporte: 'ninguno' }
    if (m.tipo === 'traslado') actual = { ...actual, camaId: m.camaId, servicioId: m.servicioId }
    if (m.tipo === 'soporte') actual = { ...actual, soporte: m.soporte }
    if (m.tipo === 'egreso') actual = null
  }
  return actual
}

const vigentes = (e) => e.hospitalizaciones.filter((h) => !h.anulada)

export const posicionActual = (e, hId) => posicion(e, hId, hasta(e.ahora))

export function ocupantes(e, limite) {
  const mapa = new Map()
  for (const h of vigentes(e)) {
    const p = posicion(e, h.id, limite)
    if (p) mapa.set(p.camaId, [...(mapa.get(p.camaId) ?? []), { hospitalizacion: h, ...p }])
  }
  return mapa
}

/* Instantes en que dos pacientes habrían ocupado la misma cama. El registro
   diferido permite anotar un movimiento horas después, así que la cama se
   comprueba en toda la línea de tiempo y no solo ahora. */
export function choqueDeCamas(e) {
  const instantes = [...new Set(e.movimientos.filter((m) => !m.anulado).map((m) => m.fechaHora)), e.ahora]
  for (const instante of instantes) {
    for (const [camaId, lista] of ocupantes(e, hasta(instante))) {
      if (lista.length > 1) return { camaId, instante }
    }
  }
  return null
}

export function trasladoPendienteDe(e, hId) {
  return e.traslados.find((t) => t.hospitalizacionId === hId && t.estado === 'pendiente') ?? null
}

export const ordenCamaActiva = (e, camaId) => e.ordenesCama.find((o) => o.camaId === camaId && o.estado !== 'cerrada') ?? null

/* El estado que se pinta en el mapa. La falla reportada no quita la cama de
   servicio: solo lo hace el retiro sin reemplazo. */
export function estadoCama(e, cama, ocupacion = ocupantes(e, hasta(e.ahora))) {
  const ocupante = ocupacion.get(cama.id)?.[0] ?? null
  const orden = ordenCamaActiva(e, cama.id)
  const base = { cama, ocupante, orden, falla: orden?.estado === 'pendiente_retiro', trasladoPendiente: ocupante ? trasladoPendienteDe(e, ocupante.hospitalizacion.id) : null }
  if (cama.fueraDeServicio) return { ...base, estado: 'fuera' }
  if (ocupante) return { ...base, estado: ocupante.soporte === 'vm' ? 'ocupada_vm' : ocupante.soporte === 'o2' ? 'ocupada_o2' : 'ocupada' }
  if (cama.bloqueo) return { ...base, estado: 'bloqueada' }
  return { ...base, estado: 'libre' }
}

export const ESTADOS_CAMA_MAPA = {
  libre: { label: 'Libre', icono: 'sh-check', tono: 'ok' },
  ocupada: { label: 'Ocupada', icono: 'sh-profile', tono: 'info' },
  ocupada_o2: { label: 'Ocupada con O2', icono: 'sh-drop', tono: 'info' },
  ocupada_vm: { label: 'Ocupada con VM', icono: 'sh-drop', tono: 'warn' },
  bloqueada: { label: 'Bloqueada', icono: 'sh-shield', tono: 'none' },
  fuera: { label: 'Fuera de servicio', icono: 'sh-wrench', tono: 'crit' },
}

export function estadosDeCamas(e, servicios) {
  const ocupacion = ocupantes(e, hasta(e.ahora))
  return e.camas.filter((c) => !servicios || servicios.includes(c.servicioId)).map((c) => estadoCama(e, c, ocupacion))
}

export function resumenCamas(e, servicios) {
  const lista = estadosDeCamas(e, servicios)
  const cuenta = (...estados) => lista.filter((x) => estados.includes(x.estado)).length
  const operativas = lista.length - cuenta('fuera') - cuenta('bloqueada')
  const ocupadas = cuenta('ocupada', 'ocupada_o2', 'ocupada_vm')
  return { total: lista.length, operativas, ocupadas, disponibles: operativas - ocupadas, conO2: cuenta('ocupada_o2'), conVM: cuenta('ocupada_vm'), fuera: cuenta('fuera'), bloqueadas: cuenta('bloqueada') }
}

/* ── Censo diario ──────────────────────────────────────────────────────── */

export const claveCenso = (servicioId, dia) => `${servicioId}|${dia}`
export const registroCenso = (e, servicioId, dia) => e.censos[claveCenso(servicioId, dia)] ?? null

/* Un censo admite movimientos hasta que se cierra o hasta las 08:00 de D+1,
   salvo que Estadística lo reabra. */
export function censoEditable(e, servicioId, dia) {
  const r = registroCenso(e, servicioId, dia)
  if (r?.estado === 'cerrado') return false
  if (r?.estado === 'reabierto') return true
  return e.ahora < bloqueoDelDia(dia)
}

export function estadoCenso(e, servicioId, dia) {
  const r = registroCenso(e, servicioId, dia)
  if (r?.estado === 'cerrado') return { valor: 'cerrado', label: 'Cerrado', tono: r.observacion ? 'warn' : 'ok' }
  if (r?.estado === 'reabierto') return { valor: 'reabierto', label: 'Reabierto', tono: 'warn' }
  if (e.ahora >= bloqueoDelDia(dia)) return { valor: 'sin_cerrar', label: 'Sin cerrar', tono: 'crit' }
  if (e.ahora >= corteDelDia(dia)) return { valor: 'por_cerrar', label: 'Por cerrar', tono: 'warn' }
  return { valor: 'en_curso', label: 'En curso', tono: 'info' }
}

function servicioEn(e, hId, limite, servicioId) {
  const p = posicion(e, hId, limite)
  return p?.servicioId === servicioId ? p : null
}

/* Conteos del día y paciente-día, por servicio que atiende. */
export function cuadreCenso(e, servicioId, dia) {
  const inicio = `${dia}T00:00`
  const corte = corteDelDia(dia)
  const c = { saldoAnterior: 0, ingresos: 0, trasladosEntran: 0, egresos: 0, trasladosSalen: 0, pacientesCorte: 0, entraronYSalieron: 0 }
  for (const h of vigentes(e)) {
    if (servicioEn(e, h.id, inicio, servicioId)) c.saldoAnterior++
    const alCorte = servicioEn(e, h.id, corte, servicioId)
    if (alCorte) c.pacientesCorte++
    let entro = false
    let salio = false
    for (const m of movimientosDe(e, h.id)) {
      if (m.fechaHora < inicio || m.fechaHora >= corte) continue
      if (m.tipo === 'ingreso' && m.servicioId === servicioId) {
        /* Quien llega de un servicio aún no incorporado no entra al hospital: viene de otro servicio. */
        if (h.origen === 'otro_servicio') c.trasladosEntran++
        else c.ingresos++
        entro = true
      }
      if (m.tipo === 'traslado' && m.servicioOrigen !== m.servicioId) {
        if (m.servicioId === servicioId) { c.trasladosEntran++; entro = true }
        if (m.servicioOrigen === servicioId) { c.trasladosSalen++; salio = true }
      }
      if (m.tipo === 'egreso' && m.servicioId === servicioId) {
        salio = true
        if (esEgresoHospitalario(m.tipoEgreso)) c.egresos++
        else c.trasladosSalen++
      }
    }
    if (entro && salio && !alCorte) c.entraronYSalieron++
  }
  c.saldoCalculado = c.saldoAnterior + c.ingresos + c.trasladosEntran - c.egresos - c.trasladosSalen
  c.cuadra = c.saldoCalculado === c.pacientesCorte
  c.pacientesDia = c.pacientesCorte + c.entraronYSalieron
  return c
}

const letra = { ingreso: 'I', traslado: 'T', egreso: 'E' }

/* Si la cama estaba fuera o bloqueada en ese instante, no ahora: un día pasado se
   imprime igual aunque la cama ya haya vuelto. */
function camaFueraAl(e, cama, limite) {
  const ordenes = e.ordenesCama.filter((o) => o.camaId === cama.id)
  if (ordenes.length === 0) return cama.fueraDeServicio
  return ordenes.some((o) => o.conReemplazo === false && o.retiradaEn && o.retiradaEn < limite && (!o.recibidaEn || o.recibidaEn >= limite))
}

function camaBloqueadaAl(e, cama, limite) {
  if (!e.bloqueos) return Boolean(cama.bloqueo)
  return e.bloqueos.some((b) => b.camaId === cama.id && b.desde < limite && (!b.hasta || b.hasta >= limite))
}

/* Las filas del censo: una por cada cama del servicio, en orden, y una por
   cada paciente que pasó por el servicio ese día y ya no está al corte. */
export function filasCenso(e, servicioId, dia, nombre = (id) => id) {
  const inicio = `${dia}T00:00`
  const corte = corteDelDia(dia)
  const camas = e.camas.filter((c) => c.servicioId === servicioId).sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  const notas = registroCenso(e, servicioId, dia)?.notas ?? {}
  const filas = []
  const vistos = new Set()

  const fila = (h, camaId, p) => {
    const pac = pacientePorId(e, h.pacienteId)
    const delDia = movimientosDe(e, h.id).filter((m) => m.fechaHora >= inicio && m.fechaHora < corte && m.tipo !== 'soporte' && (m.servicioId === servicioId || m.servicioOrigen === servicioId))
    const relacion = delDia
      .filter((m) => m.tipo === 'traslado' && m.servicioOrigen !== m.servicioId)
      .map((m) => (m.servicioId === servicioId ? `De ${nombre(m.servicioOrigen)}` : `A ${nombre(m.servicioId)}`))
    const egreso = h.egreso && diaDe(h.egreso.fechaHora) === dia && delDia.some((m) => m.tipo === 'egreso') ? h.egreso : null
    return {
      clave: `${h.id}|${camaId}`,
      hospitalizacionId: h.id,
      camaId,
      camaCodigo: camaPorId(e, camaId)?.codigo ?? '—',
      hc: pac.hc,
      nombre: pac.nombres,
      nacimiento: pac.nacimiento,
      sexo: pac.sexo,
      fechaIngreso: h.fechaIngreso,
      dias: estancia(h.fechaIngreso, egreso?.fechaHora ?? corte),
      movimiento: delDia.map((m) => letra[m.tipo]).join(' · '),
      relacion: relacion.join(', '),
      soporte: p?.soporte ?? null,
      tipoEgreso: egreso?.tipo ?? null,
      observacion: notas[h.id] ?? '',
      cie10: egreso?.cie10?.[0] ?? null,
      medicoId: egreso?.medicoId ?? null,
      presenteAlCorte: Boolean(p),
    }
  }

  const ocupacion = ocupantes(e, corte)
  for (const cama of camas) {
    const lista = (ocupacion.get(cama.id) ?? []).filter((o) => o.servicioId === servicioId)
    if (lista.length === 0) {
      filas.push({ clave: cama.id, camaId: cama.id, camaCodigo: cama.codigo, vacia: true, estadoCama: camaFueraAl(e, cama, corte) ? 'fuera' : camaBloqueadaAl(e, cama, corte) ? 'bloqueada' : 'libre' })
    }
    for (const o of lista) {
      vistos.add(o.hospitalizacion.id)
      filas.push(fila(o.hospitalizacion, cama.id, o))
    }
  }

  for (const h of vigentes(e)) {
    if (vistos.has(h.id)) continue
    const paso = movimientosDe(e, h.id).filter((m) => m.fechaHora >= inicio && m.fechaHora < corte && (m.servicioId === servicioId || m.servicioOrigen === servicioId))
    const alInicio = servicioEn(e, h.id, inicio, servicioId)
    if (paso.length === 0 && !alInicio) continue
    const ultimo = [...paso].reverse().find((m) => m.camaId && m.servicioId === servicioId && m.tipo !== 'egreso')
    const origen = paso.find((m) => m.servicioOrigen === servicioId)
    const camaId = ultimo?.camaId ?? origen?.camaOrigen ?? paso.find((m) => m.tipo === 'egreso')?.camaId ?? alInicio?.camaId
    filas.push(fila(h, camaId, null))
  }
  const conPaciente = new Set(filas.filter((f) => !f.vacia).map((f) => f.camaId))
  return filas
    .filter((f) => !f.vacia || !conPaciente.has(f.camaId))
    .sort((a, b) => a.camaCodigo.localeCompare(b.camaCodigo, 'es', { numeric: true }))
}

/* Novedades de camas del día, para la sección del censo. */
export function novedadesCenso(e, servicioId, dia) {
  const lista = []
  for (const o of e.ordenesCama) {
    const cama = camaPorId(e, o.camaId)
    if (cama.servicioId !== servicioId) continue
    if (o.reportadaEn && diaDe(o.reportadaEn) === dia) lista.push({ clave: `${o.id}-r`, cama: cama.codigo, novedad: 'Falla reportada', detalle: o.falla, fecha: o.reportadaEn })
    if (o.retiradaEn && diaDe(o.retiradaEn) === dia) lista.push({ clave: `${o.id}-m`, cama: cama.codigo, novedad: o.conReemplazo ? 'Retirada con reemplazo' : 'Enviada a mantenimiento', detalle: o.falla, fecha: o.retiradaEn })
    if (o.recibidaEn && diaDe(o.recibidaEn) === dia) lista.push({ clave: `${o.id}-e`, cama: cama.codigo, novedad: 'Recibida de mantenimiento', detalle: o.diagnostico ?? '', fecha: o.recibidaEn })
  }
  return lista.sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
}

/* Cuadre de inventario: puestos fuera de servicio contra órdenes abiertas. */
export function cuadreInventario(e, servicioId) {
  const camas = e.camas.filter((c) => c.servicioId === servicioId)
  const fuera = camas.filter((c) => c.fueraDeServicio).length
  const ordenes = camas.filter((c) => {
    const o = ordenCamaActiva(e, c.id)
    return o && !o.conReemplazo && o.estado !== 'pendiente_retiro'
  }).length
  return { fuera, ordenes, cuadra: fuera === ordenes }
}

/* ── Reportes ──────────────────────────────────────────────────────────── */

/* Una fila por servicio con lo que pide el formulario de RENOXI. */
export function renoxiDelDia(e, dia) {
  const corte = corteDelDia(dia)
  const ocupacion = ocupantes(e, corte)
  return serviciosConCamas(e).map((servicioId) => {
    const camas = e.camas.filter((c) => c.servicioId === servicioId)
    let conO2 = 0
    let conVM = 0
    let sinO2 = 0
    for (const lista of ocupacion.values()) {
      for (const o of lista) {
        if (o.servicioId !== servicioId) continue
        if (o.soporte === 'o2') conO2++
        else if (o.soporte === 'vm') conVM++
        else sinO2++
      }
    }
    const operativas = camas.filter((c) => !camaFueraAl(e, c, corte) && !camaBloqueadaAl(e, c, corte)).length
    const ocupadas = sinO2 + conO2 + conVM
    return { servicioId, camas: camas.length, operativas, sinO2, conO2, conVM, ocupadas, disponibles: operativas - ocupadas }
  })
}

export const arranqueDe = (e, servicioId) => e.arranques?.[servicioId] ?? e.arranque

export function diasDesdeArranque(e, mes, servicioId) {
  const dias = []
  for (let d = arranqueDe(e, servicioId); d < diaDe(e.ahora) && mesDe(d) <= mes; d = sumarDias(d, 1)) {
    if (mesDe(d) === mes) dias.push(d)
  }
  return dias
}

/* Variables A a I por servicio. B sale solo de censos cerrados y E solo de
   egresos validados. D usa los días con censo cerrado: cuando el mes está
   completo coincide con A × días del mes. */
export function indicadoresDelMes(e, mes) {
  const filas = serviciosConCamas(e).map((servicioId) => {
    const A = e.camas.filter((c) => c.servicioId === servicioId).length
    const dias = diasDesdeArranque(e, mes, servicioId).filter((d) => registroCenso(e, servicioId, d)?.estado === 'cerrado')
    const B = dias.reduce((s, d) => s + cuadreCenso(e, servicioId, d).pacientesDia, 0)
    const egresos = vigentes(e).filter((h) => h.egreso && esEgresoHospitalario(h.egreso.tipo) && mesDe(h.egreso.fechaHora) === mes && ['validado', 'cerrado'].includes(h.egreso.estado) && h.egreso.servicioId === servicioId)
    const C = egresos.reduce((s, h) => s + estancia(h.fechaIngreso, h.egreso.fechaHora), 0)
    /* El promedio de permanencia deja fuera a quien no tiene fecha real de ingreso. */
    const conFecha = egresos.filter((h) => !h.fechaIngresoEstimada)
    const Cf = conFecha.reduce((s, h) => s + estancia(h.fechaIngreso, h.egreso.fechaHora), 0)
    return calcular({ servicioId, A, B, C, D: A * dias.length, E: egresos.length, Cf, Ef: conFecha.length, diasConCenso: dias.length })
  })
  return { filas, total: totalIndicadores(filas), diasDelMes: diasDelMes(mes) }
}

export function totalIndicadores(filas) {
  const suma = (k) => filas.reduce((s, f) => s + f[k], 0)
  return calcular({ servicioId: 'total', A: suma('A'), B: suma('B'), C: suma('C'), D: suma('D'), E: suma('E'), Cf: suma('Cf'), Ef: suma('Ef'), diasConCenso: Math.max(0, ...filas.map((f) => f.diasConCenso)) })
}

function calcular(f) {
  return {
    ...f,
    F: f.Ef ? f.Cf / f.Ef : null,
    G: f.D ? (f.B * 100) / f.D : null,
    H: f.A ? f.E / f.A : null,
    I: f.E ? (f.D - f.B) / f.E : null,
  }
}

/* ── Calidad del dato ──────────────────────────────────────────────────── */

export function validarCie(codigo, paciente, fecha) {
  const anios = +fecha.slice(0, 4) - +paciente.nacimiento.slice(0, 4)
  if (codigo.startsWith('O') && paciente.sexo !== 'F') return 'El código obstétrico no corresponde al sexo del paciente.'
  if (codigo.startsWith('P') && paciente.nacimiento && anios > 1) return 'El código perinatal no corresponde a la edad del paciente.'
  return null
}

const UMBRAL_ESTANCIA = 60
const UMBRAL_ORDEN_HORAS = 24
const UMBRAL_TRASLADO_HORAS = 6
const UMBRAL_HC_DIAS = 3

export function inconsistencias(e, nombre = (id) => id) {
  const lista = []
  const agregar = (clave, regla, detalle, tono = 'warn') => lista.push({ clave, regla, detalle, tono })
  for (const o of e.ordenes) {
    if (o.estado === 'pendiente' && sumarHoras(o.fechaHora, UMBRAL_ORDEN_HORAS) < e.ahora) {
      agregar(`o-${o.id}`, 'Orden sin cama confirmada', `${pacientePorId(e, o.pacienteId).nombres}, ${nombre(o.servicioId)}: más de ${UMBRAL_ORDEN_HORAS} h sin confirmación de enfermería.`)
    }
  }
  for (const t of e.traslados) {
    if (t.estado === 'pendiente' && sumarHoras(t.solicitadoEn, UMBRAL_TRASLADO_HORAS) < e.ahora) {
      agregar(`t-${t.id}`, 'Traslado sin confirmar', `${nombre(t.servicioOrigen)} a ${nombre(t.servicioDestino)}: más de ${UMBRAL_TRASLADO_HORAS} h sin confirmación del destino.`)
    }
  }
  for (const h of vigentes(e)) {
    const pac = pacientePorId(e, h.pacienteId)
    if (!h.egreso && estancia(h.fechaIngreso, e.ahora) > UMBRAL_ESTANCIA) agregar(`e-${h.id}`, 'Estancia prolongada', `${pac.nombres}: más de ${UMBRAL_ESTANCIA} días.`)
    if (h.egreso?.estado === 'pendiente_hc' && estancia(h.egreso.fechaHora, e.ahora) > UMBRAL_HC_DIAS) agregar(`h-${h.id}`, 'HC sin completar', `${pac.nombres}: egreso de hace más de ${UMBRAL_HC_DIAS} días.`, 'crit')
    if (h.egreso?.cie10?.[0]) {
      const error = validarCie(h.egreso.cie10[0], pac, h.egreso.fechaHora)
      if (error) agregar(`c-${h.id}`, 'CIE-10 incompatible', `${pac.nombres}: ${error}`, 'crit')
    }
  }
  for (const servicioId of serviciosConCamas(e)) {
    for (let d = arranqueDe(e, servicioId); d < diaDe(e.ahora); d = sumarDias(d, 1)) {
      if (estadoCenso(e, servicioId, d).valor === 'sin_cerrar') agregar(`s-${servicioId}-${d}`, 'Censo sin cerrar', `${nombre(servicioId)}, ${d}.`, 'crit')
      const r = registroCenso(e, servicioId, d)
      if (r?.estado === 'cerrado' && r.observacion) agregar(`b-${servicioId}-${d}`, 'Censo con observación', `${nombre(servicioId)}, ${d}: ${r.observacion}`)
    }
    const inv = cuadreInventario(e, servicioId)
    if (!inv.cuadra) agregar(`i-${servicioId}`, 'Inventario sin cuadrar', `${nombre(servicioId)}: ${inv.fuera} fuera de servicio y ${inv.ordenes} órdenes abiertas.`, 'crit')
  }
  for (const o of e.ordenesCama) {
    if (o.estado === 'por_recibir') agregar(`m-${o.id}`, 'Cama sin recibir', `${camaPorId(e, o.camaId).codigo}: mantenimiento la entregó y enfermería no confirmó.`)
  }
  return lista
}

/* ── Trazabilidad del dato ─────────────────────────────────────────────── */

/* Cada dato del episodio, quién lo completa y si ya está. */
export function camposDelEpisodio(e, h, nombreMedico = (id) => id, nombre = (id) => id) {
  const pac = pacientePorId(e, h.pacienteId)
  const orden = e.ordenes.find((o) => o.id === h.ordenId)
  const ingreso = movimientosDe(e, h.id).find((m) => m.tipo === 'ingreso')
  const cama = ingreso ? camaPorId(e, ingreso.camaId) : null
  const eg = h.egreso
  const campo = (dato, valor, responsable) => ({ dato, valor: valor ?? null, responsable })
  return [
    campo('N° de HC', pac.hc, 'Admisión'),
    campo('Documento', pac.dni, 'Admisión'),
    campo('Nombres', pac.nombres, 'Admisión'),
    campo('Sexo y fecha de nacimiento', `${pac.sexo} · ${pac.nacimiento}`, 'Admisión'),
    campo('Origen de la hospitalización', etiqueta(ORIGENES, orden?.origen), 'Admisión'),
    campo('Área de hospitalización', orden ? nombre(orden.servicioId) : null, 'Admisión'),
    campo('Cama de ingreso', cama?.codigo, 'Enfermería de piso'),
    campo('Fecha y hora de ingreso', h.fechaIngreso, 'Enfermería de piso'),
    campo('Soporte O2', 'Por movimiento', 'Enfermería de piso'),
    campo('Fecha y hora de egreso', eg?.fechaHora, 'Enfermería de piso'),
    campo('Tipo de egreso', eg ? etiquetaEgreso(eg.tipo) : null, 'Enfermería de piso'),
    campo('Condición de egreso', eg ? etiqueta(CONDICIONES_EGRESO, eg.condicion) : null, 'Enfermería de piso'),
    campo('Estancia', eg ? `${estancia(h.fechaIngreso, eg.fechaHora)} días` : null, 'Automático'),
    campo('CIE-10 de egreso', eg?.cie10?.join(', ') || null, 'Estadística, desde la HC'),
    campo('Médico del alta', eg?.medicoId ? nombreMedico(eg.medicoId) : null, 'Estadística, desde la HC'),
  ]
}
