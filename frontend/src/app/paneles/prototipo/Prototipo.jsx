import { Badge, Button, Card, DataTable, LoginScreen, PaginatedTable, Stack } from '@hrl/core-ui'
import { CUENTAS, MODULOS, cuentaPorId } from '../../datos/cuentas.js'
import { iniciarSesion } from '../../datos/tienda.js'
import { verFechaHora } from '../../dominio/tiempo.js'
import { nombreServicio, useApp } from '../comun.jsx'

export function Acceso({ onEntrar }) {
  return (
    <LoginScreen
      systemName="Egresos Hospitalarios"
      onSubmit={async ({ username, password }) => {
        onEntrar(await iniciarSesion(username.trim(), password))
      }}
      footer={<span>Datos ficticios. Cuentas: {CUENTAS.map((c) => c.usuario).join(', ')}.</span>}
    />
  )
}

/* Guía de la demostración: el orden real del trabajo y quién hace cada paso. */
const PASOS = [
  ['Admisión registra la orden: paciente, origen (consulta externa o emergencia) y área. No elige cama.', 'admision', 'ordenes', 'Paciente, origen, área'],
  ['Enfermería de piso confirma la cama cuando el paciente llega.', 'medicina.b', 'mapa', 'Cama, fecha y hora de ingreso'],
  ['Durante la estancia: O2 y cambios de cama.', 'medicina.b', 'mapa', 'Soporte O2, cama nueva'],
  ['Traslado entre servicios: el origen lo envía.', 'medicina.b', 'mapa', 'Servicio de destino'],
  ['El destino confirma la llegada y elige la cama.', 'medicina.int', 'mapa', 'Cama de destino'],
  ['Si necesita UCI, el piso lo traslada; UCI confirma la cama y registra la ventilación.', 'uci.medicina', 'mapa', 'Cama de UCI, soporte VM'],
  ['Enfermería reporta una cama con falla.', 'medicina.b', 'mapa', 'Descripción de la falla'],
  ['Mantenimiento confirma el retiro, repara y entrega.', 'mantenimiento', 'mantenimiento', 'Reemplazo, diagnóstico, resultado'],
  ['Enfermería recibe la cama: vuelve a estar libre.', 'medicina.b', 'mapa', 'Confirmación de recepción'],
  ['Enfermería da de alta.', 'medicina.b', 'mapa', 'Fecha, hora, tipo y condición'],
  ['Pasadas las 24:00, enfermería cierra el censo.', 'medicina.b', 'censo', 'Conteo físico y observación'],
  ['Estadística ve qué censos cerraron y recibe las HC.', 'estadistica.tec', 'recepcion', 'HC recibidas'],
  ['Con la HC en la mano, completa el egreso.', 'estadistica.tec', 'completado', 'CIE-10 y médico del alta'],
  ['Estadística valida el egreso o lo observa.', 'estadistica.tec', 'validacion', 'Validación'],
  ['La responsable de camas obtiene RENOXI, sin armar el Excel.', 'estadistica.camas', 'renoxi', 'Marca de cargado'],
  ['Jefatura revisa indicadores DIRESA.', 'estadistica.jefe', 'indicadores', 'Cierre del mes'],
  ['TI revisa quién hizo cada acción.', 'ti', 'cuentas', 'Nada: es consulta'],
]

export function Recorrido() {
  const { ir, cuenta } = useApp()
  const filas = PASOS.map(([paso, cuentaId, modulo, datos], i) => ({ n: i + 1, paso, cuentaId, modulo, datos }))
  return (
    <div className="panel">
      <Card title="Flujo completo" subtitle="Cada botón entra con la cuenta correspondiente. Usa el reloj de la cabecera para llegar a las 24:00 y a las 08:00.">
        <DataTable rowKey={(f) => f.n} rows={filas} rowClass={(f) => (f.cuentaId === cuenta.id ? 'fila-actual' : '')} columns={[
          { key: 'n', label: '#', width: 44, align: 'right' },
          { key: 'paso', label: 'Paso' },
          { key: 'datos', label: 'Datos que se completan', width: 230 },
          { key: 'cuenta', label: 'Cuenta', width: 200, render: (f) => cuentaPorId(f.cuentaId).nombre },
          { key: 'accion', label: '', width: 90, align: 'right', render: (f) => <Button size="sm" tone="ghost" onClick={() => ir(f.cuentaId, f.modulo)}>Ir</Button> },
        ]} />
      </Card>
    </div>
  )
}

export function CuentasBitacora() {
  const { estado } = useApp()
  return (
    <div className="panel"><Stack gap={4}>
      <Card title="Una cuenta por área" subtitle="El rol decide qué puede hacer; los servicios, qué camas opera.">
        <DataTable rowKey={(c) => c.id} rows={CUENTAS} columns={[
          { key: 'usuario', label: 'Usuario', width: 170 },
          { key: 'nombre', label: 'Área', width: 210 },
          { key: 'rolLabel', label: 'Rol', width: 240 },
          { key: 'servicios', label: 'Servicios', width: 220, render: (c) => c.servicios.map(nombreServicio).join(', ') || '—' },
          { key: 'modulos', label: 'Módulos', render: (c) => c.modulos.filter((m) => m !== 'recorrido').map((m) => MODULOS[m].label).join(', ') },
        ]} />
      </Card>
      <Card title="Bitácora" subtitle="Lo hecho durante esta demostración, por cuenta. El censo y los reportes no se pueden alterar sin dejar rastro.">
        <PaginatedTable rowKey={(b) => b.id} rows={estado.bitacora} presorted perPage={12} empty="Todavía no se ha registrado nada en esta demostración." columns={[
          { key: 'fecha', label: 'Fecha', width: 150, render: (b) => verFechaHora(b.fecha) },
          { key: 'cuenta', label: 'Cuenta', width: 170, render: (b) => <Badge label={cuentaPorId(b.cuenta)?.nombre ?? b.cuenta} tone="none" /> },
          { key: 'accion', label: 'Acción', width: 300 },
          { key: 'detalle', label: 'Detalle' },
        ]} />
      </Card>
    </Stack></div>
  )
}
