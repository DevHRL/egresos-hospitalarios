/* Las cuentas del prototipo. Todas ven el plano de camas; el rol decide qué
   puede hacer cada una y los servicios limitan qué camas opera.

   El flujo (2026-11-13, decisión 0010): Admisión envía al paciente a un área,
   esa área designa habitación y cama y desde ahí controla al paciente: soporte,
   traslados y alta completa con CIE-10. La cuenta del departamento solo
   monitorea. Las contraseñas son de la demostración: en el sistema real las
   administra TI. */

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
    rolLabel: 'Monitoreo del departamento',
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
    rolLabel: 'Enfermería de piso',
    servicios: [UCI],
    modulos: ['mapa', 'movimientos', 'censo', 'pacientes'],
  },
  {
    id: 'quemados',
    usuario: 'quemados',
    nombre: 'Enfermería Quemados',
    rol: 'enfermeria',
    rolLabel: 'Enfermería de piso',
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
    modulos: ['mapa', 'recepcion', 'validacion', 'censo', 'consolidado', 'renoxi', 'indicadores', 'pacientes'],
  },
  {
    /* Quien lleva el control diario de camas y carga RENOXI a mano. */
    id: 'control.camas',
    usuario: 'control.camas',
    nombre: 'Control diario de camas',
    rol: 'camas',
    rolLabel: 'Control diario de camas y RENOXI',
    servicios: TODOS,
    modulos: ['mapa', 'renoxi', 'tablero'],
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
]

/* Opera el área (designa camas, registra altas y traslados) solo su enfermería.
   El servidor aplica la misma regla. */
export const operaArea = (cuenta, servicioId) => cuenta.rol === 'enfermeria' && cuenta.servicios.includes(servicioId)

export const cuentaPorId = (id) => CUENTAS.find((c) => c.id === id) ?? null
export const cuentaPorUsuario = (u) => CUENTAS.find((c) => c.usuario === u) ?? null

export const MODULOS = {
  /* `encabezadoPropio`: la pantalla pone su título en su columna izquierda y
     el plano ocupa la derecha desde arriba; App no monta la cabecera. */
  mapa: { label: 'Gestión de camas', icono: 'sh-home', grupo: 'Operación', subtitulo: 'Gira, acerca y selecciona una habitación. Cada cuenta ve las acciones que le tocan.', encabezadoPropio: true },
  ordenes: { label: 'Órdenes de hospitalización', icono: 'sh-doc', grupo: 'Admisión', subtitulo: 'Envía al paciente a un área. La habitación y la cama las designa esa área.' },
  movimientos: { label: 'Movimientos del día', icono: 'sh-swap', grupo: 'Operación', subtitulo: 'Lo registrado hoy en el servicio. Un movimiento no se borra: se anula con motivo.' },
  censo: { label: 'Censo diario', icono: 'sh-table', grupo: 'Operación', subtitulo: 'Se genera de los movimientos. Desde aquí se registran las altas y los traslados. Va de 00:00 a 23:59 y se cierra a las 24:00.' },
  recepcion: { label: 'Recepción de censos', icono: 'sh-inbox', grupo: 'Estadística', subtitulo: 'Qué censos cerraron y qué historias clínicas llegaron.' },
  validacion: { label: 'Validación', icono: 'sh-stamp', grupo: 'Estadística', subtitulo: 'Revisión de las altas antes de cerrar el mes, e inconsistencias detectadas.' },
  consolidado: { label: 'Consolidado', icono: 'sh-lines', grupo: 'Reportes', subtitulo: 'Censos por día y servicio, y egresos del mes.' },
  renoxi: { label: 'RENOXI', icono: 'sh-send', grupo: 'Reportes', subtitulo: 'Lo del día en el orden del formulario web, para copiarlo o descargarlo. RENOXI no tiene API.' },
  indicadores: { label: 'Indicadores DIRESA', icono: 'sh-chart', grupo: 'Reportes', subtitulo: 'Variables A a I del mes y su cierre.' },
  mantenimiento: { label: 'Órdenes de camas', icono: 'sh-wrench', grupo: 'Mantenimiento', subtitulo: 'Del reporte de la falla hasta que enfermería recibe la cama.' },
  tablero: { label: 'Tablero de ocupación', icono: 'sh-pie', grupo: 'Supervisión', subtitulo: 'Ocupación actual del departamento por área.' },
  cuentas: { label: 'Cuentas y bitácora', icono: 'sh-shield', grupo: 'Supervisión', subtitulo: 'Qué puede hacer cada cuenta y qué se ha hecho.' },
  pacientes: { label: 'Buscar paciente', icono: 'sh-search', grupo: 'Pacientes', subtitulo: 'Dónde está, su trayectoria y quién completó cada dato.' },
}
