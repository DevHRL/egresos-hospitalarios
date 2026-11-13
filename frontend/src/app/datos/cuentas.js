/* Las cuentas del prototipo. Todas ven el plano en 3D; el rol decide qué puede
   hacer cada una y los servicios limitan qué camas opera.

   El flujo: Admisión envía al paciente al departamento, quien designa
   habitación y cama, y desde ahí el piso controla al paciente y a su cama. En
   Medicina designa la cuenta del departamento; en UCI y Quemados, que no tienen
   una, la propia unidad (2026-11-12, decisión 0008). Las contraseñas son de la
   demostración: en el sistema real las administra TI. */

import { servicioPorId } from './catalogo.js'

const MEDICINA_A = 'medicina-a'
const MEDICINA_B = 'medicina-b'
const INTERMEDIOS = 'medicina-intermedios'
const UCI = 'cuidados-criticos'
const QUEMADOS = 'quemados'
const MEDICINA = [MEDICINA_A, MEDICINA_B, INTERMEDIOS]
const TODOS = [...MEDICINA, UCI, QUEMADOS]

export const CUENTAS = [
  {
    id: 'admision',
    usuario: 'admision',
    nombre: 'Admisión',
    rol: 'admision',
    rolLabel: 'Admisión (conecta con Galeno)',
    servicios: TODOS,
    modulos: ['mapa', 'ordenes', 'pacientes'],
  },
  {
    id: 'dep.medicina',
    usuario: 'dep.medicina',
    nombre: 'Departamento de Medicina',
    rol: 'departamento',
    rolLabel: 'Supervisión del departamento',
    servicios: MEDICINA,
    modulos: ['mapa', 'movimientos', 'censo', 'tablero', 'pacientes', 'cuentas'],
  },
  {
    id: 'medicina.a',
    usuario: 'medicina.a',
    nombre: 'Enfermería Medicina A',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [MEDICINA_A],
    modulos: ['mapa', 'movimientos', 'censo', 'pacientes'],
  },
  {
    id: 'medicina.b',
    usuario: 'medicina.b',
    nombre: 'Enfermería Medicina B',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [MEDICINA_B],
    modulos: ['mapa', 'movimientos', 'censo', 'pacientes'],
  },
  {
    id: 'medicina.int',
    usuario: 'medicina.int',
    nombre: 'Enfermería Intermedios',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [INTERMEDIOS],
    modulos: ['mapa', 'movimientos', 'censo', 'pacientes'],
  },
  {
    id: 'uci',
    usuario: 'uci',
    nombre: 'Enfermería UCI',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de la unidad (designa la cama)',
    servicios: [UCI],
    modulos: ['mapa', 'movimientos', 'censo', 'pacientes'],
  },
  {
    id: 'quemados',
    usuario: 'quemados',
    nombre: 'Enfermería Quemados',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de la unidad (designa la cama)',
    servicios: [QUEMADOS],
    modulos: ['mapa', 'movimientos', 'censo', 'pacientes'],
  },
  {
    id: 'estadistica',
    usuario: 'estadistica',
    nombre: 'Estadística',
    rol: 'jefatura',
    rolLabel: 'Estadística',
    servicios: TODOS,
    modulos: ['mapa', 'recepcion', 'completado', 'validacion', 'censo', 'consolidado', 'renoxi', 'indicadores', 'pacientes'],
  },
  {
    id: 'mantenimiento',
    usuario: 'mantenimiento',
    nombre: 'Mantenimiento',
    rol: 'mantenimiento',
    rolLabel: 'Mantenimiento',
    servicios: TODOS,
    modulos: ['mapa', 'mantenimiento'],
  },
].map((c, _, todas) => ({ ...c, designa: departamentosQueDesigna(c, todas) }))

/* Departamentos en los que la cuenta designa habitación y cama. La cuenta de un
   departamento designa en el suyo; la enfermería de una unidad, solo si su
   departamento no tiene esa cuenta. El servidor aplica la misma regla. */
function departamentosQueDesigna(cuenta, todas) {
  const departamentos = (c) => c.servicios.map((s) => servicioPorId(s)?.departamento.id)
  if (cuenta.rol === 'departamento') return [...new Set(departamentos(cuenta))]
  if (cuenta.rol !== 'enfermeria') return []
  const conCuenta = new Set(todas.filter((c) => c.rol === 'departamento').flatMap(departamentos))
  return [...new Set(departamentos(cuenta))].filter((d) => !conCuenta.has(d))
}

export const cuentaPorId = (id) => CUENTAS.find((c) => c.id === id) ?? null
export const cuentaPorUsuario = (u) => CUENTAS.find((c) => c.usuario === u) ?? null

export const MODULOS = {
  /* `encabezadoPropio`: la pantalla pone su título en su columna izquierda y
     el plano ocupa la derecha desde arriba; App no monta la cabecera. */
  mapa: { label: 'Plano 3D de camas', icono: 'sh-home', grupo: 'Operación', subtitulo: 'Gira, acerca y selecciona una habitación. Cada cuenta ve las acciones que le tocan.', encabezadoPropio: true },
  ordenes: { label: 'Órdenes de hospitalización', icono: 'sh-doc', grupo: 'Admisión', subtitulo: 'Envía al paciente al departamento. La habitación y la cama las designa el departamento.' },
  movimientos: { label: 'Movimientos del día', icono: 'sh-swap', grupo: 'Operación', subtitulo: 'Lo registrado hoy en el servicio. Un movimiento no se borra: se anula con motivo.' },
  censo: { label: 'Censo diario', icono: 'sh-table', grupo: 'Operación', subtitulo: 'Se genera de los movimientos. Va de 00:00 a 23:59 y se recoge a las 08:00 del día siguiente.' },
  recepcion: { label: 'Recepción de censos', icono: 'sh-inbox', grupo: 'Estadística', subtitulo: 'Qué censos cerraron y qué historias clínicas llegaron.' },
  completado: { label: 'Completado desde HC', icono: 'sh-pencil', grupo: 'Estadística', subtitulo: 'Egresos que esperan el CIE-10 y el médico del alta, con la HC física en la mano.' },
  validacion: { label: 'Validación', icono: 'sh-stamp', grupo: 'Estadística', subtitulo: 'Egresos por validar e inconsistencias detectadas.' },
  consolidado: { label: 'Consolidado', icono: 'sh-lines', grupo: 'Reportes', subtitulo: 'Censos por día y servicio, y egresos del mes.' },
  renoxi: { label: 'RENOXI', icono: 'sh-send', grupo: 'Reportes', subtitulo: 'Lista para copiar al formulario web. RENOXI no tiene API.' },
  indicadores: { label: 'Indicadores DIRESA', icono: 'sh-chart', grupo: 'Reportes', subtitulo: 'Variables A a I del mes y su cierre.' },
  mantenimiento: { label: 'Órdenes de camas', icono: 'sh-wrench', grupo: 'Mantenimiento', subtitulo: 'Del reporte de la falla hasta que enfermería recibe la cama.' },
  tablero: { label: 'Tablero de ocupación', icono: 'sh-pie', grupo: 'Supervisión', subtitulo: 'Ocupación actual del departamento por área.' },
  cuentas: { label: 'Cuentas y bitácora', icono: 'sh-shield', grupo: 'Supervisión', subtitulo: 'Qué puede hacer cada cuenta y qué se ha hecho.' },
  pacientes: { label: 'Buscar paciente', icono: 'sh-search', grupo: 'Pacientes', subtitulo: 'Dónde está, su trayectoria y quién completó cada dato.' },
}
