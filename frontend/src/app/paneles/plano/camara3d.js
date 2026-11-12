/* Cámara del plano 3D de camas (se pinta en canvas, ver escena3d.js). Solo cálculo:
   sin React ni DOM, para probarla con `node --test`.

   La cámara es { azimut, elevacion, zoom, centro: { x, y } }:
   - azimut: giro alrededor del eje vertical, en grados. Con 45° se ve el
     isométrico clásico (x baja a la derecha, y baja a la izquierda).
   - elevacion: cuánto se mira desde arriba, en grados. 90° es la planta;
     35,26° es el isométrico exacto.
   - zoom: multiplica la escala que encuadra todo en la vista inicial.
   - centro: el punto del piso (en metros) que cae en el medio de la pantalla.

   Proyección: se gira el piso según el azimut (xr, yr) y se inclina según la
   elevación. Lo que tiene yr mayor queda más cerca de quien mira. */

export const ALTO_MURO = 0.9
export const ELEVACION_MIN = 12
export const ELEVACION_MAX = 90
export const ZOOM_MIN = 0.35
export const ZOOM_MAX = 10
export const ISOMETRICO = Math.atan(1 / Math.SQRT2) * (180 / Math.PI)

const RAD = Math.PI / 180

export const camaraInicial = (caja) => ({
  azimut: 45,
  elevacion: ISOMETRICO,
  zoom: 1,
  centro: { x: (caja.x0 + caja.x1) / 2, y: (caja.y0 + caja.y1) / 2 },
})

const limitar = (v, min, max) => Math.min(Math.max(v, min), max)

/* Azimut entre 0 y 360 sin perder el sentido del giro. */
export const normalizarAzimut = (a) => ((a % 360) + 360) % 360

export function acotar(camara) {
  return {
    ...camara,
    azimut: normalizarAzimut(camara.azimut),
    elevacion: limitar(camara.elevacion, ELEVACION_MIN, ELEVACION_MAX),
    zoom: limitar(camara.zoom, ZOOM_MIN, ZOOM_MAX),
  }
}

/* Proyección pura, sin escala ni desplazamiento. */
function girador(azimut, elevacion) {
  const cos = Math.cos(azimut * RAD)
  const sin = Math.sin(azimut * RAD)
  const sinE = Math.sin(elevacion * RAD)
  const cosE = Math.cos(elevacion * RAD)
  return {
    cos, sin, sinE, cosE,
    plano: (x, y, z = 0) => {
      const xr = x * cos - y * sin
      const yr = x * sin + y * cos
      return [xr, yr * sinE - z * cosE]
    },
    profundidad: (x, y, z = 0) => (x * sin + y * cos) * cosE + z * sinE,
  }
}

/* Hueco de la pantalla que no tapan barras ni paneles. */
export function areaLibre(tamano, m) {
  const ancho = Math.max(120, tamano.ancho - m.izquierda - m.derecha)
  const alto = Math.max(120, tamano.alto - m.arriba - m.abajo)
  return { x: m.izquierda, y: m.arriba, ancho, alto, cx: m.izquierda + ancho / 2, cy: m.arriba + alto / 2 }
}

/* Px por metro con zoom 1: lo que encuadra la caja en la vista inicial. Se
   calcula con la vista inicial y no con la actual para que el plano no
   cambie de tamaño mientras se gira. */
export function escalaBase(caja, area) {
  const g = girador(45, ISOMETRICO)
  const puntos = [
    g.plano(caja.x0, caja.y0, ALTO_MURO), g.plano(caja.x1, caja.y0, ALTO_MURO),
    g.plano(caja.x0, caja.y1), g.plano(caja.x1, caja.y1),
  ]
  const ancho = Math.max(...puntos.map((p) => p[0])) - Math.min(...puntos.map((p) => p[0]))
  const alto = Math.max(...puntos.map((p) => p[1])) - Math.min(...puntos.map((p) => p[1]))
  return Math.max(0.1, Math.min(area.ancho / ancho, area.alto / alto))
}

