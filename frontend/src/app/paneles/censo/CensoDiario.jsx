import { useState } from 'react'
import { Alert, Badge, Button, Card, DataTable, Grid, Input, PageActions, Stack, StatCard } from '@hrl/core-ui'
import { censoEditable, cuadreCenso, cuadreInventario, ESTADOS_CAMA_MAPA, SOPORTES, estadoCenso, etiqueta, etiquetaEgreso, filasCenso, novedadesCenso, registroCenso } from '../../dominio/consultas.js'
import { corteDelDia, diaDe, edad, verFecha, verFechaHora } from '../../dominio/tiempo.js'
import { nombreMedico } from '../../datos/clinicos.js'
import { DialogoAccion, diaOperativo, nombreServicio, opcionesServicio, useApp, useEnvio } from '../comun.jsx'

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

export function CensoDiario() {
  const { estado, cuenta } = useApp()
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
    { key: 'cie', label: 'CIE-10', group: 'Estadística, desde la HC', width: 74, render: (f) => f.cie10 ?? '' },
    { key: 'medico', label: 'Médico del alta', group: 'Estadística, desde la HC', width: 110, render: (f) => (f.medicoId ? nombreMedico(f.medicoId) : '') },
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
            title={`Censo diario · ${nombreServicio(servicioId)}`}
            subtitle={`${verFecha(dia)}, de 00:00 a 23:59`}
            meta={<Badge label={est.label} tone={est.tono} />}
            wide
          >
            <div className="tabla-censo"><DataTable rowKey={(f) => f.clave} rows={filas} columns={columnas} rowClass={(f) => (f.vacia ? 'fila-vacia' : '')} /></div>
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
      {dialogo?.tipo === 'nota' && <DialogoNota servicioId={servicioId} dia={dia} fila={dialogo.fila} onCerrar={() => setDialogo(null)} />}
    </Stack></div>
  )
}
