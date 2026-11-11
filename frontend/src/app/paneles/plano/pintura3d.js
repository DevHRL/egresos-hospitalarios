/* Pinta en un canvas 2D la escena de `escena3d.js`.

   Por qué canvas y no SVG: con cientos de caras que cambian en cada cuadro, el
   SVG obligaba a React a comparar y al navegador a volver a dibujar cada
   elemento, y el giro iba a saltos. El canvas pinta la lista entera en pocos
   milisegundos, sin elementos que comparar.

   Los colores salen de los tokens del kit (`var(--…)`): se resuelven una vez
   con un elemento de prueba, se vuelven a resolver si cambia el tema, y las
   mezclas (sombras de las caras, tonos de la figura) se calculan aquí con las
   mismas proporciones que el CSS. */

/* Tokens del kit que usa la figura. */
const TOKENS = {
  texto: 'var(--foreground)',
  superficie: 'var(--surface)',
  apagado: 'var(--muted-foreground)',
  vivo: 'var(--primary)',
  aviso: 'var(--warning)',
  peligro: 'var(--destructive)',
  exito: 'var(--success)',
  info: 'var(--info)',
}

/* Color de la frazada según el estado (el mismo que la leyenda). */
const ESTADO_A_TOKEN = { libre: 'exito', ocupada: 'info', ocupada_o2: 'info', ocupada_vm: 'aviso', bloqueada: 'apagado', fuera: 'peligro' }

function leerRgb(texto) {
  const n = (texto.match(/-?[\d.]+(e-?\d+)?/gi) ?? []).map(Number)
  /* `color(srgb r g b)` viene en 0–1; `rgb(r, g, b)` en 0–255. */
  if (texto.startsWith('color(')) return n.slice(0, 3).map((v) => v * 255)
  return n.slice(0, 3)
}

const mezclar = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t))
const css = (c) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`

/* Resuelve los tokens en el contexto del elemento (tema claro u oscuro). */
export function resolverPaleta(elemento) {
  const prueba = document.createElement('span')
  prueba.style.display = 'none'
  elemento.appendChild(prueba)
  const base = {}
  for (const [clave, valor] of Object.entries(TOKENS)) {
    prueba.style.color = valor
    base[clave] = leerRgb(getComputedStyle(prueba).color)
  }
  const estilo = getComputedStyle(elemento)
  prueba.style.fontSize = 'var(--text-xs)'
  const tamanoRotulo = parseFloat(getComputedStyle(prueba).fontSize) || 12
  prueba.remove()

  /* Las mismas proporciones que la figura en estilos.css. */
  const tonos = {
    cuerpo: base.superficie,
    cubierta: mezclar(base.texto, base.superficie, 0.03),
    linea: mezclar(base.texto, base.superficie, 0.36),
    detalle: mezclar(base.texto, base.superficie, 0.11),
    estacion: mezclar(base.info, base.superficie, 0.08),
  }
  for (const [estado, token] of Object.entries(ESTADO_A_TOKEN)) tonos[`frazada:${estado}`] = mezclar(base[token], base.superficie, 0.62)

  const cache = new Map()
  const color = (clave) => {
    if (cache.has(clave)) return cache.get(clave)
    let rgb
    const [cara, tono] = clave.includes('|') ? clave.split('|') : [null, clave]
    const t = tonos[tono] ?? base[tono] ?? { fuerte: base.texto }[tono] ?? base.texto
    if (cara === 'lado') rgb = mezclar(t, base.texto, 0.88)
    else if (cara === 'frente') rgb = mezclar(t, base.texto, 0.76)
    else rgb = t
    const valor = css(rgb)
    cache.set(clave, valor)
    return valor
  }
  return {
    color,
    texto: css(base.texto),
    apagado: css(base.apagado),
    superficie: css(base.superficie),
    peligro: css(base.peligro),
    fuenteMono: estilo.getPropertyValue('--font-mono').trim() || 'monospace',
    tamanoRotulo,
  }
}

/* Íconos del sprite del kit como imágenes, para dibujarlos en el canvas. */
const iconos = new Map()
export function icono(nombre, color, alListo) {
  const clave = `${nombre}|${color}`
  if (iconos.has(clave)) return iconos.get(clave).complete ? iconos.get(clave) : null
  const simbolo = document.getElementById(nombre)
  if (!simbolo) return null
  const caja = simbolo.getAttribute('viewBox') ?? '0 0 24 24'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${caja}" width="48" height="48" color="${color}" fill="currentColor">${simbolo.innerHTML}</svg>`
  const imagen = new Image()
  imagen.onload = alListo
  imagen.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  iconos.set(clave, imagen)
  return null
}

