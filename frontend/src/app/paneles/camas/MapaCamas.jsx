import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, DataTable, EmptyState, FloatingTip, Grid, Icon, SegmentedControl, Stack, StatCard, useFloatingTip } from '@hrl/core-ui'
import { ESTADOS_CAMA_MAPA, ESTADOS_ORDEN_CAMA, ORIGENES, estadosDeCamas, etiqueta, hospitalizacionPorId, pacientePorId, resumenCamas } from '../../dominio/consultas.js'
import { edad, estancia, verFechaHora } from '../../dominio/tiempo.js'
import { ordenesPendientes } from '../../datos/admision.js'
import { nombreServicio, useApp } from '../comun.jsx'
import { VistaMapa } from './VistaMapa.jsx'
import { DialogoBloqueo, DialogoCensoInicial, DialogoConfirmarTraslado, DialogoEgreso, DialogoFalla, DialogoIngreso, DialogoSoporte, DialogoTraslado, FichaCama } from './Dialogos.jsx'

const VISTAS = [
  { value: 'iso', label: '3D' },
  { value: 'planta', label: 'Planta 2D', ariaLabel: 'Planta en 2D' },
]

const porCodigo = (a, b) => a.localeCompare(b, 'es', { numeric: true })
const dias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`

function textoHover(estado, info) {
  const meta = ESTADOS_CAMA_MAPA[info.estado]
  const titulo = `Cama ${info.cama.codigo} · ${meta.label}`
  if (info.ocupante) {
    const h = info.ocupante.hospitalizacion
    const p = pacientePorId(estado, h.pacienteId)
    return { titulo, cuerpo: `${p.nombres} · HC ${p.hc} · ${edad(p.nacimiento, estado.ahora)} años · ${dias(estancia(h.fechaIngreso, estado.ahora))}${info.ocupante.soporte === 'o2' ? ' · O2' : info.ocupante.soporte === 'vm' ? ' · VM' : ''}` }
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

/* Las camas como tarjetas, agrupadas por servicio y por habitación. Están
   enlazadas con el plano: elegir una tarjeta lleva la cámara a esa cama, y
   elegir una cama en el plano marca (y muestra) su tarjeta. */
function ListaCamas({ estados, seleccion, onSeleccionar }) {
  const { estado } = useApp()
  const lista = useRef(null)
  const grupos = useMemo(() => {
    const porServicio = new Map()
    for (const info of estados) {
      const s = info.cama.servicioId
      if (!porServicio.has(s)) porServicio.set(s, new Map())
      const salas = porServicio.get(s)
      if (!salas.has(info.cama.habitacion)) salas.set(info.cama.habitacion, [])
      salas.get(info.cama.habitacion).push(info)
    }
    return [...porServicio.entries()]
      .sort(([a], [b]) => porCodigo(nombreServicio(a), nombreServicio(b)))
      .map(([servicio, salas]) => ({
        servicio,
        salas: [...salas.entries()].sort(([a], [b]) => porCodigo(a, b)).map(([sala, camas]) => ({ sala, camas: camas.sort((a, b) => porCodigo(a.cama.codigo, b.cama.codigo)) })),
      }))
  }, [estados])

  /* La tarjeta elegida desde el plano se trae a la vista, dentro de la lista
     y sin mover la página. */
  useEffect(() => {
    const contenedor = lista.current
    const tarjeta = seleccion && contenedor?.querySelector(`[data-cama="${seleccion}"]`)
    if (!tarjeta) return
    const c = contenedor.getBoundingClientRect()
    const t = tarjeta.getBoundingClientRect()
    if (t.top < c.top || t.bottom > c.bottom) contenedor.scrollTo({ top: contenedor.scrollTop + t.top - c.top - 48, behavior: 'smooth' })
  }, [seleccion])

  return (
    <div className="mapa-lista" ref={lista} aria-label="Camas por servicio y habitación">
      {grupos.map(({ servicio, salas }) => (
        <section key={servicio} className="mapa-lista__servicio">
          <h3 className="mapa-lista__titulo">{nombreServicio(servicio)}</h3>
          {salas.map(({ sala, camas }) => (
            <div key={sala} className="mapa-lista__sala">
              <h4 className="mapa-lista__sala-titulo">Habitación {sala}</h4>
              <div className="mapa-tarjetas">
                {camas.map((info) => {
                  const meta = ESTADOS_CAMA_MAPA[info.estado]
                  const h = info.ocupante?.hospitalizacion
                  const p = h && pacientePorId(estado, h.pacienteId)
                  const elegida = seleccion === info.cama.id
                  return (
                    /* hrl-nativo: tarjeta que se pulsa; el kit no tiene una. */
                    <button
                      type="button"
                      key={info.cama.id}
                      data-cama={info.cama.id}
                      aria-pressed={elegida}
                      className={`mapa-tarjeta${elegida ? ' es-seleccion' : ''}`}
                      onClick={() => onSeleccionar(elegida ? null : info.cama.id)}
                    >
                      <span className="mapa-tarjeta__fila"><strong>{info.cama.codigo}</strong><Badge label={meta.label} tone={meta.tono} /></span>
                      <span className="mapa-tarjeta__paciente">{p ? p.nombres : '—'}</span>
                      <span className="texto-apoyo">{p ? `HC ${p.hc} · ${dias(estancia(h.fechaIngreso, estado.ahora))}` : info.falla ? 'Falla reportada' : info.cama.bloqueo ? info.cama.bloqueo.motivo : ' '}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

/* Lo que espera a esta cuenta: al departamento, los pacientes que envió
   Admisión; al piso, los traslados que llegan y las camas que devuelve
   Mantenimiento. */
function PorAtender({ abrir }) {
  const { estado, cuenta, hacer } = useApp()
  if (!['enfermeria', 'departamento'].includes(cuenta.rol)) return null
  const departamento = cuenta.rol === 'departamento'
  const ordenes = departamento ? ordenesPendientes(estado, cuenta.servicios) : []
  const traslados = departamento ? [] : estado.traslados.filter((t) => t.estado === 'pendiente' && cuenta.servicios.includes(t.servicioDestino))
  const camas = departamento ? [] : estado.ordenesCama.filter((o) => o.estado === 'por_recibir' && cuenta.servicios.includes(estado.camas.find((c) => c.id === o.camaId).servicioId))
  const filas = [
    ...ordenes.map((o) => {
      const p = pacientePorId(estado, o.pacienteId)
      return { clave: o.id, que: 'Ingreso', icono: 'sh-plus', quien: p.nombres, detalle: `HC ${p.hc} · ${etiqueta(ORIGENES, o.origen)}${o.diagnosticoIngreso ? ` · ${o.diagnosticoIngreso}` : ''}`, desde: o.fechaHora, boton: 'Designar cama', accion: () => abrir({ tipo: 'ingreso', ordenId: o.id }) }
    }),
    ...traslados.map((t) => {
      const p = pacientePorId(estado, hospitalizacionPorId(estado, t.hospitalizacionId).pacienteId)
      return { clave: t.id, que: 'Traslado', icono: 'sh-swap', quien: p.nombres, detalle: `Viene de ${nombreServicio(t.servicioOrigen)}`, desde: t.solicitadoEn, boton: 'Confirmar llegada', accion: () => abrir({ tipo: 'confirmarTraslado', trasladoId: t.id }) }
    }),
    ...camas.map((o) => ({ clave: o.id, que: 'Cama', icono: 'sh-wrench', quien: estado.camas.find((c) => c.id === o.camaId).codigo, detalle: `Devuelta por Mantenimiento: ${o.diagnostico}`, desde: o.entregadaEn, boton: 'Recibir cama', accion: () => hacer('mant/recibir', { ordenId: o.id }, 'Cama recibida. Vuelve a estar libre.') })),
  ]
  if (filas.length === 0) return null
  return (
    <Card title="Por atender" subtitle={departamento ? 'Pacientes que Admisión envió al departamento. Elige la habitación y la cama, o pulsa una cama libre en el plano.' : 'Traslados y camas que esperan una confirmación de este piso.'}>
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

/* El tooltip del plano vive en su propio componente: así mover el puntero solo
   vuelve a dibujar el tooltip y no el plano entero. El plano recibe funciones
   estables que llegan aquí por una ref. */
function TipAislado({ control }) {
  const tip = useFloatingTip()
  useImperativeHandle(control, () => ({ follow: tip.follow, hide: tip.hide }), [tip.follow, tip.hide])
  return <FloatingTip tip={tip.tip} />
}

function useTipAislado() {
  const control = useRef(null)
  const tip = useMemo(() => ({
    follow: (...a) => control.current?.follow(...a),
    hide: () => control.current?.hide(),
  }), [])
  return [tip, control]
}

/* Plano a la izquierda (3D o 2D) y tarjetas a la derecha, enlazados por la
   misma selección; debajo, la ficha de la cama elegida. */
export function MapaCamas() {
  const { estado, cuenta } = useApp()
  const [vista, setVista] = useState('iso')
  const [seleccion, setSeleccion] = useState(null)
  const [dialogo, setDialogo] = useState(null)
  const [tip, controlTip] = useTipAislado()
  const servicios = cuenta.servicios
  const estados = useMemo(() => estadosDeCamas(estado, servicios), [estado, servicios])
  const r = resumenCamas(estado, servicios)
  const pendientes = ordenesPendientes(estado, servicios).length
  const cerrar = () => setDialogo(null)
  const seleccionar = useCallback((camaId) => setSeleccion(camaId), [])
  const texto = useCallback((info) => textoHover(estado, info), [estado])
  const props = { onCerrar: cerrar }

  return (
    <div className="panel"><Stack gap={4}>
      <Grid min={190} gap={3}>
        <StatCard label="Camas" value={r.total} note={`${r.operativas} operativas`} />
        <StatCard label="Ocupadas" value={r.ocupadas} />
        <StatCard label="Disponibles" value={r.disponibles} severity={r.disponibles <= 0 ? 'suspect' : 'normal'} />
        <StatCard label="Con O2" value={r.conO2} />
        {r.conVM > 0 && <StatCard label="Con VM" value={r.conVM} />}
        <StatCard label="Fuera de servicio" value={r.fuera} severity={r.fuera ? 'suspect' : 'normal'} />
        <StatCard label="Por designar" value={pendientes} note="Enviados por Admisión al departamento" />
      </Grid>
      <PorAtender abrir={setDialogo} />
      <Card
        title={servicios.map(nombreServicio).join(' y ')}
        subtitle="Elige una cama en el plano o en la lista: el plano se acerca a ella y abajo aparece su ficha."
        actions={<SegmentedControl label="Vista del plano" value={vista} options={VISTAS} onChange={setVista} />}
      >
        <div className="mapa-principal">
          <Stack gap={3}>
            <VistaMapa plano={estado.plano} estados={estados} servicios={servicios} vista={vista} seleccion={seleccion} onSeleccionar={seleccionar} tip={tip} texto={texto} />
            <Leyenda />
          </Stack>
          <ListaCamas estados={estados} seleccion={seleccion} onSeleccionar={seleccionar} />
        </div>
      </Card>
      {seleccion
        ? <FichaCama camaId={seleccion} abrir={setDialogo} onCerrar={() => setSeleccion(null)} />
        : <Card title="Ficha de la cama"><EmptyState icon="sh-home" title="Ninguna cama elegida" body="Elige una cama en el plano o en la lista para ver al paciente, el estado de la cama y lo que puedes hacer." /></Card>}
      <TipAislado control={controlTip} />
      {dialogo?.tipo === 'ingreso' && <DialogoIngreso ordenId={dialogo.ordenId} camaId={dialogo.camaId} {...props} />}
      {dialogo?.tipo === 'censoInicial' && <DialogoCensoInicial camaId={dialogo.camaId} {...props} />}
      {dialogo?.tipo === 'traslado' && <DialogoTraslado hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'confirmarTraslado' && <DialogoConfirmarTraslado trasladoId={dialogo.trasladoId} {...props} />}
      {dialogo?.tipo === 'soporte' && <DialogoSoporte hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'egreso' && <DialogoEgreso hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'falla' && <DialogoFalla camaId={dialogo.camaId} {...props} />}
      {dialogo?.tipo === 'bloqueo' && <DialogoBloqueo camaId={dialogo.camaId} {...props} />}
    </Stack></div>
  )
}