/* Todo lo que una vista necesita para dibujar con la cámara actual. */
export function proyector(camara, area, base) {
  const g = girador(camara.azimut, camara.elevacion)
  const escala = base * camara.zoom
  const [cx0, cy0] = g.plano(camara.centro.x, camara.centro.y)
  const punto = (x, y, z = 0) => {
    const [px, py] = g.plano(x, y, z)
    return [area.cx + (px - cx0) * escala, area.cy + (py - cy0) * escala]
  }
  /* Técnica de figura isométrica (ai-iso-skill): lo que se dibuja plano en
     coordenadas locales (en metros) cae sobre un plano 3D con una sola matriz
     [a, b, c, d, e, f], la de `setTransform` del canvas y `matrix()` de SVG. El
     plano parte de O con los ejes U y V. Como la proyección es afín, basta
     restar puntos. Se usa para el texto pintado en muros y pisos. */
  const plano = (O, U, V) => {
    const [ox, oy] = punto(...O)
    const [ux, uy] = punto(O[0] + U[0], O[1] + U[1], O[2] + U[2])
    const [vx, vy] = punto(O[0] + V[0], O[1] + V[1], O[2] + V[2])
    return [ux - ox, uy - oy, vx - ox, vy - oy, ox, oy]
  }
  /* Plano del piso centrado en (x, y) con el giro que deja el texto derecho
     y de izquierda a derecha en pantalla, mire de donde se mire. */
  const planoLegible = (x, y, z = 0) => {
    const ejes = [[1, 0], [0, 1], [-1, 0], [0, -1]]
    const [ux, uy] = ejes.reduce((mejor, e) => {
      const avance = (u) => punto(x + u[0], y + u[1], z)[0] - punto(x, y, z)[0]
      return avance(e) > avance(mejor) ? e : mejor
    })
    return plano([x, y, z], [ux, uy, 0], [-uy, ux, 0])
  }
  return {
    escala,
    punto,
    plano,
    planoLegible,
    /* Polígono en pantalla como lista plana [x0, y0, x1, y1, …]. Sin arreglos
       intermedios: se llama miles de veces por cuadro. */
    poligono: (puntos) => {
      const salida = []
      for (let i = 0; i < puntos.length; i++) {
        const [x, y, z = 0] = puntos[i]
        const xr = x * g.cos - y * g.sin
        const yr = x * g.sin + y * g.cos
        salida.push(area.cx + (xr - cx0) * escala, area.cy + (yr * g.sinE - z * g.cosE - cy0) * escala)
      }
      return salida
    },
    profundidad: g.profundidad,
    /* Una cara vertical se ve si su normal (hacia afuera) apunta a quien mira. */
    mira: (nx, ny) => nx * g.sin + ny * g.cos > 1e-9,
    /* Hacia dónde queda quien mira, en el plano del piso. */
    haciaCamara: [g.sin, g.cos],
  }
}

/* Cámara que encuadra una habitación con el giro actual. */
export function camaraSobre(camara, zona, area, base, holgura = 0.72) {
  const g = girador(camara.azimut, camara.elevacion)
  const x1 = zona.x + zona.ancho
  const y1 = zona.y + zona.alto
  const puntos = [[zona.x, zona.y], [x1, zona.y], [zona.x, y1], [x1, y1]]
    .flatMap(([x, y]) => [g.plano(x, y, 0), g.plano(x, y, ALTO_MURO + 0.3)])
  const ancho = Math.max(...puntos.map((p) => p[0])) - Math.min(...puntos.map((p) => p[0]))
  const alto = Math.max(...puntos.map((p) => p[1])) - Math.min(...puntos.map((p) => p[1]))
  const escala = Math.min((area.ancho * holgura) / ancho, (area.alto * holgura) / alto)
  return acotar({ ...camara, zoom: escala / base, centro: { x: zona.x + zona.ancho / 2, y: zona.y + zona.alto / 2 } })
}

/* Giro para mirar una habitación desde el pasillo más cercano (su lado
   abierto), con un poco de ángulo para ver dos muros y las camas de tres
   cuartos. Sin pasillos devuelve null y se conserva el giro actual. */
export const SESGO_TRES_CUARTOS = 30
export function azimutDesdePasillo(zona, zonas) {
  const cx = zona.x + zona.ancho / 2
  const cy = zona.y + zona.alto / 2
  let mejor = null
  for (const p of zonas) {
    if (p.tipo !== 'pasillo') continue
    const px = Math.min(Math.max(cx, p.x), p.x + p.ancho)
    const py = Math.min(Math.max(cy, p.y), p.y + p.alto)
    const d = Math.hypot(px - cx, py - cy)
    if (!mejor || d < mejor.d) mejor = { d, dx: px - cx, dy: py - cy }
  }
  if (!mejor || mejor.d < 1e-6) return null
  /* Quien mira queda hacia (sen az, cos az): se apunta al pasillo. */
  const az = (Math.atan2(mejor.dx, mejor.dy) * 180) / Math.PI + SESGO_TRES_CUARTOS
  return normalizarAzimut(az)
}

