/* Estándar de camas y de distribución dentro de una habitación. Todo en
   metros.

   Medidas de trabajo para dibujar el plano a escala, no una norma: antes de
   usarlas para decidir capacidad se validan con Infraestructura contra la
   norma técnica de infraestructura hospitalaria del MINSA. Están en un solo
   lugar para poder ajustarlas sin tocar el editor.

   Todas son múltiplos de la cuadrícula (25 cm): así las camas quedan
   alineadas entre sí y con las paredes, y siguen alineadas al moverlas. */

import { PASO, haciaAbajo, haciaArriba } from './cuadricula.js'

/* Huella de cada tipo de cama con barandas, cabecera y piecera (ancho ×
   largo), redondeada a la cuadrícula. */
export const TIPOS_CAMA = {
  adulto: { label: 'Adulto', ancho: 1, largo: 2.25 },
  uci: { label: 'UCI / intermedios', ancho: 1.25, largo: 2.25 },
  pediatrica: { label: 'Pediátrica', ancho: 0.75, largo: 1.5 },
  cuna: { label: 'Cuna / incubadora', ancho: 0.5, largo: 1 },
}

export const SEPARACION = {
  /* Holgura entre la cabecera y la pared: la cama se apoya en la pared. */
  cabecera: 0,
  /* Espacio libre a cada lado de la cama para atender al paciente. */
  entreCamas: 1,
  /* De la primera y la última cama a la pared lateral. */
  lateral: 1,
  /* Circulación a los pies con una sola fila de camas. */
  pies: 1.25,
  /* Pasillo entre los pies de dos filas enfrentadas (camilla o silla de
     ruedas). */
  pasilloCentral: 1.75,
}

/* Formas de acomodar las camas. «Horizontal» y «vertical» describen la cama
   tal como se ve en el plano: una cama horizontal tiene la cabecera contra la
   pared izquierda o derecha, y las camas horizontales se alinean en filas que
   corren de arriba abajo.

   eje: hacia dónde corre la fila (x: de izquierda a derecha, y: de arriba
   abajo). filas: paredes con cabeceras, «cerca» es la de arriba (eje x) o la
   izquierda (eje y). */
export const VARIANTES = [
  { id: 'h2', label: 'Dos filas, camas horizontales', corto: 'Izq. y der.', eje: 'y', filas: ['cerca', 'lejos'] },
  { id: 'v2', label: 'Dos filas, camas verticales', corto: 'Arriba y abajo', eje: 'x', filas: ['cerca', 'lejos'] },
  { id: 'h1-izq', label: 'Una fila contra la pared izquierda', corto: 'Izquierda', eje: 'y', filas: ['cerca'] },
  { id: 'h1-der', label: 'Una fila contra la pared derecha', corto: 'Derecha', eje: 'y', filas: ['lejos'] },
  { id: 'v1-arr', label: 'Una fila contra la pared de arriba', corto: 'Arriba', eje: 'x', filas: ['cerca'] },
  { id: 'v1-abj', label: 'Una fila contra la pared de abajo', corto: 'Abajo', eje: 'x', filas: ['lejos'] },
]

const VARIANTE = new Map(VARIANTES.map((v) => [v.id, v]))

/* Las de dos filas necesitan al menos dos camas. */
export const variantesPara = (n) => VARIANTES.filter((v) => v.filas.length <= Math.max(1, n))

/* La distribución habitual del hospital: camas horizontales; con dos o más
   camas, en dos filas enfrentadas contra las paredes izquierda y derecha. */
export const varianteInicial = (n) => (n >= 2 ? 'h2' : 'h1-izq')


export const tipoCama = (id) => TIPOS_CAMA[id] ?? TIPOS_CAMA.adulto

/* Largo de una fila de k camas, con sus márgenes laterales. */
const largoFila = (k, t) => 2 * SEPARACION.lateral + k * t.ancho + Math.max(0, k - 1) * SEPARACION.entreCamas

/* Fondo que necesita la habitación para 1 o 2 filas. */
const fondoFilas = (filas, t) =>
  filas === 1 ? SEPARACION.cabecera + t.largo + SEPARACION.pies : 2 * (SEPARACION.cabecera + t.largo) + SEPARACION.pasilloCentral

const camasPorFila = (largo, t) => Math.max(0, Math.floor((largo - 2 * SEPARACION.lateral + SEPARACION.entreCamas) / (t.ancho + SEPARACION.entreCamas)))

const varianteDe = (id, n) => {
  const v = VARIANTE.get(id) ?? VARIANTE.get(varianteInicial(n))
  /* Con una sola cama, una variante de dos filas se queda con la primera. */
  return v.filas.length > Math.max(1, n) ? { ...v, filas: [v.filas[0]] } : v
}

/* Tamaño estándar (ancho × alto en el plano) de una habitación para n camas
   con esa variante. */
export function medidasHabitacion(n, tipo = 'adulto', variante = varianteInicial(n)) {
  const t = tipoCama(tipo)
  const v = varianteDe(variante, n)
  const largo = haciaArriba(largoFila(Math.ceil(n / v.filas.length), t))
  const fondo = haciaArriba(fondoFilas(v.filas.length, t))
  return v.eje === 'x' ? { ancho: largo, alto: fondo } : { ancho: fondo, alto: largo }
}

