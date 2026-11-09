import { useMemo, useState } from 'react'
import { AppShell, Button, Toast } from '@hrl/core-ui'
import { CLAVE_PREFERENCIAS, CLAVE_TEMA } from './tema.js'
import { MODULOS, cuentaPorId, CUENTAS } from './datos/cuentas.js'
import { despachar, moverReloj, PLANO_MEDICINA_B, reiniciarDemo, useEstado } from './datos/tienda.js'
import { ordenesPendientes } from './datos/admision.js'
import { proximaHora, sumarHoras, verFechaHora } from './dominio/tiempo.js'
import { ContextoApp } from './paneles/comun.jsx'
import { Acceso, CuentasBitacora, Recorrido } from './paneles/prototipo/Prototipo.jsx'
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
import { EditorPlano } from './paneles/plano/EditorPlano.jsx'

const PANELES = {
  recorrido: Recorrido,
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
  plano: () => <EditorPlano planoInicial={PLANO_MEDICINA_B} />,
}

/* Lo que espera a cada cuenta, para el contador del menú. */
function pendientes(estado, cuenta) {
  const egresos = estado.hospitalizaciones.filter((h) => !h.anulada && h.egreso?.estado)
  const camasDe = (o) => cuenta.servicios.includes(estado.camas.find((c) => c.id === o.camaId).servicioId)
  return {
    ordenes: cuenta.rol === 'admision' ? estado.ordenes.filter((o) => o.estado === 'pendiente').length : 0,
    mapa: cuenta.rol === 'enfermeria'
      ? ordenesPendientes(estado, cuenta.servicios).length + estado.traslados.filter((t) => t.estado === 'pendiente' && cuenta.servicios.includes(t.servicioDestino)).length + estado.ordenesCama.filter((o) => o.estado === 'por_recibir' && camasDe(o)).length
      : 0,
    completado: egresos.filter((h) => ['pendiente_hc', 'observado'].includes(h.egreso.estado)).length,
    validacion: egresos.filter((h) => h.egreso.estado === 'completo').length,
    mantenimiento: estado.ordenesCama.filter((o) => ['pendiente_retiro', 'en_reparacion', 'lista_entrega'].includes(o.estado)).length,
  }
}

const CLAVE_SESION = 'egresos_prototipo_cuenta'

function leerSesion() {
  try {
    return cuentaPorId(sessionStorage.getItem(CLAVE_SESION))
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
  const [cuenta, setCuenta] = useState(leerSesion)
  const [modulo, setModulo] = useState('recorrido')
  const [toast, setToast] = useState(null)

  const entrar = (id, destino = 'recorrido') => {
    guardarSesion(id)
    setCuenta(cuentaPorId(id))
    setModulo(destino)
  }

  const contexto = useMemo(() => ({
    estado,
    cuenta,
    ir: entrar,
    hacer: (tipo, datos = {}, aviso) => {
      const mensaje = despachar({ tipo, cuenta, ...datos })
      if (mensaje) setToast(mensaje)
      else if (aviso) setToast(aviso)
      return mensaje
    },
  }), [estado, cuenta])

  if (!cuenta) return <Acceso onEntrar={entrar} />

  const cuentas = pendientes(estado, cuenta)
  const navItems = cuenta.modulos.map((id) => ({ id, label: MODULOS[id].label, icon: MODULOS[id].icono, group: MODULOS[id].grupo, badge: cuentas[id] || undefined }))
  const activo = cuenta.modulos.includes(modulo) ? modulo : cuenta.modulos[0]
  const Panel = PANELES[activo]

  const relojDemo = (
    <>
      <Button size="sm" tone="ghost" onClick={() => moverReloj(sumarHoras(estado.ahora, 1))}>+1 hora</Button>
      <Button size="sm" tone="ghost" onClick={() => moverReloj(proximaHora(estado.ahora, '00:00'))}>Ir a las 00:00</Button>
      <Button size="sm" tone="ghost" onClick={() => moverReloj(proximaHora(estado.ahora, '08:00'))}>Ir a las 08:00</Button>
    </>
  )

  const accountItems = [
    ...CUENTAS.filter((c) => c.id !== cuenta.id).map((c) => ({ id: c.id, label: `Entrar como ${c.nombre}`, icon: 'sh-profile', onSelect: () => entrar(c.id) })),
    { id: 'sep', separator: true },
    { id: 'reiniciar', label: 'Reiniciar demostración', icon: 'sh-swap', tone: 'danger', onSelect: () => { reiniciarDemo(); setToast('Demostración reiniciada.') } },
  ]

  return (
    <ContextoApp.Provider value={contexto}>
      <AppShell
        navItems={navItems}
        active={activo}
        onSelect={setModulo}
        title={MODULOS[activo].label}
        subtitle={MODULOS[activo].subtitulo}
        brand="Egresos Hospitalarios"
        themeKey={CLAVE_TEMA}
        preferencesKey={CLAVE_PREFERENCIAS}
        user={{ name: cuenta.nombre, role: cuenta.rolLabel }}
        accountItems={accountItems}
        onSignOut={() => { guardarSesion(null); setCuenta(null) }}
        banner={{ status: { icon: 'sh-clock', label: 'Hora de la demostración', detail: verFechaHora(estado.ahora), tone: 'info' }, actions: relojDemo }}
      >
        <Panel />
      </AppShell>
      <Toast message={toast} onClose={() => setToast(null)} />
    </ContextoApp.Provider>
  )
}
