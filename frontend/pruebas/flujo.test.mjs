import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { aplicar, ErrorRegla, estadoInicial, fijarReloj, maestroDesdePlano } from '../src/app/dominio/hospitalizacion.js'
import { censoEditable, cuadreCenso, estadoCama, filasCenso, indicadoresDelMes, posicionActual, renoxiDelDia, resumenCamas, TRASLADO_NO_INCORPORADO } from '../src/app/dominio/consultas.js'
import { crearSemilla, departamentoDe } from '../src/app/datos/semilla.js'
import { CUENTAS, MODULOS, cuentaPorId } from '../src/app/datos/cuentas.js'

const plano = JSON.parse(fs.readFileSync(new URL('../src/app/datos/planos/medicina-b-piso2.json', import.meta.url), 'utf8'))
const ADM = cuentaPorId('admision')
const B = cuentaPorId('medicina.b')
const INT = cuentaPorId('medicina.int')
const DEP = cuentaPorId('dep.medicina')
const EST = cuentaPorId('estadistica')
const MANT = cuentaPorId('mantenimiento')
const MED = 'medicina'
const MA = 'medicina-a'
const MB = 'medicina-b'
const MI = 'medicina-intermedios'
const UCI = 'cuidados-criticos'
const QUE = 'quemados'
const DIA = '2026-11-02'
const H = (h) => `${DIA}T${h}`
const paciente = (n, sexo = 'F') => ({ hc: `1000${n}`, dni: `4000000${n}`, nombres: `Prueba ${n}`, sexo, nacimiento: '1970-01-01' })

const base = () => estadoInicial(maestroDesdePlano(plano, departamentoDe), H('06:00'))
const hacer = (e, cuenta, tipo, datos = {}) => aplicar(e, { tipo, cuenta, ...datos })
const a = (e, f) => fijarReloj(e, f)
const falla = (fn, patron) => assert.throws(fn, (err) => err instanceof ErrorRegla && patron.test(err.message))

const orden = (e, n, extra = {}) => hacer(e, ADM, 'orden/registrar', { paciente: paciente(n), origen: 'consulta_externa', servicioId: MB, medicoOrdena: 'Dra. Demo Salazar', ...extra })
/* Alta completa, como la registra el área (decisión 0010). */
const ALTA = { tipoEgreso: 'alta_medica', condicion: 'mejorado', cie10: 'J18.9', medicoId: 'med-1' }

/* La enfermería del área de la cama es quien designa. */
const AREA_DE_CAMA = { a: [MA, 'medicina.a'], b: [MB, 'medicina.b'], i: [MI, 'medicina.int'], u: [UCI, 'uci'], q: [QUE, 'quemados'] }

function conIngreso(n = 1, cama = 'cama-b-03') {
  const [servicioId, cuenta] = AREA_DE_CAMA[cama[5]]
  let e = a(base(), H('08:00'))
  e = orden(e, n, { servicioId })
  return hacer(e, cuentaPorId(cuenta), 'ingreso/confirmar', { ordenId: e.ordenes.at(-1).id, camaId: cama, fechaHora: H('08:00') })
}

