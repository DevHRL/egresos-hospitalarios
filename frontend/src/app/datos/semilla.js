/* Los días previos de la demostración, con pacientes ficticios. Se arma
   pasando por las mismas reglas que usan las pantallas: si una regla cambia y
   la historia deja de ser válida, las pruebas lo señalan. */

import { aplicar, estadoInicial, fijarReloj, maestroDesdePlano } from '../dominio/hospitalizacion.js'
import { servicioPorId } from './catalogo.js'

export const departamentoDe = (servicioId) => servicioPorId(servicioId)?.departamento.id ?? null

export const INICIO_DEMO = '2026-11-05T07:00'
export const AHORA_DEMO = '2026-11-08T10:30'

const B = 'medicina-b'
const I = 'medicina-intermedios'
const SISTEMA = { id: 'sistema', rol: 'sistema', servicios: [] }
const MEDICINA = 'medicina'

const PACIENTES = [
  ['Ríos Demo, Ana', 'F', '1958-03-12'],
  ['Flores Demo, Luis', 'M', '1971-08-02'],
  ['Pinedo Demo, Rosa', 'F', '1949-11-20'],
  ['Tello Demo, Jorge', 'M', '1983-01-30'],
  ['Shuña Demo, Carmen', 'F', '1966-06-15'],
  ['Arévalo Demo, Pedro', 'M', '1955-09-09'],
  ['Mozombite Demo, Elsa', 'F', '1990-02-21'],
  ['Huamán Demo, Víctor', 'M', '1962-12-05'],
  ['Pizango Demo, Julia', 'F', '1977-04-18'],
  ['Ruiz Demo, Marco', 'M', '1948-07-27'],
  ['Saavedra Demo, Nélida', 'F', '1969-10-03'],
  ['Vela Demo, Óscar', 'M', '1980-05-11'],
  ['Tapullima Demo, Irma', 'F', '1953-02-14'],
  ['Chota Demo, Raúl', 'M', '1974-03-29'],
  ['Murayari Demo, Delia', 'F', '1960-08-08'],
  ['Inuma Demo, César', 'M', '1987-11-16'],
  ['Ahuanari Demo, Teresa', 'F', '1945-01-23'],
  ['Lancha Demo, Hugo', 'M', '1959-06-30'],
  ['Cachique Demo, Marta', 'F', '1994-09-25'],
  ['Upiachihua Demo, Felipe', 'M', '1968-04-07'],
  ['Maynas Demo, Gladys', 'F', '1972-12-19'],
  ['Yuyarima Demo, Tomás', 'M', '1951-10-01'],
  ['Manuyama Demo, Sonia', 'F', '1985-07-13'],
  ['Curitima Demo, Abel', 'M', '1979-02-02'],
].map(([nombres, sexo, nacimiento], i) => ({ hc: String(900101 + i), dni: String(90000101 + i), nombres, sexo, nacimiento }))

const cama = (codigo) => `cama-${codigo.toLowerCase()}`

