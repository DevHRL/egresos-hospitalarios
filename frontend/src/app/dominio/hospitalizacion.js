/* El flujo de hospitalización como un único punto de cambio: toda modificación
   es una acción que pasa por `aplicar(estado, accion)`, que valida las reglas y
   los permisos de la cuenta y deja rastro en la bitácora. El censo, los
   reportes y los indicadores se calculan después (ver `consultas.js`).

   Admisión envía al paciente a un departamento; la cuenta del departamento
   designa habitación y cama, y con eso queda el área. Desde ahí el piso
   controla al paciente y a su cama. Los préstamos de cama aún no existen:
   una cama solo admite pacientes de su propio servicio. */

import {
  TRASLADO_NO_INCORPORADO,
  camaPorId,
  censoEditable,
  choqueDeCamas,
  departamentosConCamas,
  claveCenso,
  cuadreCenso,
  diasDesdeArranque,
  esEgresoHospitalario,
  hospitalizacionPorId,
  movimientosDe,
  ordenCamaActiva,
  ocupantes,
  pacientePorId,
  posicionActual,
  registroCenso,
  serviciosConCamas,
  trasladoPendienteDe,
  validarCie,
} from './consultas.js'
import { corteDelDia, diaDe, esFechaHora, hasta, mesDe } from './tiempo.js'

export class ErrorRegla extends Error {}

const falla = (mensaje) => {
  throw new ErrorRegla(mensaje)
}

/* Desde el 2026-11-11 solo el piso registra movimientos de su paciente. */
const ENFERMERIA = ['enfermeria']
const CENSO = ['enfermeria', 'jefatura']

/* Roles que pueden ejecutar cada acción; `sistema` carga la demostración. */
const PERMISOS = {
  'orden/registrar': ['admision'],
  'orden/anular': ['admision'],
  'ingreso/confirmar': ['departamento'],
  'traslado/registrar': ENFERMERIA,
  'traslado/confirmar': ENFERMERIA,
  'traslado/cancelar': ENFERMERIA,
  'soporte/cambiar': ENFERMERIA,
  'egreso/registrar': ENFERMERIA,
  'movimiento/anular': ENFERMERIA,
  'cama/bloquear': ['enfermeria'],
  'cama/desbloquear': ['enfermeria'],
  'falla/reportar': ['enfermeria'],
  'mant/recibir': ['enfermeria'],
  'mant/retirar': ['mantenimiento'],
  'mant/resolver': ['mantenimiento'],
  'mant/entregar': ['mantenimiento'],
  'censo/cerrar': CENSO,
  'censo/nota': CENSO,
  'censo/reabrir': ['jefatura'],
  'hc/recibir': ['tecnico', 'jefatura'],
  'hc/devolver': ['tecnico', 'jefatura'],
  'egreso/completar': ['tecnico', 'jefatura'],
  'egreso/validar': ['tecnico', 'jefatura'],
  'egreso/observar': ['tecnico', 'jefatura'],
  'mes/cerrar': ['jefatura'],
  'renoxi/marcar': ['camas', 'jefatura'],
}

const DESCRIPCION = {
  'orden/registrar': 'Registró una orden de hospitalización',
  'orden/anular': 'Anuló una orden de hospitalización',
  'ingreso/confirmar': 'Designó habitación y cama',
  'traslado/registrar': 'Registró un traslado',
  'traslado/confirmar': 'Confirmó la llegada de un traslado',
  'traslado/cancelar': 'Canceló un traslado',
  'soporte/cambiar': 'Cambió el soporte de oxígeno',
  'egreso/registrar': 'Registró un egreso',
  'movimiento/anular': 'Anuló un movimiento',
  'cama/bloquear': 'Bloqueó una cama',
  'cama/desbloquear': 'Desbloqueó una cama',
  'falla/reportar': 'Reportó una cama con falla',
  'mant/retirar': 'Confirmó el retiro de una cama',
  'mant/resolver': 'Registró el resultado de la reparación',
  'mant/entregar': 'Entregó una cama al servicio',
  'mant/recibir': 'Confirmó la recepción de una cama',
  'censo/cerrar': 'Cerró un censo',
  'censo/nota': 'Escribió una observación en el censo',
  'censo/reabrir': 'Reabrió un censo',
  'hc/recibir': 'Recibió una HC física',
  'hc/devolver': 'Devolvió una HC a archivo',
  'egreso/completar': 'Completó un egreso desde la HC',
  'egreso/validar': 'Validó un egreso',
  'egreso/observar': 'Observó un egreso',
  'mes/cerrar': 'Cerró un mes',
  'renoxi/marcar': 'Marcó RENOXI como cargado',
}

