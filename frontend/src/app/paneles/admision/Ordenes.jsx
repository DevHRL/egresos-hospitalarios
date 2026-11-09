import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, PageActions, SegmentedControl, Stack } from '@hrl/core-ui'
import { ORIGENES, etiqueta, movimientosDe, camaPorId, pacientePorId, serviciosConCamas } from '../../dominio/consultas.js'
import { verFechaHora } from '../../dominio/tiempo.js'
import { buscarEnPadron } from '../../datos/admision.js'
import { DialogoAccion, ListaDatos, nombreServicio, opcionesServicio, useApp, useEnvio } from '../comun.jsx'

const PACIENTE_VACIO = { hc: '', dni: '', nombres: '', sexo: '', nacimiento: '' }

function DialogoOrden({ onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState(null)
  const [nuevo, setNuevo] = useState(PACIENTE_VACIO)
  const [origen, setOrigen] = useState('consulta_externa')
  const [servicioId, setServicio] = useState('')
  const [medicoOrdena, setMedico] = useState('')
  const [diagnosticoIngreso, setDx] = useState('')
  const [enviadaPor, setEnviada] = useState('')
  const hallados = buscarEnPadron(estado, busqueda).slice(0, 5)
  const campo = (k) => (e) => setNuevo({ ...nuevo, [k]: e.target.value })
  const paciente = elegido ? { pacienteId: elegido.id } : { paciente: nuevo }

  return (
    <DialogoAccion
      titulo="Nueva orden de hospitalización"
      subtitulo="Admisión indica el paciente y el área. La cama la confirma enfermería de piso."
      textoConfirmar="Enviar al área"
      maxWidth={640}
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('orden/registrar', { ...paciente, origen, servicioId, medicoOrdena, diagnosticoIngreso, enviadaPor }, 'Orden enviada. El área ya la ve en su lista de pendientes.')}
    >
      <SegmentedControl label="Por dónde llega" value={origen} options={ORIGENES} onChange={setOrigen} />
      {origen === 'emergencia' && <Input label="Enfermera de Emergencia que envió la orden" required value={enviadaPor} onChange={(e) => setEnviada(e.target.value)} />}
      {elegido ? (
        <Stack gap={2}>
          <ListaDatos datos={[['Paciente', elegido.nombres], ['N° de HC', elegido.hc], ['DNI', elegido.dni]]} />
          <div><Button tone="ghost" size="sm" onClick={() => setElegido(null)}>Elegir otro paciente</Button></div>
        </Stack>
      ) : (
        <Stack gap={3}>
          <Input label="Buscar en el padrón" searchIcon placeholder="N° de HC, DNI o apellidos" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {hallados.map((p) => (
            <Stack key={p.id} direction="row" justify="between" align="center" gap={2}>
              <span>{p.nombres} · HC {p.hc} · DNI {p.dni}</span>
              <Button size="sm" tone="ghost" onClick={() => setElegido(p)}>Elegir</Button>
            </Stack>
          ))}
          <p className="texto-apoyo">Si no está en el padrón, escribe sus datos:</p>
          <div className="campos-dos">
            <Input label="N° de HC" value={nuevo.hc} onChange={campo('hc')} />
            <Input label="DNI" value={nuevo.dni} onChange={campo('dni')} />
          </div>
          <Input label="Apellidos y nombres" value={nuevo.nombres} onChange={campo('nombres')} />
          <div className="campos-dos">
            <Input label="Sexo" kind="select" value={nuevo.sexo} onChange={campo('sexo')} options={[{ value: '', label: 'Elige…' }, { value: 'F', label: 'Femenino' }, { value: 'M', label: 'Masculino' }]} />
            <Input label="Fecha de nacimiento" kind="date" value={nuevo.nacimiento} onChange={campo('nacimiento')} />
          </div>
        </Stack>
      )}
      <Input label="Área de hospitalización" required kind="select" value={servicioId} onChange={(e) => setServicio(e.target.value)} options={[{ value: '', label: 'Elige…' }, ...opcionesServicio(serviciosConCamas(estado))]} />
      <div className="campos-dos">
        <Input label="Médico que ordena" value={medicoOrdena} onChange={(e) => setMedico(e.target.value)} />
        <Input label="Diagnóstico de ingreso" info="Opcional." value={diagnosticoIngreso} onChange={(e) => setDx(e.target.value)} />
      </div>
    </DialogoAccion>
  )
}

function DialogoAnular({ orden, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [motivo, setMotivo] = useState('')
  return (
    <DialogoAccion titulo="Anular orden" textoConfirmar="Anular orden" tono="danger" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('orden/anular', { ordenId: orden.id, motivo }, 'Orden anulada.')}>
      <Input label="Motivo" required autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </DialogoAccion>
  )
}

const FILTROS = [{ value: 'pendiente', label: 'Esperando cama' }, { value: 'todas', label: 'Todas' }]

export function Ordenes() {
  const { estado } = useApp()
  const [filtro, setFiltro] = useState('pendiente')
  const [nueva, setNueva] = useState(false)
  const [anular, setAnular] = useState(null)
  const filas = [...estado.ordenes].filter((o) => filtro === 'todas' || o.estado === 'pendiente').reverse()
  const camaDe = (o) => {
    if (!o.hospitalizacionId) return null
    return camaPorId(estado, movimientosDe(estado, o.hospitalizacionId).find((m) => m.tipo === 'ingreso')?.camaId)?.codigo
  }
  return (
    <div className="panel">
      <PageActions><Button icon="sh-plus" onClick={() => setNueva(true)}>Nueva orden</Button></PageActions>
      <Card title="Órdenes" subtitle="En el sistema final estas órdenes llegan desde Admisión (Galeno)." actions={<SegmentedControl label="Filtro" value={filtro} options={FILTROS} onChange={setFiltro} />}>
        <DataTable
          rowKey={(o) => o.id}
          rows={filas}
          empty="No hay órdenes esperando cama."
          columns={[
            { key: 'fechaHora', label: 'Orden', width: 150, render: (o) => verFechaHora(o.fechaHora) },
            { key: 'paciente', label: 'Paciente', render: (o) => pacientePorId(estado, o.pacienteId).nombres },
            { key: 'hc', label: 'N° de HC', width: 100, render: (o) => pacientePorId(estado, o.pacienteId).hc },
            { key: 'origen', label: 'Origen', width: 150, render: (o) => etiqueta(ORIGENES, o.origen) },
            { key: 'servicio', label: 'Área', width: 170, render: (o) => nombreServicio(o.servicioId) },
            { key: 'estado', label: 'Estado', width: 170, render: (o) => (o.estado === 'pendiente' ? <Badge label="Esperando cama" tone="warn" /> : o.estado === 'anulada' ? <Badge label="Anulada" tone="none" /> : <Badge label={`En cama ${camaDe(o) ?? ''}`} tone="ok" />) },
            { key: 'accion', label: '', width: 100, align: 'right', render: (o) => (o.estado === 'pendiente' ? <Button size="sm" tone="ghost" onClick={() => setAnular(o)}>Anular</Button> : null) },
          ]}
        />
      </Card>
      {nueva && <DialogoOrden onCerrar={() => setNueva(false)} />}
      {anular && <DialogoAnular orden={anular} onCerrar={() => setAnular(null)} />}
    </div>
  )
}