export function crearSemilla(plano) {
  let e = estadoInicial(maestroDesdePlano(plano, departamentoDe), INICIO_DEMO)
  const reloj = (f) => { e = fijarReloj(e, f) }
  const accion = (tipo, datos = {}) => { e = aplicar(e, { tipo, cuenta: SISTEMA, ...datos }) }
  const hospDe = (i) => e.hospitalizaciones.filter((h) => e.pacientes.find((p) => p.id === h.pacienteId)?.hc === PACIENTES[i].hc).at(-1).id

  const ingreso = (i, servicioId, codigo, f, origen = 'emergencia', dx = 'Neumonía') => {
    reloj(f)
    accion('orden/registrar', { paciente: PACIENTES[i], origen, departamentoId: MEDICINA, medicoOrdena: 'Dra. Demo Salazar', diagnosticoIngreso: dx, enviadaPor: origen === 'emergencia' ? 'Enfermería de Emergencia' : '' })
    /* El departamento designa la cama; `servicioId` solo dice en qué área cae. */
    if (!cama(codigo).includes(servicioId === B ? 'cama-b-' : 'cama-i-')) throw new Error(`La cama ${codigo} no es de ${servicioId}`)
    accion('ingreso/confirmar', { ordenId: e.ordenes.at(-1).id, camaId: cama(codigo), fechaHora: f })
  }
  const cerrar = (dia, f) => {
    reloj(f)
    for (const servicioId of [B, I]) {
      const r = conteo(servicioId, dia)
      accion('censo/cerrar', { servicioId, dia, conteoFisico: r, observacion: '' })
    }
  }
  const conteo = (servicioId, dia) => {
    const limite = `${dia}T23:59~`
    return e.hospitalizaciones.filter((h) => {
      const ms = e.movimientos.filter((m) => m.hospitalizacionId === h.id && m.fechaHora < limite)
      const u = ms.filter((m) => m.tipo !== 'soporte').at(-1)
      return u && u.tipo !== 'egreso' && u.servicioId === servicioId
    }).length
  }

  /* 5 de noviembre: arranque con los pacientes presentes. */
  const fijos = [
    [0, B, 'B-03', '2026-11-05T07:10', 'emergencia', 'Neumonía'],
    [1, B, 'B-04', '2026-11-05T07:20', 'consulta_externa', 'Diabetes descompensada'],
    [2, B, 'B-05', '2026-11-05T07:30', 'emergencia', 'Insuficiencia cardíaca'],
    [3, B, 'B-07', '2026-11-05T07:40', 'emergencia', 'Dengue con signos de alarma'],
    [4, B, 'B-09', '2026-11-05T07:50', 'consulta_externa', 'Enfermedad renal crónica'],
    [5, B, 'B-10', '2026-11-05T08:00', 'emergencia', 'EPOC exacerbado'],
    [6, B, 'B-13', '2026-11-05T08:10', 'emergencia', 'Paludismo'],
    [7, B, 'B-14', '2026-11-05T08:20', 'consulta_externa', 'Cirrosis'],
    [8, B, 'B-17', '2026-11-05T08:30', 'emergencia', 'Infección urinaria'],
    [9, B, 'B-18', '2026-11-05T08:40', 'emergencia', 'Hemorragia digestiva'],
    [10, B, 'B-21', '2026-11-05T08:50', 'consulta_externa', 'Anemia'],
    [11, B, 'B-22', '2026-11-05T09:00', 'emergencia', 'Crisis hipertensiva'],
    [12, I, 'I-01', '2026-11-05T09:10', 'emergencia', 'Insuficiencia respiratoria'],
    [13, I, 'I-02', '2026-11-05T09:20', 'emergencia', 'Infarto cerebral'],
  ]
  for (const f of fijos) ingreso(...f)
  reloj('2026-11-05T11:00')
  accion('soporte/cambiar', { hospitalizacionId: hospDe(0), soporte: 'o2', fechaHora: '2026-11-05T11:00' })
  accion('soporte/cambiar', { hospitalizacionId: hospDe(5), soporte: 'o2', fechaHora: '2026-11-05T11:00' })
  accion('soporte/cambiar', { hospitalizacionId: hospDe(12), soporte: 'o2', fechaHora: '2026-11-05T11:00' })
  cerrar('2026-11-05', '2026-11-06T07:30')

  /* 6 de noviembre: un egreso ya validado y un ingreso. */
  reloj('2026-11-06T10:00')
  accion('egreso/registrar', { hospitalizacionId: hospDe(11), fechaHora: '2026-11-06T10:00', tipoEgreso: 'alta_medica', condicion: 'mejorado' })
  ingreso(14, B, 'B-22', '2026-11-06T15:00', 'consulta_externa', 'Hipertensión')
  cerrar('2026-11-06', '2026-11-07T07:30')
  accion('hc/recibir', { hc: PACIENTES[11].hc })
  accion('egreso/completar', { hospitalizacionId: hospDe(11), cie10: 'I10', medicoId: 'med-2' })
  accion('egreso/validar', { hospitalizacionId: hospDe(11) })

  /* 7 de noviembre: dos altas, un traslado y una cama enviada a mantenimiento. */
  reloj('2026-11-07T09:00')
  accion('egreso/registrar', { hospitalizacionId: hospDe(8), fechaHora: '2026-11-07T09:00', tipoEgreso: 'alta_medica', condicion: 'curado' })
  reloj('2026-11-07T11:00')
  accion('egreso/registrar', { hospitalizacionId: hospDe(3), fechaHora: '2026-11-07T11:00', tipoEgreso: 'alta_voluntaria', condicion: 'mejorado' })
  reloj('2026-11-07T12:00')
  accion('traslado/registrar', { hospitalizacionId: hospDe(9), servicioDestino: I })
  reloj('2026-11-07T12:40')
  accion('traslado/confirmar', { trasladoId: e.traslados.at(-1).id, camaId: cama('I-03'), fechaHora: '2026-11-07T12:40' })
  reloj('2026-11-07T14:00')
  accion('falla/reportar', { camaId: cama('B-18'), falla: 'Baranda lateral rota' })
  accion('mant/retirar', { ordenId: e.ordenesCama.at(-1).id, conReemplazo: false })
  cerrar('2026-11-07', '2026-11-08T07:30')
  accion('hc/recibir', { hc: PACIENTES[8].hc })
  accion('egreso/completar', { hospitalizacionId: hospDe(8), cie10: 'N39.0', medicoId: 'med-1' })

  /* 8 de noviembre: lo que queda por hacer en la demostración. */
  ingreso(15, B, 'B-06', '2026-11-08T08:15', 'emergencia', 'Fiebre en estudio')
  reloj('2026-11-08T09:00')
  accion('falla/reportar', { camaId: cama('B-11'), falla: 'No sube el respaldo' })
  reloj('2026-11-08T09:40')
  accion('orden/registrar', { paciente: PACIENTES[16], origen: 'consulta_externa', departamentoId: MEDICINA, medicoOrdena: 'Dr. Demo Paredes', diagnosticoIngreso: 'Enfermedad renal crónica', enviadaPor: '' })
  reloj('2026-11-08T10:05')
  accion('orden/registrar', { paciente: PACIENTES[17], origen: 'emergencia', departamentoId: MEDICINA, medicoOrdena: 'Dra. Demo Vásquez', diagnosticoIngreso: 'Neumonía', enviadaPor: 'Enfermería de Emergencia, turno mañana' })
  reloj('2026-11-08T10:20')
  accion('orden/registrar', { paciente: PACIENTES[18], origen: 'emergencia', departamentoId: MEDICINA, medicoOrdena: 'Dr. Demo Tuesta', diagnosticoIngreso: 'Insuficiencia respiratoria', enviadaPor: 'Enfermería de Emergencia, turno mañana' })
  reloj(AHORA_DEMO)
  return { ...e, bitacora: [] }
}
