/* Modelo del plano de camas y sus reglas. Todo en metros.

   Una zona es un rectángulo del piso: una habitación (la única que lleva camas
   y servicio) o una referencia (pasillo, estación de enfermería, apoyo). Las
   camas guardan su posición relativa a la habitación, para que mover la
   habitación arrastre sus camas sin tocarlas una por una. */

import { SEPARACION, camaContraPared, distribuir, medidasHabitacion, tipoCama } from './estandar.js'
import { PASO, ajustar, haciaAbajo } from './cuadricula.js'

export { PASO, ajustar } from './cuadricula.js'

/* 2: todas las medidas sobre la cuadrícula de 25 cm (ver `migrar`). */
export const VERSION_FORMATO = 2

/* Lado mínimo de una zona: por debajo es casi siempre un clic accidental. */
export const LADO_MINIMO = 1

export const TIPOS_ZONA = [
  { value: 'habitacion', label: 'Habitación' },
  { value: 'pasillo', label: 'Pasillo' },
  { value: 'estacion', label: 'Estación de enfermería' },
  { value: 'apoyo', label: 'Apoyo (baño, depósito, otro)' },
]

export { TIPOS_CAMA } from './estandar.js'

export const ESTADOS_CAMA = [
  { value: 'operativa', label: 'Operativa' },
  { value: 'fuera_servicio', label: 'Fuera de servicio' },
]


const nuevoId = () => crypto.randomUUID()

export function planoVacio() {
  return {
    version: VERSION_FORMATO,
    nombre: 'Plano de camas',
    pisos: [{ id: nuevoId(), nombre: 'Piso 1', ancho: 30, alto: 20 }],
    zonas: [],
    camas: [],
  }
}

/* ── Geometría ─────────────────────────────────────────────────────────── */

/* Ancho y alto que ocupa la cama en el plano según su giro. */
export function huella(cama) {
  const t = tipoCama(cama.tipo)
  const girada = cama.rotacion % 180 !== 0
  return girada ? { ancho: t.largo, alto: t.ancho } : { ancho: t.ancho, alto: t.largo }
}

/* Rectángulo absoluto de la cama (x, y es la esquina superior izquierda). */
export function rectCama(cama, zona) {
  const { ancho, alto } = huella(cama)
  return { x: zona.x + cama.x, y: zona.y + cama.y, ancho, alto }
}

const contiene = (r, x, y) => x >= r.x && x <= r.x + r.ancho && y >= r.y && y <= r.y + r.alto

const dentroDe = (interior, exterior) =>
  interior.x >= exterior.x - 1e-6 &&
  interior.y >= exterior.y - 1e-6 &&
  interior.x + interior.ancho <= exterior.x + exterior.ancho + 1e-6 &&
  interior.y + interior.alto <= exterior.y + exterior.alto + 1e-6

const seCruzan = (a, b) =>
  a.x < b.x + b.ancho - 1e-6 &&
  b.x < a.x + a.ancho - 1e-6 &&
  a.y < b.y + b.alto - 1e-6 &&
  b.y < a.y + a.alto - 1e-6

/* Espacio libre entre dos camas que están lado a lado (sus huellas se
   enfrentan en un eje); null si no están una junto a la otra. */
function huecoLateral(a, b) {
  const enfrentadasY = a.y < b.y + b.alto && b.y < a.y + a.alto
  const enfrentadasX = a.x < b.x + b.ancho && b.x < a.x + a.ancho
  if (enfrentadasY) return Math.max(b.x - (a.x + a.ancho), a.x - (b.x + b.ancho))
  if (enfrentadasX) return Math.max(b.y - (a.y + a.alto), a.y - (b.y + b.alto))
  return null
}

/* La habitación más pequeña que contiene el punto: si una habitación se
   dibujó dentro de otra por error, gana la de dentro, que es la que se ve. */
