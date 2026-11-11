import { useState } from 'react'
import { Alert, Badge, Button, Dialog, Input, SegmentedControl, Stack } from '@hrl/core-ui'
import { CONDICIONES_EGRESO, ESTADOS_CAMA_MAPA, ESTADOS_ORDEN_CAMA, ORIGENES, SOPORTES, TIPOS_EGRESO, TRASLADO_NO_INCORPORADO, estadosDeCamas, etiqueta, hospitalizacionPorId, pacientePorId, posicionActual, serviciosConCamas } from '../../dominio/consultas.js'
import { diaDe, edad, estancia, verFechaHora } from '../../dominio/tiempo.js'
import { MEDICOS } from '../../datos/clinicos.js'
import { buscarEnPadron, ordenesPendientes } from '../../datos/admision.js'
import { DEPARTAMENTOS, servicioPorId } from '../../datos/catalogo.js'
import { CampoFechaHora, DialogoAccion, ListaDatos, nombreDepartamento, nombreServicio, opcionesServicio, useApp, useEnvio } from '../comun.jsx'

const departamentoDeServicio = (id) => servicioPorId(id)?.departamento.id

const camasLibres = (estado, servicioId) =>
  estadosDeCamas(estado, [servicioId])
    .filter((x) => x.estado === 'libre')
    .map((x) => ({ value: x.cama.id, label: `${x.cama.codigo} · ${x.cama.habitacion}${x.falla ? ' (falla reportada)' : ''}` }))

/* Camas libres de varias áreas, agrupadas por área y ordenadas por habitación. */
const gruposCamasLibres = (estado, servicios) =>
  servicios.map((s) => ({ label: nombreServicio(s), options: camasLibres(estado, s).sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true })) }))
    .filter((g) => g.options.length)

const VACIO = { value: '', label: 'Elige…' }

function datosPaciente(estado, pacienteId) {
  const p = pacientePorId(estado, pacienteId)
  return [['Paciente', p.nombres], ['N° de HC', p.hc], ['DNI', p.dni], ['Edad y sexo', `${edad(p.nacimiento, estado.ahora)} años · ${p.sexo}`]]
}

/* El departamento designa habitación y cama al paciente que envió Admisión.
   La cama define el área (Medicina B o Intermedios) y desde ese momento el
   piso controla al paciente. Se abre desde la orden (eligiendo cama) o desde
   una cama libre del plano (eligiendo paciente). */
export function DialogoIngreso({ ordenId: ordenInicial, camaId: camaInicial, onCerrar }) {
  const { estado, cuenta } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [ordenId, setOrdenId] = useState(ordenInicial ?? '')
  const [camaId, setCamaId] = useState(camaInicial ?? '')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const cama = estado.camas.find((c) => c.id === camaId)
  const pendientes = ordenesPendientes(estado, cuenta.servicios)
  const orden = estado.ordenes.find((o) => o.id === ordenId)
  const grupos = gruposCamasLibres(estado, cuenta.servicios)
  return (
    <DialogoAccion
      titulo="Designar habitación y cama"
      subtitulo="Admisión envió al paciente al departamento. La cama que elijas define el piso que lo recibe y lo controla desde ahora."
      textoConfirmar="Designar e ingresar"
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('ingreso/confirmar', { ordenId, camaId, fechaHora }, `Ingreso registrado. ${cama ? nombreServicio(cama.servicioId) : 'El piso'} ya controla al paciente.`)}
    >
      {!ordenInicial && (
        <Input label="Paciente enviado por Admisión" kind="select" value={ordenId} onChange={(e) => setOrdenId(e.target.value)} options={[VACIO, ...pendientes.map((o) => ({ value: o.id, label: `${pacientePorId(estado, o.pacienteId).nombres} · ${etiqueta(ORIGENES, o.origen)}` }))]} />
      )}
      {orden && (
        <ListaDatos datos={[...datosPaciente(estado, orden.pacienteId), ['Origen', etiqueta(ORIGENES, orden.origen)], ['Departamento', nombreDepartamento(orden.departamentoId)], ['Orden de Admisión', verFechaHora(orden.fechaHora)], ['Diagnóstico de ingreso', orden.diagnosticoIngreso || null]]} />
      )}
      {!camaInicial && <Input label="Habitación y cama" kind="select" value={camaId} onChange={(e) => setCamaId(e.target.value)} options={[VACIO]} groups={grupos} />}
      {cama && <ListaDatos datos={[['Cama', `${cama.codigo} · habitación ${cama.habitacion}`], ['Piso que lo recibe', nombreServicio(cama.servicioId)]]} />}
      <CampoFechaHora etiqueta="Fecha de ingreso" value={fechaHora} onChange={setFechaHora} />
    </DialogoAccion>
  )
}