test('el piso tiene 24 camas en A, 24 en B, 5 en Intermedios, 7 en UCI y 7 en Quemados', () => {
  const camas = maestroDesdePlano(plano, departamentoDe)
  assert.equal(camas.length, 67)
  const a = camas.filter((c) => c.servicioId === MA)
  assert.equal(a.length, 24)
  assert.deepEqual(a.map((c) => c.codigo).sort(), Array.from({ length: 24 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`))
  assert.equal(camas.filter((c) => c.servicioId === MB).length, 24)
  assert.equal(camas.filter((c) => c.servicioId === MI).length, 5)
  assert.ok(camas.filter((c) => [MA, MB, MI].includes(c.servicioId)).every((c) => c.departamentoId === MED))
  assert.equal(camas.filter((c) => c.servicioId === UCI).length, 7)
  const quemados = camas.filter((c) => c.servicioId === QUE)
  assert.equal(quemados.length, 7)
  assert.equal(quemados.filter((c) => c.tipo === 'cuna').length, 2, 'pediatría de Quemados tiene dos cunas')
})

test('el área designa la cama de sus pacientes; el departamento solo monitorea', () => {
  let e = a(base(), H('08:00'))
  e = orden(e, 1, { servicioId: UCI })
  falla(() => hacer(e, DEP, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-u-02', fechaHora: H('08:00') }), /permiso/)
  falla(() => hacer(e, B, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-u-02', fechaHora: H('08:00') }), /su servicio/)
  e = hacer(e, cuentaPorId('uci'), 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-u-02', fechaHora: H('08:00') })
  assert.equal(posicionActual(e, e.hospitalizaciones[0].id).servicioId, UCI)
  e = orden(e, 2, { servicioId: MA })
  falla(() => hacer(e, B, 'ingreso/confirmar', { ordenId: e.ordenes[1].id, camaId: 'cama-b-03', fechaHora: H('08:00') }), /área/)
  e = hacer(e, cuentaPorId('medicina.a'), 'ingreso/confirmar', { ordenId: e.ordenes[1].id, camaId: 'cama-a-01', fechaHora: H('08:00') })
  assert.equal(posicionActual(e, e.hospitalizaciones[1].id).servicioId, MA)
})

test('el estado de la cama es uno de cuatro; el O2 o la VM van aparte', () => {
  let e = conIngreso(1, 'cama-b-03')
  e = a(e, H('09:00'))
  e = hacer(e, B, 'soporte/cambiar', { hospitalizacionId: e.hospitalizaciones[0].id, soporte: 'o2', fechaHora: H('09:00') })
  const info = estadoCama(e, e.camas.find((c) => c.id === 'cama-b-03'))
  assert.deepEqual([info.estado, info.soporte, info.libre], ['ocupada', 'o2', false])
  e = hacer(e, B, 'falla/reportar', { camaId: 'cama-b-03', falla: 'Baranda floja' })
  const conFalla = estadoCama(e, e.camas.find((c) => c.id === 'cama-b-03'))
  assert.deepEqual([conFalla.estado, Boolean(conFalla.ocupante)], ['falla', true], 'con falla sigue con su paciente')
})

test('Admisión envía al área; esa área designa habitación y cama', () => {
  let e = a(base(), H('08:00'))
  e = orden(e, 1, { servicioId: MI, origen: 'emergencia', enviadaPor: 'Enfermería de Emergencia' })
  assert.equal(e.ordenes[0].estado, 'pendiente')
  assert.deepEqual([e.ordenes[0].departamentoId, e.ordenes[0].servicioId], [MED, MI])
  assert.equal(e.hospitalizaciones.length, 0)
  e = hacer(e, INT, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-i-02', fechaHora: H('08:00') })
  assert.equal(e.ordenes[0].estado, 'ingresada')
  const pos = posicionActual(e, e.hospitalizaciones[0].id)
  assert.deepEqual([pos.camaId, pos.servicioId], ['cama-i-02', MI])
})

test('desde la designación, el piso controla al paciente y el departamento solo mira', () => {
  let e = conIngreso(1, 'cama-i-02')
  const id = e.hospitalizaciones[0].id
  e = a(e, H('09:00'))
  falla(() => hacer(e, DEP, 'soporte/cambiar', { hospitalizacionId: id, soporte: 'o2', fechaHora: H('09:00') }), /permiso/)
  falla(() => hacer(e, DEP, 'traslado/registrar', { hospitalizacionId: id, servicioDestino: MB }), /permiso/)
  falla(() => hacer(e, EST, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('09:00'), ...ALTA }), /permiso/)
  falla(() => hacer(e, DEP, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('09:00'), ...ALTA }), /permiso/)
  falla(() => hacer(e, B, 'soporte/cambiar', { hospitalizacionId: id, soporte: 'o2', fechaHora: H('09:00') }), /su servicio/)
  e = hacer(e, INT, 'soporte/cambiar', { hospitalizacionId: id, soporte: 'o2', fechaHora: H('09:00') })
  assert.equal(posicionActual(e, id).soporte, 'o2')
})

test('Emergencia exige indicar quién envió la orden', () => {
  const e = a(base(), H('08:00'))
  falla(() => orden(e, 1, { origen: 'emergencia' }), /emergencia/)
  falla(() => orden(e, 1, { servicioId: 'cirugia' }), /área/)
  falla(() => orden(e, 1, { medicoOrdena: '' }), /médico/)
})

test('los permisos siguen a la cuenta', () => {
  let e = a(base(), H('08:00'))
  falla(() => hacer(e, B, 'orden/registrar', { paciente: paciente(1), origen: 'consulta_externa', servicioId: MB, medicoOrdena: 'Dra. Demo Salazar' }), /permiso/)
  e = orden(e, 1)
  for (const cuenta of [ADM, DEP, EST, MANT]) {
    falla(() => hacer(e, cuenta, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-b-03', fechaHora: H('08:00') }), /permiso/)
  }
})

test('la cama debe ser del área de la orden', () => {
  let e = a(base(), H('08:00'))
  e = orden(e, 1)
  falla(() => hacer(e, INT, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-i-01', fechaHora: H('08:00') }), /área/)
  falla(() => hacer(e, B, 'ingreso/confirmar', { ordenId: e.ordenes[0].id, camaId: 'cama-i-01', fechaHora: H('08:00') }), /área|servicio/)
})

test('no hay dos pacientes en una cama, ni con registro diferido', () => {
  let e = conIngreso(1)
  e = a(e, H('12:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: e.hospitalizaciones[0].id, fechaHora: H('11:00'), ...ALTA })
  e = orden(e, 2)
  const ordenId = e.ordenes.at(-1).id
  e = a(e, H('12:30'))
  falla(() => hacer(e, B, 'ingreso/confirmar', { ordenId, camaId: 'cama-b-03', fechaHora: H('10:30') }), /anterior a la orden/)
  const ok = hacer(e, B, 'ingreso/confirmar', { ordenId, camaId: 'cama-b-03', fechaHora: H('12:10') })
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
  e = hacer(e, EST, 'censo/reabrir', { servicioId: MB, dia: DIA, motivo: 'Corrección de hora' })
  assert.equal(censoEditable(e, MB, DIA), true)
})

test('pasadas las 08:00 el censo sin cerrar queda bloqueado para enfermería', () => {
  let e = conIngreso(1)
  e = a(e, '2026-11-03T08:01')
  assert.equal(censoEditable(e, MB, DIA), false)
  falla(() => hacer(e, B, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 1 }), /Estadística/)
  e = hacer(e, EST, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 1 })
  assert.equal(e.censos[`${MB}|${DIA}`].estado, 'cerrado')
})

test('el censo lista cada cama y a quien salió ese día', () => {
  let e = conIngreso(1)
  e = a(e, H('10:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: e.hospitalizaciones[0].id, fechaHora: H('10:00'), ...ALTA, condicion: 'curado' })
  const filas = filasCenso(e, MB, DIA)
  assert.equal(filas.length, 24)
  assert.equal(filas.filter((f) => f.vacia).length, 23)
  const salio = filas.find((f) => !f.vacia)
  assert.equal(salio.movimiento, 'I, E')
  assert.equal(salio.tipoEgreso, 'alta_medica')
  assert.equal(salio.camaCodigo, 'B-03')
})

test('mantenimiento sin reemplazo: en mantenimiento hasta que enfermería recibe', () => {
  let e = a(base(), H('08:00'))
  const camaId = 'cama-b-05'
  e = hacer(e, B, 'falla/reportar', { camaId, falla: 'Rueda rota' })
  const cama = () => e.camas.find((c) => c.id === camaId)
  assert.equal(estadoCama(e, cama()).estado, 'falla')
  assert.equal(estadoCama(e, cama()).falla, true)
  assert.equal(estadoCama(e, cama()).libre, true, 'la falla no quita la cama de servicio')
  const o = () => e.ordenesCama[0].id
  falla(() => hacer(e, B, 'mant/retirar', { ordenId: o(), conReemplazo: false }), /permiso/)
  e = hacer(e, MANT, 'mant/retirar', { ordenId: o(), conReemplazo: false })
  assert.equal(estadoCama(e, cama()).estado, 'mantenimiento')
  assert.equal(resumenCamas(e, [MB]).operativas, 23)
  e = hacer(e, MANT, 'mant/resolver', { ordenId: o(), diagnostico: 'Cambio de rueda', resultado: 'reparada' })
  e = hacer(e, MANT, 'mant/entregar', { ordenId: o() })
  assert.equal(estadoCama(e, cama()).estado, 'mantenimiento')
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

test('el área registra el alta completa y cuenta en los indicadores sin esperar a Estadística', () => {
  let e = conIngreso(1)
  const id = e.hospitalizaciones[0].id
  e = a(e, H('10:00'))
  falla(() => hacer(e, B, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('10:00'), ...ALTA, cie10: '' }), /CIE-10/)
  falla(() => hacer(e, B, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('10:00'), ...ALTA, medicoId: '' }), /médico/)
  falla(() => hacer({ ...e, pacientes: e.pacientes.map((p) => ({ ...p, sexo: 'M' })) }, B, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('10:00'), ...ALTA, cie10: 'O80' }), /obstétrico/)
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('10:00'), ...ALTA, secundarios: ['I10'] })
  assert.equal(e.hospitalizaciones[0].egreso.estado, 'completo')
  assert.deepEqual(e.hospitalizaciones[0].egreso.cie10, ['J18.9', 'I10'])
  e = a(e, '2026-11-03T07:00')
  e = hacer(e, B, 'censo/cerrar', { servicioId: MB, dia: DIA, conteoFisico: 0 })
  const fila = indicadoresDelMes(e, '2026-11').filas.find((f) => f.servicioId === MB)
  assert.deepEqual([fila.A, fila.B, fila.C, fila.E], [24, 1, 1, 1])
})

test('el fallecimiento antes o después de 48 h lo calcula el sistema', () => {
  let e = conIngreso(1)
  e = a(e, H('20:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: e.hospitalizaciones[0].id, fechaHora: H('20:00'), ...ALTA, tipoEgreso: 'fallecido', condicion: '' })
  assert.deepEqual([e.hospitalizaciones[0].egreso.tipo, e.hospitalizaciones[0].egreso.condicion], ['fallecido_menor_48', 'fallecido'])
})

test('un alta que era traslado se corrige: deja de ser egreso y el destino designa la cama', () => {
  let e = conIngreso(1)
  const id = e.hospitalizaciones[0].id
  e = a(e, H('10:00'))
  e = hacer(e, B, 'egreso/registrar', { hospitalizacionId: id, fechaHora: H('10:00'), ...ALTA })
  falla(() => hacer(e, B, 'egreso/a_traslado', { hospitalizacionId: id, servicioDestino: MI, motivo: '' }), /motivo/)
  e = hacer(e, B, 'egreso/a_traslado', { hospitalizacionId: id, servicioDestino: MI, motivo: 'Se registró como alta por error' })
  assert.equal(e.hospitalizaciones[0].egreso, null)
  assert.deepEqual([posicionActual(e, id).camaId, e.traslados[0].estado], ['cama-b-03', 'pendiente'])
  e = hacer(e, INT, 'traslado/confirmar', { trasladoId: e.traslados[0].id, camaId: 'cama-i-01', fechaHora: H('10:00') })
  e = a(e, '2026-11-03T01:00')
  const c = cuadreCenso(e, MB, DIA)
  assert.deepEqual([c.egresos, c.trasladosSalen, c.cuadra], [0, 1, true])
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
  falla(() => hacer(e, EST, 'mes/cerrar', { mes: '2026-12' }), /en curso/)
  falla(() => hacer(e, EST, 'mes/cerrar', { mes: '2026-11' }), /Falta cerrar/)
})

test('la demostración respeta todas las reglas y cuadra', () => {
  const e = crearSemilla(plano)
  assert.equal(e.ordenes.filter((o) => o.estado === 'pendiente').length, 3)
  for (const dia of ['2026-11-05', '2026-11-06', '2026-11-07']) {
    for (const s of [MA, MB, MI, UCI, QUE]) {
      assert.equal(cuadreCenso(e, s, dia).cuadra, true)
      assert.equal(e.censos[`${s}|${dia}`].estado, 'cerrado')
      assert.equal(e.censos[`${s}|${dia}`].conteoFisico, cuadreCenso(e, s, dia).pacientesCorte)
    }
  }
  assert.equal(estadoCama(e, e.camas.find((c) => c.codigo === 'B-18')).estado, 'mantenimiento')
})

test('cada cuenta usa módulos que existen y todas ven la gestión de camas', () => {
  assert.deepEqual(CUENTAS.map((c) => c.id).sort(), ['admision', 'control.camas', 'dep.medicina', 'estadistica', 'mantenimiento', 'medicina.a', 'medicina.b', 'medicina.int', 'quemados', 'uci'])
  for (const c of CUENTAS) {
    for (const m of c.modulos) assert.ok(MODULOS[m], `${c.id}: ${m}`)
    assert.ok(c.modulos.includes('mapa'), `${c.id} no ve el plano`)
  }
})
