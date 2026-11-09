import { useState } from 'react'
import { Alert, Badge, Button, Dialog, Input, Stack } from '@hrl/core-ui'
import { CONDICIONES_EGRESO, ESTADOS_CAMA_MAPA, ESTADOS_ORDEN_CAMA, ORIGENES, SOPORTES, TIPOS_EGRESO, TRASLADO_NO_INCORPORADO, estadosDeCamas, etiqueta, hospitalizacionPorId, pacientePorId, posicionActual, serviciosConCamas } from '../../dominio/consultas.js'
import { edad, estancia, verFechaHora } from '../../dominio/tiempo.js'
import { MEDICOS } from '../../datos/clinicos.js'
import { ordenesPendientes } from '../../datos/admision.js'
import { CampoFechaHora, DialogoAccion, ListaDatos, nombreServicio, opcionesServicio, useApp, useEnvio } from '../comun.jsx'

const camasLibres = (estado, servicioId) =>
  estadosDeCamas(estado, [servicioId])
    .filter((x) => x.estado === 'libre')
    .map((x) => ({ value: x.cama.id, label: `${x.cama.codigo} · ${x.cama.habitacion}${x.falla ? ' (falla reportada)' : ''}` }))

const VACIO = { value: '', label: 'Elige…' }

function datosPaciente(estado, pacienteId) {
  const p = pacientePorId(estado, pacienteId)
  return [['Paciente', p.nombres], ['N° de HC', p.hc], ['DNI', p.dni], ['Edad y sexo', `${edad(p.nacimiento, estado.ahora)} años · ${p.sexo}`]]
}

/* Enfermería de piso recibe al paciente que Admisión envió al área. Se abre
   desde la orden (eligiendo cama) o desde una cama libre (eligiendo orden). */
export function DialogoIngreso({ ordenId: ordenInicial, camaId: camaInicial, onCerrar }) {
  const { estado, cuenta } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [ordenId, setOrdenId] = useState(ordenInicial ?? '')
  const [camaId, setCamaId] = useState(camaInicial ?? '')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const cama = estado.camas.find((c) => c.id === camaId)
  const pendientes = ordenesPendientes(estado, camaInicial ? [cama.servicioId] : cuenta.servicios)
  const orden = estado.ordenes.find((o) => o.id === ordenId)
  return (
    <DialogoAccion
      titulo="Confirmar cama e ingreso"
      subtitulo="Admisión indicó el área. Aquí se decide la cama, cuando el paciente llega al piso."
      textoConfirmar="Confirmar ingreso"
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('ingreso/confirmar', { ordenId, camaId, fechaHora }, 'Ingreso registrado. El paciente ya está en el censo.')}
    >
      {!ordenInicial && (
        <Input label="Paciente enviado por Admisión" kind="select" value={ordenId} onChange={(e) => setOrdenId(e.target.value)} options={[VACIO, ...pendientes.map((o) => ({ value: o.id, label: `${pacientePorId(estado, o.pacienteId).nombres} · ${etiqueta(ORIGENES, o.origen)}` }))]} />
      )}
      {orden && (
        <ListaDatos datos={[...datosPaciente(estado, orden.pacienteId), ['Origen', etiqueta(ORIGENES, orden.origen)], ['Área', nombreServicio(orden.servicioId)], ['Orden de Admisión', verFechaHora(orden.fechaHora)], ['Diagnóstico de ingreso', orden.diagnosticoIngreso || null]]} />
      )}
      {!camaInicial && <Input label="Cama" kind="select" value={camaId} onChange={(e) => setCamaId(e.target.value)} options={[VACIO, ...(orden ? camasLibres(estado, orden.servicioId) : [])]} />}
      {camaInicial && <ListaDatos datos={[['Cama', `${cama.codigo} · ${cama.habitacion}`]]} />}
      <CampoFechaHora etiqueta="Fecha de llegada" value={fechaHora} onChange={setFechaHora} />
    </DialogoAccion>
  )
}