export function habitacionEn(plano, pisoId, x, y) {
  return plano.zonas
    .filter((z) => z.pisoId === pisoId && z.tipo === 'habitacion' && contiene(z, x, y))
    .sort((a, b) => a.ancho * a.alto - b.ancho * b.alto)[0]
}

/* ── Códigos ───────────────────────────────────────────────────────────── */

/* H01, H02… sin repetir los que ya existen, aunque el usuario haya renombrado
   alguno a mano. */
export function siguienteCodigoHabitacion(plano) {
  const usados = new Set(plano.zonas.map((z) => z.codigo))
  for (let n = 1; ; n++) {
    const codigo = `H${String(n).padStart(2, '0')}`
    if (!usados.has(codigo)) return codigo
  }
}

export function siguienteCodigoCama(plano, zona) {
  const usados = new Set(plano.camas.map((c) => c.codigo))
  for (let n = 1; ; n++) {
    const codigo = `${zona.codigo}-C${n}`
    if (!usados.has(codigo)) return codigo
  }
}

/* ── Cambios ───────────────────────────────────────────────────────────── */

/* Todas las modificaciones pasan por aquí: así el historial (deshacer) y el
   guardado ven un único punto de cambio, y cada acción es un dato que se
   puede reproducir. */
export function aplicar(plano, accion) {
  switch (accion.tipo) {
    case 'plano/reemplazar':
      return accion.plano

    case 'piso/crear':
      return { ...plano, pisos: [...plano.pisos, accion.piso] }
    case 'piso/actualizar':
      return { ...plano, pisos: plano.pisos.map((p) => (p.id === accion.id ? { ...p, ...accion.cambios } : p)) }
    case 'piso/eliminar': {
      const zonas = new Set(plano.zonas.filter((z) => z.pisoId === accion.id).map((z) => z.id))
      return {
        ...plano,
        pisos: plano.pisos.filter((p) => p.id !== accion.id),
        zonas: plano.zonas.filter((z) => !zonas.has(z.id)),
        camas: plano.camas.filter((c) => !zonas.has(c.zonaId)),
      }
    }

    case 'zona/crear':
      return { ...plano, zonas: [...plano.zonas, accion.zona] }
    case 'zona/actualizar':
      return { ...plano, zonas: plano.zonas.map((z) => (z.id === accion.id ? { ...z, ...accion.cambios } : z)) }
    case 'zona/eliminar':
      return {
        ...plano,
        zonas: plano.zonas.filter((z) => z.id !== accion.id),
        camas: plano.camas.filter((c) => c.zonaId !== accion.id),
      }

    case 'cama/crear':
      return { ...plano, camas: [...plano.camas, accion.cama] }
    case 'cama/actualizar':
      return { ...plano, camas: plano.camas.map((c) => (c.id === accion.id ? { ...c, ...accion.cambios } : c)) }
    case 'cama/eliminar':
      return { ...plano, camas: plano.camas.filter((c) => c.id !== accion.id) }

    case 'lote':
      return accion.acciones.reduce(aplicar, plano)

    default:
      throw new Error(`Acción desconocida: ${accion.tipo}`)
  }
}

/* ── Fábricas ──────────────────────────────────────────────────────────── */

export function crearZona(plano, { pisoId, tipo, x, y, ancho, alto, servicioId }) {
  const habitacion = tipo === 'habitacion'
  return {
    id: nuevoId(),
    pisoId,
    tipo,
    codigo: habitacion ? siguienteCodigoHabitacion(plano) : '',
    nombre: habitacion ? '' : (TIPOS_ZONA.find((t) => t.value === tipo)?.label ?? ''),
    servicioId: habitacion ? (servicioId ?? null) : null,
    x: ajustar(x),
    y: ajustar(y),
    ancho: Math.max(PASO, ajustar(ancho)),
    alto: Math.max(PASO, ajustar(alto)),
  }
}

/* Cama colocada con un clic en (x, y) absolutos: la cabecera contra la pared
   más cercana. `null` si la habitación es más chica que la cama. */
