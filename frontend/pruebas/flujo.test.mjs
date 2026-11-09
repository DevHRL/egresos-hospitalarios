import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { aplicar, ErrorRegla, estadoInicial, fijarReloj, maestroDesdePlano } from '../src/app/dominio/hospitalizacion.js'
import { censoEditable, cuadreCenso, estadoCama, filasCenso, indicadoresDelMes, posicionActual, renoxiDelDia, resumenCamas, TRASLADO_NO_INCORPORADO } from '../src/app/dominio/consultas.js'
import { crearSemilla } from '../src/app/datos/semilla.js'
import { CUENTAS, MODULOS, cuentaPorId } from '../src/app/datos/cuentas.js'

const plano = JSON.parse(fs.readFileSync(new URL('../src/app/datos/planos/medicina-b-piso2.json', import.meta.url), 'utf8'))
const ADM = cuentaPorId('admision')
const B = cuentaPorId('medicina.b')
const INT = cuentaPorId('medicina.int')
const TEC = cuentaPorId('estadistica.tec')
const JEFE = cuentaPorId('estadistica.jefe')
const MANT = cuentaPorId('mantenimiento')
const MB = 'medicina-b'
const MI = 'medicina-intermedios'
const DIA = '2026-11-02'
const H = (h) => `${DIA}T${h}`
const paciente = (n, sexo = 'F') => ({ hc: `1000${n}`, dni: `4000000${n}`, nombres: `Prueba ${n}`, sexo, nacimiento: '1970-01-01' })

const base = () => estadoInicial(maestroDesdePlano(plano), H('06:00'))
const hacer = (e, cuenta, tipo, datos = {}) => aplicar(e, { tipo, cuenta, ...datos })
const a = (e, f) => fijarReloj(e, f)
const falla = (fn, patron) => assert.throws(fn, (err) => err instanceof ErrorRegla && patron.test(err.message))

function conIngreso(n = 1, cama = 'cama-b-03', servicioId = MB, cuenta = B) {
  let e = a(base(), H('08:00'))
  e = hacer(e, ADM, 'orden/registrar', { paciente: paciente(n), origen: 'consulta_externa', servicioId })
  return hacer(e, cuenta, 'ingreso/confirmar', { ordenId: e.ordenes.at(-1).id, camaId: cama, fechaHora: H('08:00') })
}

test('el plano tiene 24 camas en B y 5 en Intermedios', () => {
  const camas = maestroDesdePlano(plano)
  assert.equal(camas.filter((c) => c.servicioId === MB).length, 24)
  assert.equal(camas.filter((c) => c.servicioId === MI).length, 5)
})