const cabe = (zona, n, t, v) => {
  const largo = v.eje === 'x' ? zona.ancho : zona.alto
  const fondo = v.eje === 'x' ? zona.alto : zona.ancho
  return Math.ceil(n / v.filas.length) <= camasPorFila(largo, t) && fondo >= fondoFilas(v.filas.length, t) - 1e-9
}

/* Cuántas camas caben con el estándar en una habitación de ese tamaño,
   con la mejor variante. */
export function capacidad(zona, tipo = 'adulto') {
  const t = tipoCama(tipo)
  let mejor = 0
  for (const v of VARIANTES) {
    const largo = v.eje === 'x' ? zona.ancho : zona.alto
    const fondo = v.eje === 'x' ? zona.alto : zona.ancho
    if (fondo >= fondoFilas(v.filas.length, t) - 1e-9) mejor = Math.max(mejor, v.filas.length * camasPorFila(largo, t))
  }
  return mejor
}

/* Orden en que «automática» prueba las variantes: primero la habitual del
   hospital, después el resto. */
const ordenAutomatico = (n) => [varianteInicial(n), ...VARIANTES.map((v) => v.id).filter((id) => id !== varianteInicial(n))]

/* Posiciones (relativas a la habitación) para n camas. `variante` es un id de
   VARIANTES o 'auto' (la primera que quepa). Las filas se centran a lo largo
   de su pared.

   Devuelve { ok: true, posiciones: [{ x, y, rotacion }], variante } o, si no
   caben, { ok: false, requerido: { ancho, alto } } con el tamaño mínimo
   estándar para esa variante. */
export function distribuir(zona, n, tipo = 'adulto', variante = 'auto') {
  const t = tipoCama(tipo)
  if (n <= 0) return { ok: true, posiciones: [], variante }

  const candidatas = (variante === 'auto' ? ordenAutomatico(n) : [variante]).map((id) => varianteDe(id, n))
  const elegida = candidatas.find((v) => cabe(zona, n, t, v))
  if (elegida) return { ok: true, posiciones: posiciones(zona, n, t, elegida), variante: elegida.id }

  return { ok: false, requerido: medidasHabitacion(n, tipo, candidatas[0].id) }
}

/* Giro de una cama según la pared de su cabecera: 0 arriba, 180 abajo,
   270 izquierda, 90 derecha. */
const GIRO = { x: { cerca: 0, lejos: 180 }, y: { cerca: 270, lejos: 90 } }

function posiciones(zona, n, t, v) {
  const largo = v.eje === 'x' ? zona.ancho : zona.alto
  const fondo = v.eje === 'x' ? zona.alto : zona.ancho
  const resultado = []
  const enPrimera = Math.ceil(n / v.filas.length)
  v.filas.forEach((lado, i) => {
    const cuantas = i === 0 ? enPrimera : n - enPrimera
    const ocupado = cuantas * t.ancho + (cuantas - 1) * SEPARACION.entreCamas
    /* Centrada, pero sobre la cuadrícula: si sobra un paso, queda del lado
       de la primera pared. */
    const inicio = haciaAbajo((largo - ocupado) / 2)
    const prof = lado === 'cerca' ? SEPARACION.cabecera : fondo - SEPARACION.cabecera - t.largo
    for (let j = 0; j < cuantas; j++) {
      const u = Math.round((inicio + j * (t.ancho + SEPARACION.entreCamas)) * 100) / 100
      const rotacion = GIRO[v.eje][lado]
      resultado.push(v.eje === 'x' ? { x: u, y: prof, rotacion } : { x: prof, y: u, rotacion })
    }
  })
  return resultado
}

/* Cama colocada con un clic: la cabecera se apoya en la pared más cercana al
   punto y la cama se ajusta a lo largo de esa pared. (x, y) relativos a la
   habitación. */
export function camaContraPared(zona, x, y, tipo = 'adulto') {
  const t = tipoCama(tipo)
  const paredes = [
    { lado: 'arriba', d: y, rotacion: 0 },
    { lado: 'abajo', d: zona.alto - y, rotacion: 180 },
    { lado: 'izquierda', d: x, rotacion: 270 },
    { lado: 'derecha', d: zona.ancho - x, rotacion: 90 },
  ].sort((a, b) => a.d - b.d)

  for (const pared of paredes) {
    const vertical = pared.rotacion % 180 === 0
    const ancho = vertical ? t.ancho : t.largo
    const alto = vertical ? t.largo : t.ancho
    /* La holgura de la cabecera se suma en el sentido de la pared elegida. */
    if (ancho + (vertical ? 0 : SEPARACION.cabecera) > zona.ancho || alto + (vertical ? SEPARACION.cabecera : 0) > zona.alto) continue
    const acotar = (v, max) => Math.min(Math.max(Math.round(v / PASO) * PASO, 0), haciaAbajo(max))
    if (pared.lado === 'arriba') return { x: acotar(x - ancho / 2, zona.ancho - ancho), y: SEPARACION.cabecera, rotacion: 0 }
    if (pared.lado === 'abajo') return { x: acotar(x - ancho / 2, zona.ancho - ancho), y: haciaAbajo(zona.alto - SEPARACION.cabecera - alto), rotacion: 180 }
    if (pared.lado === 'izquierda') return { x: SEPARACION.cabecera, y: acotar(y - alto / 2, zona.alto - alto), rotacion: 270 }
    return { x: haciaAbajo(zona.ancho - SEPARACION.cabecera - ancho), y: acotar(y - alto / 2, zona.alto - alto), rotacion: 90 }
  }
  return null
}