export function crearCama(plano, zona, x, y, tipo = 'adulto') {
  const pos = camaContraPared(zona, x - zona.x, y - zona.y, tipo)
  if (!pos) return null
  return {
    id: nuevoId(),
    zonaId: zona.id,
    codigo: siguienteCodigoCama(plano, zona),
    tipo,
    estado: 'operativa',
    servicioId: null,
    ...pos,
  }
}

/* Acomoda n camas en la habitación con el estándar. Reutiliza las camas que
   ya tiene (conservan código y estado), crea las que faltan y quita las que
   sobran. Devuelve { ok, accion, quitadas } o { ok: false, requerido }. */
export function accionDistribuir(plano, zona, n, tipo = 'adulto', variante = 'auto') {
  const r = distribuir(zona, n, tipo, variante)
  if (!r.ok) return r
  const actuales = plano.camas
    .filter((c) => c.zonaId === zona.id)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
  const acciones = []
  let parcial = plano
  r.posiciones.forEach((pos, i) => {
    const existente = actuales[i]
    if (existente) {
      acciones.push({ tipo: 'cama/actualizar', id: existente.id, cambios: { ...pos, tipo } })
    } else {
      const cama = { id: nuevoId(), zonaId: zona.id, codigo: siguienteCodigoCama(parcial, zona), tipo, estado: 'operativa', servicioId: null, ...pos }
      parcial = aplicar(parcial, { tipo: 'cama/crear', cama })
      acciones.push({ tipo: 'cama/crear', cama })
    }
  })
  const quitadas = actuales.slice(r.posiciones.length)
  for (const c of quitadas) acciones.push({ tipo: 'cama/eliminar', id: c.id })
  return { ok: true, accion: { tipo: 'lote', acciones }, quitadas }
}

/* Posición relativa a la habitación, ajustada y acotada a sus paredes. */
export function posicionDentro(zona, ancho, alto, xAbs, yAbs) {
  const x = Math.min(Math.max(ajustar(xAbs - zona.x), 0), Math.max(0, haciaAbajo(zona.ancho - ancho)))
  const y = Math.min(Math.max(ajustar(yAbs - zona.y), 0), Math.max(0, haciaAbajo(zona.alto - alto)))
  return { x, y }
}

/* Rectángulo de una habitación de plantilla centrada en (cx, cy): tamaño
   estándar para n camas, ajustado a la cuadrícula. */
export function rectPlantilla(n, tipo, variante, cx, cy) {
  const { ancho, alto } = medidasHabitacion(n, tipo, variante)
  return { x: ajustar(cx - ancho / 2), y: ajustar(cy - alto / 2), ancho, alto }
}

/* Habitación de plantilla con sus camas ya distribuidas, como un solo paso
   del historial. */
export function accionHabitacionPlantilla(plano, { pisoId, cx, cy, n, tipo, variante, servicioId }) {
  const zona = crearZona(plano, { pisoId, tipo: 'habitacion', servicioId, ...rectPlantilla(n, tipo, variante, cx, cy) })
  const conZona = aplicar(plano, { tipo: 'zona/crear', zona })
  const camas = accionDistribuir(conZona, zona, n, tipo, variante)
  return { accion: { tipo: 'lote', acciones: [{ tipo: 'zona/crear', zona }, ...camas.accion.acciones] }, zonaId: zona.id }
}

/* Copia desplazada un paso de cuadrícula grande, con código nuevo. Una
   habitación se copia con sus camas. */
