import { useState } from 'react'
import { Badge, Button, Card, DataTable, EmptyState, Input, Stack } from '@hrl/core-ui'
import { ESTADOS_EGRESO, ORIGENES, SOPORTES, camaPorId, camposDelEpisodio, etiqueta, etiquetaEgreso, movimientosDe, posicionActual } from '../../dominio/consultas.js'
import { edad, verFechaHora } from '../../dominio/tiempo.js'
import { buscarEnPadron } from '../../datos/admision.js'
import { nombreMedico } from '../../datos/clinicos.js'
import { ListaDatos, nombreServicio, useApp } from '../comun.jsx'

function textoMovimiento(estado, m) {
  const cama = camaPorId(estado, m.camaId)?.codigo
  if (m.tipo === 'ingreso') return `Ingreso a ${nombreServicio(m.servicioId)}, cama ${cama}`
  if (m.tipo === 'traslado') return m.servicioOrigen === m.servicioId ? `Cambio a la cama ${cama}` : `Traslado a ${nombreServicio(m.servicioId)}, cama ${cama}`
  if (m.tipo === 'soporte') return etiqueta(SOPORTES, m.soporte)
  return etiquetaEgreso(m.tipoEgreso)
}

function Episodio({ h }) {
  const { estado } = useApp()
  const actual = !h.egreso ? posicionActual(estado, h.id) : null
  const campos = camposDelEpisodio(estado, h, nombreMedico, nombreServicio)
  return (
    <Card
      title={`Hospitalización del ${verFechaHora(h.fechaIngreso)}`}
      subtitle={actual ? `Está en ${nombreServicio(actual.servicioId)}, cama ${camaPorId(estado, actual.camaId).codigo}` : `Salió el ${verFechaHora(h.egreso.fechaHora)}`}
      meta={h.egreso?.estado ? <Badge label={ESTADOS_EGRESO[h.egreso.estado].label} tone={ESTADOS_EGRESO[h.egreso.estado].tono} /> : <Badge label={actual ? 'Hospitalizado' : 'Sin egreso hospitalario'} tone="info" />}
      wide
    >
      <div className="ficha-dos">
        <Stack gap={2}>
          <h3 className="subtitulo">Trayectoria</h3>
          <ol className="trayectoria">
            {movimientosDe(estado, h.id).map((m) => (
              <li key={m.id}><strong>{verFechaHora(m.fechaHora)}</strong><span>{textoMovimiento(estado, m)}</span></li>
            ))}
          </ol>
        </Stack>
        <Stack gap={2}>
          <h3 className="subtitulo">Quién completa cada dato</h3>
          <DataTable rowKey={(c) => c.dato} rows={campos} columns={[
            { key: 'dato', label: 'Dato' },
            { key: 'valor', label: 'Valor', render: (c) => c.valor ?? <Badge label="Pendiente" tone="warn" /> },
            { key: 'responsable', label: 'Lo completa', width: 170 },
          ]} />
        </Stack>
      </div>
    </Card>
  )
}

export function BuscarPaciente() {
  const { estado } = useApp()
  const [texto, setTexto] = useState('')
  const [id, setId] = useState(null)
  const hallados = buscarEnPadron(estado, texto).slice(0, 8)
  const paciente = estado.pacientes.find((p) => p.id === id)
  const episodios = paciente ? estado.hospitalizaciones.filter((h) => h.pacienteId === id && !h.anulada).reverse() : []
  const orden = paciente ? estado.ordenes.filter((o) => o.pacienteId === id && o.estado === 'pendiente')[0] : null
  return (
    <div className="panel"><Stack gap={4}>
      <Card title="¿Dónde está el paciente?" subtitle="Reemplaza la consulta a los censos en papel.">
        <Stack gap={3}>
          <Input label="N° de HC, DNI o apellidos" searchIcon autoFocus value={texto} onChange={(e) => { setTexto(e.target.value); setId(null) }} />
          {!paciente && hallados.map((p) => (
            <Stack key={p.id} direction="row" justify="between" align="center" gap={2}>
              <span>{p.nombres} · HC {p.hc} · DNI {p.dni}</span>
              <Button size="sm" tone="ghost" onClick={() => setId(p.id)}>Ver ficha</Button>
            </Stack>
          ))}
        </Stack>
      </Card>
      {paciente && (
        <Card title={paciente.nombres} subtitle="Datos del padrón.">
          <ListaDatos datos={[['N° de HC', paciente.hc], ['DNI', paciente.dni], ['Sexo', paciente.sexo], ['Edad', `${edad(paciente.nacimiento, estado.ahora)} años`], ...(orden ? [['Orden pendiente', `${etiqueta(ORIGENES, orden.origen)}, a ${nombreServicio(orden.servicioId)}. Espera cama.`]] : [])]} />
        </Card>
      )}
      {episodios.map((h) => <Episodio key={h.id} h={h} />)}
      {paciente && episodios.length === 0 && !orden && <EmptyState icon="sh-search" title="Sin hospitalizaciones" body="Este paciente está en el padrón, pero no tiene hospitalizaciones registradas." />}
    </Stack></div>
  )
}
