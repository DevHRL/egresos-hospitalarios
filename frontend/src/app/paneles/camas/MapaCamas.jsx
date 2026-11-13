import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, DataTable, EmptyState, FloatingTip, Grid, Icon, PageHeader, SegmentedControl, Stack, StatCard, useFloatingTip } from '@hrl/core-ui'
import { ESTADOS_CAMA_MAPA, ESTADOS_ORDEN_CAMA, MARCA_SOPORTE, ORIGENES, estadosDeCamas, etiqueta, hospitalizacionPorId, pacientePorId, resumenCamas } from '../../dominio/consultas.js'
import { CATEGORIAS_CAMA, categoriaDeZona } from '../../dominio/plano.js'
import { edad, estancia, verFechaHora } from '../../dominio/tiempo.js'
import { ordenesPendientes } from '../../datos/admision.js'
import { MODULOS } from '../../datos/cuentas.js'
import { nombreServicio, useApp } from '../comun.jsx'
import { VistaMapa } from './VistaMapa.jsx'
import { DialogoCensoInicial, DialogoConfirmarTraslado, DialogoEgreso, DialogoFalla, DialogoIngreso, DialogoSoporte, DialogoTraslado, FichaCama } from './Dialogos.jsx'

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
    return { titulo, cuerpo: `${p.nombres} · HC ${p.hc} · ${edad(p.nacimiento, estado.ahora)} años · ${dias(estancia(h.fechaIngreso, estado.ahora))}${info.soporte ? ` · ${MARCA_SOPORTE[info.soporte]}` : ''}` }
  }
  if (info.orden) return { titulo, cuerpo: `${ESTADOS_ORDEN_CAMA[info.orden.estado]}: ${info.orden.falla}` }
  if (info.cama.bloqueo) return { titulo, cuerpo: info.cama.bloqueo.motivo }
  return { titulo, cuerpo: `${info.cama.habitacion} · ${nombreServicio(info.cama.servicioId)}` }
}

/* Los cuatro estados de la cama. El O2 o la VM del paciente no tienen entrada
   ni color propios: van como marca recuadrada junto al código de la cama. Al
   final, cómo se ven las camas de las otras áreas del piso. */
function Leyenda() {
  return (
    <ul className="mapa-leyenda">
      {Object.entries(ESTADOS_CAMA_MAPA).map(([k, v]) => (
        <li key={k}><span className={`mapa-muestra mapa-estado--${k}`} /><Icon name={v.icono} size={14} />{v.label}</li>
      ))}
      <li className="mapa-leyenda__otra"><span className="mapa-muestra mapa-muestra--inactiva" />Otra área</li>
    </ul>
  )
}

/* Nombres cortos para el selector de área; el resto usa el del catálogo. */
const NOMBRE_CORTO = { 'medicina-intermedios': 'Intermedios', 'cuidados-criticos': 'UCI' }
const opcionesArea = (ids) => ids.map((id) => ({ value: id, label: NOMBRE_CORTO[id] ?? nombreServicio(id), ariaLabel: nombreServicio(id) }))

/* Las camas del área como tarjetas, en dos grupos: hospitalización y
   aislados (ya no por habitación; la habitación va en cada tarjeta). Están
   enlazadas con el plano: elegir una tarjeta lleva la cámara a esa cama, y
   elegir una cama en el plano marca (y muestra) su tarjeta. */