export function duplicar(plano, seleccion) {
  if (seleccion?.tipo === 'zona') {
    const zona = plano.zonas.find((z) => z.id === seleccion.id)
    if (!zona) return null
    const copia = { ...zona, id: nuevoId(), x: zona.x + zona.ancho + 1, codigo: zona.tipo === 'habitacion' ? siguienteCodigoHabitacion(plano) : '' }
    let parcial = aplicar(plano, { tipo: 'zona/crear', zona: copia })
    const acciones = [{ tipo: 'zona/crear', zona: copia }]
    for (const cama of plano.camas.filter((c) => c.zonaId === zona.id)) {
      const nueva = { ...cama, id: nuevoId(), zonaId: copia.id, codigo: siguienteCodigoCama(parcial, copia) }
      parcial = aplicar(parcial, { tipo: 'cama/crear', cama: nueva })
      acciones.push({ tipo: 'cama/crear', cama: nueva })
    }
    return { accion: { tipo: 'lote', acciones }, seleccion: { tipo: 'zona', id: copia.id } }
  }
  if (seleccion?.tipo === 'cama') {
    const cama = plano.camas.find((c) => c.id === seleccion.id)
    const zona = cama && plano.zonas.find((z) => z.id === cama.zonaId)
    if (!zona) return null
    const { ancho, alto } = huella(cama)
    const pos = posicionDentro(zona, ancho, alto, zona.x + cama.x + ancho + 0.5, zona.y + cama.y)
    const nueva = { ...cama, id: nuevoId(), codigo: siguienteCodigoCama(plano, zona), ...pos }
    return { accion: { tipo: 'cama/crear', cama: nueva }, seleccion: { tipo: 'cama', id: nueva.id } }
  }
  return null
}

/* ── Validación ────────────────────────────────────────────────────────── */

/* Lo que impide usar el plano como maestro de camas (error) y lo que
   probablemente es un descuido (aviso). Cada aviso apunta al elemento, para
   poder seleccionarlo desde la lista. */
export function validar(plano, servicioExiste) {
  const avisos = []
  const habitaciones = plano.zonas.filter((z) => z.tipo === 'habitacion')

  const repetidos = (lista, nombre, tipo) => {
    const vistos = new Map()
    for (const el of lista) {
      if (!el.codigo) continue
      if (vistos.has(el.codigo)) {
        avisos.push({ nivel: 'error', mensaje: `Código de ${nombre} repetido: ${el.codigo}`, ref: { tipo, id: el.id } })
      } else {
        vistos.set(el.codigo, el.id)
      }
    }
  }
  repetidos(habitaciones, 'habitación', 'zona')
  repetidos(plano.camas, 'cama', 'cama')

  for (const z of habitaciones) {
    if (!z.codigo) avisos.push({ nivel: 'error', mensaje: 'Habitación sin código', ref: { tipo: 'zona', id: z.id } })
    if (!z.servicioId) {
      avisos.push({ nivel: 'error', mensaje: `${z.codigo || 'Habitación'} sin servicio asignado`, ref: { tipo: 'zona', id: z.id } })
    } else if (!servicioExiste(z.servicioId)) {
      avisos.push({ nivel: 'error', mensaje: `${z.codigo}: el servicio ya no existe en el catálogo`, ref: { tipo: 'zona', id: z.id } })
    }
    const camas = plano.camas.filter((c) => c.zonaId === z.id)
    if (camas.length === 0) avisos.push({ nivel: 'aviso', mensaje: `${z.codigo || 'Habitación'} no tiene camas`, ref: { tipo: 'zona', id: z.id } })

    const rects = camas.map((c) => ({ cama: c, r: rectCama(c, z) }))
    for (const { cama, r } of rects) {
      if (!dentroDe(r, z)) avisos.push({ nivel: 'aviso', mensaje: `${cama.codigo} sobresale de ${z.codigo}`, ref: { tipo: 'cama', id: cama.id } })
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const [a, b] = [rects[i], rects[j]]
        if (seCruzan(a.r, b.r)) {
          avisos.push({ nivel: 'aviso', mensaje: `${a.cama.codigo} se superpone con ${b.cama.codigo}`, ref: { tipo: 'cama', id: b.cama.id } })
          continue
        }
        const hueco = huecoLateral(a.r, b.r)
        if (hueco !== null && hueco < SEPARACION.entreCamas - 0.05) {
          avisos.push({
            nivel: 'aviso',
            mensaje: `${a.cama.codigo} y ${b.cama.codigo} a ${hueco.toFixed(2)} m (estándar ${SEPARACION.entreCamas} m)`,
            ref: { tipo: 'cama', id: b.cama.id },
          })
        }
      }
    }
  }

  for (const c of plano.camas) {
    if (!c.codigo) avisos.push({ nivel: 'error', mensaje: 'Cama sin código', ref: { tipo: 'cama', id: c.id } })
  }

  for (let i = 0; i < habitaciones.length; i++) {
    for (let j = i + 1; j < habitaciones.length; j++) {
      const a = habitaciones[i]
      const b = habitaciones[j]
      if (a.pisoId === b.pisoId && seCruzan(a, b)) {
        avisos.push({ nivel: 'aviso', mensaje: `${a.codigo} y ${b.codigo} se superponen`, ref: { tipo: 'zona', id: b.id } })
      }
    }
  }

  return avisos
}

