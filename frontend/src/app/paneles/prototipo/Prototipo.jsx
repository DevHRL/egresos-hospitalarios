import { Badge, Card, DataTable, LoginScreen, PaginatedTable, Stack } from '@hrl/core-ui'
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

export function CuentasBitacora() {
  const { estado } = useApp()
  return (
    <div className="panel"><Stack gap={4}>
      <Card title="Las cuentas del prototipo" subtitle="Todas ven el plano 3D. El rol decide qué puede hacer; los servicios, qué camas opera.">
        <DataTable rowKey={(c) => c.id} rows={CUENTAS} columns={[
          { key: 'usuario', label: 'Usuario', width: 170 },
          { key: 'nombre', label: 'Área', width: 210 },
          { key: 'rolLabel', label: 'Rol', width: 240 },
          { key: 'servicios', label: 'Servicios', width: 220, render: (c) => c.servicios.map(nombreServicio).join(', ') || '—' },
          { key: 'modulos', label: 'Módulos', render: (c) => c.modulos.map((m) => MODULOS[m].label).join(', ') },
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
