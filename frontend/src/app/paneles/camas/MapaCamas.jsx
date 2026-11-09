import { useMemo, useState } from 'react'
import { Badge, Button, Card, DataTable, FloatingTip, Grid, Icon, SegmentedControl, Stack, StatCard, useFloatingTip } from '@hrl/core-ui'
import { ESTADOS_CAMA_MAPA, ESTADOS_ORDEN_CAMA, ORIGENES, estadosDeCamas, etiqueta, hospitalizacionPorId, pacientePorId, resumenCamas } from '../../dominio/consultas.js'
import { edad, estancia, verFechaHora } from '../../dominio/tiempo.js'
import { ordenesPendientes } from '../../datos/admision.js'
import { PLANO_MEDICINA_B } from '../../datos/tienda.js'
import { nombreServicio, useApp } from '../comun.jsx'
import { VistaMapa } from './VistaMapa.jsx'
import { DialogoBloqueo, DialogoCama, DialogoConfirmarTraslado, DialogoEgreso, DialogoFalla, DialogoIngreso, DialogoSoporte, DialogoTraslado } from './Dialogos.jsx'

const VISTAS = [
  { value: 'iso', label: 'Isométrica' },
  { value: 'planta', label: 'Planta' },
  { value: 'tarjetas', label: 'Tarjetas' },
]

function textoHover(estado, info) {
  const meta = ESTADOS_CAMA_MAPA[info.estado]
  const titulo = `Cama ${info.cama.codigo} · ${meta.label}`
  if (info.ocupante) {
    const h = info.ocupante.hospitalizacion
    const p = pacientePorId(estado, h.pacienteId)
    return { titulo, cuerpo: `${p.nombres} · HC ${p.hc} · ${edad(p.nacimiento, estado.ahora)} años · ${estancia(h.fechaIngreso, estado.ahora)} días${info.ocupante.soporte === 'o2' ? ' · O2' : ''}` }
  }
  if (info.orden) return { titulo, cuerpo: `${ESTADOS_ORDEN_CAMA[info.orden.estado]}: ${info.orden.falla}` }
  if (info.cama.bloqueo) return { titulo, cuerpo: info.cama.bloqueo.motivo }
  return { titulo, cuerpo: `${info.cama.habitacion} · ${nombreServicio(info.cama.servicioId)}` }
}

function Leyenda() {
  return (
    <ul className="mapa-leyenda">
      {Object.entries(ESTADOS_CAMA_MAPA).map(([k, v]) => (
        <li key={k}><span className={`mapa-muestra mapa-estado--${k}`} /><Icon name={v.icono} size={14} />{v.label}</li>
      ))}
      <li><Icon name="sh-warn" size={14} />Falla reportada</li>
    </ul>
  )
}

function Tarjetas({ estados, onSeleccionar }) {
  const { estado } = useApp()
  const orden = [...estados].sort((a, b) => a.cama.codigo.localeCompare(b.cama.codigo, 'es', { numeric: true }))
  return (
    <div className="mapa-tarjetas">
      {orden.map((info) => {
        const meta = ESTADOS_CAMA_MAPA[info.estado]
        const h = info.ocupante?.hospitalizacion
        const p = h && pacientePorId(estado, h.pacienteId)
        return (
          /* hrl-nativo: tarjeta que se pulsa; el kit no tiene una. */
          <button type="button" key={info.cama.id} className="mapa-tarjeta" onClick={() => onSeleccionar(info.cama.id)}>
            <span className="mapa-tarjeta__fila"><strong>{info.cama.codigo}</strong><Badge label={meta.label} tone={meta.tono} /></span>
            <span className="mapa-tarjeta__paciente">{p ? p.nombres : info.cama.habitacion}</span>
            <span className="texto-apoyo">{p ? `HC ${p.hc} · ${estancia(h.fechaIngreso, estado.ahora)} días` : info.falla ? 'Falla reportada' : ' '}</span>
          </button>
        )
      })}
    </div>
  )
}