/* Servicio efectivo de una cama: el propio si se le asignó uno distinto, si
   no el de su habitación. */
export function servicioDeCama(cama, zona) {
  return cama.servicioId ?? zona?.servicioId ?? null
}

/* Las camas se agrupan en dos categorías: aislados y hospitalización. Una
   habitación es de aislamiento si su nombre lo dice («Aislado», «Aislado
   invertido»); el resto es hospitalización. */
export const CATEGORIAS_CAMA = [
  { id: 'hospitalizacion', label: 'Hospitalización' },
  { id: 'aislados', label: 'Aislados' },
]
export const esAislado = (zona) => /^aislad/i.test(zona?.nombre ?? '')
export const categoriaDeZona = (zona) => (esAislado(zona) ? 'aislados' : 'hospitalizacion')

/* Camas mapeadas por servicio: total, operativas y fuera de servicio. */
export function conteoPorServicio(plano) {
  const zonas = new Map(plano.zonas.map((z) => [z.id, z]))
  const conteo = new Map()
  for (const cama of plano.camas) {
    const id = servicioDeCama(cama, zonas.get(cama.zonaId)) ?? 'sin-servicio'
    const c = conteo.get(id) ?? { total: 0, operativas: 0, fueraServicio: 0 }
    c.total++
    if (cama.estado === 'fuera_servicio') c.fueraServicio++
    else c.operativas++
    conteo.set(id, c)
  }
  return conteo
}

/* ── Migración ─────────────────────────────────────────────────────────── */

/* Lleva un plano guardado a la versión actual. La 1 guardaba medidas al
   centímetro y camas de otro tamaño: se pasa todo a la cuadrícula y cada
   cama se acota dentro de su habitación con su huella actual. */
export function migrar(datos) {
  if (datos.version === VERSION_FORMATO) return datos
  if (datos.version !== 1) throw new Error(`Versión de plano desconocida: ${datos.version}`)
  const zonas = datos.zonas.map((z) => ({
    ...z,
    x: ajustar(z.x),
    y: ajustar(z.y),
    ancho: Math.max(PASO, ajustar(z.ancho)),
    alto: Math.max(PASO, ajustar(z.alto)),
  }))
  const porId = new Map(zonas.map((z) => [z.id, z]))
  const camas = datos.camas.map((c) => {
    const z = porId.get(c.zonaId)
    if (!z) return c
    const { ancho, alto } = huella(c)
    return { ...c, ...posicionDentro(z, ancho, alto, z.x + c.x, z.y + c.y) }
  })
  /* `fondo` era la imagen de calco, que ya no existe. */
  const pisos = datos.pisos.map(({ fondo: _fondo, ...p }) => ({ ...p, ancho: Math.max(5, ajustar(p.ancho)), alto: Math.max(5, ajustar(p.alto)) }))
  return { ...datos, version: VERSION_FORMATO, pisos, zonas, camas }
}

