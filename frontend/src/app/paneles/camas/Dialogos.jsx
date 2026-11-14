import { useState } from 'react'
import { Alert, Badge, Button, Card, Input, SegmentedControl, Stack } from '@hrl/core-ui'
import { CONDICIONES_EGRESO, ESTADOS_CAMA_MAPA, ESTADOS_ORDEN_CAMA, MARCA_SOPORTE, ORIGENES, SOPORTES, TRASLADO_NO_INCORPORADO, estadosDeCamas, etiqueta, etiquetaEgreso, hospitalizacionPorId, movimientosDe, pacientePorId, posicionActual, serviciosConCamas, trasladoPendienteDe } from '../../dominio/consultas.js'
import { diaDe, edad, estancia, verFechaHora } from '../../dominio/tiempo.js'
import { CIE10, MEDICOS } from '../../datos/clinicos.js'
import { buscarEnPadron, ordenesPendientes } from '../../datos/admision.js'
import { DEPARTAMENTOS, servicioPorId } from '../../datos/catalogo.js'
import { CampoFechaHora, DialogoAccion, ListaDatos, nombreDepartamento, nombreServicio, opcionesServicio, useApp, useEnvio } from '../comun.jsx'

const departamentoDeServicio = (id) => servicioPorId(id)?.departamento.id

const camasLibres = (estado, servicioId) =>
  estadosDeCamas(estado, [servicioId])
    .filter((x) => x.libre)
    .map((x) => ({ value: x.cama.id, label: `${x.cama.codigo}, ${x.cama.habitacion}${x.falla ? ' (falla reportada)' : ''}` }))

/* Camas libres de varias áreas, agrupadas por área y ordenadas por habitación. */
const gruposCamasLibres = (estado, servicios) =>
  servicios.map((s) => ({ label: nombreServicio(s), options: camasLibres(estado, s).sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true })) }))
    .filter((g) => g.options.length)

const VACIO = { value: '', label: 'Elige…' }

/* Pacientes hospitalizados ahora en esas áreas y sin traslado pendiente: los
   únicos a quienes el área puede dar de alta o trasladar. Se eligen de la
   lista, no se escriben. */
function pacientesPresentes(estado, servicios) {
  return estado.hospitalizaciones
    .filter((h) => !h.anulada && !h.egreso && !trasladoPendienteDe(estado, h.id))
    .map((h) => ({ h, pos: posicionActual(estado, h.id) }))
    .filter((x) => x.pos && servicios.includes(x.pos.servicioId))
    .map(({ h, pos }) => {
      const p = pacientePorId(estado, h.pacienteId)
      const cama = estado.camas.find((c) => c.id === pos.camaId)?.codigo ?? ''
      return { value: h.id, label: `${cama}, ${p.nombres}, HC ${p.hc}`, cama }
    })
    .sort((a, b) => a.cama.localeCompare(b.cama, 'es', { numeric: true }))
}

function CampoPaciente({ value, onChange }) {
  const { estado, cuenta } = useApp()
  return <Input label="Paciente" required kind="select" info="Solo los pacientes hospitalizados ahora en el área." value={value} onChange={(e) => onChange(e.target.value)} options={[VACIO, ...pacientesPresentes(estado, cuenta.servicios)]} />
}

function datosPaciente(estado, pacienteId) {
  const p = pacientePorId(estado, pacienteId)
  return [['Paciente', p.nombres], ['N° de HC', p.hc], ['DNI', p.dni], ['Edad y sexo', `${edad(p.nacimiento, estado.ahora)} años, ${p.sexo}`]]
}

/* El área designa habitación y cama al paciente que le envió Admisión y desde
   ese momento lo controla. Se abre desde la orden (eligiendo cama) o desde una
   cama libre del plano (eligiendo paciente). */
