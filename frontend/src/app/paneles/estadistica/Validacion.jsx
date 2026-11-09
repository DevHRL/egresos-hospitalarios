import { useState } from 'react'
import { Badge, Button, Card, DataTable, Input, Stack } from '@hrl/core-ui'
import { etiquetaEgreso, inconsistencias, pacientePorId } from '../../dominio/consultas.js'
import { estancia, verFechaHora } from '../../dominio/tiempo.js'
import { nombreMedico } from '../../datos/clinicos.js'
import { DialogoAccion, nombreServicio, useApp, useEnvio } from '../comun.jsx'

function DialogoObservar({ hospitalizacionId, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [motivo, setMotivo] = useState('')
  return (
    <DialogoAccion titulo="Observar egreso" subtitulo="Vuelve a la bandeja de completado con este motivo." textoConfirmar="Observar" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('egreso/observar', { hospitalizacionId, motivo }, 'Egreso observado.')}>
      <Input label="Qué hay que corregir" required autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </DialogoAccion>
  )
}

export function Validacion() {
  const { estado, hacer } = useApp()
  const [observar, setObservar] = useState(null)
  const completos = estado.hospitalizaciones.filter((h) => !h.anulada && h.egreso?.estado === 'completo')
  const lista = inconsistencias(estado, nombreServicio)
  return (
    <div className="panel"><Stack gap={4}>
      <Card title="Egresos por validar" subtitle="Al validarse entran al consolidado y a los indicadores.">
        <DataTable
          rowKey={(h) => h.id}
          rows={completos}
          empty="No hay egresos por validar."
          columns={[
            { key: 'paciente', label: 'Paciente', render: (h) => pacientePorId(estado, h.pacienteId).nombres },
            { key: 'servicio', label: 'Servicio', width: 160, render: (h) => nombreServicio(h.egreso.servicioId) },
            { key: 'ingreso', label: 'Ingreso', width: 140, render: (h) => verFechaHora(h.fechaIngreso) },
            { key: 'egreso', label: 'Egreso', width: 140, render: (h) => verFechaHora(h.egreso.fechaHora) },
            { key: 'estancia', label: 'Estancia', width: 80, align: 'right', render: (h) => estancia(h.fechaIngreso, h.egreso.fechaHora) },
            { key: 'tipo', label: 'Tipo', width: 120, render: (h) => etiquetaEgreso(h.egreso.tipo) },
            { key: 'cie', label: 'CIE-10', width: 80, render: (h) => h.egreso.cie10.join(', ') },
            { key: 'medico', label: 'Médico', width: 150, render: (h) => nombreMedico(h.egreso.medicoId) },
            { key: 'accion', label: '', width: 190, align: 'right', render: (h) => (
              <Stack direction="row" gap={2} justify="end">
                <Button size="sm" tone="ghost" onClick={() => setObservar(h.id)}>Observar</Button>
                <Button size="sm" onClick={() => hacer('egreso/validar', { hospitalizacionId: h.id }, 'Egreso validado.')}>Validar</Button>
              </Stack>
            ) },
          ]}
        />
      </Card>
      <Card title="Inconsistencias detectadas" subtitle="Reglas que el sistema revisa solo.">
        <DataTable
          rowKey={(x) => x.clave}
          rows={lista}
          empty="No hay inconsistencias."
          columns={[
            { key: 'regla', label: 'Regla', width: 220, render: (x) => <Badge label={x.regla} tone={x.tono} /> },
            { key: 'detalle', label: 'Detalle' },
          ]}
        />
      </Card>
      {observar && <DialogoObservar hospitalizacionId={observar} onCerrar={() => setObservar(null)} />}
    </Stack></div>
  )
}