/* ── Numeración de camas ──────────────────────────────────────────────── */

const letra = (i) => (i < 26 ? String.fromCharCode(65 + i) : letra(Math.floor(i / 26) - 1) + letra(i % 26))

/* Cómo se arma el código de cada cama. `n` es el número de la cama (desde
   «inicio»); en «correlativo» sigue de una habitación a la siguiente. */
export const FORMATOS_NUMERACION = [
  { value: 'hab-c', label: 'Habitación-C1, C2…', codigo: (h, n) => `${h}-C${n}` },
  { value: 'hab-n', label: 'Habitación-1, 2…', codigo: (h, n) => `${h}-${n}` },
  { value: 'hab-letra', label: 'Habitación-A, B…', codigo: (h, n) => `${h}-${letra(n - 1)}` },
  { value: 'hab-pegado', label: 'HabitaciónA, B… (sin guion)', codigo: (h, n) => `${h}${letra(n - 1)}` },
  { value: 'correlativo', label: 'Correlativo: prefijo + 1, 2… (sigue entre habitaciones)', codigo: (_h, n, prefijo) => `${prefijo}${n}` },
]

export const ORDENES_NUMERACION = [
  { value: 'filas', label: 'Por filas' },
  { value: 'columnas', label: 'Por columnas' },
]

/* Orden de lectura de las camas de una habitación: por filas (de arriba
   abajo y, en cada fila, de izquierda a derecha) o por columnas. Dos camas
   cuyos centros difieren menos de medio metro están en la misma fila. */
export function ordenarCamas(camas, orden = 'filas') {
  const centro = (c) => {
    const { ancho, alto } = huella(c)
    return { x: c.x + ancho / 2, y: c.y + alto / 2 }
  }
  const [principal, secundario] = orden === 'columnas' ? ['x', 'y'] : ['y', 'x']
  return [...camas].sort((a, b) => {
    const ca = centro(a)
    const cb = centro(b)
    const d = ca[principal] - cb[principal]
    return Math.abs(d) > 0.5 ? d : ca[secundario] - cb[secundario]
  })
}

/* Numera las camas de las habitaciones dadas, en ese orden. Devuelve la
   acción y la lista de cambios; `conflictos` son los códigos nuevos que ya
   usa una cama de fuera del alcance (no se aplica si hay alguno). */
export function accionNumerar(plano, zonas, { formato = 'hab-c', inicio = 1, prefijo = '', orden = 'filas' } = {}) {
  const f = FORMATOS_NUMERACION.find((x) => x.value === formato) ?? FORMATOS_NUMERACION[0]
  const correlativo = formato === 'correlativo'
  const cambios = []
  let n = inicio
  for (const zona of zonas) {
    if (!correlativo) n = inicio
    for (const cama of ordenarCamas(plano.camas.filter((c) => c.zonaId === zona.id), orden)) {
      cambios.push({ id: cama.id, antes: cama.codigo, despues: f.codigo(zona.codigo, n, prefijo) })
      n++
    }
  }
  const enAlcance = new Set(cambios.map((c) => c.id))
  const ajenos = new Set(plano.camas.filter((c) => !enAlcance.has(c.id)).map((c) => c.codigo))
  const conflictos = cambios.map((c) => c.despues).filter((codigo) => ajenos.has(codigo))
  return {
    cambios,
    conflictos,
    accion: { tipo: 'lote', acciones: cambios.map((c) => ({ tipo: 'cama/actualizar', id: c.id, cambios: { codigo: c.despues } })) },
  }
}

/* Lo que se escribe dentro de la cama en el plano: el código sin el de su
   habitación cuando lo lleva como prefijo (H01-C2 → C2), si no el código
   entero. */
export function etiquetaCama(cama, zona) {
  const prefijo = zona?.codigo ? `${zona.codigo}-` : null
  return prefijo && cama.codigo.startsWith(prefijo) ? cama.codigo.slice(prefijo.length) : cama.codigo
}