/* Camas del plano como maestro de puestos del flujo. `departamentoDe` dice a
   qué departamento pertenece cada servicio (sale del catálogo, en datos/). */
export function maestroDesdePlano(plano, departamentoDe) {
  const zonas = new Map(plano.zonas.map((z) => [z.id, z]))
  return plano.camas.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    zonaId: c.zonaId,
    habitacion: zonas.get(c.zonaId).codigo,
    servicioId: c.servicioId ?? zonas.get(c.zonaId).servicioId,
    departamentoId: departamentoDe(c.servicioId ?? zonas.get(c.zonaId).servicioId),
    activo: `CAM-${c.codigo}`,
    bloqueo: null,
    fueraDeServicio: false,
  }))
}

export function estadoInicial(camas, ahora) {
  return {
    version: 1,
    ahora,
    arranque: diaDe(ahora),
    seq: 0,
    camas,
    pacientes: [],
    ordenes: [],
    hospitalizaciones: [],
    movimientos: [],
    traslados: [],
    ordenesCama: [],
    censos: {},
    renoxi: {},
    mesesCerrados: [],
    bitacora: [],
  }
}

const reemplazar = (lista, id, cambios) => lista.map((x) => (x.id === id ? { ...x, ...cambios } : x))
const texto = (v) => (v ?? '').trim()

function nuevoId(e, prefijo) {
  e.seq += 1
  return `${prefijo}-${e.seq}`
}

function asegurarServicio(cuenta, servicioId) {
  if (['enfermeria', 'departamento'].includes(cuenta.rol) && !cuenta.servicios.includes(servicioId)) falla('Esta cuenta solo opera las camas de su servicio.')
}

function asegurarFecha(e, fechaHora) {
  if (!esFechaHora(fechaHora)) falla('Escribe la fecha y la hora completas (HH:mm).')
  if (fechaHora > e.ahora) falla('La hora del movimiento no puede ser futura.')
}

function asegurarEditable(e, servicioId, fechaHora) {
  asegurarFecha(e, fechaHora)
  if (fechaHora < `${e.arranque}T00:00`) falla('La fecha es anterior al arranque del sistema.')
  if (!censoEditable(e, servicioId, diaDe(fechaHora))) falla('El censo de ese día ya se cerró o se recogió. Solo Estadística puede reabrirlo.')
}

function asegurarCamaLista(e, cama) {
  if (cama.fueraDeServicio) falla(`La cama ${cama.codigo} está fuera de servicio.`)
  if (cama.bloqueo) falla(`La cama ${cama.codigo} está bloqueada.`)
  if (ocupantes(e, hasta(e.ahora)).get(cama.id)?.length) falla(`La cama ${cama.codigo} está ocupada.`)
}

function hospitalizacionAbierta(e, id) {
  const h = hospitalizacionPorId(e, id)
  if (!h || h.anulada || h.egreso) falla('La hospitalización ya no está abierta.')
  return h
}

/* Un movimiento nuevo no puede ir antes del último de ese paciente. */
function asegurarOrden(e, hId, fechaHora) {
  const previos = movimientosDe(e, hId)
  const ultimo = previos[previos.length - 1]
  if (ultimo && fechaHora < ultimo.fechaHora) falla('La hora es anterior al último movimiento del paciente.')
}

