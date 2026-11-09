/* Dónde vive el plano mientras no hay backend.

   - Borrador: copia automática en IndexedDB de este navegador, para no perder
     trabajo al cerrar la pestaña.
   - Archivo: el JSON que el usuario guarda y comparte. Es el formato que el
     backend importará como maestro de habitaciones y camas.

   Cuando exista la API, este módulo se reemplaza por su cliente sin tocar
   las pantallas. */

import { VERSION_FORMATO, migrar } from '../dominio/plano.js'

const BASE = 'egresos-plano'
const ALMACEN = 'borradores'
/* Con el sufijo se ignoran los borradores de planos anteriores a la corrección. */
const CLAVE = 'actual-v2'

function abrirBase() {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BASE, 1)
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN)
    pedido.onsuccess = () => resolve(pedido.result)
    pedido.onerror = () => reject(pedido.error)
  })
}

async function operar(modo, fn) {
  const db = await abrirBase()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(ALMACEN, modo)
      const pedido = fn(tx.objectStore(ALMACEN))
      tx.oncomplete = () => resolve(pedido?.result)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export const guardarBorrador = (plano) => operar('readwrite', (s) => s.put({ plano, fecha: Date.now() }, CLAVE))

/* `null` si no hay borrador o si el navegador no deja usar IndexedDB (modo
   privado estricto): el editor arranca vacío en vez de fallar. */
export async function leerBorrador() {
  try {
    const borrador = await operar('readonly', (s) => s.get(CLAVE))
    return borrador?.plano ? { ...borrador, plano: migrar(borrador.plano) } : null
  } catch {
    return null
  }
}

/* ── Archivo ───────────────────────────────────────────────────────────── */

const TIPO_JSON = { description: 'Plano de camas', accept: { 'application/json': ['.json'] } }

/* Comprueba lo mínimo para no cargar cualquier JSON como plano y lo lleva a
   la versión actual (las anteriores se migran). */
export function interpretarPlano(texto) {
  let datos
  try {
    datos = JSON.parse(texto)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }
  const version = datos?.version
  if (!Number.isInteger(version) || version < 1 || version > VERSION_FORMATO || !Array.isArray(datos.pisos) || !Array.isArray(datos.zonas) || !Array.isArray(datos.camas)) {
    throw new Error('El archivo no es un plano de camas de este sistema (o es de una versión más nueva).')
  }
  if (datos.pisos.length === 0) throw new Error('El plano no tiene ningún piso.')
  return migrar(datos)
}

/* Selector de archivo sin `<input>` en el JSX: el kit no tiene campo de
   archivo y este control nunca se muestra. */
function elegirConInput(accept) {
  return new Promise((resolve) => {
    const control = document.createElement('input')
    control.type = 'file'
    control.accept = accept
    control.onchange = () => resolve(control.files?.[0] ?? null)
    control.click()
  })
}

/* Devuelve { plano, nombre, manejador } o null si el usuario cancela. Con la
   API de acceso a archivos (Chrome, Edge) se conserva el manejador para que
   «Guardar» escriba sobre el mismo archivo. */
export async function abrirArchivo() {
  if ('showOpenFilePicker' in window) {
    try {
      const [manejador] = await window.showOpenFilePicker({ types: [TIPO_JSON] })
      const archivo = await manejador.getFile()
      return { plano: interpretarPlano(await archivo.text()), nombre: archivo.name, manejador }
    } catch (e) {
      if (e.name === 'AbortError') return null
      throw e
    }
  }
  const archivo = await elegirConInput('.json,application/json')
  if (!archivo) return null
  return { plano: interpretarPlano(await archivo.text()), nombre: archivo.name, manejador: null }
}

/* Escribe sobre el manejador si lo hay; si no, pide dónde guardar; sin API de
   archivos, descarga. Devuelve { nombre, manejador } o null si se cancela. */
export async function guardarArchivo(plano, manejador, sugerido = 'plano-camas.json') {
  const contenido = JSON.stringify(plano, null, 2)
  try {
    let destino = manejador
    if (!destino && 'showSaveFilePicker' in window) {
      destino = await window.showSaveFilePicker({ suggestedName: sugerido, types: [TIPO_JSON] })
    }
    if (destino) {
      const escritura = await destino.createWritable()
      await escritura.write(contenido)
      await escritura.close()
      return { nombre: destino.name, manejador: destino }
    }
  } catch (e) {
    if (e.name === 'AbortError') return null
    throw e
  }
  descargar(new Blob([contenido], { type: 'application/json' }), sugerido)
  return { nombre: sugerido, manejador: null }
}

export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

/* Una fila por cama, lista para revisar en Excel o cargar al maestro. */
export function exportarCSV(plano, servicioPorId) {
  const zonas = new Map(plano.zonas.map((z) => [z.id, z]))
  const pisos = new Map(plano.pisos.map((p) => [p.id, p]))
  const filas = [['departamento', 'servicio', 'piso', 'habitacion', 'cama', 'tipo', 'estado']]
  for (const cama of plano.camas) {
    const zona = zonas.get(cama.zonaId)
    const servicio = servicioPorId(cama.servicioId ?? zona?.servicioId)
    filas.push([
      servicio?.departamento.nombre ?? '',
      servicio?.nombre ?? '',
      pisos.get(zona?.pisoId)?.nombre ?? '',
      zona?.codigo ?? '',
      cama.codigo,
      cama.tipo,
      cama.estado,
    ])
  }
  const celda = (v) => (/[",;\n]/.test(v) ? `"${String(v).replaceAll('"', '""')}"` : v)
  /* BOM para que Excel abra las tildes bien; punto y coma porque Excel en
     español usa la coma como separador decimal. */
  const texto = '﻿' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
  descargar(new Blob([texto], { type: 'text/csv;charset=utf-8' }), 'camas.csv')
}
