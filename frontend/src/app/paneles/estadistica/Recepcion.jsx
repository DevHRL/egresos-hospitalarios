import { useState } from 'react'
import { Alert, Badge, Button, Card, DataTable, Input, Stack } from '@hrl/core-ui'
import { ESTADOS_HC, cuadreCenso, estadoCenso, etiquetaEgreso, pacientePorId, registroCenso, serviciosConCamas } from '../../dominio/consultas.js'
import { sumarDias, diaDe, verFecha, verFechaHora } from '../../dominio/tiempo.js'
import { nombreServicio, useApp } from '../comun.jsx'
import { DialogoCerrarCenso } from '../censo/CensoDiario.jsx'

export function Recepcion() {
  const { estado, hacer } = useApp()
  const [diaElegido, setDia] = useState(null)
  const [hc, setHc] = useState('')
  const [error, setError] = useState(null)
  const [cerrar, setCerrar] = useState(null)
  /* Lo que Estadística recoge hoy es el censo de ayer. */
  const dia = diaElegido ?? sumarDias(diaDe(estado.ahora), -1)
  const servicios = serviciosConCamas(estado)
  const filas = servicios.map((servicioId) => ({ servicioId, c: cuadreCenso(estado, servicioId, dia), est: estadoCenso(estado, servicioId, dia), r: registroCenso(estado, servicioId, dia) }))
  const conHC = estado.hospitalizaciones.filter((h) => !h.anulada && h.egreso?.hc).sort((a, b) => (a.egreso.fechaHora < b.egreso.fechaHora ? 1 : -1))
  const recibir = async () => {
    const mensaje = await hacer('hc/recibir', { hc }, `HC ${hc} recibida.`)
    setError(mensaje)
    if (!mensaje) setHc('')
  }
  return (
    <div className="panel"><Stack gap={4}>
      <Card title={`Censos del ${verFecha(dia)}`} subtitle="Reemplaza el recojo del papel a las 08:00." actions={<Input label="Día" labelHidden kind="date" value={dia} onChange={(e) => setDia(e.target.value)} />}>
        <DataTable
          rowKey={(f) => f.servicioId}
          rows={filas}
          columns={[
            { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.servicioId) },
            { key: 'estado', label: 'Estado', width: 120, render: (f) => <Badge label={f.est.label} tone={f.est.tono} /> },
            { key: 'corte', label: 'Pacientes al corte', width: 130, align: 'right', render: (f) => f.c.pacientesCorte },
            { key: 'conteo', label: 'Conteo físico', width: 110, align: 'right', render: (f) => f.r?.conteoFisico ?? '—' },
            { key: 'egresos', label: 'Egresos', width: 80, align: 'right', render: (f) => f.c.egresos },
            { key: 'obs', label: 'Observación', render: (f) => f.r?.observacion || '—' },
            { key: 'cerrado', label: 'Cerrado', width: 150, render: (f) => verFechaHora(f.r?.cerradoEn) },
            { key: 'accion', label: '', width: 150, align: 'right', render: (f) => (['sin_cerrar', 'por_cerrar', 'reabierto'].includes(f.est.valor) ? <Button size="sm" tone="ghost" onClick={() => setCerrar(f.servicioId)}>Cerrar por el área</Button> : null) },
          ]}
        />
      </Card>
      <Card title="Historias clínicas físicas" subtitle="Escanea o escribe cada N° de HC que llega. Así se sabe cuáles faltan y de qué servicio.">
        <Stack gap={3}>
          <div className="fila-accion" onKeyDown={(e) => { if (e.key === 'Enter') recibir() }}>
            <Input label="N° de HC recibida" autoFocus value={hc} onChange={(e) => setHc(e.target.value)} />
            <Button onClick={recibir}>Recibir</Button>
          </div>
          {error && <Alert tone="error" title="No se pudo recibir">{error}</Alert>}
          <DataTable
            rowKey={(h) => h.id}
            rows={conHC}
            empty="No hay egresos todavía."
            columns={[
              { key: 'hc', label: 'N° HC', width: 100, render: (h) => pacientePorId(estado, h.pacienteId).hc },
              { key: 'paciente', label: 'Paciente', render: (h) => pacientePorId(estado, h.pacienteId).nombres },
              { key: 'servicio', label: 'Servicio', width: 170, render: (h) => nombreServicio(h.egreso.servicioId) },
              { key: 'egreso', label: 'Egreso', width: 150, render: (h) => verFechaHora(h.egreso.fechaHora) },
              { key: 'tipo', label: 'Tipo', width: 150, render: (h) => etiquetaEgreso(h.egreso.tipo) },
              { key: 'estado', label: 'HC', width: 190, render: (h) => <Badge label={ESTADOS_HC[h.egreso.hc]} tone={h.egreso.hc === 'pendiente_entrega' ? 'warn' : 'ok'} /> },
              { key: 'accion', label: '', width: 130, align: 'right', render: (h) => (h.egreso.hc === 'completada' ? <Button size="sm" tone="ghost" onClick={() => hacer('hc/devolver', { hospitalizacionId: h.id }, 'HC devuelta a archivo.')}>A archivo</Button> : null) },
            ]}
          />
        </Stack>
      </Card>
      {cerrar && <DialogoCerrarCenso servicioId={cerrar} dia={dia} onCerrar={() => setCerrar(null)} />}
    </Stack></div>
  )
}