test('Admisión registra el área, sin cama; enfermería de piso confirma la cama', () => {
  let e = a(base(), H('08:00'))
  e = hacer(e, ADM, 'orden/registrar', { paciente: paciente(1), origen: 'emergencia', servicioId: MB, enviadaPor: 'Enfermería de Emergencia' })
  assert.equal(e.ordenes[0].estado, 'pendiente')
  assert.equal(e.hospitalizaciones.length, 0)
  assert.equal('camaId' in e.ordenes[0], false)
  e = hacer(e, B, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-b-03', fechaHora: H('08:00') })
  assert.equal(e.ordenes[0].estado, 'ingresada')
  assert.equal(posicionActual(e, e.hospitalizaciones[0].id).camaId, 'cama-b-03')
})

test('Emergencia exige indicar quién envió la orden', () => {
  const e = a(base(), H('08:00'))
  falla(() => hacer(e, ADM, 'orden/registrar', { paciente: paciente(1), origen: 'emergencia', servicioId: MB }), /emergencia/)
})

test('los permisos siguen a la cuenta', () => {
  let e = a(base(), H('08:00'))
  falla(() => hacer(e, B, 'orden/registrar', { paciente: paciente(1), origen: 'consulta_externa', servicioId: MB }), /permiso/)
  e = hacer(e, ADM, 'orden/registrar', { paciente: paciente(1), origen: 'consulta_externa', servicioId: MB })
  falla(() => hacer(e, ADM, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-b-03', fechaHora: H('08:00') }), /permiso/)
  falla(() => hacer(e, INT, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-b-03', fechaHora: H('08:00') }), /su servicio/)
})

test('sin préstamos: la cama debe ser del área de la orden', () => {
  let e = a(base(), H('08:00'))
  e = hacer(e, ADM, 'orden/registrar', { paciente: paciente(1), origen: 'consulta_externa', servicioId: MB })
  falla(() => hacer(e, TEC, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-i-01', fechaHora: H('08:00') }), /área indicada/)
})

test('no hay dos pacientes en una cama, ni con registro diferido', () => {
  let e = conIngreso(1)
  e = a(e, H('12:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: e.hospitalizaciones[0].id, fechaHora: H('11:00'), tipoEgreso: 'alta_medica', condicion: 'mejorado' })
  e = hacer(e, ADM, 'orden/registrar', { paciente: paciente(2), origen: 'consulta_externa', servicioId: MB })
  const orden = e.ordenes.at(-1).id
  e = a(e, H('12:30'))
  falla(() => hacer(e, B, 'ingreso/confirmar', { ordenId: orden, camaId: 'cama-b-03', fechaHora: H('10:30') }), /anterior a la orden/)
  const ok = hacer(e, B, 'ingreso/confirmar', { ordenId: orden, camaId: 'cama-b-03', fechaHora: H('12:10') })
  assert.equal(ok.hospitalizaciones.length, 2)
})

test('el traslado no es egreso y el destino confirma la cama', () => {
  let e = conIngreso(1)
  const id = e.hospitalizaciones[0].id
  e = a(e, H('10:00'))
  e = hacer(e, B, 'traslado/registrar', { hospitalizacionId: id, servicioDestino: MI })
  assert.equal(posicionActual(e, id).servicioId, MB)
  e = hacer(e, INT, 'traslado/confirmar', { trasladoId: e.traslados[0].id, camaId: 'cama-i-01', fechaHora: H('10:00') })
  assert.equal(posicionActual(e, id).servicioId, MI)
  e = a(e, `2026-11-03T01:00`)
  const cB = cuadreCenso(e, MB, DIA)
  const cI = cuadreCenso(e, MI, DIA)
  assert.deepEqual([cB.ingresos, cB.trasladosSalen, cB.egresos, cB.pacientesCorte, cB.pacientesDia], [1, 1, 0, 0, 1])
  assert.deepEqual([cI.trasladosEntran, cI.egresos, cI.pacientesCorte, cI.pacientesDia], [1, 0, 1, 1])
  assert.equal(cB.cuadra && cI.cuadra, true)
})

test('el traslado a un servicio no incorporado cierra la estancia sin contar como egreso', () => {
  let e = conIngreso(1)
  e = a(e, H('10:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: e.hospitalizaciones[0].id, fechaHora: H('10:00'), tipoEgreso: TRASLADO_NO_INCORPORADO, destino: 'UCI' })
  e = a(e, '2026-11-03T01:00')
  const c = cuadreCenso(e, MB, DIA)
  assert.deepEqual([c.egresos, c.trasladosSalen, c.pacientesCorte], [0, 1, 0])
  assert.equal(e.hospitalizaciones[0].egreso.estado, null)
})

test('el censo se calcula, exige observación si el conteo difiere y se bloquea', () => {
  let e = conIngreso(1)
  falla(() => hacer(e, B, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 1 }), /24:00/)
  e = a(e, '2026-11-03T01:00')
  assert.equal(censoEditable(e, MB, DIA), true)
  falla(() => hacer(e, B, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 2 }), /observación/)
  e = hacer(e, B, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 2, observacion: 'Paciente en tránsito' })
  assert.equal(censoEditable(e, MB, DIA), false)
  falla(() => hacer(e, B, 'soporte/cambiar', { hospitalizacionId: e.hospitalizaciones[0].id, soporte: 'o2', fechaHora: H('20:00') }), /cerró/)
  falla(() => hacer(e, B, 'censo/reabrir', { servicioId: MB, dia: DIA, motivo: 'x' }), /permiso/)
  e = hacer(e, JEFE, 'censo/reabrir', { servicioId: MB, dia: DIA, motivo: 'Corrección de hora' })
  assert.equal(censoEditable(e, MB, DIA), true)
})

test('pasadas las 08:00 el censo sin cerrar queda bloqueado para enfermería', () => {
  let e = conIngreso(1)
  e = a(e, '2026-11-03T08:01')
  assert.equal(censoEditable(e, MB, DIA), false)
  falla(() => hacer(e, B, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 1 }), /Estadística/)
  e = hacer(e, TEC, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 1 })
  assert.equal(e.censos[`${MB}|${DIA}`].estado, 'cerrado')
})

test('el censo lista cada cama y a quien salió ese día', () => {
  let e = conIngreso(1)
  e = a(e, H('10:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: e.hospitalizaciones[0].id, fechaHora: H('10:00'), tipoEgreso: 'alta_medica', condicion: 'curado' })
  const filas = filasCenso(e, MB, DIA)
  assert.equal(filas.length, 24)
  assert.equal(filas.filter((f) => f.vacia).length, 23)
  const salio = filas.find((f) => !f.vacia)
  assert.equal(salio.movimiento, 'I · E')
  assert.equal(salio.tipoEgreso, 'alta_medica')
  assert.equal(salio.camaCodigo, 'B-03')
})

test('mantenimiento sin reemplazo: fuera de servicio hasta que enfermería recibe', () => {
  let e = a(base(), H('08:00'))
  const camaId = 'cama-b-05'
  e = hacer(e, B, 'falla/reportar', { camaId, falla: 'Rueda rota' })
  const cama = () => e.camas.find((c) => c.id === camaId)
  assert.equal(estadoCama(e, cama()).estado, 'libre')
  assert.equal(estadoCama(e, cama()).falla, true)
  const o = () => e.ordenesCama[0].id
  falla(() => hacer(e, B, 'mant/retirar', { ordenId: o(), conReemplazo: false }), /permiso/)
  e = hacer(e, MANT, 'mant/retirar', { ordenId: o(), conReemplazo: false })
  assert.equal(estadoCama(e, cama()).estado, 'fuera')
  assert.equal(resumenCamas(e, [MB]).operativas, 23)
  e = hacer(e, MANT, 'mant/resolver', { ordenId: o(), diagnostico: 'Cambio de rueda', resultado: 'reparada' })
  e = hacer(e, MANT, 'mant/entregar', { ordenId: o() })
  assert.equal(estadoCama(e, cama()).estado, 'fuera')
  e = hacer(e, B, 'mant/recibir', { ordenId: o() })
  assert.equal(estadoCama(e, cama()).estado, 'libre')
  assert.equal(e.ordenesCama[0].estado, 'cerrada')
})

test('mantenimiento con reemplazo: el puesto sigue operativo', () => {
  let e = a(base(), H('08:00'))
  e = hacer(e, B, 'falla/reportar', { camaId: 'cama-b-05', falla: 'Colchón' })
  e = hacer(e, MANT, 'mant/retirar', { ordenId: e.ordenesCama[0].id, conReemplazo: true })
  assert.equal(estadoCama(e, e.camas.find((c) => c.id === 'cama-b-05')).estado, 'libre')
  e = hacer(e, MANT, 'mant/resolver', { ordenId: e.ordenesCama[0].id, diagnostico: 'Reparado', resultado: 'reparada' })
  assert.equal(e.ordenesCama[0].estado, 'cerrada')
})

test('no se retira una cama con paciente', () => {
  let e = conIngreso(1)
  e = hacer(e, B, 'falla/reportar', { camaId: 'cama-b-03', falla: 'Baranda' })
  falla(() => hacer(e, MANT, 'mant/retirar', { ordenId: e.ordenesCama[0].id, conReemplazo: false }), /paciente/)
})

test('Estadística completa desde la HC y valida; recién entonces cuenta como egreso', () => {
  let e = conIngreso(1)
  const id = e.hospitalizaciones[0].id
  e = a(e, H('10:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('10:00'), tipoEgreso: 'alta_medica', condicion: 'curado' })
  assert.equal(e.hospitalizaciones[0].egreso.estado, 'pendiente_hc')
  e = a(e, '2026-11-03T07:00')
  e = hacer(e, B, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 0 })
  e = hacer(e, TEC, 'censo/cerrar', { servicioId: MI, dia: DIA, conteoFisico: 0 })
  assert.equal(indicadoresDelMes(e, '2026-11').filas.find((f) => f.servicioId === MB).E, 0)
  e = hacer(e, TEC, 'hc/recibir', { hc: '10001' })
  falla(() => hacer({ ...e, pacientes: e.pacientes.map((p) => ({ ...p, sexo: 'M' })) }, TEC, 'egreso/completar', { hospitalizacionId: id, cie10: 'O80', medicoId: 'med-1' }), /obstétrico/)
  e = hacer(e, TEC, 'egreso/completar', { hospitalizacionId: id, cie10: 'J18.9', medicoId: 'med-1' })
  e = hacer(e, TEC, 'egreso/validar', { hospitalizacionId: id })
  const fila = indicadoresDelMes(e, '2026-11').filas.find((f) => f.servicioId === MB)
  assert.deepEqual([fila.A, fila.B, fila.C, fila.E], [24, 1, 1, 1])
})

test('anular el ingreso devuelve la orden a pendiente y libera la cama', () => {
  let e = conIngreso(1)
  e = hacer(e, B, 'movimiento/anular', { movimientoId: e.movimientos[0].id, motivo: 'Cama equivocada' })
  assert.equal(e.ordenes[0].estado, 'pendiente')
  assert.equal(estadoCama(e, e.camas.find((c) => c.id === 'cama-b-03')).estado, 'libre')
})

test('el soporte O2 llega a RENOXI', () => {
  let e = conIngreso(1)
  e = a(e, H('09:00'))
  e = hacer(e, B, 'soporte/cambiar', { hospitalizacionId: e.hospitalizaciones[0].id, soporte: 'o2', fechaHora: H('09:00') })
  const r = renoxiDelDia(e, DIA).find((f) => f.servicioId === MB)
  assert.deepEqual([r.conO2, r.sinO2, r.disponibles], [1, 0, 23])
})

test('la bitácora registra la cuenta de cada acción', () => {
  const e = conIngreso(1)
  assert.deepEqual(e.bitacora.map((b) => b.cuenta), ['medicina.b', 'admision'])
})

test('el mes solo cierra con censos cerrados y egresos validados', () => {
  const e = a(base(), '2026-12-01T09:00')
  falla(() => hacer(e, B, 'mes/cerrar', { mes: '2026-11' }), /permiso/)
  falla(() => hacer(e, JEFE, 'mes/cerrar', { mes: '2026-12' }), /en curso/)
  falla(() => hacer(e, JEFE, 'mes/cerrar', { mes: '2026-11' }), /Falta cerrar/)
})

test('la demostración respeta todas las reglas y cuadra', () => {
  const e = crearSemilla(plano)
  assert.equal(e.ordenes.filter((o) => o.estado === 'pendiente').length, 3)
  for (const dia of ['2026-11-05', '2026-11-06', '2026-11-07']) {
    for (const s of [MB, MI]) {
      assert.equal(cuadreCenso(e, s, dia).cuadra, true)
      assert.equal(e.censos[`${s}|${dia}`].estado, 'cerrado')
      assert.equal(e.censos[`${s}|${dia}`].conteoFisico, cuadreCenso(e, s, dia).pacientesCorte)
    }
  }
  assert.equal(estadoCama(e, e.camas.find((c) => c.codigo === 'B-18')).estado, 'fuera')
})

test('cada cuenta usa módulos que existen', () => {
  for (const c of CUENTAS) for (const m of c.modulos) assert.ok(MODULOS[m], `${c.id}: ${m}`)
})
