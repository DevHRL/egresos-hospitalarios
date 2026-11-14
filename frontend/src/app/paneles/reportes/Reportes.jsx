import { useState } from 'react'
import { Alert, Badge, Button, Card, DataTable, Grid, Input, PageActions, Stack, StatCard } from '@hrl/core-ui'
import { ESTADOS_EGRESO, cuadreCenso, diasDesdeArranque, estadoCenso, etiquetaEgreso, indicadoresDelMes, pacientePorId, renoxiDelDia, resumenCamas, serviciosConCamas, totalIndicadores } from '../../dominio/consultas.js'
import { diaDe, estancia, mesDe, sumarDias, verFecha, verFechaHora } from '../../dominio/tiempo.js'
import { nombreMedico } from '../../datos/clinicos.js'
import { DialogoAccion, nombreServicio, opcionesServicio, useApp, useEnvio } from '../comun.jsx'

const n1 = (v) => (v === null ? '—' : v.toLocaleString('es-PE', { maximumFractionDigits: 1 }))

export function Consolidado() {
  const { estado } = useApp()
  const mes = mesDe(estado.ahora)
  const servicios = serviciosConCamas(estado)
  const filas = servicios.flatMap((servicioId) => diasDesdeArranque(estado, mes, servicioId).map((dia) => ({ clave: `${dia}${servicioId}`, dia, servicioId, c: cuadreCenso(estado, servicioId, dia), est: estadoCenso(estado, servicioId, dia) }))).sort((a, b) => (a.dia < b.dia ? 1 : -1))
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
      <Card title="Egresos del mes" subtitle="Cuentan desde que el área registra el alta. Validar es requisito para cerrar el mes.">
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

/* Los grupos del formulario, en su orden (estructura del Excel diario de camas).
   UCI Cirugía y Quemados van en «Otros», como en ese Excel. */
const GRUPOS_RENOXI = ['UCI (con o sin VM)', 'Intermedios (con o sin O2)', 'Hospitalización adultos (con o sin O2)', 'Hospitalización pediátrica', 'UPSS Emergencia', 'Otros']
const GRUPO_RENOXI = {
  'cuidados-criticos': 0,
  'uci-pediatria': 0,
  'medicina-intermedios': 1,
  'medicina-a': 2,
  'medicina-b': 2,
  'uci-cirugia': 5,
  quemados: 5,
}
const ordenRenoxi = (servicioId) => GRUPO_RENOXI[servicioId] ?? GRUPOS_RENOXI.length
const grupoRenoxi = (servicioId) => GRUPOS_RENOXI[ordenRenoxi(servicioId)] ?? 'Sin fila asignada'
const filasRenoxi = (estado, dia) => [...renoxiDelDia(estado, dia)].sort((a, b) => ordenRenoxi(a.servicioId) - ordenRenoxi(b.servicioId) || nombreServicio(a.servicioId).localeCompare(nombreServicio(b.servicioId), 'es'))

const COLUMNAS_CSV = [['camas', 'Camas'], ['operativas', 'Operativas'], ['sinO2', 'Sin O2'], ['conO2', 'Con O2'], ['conVM', 'Con VM'], ['ocupadas', 'Ocupadas'], ['disponibles', 'Disponibles']]

/* CSV con punto y coma y BOM: Excel en español lo abre directo, con tildes. */
function descargarCsv(nombre, dias, estado) {
  const linea = (celdas) => celdas.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';')
  const filas = [linea(['Día', 'Grupo', 'Servicio', ...COLUMNAS_CSV.map(([, t]) => t)])]
  for (const dia of dias) {
    for (const f of filasRenoxi(estado, dia)) filas.push(linea([dia, grupoRenoxi(f.servicioId), nombreServicio(f.servicioId), ...COLUMNAS_CSV.map(([k]) => f[k])]))
  }
  const url = URL.createObjectURL(new Blob([`\ufeff${filas.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

/* Días del mes con censo ya cerrado o pasado: hasta ayer. */
function diasDelMesHastaAyer(estado, mes) {
  const ayer = sumarDias(diaDe(estado.ahora), -1)
  const dias = []
  for (let d = `${mes}-01`; mesDe(d) === mes && d <= ayer; d = sumarDias(d, 1)) dias.push(d)
  return dias
}

export function Renoxi() {
  const { estado, cuenta, hacer } = useApp()
  const [diaElegido, setDia] = useState(null)
  const dia = diaElegido ?? sumarDias(diaDe(estado.ahora), -1)
  const filas = filasRenoxi(estado, dia)
  const cargado = estado.renoxi[dia]
  const mes = mesDe(dia)
  const cargados = Object.keys(estado.renoxi).filter((d) => mesDe(d) === mes).length
  const puede = ['camas', 'jefatura'].includes(cuenta.rol)
  return (
    <div className="panel"><Stack gap={4}>
      <PageActions>
        <Button tone="ghost" icon="sh-export" onClick={() => descargarCsv(`renoxi-${dia}.csv`, [dia], estado)}>Descargar el día</Button>
        <Button tone="ghost" icon="sh-export" onClick={() => descargarCsv(`renoxi-${mes}.csv`, diasDelMesHastaAyer(estado, mes), estado)}>Descargar el mes</Button>
        {puede && <Button icon="sh-check" disabled={Boolean(cargado)} onClick={() => hacer('renoxi/marcar', { dia }, 'Día marcado como cargado.')}>Marcar como cargado</Button>}
      </PageActions>
      <Grid min={180} gap={3}>
        <StatCard label="Días cargados este mes" value={`${cargados} / 20`} severity={cargados >= 20 ? 'normal' : 'neutral'} note="RENOXI pide al menos 20 días" />
        <StatCard label="Estado del día" value={cargado ? 'Cargado' : 'Sin cargar'} note={cargado ? verFechaHora(cargado.cargadoEn) : verFecha(dia)} />
      </Grid>
      <Card title={`RENOXI del ${verFecha(dia)}`} subtitle="En el mismo orden del formulario web." actions={<Input label="Día" labelHidden kind="date" value={dia} onChange={(e) => setDia(e.target.value)} />}>
        <DataTable rowKey={(f) => f.servicioId} rows={filas} columns={[
          { key: 'grupo', label: 'Grupo', width: 280, render: (f) => grupoRenoxi(f.servicioId) },
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.servicioId) },
          { key: 'camas', label: 'Camas', width: 80, align: 'right' },
          { key: 'operativas', label: 'Operativas', width: 100, align: 'right' },
          { key: 'sinO2', label: 'Sin O2', width: 80, align: 'right' },
          { key: 'conO2', label: 'Con O2', width: 80, align: 'right' },
          { key: 'conVM', label: 'Con VM', width: 80, align: 'right' },
          { key: 'ocupadas', label: 'Ocupadas', width: 90, align: 'right' },
          { key: 'disponibles', label: 'Disponibles', width: 100, align: 'right' },
        ]} />
      </Card>
    </Stack></div>
  )
}

/* Meses desde el arranque hasta el actual, el más reciente primero. */
function mesesDisponibles(estado) {
  const fin = mesDe(estado.ahora)
  const lista = []
  for (let m = mesDe(estado.arranque); m <= fin; m = sumarDias(`${m}-28`, 4).slice(0, 7)) lista.push(m)
  return lista.reverse()
}

const VARIABLES_AJUSTE = [{ value: 'A', label: 'A: N° de camas' }, { value: 'B', label: 'B: Pacientes-día' }, { value: 'C', label: 'C: Días de estancia' }, { value: 'D', label: 'D: Días-cama' }, { value: 'E', label: 'E: Egresos' }]

function DialogoAjuste({ mes, servicios, onCerrar }) {
  const { error, enviar } = useEnvio(onCerrar)
  const [servicioId, setServicio] = useState(servicios[0] ?? '')
  const [variable, setVariable] = useState('E')
  const [valorCorregido, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  return (
    <DialogoAccion titulo={`Ajuste de ${mes}`} subtitulo="La cifra cerrada no cambia: el ajuste se muestra junto a ella." textoConfirmar="Registrar ajuste" onCerrar={onCerrar} error={error} onConfirmar={() => enviar('mes/ajustar', { mes, servicioId, variable, valorCorregido, motivo }, 'Ajuste registrado.')}>
      <Input label="Servicio" kind="select" value={servicioId} onChange={(e) => setServicio(e.target.value)} options={opcionesServicio(servicios)} />
      <Input label="Variable" kind="select" value={variable} onChange={(e) => setVariable(e.target.value)} options={VARIABLES_AJUSTE} />
      <Input label="Valor corregido" required value={valorCorregido} onChange={(e) => setValor(e.target.value)} />
      <Input label="Motivo" required value={motivo} onChange={(e) => setMotivo(e.target.value)} />
    </DialogoAccion>
  )
}

export function Indicadores() {
  const { estado, cuenta, hacer } = useApp()
  const [elegido, setElegido] = useState(null)
  const [ajustar, setAjustar] = useState(false)
  const mes = elegido ?? mesDe(estado.ahora)
  const cerrado = estado.mesesCerrados.includes(mes)
  const congeladas = estado.indicadoresCerrados?.[mes]
  const calculado = indicadoresDelMes(estado, mes)
  const base = cerrado && congeladas ? congeladas : calculado.filas
  const total = cerrado && congeladas ? totalIndicadores(congeladas) : calculado.total
  const filas = [...base, total]
  const ajustes = (estado.ajustes ?? []).filter((a) => a.mes === mes)
  const jefatura = cuenta.rol === 'jefatura'
  const col = (k, label, tooltip) => ({ key: k, label, tooltip, width: 86, align: 'right', render: (f) => n1(f[k]) })
  return (
    <div className="panel"><Stack gap={4}>
      <PageActions>
        {jefatura && !cerrado && <Button icon="sh-stamp" disabled={mes >= mesDe(estado.ahora)} onClick={() => hacer('mes/cerrar', { mes }, `Mes ${mes} cerrado.`)}>Cerrar mes</Button>}
        {jefatura && cerrado && <Button tone="ghost" icon="sh-pencil" onClick={() => setAjustar(true)}>Registrar ajuste</Button>}
      </PageActions>
      <Alert tone="info" title={cerrado ? 'Mes cerrado' : 'Mes abierto'}>
        {cerrado
          ? 'Estas son las cifras fijadas al cerrar. Un cambio posterior en el plano o la dotación no las altera.'
          : `D usa los días con censo cerrado (${total.diasConCenso} de ${calculado.diasDelMes}): al completarse el mes es igual a A × días del mes. El cierre se habilita cuando termina el mes.`}
      </Alert>
      <Card title={`Indicadores de ${mes}`} subtitle="Se calculan solos. B sale de los censos cerrados; E y C, de las altas que registró cada área." actions={<Input label="Mes" labelHidden kind="select" value={mes} onChange={(e) => setElegido(e.target.value)} options={mesesDisponibles(estado).map((m) => ({ value: m, label: m }))} />}>
        <DataTable rowKey={(f) => f.servicioId} rows={filas} columns={[
          { key: 'servicio', label: 'Servicio', render: (f) => (f.servicioId === 'total' ? <strong>Total</strong> : nombreServicio(f.servicioId)) },
          col('A', 'A', 'N° de camas'), col('B', 'B', 'Pacientes-día'), col('C', 'C', 'Días de estancia de los egresados'), col('D', 'D', 'Días-cama disponibles'), col('E', 'E', 'Egresos'), col('F', 'F', 'Promedio de permanencia (C / E), sin fechas estimadas'), col('G', 'G %', '% de ocupación (B × 100 / D)'), col('H', 'H', 'Rendimiento de cama (E / A)'), col('I', 'I', 'Intervalo de sustitución ((D − B) / E)'),
        ]} />
      </Card>
      {cerrado && (
        <Card title="Ajustes posteriores al cierre" subtitle="Correcciones con motivo. No modifican la cifra reportada.">
          <DataTable rowKey={(a) => a.id} rows={ajustes} empty="Sin ajustes en este mes." columns={[
            { key: 'fecha', label: 'Fecha', width: 150, render: (a) => verFechaHora(a.fecha) },
            { key: 'servicio', label: 'Servicio', width: 200, render: (a) => nombreServicio(a.servicioId) },
            { key: 'variable', label: 'Variable', width: 90 },
            { key: 'valorCorregido', label: 'Valor corregido', width: 130, align: 'right' },
            { key: 'motivo', label: 'Motivo' },
          ]} />
        </Card>
      )}
      {ajustar && <DialogoAjuste mes={mes} servicios={base.map((f) => f.servicioId)} onCerrar={() => setAjustar(false)} />}
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
        <StatCard label="Con VM" value={total.conVM} />
        <StatCard label="En mantenimiento" value={total.fuera} severity={total.fuera ? 'suspect' : 'normal'} />
      </Grid>
      <Card title="Por servicio" subtitle="Solo lectura, sin datos personales.">
        <DataTable rowKey={(f) => f.id} rows={filas} columns={[
          { key: 'servicio', label: 'Servicio', render: (f) => nombreServicio(f.id) },
          { key: 'total', label: 'Camas', width: 90, align: 'right' },
          { key: 'operativas', label: 'Operativas', width: 100, align: 'right' },
          { key: 'ocupadas', label: 'Ocupadas', width: 100, align: 'right' },
          { key: 'disponibles', label: 'Disponibles', width: 100, align: 'right' },
          { key: 'conO2', label: 'Con O2', width: 90, align: 'right' },
          { key: 'fuera', label: 'En mantenimiento', width: 130, align: 'right' },
          { key: 'pct', label: 'Ocupación', width: 100, align: 'right', render: (f) => pct(f.ocupadas, f.operativas) },
        ]} />
      </Card>
    </Stack></div>
  )
}