export function DialogoIngreso({ ordenId: ordenInicial, camaId: camaInicial, onCerrar }) {
  const { estado, cuenta } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [ordenId, setOrdenId] = useState(ordenInicial ?? '')
  const [camaId, setCamaId] = useState(camaInicial ?? '')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const cama = estado.camas.find((c) => c.id === camaId)
  const pendientes = ordenesPendientes(estado, camaInicial ? [cama.servicioId] : cuenta.servicios)
  const orden = estado.ordenes.find((o) => o.id === ordenId)
  const grupos = gruposCamasLibres(estado, orden ? [orden.servicioId] : cuenta.servicios)
  return (
    <DialogoAccion
      titulo="Designar habitación y cama"
      subtitulo="Admisión envió al paciente a esta área. Desde que confirmas, el área lo controla."
      textoConfirmar="Designar e ingresar"
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('ingreso/confirmar', { ordenId, camaId, fechaHora }, `Ingreso registrado${cama ? ` en la cama ${cama.codigo}` : ''}.`)}
    >
      {!ordenInicial && (
        <Input label="Paciente enviado por Admisión" required kind="select" value={ordenId} onChange={(e) => setOrdenId(e.target.value)} options={[VACIO, ...pendientes.map((o) => ({ value: o.id, label: `${pacientePorId(estado, o.pacienteId).nombres}, ${etiqueta(ORIGENES, o.origen)}` }))]} />
      )}
      {orden && (
        <ListaDatos datos={[...datosPaciente(estado, orden.pacienteId), ['Origen', etiqueta(ORIGENES, orden.origen)], ['Área', nombreServicio(orden.servicioId)], ['Orden de Admisión', verFechaHora(orden.fechaHora)], ['Médico que ordena', orden.medicoOrdena || null], ['Diagnóstico de ingreso', orden.diagnosticoIngreso || null]]} />
      )}
      {!camaInicial && <Input label="Habitación y cama" required kind="select" value={camaId} onChange={(e) => setCamaId(e.target.value)} options={[VACIO]} groups={grupos} />}
      {cama && <ListaDatos datos={[['Cama', `${cama.codigo}, habitación ${cama.habitacion}`]]} />}
      <CampoFechaHora etiqueta="Fecha de ingreso" value={fechaHora} onChange={setFechaHora} />
    </DialogoAccion>
  )
}