function PorAtender({ abrir }) {
  const { estado, cuenta, hacer } = useApp()
  if (cuenta.rol !== 'enfermeria') return null
  const ordenes = ordenesPendientes(estado, cuenta.servicios)
  const traslados = estado.traslados.filter((t) => t.estado === 'pendiente' && cuenta.servicios.includes(t.servicioDestino))
  const camas = estado.ordenesCama.filter((o) => o.estado === 'por_recibir' && cuenta.servicios.includes(estado.camas.find((c) => c.id === o.camaId).servicioId))
  const filas = [
    ...ordenes.map((o) => {
      const p = pacientePorId(estado, o.pacienteId)
      return { clave: o.id, que: 'Ingreso', icono: 'sh-plus', quien: p.nombres, detalle: `HC ${p.hc} · ${etiqueta(ORIGENES, o.origen)}${o.diagnosticoIngreso ? ` · ${o.diagnosticoIngreso}` : ''}`, desde: o.fechaHora, boton: 'Asignar cama', accion: () => abrir({ tipo: 'ingreso', ordenId: o.id }) }
    }),
    ...traslados.map((t) => {
      const p = pacientePorId(estado, hospitalizacionPorId(estado, t.hospitalizacionId).pacienteId)
      return { clave: t.id, que: 'Traslado', icono: 'sh-swap', quien: p.nombres, detalle: `Viene de ${nombreServicio(t.servicioOrigen)}`, desde: t.solicitadoEn, boton: 'Confirmar llegada', accion: () => abrir({ tipo: 'confirmarTraslado', trasladoId: t.id }) }
    }),
    ...camas.map((o) => ({ clave: o.id, que: 'Cama', icono: 'sh-wrench', quien: estado.camas.find((c) => c.id === o.camaId).codigo, detalle: `Devuelta por Mantenimiento: ${o.diagnostico}`, desde: o.entregadaEn, boton: 'Recibir cama', accion: () => hacer('mant/recibir', { ordenId: o.id }, 'Cama recibida. Vuelve a estar libre.') })),
  ]
  if (filas.length === 0) return null
  return (
    <Card title="Por atender" subtitle="Pacientes y camas que esperan una confirmación de este servicio.">
      <DataTable
        rowKey={(f) => f.clave}
        rows={filas}
        columns={[
          { key: 'que', label: 'Qué', width: 120, render: (f) => <Stack direction="row" gap={2} align="center"><Icon name={f.icono} size={14} />{f.que}</Stack> },
          { key: 'quien', label: 'Paciente o cama' },
          { key: 'detalle', label: 'Detalle' },
          { key: 'desde', label: 'Desde', width: 150, render: (f) => verFechaHora(f.desde) },
          { key: 'accion', label: '', width: 170, align: 'right', render: (f) => <Button size="sm" onClick={f.accion}>{f.boton}</Button> },
        ]}
      />
    </Card>
  )
}

export function MapaCamas() {
  const { estado, cuenta } = useApp()
  const [vista, setVista] = useState('iso')
  const [seleccion, setSeleccion] = useState(null)
  const [dialogo, setDialogo] = useState(null)
  const tip = useFloatingTip()
  const servicios = cuenta.servicios
  const estados = useMemo(() => estadosDeCamas(estado, servicios), [estado, servicios])
  const r = resumenCamas(estado, servicios)
  const pendientes = ordenesPendientes(estado, servicios).length
  const cerrar = () => setDialogo(null)
  const seleccionar = (camaId) => { setSeleccion(camaId); setDialogo({ tipo: 'cama', camaId }) }
  const props = { onCerrar: cerrar }

  return (
    <div className="panel"><Stack gap={4}>
      <Grid min={190} gap={3}>
        <StatCard label="Camas" value={r.total} note={`${r.operativas} operativas`} />
        <StatCard label="Ocupadas" value={r.ocupadas} />
        <StatCard label="Disponibles" value={r.disponibles} severity={r.disponibles <= 0 ? 'suspect' : 'normal'} />
        <StatCard label="Con O2" value={r.conO2} />
        <StatCard label="Fuera de servicio" value={r.fuera} severity={r.fuera ? 'suspect' : 'normal'} />
        <StatCard label="Por recibir" value={pendientes} note="Enviados por Admisión" />
      </Grid>
      <Card
        title={servicios.map(nombreServicio).join(' e ')}
        subtitle="Pasa el cursor sobre una cama para ver su resumen y selecciónala para ver sus acciones."
        actions={<SegmentedControl label="Vista" value={vista} options={VISTAS} onChange={setVista} />}
      >
        <Stack gap={3}>
          {vista === 'tarjetas'
            ? <Tarjetas estados={estados} onSeleccionar={seleccionar} />
            : <VistaMapa plano={PLANO_MEDICINA_B} estados={estados} servicios={servicios} vista={vista} seleccion={seleccion} onSeleccionar={seleccionar} tip={tip} texto={(info) => textoHover(estado, info)} />}
          <Leyenda />
        </Stack>
      </Card>
      <PorAtender abrir={setDialogo} />
      <FloatingTip tip={tip.tip} />
      {dialogo?.tipo === 'cama' && <DialogoCama camaId={dialogo.camaId} onCerrar={cerrar} abrir={setDialogo} />}
      {dialogo?.tipo === 'ingreso' && <DialogoIngreso ordenId={dialogo.ordenId} camaId={dialogo.camaId} {...props} />}
      {dialogo?.tipo === 'traslado' && <DialogoTraslado hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'confirmarTraslado' && <DialogoConfirmarTraslado trasladoId={dialogo.trasladoId} {...props} />}
      {dialogo?.tipo === 'soporte' && <DialogoSoporte hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'egreso' && <DialogoEgreso hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'falla' && <DialogoFalla camaId={dialogo.camaId} {...props} />}
      {dialogo?.tipo === 'bloqueo' && <DialogoBloqueo camaId={dialogo.camaId} {...props} />}
    </Stack></div>
  )
}
