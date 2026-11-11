/* Las seis cuentas del prototipo (2026-11-11). Todas ven el plano en 3D; el rol
   decide qué puede hacer cada una y los servicios limitan qué camas opera.

   El flujo: Admisión envía al paciente al departamento, el departamento
   designa habitación y cama, y desde ahí el piso (Medicina B o Intermedios)
   controla al paciente y a su cama. Las contraseñas son de la demostración:
   en el sistema real las administra TI. */

const MEDICINA_B = 'medicina-b'
const INTERMEDIOS = 'medicina-intermedios'
const MEDICINA = [MEDICINA_B, INTERMEDIOS]

export const CUENTAS = [
  {
    id: 'admision',
    usuario: 'admision',
    nombre: 'Admisión',
    rol: 'admision',
    rolLabel: 'Admisión (conecta con Galeno)',
    servicios: MEDICINA,
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
    id: 'estadistica',
    usuario: 'estadistica',
    nombre: 'Estadística',
    rol: 'jefatura',
    rolLabel: 'Estadística',
    servicios: MEDICINA,
    modulos: ['mapa', 'recepcion', 'completado', 'validacion', 'censo', 'consolidado', 'renoxi', 'indicadores', 'pacientes'],
  },
  {
    id: 'mantenimiento',
    usuario: 'mantenimiento',
    nombre: 'Mantenimiento',
    rol: 'mantenimiento',
    rolLabel: 'Mantenimiento',
    servicios: MEDICINA,
    modulos: ['mapa', 'mantenimiento'],
  },
]

export const cuentaPorId = (id) => CUENTAS.find((c) => c.id === id) ?? null
export const cuentaPorUsuario = (u) => CUENTAS.find((c) => c.usuario === u) ?? null

export const MODULOS = {
  mapa: { label: 'Plano 3D de camas', icono: 'sh-home', grupo: 'Operación', subtitulo: 'Gira, acerca y selecciona una habitación. Cada cuenta ve las acciones que le tocan.' },
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