let rayado = null
function patronRayado(ctx, color) {
  if (rayado?.color === color) return rayado.patron
  const lienzo = document.createElement('canvas')
  lienzo.width = 6
  lienzo.height = 6
  const c = lienzo.getContext('2d')
  c.strokeStyle = color
  c.lineWidth = 1.5
  c.beginPath()
  c.moveTo(0, 6)
  c.lineTo(6, 0)
  c.stroke()
  rayado = { color, patron: ctx.createPattern(lienzo, 'repeat') }
  return rayado.patron
}

const SIN_GUION = []

function trazar(ctx, p, cerrar) {
  ctx.beginPath()
  ctx.moveTo(p[0], p[1])
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1])
  if (cerrar) ctx.closePath()
}

/* Pinta las figuras. `ancho` y `alto` son px CSS; `dpr`, la densidad. */
export function pintar(ctx, figuras, paleta, { ancho, alto, dpr, alCargarIcono }) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, ancho, alto)
  ctx.lineJoin = 'round'
  const fuenteRotulo = `700 ${paleta.tamanoRotulo}px ${paleta.fuenteMono}`
  /* Solo se cambia el estado del contexto cuando de verdad cambia: asignar un
     color obliga al canvas a interpretarlo, y son miles por cuadro. */
  let alfa = 1
  let relleno = null
  let trazo = null
  let grosor = 1
  let guion = SIN_GUION
  ctx.globalAlpha = 1
  ctx.lineWidth = 1
  ctx.setLineDash(SIN_GUION)
  const usar = (f) => {
    const a = f.a ?? 1
    if (a !== alfa) ctx.globalAlpha = alfa = a
    const g = f.guion ?? SIN_GUION
    if (g !== guion) ctx.setLineDash(guion = g)
  }

  for (const f of figuras) {
    if (f.t === 'pol') {
      usar(f)
      trazar(ctx, f.p, true)
      if (f.relleno) {
        if (f.relleno !== relleno) {
          relleno = f.relleno
          ctx.fillStyle = relleno === 'rayado' ? patronRayado(ctx, paleta.peligro) : paleta.color(relleno)
        }
        ctx.fill()
      }
      if (f.trazo) {
        if (f.trazo !== trazo) ctx.strokeStyle = paleta.color(trazo = f.trazo)
        const w = f.ancho ?? 1
        if (w !== grosor) ctx.lineWidth = grosor = w
        ctx.stroke()
      }
    } else if (f.t === 'lin') {
      usar(f)
      ctx.beginPath()
      for (let i = 0; i < f.p.length; i += 4) {
        ctx.moveTo(f.p[i], f.p[i + 1])
        ctx.lineTo(f.p[i + 2], f.p[i + 3])
      }
      if (f.trazo !== trazo) ctx.strokeStyle = paleta.color(trazo = f.trazo)
      if (grosor !== 1) ctx.lineWidth = grosor = 1
      ctx.stroke()
    } else if (f.t === 'txt') {
      usar(f)
      relleno = null
      /* Texto sobre su plano: la matriz lleva 1 m a px; se escribe a 100 px y
         se escala, porque el canvas no dibuja bien fuentes de fracciones de px. */
      const k = f.alto / 100
      const [a, b, c, d, e, g] = f.m
      ctx.setTransform(dpr * a * k, dpr * b * k, dpr * c * k, dpr * d * k, dpr * e, dpr * g)
      ctx.font = `${f.color === 'fuerte' ? 600 : 400} 100px ${paleta.fuenteMono}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = f.color === 'fuerte' ? paleta.texto : paleta.apagado
      ctx.fillText(f.texto, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    } else if (f.t === 'etq') {
      usar(f)
      relleno = null
      trazo = null
      grosor = 3
      const imagen = f.icono && icono(f.icono, paleta.texto, alCargarIcono)
      if (imagen) ctx.drawImage(imagen, f.x - 24, f.y - 10, 11, 11)
      ctx.font = fuenteRotulo
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.lineWidth = 3
      ctx.strokeStyle = paleta.superficie
      ctx.setLineDash([])
      ctx.strokeText(f.texto, f.x + 7, f.y)
      ctx.fillStyle = paleta.texto
      ctx.fillText(f.texto, f.x + 7, f.y)
    }
  }
  ctx.globalAlpha = 1
}
