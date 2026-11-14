/* Cliente de la API: el estado vive en PostgreSQL y las reglas se aplican en el
   servidor. Las pantallas siguen leyendo un único estado y ejecutando acciones. */

import { useSyncExternalStore } from 'react'

const CLAVE_TOKEN = 'egresos_token'
const CADA_MS = 5000

let estado = null
let crudo = ''
let sinConexion = null
const oyentes = new Set()

const leerToken = () => {
  try {
    return sessionStorage.getItem(CLAVE_TOKEN)
  } catch {
    return tokenEnMemoria
  }
}
let tokenEnMemoria = null

function guardarToken(token) {
  tokenEnMemoria = token
  try {
    if (token) sessionStorage.setItem(CLAVE_TOKEN, token)
    else sessionStorage.removeItem(CLAVE_TOKEN)
  } catch {
    /* Sin almacenamiento la sesión dura lo que dure la pestaña. */
  }
}

const avisar = () => oyentes.forEach((f) => f())

const suscribir = (f) => {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

/* El tercer argumento es lo que se ve al renderizar fuera del navegador (la prueba
   de humo, o el día que la aplicación se monte en otra): lo mismo que ahora. */
const leerEstadoActual = () => estado
const leerSinConexion = () => sinConexion
export const useEstado = () => useSyncExternalStore(suscribir, leerEstadoActual, leerEstadoActual)
export const useSinConexion = () => useSyncExternalStore(suscribir, leerSinConexion, leerSinConexion)
export const haySesion = () => Boolean(leerToken())

/* Lo que dice el token, sin verificarlo: solo para decidir qué pantalla mostrar.
   Quien decide de verdad es el servidor, que rechaza todo lo demás mientras la
   cuenta deba cambiar su contraseña. */
function reclamos() {
  try {
    const cuerpo = leerToken()?.split('.')[1]
    if (!cuerpo) return null
    const bytes = Uint8Array.from(atob(cuerpo.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}
export const debeCambiarClave = () => reclamos()?.cc === true

class ErrorApi extends Error {
  constructor(mensaje, codigo) {
    super(mensaje)
    this.codigo = codigo
  }
}

async function api(ruta, cuerpo) {
  const token = leerToken()
  let respuesta
  try {
    respuesta = await fetch(`/api/${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      headers: { ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new ErrorApi('No se pudo conectar con el servidor.', 0)
  }
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) throw new ErrorApi(mensajeDe(datos?.detail), respuesta.status)
  return datos
}

/* La política de claves devuelve la lista de lo que falta; FastAPI, la de los
   campos mal formados. Se muestra todo junto. */
function mensajeDe(detalle) {
  if (typeof detalle === 'string') return detalle
  if (Array.isArray(detalle) && detalle.length) return detalle.map((d) => (typeof d === 'string' ? d : d?.msg)).filter(Boolean).join(' ')
  return 'El servidor no pudo atender el pedido.'
}

let alExpirar = null

async function recargar() {
  try {
    const nuevo = await api('estado')
    const texto = JSON.stringify(nuevo)
    const cambio = texto !== crudo || sinConexion !== null
    crudo = texto
    estado = nuevo
    sinConexion = null
    if (cambio) avisar()
  } catch (e) {
    if (e.codigo === 401) {
      alExpirar?.()
      return
    }
    sinConexion = e.message
    avisar()
  }
}

/* Carga el estado y lo mantiene al día: dos equipos ven los mismos datos. */
export function conectar(onExpirar) {
  alExpirar = onExpirar
  recargar()
  const temporizador = setInterval(recargar, CADA_MS)
  return () => clearInterval(temporizador)
}

/* Sin estado mientras cambia la cuenta: cada rol recibe datos distintos. */
function vaciar() {
  estado = null
  crudo = ''
  avisar()
}

/* Igual que el ingreso de Estadística: POST /auth/login devuelve el token, la
   cuenta y si debe cambiar su contraseña antes de operar. */
export async function iniciarSesion(usuario, clave) {
  const r = await api('auth/login', { usuario, clave })
  guardarToken(r.token)
  return { cuentaId: r.usuario.id, debeCambiarClave: r.debe_cambiar_clave }
}

export async function cambiarClave(actual, nueva) {
  const r = await api('auth/cambiar-clave', { clave_actual: actual, clave_nueva: nueva })
  guardarToken(r.token)
  return r.usuario.id
}

/* Solo en la demostración. */
export async function cambiarCuenta(cuentaId) {
  vaciar()
  const r = await api('demo/entrar-como', { cuentaId })
  guardarToken(r.token)
  return r.usuario.id
}

export function cerrarSesion() {
  guardarToken(null)
  vaciar()
}

/* Devuelve el mensaje de la regla incumplida, o null si se aplicó. */
export async function despachar(accion) {
  try {
    await api('acciones', accion)
    await recargar()
    return null
  } catch (e) {
    if (e.codigo === 401) alExpirar?.()
    return e.message
  }
}

export async function moverReloj(ahora) {
  await api('demo/reloj', { ahora })
  await recargar()
}

export async function cerrarCensosPendientes() {
  const r = await api('demo/cerrar-censos', {})
  await recargar()
  return r.cerrados
}

export async function reiniciarDemo() {
  await api('demo/reiniciar', {})
  await recargar()
}