/* Censo inicial: pacientes que ya estaban hospitalizados cuando arrancó el servicio. */
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
          {hallados.map((p) => <Stack key={p.id} direction="row" justify="between" align="center" gap={2}><span>{p.nombres} · HC {p.hc}</span><Button size="sm" tone="ghost" onClick={() => setElegido(p)}>Elegir</Button></Stack>)}
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

export function DialogoTraslado({ hospitalizacionId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const actual = posicionActual(estado, hospitalizacionId)
  const incorporados = serviciosConCamas(estado)
  const [servicioDestino, setDestino] = useState(actual.servicioId)
  const [otro, setOtro] = useState('')
  const [camaId, setCamaId] = useState('')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const mismo = servicioDestino === actual.servicioId
  const fuera = servicioDestino === OTRO
  const confirmar = () => {
    if (fuera) {
      const nombre = otro ? `${nombreServicio(otro)} (${nombreDepartamento(departamentoDeServicio(otro))})` : ''
      return enviar('egreso/registrar', { hospitalizacionId, tipoEgreso: TRASLADO_NO_INCORPORADO, destino: nombre, fechaHora }, 'Traslado registrado. La cama queda libre y la estancia en Medicina se cierra.')
    }
    return enviar('traslado/registrar', { hospitalizacionId, servicioDestino, camaId, fechaHora }, mismo ? 'Cambio de cama registrado.' : 'Traslado enviado. El otro piso confirmará la cama.')
  }
  return (
    <DialogoAccion titulo="Trasladar paciente" subtitulo="Un traslado no es un egreso hospitalario." textoConfirmar={mismo ? 'Cambiar de cama' : fuera ? 'Registrar salida' : 'Enviar traslado'} onCerrar={onCerrar} error={error} onConfirmar={confirmar}>
      <Input
        label="Destino"
        kind="select"
        value={servicioDestino}
        onChange={(e) => setDestino(e.target.value)}
        options={[...opcionesServicio(incorporados).map((o) => (o.value === actual.servicioId ? { ...o, label: `${o.label} (otra cama del mismo piso)` } : o)), { value: OTRO, label: 'Otro departamento (UCI, Cirugía…)' }]}
      />
      {mismo && (
        <>
          <Input label="Cama nueva" kind="select" value={camaId} onChange={(e) => setCamaId(e.target.value)} options={[VACIO, ...camasLibres(estado, actual.servicioId)]} />
          <CampoFechaHora value={fechaHora} onChange={setFechaHora} />
        </>
      )}
      {!mismo && !fuera && (
        <Alert tone="info" title="El otro piso elige la cama">El paciente sigue en su cama actual hasta que {nombreServicio(servicioDestino)} confirme su llegada.</Alert>
      )}
      {fuera && (
        <>
          <Input label="Servicio de destino" required kind="select" value={otro} onChange={(e) => setOtro(e.target.value)} options={[VACIO]} groups={gruposOtrosServicios(incorporados)} />
          <CampoFechaHora etiqueta="Fecha de salida" value={fechaHora} onChange={setFechaHora} />
          <Alert tone="info" title="Ese servicio aún no está en el sistema">La estancia en Medicina se cierra al salir y la cama queda libre. No cuenta como egreso hospitalario.</Alert>
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
    <DialogoAccion titulo="Confirmar llegada del traslado" textoConfirmar="Confirmar llegada" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('traslado/confirmar', { trasladoId, camaId, fechaHora }, 'Traslado confirmado.')}>
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
    <DialogoAccion titulo="Cambiar soporte" subtitulo="Este dato alimenta el reporte RENOXI." onCerrar={onCerrar} error={error} onConfirmar={() => enviar('soporte/cambiar', { hospitalizacionId, soporte, fechaHora }, 'Soporte actualizado.')}>
      <Input label="Soporte" kind="select" value={soporte} onChange={(e) => setSoporte(e.target.value)} options={opciones} />
      <CampoFechaHora value={fechaHora} onChange={setFechaHora} />
    </DialogoAccion>
  )
}

/* Alta del paciente. El traslado a otro departamento no va aquí: se registra
   desde Trasladar. */
export function DialogoEgreso({ hospitalizacionId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const h = hospitalizacionPorId(estado, hospitalizacionId)
  const [tipoEgreso, setTipo] = useState('alta_medica')
  const [condicion, setCondicion] = useState('mejorado')
  const [medicoId, setMedico] = useState('')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const [conAlta, setConAlta] = useState(false)
  const [altaMedica, setAltaMedica] = useState(estado.ahora)
  const fallecido = tipoEgreso.startsWith('fallecido')
  return (
    <DialogoAccion
      titulo="Dar de alta"
      subtitulo="El egreso es corto: los datos del paciente salen del ingreso."
      textoConfirmar="Registrar egreso"
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('egreso/registrar', { hospitalizacionId, tipoEgreso, condicion: fallecido ? 'fallecido' : condicion, medicoId, fechaHora, altaMedica: conAlta ? altaMedica : '' }, 'Egreso registrado. Queda pendiente de la HC en Estadística.')}
    >
      <ListaDatos datos={datosPaciente(estado, h.pacienteId)} />
      <Input label="Tipo de egreso" kind="select" value={tipoEgreso} onChange={(e) => setTipo(e.target.value)} options={TIPOS_EGRESO} />
      {!fallecido && <Input label="Condición de egreso" kind="select" value={condicion} onChange={(e) => setCondicion(e.target.value)} options={CONDICIONES_EGRESO.filter((c) => c.value !== 'fallecido')} />}
      <Input label="Médico que dio el alta" info="Opcional. Si no se indica, Estadística lo toma de la HC." kind="select" value={medicoId} onChange={(e) => setMedico(e.target.value)} options={[{ value: '', label: 'Lo completa Estadística desde la HC' }, ...MEDICOS]} />
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

export function DialogoBloqueo({ camaId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [motivo, setMotivo] = useState('')
  const cama = estado.camas.find((c) => c.id === camaId)
  return (
    <DialogoAccion titulo={`Bloquear ${cama.codigo}`} subtitulo="La cama deja de contar como disponible." textoConfirmar="Bloquear cama" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('cama/bloquear', { camaId, motivo }, 'Cama bloqueada.')}>
      <Input label="Motivo" required autoFocus placeholder="Aislamiento, reserva, obra…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </DialogoAccion>
  )
}

/* El detalle de una cama y lo que la cuenta puede hacer con ella. */
export function DialogoCama({ camaId, onCerrar, abrir }) {
  const { estado, cuenta, hacer } = useApp()
  const info = estadosDeCamas(estado).find((x) => x.cama.id === camaId)
  const { cama, ocupante, orden, trasladoPendiente } = info
  const puede = cuenta.rol === 'enfermeria' && cuenta.servicios.includes(cama.servicioId)
  const designa = cuenta.rol === 'departamento' && cuenta.servicios.includes(cama.servicioId) && info.estado === 'libre'
  const h = ocupante?.hospitalizacion
  const meta = ESTADOS_CAMA_MAPA[info.estado]
  const hayOrdenes = ordenesPendientes(estado, [cama.servicioId]).length > 0
  const piso = nombreServicio(cama.servicioId)
  const censoInicial = diaDe(estado.ahora) === estado.arranques?.[cama.servicioId]
  const datos = [['Habitación', cama.habitacion], ['Servicio', nombreServicio(cama.servicioId)], ['Cama física', cama.activo]]
  if (cama.bloqueo) datos.push(['Motivo del bloqueo', cama.bloqueo.motivo])
  if (orden) datos.push(['Mantenimiento', `${ESTADOS_ORDEN_CAMA[orden.estado]}: ${orden.falla}`])
  if (h) {
    datos.push(...datosPaciente(estado, h.pacienteId), ['Ingreso', verFechaHora(h.fechaIngreso)], ['Días de estancia', estancia(h.fechaIngreso, estado.ahora)], ['Soporte', etiqueta(SOPORTES, ocupante.soporte)], ['Diagnóstico de ingreso', h.diagnosticoIngreso || null])
  }
  const ir = (d) => () => abrir(d)
  return (
    <Dialog title={`Cama ${cama.codigo}`} subtitle={meta.label} onClose={onCerrar} maxWidth={560}>
      <Stack gap={3}>
        <Stack direction="row" gap={2} wrap>
          <Badge label={meta.label} tone={meta.tono} />
          {info.falla && <Badge label="Falla reportada" tone="warn" />}
          {trasladoPendiente && <Badge label={`Traslado a ${nombreServicio(trasladoPendiente.servicioDestino)}`} tone="warn" />}
        </Stack>
        <ListaDatos datos={datos} />
        {puede && (
          <Stack direction="row" gap={2} wrap>
            {info.estado === 'libre' && censoInicial && <Button tone="ghost" icon="sh-profile" onClick={ir({ tipo: 'censoInicial', camaId })}>Censo inicial</Button>}
            {info.estado === 'libre' && <Button tone="ghost" icon="sh-shield" onClick={ir({ tipo: 'bloqueo', camaId })}>Bloquear</Button>}
            {info.estado === 'bloqueada' && <Button tone="ghost" onClick={async () => { if (!(await hacer('cama/desbloquear', { camaId }, 'Cama desbloqueada.'))) onCerrar() }}>Desbloquear</Button>}
            {h && !trasladoPendiente && <Button icon="sh-swap" onClick={ir({ tipo: 'traslado', hospitalizacionId: h.id })}>Trasladar</Button>}
            {h && <Button tone="ghost" icon="sh-drop" onClick={ir({ tipo: 'soporte', hospitalizacionId: h.id })}>Cambiar soporte</Button>}
            {h && !trasladoPendiente && <Button tone="ghost" icon="sh-send" onClick={ir({ tipo: 'egreso', hospitalizacionId: h.id })}>Dar de alta</Button>}
            {trasladoPendiente && <Button tone="ghost" onClick={async () => { if (!(await hacer('traslado/cancelar', { trasladoId: trasladoPendiente.id }, 'Traslado cancelado.'))) onCerrar() }}>Cancelar traslado</Button>}
            {!orden && info.estado !== 'fuera' && <Button tone="ghost" icon="sh-wrench" onClick={ir({ tipo: 'falla', camaId })}>Enviar a mantenimiento</Button>}
          </Stack>
        )}
        {designa && (
          <Stack gap={2}>
            <div><Button icon="sh-plus" disabled={!hayOrdenes} onClick={ir({ tipo: 'ingreso', camaId })}>Designar a un paciente</Button></div>
            {!hayOrdenes && <p className="texto-apoyo">No hay pacientes enviados por Admisión al departamento.</p>}
          </Stack>
        )}
        {!puede && !designa && <p className="texto-apoyo">{cuenta.rol === 'departamento' ? `Desde el ingreso, ${piso} controla al paciente y a esta cama. El departamento solo supervisa.` : `Solo consulta. Esta cama la opera ${piso}.`}</p>}
      </Stack>
    </Dialog>
  )
}
