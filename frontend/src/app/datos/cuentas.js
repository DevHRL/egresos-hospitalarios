/* Una cuenta por área (decisión 0006). El rol decide los permisos y los
   servicios limitan lo que enfermería ve y opera. Las contraseñas son de la
   demostración: en el sistema real las administra TI. */

export const CLAVE_DEMO = 'demo'

const MEDICINA_B = 'medicina-b'
const INTERMEDIOS = 'medicina-intermedios'
const UCI_MEDICINA = 'cuidados-criticos'
const UCI_CIRUGIA = 'uci-cirugia'
const UCI_PEDIATRIA = 'uci-pediatria'
const TODOS = [MEDICINA_B, INTERMEDIOS, UCI_MEDICINA, UCI_CIRUGIA, UCI_PEDIATRIA]
const MODULOS_PISO = ['recorrido', 'mapa', 'movimientos', 'censo', 'pacientes']

const cuentaUci = (id, nombre, servicio) => ({ id, usuario: id, nombre, rol: 'enfermeria', rolLabel: 'Enfermería de piso', servicios: [servicio], modulos: MODULOS_PISO })

export const CUENTAS = [
  {
    id: 'admision',
    usuario: 'admision',
    nombre: 'Admisión',
    rol: 'admision',
    rolLabel: 'Admisión (conecta con Galeno)',
    servicios: [],
    modulos: ['recorrido', 'ordenes', 'pacientes'],
  },
  {
    id: 'medicina.b',
    usuario: 'medicina.b',
    nombre: 'Enfermería Medicina B',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [MEDICINA_B],
    modulos: ['recorrido', 'mapa', 'movimientos', 'censo', 'pacientes'],
  },
  {
    id: 'medicina.int',
    usuario: 'medicina.int',
    nombre: 'Enfermería Intermedios',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
    servicios: [INTERMEDIOS],
    modulos: MODULOS_PISO,
  },
  cuentaUci('uci.medicina', 'Enfermería UCI Medicina', UCI_MEDICINA),
  cuentaUci('uci.cirugia', 'Enfermería UCI Cirugía', UCI_CIRUGIA),
  cuentaUci('uci.pediatria', 'Enfermería UCI Pediatría', UCI_PEDIATRIA),
  {
    id: 'estadistica.tec',
    usuario: 'estadistica.tec',
    nombre: 'Técnicos de Estadística',
    rol: 'tecnico',
    rolLabel: 'Técnico de Estadística',
    servicios: TODOS,
    modulos: ['recorrido', 'recepcion', 'completado', 'validacion', 'censo', 'pacientes'],
  },
  {
    id: 'estadistica.camas',
    usuario: 'estadistica.camas',
    nombre: 'Responsable de camas',
    rol: 'camas',
    rolLabel: 'Responsable de camas y RENOXI',
    servicios: TODOS,
    modulos: ['recorrido', 'mapa', 'consolidado', 'renoxi', 'pacientes'],
  },
  {
    id: 'estadistica.jefe',
    usuario: 'estadistica.jefe',
    nombre: 'Jefatura de Estadística',
    rol: 'jefatura',
    rolLabel: 'Jefatura de Estadística',
    servicios: TODOS,
    modulos: ['recorrido', 'recepcion', 'validacion', 'censo', 'consolidado', 'indicadores', 'plano', 'pacientes'],
  },
  {
    id: 'mantenimiento',
    usuario: 'mantenimiento',
    nombre: 'Mantenimiento',
    rol: 'mantenimiento',
    rolLabel: 'Mantenimiento',
    servicios: TODOS,
    modulos: ['recorrido', 'mantenimiento'],
  },
  {
    id: 'direccion',
    usuario: 'direccion',
    nombre: 'Dirección',
    rol: 'consulta',
    rolLabel: 'Consulta, sin datos de pacientes',
    servicios: TODOS,
    modulos: ['recorrido', 'tablero'],
  },
  {
    id: 'ti',
    usuario: 'ti',
    nombre: 'TI',
    rol: 'ti',
    rolLabel: 'Administración técnica',
    servicios: [],
    modulos: ['recorrido', 'cuentas'],
  },
]

export const cuentaPorId = (id) => CUENTAS.find((c) => c.id === id) ?? null
export const cuentaPorUsuario = (u) => CUENTAS.find((c) => c.usuario === u) ?? null

export const MODULOS = {
  recorrido: { label: 'Recorrido del flujo', icono: 'sh-arrow-right', grupo: 'Prototipo', subtitulo: 'Los pasos del flujo completo y la cuenta que hace cada uno.' },
  ordenes: { label: 'Órdenes de hospitalización', icono: 'sh-doc', grupo: 'Admisión', subtitulo: 'Registra que el paciente entra a hospitalización y a qué área. La cama la confirma enfermería de piso.' },
  mapa: { label: 'Mapa de camas', icono: 'sh-home', grupo: 'Operación', subtitulo: 'El estado de cada cama y las acciones sobre sus pacientes.' },
  movimientos: { label: 'Movimientos del día', icono: 'sh-swap', grupo: 'Operación', subtitulo: 'Lo registrado hoy en el servicio. Un movimiento no se borra: se anula con motivo.' },
  censo: { label: 'Censo diario', icono: 'sh-table', grupo: 'Operación', subtitulo: 'Se genera de los movimientos. Va de 00:00 a 23:59 y se recoge a las 08:00 del día siguiente.' },
  recepcion: { label: 'Recepción de censos', icono: 'sh-inbox', grupo: 'Estadística', subtitulo: 'Qué censos cerraron y qué historias clínicas llegaron.' },
  completado: { label: 'Completado desde HC', icono: 'sh-pencil', grupo: 'Estadística', subtitulo: 'Egresos que esperan el CIE-10 y el médico del alta, con la HC física en la mano.' },
  validacion: { label: 'Validación', icono: 'sh-stamp', grupo: 'Estadística', subtitulo: 'Egresos por validar e inconsistencias detectadas.' },
  consolidado: { label: 'Consolidado', icono: 'sh-lines', grupo: 'Reportes', subtitulo: 'Censos por día y servicio, y egresos del mes.' },
  renoxi: { label: 'RENOXI', icono: 'sh-send', grupo: 'Reportes', subtitulo: 'Lista para copiar al formulario web. RENOXI no tiene API.' },
  indicadores: { label: 'Indicadores DIRESA', icono: 'sh-chart', grupo: 'Reportes', subtitulo: 'Variables A a I del mes y su cierre.' },
  mantenimiento: { label: 'Órdenes de camas', icono: 'sh-wrench', grupo: 'Mantenimiento', subtitulo: 'Del reporte de la falla hasta que enfermería recibe la cama.' },
  tablero: { label: 'Tablero de ocupación', icono: 'sh-pie', grupo: 'Dirección', subtitulo: 'Ocupación actual, sin datos personales de pacientes.' },
  plano: { label: 'Plano de camas', icono: 'sh-folder', grupo: 'Configuración', subtitulo: 'El maestro de habitaciones y camas.' },
  cuentas: { label: 'Cuentas y bitácora', icono: 'sh-shield', grupo: 'Administración', subtitulo: 'Qué puede hacer cada área y qué se ha hecho.' },
  pacientes: { label: 'Buscar paciente', icono: 'sh-search', grupo: 'Pacientes', subtitulo: 'Dónde está, su trayectoria y quién completó cada dato.' },
}
