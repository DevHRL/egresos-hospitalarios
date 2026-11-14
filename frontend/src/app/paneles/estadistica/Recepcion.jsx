import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Stack } from '@hrl/core-ui'
import { cuadreCenso, estadoCenso, registroCenso, serviciosConCamas } from '../../dominio/consultas.js'
import { sumarDias, diaDe, verFecha, verFechaHora } from '../../dominio/tiempo.js'
import { nombreServicio, useApp } from '../comun.jsx'
import { DialogoCerrarCenso } from '../censo/CensoDiario.jsx'

export function Recepcion() {
  const { estado } = useApp()
  const [diaElegido, setDia] = useState(null)
  const [cerrar, setCerrar] = useState(null)
  /* Lo que Estadística recoge hoy es el censo de ayer. */
  const dia = diaElegido ?? sumarDias(diaDe(estado.ahora), -1)
  const servicios = serviciosConCamas(estado)
  const filas = servicios.map((servicioId) => ({ servicioId, c: cuadreCenso(estado, servicioId, dia), est: estadoCenso(estado, servicioId, dia), r: registroCenso(estado, servicioId, dia) }))
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
      {cerrar && <DialogoCerrarCenso servicioId={cerrar} dia={dia} onCerrar={() => setCerrar(null)} />}
    </Stack></div>
  )
}
