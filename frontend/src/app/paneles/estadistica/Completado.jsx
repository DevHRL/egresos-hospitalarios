import { useState } from 'react'
import { Alert, Badge, Button, Card, DataTable, Input, Stack } from '@hrl/core-ui'
import { ESTADOS_EGRESO, ESTADOS_HC, etiquetaEgreso, pacientePorId } from '../../dominio/consultas.js'
import { diasEntre, verFechaHora } from '../../dominio/tiempo.js'
import { CIE10, MEDICOS } from '../../datos/clinicos.js'
import { DialogoAccion, ListaDatos, nombreServicio, useApp, useEnvio } from '../comun.jsx'

function DialogoCompletar({ hospitalizacion: h, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const p = pacientePorId(estado, h.pacienteId)
  const [cie10, setCie] = useState('')
  const [secundario, setSecundario] = useState('')
  const [medicoId, setMedico] = useState(h.egreso.medicoId ?? '')
  const vacio = { value: '', label: 'Elige…' }
  const guardar = () => enviar('egreso/completar', { hospitalizacionId: h.id, cie10, medicoId, secundarios: [secundario] }, 'Egreso completo. Pasa a validación.')
  return (
    <DialogoAccion titulo="Completar egreso desde la HC" subtitulo="La fecha de ingreso, la cama y el tipo de egreso ya los registró el piso." textoConfirmar="Guardar (Enter)" maxWidth={640} onCerrar={onCerrar} error={error} onConfirmar={guardar}>
      <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); guardar() } }}>
        <Stack gap={3}>
          <ListaDatos datos={[['Paciente', p.nombres], ['N° de HC', p.hc], ['Ingreso', verFechaHora(h.fechaIngreso)], ['Egreso', `${verFechaHora(h.egreso.fechaHora)} · ${etiquetaEgreso(h.egreso.tipo)}`], ['Diagnóstico de ingreso', h.diagnosticoIngreso || null]]} />
          {h.egreso.motivoObservacion && <Alert tone="warning" title="Observado">{h.egreso.motivoObservacion}</Alert>}
          <Input label="CIE-10 principal" required autoFocus kind="select" value={cie10} onChange={(e) => setCie(e.target.value)} options={[vacio, ...CIE10]} />
          <Input label="CIE-10 secundario" kind="select" value={secundario} onChange={(e) => setSecundario(e.target.value)} options={[{ value: '', label: 'Ninguno' }, ...CIE10]} />
          <Input label="Médico que dio el alta" required kind="select" value={medicoId} onChange={(e) => setMedico(e.target.value)} options={[vacio, ...MEDICOS]} />
        </Stack>
      </div>
    </DialogoAccion>
  )
}

const tonoAtraso = (d) => (d > 5 ? 'crit' : d >= 2 ? 'warn' : 'ok')

export function Completado() {
  const { estado } = useApp()
  const [abierto, setAbierto] = useState(null)
  const [hc, setHc] = useState('')
  const [aviso, setAviso] = useState(null)
  const filas = estado.hospitalizaciones.filter((h) => !h.anulada && ['pendiente_hc', 'observado'].includes(h.egreso?.estado)).sort((a, b) => (a.egreso.fechaHora < b.egreso.fechaHora ? -1 : 1))
  const buscar = () => {
    const h = filas.find((x) => pacientePorId(estado, x.pacienteId).hc === hc.trim())
    setAviso(h ? null : `No hay un egreso pendiente con la HC ${hc}.`)
    if (h) { setAbierto(h.id); setHc('') }
  }
  const actual = filas.find((h) => h.id === abierto)
  return (
    <div className="panel"><Stack gap={4}>
      <Card title="Bandeja de completado" subtitle="Más antiguo primero. Escribe el N° de HC de la historia que tienes en la mano y pulsa Enter.">
        <Stack gap={3}>
          <div className="fila-accion" onKeyDown={(e) => { if (e.key === 'Enter') buscar() }}>
            <Input label="N° de HC" autoFocus value={hc} onChange={(e) => setHc(e.target.value)} />
            <Button onClick={buscar}>Abrir</Button>
          </div>
          {aviso && <Alert tone="warning" title="Sin coincidencias">{aviso}</Alert>}
          <DataTable
            rowKey={(h) => h.id}
            rows={filas}
            empty="No hay egresos pendientes."
            columns={[
              { key: 'atraso', label: 'Atraso', width: 90, render: (h) => { const d = diasEntre(h.egreso.fechaHora, estado.ahora); return <Badge label={`${d} d`} tone={tonoAtraso(d)} /> } },
              { key: 'hc', label: 'N° HC', width: 90, render: (h) => pacientePorId(estado, h.pacienteId).hc },
              { key: 'paciente', label: 'Paciente', render: (h) => pacientePorId(estado, h.pacienteId).nombres },
              { key: 'servicio', label: 'Servicio', width: 170, render: (h) => nombreServicio(h.egreso.servicioId) },
              { key: 'egreso', label: 'Egreso', width: 150, render: (h) => verFechaHora(h.egreso.fechaHora) },
              { key: 'hcFisica', label: 'HC física', width: 190, render: (h) => ESTADOS_HC[h.egreso.hc] },
              { key: 'estado', label: 'Estado', width: 150, render: (h) => <Badge label={ESTADOS_EGRESO[h.egreso.estado].label} tone={ESTADOS_EGRESO[h.egreso.estado].tono} /> },
              { key: 'accion', label: '', width: 110, align: 'right', render: (h) => <Button size="sm" onClick={() => setAbierto(h.id)}>Completar</Button> },
            ]}
          />
        </Stack>
      </Card>
      {actual && <DialogoCompletar hospitalizacion={actual} onCerrar={() => setAbierto(null)} />}
    </Stack></div>
  )
}
