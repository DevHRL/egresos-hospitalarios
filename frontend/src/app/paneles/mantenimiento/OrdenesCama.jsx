import { useState } from 'react'
import { Badge, Button, Card, DataTable, Grid, Input, SegmentedControl, Stack, StatCard } from '@hrl/core-ui'
import { ESTADOS_ORDEN_CAMA, camaPorId } from '../../dominio/consultas.js'
import { diasEntre, verFechaHora } from '../../dominio/tiempo.js'
import { DialogoAccion, nombreServicio, useApp, useEnvio } from '../comun.jsx'

const TONOS = { pendiente_retiro: 'warn', en_reparacion: 'info', lista_entrega: 'info', por_recibir: 'warn', cerrada: 'ok' }
const FILTROS = [{ value: 'abiertas', label: 'Abiertas' }, { value: 'todas', label: 'Todas' }]

function DialogoRetiro({ orden, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [conReemplazo, setReemplazo] = useState('no')
  return (
    <DialogoAccion titulo="Confirmar retiro" subtitulo="Sin reemplazo, el puesto queda fuera de servicio hasta que la cama vuelva." textoConfirmar="Confirmar retiro" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('mant/retirar', { ordenId: orden.id, conReemplazo: conReemplazo === 'si' }, 'Retiro confirmado.')}>
      <SegmentedControl label="¿Se deja una cama de reemplazo?" value={conReemplazo} options={[{ value: 'no', label: 'Sin reemplazo' }, { value: 'si', label: 'Con reemplazo' }]} onChange={setReemplazo} />
    </DialogoAccion>
  )
}

function DialogoResolver({ orden, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [diagnostico, setDiagnostico] = useState('')
  const [resultado, setResultado] = useState('reparada')
  return (
    <DialogoAccion titulo="Resultado de la reparación" textoConfirmar="Guardar resultado" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('mant/resolver', { ordenId: orden.id, diagnostico, resultado }, 'Resultado registrado.')}>
      <Input label="Diagnóstico" required autoFocus value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} />
      <SegmentedControl label="Resultado" value={resultado} options={[{ value: 'reparada', label: 'Reparada' }, { value: 'baja', label: 'De baja' }]} onChange={setResultado} />
    </DialogoAccion>
  )
}

export function OrdenesCama() {
  const { estado, hacer } = useApp()
  const [filtro, setFiltro] = useState('abiertas')
  const [dialogo, setDialogo] = useState(null)
  const filas = [...estado.ordenesCama].filter((o) => filtro === 'todas' || o.estado !== 'cerrada').reverse()
  const cuenta = (e) => estado.ordenesCama.filter((o) => o.estado === e).length
  const perdidos = estado.ordenesCama.filter((o) => o.retiradaEn && !o.conReemplazo).reduce((s, o) => s + Math.max(0, diasEntre(o.retiradaEn, o.recibidaEn ?? estado.ahora)), 0)
  const accion = (o) => {
    if (o.estado === 'pendiente_retiro') return <Button size="sm" onClick={() => setDialogo({ tipo: 'retiro', orden: o })}>Confirmar retiro</Button>
    if (o.estado === 'en_reparacion') return <Button size="sm" onClick={() => setDialogo({ tipo: 'resolver', orden: o })}>Registrar resultado</Button>
    if (o.estado === 'lista_entrega') return <Button size="sm" onClick={() => hacer('mant/entregar', { ordenId: o.id }, 'Cama entregada. Enfermería debe confirmar la recepción.')}>Entregar al servicio</Button>
    if (o.estado === 'por_recibir') return <span className="texto-apoyo">Espera a enfermería</span>
    return null
  }
  return (
    <div className="panel"><Stack gap={4}>
      <Grid min={290} gap={3}>
        <StatCard label="Pendientes de retiro" value={cuenta('pendiente_retiro')} />
        <StatCard label="En reparación" value={cuenta('en_reparacion')} />
        <StatCard label="Listas para entregar" value={cuenta('lista_entrega')} />
        <StatCard label="Días-cama perdidos" value={perdidos} note="Por retiros sin reemplazo" />
      </Grid>
      <Card title="Órdenes" subtitle="La orden se cierra cuando Mantenimiento entrega y enfermería confirma." actions={<SegmentedControl label="Filtro" value={filtro} options={FILTROS} onChange={setFiltro} />}>
        <DataTable rowKey={(o) => o.id} rows={filas} empty="No hay órdenes abiertas." columns={[
          { key: 'cama', label: 'Cama', width: 80, render: (o) => <strong>{camaPorId(estado, o.camaId).codigo}</strong> },
          { key: 'servicio', label: 'Servicio', width: 160, render: (o) => nombreServicio(camaPorId(estado, o.camaId).servicioId) },
          { key: 'activo', label: 'Cama física', width: 110 },
          { key: 'falla', label: 'Falla' },
          { key: 'reportada', label: 'Reportada', width: 140, render: (o) => verFechaHora(o.reportadaEn) },
          { key: 'reemplazo', label: 'Reemplazo', width: 100, render: (o) => (o.conReemplazo === null ? '—' : o.conReemplazo ? 'Con' : 'Sin') },
          { key: 'estado', label: 'Estado', width: 190, render: (o) => <Badge label={ESTADOS_ORDEN_CAMA[o.estado]} tone={TONOS[o.estado]} /> },
          { key: 'accion', label: '', width: 170, align: 'right', render: accion },
        ]} />
      </Card>
      {dialogo?.tipo === 'retiro' && <DialogoRetiro orden={dialogo.orden} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'resolver' && <DialogoResolver orden={dialogo.orden} onCerrar={() => setDialogo(null)} />}
    </Stack></div>
  )
}
