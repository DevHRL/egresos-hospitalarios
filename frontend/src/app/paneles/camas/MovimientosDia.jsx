import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, PageActions, Stack } from '@hrl/core-ui'
import { camaPorId, censoEditable, etiquetaEgreso, hospitalizacionPorId, movimientosDe, pacientePorId } from '../../dominio/consultas.js'
import { diaDe, horaDe, verFechaHora } from '../../dominio/tiempo.js'
import { DialogoAccion, diaOperativo, nombreServicio, useApp, useEnvio } from '../comun.jsx'

const TIPOS = { ingreso: 'Ingreso', traslado: 'Traslado', soporte: 'Soporte', egreso: 'Egreso' }

function detalle(estado, m) {
  const cama = camaPorId(estado, m.camaId)?.codigo
  if (m.tipo === 'traslado') return m.servicioOrigen === m.servicioId ? `De ${camaPorId(estado, m.camaOrigen)?.codigo} a ${cama}` : `${nombreServicio(m.servicioOrigen)} a ${nombreServicio(m.servicioId)}, cama ${cama}`
  if (m.tipo === 'soporte') return m.soporte === 'o2' ? `Inicio de O2, cama ${cama}` : `Retiro de O2, cama ${cama}`
  if (m.tipo === 'egreso') return `${etiquetaEgreso(m.tipoEgreso)}, cama ${cama}`
  return `Cama ${cama}`
}

function DialogoAnular({ movimiento, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [motivo, setMotivo] = useState('')
  return (
    <DialogoAccion titulo="Anular movimiento" subtitulo="No se borra: queda registrado con su motivo." textoConfirmar="Anular" tono="danger" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('movimiento/anular', { movimientoId: movimiento.id, motivo }, 'Movimiento anulado.')}>
      <Input label="Motivo" required autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </DialogoAccion>
  )
}

const FILAS_EN_BLANCO = Array.from({ length: 16 }, (_, i) => ({ i }))

export function MovimientosDia() {
  const { estado, cuenta } = useApp()
  const [anular, setAnular] = useState(null)
  const dia = diaOperativo(estado.ahora)
  const propios = (m) => cuenta.servicios.includes(m.servicioId) || cuenta.servicios.includes(m.servicioOrigen)
  const filas = estado.movimientos.filter((m) => diaDe(m.fechaHora) === dia && propios(m)).sort((a, b) => (a.fechaHora === b.fechaHora ? b.seq - a.seq : a.fechaHora < b.fechaHora ? 1 : -1))
  const anulable = (m) => {
    if (m.anulado || !censoEditable(estado, m.servicioId, dia)) return false
    return movimientosDe(estado, m.hospitalizacionId).at(-1)?.id === m.id
  }
  return (
    <div className="panel"><Stack gap={4}>
      <PageActions><Button tone="ghost" icon="sh-doc" onClick={() => window.print()}>Imprimir hoja de movimientos</Button></PageActions>
      <Card title="Registrados en el día" subtitle="La hora del evento puede ser anterior a la hora en que se digitó.">
        <DataTable
          rowKey={(m) => m.id}
          rows={filas}
          empty="Sin movimientos este día."
          rowClass={(m) => (m.anulado ? 'fila-vacia' : '')}
          columns={[
            { key: 'hora', label: 'Hora del evento', width: 110, render: (m) => horaDe(m.fechaHora) },
            { key: 'tipo', label: 'Movimiento', width: 110, render: (m) => (m.anulado ? <Badge label="Anulado" tone="none" /> : TIPOS[m.tipo]) },
            { key: 'paciente', label: 'Paciente', render: (m) => pacientePorId(estado, hospitalizacionPorId(estado, m.hospitalizacionId).pacienteId).nombres },
            { key: 'detalle', label: 'Detalle', render: (m) => (m.anulado ? m.motivoAnulacion : detalle(estado, m)) },
            { key: 'registrado', label: 'Digitado', width: 150, render: (m) => verFechaHora(m.registradoEn) },
            { key: 'accion', label: '', width: 90, align: 'right', render: (m) => (anulable(m) && cuenta.rol === 'enfermeria' ? <Button size="sm" tone="ghost" onClick={() => setAnular(m)}>Anular</Button> : null) },
          ]}
        />
      </Card>
      <div className="solo-impresion zona-impresion">
        <Card title={`Hoja de movimientos · ${cuenta.servicios.map(nombreServicio).join(', ')}`} subtitle={`Para anotar a mano cuando no hay tiempo de digitar. Fecha: ____ / ____ / ________`}>
          <DataTable
            rowKey={(f) => f.i}
            rows={FILAS_EN_BLANCO}
            columns={[
              { key: 'hora', label: 'Hora aprox.', width: 90, render: () => ' ' },
              { key: 'hc', label: 'N° HC', width: 100, render: () => '' },
              { key: 'nombre', label: 'Paciente', render: () => '' },
              { key: 'mov', label: 'I / T / E', width: 70, render: () => '' },
              { key: 'cama', label: 'Cama', width: 70, render: () => '' },
              { key: 'dest', label: 'Origen / destino', width: 150, render: () => '' },
              { key: 'o2', label: 'O2', width: 50, render: () => '' },
              { key: 'tipo', label: 'Tipo de egreso', width: 130, render: () => '' },
            ]}
          />
        </Card>
      </div>
      {anular && <DialogoAnular movimiento={anular} onCerrar={() => setAnular(null)} />}
    </Stack></div>
  )
}