function agregarMovimiento(e, datos, cuenta) {
  e.seq += 1
  const m = { id: `mov-${e.seq}`, seq: e.seq, anulado: false, motivoAnulacion: null, registradoEn: e.ahora, cuenta: cuenta.id, ...datos }
  e.movimientos = [...e.movimientos, m]
  return m
}

function cerrarConsistencia(e) {
  const choque = choqueDeCamas(e)
  if (choque) falla(`Dos pacientes ocuparían la cama ${camaPorId(e, choque.camaId).codigo} a la vez.`)
}

export function aplicar(estado, accion) {
  const { tipo, cuenta, ...d } = accion
  const permitidos = PERMISOS[tipo]
  if (!permitidos) throw new Error(`Acción desconocida: ${tipo}`)
  if (cuenta.rol !== 'sistema' && !permitidos.includes(cuenta.rol)) falla('Esta cuenta no tiene permiso para esta acción.')

  const e = { ...estado }
  let detalle = d.detalle ?? ''

  switch (tipo) {
    case 'orden/registrar': {
      if (!departamentosConCamas(e).includes(d.departamentoId)) falla('Elige el departamento de hospitalización.')
      if (!['consulta_externa', 'emergencia'].includes(d.origen)) falla('Indica si viene de consulta externa o de emergencia.')
      if (d.origen === 'emergencia' && !texto(d.enviadaPor)) falla('Indica qué enfermera de emergencia envió la orden.')
      let paciente = d.pacienteId ? pacientePorId(e, d.pacienteId) : null
      if (!paciente) {
        const p = d.paciente ?? {}
        if (!/^\d{4,10}$/.test(texto(p.hc))) falla('El N° de HC debe tener solo números.')
        if (!/^\d{8}$/.test(texto(p.dni))) falla('El DNI debe tener 8 dígitos.')
        if (!texto(p.nombres)) falla('Escribe los nombres del paciente.')
        if (!['F', 'M'].includes(p.sexo)) falla('Indica el sexo del paciente.')
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.nacimiento ?? '')) falla('Indica la fecha de nacimiento.')
        if (e.pacientes.some((x) => x.hc === texto(p.hc) || x.dni === texto(p.dni))) falla('Ya existe un paciente con esa HC o ese DNI. Búscalo en el padrón.')
        paciente = { id: nuevoId(e, 'pac'), hc: texto(p.hc), dni: texto(p.dni), nombres: texto(p.nombres), sexo: p.sexo, nacimiento: p.nacimiento }
        e.pacientes = [...e.pacientes, paciente]
      }
      if (e.ordenes.some((o) => o.pacienteId === paciente.id && o.estado === 'pendiente')) falla('Ese paciente ya tiene una orden de hospitalización pendiente.')
      if (e.hospitalizaciones.some((h) => h.pacienteId === paciente.id && !h.anulada && !h.egreso)) falla('Ese paciente ya está hospitalizado.')
      const orden = {
        id: nuevoId(e, 'ord'),
        pacienteId: paciente.id,
        origen: d.origen,
        departamentoId: d.departamentoId,
        servicioId: null,
        fechaHora: e.ahora,
        medicoOrdena: texto(d.medicoOrdena),
        diagnosticoIngreso: texto(d.diagnosticoIngreso),
        enviadaPor: texto(d.enviadaPor),
        estado: 'pendiente',
        hospitalizacionId: null,
      }
      e.ordenes = [...e.ordenes, orden]
      detalle = `${paciente.nombres} a ${d.departamentoId}`
      break
    }

    case 'orden/anular': {
      const o = e.ordenes.find((x) => x.id === d.ordenId)
      if (!o || o.estado !== 'pendiente') falla('Solo se anula una orden pendiente.')
      if (!texto(d.motivo)) falla('Escribe el motivo de la anulación.')
      e.ordenes = reemplazar(e.ordenes, o.id, { estado: 'anulada', motivoAnulacion: texto(d.motivo) })
      detalle = texto(d.motivo)
      break
    }

    case 'ingreso/confirmar': {
      const o = e.ordenes.find((x) => x.id === d.ordenId)
      if (!o || o.estado !== 'pendiente') falla('La orden ya no está pendiente.')
      const cama = camaPorId(e, d.camaId)
      if (!cama) falla('Elige la habitación y la cama.')
      if (cama.departamentoId !== o.departamentoId) falla('La cama debe ser del departamento al que Admisión envió al paciente.')
      asegurarServicio(cuenta, cama.servicioId)
      asegurarEditable(e, cama.servicioId, d.fechaHora)
      if (d.fechaHora < o.fechaHora) falla('La hora de ingreso no puede ser anterior a la orden de Admisión.')
      asegurarCamaLista(e, cama)
      const h = {
        id: nuevoId(e, 'hos'),
        pacienteId: o.pacienteId,
        ordenId: o.id,
        origen: o.origen,
        fechaIngreso: d.fechaHora,
        diagnosticoIngreso: o.diagnosticoIngreso,
        egreso: null,
        anulada: false,
      }
      e.hospitalizaciones = [...e.hospitalizaciones, h]
      e.ordenes = reemplazar(e.ordenes, o.id, { estado: 'ingresada', servicioId: cama.servicioId, hospitalizacionId: h.id })
      agregarMovimiento(e, { hospitalizacionId: h.id, tipo: 'ingreso', fechaHora: d.fechaHora, camaId: cama.id, servicioId: cama.servicioId }, cuenta)
      cerrarConsistencia(e)
      detalle = `Cama ${cama.codigo} en ${cama.servicioId}`
      break
    }

    case 'traslado/registrar': {
      const h = hospitalizacionAbierta(e, d.hospitalizacionId)
      const actual = posicionActual(e, h.id)
      asegurarServicio(cuenta, actual.servicioId)
      if (trasladoPendienteDe(e, h.id)) falla('El paciente ya tiene un traslado pendiente.')
      if (d.servicioDestino === actual.servicioId) {
        const cama = camaPorId(e, d.camaId)
        if (!cama || cama.id === actual.camaId) falla('Elige la cama nueva.')
        if (cama.servicioId !== actual.servicioId) falla('La cama debe ser del mismo servicio.')
        asegurarEditable(e, actual.servicioId, d.fechaHora)
        asegurarOrden(e, h.id, d.fechaHora)
        asegurarCamaLista(e, cama)
        agregarMovimiento(e, { hospitalizacionId: h.id, tipo: 'traslado', fechaHora: d.fechaHora, camaId: cama.id, servicioId: actual.servicioId, servicioOrigen: actual.servicioId, camaOrigen: actual.camaId }, cuenta)
        cerrarConsistencia(e)
        detalle = `Cambio de cama a ${cama.codigo}`
      } else {
        if (!serviciosConCamas(e).includes(d.servicioDestino)) falla('Elige el servicio de destino.')
        const t = { id: nuevoId(e, 'tra'), hospitalizacionId: h.id, servicioOrigen: actual.servicioId, servicioDestino: d.servicioDestino, camaOrigen: actual.camaId, solicitadoEn: e.ahora, estado: 'pendiente' }
        e.traslados = [...e.traslados, t]
        detalle = `${actual.servicioId} a ${d.servicioDestino}`
      }
      break
    }

    case 'traslado/confirmar': {
      const t = e.traslados.find((x) => x.id === d.trasladoId)
      if (!t || t.estado !== 'pendiente') falla('El traslado ya no está pendiente.')
      asegurarServicio(cuenta, t.servicioDestino)
      const cama = camaPorId(e, d.camaId)
      if (!cama || cama.servicioId !== t.servicioDestino) falla('Elige una cama de tu servicio.')
      asegurarEditable(e, t.servicioDestino, d.fechaHora)
      asegurarEditable(e, t.servicioOrigen, d.fechaHora)
      asegurarOrden(e, t.hospitalizacionId, d.fechaHora)
      asegurarCamaLista(e, cama)
      agregarMovimiento(e, { hospitalizacionId: t.hospitalizacionId, tipo: 'traslado', fechaHora: d.fechaHora, camaId: cama.id, servicioId: t.servicioDestino, servicioOrigen: t.servicioOrigen, camaOrigen: t.camaOrigen }, cuenta)
      e.traslados = reemplazar(e.traslados, t.id, { estado: 'confirmado', confirmadoEn: e.ahora })
      cerrarConsistencia(e)
      detalle = `Cama ${cama.codigo}`
      break
    }

    case 'traslado/cancelar': {
      const t = e.traslados.find((x) => x.id === d.trasladoId)
      if (!t || t.estado !== 'pendiente') falla('El traslado ya no está pendiente.')
      asegurarServicio(cuenta, t.servicioOrigen)
      e.traslados = reemplazar(e.traslados, t.id, { estado: 'cancelado' })
      break
    }

    case 'soporte/cambiar': {
      const h = hospitalizacionAbierta(e, d.hospitalizacionId)
      const actual = posicionActual(e, h.id)
      asegurarServicio(cuenta, actual.servicioId)
      asegurarEditable(e, actual.servicioId, d.fechaHora)
      asegurarOrden(e, h.id, d.fechaHora)
      if (actual.soporte === d.soporte) falla('El paciente ya tiene ese soporte.')
      agregarMovimiento(e, { hospitalizacionId: h.id, tipo: 'soporte', fechaHora: d.fechaHora, camaId: actual.camaId, servicioId: actual.servicioId, soporte: d.soporte }, cuenta)
      detalle = d.soporte === 'o2' ? 'Inicio de O2' : 'Retiro de O2'
      break
    }

    case 'egreso/registrar': {
      const h = hospitalizacionAbierta(e, d.hospitalizacionId)
      const actual = posicionActual(e, h.id)
      asegurarServicio(cuenta, actual.servicioId)
      if (trasladoPendienteDe(e, h.id)) falla('Cancela o confirma primero el traslado pendiente.')
      asegurarEditable(e, actual.servicioId, d.fechaHora)
      asegurarOrden(e, h.id, d.fechaHora)
      if (!d.tipoEgreso) falla('Elige el tipo de egreso.')
      const hospitalario = esEgresoHospitalario(d.tipoEgreso)
      if (hospitalario && !d.condicion) falla('Elige la condición de egreso.')
      if (!hospitalario && !texto(d.destino)) falla('Indica el servicio de destino.')
      agregarMovimiento(e, { hospitalizacionId: h.id, tipo: 'egreso', fechaHora: d.fechaHora, camaId: actual.camaId, servicioId: actual.servicioId, tipoEgreso: d.tipoEgreso }, cuenta)
      const egreso = {
        fechaHora: d.fechaHora,
        tipo: d.tipoEgreso,
        condicion: d.condicion ?? null,
        destino: texto(d.destino),
        servicioId: actual.servicioId,
        medicoId: d.medicoId || null,
        cie10: [],
        estado: hospitalario ? 'pendiente_hc' : null,
        hc: hospitalario ? 'pendiente_entrega' : null,
      }
      e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { egreso })
      detalle = d.tipoEgreso
      break
    }

    case 'movimiento/anular': {
      const m = e.movimientos.find((x) => x.id === d.movimientoId)
      if (!m || m.anulado) falla('El movimiento ya no se puede anular.')
      if (!texto(d.motivo)) falla('Escribe el motivo de la anulación.')
      asegurarServicio(cuenta, m.servicioId)
      asegurarEditable(e, m.servicioId, m.fechaHora)
      const propios = movimientosDe(e, m.hospitalizacionId)
      if (propios[propios.length - 1].id !== m.id) falla('Solo se puede anular el último movimiento del paciente.')
      const h = hospitalizacionPorId(e, m.hospitalizacionId)
      if (m.tipo === 'egreso' && h.egreso?.estado && h.egreso.estado !== 'pendiente_hc') falla('Estadística ya trabajó ese egreso.')
      e.movimientos = reemplazar(e.movimientos, m.id, { anulado: true, motivoAnulacion: texto(d.motivo) })
      if (m.tipo === 'ingreso') {
        e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { anulada: true })
        e.ordenes = reemplazar(e.ordenes, h.ordenId, { estado: 'pendiente', hospitalizacionId: null })
      }
      if (m.tipo === 'egreso') e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { egreso: null })
      cerrarConsistencia(e)
      detalle = texto(d.motivo)
      break
    }

    case 'cama/bloquear': {
      const cama = camaPorId(e, d.camaId)
      asegurarServicio(cuenta, cama.servicioId)
      asegurarCamaLista(e, cama)
      if (!texto(d.motivo)) falla('Escribe el motivo del bloqueo.')
      e.camas = reemplazar(e.camas, cama.id, { bloqueo: { motivo: texto(d.motivo), desde: e.ahora } })
      detalle = cama.codigo
      break
    }

    case 'cama/desbloquear': {
      const cama = camaPorId(e, d.camaId)
      asegurarServicio(cuenta, cama.servicioId)
      e.camas = reemplazar(e.camas, cama.id, { bloqueo: null })
      detalle = cama.codigo
      break
    }

    case 'falla/reportar': {
      const cama = camaPorId(e, d.camaId)
      asegurarServicio(cuenta, cama.servicioId)
      if (cama.fueraDeServicio || ordenCamaActiva(e, cama.id)) falla('Esa cama ya tiene una orden de mantenimiento abierta.')
      if (!texto(d.falla)) falla('Describe la falla.')
      e.ordenesCama = [...e.ordenesCama, { id: nuevoId(e, 'man'), camaId: cama.id, activo: cama.activo, falla: texto(d.falla), reportadaEn: e.ahora, estado: 'pendiente_retiro', conReemplazo: null, retiradaEn: null, diagnostico: null, resultado: null, resueltaEn: null, entregadaEn: null, recibidaEn: null }]
      detalle = `${cama.codigo}: ${texto(d.falla)}`
      break
    }

    case 'mant/retirar': {
      const o = e.ordenesCama.find((x) => x.id === d.ordenId)
      if (!o || o.estado !== 'pendiente_retiro') falla('La orden ya no está pendiente de retiro.')
      const cama = camaPorId(e, o.camaId)
      if (ocupantes(e, hasta(e.ahora)).get(cama.id)?.length) falla(`La cama ${cama.codigo} tiene un paciente. Debe liberarse antes del retiro.`)
      e.ordenesCama = reemplazar(e.ordenesCama, o.id, { estado: 'en_reparacion', conReemplazo: Boolean(d.conReemplazo), retiradaEn: e.ahora })
      e.camas = reemplazar(e.camas, cama.id, d.conReemplazo ? { activo: `${cama.activo}-R` } : { fueraDeServicio: true })
      detalle = `${cama.codigo} ${d.conReemplazo ? 'con reemplazo' : 'sin reemplazo'}`
      break
    }

    case 'mant/resolver': {
      const o = e.ordenesCama.find((x) => x.id === d.ordenId)
      if (!o || o.estado !== 'en_reparacion') falla('La orden no está en reparación.')
      if (!texto(d.diagnostico)) falla('Escribe el diagnóstico.')
      if (!['reparada', 'baja'].includes(d.resultado)) falla('Indica si la cama quedó reparada o de baja.')
      e.ordenesCama = reemplazar(e.ordenesCama, o.id, { diagnostico: texto(d.diagnostico), resultado: d.resultado, resueltaEn: e.ahora, estado: o.conReemplazo ? 'cerrada' : 'lista_entrega' })
      detalle = d.resultado
      break
    }

    case 'mant/entregar': {
      const o = e.ordenesCama.find((x) => x.id === d.ordenId)
      if (!o || o.estado !== 'lista_entrega') falla('La orden no está lista para entregar.')
      e.ordenesCama = reemplazar(e.ordenesCama, o.id, { estado: 'por_recibir', entregadaEn: e.ahora })
      detalle = camaPorId(e, o.camaId).codigo
      break
    }

    case 'mant/recibir': {
      const o = e.ordenesCama.find((x) => x.id === d.ordenId)
      if (!o || o.estado !== 'por_recibir') falla('La cama no está por recibir.')
      const cama = camaPorId(e, o.camaId)
      asegurarServicio(cuenta, cama.servicioId)
      e.ordenesCama = reemplazar(e.ordenesCama, o.id, { estado: 'cerrada', recibidaEn: e.ahora })
      e.camas = reemplazar(e.camas, cama.id, { fueraDeServicio: false })
      detalle = cama.codigo
      break
    }

    case 'censo/cerrar': {
      asegurarServicio(cuenta, d.servicioId)
      const r = registroCenso(e, d.servicioId, d.dia)
      if (r?.estado === 'cerrado') falla('Ese censo ya está cerrado.')
      if (e.ahora < corteDelDia(d.dia)) falla('El censo se cierra después de las 24:00 del día.')
      if (!r && !censoEditable(e, d.servicioId, d.dia) && cuenta.rol === 'enfermeria') falla('Pasaron las 08:00: solo Estadística puede cerrar este censo.')
      const c = cuadreCenso(e, d.servicioId, d.dia)
      if (!Number.isInteger(d.conteoFisico) || d.conteoFisico < 0) falla('Escribe cuántos pacientes había en sala al corte.')
      const diferencia = d.conteoFisico !== c.pacientesCorte
      if ((diferencia || !c.cuadra) && !texto(d.observacion)) falla('El conteo no coincide con el sistema: escribe una observación.')
      e.censos = { ...e.censos, [claveCenso(d.servicioId, d.dia)]: { ...r, estado: 'cerrado', conteoFisico: d.conteoFisico, observacion: texto(d.observacion), cerradoEn: e.ahora, cerradoPor: cuenta.id } }
      detalle = `${d.servicioId} ${d.dia}`
      break
    }

    case 'censo/nota': {
      asegurarServicio(cuenta, d.servicioId)
      if (!censoEditable(e, d.servicioId, d.dia)) falla('El censo de ese día ya no admite cambios.')
      const r = registroCenso(e, d.servicioId, d.dia)
      e.censos = { ...e.censos, [claveCenso(d.servicioId, d.dia)]: { estado: 'abierto', ...r, notas: { ...r?.notas, [d.hospitalizacionId]: texto(d.nota) } } }
      break
    }

    case 'censo/reabrir': {
      const r = registroCenso(e, d.servicioId, d.dia)
      if (r?.estado !== 'cerrado') falla('Solo se reabre un censo cerrado.')
      if (e.mesesCerrados.includes(mesDe(d.dia))) falla('El mes de ese censo ya está cerrado.')
      if (!texto(d.motivo)) falla('Escribe el motivo de la reapertura.')
      e.censos = { ...e.censos, [claveCenso(d.servicioId, d.dia)]: { ...r, estado: 'reabierto', motivoReapertura: texto(d.motivo) } }
      detalle = `${d.servicioId} ${d.dia}: ${texto(d.motivo)}`
      break
    }

    case 'hc/recibir': {
      const h = e.hospitalizaciones.find((x) => !x.anulada && x.egreso?.hc === 'pendiente_entrega' && pacientePorId(e, x.pacienteId).hc === texto(d.hc))
      if (!h) falla(`No hay un egreso esperando la HC ${texto(d.hc)}.`)
      e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { egreso: { ...h.egreso, hc: 'recibida', hcRecibidaEn: e.ahora } })
      detalle = texto(d.hc)
      break
    }

    case 'hc/devolver': {
      const h = hospitalizacionPorId(e, d.hospitalizacionId)
      if (h?.egreso?.hc !== 'completada') falla('Primero se completa el egreso con la HC.')
      e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { egreso: { ...h.egreso, hc: 'devuelta' } })
      break
    }

    case 'egreso/completar': {
      const h = hospitalizacionPorId(e, d.hospitalizacionId)
      if (!['pendiente_hc', 'observado'].includes(h?.egreso?.estado)) falla('Ese egreso no está pendiente de completar.')
      const principal = texto(d.cie10)
      if (!principal) falla('Elige el CIE-10 principal.')
      if (!d.medicoId) falla('Elige el médico que dio el alta.')
      const error = validarCie(principal, pacientePorId(e, h.pacienteId), h.egreso.fechaHora)
      if (error) falla(error)
      const secundarios = (d.secundarios ?? []).filter(Boolean)
      e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { egreso: { ...h.egreso, cie10: [principal, ...secundarios], medicoId: d.medicoId, estado: 'completo', hc: 'completada', motivoObservacion: null, completadoEn: e.ahora } })
      detalle = principal
      break
    }

    case 'egreso/validar': {
      const h = hospitalizacionPorId(e, d.hospitalizacionId)
      if (h?.egreso?.estado !== 'completo') falla('Solo se valida un egreso completo.')
      e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { egreso: { ...h.egreso, estado: 'validado', validadoEn: e.ahora } })
      break
    }

    case 'egreso/observar': {
      const h = hospitalizacionPorId(e, d.hospitalizacionId)
      if (h?.egreso?.estado !== 'completo') falla('Solo se observa un egreso completo.')
      if (!texto(d.motivo)) falla('Escribe qué hay que corregir.')
      e.hospitalizaciones = reemplazar(e.hospitalizaciones, h.id, { egreso: { ...h.egreso, estado: 'observado', motivoObservacion: texto(d.motivo) } })
      detalle = texto(d.motivo)
      break
    }

    case 'mes/cerrar': {
      if (e.mesesCerrados.includes(d.mes)) falla('Ese mes ya está cerrado.')
      if (d.mes >= mesDe(e.ahora)) falla('El mes todavía está en curso.')
      for (const servicioId of serviciosConCamas(e)) {
        for (const dia of diasDesdeArranque(e, d.mes)) {
          if (registroCenso(e, servicioId, dia)?.estado !== 'cerrado') falla(`Falta cerrar el censo de ${servicioId} del ${dia}.`)
        }
      }
      const sinValidar = e.hospitalizaciones.filter((h) => !h.anulada && h.egreso?.estado && mesDe(h.egreso.fechaHora) === d.mes && h.egreso.estado !== 'validado')
      if (sinValidar.length) falla(`Faltan validar ${sinValidar.length} egresos del mes.`)
      e.mesesCerrados = [...e.mesesCerrados, d.mes]
      e.hospitalizaciones = e.hospitalizaciones.map((h) => (h.egreso?.estado === 'validado' && mesDe(h.egreso.fechaHora) === d.mes ? { ...h, egreso: { ...h.egreso, estado: 'cerrado' } } : h))
      detalle = d.mes
      break
    }

    case 'renoxi/marcar': {
      e.renoxi = { ...e.renoxi, [d.dia]: { cargadoEn: e.ahora, cuenta: cuenta.id } }
      detalle = d.dia
      break
    }
  }

  e.seq += 1
  e.bitacora = [{ id: `bit-${e.seq}`, fecha: e.ahora, cuenta: cuenta.id, accion: DESCRIPCION[tipo], detalle }, ...e.bitacora]
  return e
}

/* El reloj de la demostración solo avanza. */
export function fijarReloj(estado, ahora) {
  if (!esFechaHora(ahora) || ahora < estado.ahora) return estado
  return { ...estado, ahora }
}

export { TRASLADO_NO_INCORPORADO }
