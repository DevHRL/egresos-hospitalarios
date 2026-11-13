import { useEffect, useMemo, useState } from 'react'
import { Alert, AppShell, Toast } from '@hrl/core-ui'
import { CLAVE_PREFERENCIAS, CLAVE_TEMA } from './tema.js'
import { MODULOS, cuentaPorId, CUENTAS } from './datos/cuentas.js'
import { cambiarCuenta, cerrarCensosPendientes, cerrarSesion, conectar, despachar, haySesion, moverReloj, reiniciarDemo, useEstado, useSinConexion } from './datos/tienda.js'
import { ordenesPendientes } from './datos/admision.js'
import { mesDe, proximaHora, sumarDias, sumarHoras, verFechaHora } from './dominio/tiempo.js'
import { ContextoApp } from './paneles/comun.jsx'
import { Acceso, CuentasBitacora } from './paneles/prototipo/Prototipo.jsx'
import { Ordenes } from './paneles/admision/Ordenes.jsx'
import { MapaCamas } from './paneles/camas/MapaCamas.jsx'
import { MovimientosDia } from './paneles/camas/MovimientosDia.jsx'
import { CensoDiario } from './paneles/censo/CensoDiario.jsx'
import { Recepcion } from './paneles/estadistica/Recepcion.jsx'
import { Completado } from './paneles/estadistica/Completado.jsx'
import { Validacion } from './paneles/estadistica/Validacion.jsx'
import { Consolidado, Indicadores, Renoxi, Tablero } from './paneles/reportes/Reportes.jsx'
import { OrdenesCama } from './paneles/mantenimiento/OrdenesCama.jsx'
import { BuscarPaciente } from './paneles/pacientes/BuscarPaciente.jsx'

const PANELES = {
  ordenes: Ordenes,
  mapa: MapaCamas,
  movimientos: MovimientosDia,
  censo: CensoDiario,
  recepcion: Recepcion,
  completado: Completado,
  validacion: Validacion,
  consolidado: Consolidado,
  renoxi: Renoxi,
  indicadores: Indicadores,
  mantenimiento: OrdenesCama,
  tablero: Tablero,
  cuentas: CuentasBitacora,
  pacientes: BuscarPaciente,
}

/* Lo que espera a cada cuenta, para el contador del menú. */
function pendientes(estado, cuenta) {
  const egresos = estado.hospitalizaciones.filter((h) => !h.anulada && h.egreso?.estado)
  const camasDe = (o) => cuenta.servicios.includes(estado.camas.find((c) => c.id === o.camaId).servicioId)
  return {
    ordenes: cuenta.rol === 'admision' ? estado.ordenes.filter((o) => o.estado === 'pendiente').length : 0,
    mapa: (cuenta.designa?.length ? ordenesPendientes(estado, cuenta.servicios).length : 0)
      + (cuenta.rol === 'enfermeria'
        ? estado.traslados.filter((t) => t.estado === 'pendiente' && cuenta.servicios.includes(t.servicioDestino)).length + estado.ordenesCama.filter((o) => o.estado === 'por_recibir' && camasDe(o)).length
        : 0),
    completado: egresos.filter((h) => ['pendiente_hc', 'observado'].includes(h.egreso.estado)).length,
    validacion: egresos.filter((h) => h.egreso.estado === 'completo').length,
    mantenimiento: estado.ordenesCama.filter((o) => ['pendiente_retiro', 'en_reparacion', 'lista_entrega'].includes(o.estado)).length,
  }
}

const CLAVE_SESION = 'egresos_prototipo_cuenta'

function leerSesion() {
  try {
    return haySesion() ? cuentaPorId(sessionStorage.getItem(CLAVE_SESION)) : null
  } catch {
    return null
  }
}

function guardarSesion(id) {
  try {
    if (id) sessionStorage.setItem(CLAVE_SESION, id)
    else sessionStorage.removeItem(CLAVE_SESION)
  } catch {
    /* Sin almacenamiento la sesión dura lo que dure la pestaña. */
  }
}