export function DialogoTraslado({ hospitalizacionId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const actual = posicionActual(estado, hospitalizacionId)
  const [servicioDestino, setDestino] = useState(actual.servicioId)
  const [camaId, setCamaId] = useState('')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const mismo = servicioDestino === actual.servicioId
  return (
    <DialogoAccion titulo="Trasladar paciente" subtitulo="Un traslado no es un egreso: la hospitalización continúa." textoConfirmar={mismo ? 'Cambiar de cama' : 'Enviar traslado'} onCerrar={onCerrar} error={error} onConfirmar={() => enviar('traslado/registrar', { hospitalizacionId, servicioDestino, camaId, fechaHora }, mismo ? 'Cambio de cama registrado.' : 'Traslado enviado. El destino confirmará la cama.')}>
      <Input label="Servicio de destino" kind="select" value={servicioDestino} onChange={(e) => setDestino(e.target.value)} options={opcionesServicio(serviciosConCamas(estado))} />
      {mismo ? (
        <>
          <Input label="Cama nueva" kind="select" value={camaId} onChange={(e) => setCamaId(e.target.value)} options={[VACIO, ...camasLibres(estado, actual.servicioId)]} />
          <CampoFechaHora value={fechaHora} onChange={setFechaHora} />
        </>
      ) : (
        <Alert tone="info" title="El destino elige la cama">El paciente sigue en su cama actual hasta que la enfermería de {nombreServicio(servicioDestino)} confirme su llegada.</Alert>
      )}
      <p className="texto-apoyo">Para un servicio que aún no está en el sistema (por ejemplo UCI), usa Dar de alta y elige «Traslado a servicio no incorporado».</p>
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
  const [soporte, setSoporte] = useState(actual.soporte === 'o2' ? 'ninguno' : 'o2')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  return (
    <DialogoAccion titulo="Cambiar soporte de oxígeno" subtitulo="Este dato alimenta el reporte RENOXI." onCerrar={onCerrar} error={error} onConfirmar={() => enviar('soporte/cambiar', { hospitalizacionId, soporte, fechaHora }, 'Soporte actualizado.')}>
      <Input label="Soporte" kind="select" value={soporte} onChange={(e) => setSoporte(e.target.value)} options={SOPORTES} />
      <CampoFechaHora value={fechaHora} onChange={setFechaHora} />
    </DialogoAccion>
  )
}

export function DialogoEgreso({ hospitalizacionId, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const h = hospitalizacionPorId(estado, hospitalizacionId)
  const [tipoEgreso, setTipo] = useState('alta_medica')
  const [condicion, setCondicion] = useState('mejorado')
  const [destino, setDestino] = useState('')
  const [medicoId, setMedico] = useState('')
  const [fechaHora, setFechaHora] = useState(estado.ahora)
  const fuera = tipoEgreso === TRASLADO_NO_INCORPORADO
  const fallecido = tipoEgreso.startsWith('fallecido')
  const opciones = [...TIPOS_EGRESO, { value: TRASLADO_NO_INCORPORADO, label: 'Traslado a servicio no incorporado' }]
  return (
    <DialogoAccion
      titulo="Dar de alta"
      subtitulo="El egreso es corto: los datos del paciente salen del ingreso."
      textoConfirmar="Registrar egreso"
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('egreso/registrar', { hospitalizacionId, tipoEgreso, condicion: fallecido ? 'fallecido' : condicion, destino, medicoId, fechaHora }, fuera ? 'Salida registrada. No cuenta como egreso hospitalario.' : 'Egreso registrado. Queda pendiente de la HC en Estadística.')}
    >
      <ListaDatos datos={datosPaciente(estado, h.pacienteId)} />
      <Input label="Tipo de egreso" kind="select" value={tipoEgreso} onChange={(e) => setTipo(e.target.value)} options={opciones} />
      {fuera && <Input label="Servicio de destino" placeholder="Por ejemplo, UCI Medicina" value={destino} onChange={(e) => setDestino(e.target.value)} />}
      {!fuera && !fallecido && <Input label="Condición de egreso" kind="select" value={condicion} onChange={(e) => setCondicion(e.target.value)} options={CONDICIONES_EGRESO.filter((c) => c.value !== 'fallecido')} />}
      {!fuera && <Input label="Médico que dio el alta" info="Opcional. Si no se indica, Estadística lo toma de la HC." kind="select" value={medicoId} onChange={(e) => setMedico(e.target.value)} options={[{ value: '', label: 'Lo completa Estadística desde la HC' }, ...MEDICOS]} />}
      <CampoFechaHora etiqueta="Fecha de salida" value={fechaHora} onChange={setFechaHora} />
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
  const h = ocupante?.hospitalizacion
  const meta = ESTADOS_CAMA_MAPA[info.estado]
  const hayOrdenes = ordenesPendientes(estado, [cama.servicioId]).length > 0
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
            {info.estado === 'libre' && <Button icon="sh-plus" disabled={!hayOrdenes} onClick={ir({ tipo: 'ingreso', camaId })}>Ingresar paciente</Button>}
            {info.estado === 'libre' && <Button tone="ghost" icon="sh-shield" onClick={ir({ tipo: 'bloqueo', camaId })}>Bloquear</Button>}
            {info.estado === 'bloqueada' && <Button tone="ghost" onClick={() => { if (!hacer('cama/desbloquear', { camaId }, 'Cama desbloqueada.')) onCerrar() }}>Desbloquear</Button>}
            {h && !trasladoPendiente && <Button icon="sh-swap" onClick={ir({ tipo: 'traslado', hospitalizacionId: h.id })}>Trasladar</Button>}
            {h && <Button tone="ghost" icon="sh-drop" onClick={ir({ tipo: 'soporte', hospitalizacionId: h.id })}>Cambiar soporte</Button>}
            {h && !trasladoPendiente && <Button tone="ghost" icon="sh-send" onClick={ir({ tipo: 'egreso', hospitalizacionId: h.id })}>Dar de alta</Button>}
            {trasladoPendiente && <Button tone="ghost" onClick={() => { if (!hacer('traslado/cancelar', { trasladoId: trasladoPendiente.id }, 'Traslado cancelado.')) onCerrar() }}>Cancelar traslado</Button>}
            {!orden && info.estado !== 'fuera' && <Button tone="ghost" icon="sh-wrench" onClick={ir({ tipo: 'falla', camaId })}>Reportar falla</Button>}
          </Stack>
        )}
        {puede && info.estado === 'libre' && !hayOrdenes && <p className="texto-apoyo">No hay pacientes enviados por Admisión a este servicio. Sin orden no se puede ocupar una cama.</p>}
      </Stack>
    </Dialog>
  )
}
