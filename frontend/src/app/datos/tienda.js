/* Dónde vive el estado mientras no hay backend: en este navegador. Cuando
   exista la API, este módulo se reemplaza por su cliente sin tocar las
   pantallas ni las reglas. */

import { useSyncExternalStore } from 'react'
import { aplicar, ErrorRegla, fijarReloj } from '../dominio/hospitalizacion.js'
import { crearSemilla } from './semilla.js'
import plano from './planos/medicina-b-piso2.json'

const CLAVE = 'egresos_prototipo_v2'

export const PLANO_MEDICINA_B = plano

function leer() {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (guardado) return JSON.parse(guardado)
  } catch {
    /* Sin almacenamiento o con datos dañados se arranca de la semilla. */
  }
  return crearSemilla(plano)
}

let estado = leer()
const oyentes = new Set()

function publicar(nuevo) {
  estado = nuevo
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado))
  } catch {
    /* La demostración sigue en memoria aunque no se pueda guardar. */
  }
  oyentes.forEach((f) => f())
}

const suscribir = (f) => {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

export const useEstado = () => useSyncExternalStore(suscribir, () => estado)

/* Devuelve el mensaje de la regla incumplida, o null si se aplicó. */
export function despachar(accion) {
  try {
    publicar(aplicar(estado, accion))
    return null
  } catch (e) {
    if (e instanceof ErrorRegla) return e.message
    throw e
  }
}

export const moverReloj = (ahora) => publicar(fijarReloj(estado, ahora))
export const reiniciarDemo = () => publicar(crearSemilla(plano))
