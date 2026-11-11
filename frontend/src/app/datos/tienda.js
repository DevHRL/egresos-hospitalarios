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

export const useEstado = () => useSyncExternalStore(suscribir, () => estado)
export const useSinConexion = () => useSyncExternalStore(suscribir, () => sinConexion)
export const haySesion = () => Boolean(leerToken())

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
  if (!respuesta.ok) throw new ErrorApi(typeof datos?.detail === 'string' ? datos.detail : 'El servidor no pudo atender el pedido.', respuesta.status)
  return datos
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

export async function iniciarSesion(usuario, clave) {
  const r = await api('sesion', { usuario, clave })
  guardarToken(r.token)
  return r.cuentaId
}

export async function cambiarCuenta(cuentaId) {
  vaciar()
  const r = await api('sesion/cambiar', { cuentaId })
  guardarToken(r.token)
  return r.cuentaId
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

export async function publicarPlano(plano) {
  const r = await api('plano', plano)
  await recargar()
  return r
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
