import { useState } from 'react'
import { Alert, Badge, Button, Card, DataTable, Grid, Input, PageActions, Stack, StatCard } from '@hrl/core-ui'
import { TRASLADO_NO_INCORPORADO, camaPorId, censoEditable, cuadreCenso, cuadreInventario, ESTADOS_CAMA_MAPA, SOPORTES, esEgresoHospitalario, estadoCenso, etiqueta, etiquetaEgreso, filasCenso, hospitalizacionPorId, novedadesCenso, pacientePorId, registroCenso } from '../../dominio/consultas.js'
import { corteDelDia, diaDe, edad, horaDe, verFecha, verFechaHora } from '../../dominio/tiempo.js'
import { nombreMedico } from '../../datos/clinicos.js'
import { DialogoAccion, diaOperativo, nombreServicio, opcionesServicio, useApp, useEnvio } from '../comun.jsx'
import { DialogoConfirmarTraslado, DialogoEgreso, DialogoTraslado } from '../camas/Dialogos.jsx'

export function DialogoCerrarCenso({ servicioId, dia, onCerrar }) {
  const { estado } = useApp()
  const { error, enviar } = useEnvio(onCerrar)
  const [conteo, setConteo] = useState('')
  const [observacion, setObservacion] = useState('')
  const c = cuadreCenso(estado, servicioId, dia)
  const n = conteo === '' ? null : Number(conteo)
  const difiere = n !== null && n !== c.pacientesCorte
  return (
    <DialogoAccion
      titulo={`Cerrar censo del ${verFecha(dia)}`}
      subtitulo={nombreServicio(servicioId)}
      textoConfirmar="Cerrar censo"
      onCerrar={onCerrar}
      error={error}
      onConfirmar={() => enviar('censo/cerrar', { servicioId, dia, conteoFisico: conteo === '' ? NaN : n, observacion }, 'Censo cerrado.')}
    >
      <Input label="Pacientes presentes en sala al corte" required autoFocus kind="number" info="El censo sale de los movimientos, así que su fórmula siempre cuadra. Este conteo es el control contra la realidad." value={conteo} onChange={(e) => setConteo(e.target.value)} />
      {difiere && <Alert tone="warning" title="El conteo no coincide">El sistema tiene {c.pacientesCorte} pacientes al corte. Revisa si falta registrar un movimiento o explica la diferencia.</Alert>}
      <Input label={difiere ? 'Observación (obligatoria)' : 'Observación'} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
    </DialogoAccion>
  )
}

function DialogoReabrir({ servicioId, dia, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [motivo, setMotivo] = useState('')
  return (
    <DialogoAccion titulo="Reabrir censo" subtitulo="Queda registrado en la bitácora." textoConfirmar="Reabrir" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('censo/reabrir', { servicioId, dia, motivo }, 'Censo reabierto.')}>
      <Input label="Motivo" required autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </DialogoAccion>
  )
}