export default function App() {
  const estado = useEstado()
  const sinConexion = useSinConexion()
  const [cuenta, setCuenta] = useState(leerSesion)
  const [modulo, setModulo] = useState(null)
  const [toast, setToast] = useState(null)
  const cuentaId = cuenta?.id ?? null

  const salir = () => {
    cerrarSesion()
    guardarSesion(null)
    setCuenta(null)
  }

  useEffect(() => {
    if (!cuentaId) return undefined
    return conectar(salir)
  }, [cuentaId])

  /* Al entrar, cada cuenta abre en su primer módulo: el plano 3D. */
  const entrar = async (id) => {
    if (cuenta && cuenta.id !== id) await cambiarCuenta(id)
    guardarSesion(id)
    setCuenta(cuentaPorId(id))
    setModulo(null)
  }

  const contexto = useMemo(() => ({
    estado,
    cuenta,
    hacer: async (tipo, datos = {}, aviso) => {
      const mensaje = await despachar({ tipo, ...datos })
      if (mensaje) setToast(mensaje)
      else if (aviso) setToast(aviso)
      return mensaje
    },
  }), [estado, cuenta])

  if (!cuenta) return <Acceso onEntrar={entrar} />
  if (!estado) {
    return (
      <div className="panel">
        {sinConexion ? <Alert tone="error" title="Sin conexión con el servidor">{sinConexion} Revisa que la API y la base estén encendidas.</Alert> : <p className="texto-apoyo">Cargando…</p>}
      </div>
    )
  }

  const cuentas = pendientes(estado, cuenta)
  const navItems = cuenta.modulos.map((id) => ({ id, label: MODULOS[id].label, icon: MODULOS[id].icono, group: MODULOS[id].grupo, badge: cuentas[id] || undefined }))
  const activo = cuenta.modulos.includes(modulo) ? modulo : cuenta.modulos[0]
  const Panel = PANELES[activo]

  /* El reloj de la demostración ya no ocupa una fila sobre la pantalla
     (2026-11-12): vive en el menú de la cuenta, solo en desarrollo. */
  const mover = (ahora) => async () => {
    await moverReloj(ahora)
    setToast(`Hora de la demostración: ${verFechaHora(ahora)}.`)
  }
  const relojDemo = [
    { id: 'sep-reloj', separator: true },
    { id: 'hora', label: `+1 hora (ahora ${verFechaHora(estado.ahora)})`, icon: 'sh-clock', onSelect: mover(sumarHoras(estado.ahora, 1)) },
    { id: 'medianoche', label: 'Ir a las 00:00', icon: 'sh-clock', onSelect: mover(proximaHora(estado.ahora, '00:00')) },
    { id: 'recojo', label: 'Ir a las 08:00', icon: 'sh-clock', onSelect: mover(proximaHora(estado.ahora, '08:00')) },
    { id: 'mes', label: 'Ir al mes siguiente', icon: 'sh-clock', onSelect: mover(`${sumarDias(`${mesDe(estado.ahora)}-28`, 4).slice(0, 7)}-01T09:00`) },
    { id: 'censos', label: 'Cerrar censos pendientes', icon: 'sh-table', onSelect: async () => setToast(`Censos cerrados: ${await cerrarCensosPendientes()}.`) },
  ]

  const accountItems = [
    ...CUENTAS.filter((c) => c.id !== cuenta.id).map((c) => ({ id: c.id, label: `Entrar como ${c.nombre}`, icon: 'sh-profile', onSelect: () => entrar(c.id) })),
    ...(estado.modoDemo ? relojDemo : []),
    { id: 'sep', separator: true },
    ...(estado.modoDemo ? [{ id: 'reiniciar', label: 'Reiniciar demostración', icon: 'sh-swap', tone: 'danger', onSelect: async () => { await reiniciarDemo(); setToast('Demostración reiniciada.') } }] : []),
  ]

  return (
    <ContextoApp.Provider value={contexto}>
      <AppShell
        navItems={navItems}
        active={activo}
        onSelect={setModulo}
        title={MODULOS[activo].encabezadoPropio ? undefined : MODULOS[activo].label}
        subtitle={MODULOS[activo].encabezadoPropio ? undefined : MODULOS[activo].subtitulo}
        brand="Egresos Hospitalarios"
        themeKey={CLAVE_TEMA}
        preferencesKey={CLAVE_PREFERENCIAS}
        user={{ name: cuenta.nombre, role: cuenta.rolLabel }}
        accountItems={accountItems}
        onSignOut={salir}
      >
        <Panel />
      </AppShell>
      <Toast message={toast} onClose={() => setToast(null)} />
    </ContextoApp.Provider>
  )
}