/* Cámara que gira hacia una habitación y la encuadra; con `centro`, centra
   ese punto (por ejemplo, entre la habitación y la cama elegida). */
export function camaraHacia(camara, zona, area, base, { azimut = camara.azimut, elevacion = camara.elevacion, centro } = {}) {
  const girada = acotar({ ...camara, azimut, elevacion })
  const c = camaraSobre(girada, zona, area, base, 0.62)
  return centro ? { ...c, centro } : c
}

/* ── Animación de la cámara ─────────────────────────────────────────── */

/* Curva de velocidad: arranca y llega despacio (ease-in-out cúbica). */
export const suavizar = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
/* Para girar: igual de suave al empezar y al llegar, pero sin picos de velocidad. */
const suavizarGiro = (t) => (1 - Math.cos(Math.PI * t)) / 2
const entre = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)))
const giroCorto = (a, b) => ((b - a + 540) % 360) - 180

/* Curvatura del vuelo: cuánto se aleja para viajar (el valor que usan los
   mapas, √2 ≈ 1,42). */
const RHO = 1.42
/* Velocidad percibida: anchos de pantalla por segundo. */
const VELOCIDAD = 0.85

/* Vuelo de una cámara a otra con zoom y desplazamiento óptimos (van Wijk y
   Nuij, «Smooth and efficient zooming and panning», el mismo de los mapas
   web): se aleja, viaja y se acerca en una sola curva, con velocidad percibida
   constante. El giro y la inclinación se reparten en la segunda parte del
   vuelo, para llegar ya mirando la habitación. Un giro sin viaje «respira»:
   se abre un poco y vuelve.

   `anchoVista` es el ancho visible en metros con zoom 1. Devuelve
   { duracion (ms), en(t) } con t de 0 a 1. */
export function vuelo(a, b, anchoVista) {
  const w0 = anchoVista / a.zoom
  const w1 = anchoVista / b.zoom
  const dx = b.centro.x - a.centro.x
  const dy = b.centro.y - a.centro.y
  const u1 = Math.hypot(dx, dy)
  const giro = giroCorto(a.azimut, b.azimut)
  const inclinacion = b.elevacion - a.elevacion

  let S
  let ancho
  let avance
  if (u1 < w0 * 1e-3) {
    /* Sin viaje: solo acercarse o alejarse. */
    S = Math.abs(Math.log(w1 / w0)) / RHO
    const k = w1 < w0 ? -1 : 1
    ancho = (s) => w0 * Math.exp(k * RHO * s)
    avance = () => 0
  } else {
    const bi = (wi, signo) => (w1 * w1 - w0 * w0 + signo * RHO ** 4 * u1 * u1) / (2 * wi * RHO * RHO * u1)
    const r = (x) => Math.log(-x + Math.sqrt(x * x + 1))
    const r0 = r(bi(w0, 1))
    const r1 = r(bi(w1, -1))
    S = (r1 - r0) / RHO
    ancho = (s) => (w0 * Math.cosh(r0)) / Math.cosh(RHO * s + r0)
    avance = (s) => ((w0 / (RHO * RHO)) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0))) / u1
    if (!Number.isFinite(S)) {
      S = Math.log(1 + u1 / w0)
      ancho = (s) => w0 + (w1 - w0) * (s / S)
      avance = (s) => s / S
    }
  }
  const respiro = u1 < w0 * 0.05 && Math.abs(giro) > 1 ? 0.07 * Math.min(1, Math.abs(giro) / 90) : 0
  const duracionViaje = (S / VELOCIDAD) * 1000
  const duracionGiro = 800 + 700 * Math.min(1, Math.abs(giro) / 180) + 8 * Math.abs(inclinacion)
  const duracion = Math.min(2800, Math.max(900, duracionViaje, Math.abs(giro) > 1 || Math.abs(inclinacion) > 1 ? duracionGiro : 0))

  const en = (t) => {
    if (t >= 1) return b
    const k = suavizar(t)
    const s = k * S
    const w = S > 0 ? ancho(s) : w0
    const f = S > 0 ? avance(s) : k
    /* El giro empieza un poco después de despegar y termina al llegar. */
    const kg = suavizarGiro(entre(t, u1 > w0 * 0.05 ? 0.15 : 0, 1))
    return {
      azimut: a.azimut + giro * kg,
      elevacion: a.elevacion + inclinacion * kg,
      zoom: Math.max(ZOOM_MIN, (anchoVista / w) * (1 - respiro * Math.sin(Math.PI * t))),
      centro: { x: a.centro.x + dx * f, y: a.centro.y + dy * f },
    }
  }
  return { duracion, en }
}

