import { useState } from 'react'
import { Alert, Badge, Button, Card, DataTable, Grid, Input, PageActions, Stack, StatCard } from '@hrl/core-ui'
import { ESTADOS_EGRESO, cuadreCenso, diasDesdeArranque, estadoCenso, etiquetaEgreso, indicadoresDelMes, pacientePorId, renoxiDelDia, resumenCamas, serviciosConCamas } from '../../dominio/consultas.js'
import { diaDe, estancia, mesDe, sumarDias, verFecha, verFechaHora } from '../../dominio/tiempo.js'
import { nombreMedico } from '../../datos/clinicos.js'
import { nombreServicio, useApp } from '../comun.jsx'

const n1 = (v) => (v === null ? '—' : v.toLocaleString('es-PE', { maximumFractionDigits: 1 }))

export function Consolidado() {
  const { estado } = useApp()
  const mes = mesDe(estado.ahora)
  const servicios = serviciosConCamas(estado)
  const filas = diasDesdeArranque(estado, mes).flatMap((dia) => servicios.map((servicioId) => ({ clave: `${dia}${servicioId}`, dia, servicioId, c: cuadreCenso(estado, servicioId, dia), est: estadoCenso(estado, servicioId, dia) }))).reverse()
  const egresos = estado.hospitalizaciones.filter((h) => !h.anulada && h.egreso && mesDe(h.egreso.fechaHora) === mes).sort((a, b) => (a.egreso.fechaHora < b.egreso.fechaHora ? 1 : -1))
  const num = (k, label) => ({ key: k, label, width: 90, align: 'right', render: (f) => f.c[k] })
  return (
    <div className="panel"><Stack gap={4}>
      <Card title="Censos por día y servicio" subtitle="Una sola fuente de pacientes-día para RENOXI y DIRESA.">
        <DataTable rowKey={(f) => f.clave} rows={filas} columns={[
          { key: 'dia', label: 'Día', width: 110, render: (f) => verFecha(f.dia) },
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.servicioId) },
          num('saldoAnterior', 'Saldo ant.'), num('ingresos', 'Ingresos'), num('trasladosEntran', 'Tras. entran'), num('egresos', 'Egresos'), num('trasladosSalen', 'Tras. salen'), num('pacientesCorte', 'Al corte'), num('pacientesDia', 'Pac.-día'),
          { key: 'estado', label: 'Censo', width: 110, render: (f) => <Badge label={f.est.label} tone={f.est.tono} /> },
        ]} />
      </Card>
      <Card title="Egresos del mes" subtitle="Solo los validados cuentan en los indicadores.">
        <DataTable rowKey={(h) => h.id} rows={egresos} empty="Sin egresos este mes." columns={[
          { key: 'egreso', label: 'Egreso', width: 140, render: (h) => verFechaHora(h.egreso.fechaHora) },
          { key: 'paciente', label: 'Paciente', render: (h) => pacientePorId(estado, h.pacienteId).nombres },
          { key: 'servicio', label: 'Servicio', width: 160, render: (h) => nombreServicio(h.egreso.servicioId) },
          { key: 'tipo', label: 'Tipo', width: 200, render: (h) => etiquetaEgreso(h.egreso.tipo) },
          { key: 'estancia', label: 'Estancia', width: 80, align: 'right', render: (h) => estancia(h.fechaIngreso, h.egreso.fechaHora) },
          { key: 'cie', label: 'CIE-10', width: 80, render: (h) => h.egreso.cie10?.join(', ') || '—' },
          { key: 'medico', label: 'Médico', width: 150, render: (h) => (h.egreso.medicoId ? nombreMedico(h.egreso.medicoId) : '—') },
          { key: 'estado', label: 'Estado', width: 140, render: (h) => (h.egreso.estado ? <Badge label={ESTADOS_EGRESO[h.egreso.estado].label} tone={ESTADOS_EGRESO[h.egreso.estado].tono} /> : <Badge label="No es egreso" tone="none" />) },
        ]} />
      </Card>
    </Stack></div>
  )
}

const GRUPO_RENOXI = { 'medicina-intermedios': 'Intermedios (con/sin O2)', 'medicina-b': 'Hospitalización adultos (con/sin O2)' }