export function DialogoCensoInicial({ camaId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const cama = estado.camas.find((c) => c.id === camaId)
  const [busqueda, setBusqueda] = useState('')
  const [elegido, setElegido] = useState(null)
  const [nuevo, setNuevo] = useState({ hc: '', dni: '', nombres: '', sexo: '', nacimiento: '' })
  const [conFecha, setConFecha] = useState('si')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const campo = (k) => (e) => setNuevo({ ...nuevo, [k]: e.target.value })
  const hallados = buscarEnPadron(estado, busqueda).slice(0, 5)
  const datos = { ...(elegido ? { pacienteId: elegido.id } : { paciente: nuevo }), camaId, fechaHora: conFecha === 'si' ? fechaHora : '' }
  return (
    <DialogoAccion titulo={`Censo inicial en ${cama.codigo}`} subtitulo="Paciente que ya estaba hospitalizado el día de arranque del servicio. No necesita orden." textoConfirmar="Registrar paciente" maxWidth={640} onCerrar={onCerrar} error={error} onConfirmar={() => enviar('ingreso/previo', datos, 'Paciente registrado en el censo inicial.')}>
      {elegido ? (
        <ListaDatos datos={[['Paciente', elegido.nombres], ['N° de HC', elegido.hc]]} />
      ) : (
        <>
          <Input label="Buscar en el padrón" searchIcon placeholder="N° de HC, DNI o apellidos" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          {hallados.map((p) => <Stack key={p.id} direction="row" justify="between" align="center" gap={2}><span>{p.nombres}, HC {p.hc}</span><Button size="sm" tone="ghost" onClick={() => setElegido(p)}>Elegir</Button></Stack>)}
          <div className="campos-dos"><Input label="N° de HC" value={nuevo.hc} onChange={campo('hc')} /><Input label="DNI" value={nuevo.dni} onChange={campo('dni')} /></div>
          <Input label="Apellidos y nombres" value={nuevo.nombres} onChange={campo('nombres')} />
          <div className="campos-dos"><Input label="Sexo" kind="select" value={nuevo.sexo} onChange={campo('sexo')} options={[VACIO, { value: 'F', label: 'Femenino' }, { value: 'M', label: 'Masculino' }]} /><Input label="Fecha de nacimiento" kind="date" value={nuevo.nacimiento} onChange={campo('nacimiento')} /></div>
        </>
      )}
      <SegmentedControl label="¿Se ubicó la fecha real de ingreso en la HC?" value={conFecha} options={[{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No se ubicó' }]} onChange={setConFecha} />
      {conFecha === 'si' ? <CampoFechaHora etiqueta="Fecha de ingreso" value={fechaHora} onChange={setFechaHora} /> : <p className="texto-apoyo">Queda con fecha estimada y no cuenta en el promedio de permanencia.</p>}
    </DialogoAccion>
  )
}

/* Servicios a los que se puede trasladar fuera de los pisos del sistema: todo
   el catálogo menos los servicios con camas en el sistema. */
const gruposOtrosServicios = (incorporados) =>
  DEPARTAMENTOS.map((d) => ({ label: d.nombre, options: d.servicios.filter((s) => !incorporados.includes(s.id)).map((s) => ({ value: s.id, label: s.nombre })) }))
    .filter((g) => g.options.length)

const OTRO = '__otro'

/* Traslado: el paciente sigue hospitalizado. Se abre desde la ficha de la cama
   (con el paciente puesto) o desde el censo (eligiéndolo). El destino no viene
   elegido: quien registra tiene que decir a dónde va. */
export function DialogoTraslado({ hospitalizacionId: inicial, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [hospitalizacionId, setHosp] = useState(inicial ?? '')
  const actual = hospitalizacionId ? posicionActual(estado, hospitalizacionId) : null
  const h = hospitalizacionId ? hospitalizacionPorId(estado, hospitalizacionId) : null
  const incorporados = serviciosConCamas(estado)
  const [servicioDestino, setDestino] = useState('')
  const [otro, setOtro] = useState('')
  const [camaId, setCamaId] = useState('')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const mismo = Boolean(actual) && servicioDestino === actual.servicioId
  const fuera = servicioDestino === OTRO
  const otraArea = Boolean(servicioDestino) && !mismo && !fuera
  const confirmar = () => {
    if (fuera) {
      const nombre = otro ? `${nombreServicio(otro)} (${nombreDepartamento(departamentoDeServicio(otro))})` : ''
      return enviar('egreso/registrar', { hospitalizacionId, tipoEgreso: TRASLADO_NO_INCORPORADO, destino: nombre, fechaHora }, 'Traslado registrado. La cama queda libre y la estancia en el sistema se cierra.')
    }
    return enviar('traslado/registrar', { hospitalizacionId, servicioDestino, camaId, fechaHora }, mismo ? 'Cambio de cama registrado.' : `Traslado enviado. ${nombreServicio(servicioDestino)} designará la cama.`)
  }
  const destinos = actual ? [
    VACIO,
    ...opcionesServicio(incorporados.filter((s) => s !== actual.servicioId)),
    { value: actual.servicioId, label: `Otra cama de ${nombreServicio(actual.servicioId)}` },
    { value: OTRO, label: 'Otro departamento (Cirugía, Pediatría…)' },
  ] : [VACIO]
  return (
    <DialogoAccion titulo="Registrar traslado" subtitulo="El paciente sigue hospitalizado: un traslado no es un alta." textoConfirmar={mismo ? 'Cambiar de cama' : fuera ? 'Registrar salida' : 'Enviar traslado'} onCerrar={onCerrar} error={error} onConfirmar={confirmar}>
      {!inicial && <CampoPaciente value={hospitalizacionId} onChange={(v) => { setHosp(v); setDestino(''); setCamaId('') }} />}
      {h && <ListaDatos datos={[...datosPaciente(estado, h.pacienteId), ['Cama actual', estado.camas.find((c) => c.id === actual?.camaId)?.codigo ?? '—'], ['Área actual', nombreServicio(actual?.servicioId)]]} />}
      {h && <Input label="Área de destino" required kind="select" value={servicioDestino} onChange={(e) => setDestino(e.target.value)} options={destinos} />}
      {mismo && (
        <>
          <Input label="Cama nueva" required kind="select" value={camaId} onChange={(e) => setCamaId(e.target.value)} options={[VACIO, ...camasLibres(estado, actual.servicioId)]} />
          <CampoFechaHora value={fechaHora} onChange={setFechaHora} />
        </>
      )}
      {otraArea && (
        <Alert tone="info" title={`${nombreServicio(servicioDestino)} designa la cama`}>El paciente sigue en su cama actual hasta que esa área reciba el traslado y le designe una cama.</Alert>
      )}
      {fuera && (
        <>
          <Input label="Servicio de destino" required kind="select" value={otro} onChange={(e) => setOtro(e.target.value)} options={[VACIO]} groups={gruposOtrosServicios(incorporados)} />
          <CampoFechaHora etiqueta="Fecha de salida" value={fechaHora} onChange={setFechaHora} />
          <Alert tone="info" title="Ese servicio aún no está en el sistema">La estancia en el sistema se cierra al salir y la cama queda libre. No cuenta como egreso hospitalario.</Alert>
        </>
      )}
    </DialogoAccion>
  )
}

export function DialogoConfirmarTraslado({ trasladoId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const t = estado.traslados.find((x) => x.id === trasladoId)
  const h = hospitalizacionPorId(estado, t.hospitalizacionId)
  const [camaId, setCamaId] = useState('')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  return (
    <DialogoAccion titulo="Recibir traslado y designar cama" subtitulo="Igual que en un ingreso: el área que recibe elige la cama." textoConfirmar="Recibir en esta cama" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('traslado/confirmar', { trasladoId, camaId, fechaHora }, 'Traslado confirmado.')}>
      <ListaDatos datos={[...datosPaciente(estado, h.pacienteId), ['Viene de', nombreServicio(t.servicioOrigen)]]} />
      <Input label="Cama" kind="select" value={camaId} onChange={(e) => setCamaId(e.target.value)} options={[VACIO, ...camasLibres(estado, t.servicioDestino)]} />
      <CampoFechaHora etiqueta="Fecha de llegada" value={fechaHora} onChange={setFechaHora} />
    </DialogoAccion>
  )
}

export function DialogoSoporte({ hospitalizacionId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const actual = posicionActual(estado, hospitalizacionId)
  const admiteVM = estado.serviciosConVM?.includes(actual.servicioId)
  const opciones = SOPORTES.filter((s) => s.value !== 'vm' || admiteVM)
  const [soporte, setSoporte] = useState(opciones.find((s) => s.value !== actual.soporte)?.value ?? 'ninguno')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  return (
    <DialogoAccion titulo="Oxígeno o ventilación mecánica" subtitulo="Asigna o retira el soporte del paciente. Alimenta el reporte RENOXI." onCerrar={onCerrar} error={error} onConfirmar={() => enviar('soporte/cambiar', { hospitalizacionId, soporte, fechaHora }, 'Soporte actualizado.')}>
      <Input label="Soporte" kind="select" value={soporte} onChange={(e) => setSoporte(e.target.value)} options={opciones} />
      <CampoFechaHora value={fechaHora} onChange={setFechaHora} />
    </DialogoAccion>
  )
}

/* Corrige un alta que en realidad fue traslado. No está en la ficha ni en el
   censo: solo en Movimientos del día, junto a Anular, para que sea un arreglo y
   no un camino habitual. */
export function DialogoAltaATraslado({ hospitalizacionId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const h = hospitalizacionPorId(estado, hospitalizacionId)
  const incorporados = serviciosConCamas(estado)
  const [servicioDestino, setDestino] = useState('')
  const [otro, setOtro] = useState('')
  const [motivo, setMotivo] = useState('')
  const fuera = servicioDestino === OTRO
  const confirmar = () => enviar('egreso/a_traslado', {
    hospitalizacionId,
    servicioDestino: fuera ? otro : servicioDestino,
    destinoNombre: fuera && otro ? `${nombreServicio(otro)} (${nombreDepartamento(departamentoDeServicio(otro))})` : '',
    motivo,
  }, fuera ? 'Alta corregida: salió a un servicio no incorporado.' : `Alta corregida. ${nombreServicio(servicioDestino)} recibirá el traslado.`)
  return (
    <DialogoAccion titulo="Corregir: era traslado" subtitulo="Anula el alta con su motivo y registra el traslado." textoConfirmar="Corregir a traslado" tono="danger" onCerrar={onCerrar} error={error} onConfirmar={confirmar}>
      <Alert tone="warning" title="Solo si el alta se registró por error">El alta deja de contar como egreso. Si el destino es un área del sistema, el paciente vuelve a su cama hasta que esa área lo reciba.</Alert>
      <ListaDatos datos={[...datosPaciente(estado, h.pacienteId), ['Alta registrada', `${etiquetaEgreso(h.egreso.tipo)}, ${verFechaHora(h.egreso.fechaHora)}`]]} />
      <Input label="A dónde fue trasladado" required kind="select" value={servicioDestino} onChange={(e) => setDestino(e.target.value)} options={[VACIO, ...opcionesServicio(incorporados.filter((s) => s !== h.egreso.servicioId)), { value: OTRO, label: 'Otro departamento (Cirugía, Pediatría…)' }]} />
      {fuera && <Input label="Servicio de destino" required kind="select" value={otro} onChange={(e) => setOtro(e.target.value)} options={[VACIO]} groups={gruposOtrosServicios(incorporados)} />}
      <Input label="Motivo de la corrección" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </DialogoAccion>
  )
}

/* Los procesos de salida son dos: alta (con su tipo) y traslado. El
   fallecimiento antes o después de 48 h no se elige: el servidor lo calcula
   con la hora de ingreso. */
const TIPOS_ALTA = [
  { value: 'alta_medica', label: 'Alta médica' },
  { value: 'alta_voluntaria', label: 'Alta voluntaria' },
  { value: 'fuga', label: 'Fuga (retiro sin alta)' },
  { value: 'referido', label: 'Referido a otro establecimiento' },
  { value: 'fallecido', label: 'Fallecido' },
]

/* Alta completa, registrada por el área: tipo, condición, CIE-10 y médico.
   Los datos del paciente salen del ingreso; todo lo demás se elige de una
   lista. Se abre desde la ficha de la cama o desde el censo. */
export function DialogoEgreso({ hospitalizacionId: inicial, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [hospitalizacionId, setHosp] = useState(inicial ?? '')
  const h = hospitalizacionId ? hospitalizacionPorId(estado, hospitalizacionId) : null
  const [tipoEgreso, setTipo] = useState('')
  const [condicion, setCondicion] = useState('')
  const [cie10, setCie] = useState('')
  const [secundario, setSecundario] = useState('')
  const [medicoId, setMedico] = useState('')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const [conAlta, setConAlta] = useState(false)
  const [altaMedica, setAltaMedica] = useState(estado.ahora)
  const fallecido = tipoEgreso === 'fallecido'
  const horas = h ? (Date.parse(fechaHora) - Date.parse(h.fechaIngreso)) / 3.6e6 : 0
  return (
    <DialogoAccion
      titulo="Registrar alta"
      subtitulo="El paciente sale del hospital. Si pasa a otra área o servicio, es un traslado."
      textoConfirmar="Registrar alta"
      maxWidth={640}
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('egreso/registrar', { hospitalizacionId, tipoEgreso, condicion: fallecido ? 'fallecido' : condicion, cie10, secundarios: secundario ? [secundario] : [], medicoId, fechaHora, altaMedica: conAlta ? altaMedica : '' }, 'Alta registrada. Ya cuenta en el censo y en los indicadores.')}
    >
      {!inicial && <CampoPaciente value={hospitalizacionId} onChange={setHosp} />}
      {h && <ListaDatos datos={[...datosPaciente(estado, h.pacienteId), ['Ingreso', verFechaHora(h.fechaIngreso)], ['Días de estancia', estancia(h.fechaIngreso, fechaHora)], ['Diagnóstico de ingreso', h.diagnosticoIngreso || null]]} />}
      <Input label="Tipo de alta" required kind="select" value={tipoEgreso} onChange={(e) => setTipo(e.target.value)} options={[VACIO, ...TIPOS_ALTA]} />
      {fallecido && h && <Alert tone="info" title={horas < 48 ? 'Fallecido antes de 48 h' : 'Fallecido después de 48 h'}>El sistema lo calcula con la hora de ingreso, {verFechaHora(h.fechaIngreso)}.</Alert>}
      {!fallecido && <Input label="Condición de egreso" required kind="select" value={condicion} onChange={(e) => setCondicion(e.target.value)} options={[VACIO, ...CONDICIONES_EGRESO.filter((c) => c.value !== 'fallecido')]} />}
      <Input label="Diagnóstico de egreso (CIE-10)" required kind="select" value={cie10} onChange={(e) => setCie(e.target.value)} options={[VACIO, ...CIE10]} />
      <Input label="Diagnóstico secundario" kind="select" value={secundario} onChange={(e) => setSecundario(e.target.value)} options={[{ value: '', label: 'Ninguno' }, ...CIE10.filter((c) => c.value !== cie10)]} />
      <Input label="Médico que dio el alta" required kind="select" value={medicoId} onChange={(e) => setMedico(e.target.value)} options={[VACIO, ...MEDICOS]} />
      <CampoFechaHora etiqueta="Fecha de salida" value={fechaHora} onChange={setFechaHora} />
      <SegmentedControl label="¿El alta médica fue en otro momento?" value={conAlta ? 'si' : 'no'} options={[{ value: 'no', label: 'No' }, { value: 'si', label: 'Sí' }]} onChange={(v) => setConAlta(v === 'si')} />
      {conAlta && <CampoFechaHora etiqueta="Fecha del alta médica" value={altaMedica} onChange={setAltaMedica} />}
    </DialogoAccion>
  )
}

export function DialogoFalla({ camaId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [falla, setFalla] = useState('')
  const cama = estado.camas.find((c) => c.id === camaId)
  return (
    <DialogoAccion titulo={`Reportar falla en ${cama.codigo}`} subtitulo="Abre una orden para Mantenimiento y aparece en las novedades del censo." textoConfirmar="Reportar falla" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('falla/reportar', { camaId, falla }, 'Falla reportada a Mantenimiento.')}>
      <Input label="Qué falla tiene" required autoFocus value={falla} onChange={(e) => setFalla(e.target.value)} />
    </DialogoAccion>
  )
}

/* Una línea por movimiento de la estancia, del más reciente al primero. */
function textoMovimiento(estado, m) {
  const cama = estado.camas.find((c) => c.id === m.camaId)?.codigo ?? '—'
  if (m.tipo === 'ingreso') return `Ingreso a ${cama} (${nombreServicio(m.servicioId)})`
  if (m.tipo === 'traslado') return m.servicioOrigen && m.servicioOrigen !== m.servicioId ? `Traslado a ${cama} (${nombreServicio(m.servicioId)})` : `Cambio a la cama ${cama}`
  if (m.tipo === 'soporte') return `Soporte: ${etiqueta(SOPORTES, m.soporte)}`
  if (m.tipo === 'egreso') return `Salida: ${etiquetaEgreso(m.tipoEgreso)}`
  return m.tipo
}

/* Ficha de la cama elegida, debajo del plano: su estado, el paciente que la
   ocupa con su estancia, y lo que esta cuenta puede hacer con ella. */
export function FichaCama({ camaId, abrir, onCerrar }) {
  const { estado, cuenta, hacer } = useApp()
  const info = estadosDeCamas(estado).find((x) => x.cama.id === camaId)
  if (!info) return null
  const { cama, ocupante, orden, trasladoPendiente } = info
  const puede = cuenta.rol === 'enfermeria' && cuenta.servicios.includes(cama.servicioId)
  const designa = puede && info.libre
  const h = ocupante?.hospitalizacion
  const meta = ESTADOS_CAMA_MAPA[info.estado]
  const hayOrdenes = ordenesPendientes(estado, [cama.servicioId]).length > 0
  const piso = nombreServicio(cama.servicioId)
  const censoInicial = diaDe(estado.ahora) === estado.arranques?.[cama.servicioId]
  const datosCama = [['Estado', meta.label], ['Habitación', cama.habitacion], ['Servicio', piso], ['Cama física', cama.activo]]
  if (cama.bloqueo) datosCama.push(['Motivo del bloqueo', cama.bloqueo.motivo])
  if (orden) datosCama.push(['Mantenimiento', `${ESTADOS_ORDEN_CAMA[orden.estado]}: ${orden.falla}`])
  const ordenIngreso = h?.ordenId && estado.ordenes.find((o) => o.id === h.ordenId)
  const datosPacienteCama = h && [
    ...datosPaciente(estado, h.pacienteId),
    ['Ingreso', verFechaHora(h.fechaIngreso)],
    ['Días de estancia', estancia(h.fechaIngreso, estado.ahora)],
    ['Soporte', etiqueta(SOPORTES, ocupante.soporte)],
    ['Origen', ordenIngreso ? etiqueta(ORIGENES, ordenIngreso.origen) : 'Censo inicial'],
    ['Médico que ordenó', ordenIngreso?.medicoOrdena || null],
    ['Diagnóstico de ingreso', h.diagnosticoIngreso || null],
  ]
  const movimientos = h ? [...movimientosDe(estado, h.id)].reverse() : []
  const ir = (d) => () => abrir(d)
  return (
    <Card
      title={`Cama ${cama.codigo}, habitación ${cama.habitacion}`}
      subtitle={h ? 'El paciente que la ocupa y su estancia.' : 'Sin paciente.'}
      meta={
        <Stack direction="row" gap={2} wrap>
          <Badge label={meta.label} tone={meta.tono} />
          {info.soporte && <span className="marca-soporte">{MARCA_SOPORTE[info.soporte]}</span>}
          {trasladoPendiente && <Badge label={`Traslado a ${nombreServicio(trasladoPendiente.servicioDestino)}`} tone="warn" />}
        </Stack>
      }
      actions={<Button tone="ghost" size="sm" icon="sh-close" onClick={onCerrar}>Quitar selección</Button>}
    >
      <Stack gap={4}>
        <div className="ficha-dos">
          <Stack gap={2}>
            <h3 className="subtitulo">Cama</h3>
            <ListaDatos datos={datosCama} />
          </Stack>
          <Stack gap={2}>
            <h3 className="subtitulo">Paciente</h3>
            {h ? <ListaDatos datos={datosPacienteCama} /> : <p className="texto-apoyo">{info.libre ? 'La cama está libre.' : 'La cama no está disponible.'}</p>}
          </Stack>
        </div>
        {movimientos.length > 0 && (
          <Stack gap={2}>
            <h3 className="subtitulo">Estancia</h3>
            <ol className="trayectoria">
              {movimientos.map((m) => <li key={m.id}><span className="texto-apoyo">{verFechaHora(m.fechaHora)}</span><span>{textoMovimiento(estado, m)}</span></li>)}
            </ol>
          </Stack>
        )}
        {puede && (
          <Stack direction="row" gap={2} wrap>
            {info.libre && censoInicial && <Button tone="ghost" icon="sh-profile" onClick={ir({ tipo: 'censoInicial', camaId })}>Censo inicial</Button>}
            {/* Bloquear salió de la pantalla (2026-11-12); una cama que ya estaba bloqueada se puede liberar. */}
            {cama.bloqueo && !cama.fueraDeServicio && <Button tone="ghost" onClick={() => hacer('cama/desbloquear', { camaId }, 'Cama desbloqueada.')}>Desbloquear</Button>}
            {h && !trasladoPendiente && <Button tone="ghost" icon="sh-send" onClick={ir({ tipo: 'egreso', hospitalizacionId: h.id })}>Registrar alta</Button>}
            {h && !trasladoPendiente && <Button tone="ghost" icon="sh-swap" onClick={ir({ tipo: 'traslado', hospitalizacionId: h.id })}>Registrar traslado</Button>}
            {h && <Button tone="ghost" icon="sh-drop" onClick={ir({ tipo: 'soporte', hospitalizacionId: h.id })}>Oxígeno o ventilación</Button>}
            {trasladoPendiente && <Button tone="ghost" onClick={() => hacer('traslado/cancelar', { trasladoId: trasladoPendiente.id }, 'Traslado cancelado.')}>Cancelar traslado</Button>}
            {!orden && info.estado !== 'mantenimiento' && <Button tone="ghost" icon="sh-wrench" onClick={ir({ tipo: 'falla', camaId })}>Enviar a mantenimiento</Button>}
          </Stack>
        )}
        {designa && (
          <Stack gap={2}>
            <div><Button icon="sh-plus" disabled={!hayOrdenes} onClick={ir({ tipo: 'ingreso', camaId })}>Designar a un paciente</Button></div>
            {!hayOrdenes && <p className="texto-apoyo">No hay pacientes enviados por Admisión a {piso}.</p>}
          </Stack>
        )}
        {!puede && !designa && <p className="texto-apoyo">{cuenta.rol === 'departamento' && cuenta.servicios.includes(cama.servicioId) ? `${piso} controla al paciente y a esta cama. El departamento solo monitorea.` : `Solo consulta. Esta cama la opera ${piso}.`}</p>}
      </Stack>
    </Card>
  )
}