/* Deriva sutil en reposo: un vaivén lento de giro e inclinación (unos pocos
   grados, periodos largos y distintos para que no se note el ciclo), que
   entra de a poco para no dar un salto. `segundos` desde que quedó quieta. */
export function deriva(camara, segundos) {
  const entrada = 1 - Math.exp(-segundos / 2)
  return {
    ...camara,
    azimut: camara.azimut + 2.2 * entrada * Math.sin((2 * Math.PI * segundos) / 17),
    elevacion: camara.elevacion + 0.9 * entrada * Math.sin((2 * Math.PI * segundos) / 23),
  }
}

/* Muros del fondo de una habitación: los lados cuya cara interior mira a quien
   observa, como cajas finas por dentro del borde ({ x0, x1, y0, y1 }). Los del
   frente no se dibujan (corte tipo maqueta), para que no tapen las camas. */
export function murosDelFondo(zona, vista, grosor = 0.1) {
  const [x0, y0, x1, y1] = [zona.x, zona.y, zona.x + zona.ancho, zona.y + zona.alto]
  return [
    { normal: [0, -1], cajon: [x0, x1, y0, y0 + grosor] },
    { normal: [-1, 0], cajon: [x0, x0 + grosor, y0, y1] },
    { normal: [0, 1], cajon: [x0, x1, y1 - grosor, y1] },
    { normal: [1, 0], cajon: [x1 - grosor, x1, y0, y1] },
  ]
    .filter((m) => !vista.mira(...m.normal))
    .map((m) => ({ ...m, clave: m.normal.join(',') }))
}

/* Plano para rotular una habitación sobre la cara interior de su muro del
   fondo más visible, centrado a media altura y con el texto de izquierda a
   derecha. Devuelve null si ningún muro se ve lo bastante (vista cenital). */
export function rotuloEnMuro(zona, vista, alto = ALTO_MURO, grosor = 0.1) {
  const [x0, y0, x1, y1] = [zona.x, zona.y, zona.x + zona.ancho, zona.y + zona.alto]
  const caras = {
    '0,-1': [[x0, y0 + grosor], [x1, y0 + grosor]],
    '-1,0': [[x0 + grosor, y0], [x0 + grosor, y1]],
    '0,1': [[x0, y1 - grosor], [x1, y1 - grosor]],
    '1,0': [[x1 - grosor, y0], [x1 - grosor, y1]],
  }
  const z = alto / 2
  let mejor = null
  for (const m of murosDelFondo(zona, vista, grosor)) {
    const [a, b] = caras[m.clave]
    const avance = vista.punto(b[0], b[1], z)[0] - vista.punto(a[0], a[1], z)[0]
    const alzado = vista.punto(a[0], a[1], 0)[1] - vista.punto(a[0], a[1], alto)[1]
    if (alzado < 6) continue
    if (!mejor || Math.abs(avance) > Math.abs(mejor.avance)) mejor = { a, b, avance }
  }
  if (!mejor) return null
  const { a, b, avance } = mejor
  const largo = Math.hypot(b[0] - a[0], b[1] - a[1])
  const signo = avance >= 0 ? 1 : -1
  const U = [((b[0] - a[0]) / largo) * signo, ((b[1] - a[1]) / largo) * signo, 0]
  return vista.plano([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], U, [0, 0, -1])
}

/* Orden de dibujo: primero lo que queda lejos. */
export const deAtrasAdelante = (vista, centro) => (a, b) => {
  const [ax, ay] = centro(a)
  const [bx, by] = centro(b)
  return vista.profundidad(ax, ay) - vista.profundidad(bx, by)
}