export function Renoxi() {
  const { estado, cuenta, hacer } = useApp()
  const [diaElegido, setDia] = useState(null)
  const dia = diaElegido ?? sumarDias(diaDe(estado.ahora), -1)
  const filas = renoxiDelDia(estado, dia)
  const cargado = estado.renoxi[dia]
  const mes = mesDe(dia)
  const cargados = Object.keys(estado.renoxi).filter((d) => mesDe(d) === mes).length
  const puede = ['camas', 'jefatura'].includes(cuenta.rol)
  return (
    <div className="panel"><Stack gap={4}>
      <PageActions>{puede && <Button icon="sh-check" disabled={Boolean(cargado)} onClick={() => hacer('renoxi/marcar', { dia }, 'Día marcado como cargado.')}>Marcar como cargado</Button>}</PageActions>
      <Grid min={180} gap={3}>
        <StatCard label="Días cargados este mes" value={`${cargados} / 20`} severity={cargados >= 20 ? 'normal' : 'neutral'} note="RENOXI pide al menos 20 días" />
        <StatCard label="Estado del día" value={cargado ? 'Cargado' : 'Sin cargar'} note={cargado ? verFechaHora(cargado.cargadoEn) : verFecha(dia)} />
      </Grid>
      <Card title={`RENOXI del ${verFecha(dia)}`} subtitle="En el mismo orden del formulario web." actions={<Input label="Día" labelHidden kind="date" value={dia} onChange={(e) => setDia(e.target.value)} />}>
        <DataTable rowKey={(f) => f.servicioId} rows={[...filas].sort((a, b) => GRUPO_RENOXI[a.servicioId].localeCompare(GRUPO_RENOXI[b.servicioId]) * -1)} columns={[
          { key: 'grupo', label: 'Grupo', width: 280, render: (f) => GRUPO_RENOXI[f.servicioId] },
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.servicioId) },
          { key: 'camas', label: 'Camas', width: 80, align: 'right' },
          { key: 'operativas', label: 'Operativas', width: 100, align: 'right' },
          { key: 'sinO2', label: 'Sin O2', width: 80, align: 'right' },
          { key: 'conO2', label: 'Con O2', width: 80, align: 'right' },
          { key: 'ocupadas', label: 'Ocupadas', width: 90, align: 'right' },
          { key: 'disponibles', label: 'Disponibles', width: 100, align: 'right' },
        ]} />
      </Card>
    </Stack></div>
  )
}

export function Indicadores() {
  const { estado, cuenta } = useApp()
  const mes = mesDe(estado.ahora)
  const r = indicadoresDelMes(estado, mes)
  const filas = [...r.filas, r.total]
  const col = (k, label, tooltip) => ({ key: k, label, tooltip, width: 86, align: 'right', render: (f) => n1(f[k]) })
  return (
    <div className="panel"><Stack gap={4}>
      <PageActions>{cuenta.rol === 'jefatura' && <Button tone="ghost" icon="sh-stamp" disabled>Cerrar mes</Button>}</PageActions>
      <Alert tone="info" title="Datos parciales de la demostración">
        Solo incluye Medicina B e Intermedios con sus camas reales. D usa los días con censo cerrado ({r.total.diasConCenso} de {r.diasDelMes}): al completarse el mes es igual a A × días del mes. La comparación con las 42 camas oficiales requiere también Medicina A. El cierre se habilita cuando termina el mes.
      </Alert>
      <Card title={`Indicadores de ${mes}`} subtitle="B sale solo de censos cerrados. E y C, solo de egresos validados.">
        <DataTable rowKey={(f) => f.servicioId} rows={filas} columns={[
          { key: 'servicio', label: 'Servicio', render: (f) => (f.servicioId === 'total' ? <strong>Total</strong> : nombreServicio(f.servicioId)) },
          col('A', 'A', 'N° de camas'), col('B', 'B', 'Pacientes-día'), col('C', 'C', 'Días de estancia de los egresados'), col('D', 'D', 'Días-cama disponibles'), col('E', 'E', 'Egresos'), col('F', 'F', 'Promedio de permanencia (C / E)'), col('G', 'G %', '% de ocupación (B × 100 / D)'), col('H', 'H', 'Rendimiento de cama (E / A)'), col('I', 'I', 'Intervalo de sustitución ((D − B) / E)'),
        ]} />
      </Card>
    </Stack></div>
  )
}

export function Tablero() {
  const { estado, cuenta } = useApp()
  const total = resumenCamas(estado, cuenta.servicios)
  const filas = cuenta.servicios.map((id) => ({ id, ...resumenCamas(estado, [id]) }))
  const pct = (o, t) => (t ? `${Math.round((o * 100) / t)} %` : '—')
  return (
    <div className="panel"><Stack gap={4}>
      <Grid min={290} gap={3}>
        <StatCard label="Ocupación" value={pct(total.ocupadas, total.operativas)} note={`${total.ocupadas} de ${total.operativas} operativas`} />
        <StatCard label="Disponibles" value={total.disponibles} />
        <StatCard label="Con O2" value={total.conO2} />
        <StatCard label="Fuera de servicio" value={total.fuera} severity={total.fuera ? 'suspect' : 'normal'} />
      </Grid>
      <Card title="Por servicio" subtitle="Solo lectura, sin datos personales.">
        <DataTable rowKey={(f) => f.id} rows={filas} columns={[
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.id) },
          { key: 'total', label: 'Camas', width: 90, align: 'right' },
          { key: 'operativas', label: 'Operativas', width: 100, align: 'right' },
          { key: 'ocupadas', label: 'Ocupadas', width: 100, align: 'right' },
          { key: 'disponibles', label: 'Disponibles', width: 100, align: 'right' },
          { key: 'conO2', label: 'Con O2', width: 90, align: 'right' },
          { key: 'fuera', label: 'Fuera de servicio', width: 130, align: 'right' },
          { key: 'pct', label: 'Ocupación', width: 100, align: 'right', render: (f) => pct(f.ocupadas, f.operativas) },
        ]} />
      </Card>
    </Stack></div>
  )
}