function ListaCamas({ estados, zonaDe, seleccion, onSeleccionar }) {
  const { estado } = useApp()
  const lista = useRef(null)
  const grupos = useMemo(() => CATEGORIAS_CAMA
    .map((c) => ({
      ...c,
      camas: estados
        .filter((info) => categoriaDeZona(zonaDe(info.cama.id)) === c.id)
        .sort((a, b) => porCodigo(a.cama.codigo, b.cama.codigo)),
    }))
    .filter((g) => g.camas.length > 0), [estados, zonaDe])

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
    <div className="mapa-lista" ref={lista} aria-label="Camas del área: hospitalización y aislados">
      {grupos.map(({ id, label, camas }) => (
        <section key={id} className="mapa-lista__servicio" aria-label={label}>
          <h3 className="mapa-lista__titulo">{label} <span className="mapa-lista__cuenta">{camas.length}</span></h3>
          <div className="mapa-tarjetas">
            {camas.map((info) => {
              const meta = ESTADOS_CAMA_MAPA[info.estado]
              const h = info.ocupante?.hospitalizacion
              const p = h && pacientePorId(estado, h.pacienteId)
              const elegida = seleccion === info.cama.id
              const detalle = p ? `HC ${p.hc} · ${dias(estancia(h.fechaIngreso, estado.ahora))}` : info.orden ? info.orden.falla : info.cama.bloqueo ? info.cama.bloqueo.motivo : null
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
                  <span className="mapa-tarjeta__fila">
                    <span><strong>{info.cama.codigo}</strong>{info.soporte && <> <span className="marca-soporte">{MARCA_SOPORTE[info.soporte]}</span></>}</span>
                    <Badge label={meta.label} tone={meta.tono} />
                  </span>
                  <span className="mapa-tarjeta__paciente">{p ? p.nombres : '—'}</span>
                  <span className="texto-apoyo">Hab. {info.cama.habitacion}{detalle ? ` · ${detalle}` : ''}</span>
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/* Lo que espera a esta cuenta: a quien designa camas, los pacientes que envió
   Admisión; al piso, los traslados que llegan y las camas que devuelve
   Mantenimiento. En UCI y Quemados la misma cuenta hace las dos cosas. */
function PorAtender({ abrir }) {
  const { estado, cuenta, hacer } = useApp()
  if (!['enfermeria', 'departamento'].includes(cuenta.rol)) return null
  const designa = cuenta.designa?.length > 0
  const piso = cuenta.rol === 'enfermeria'
  const ordenes = designa ? ordenesPendientes(estado, cuenta.servicios) : []
  const traslados = piso ? estado.traslados.filter((t) => t.estado === 'pendiente' && cuenta.servicios.includes(t.servicioDestino)) : []
  const camas = piso ? estado.ordenesCama.filter((o) => o.estado === 'por_recibir' && cuenta.servicios.includes(estado.camas.find((c) => c.id === o.camaId).servicioId)) : []
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
    <Card title="Por atender" subtitle={designa ? 'Pacientes que Admisión envió y traslados o camas que esperan confirmación. Para designar, elige la habitación y la cama, o pulsa una cama libre en el plano.' : 'Traslados y camas que esperan una confirmación de este piso.'}>
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

/* Título y tarjetas a la izquierda, plano (3D o 2D) a la derecha, enlazados
   por la misma selección; debajo, la ficha de la cama elegida.

   El selector de área elige cuál de los servicios de la cuenta se trabaja: el
   piso se ve completo y con la misma distribución, pero solo las camas de esa
   área van activas, con su color de leyenda; las tarjetas y las cifras son
   también de esa área. Lo que espera a la cuenta («Por atender») no se filtra. */
export function MapaCamas() {
  const { estado, cuenta } = useApp()
  const [vista, setVista] = useState('iso')
  const [areaElegida, setArea] = useState(null)
  const [seleccion, setSeleccion] = useState(null)
  const [dialogo, setDialogo] = useState(null)
  const [tip, controlTip] = useTipAislado()
  const servicios = cuenta.servicios
  /* Si la cuenta cambia y el área ya no es suya, se toma su primera área. */
  const area = servicios.includes(areaElegida) ? areaElegida : servicios[0]
  const delArea = useMemo(() => [area], [area])
  /* El plano recibe las camas de todas las áreas de la cuenta: así la que se
     apaga se funde con sus colores. La lista y las cifras, solo las del área. */
  const estadosCuenta = useMemo(() => estadosDeCamas(estado, servicios), [estado, servicios])
  const estados = useMemo(() => estadosCuenta.filter((x) => x.cama.servicioId === area), [estadosCuenta, area])
  const r = resumenCamas(estado, delArea)
  const pendientes = ordenesPendientes(estado, servicios).length
  const cambiarArea = (a) => {
    setArea(a)
    setSeleccion(null)
  }
  const cerrar = () => setDialogo(null)
  const seleccionar = useCallback((camaId) => setSeleccion(camaId), [])
  const texto = useCallback((info) => textoHover(estado, info), [estado])
  /* Habitación de cada cama, para agruparlas en hospitalización y aislados. */
  const zonaDe = useMemo(() => {
    const zonas = new Map(estado.plano.zonas.map((z) => [z.id, z]))
    const porCama = new Map(estado.plano.camas.map((c) => [c.id, zonas.get(c.zonaId)]))
    return (camaId) => porCama.get(camaId) ?? null
  }, [estado.plano])
  const piso = estado.plano.pisos?.[0]?.nombre ?? 'Piso'
  const props = { onCerrar: cerrar }

  return (
    <div className="panel panel--plano"><Stack gap={5}>
      {/* La pantalla en dos: a la izquierda el título, el área y sus camas;
          a la derecha el plano, sin tarjeta alrededor. La cabecera de la
          página no se monta aquí (App.jsx): el título va en esta columna. */}
      <div className="plano-modulo">
        <div className="plano-modulo__lado">
          <PageHeader title={MODULOS.mapa.label} description="Elige una cama en la lista o en el plano: el plano se acerca a ella y abajo aparece su ficha." />
          <div className="plano-modulo__area">
            <h2 className="plano-modulo__piso">{piso} · {nombreServicio(area)}</h2>
            {servicios.length > 1 && <SegmentedControl label="Área del piso" value={area} options={opcionesArea(servicios)} onChange={cambiarArea} />}
          </div>
          <ListaCamas estados={estados} zonaDe={zonaDe} seleccion={seleccion} onSeleccionar={seleccionar} />
        </div>
        <div className="plano-modulo__plano">
          <VistaMapa plano={estado.plano} estados={estadosCuenta} area={area} vista={vista} seleccion={seleccion} onSeleccionar={seleccionar} tip={tip} texto={texto} />
          <div className="plano-modulo__vista">
            <SegmentedControl label="Vista del plano" value={vista} options={VISTAS} onChange={setVista} />
          </div>
          <div className="plano-modulo__leyenda"><Leyenda /></div>
        </div>
      </div>
      {seleccion
        ? <FichaCama camaId={seleccion} abrir={setDialogo} onCerrar={() => setSeleccion(null)} />
        : <Card title="Ficha de la cama"><EmptyState icon="sh-home" title="Ninguna cama elegida" body="Elige una cama en el plano o en la lista para ver al paciente, el estado de la cama y lo que puedes hacer." /></Card>}
      {/* Lo demás va debajo: primero lo que espera a esta cuenta, luego las cifras. */}
      <PorAtender abrir={setDialogo} />
      <Grid min={190} gap={3}>
        <StatCard label="Camas" value={r.total} note={`${r.operativas} operativas`} />
        <StatCard label="Ocupadas" value={r.ocupadas} />
        <StatCard label="Disponibles" value={r.disponibles} severity={r.disponibles <= 0 ? 'suspect' : 'normal'} />
        <StatCard label="Con O2" value={r.conO2} />
        {r.conVM > 0 && <StatCard label="Con VM" value={r.conVM} />}
        <StatCard label="Falla reportada" value={r.conFalla} severity={r.conFalla ? 'suspect' : 'normal'} />
        <StatCard label="En mantenimiento" value={r.fuera} severity={r.fuera ? 'suspect' : 'normal'} />
        <StatCard label="Por designar" value={pendientes} note="Enviados por Admisión" />
      </Grid>
      <TipAislado control={controlTip} />
      {dialogo?.tipo === 'ingreso' && <DialogoIngreso ordenId={dialogo.ordenId} camaId={dialogo.camaId} {...props} />}
      {dialogo?.tipo === 'censoInicial' && <DialogoCensoInicial camaId={dialogo.camaId} {...props} />}
      {dialogo?.tipo === 'traslado' && <DialogoTraslado hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'confirmarTraslado' && <DialogoConfirmarTraslado trasladoId={dialogo.trasladoId} {...props} />}
      {dialogo?.tipo === 'soporte' && <DialogoSoporte hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'egreso' && <DialogoEgreso hospitalizacionId={dialogo.hospitalizacionId} {...props} />}
      {dialogo?.tipo === 'falla' && <DialogoFalla camaId={dialogo.camaId} {...props} />}
    </Stack></div>
  )
}