function DialogoNota({ servicioId, dia, fila, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [nota, setNota] = useState(fila.observacion)
  return (
    <DialogoAccion titulo={`Observación de ${fila.nombre}`} onCerrar={onCerrar} error={error} onConfirmar={() => enviar('censo/nota', { servicioId, dia, hospitalizacionId: fila.hospitalizacionId, nota })}>
      <Input label="Observación" autoFocus value={nota} onChange={(e) => setNota(e.target.value)} />
    </DialogoAccion>
  )
}

const nombrePaciente = (estado, hId) => pacientePorId(estado, hospitalizacionPorId(estado, hId).pacienteId)

/* Altas del día en el área: salidas del hospital. Los traslados van aparte. */
function altasDelDia(estado, servicioId, dia) {
  return estado.hospitalizaciones
    .filter((h) => !h.anulada && h.egreso && esEgresoHospitalario(h.egreso.tipo) && h.egreso.servicioId === servicioId && diaDe(h.egreso.fechaHora) === dia)
    .sort((a, b) => (a.egreso.fechaHora < b.egreso.fechaHora ? -1 : 1))
}

/* Traslados del día que tocan al área: los que salen, los que llegan y los que
   todavía esperan que el área de destino designe la cama. */
function trasladosDelDia(estado, servicioId, dia) {
  const filas = []
  for (const m of estado.movimientos) {
    if (m.anulado || diaDe(m.fechaHora) !== dia) continue
    if (m.tipo === 'traslado' && m.servicioOrigen !== m.servicioId) {
      if (m.servicioOrigen === servicioId) filas.push({ clave: m.id, hora: m.fechaHora, hId: m.hospitalizacionId, sentido: `Sale a ${nombreServicio(m.servicioId)}`, cama: camaPorId(estado, m.camaOrigen)?.codigo })
      if (m.servicioId === servicioId) filas.push({ clave: m.id, hora: m.fechaHora, hId: m.hospitalizacionId, sentido: `Llega de ${nombreServicio(m.servicioOrigen)}`, cama: camaPorId(estado, m.camaId)?.codigo })
    }
    if (m.tipo === 'egreso' && m.tipoEgreso === TRASLADO_NO_INCORPORADO && m.servicioId === servicioId) {
      const destino = hospitalizacionPorId(estado, m.hospitalizacionId).egreso?.destino
      filas.push({ clave: m.id, hora: m.fechaHora, hId: m.hospitalizacionId, sentido: `Sale a ${destino || 'un servicio no incorporado'}`, cama: camaPorId(estado, m.camaId)?.codigo })
    }
  }
  for (const t of estado.traslados) {
    if (t.estado !== 'pendiente') continue
    if (t.servicioDestino === servicioId) filas.push({ clave: `t${t.id}`, hora: t.solicitadoEn, hId: t.hospitalizacionId, sentido: `Por recibir de ${nombreServicio(t.servicioOrigen)}`, cama: '', porRecibir: t })
    if (t.servicioOrigen === servicioId) filas.push({ clave: `t${t.id}`, hora: t.solicitadoEn, hId: t.hospitalizacionId, sentido: `Enviado a ${nombreServicio(t.servicioDestino)}, esperando cama`, cama: camaPorId(estado, t.camaOrigen)?.codigo, enviado: t })
  }
  return filas.sort((a, b) => (a.hora < b.hora ? -1 : 1))
}

export function CensoDiario() {
  const { estado, cuenta, hacer } = useApp()
  const [servicioElegido, setServicio] = useState(cuenta.servicios[0])
  const [diaElegido, setDia] = useState(null)
  const [dialogo, setDialogo] = useState(null)
  const dia = diaElegido ?? diaOperativo(estado.ahora)
  const servicioId = servicioElegido
  const filas = filasCenso(estado, servicioId, dia, nombreServicio)
  const c = cuadreCenso(estado, servicioId, dia)
  const r = registroCenso(estado, servicioId, dia)
  const est = estadoCenso(estado, servicioId, dia)
  const novedades = novedadesCenso(estado, servicioId, dia)
  const editable = censoEditable(estado, servicioId, dia)
  const inventario = cuadreInventario(estado, servicioId)
  const puedeCerrar = ['enfermeria', 'tecnico', 'jefatura'].includes(cuenta.rol) && estado.ahora >= corteDelDia(dia) && r?.estado !== 'cerrado' && (cuenta.rol !== 'enfermeria' || editable)
  const puedeReabrir = cuenta.rol === 'jefatura' && r?.estado === 'cerrado'
  const escribe = ['enfermeria', 'tecnico', 'jefatura'].includes(cuenta.rol) && editable
  const operaArea = cuenta.rol === 'enfermeria' && editable && dia === diaOperativo(estado.ahora)
  const altas = altasDelDia(estado, servicioId, dia)
  const traslados = trasladosDelDia(estado, servicioId, dia)

  const columnas = [
    { key: 'cama', label: 'Cama', width: 70, render: (f) => <strong>{f.camaCodigo}</strong> },
    { key: 'hc', label: 'N° HC', width: 80, render: (f) => f.hc ?? '' },
    { key: 'nombre', label: 'Paciente', render: (f) => (f.vacia ? <span className="texto-apoyo">{ESTADOS_CAMA_MAPA[f.estadoCama]?.label ?? 'Bloqueada'}</span> : f.nombre) },
    { key: 'edad', label: 'Edad / sexo', width: 66, render: (f) => (f.vacia ? '' : `${edad(f.nacimiento, dia)} / ${f.sexo}`) },
    { key: 'ingreso', label: 'F. ingreso', width: 92, render: (f) => (f.vacia ? '' : verFecha(diaDe(f.fechaIngreso))) },
    { key: 'dias', label: 'Días', width: 50, align: 'right', render: (f) => f.dias ?? '' },
    { key: 'mov', label: 'Mov.', width: 62, tooltip: 'I ingreso, T traslado, E egreso.', render: (f) => f.movimiento ?? '' },
    { key: 'relacion', label: 'Origen / destino', width: 110, render: (f) => f.relacion ?? '' },
    { key: 'prestamo', label: 'Cama otro serv.', width: 64, tooltip: 'Queda en el formato. Los préstamos aún no están activos.', render: () => '' },
    { key: 'soporte', label: 'O2', width: 60, render: (f) => (f.soporte === 'o2' ? 'O2' : f.soporte === 'vm' ? 'VM' : f.soporte ? etiqueta(SOPORTES, f.soporte).replace('Sin soporte', '—') : '') },
    { key: 'egreso', label: 'Tipo de egreso', width: 110, render: (f) => (f.tipoEgreso ? etiquetaEgreso(f.tipoEgreso) : '') },
    { key: 'obs', label: 'Observación', width: 96, render: (f) => (f.vacia ? '' : f.observacion || (escribe ? <Button tone="link" onClick={() => setDialogo({ tipo: 'nota', fila: f })}>Agregar</Button> : '')) },
    { key: 'cie', label: 'CIE-10', group: 'Alta', width: 74, render: (f) => f.cie10 ?? '' },
    { key: 'medico', label: 'Médico del alta', group: 'Alta', width: 110, render: (f) => (f.medicoId ? nombreMedico(f.medicoId) : '') },
  ]

  return (
    <div className="panel"><Stack gap={4}>
      <PageActions>
        <Button tone="ghost" icon="sh-doc" onClick={() => window.print()}>Imprimir</Button>
        {puedeReabrir && <Button tone="ghost" onClick={() => setDialogo({ tipo: 'reabrir' })}>Reabrir</Button>}
        {puedeCerrar && <Button icon="sh-stamp" onClick={() => setDialogo({ tipo: 'cerrar' })}>Cerrar censo</Button>}
      </PageActions>
      <div className="filtros-censo">
        {cuenta.servicios.length > 1 && <Input label="Servicio" kind="select" value={servicioId} onChange={(e) => setServicio(e.target.value)} options={opcionesServicio(cuenta.servicios)} />}
        <Input label="Día del censo" kind="date" value={dia} onChange={(e) => setDia(e.target.value)} />
      </div>
      <div className="zona-impresion">
        <Stack gap={4}>
          <Card
            title={`Censo diario de ${nombreServicio(servicioId)}`}
            subtitle={`${verFecha(dia)}, de 00:00 a 23:59`}
            meta={<Badge label={est.label} tone={est.tono} />}
            wide
          >
            <div className="tabla-censo"><DataTable rowKey={(f) => f.clave} rows={filas} columns={columnas} rowClass={(f) => (f.vacia ? 'fila-vacia' : '')} /></div>
          </Card>
          <Card
            title="Altas del día"
            subtitle="Salidas del hospital: alta médica, voluntaria, fuga, referido o fallecido. Cuentan como egreso."
            actions={operaArea && <Button icon="sh-send" onClick={() => setDialogo({ tipo: 'alta' })}>Registrar alta</Button>}
            wide
          >
            <DataTable
              rowKey={(h) => h.id}
              rows={altas}
              empty="Sin altas este día."
              columns={[
                { key: 'hora', label: 'Hora', width: 70, render: (h) => horaDe(h.egreso.fechaHora) },
                { key: 'paciente', label: 'Paciente', render: (h) => `${pacientePorId(estado, h.pacienteId).nombres}, HC ${pacientePorId(estado, h.pacienteId).hc}` },
                { key: 'tipo', label: 'Tipo de alta', width: 190, render: (h) => etiquetaEgreso(h.egreso.tipo) },
                { key: 'cie', label: 'CIE-10', width: 110, render: (h) => h.egreso.cie10?.join(', ') || '—' },
                { key: 'medico', label: 'Médico del alta', width: 170, render: (h) => nombreMedico(h.egreso.medicoId) },
              ]}
            />
          </Card>
          <Card
            title="Traslados del día"
            subtitle="El paciente sigue hospitalizado en otra área o cama. No es un alta."
            actions={operaArea && <Button tone="ghost" icon="sh-swap" onClick={() => setDialogo({ tipo: 'traslado' })}>Registrar traslado</Button>}
            wide
          >
            <DataTable
              rowKey={(f) => f.clave}
              rows={traslados}
              empty="Sin traslados este día."
              columns={[
                { key: 'hora', label: 'Hora', width: 70, render: (f) => horaDe(f.hora) },
                { key: 'paciente', label: 'Paciente', render: (f) => `${nombrePaciente(estado, f.hId).nombres}, HC ${nombrePaciente(estado, f.hId).hc}` },
                { key: 'sentido', label: 'Traslado', width: 280, render: (f) => (f.porRecibir || f.enviado ? <Badge label={f.sentido} tone="warn" /> : f.sentido) },
                { key: 'cama', label: 'Cama', width: 70, render: (f) => f.cama || '—' },
                { key: 'accion', label: '', width: 160, align: 'right', render: (f) => (
                  cuenta.rol !== 'enfermeria' ? null
                    : f.porRecibir ? <Button size="sm" onClick={() => setDialogo({ tipo: 'confirmar', trasladoId: f.porRecibir.id })}>Designar cama</Button>
                    : f.enviado ? <Button size="sm" tone="ghost" onClick={() => hacer('traslado/cancelar', { trasladoId: f.enviado.id }, 'Traslado cancelado.')}>Cancelar</Button>
                    : null
                ) },
              ]}
            />
          </Card>
          <Card title="Cuadre" subtitle={r?.cerradoEn ? `Cerrado el ${verFechaHora(r.cerradoEn)} por ${r.cerradoPor}` : 'Se calcula de los movimientos. No hay ajuste manual de números.'}>
            <Grid min={130} gap={3}>
              <StatCard label="Saldo anterior" value={c.saldoAnterior} />
              <StatCard label="Ingresos" value={c.ingresos} />
              <StatCard label="Traslados que entran" value={c.trasladosEntran} />
              <StatCard label="Egresos" value={c.egresos} />
              <StatCard label="Traslados que salen" value={c.trasladosSalen} />
              <StatCard label="Saldo actual" value={c.saldoCalculado} severity={c.cuadra ? 'normal' : 'abnormal'} />
              <StatCard label="Pacientes-día" value={c.pacientesDia} />
              <StatCard label="Conteo físico" value={r?.conteoFisico ?? '—'} severity={r?.conteoFisico !== undefined && r.conteoFisico !== c.pacientesCorte ? 'suspect' : 'normal'} />
            </Grid>
            {r?.observacion && <p className="texto-apoyo">Observación: {r.observacion}</p>}
            <div className="firma-censo"><span>Firma de enfermería</span></div>
          </Card>
          <Card title="Novedades de camas" subtitle={inventario.cuadra ? `Inventario cuadrado: ${inventario.fuera} en mantenimiento y ${inventario.ordenes} órdenes abiertas.` : `Inventario sin cuadrar: ${inventario.fuera} en mantenimiento y ${inventario.ordenes} órdenes abiertas.`}>
            <DataTable
              rowKey={(n) => n.clave}
              rows={novedades}
              empty="Sin novedades de camas este día."
              columns={[
                { key: 'cama', label: 'Cama', width: 90 },
                { key: 'novedad', label: 'Novedad', width: 220 },
                { key: 'detalle', label: 'Detalle' },
                { key: 'fecha', label: 'Fecha', width: 150, render: (n) => verFechaHora(n.fecha) },
              ]}
            />
          </Card>
        </Stack>
      </div>
      {dialogo?.tipo === 'cerrar' && <DialogoCerrarCenso servicioId={servicioId} dia={dia} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'reabrir' && <DialogoReabrir servicioId={servicioId} dia={dia} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'alta' && <DialogoEgreso onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'traslado' && <DialogoTraslado onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'confirmar' && <DialogoConfirmarTraslado trasladoId={dialogo.trasladoId} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'nota' && <DialogoNota servicioId={servicioId} dia={dia} fila={dialogo.fila} onCerrar={() => setDialogo(null)} />}
    </Stack></div>
  )
}
