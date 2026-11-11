/* Cámara de las vistas 3D (editor de plano y mapa de camas). Solo cálculo:
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
  return {
    escala,
    punto,
    poligono: (puntos) => puntos.map((p) => punto(...p).join(',')).join(' '),
    profundidad: g.profundidad,
    /* Una cara vertical se ve si su normal (hacia afuera) apunta a quien mira. */
    mira: (nx, ny) => nx * g.sin + ny * g.cos > 1e-9,
    /* Hacia dónde queda quien mira, en el plano del piso. */
    haciaCamara: [g.sin, g.cos],
  }
}

/* Desplazamiento en el piso (metros) que corresponde a mover dx, dy px en
   pantalla. Con la cámara casi rasante el eje vertical se acota para que un
   arrastre corto no mande el plano lejos. */
export function pantallaAPiso(camara, escala, dx, dy) {
  const g = girador(camara.azimut, camara.elevacion)
  const a = dx / escala
  const b = dy / (escala * Math.max(g.sinE, 0.2))
  return { x: a * g.cos + b * g.sin, y: -a * g.sin + b * g.cos }
}

/* Acerca o aleja dejando fijo el punto del piso que está bajo (px, py). */
export function zoomHacia(camara, factor, area, base, px, py) {
  const zoom = limitar(camara.zoom * factor, ZOOM_MIN, ZOOM_MAX)
  const antes = pantallaAPiso(camara, base * camara.zoom, px - area.cx, py - area.cy)
  const despues = pantallaAPiso(camara, base * zoom, px - area.cx, py - area.cy)
  return {
    ...camara,
    zoom,
    centro: { x: camara.centro.x + antes.x - despues.x, y: camara.centro.y + antes.y - despues.y },
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

/* Paso intermedio de una animación (t de 0 a 1). El azimut va por el giro
   más corto. */
export function interpolar(a, b, t) {
  const k = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
  const giro = ((b.azimut - a.azimut + 540) % 360) - 180
  const mezcla = (u, v) => u + (v - u) * k
  return {
    azimut: a.azimut + giro * k,
    elevacion: mezcla(a.elevacion, b.elevacion),
    /* El zoom se interpola en escala logarítmica: así acercarse se siente parejo. */
    zoom: Math.exp(mezcla(Math.log(a.zoom), Math.log(b.zoom))),
    centro: { x: mezcla(a.centro.x, b.centro.x), y: mezcla(a.centro.y, b.centro.y) },
  }
}

/* Muros del fondo de una habitación: los lados cuya cara interior mira a
   quien observa. Los del frente no se dibujan (corte tipo maqueta), para que
   no tapen las camas. */
export function murosDelFondo(zona, vista, alto = ALTO_MURO) {
  const x1 = zona.x + zona.ancho
  const y1 = zona.y + zona.alto
  const lados = [
    { normal: [0, -1], a: [zona.x, zona.y], b: [x1, zona.y] },
    { normal: [-1, 0], a: [zona.x, zona.y], b: [zona.x, y1] },
    { normal: [0, 1], a: [zona.x, y1], b: [x1, y1] },
    { normal: [1, 0], a: [x1, zona.y], b: [x1, y1] },
  ]
  return lados
    .filter((l) => !vista.mira(...l.normal))
    .map((l) => ({
      clave: l.normal.join(','),
      lateral: l.normal[0] !== 0,
      puntos: vista.poligono([[...l.a, 0], [...l.b, 0], [...l.b, alto], [...l.a, alto]]),
    }))
}

/* Punto sobre el muro del fondo de una habitación, para su rótulo. */
export function sobreElFondo(zona, vista, z) {
  const [dx, dy] = vista.haciaCamara
  const mitad = (zona.ancho / 2) * Math.abs(dx) + (zona.alto / 2) * Math.abs(dy)
  return vista.punto(zona.x + zona.ancho / 2 - dx * mitad, zona.y + zona.alto / 2 - dy * mitad, z)
}

/* Orden de dibujo: primero lo que queda lejos. */
export const deAtrasAdelante = (vista, centro) => (a, b) => {
  const [ax, ay] = centro(a)
  const [bx, by] = centro(b)
  return vista.profundidad(ax, ay) - vista.profundidad(bx, by)
}
