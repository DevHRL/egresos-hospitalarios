/* Cámara de las vistas 3D: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SESGO_TRES_CUARTOS, areaLibre, azimutDesdePasillo, camaraHacia, camaraInicial, camaraSobre, deriva, escalaBase, murosDelFondo, proyector, vuelo,
} from '../src/app/paneles/plano/camara3d.js'

const caja = { x0: 0, y0: 0, x1: 40, y1: 12 }
const area = areaLibre({ ancho: 1000, alto: 600 }, { arriba: 0, abajo: 0, izquierda: 0, derecha: 0 })
const base = escalaBase(caja, area)
const cerca = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`)

test('la vista inicial es el isométrico de siempre y centra la caja', () => {
  const v = proyector(camaraInicial(caja), area, base)
  const [cx, cy] = v.punto(20, 6)
  cerca(cx, area.cx, 'x del centro')
  cerca(cy, area.cy, 'y del centro')
  /* x baja a la derecha y y baja a la izquierda, ambos a 30°. */
  const [ax, ay] = v.punto(0, 0)
  const [bx, by] = v.punto(1, 0)
  const [dx, dy] = v.punto(0, 1)
  cerca((by - ay) / (bx - ax), Math.tan(Math.PI / 6), 'pendiente de x')
  cerca((dy - ay) / (ax - dx), Math.tan(Math.PI / 6), 'pendiente de y')
})

test('al elegir una habitación se la mira desde su pasillo, de tres cuartos', () => {
  /* Habitación arriba del pasillo: quien mira queda hacia +y (abajo). */
  const sala = { x: 2, y: 0, ancho: 4, alto: 4, tipo: 'habitacion' }
  const pasillo = { x: 0, y: 4, ancho: 20, alto: 2, tipo: 'pasillo' }
  cerca(azimutDesdePasillo(sala, [sala, pasillo]), SESGO_TRES_CUARTOS, 'pasillo abajo')
  /* Pasillo a la derecha (+x): azimut 90° más el sesgo. */
  const lateral = { x: 6, y: 0, ancho: 2, alto: 10, tipo: 'pasillo' }
  cerca(azimutDesdePasillo(sala, [sala, lateral]), 90 + SESGO_TRES_CUARTOS, 'pasillo a la derecha')
  assert.equal(azimutDesdePasillo(sala, [sala]), null)
  const v = proyector({ ...camaraInicial(caja), azimut: azimutDesdePasillo(sala, [sala, pasillo]) }, area, base)
  assert.ok(v.mira(0, 1), 'la cara que da al pasillo mira a la cámara')
})

test('el destino de la cámara gira, inclina y centra lo pedido', () => {
  const sala = { x: 30, y: 1, ancho: 5, alto: 4 }
  const c = camaraHacia(camaraInicial(caja), sala, area, base, { azimut: 210, elevacion: 50, centro: { x: 31, y: 2 } })
  assert.deepEqual([c.azimut, c.elevacion, c.centro], [210, 50, { x: 31, y: 2 }])
  assert.ok(c.zoom > 1)
})

test('solo se dibujan los dos muros del fondo y cambian al girar', () => {
  const zona = { x: 2, y: 2, ancho: 4, alto: 3 }
  const muros = (azimut) => murosDelFondo(zona, proyector({ ...camaraInicial(caja), azimut }, area, base)).map((m) => m.clave).sort()
  assert.deepEqual(muros(45), ['-1,0', '0,-1'])
  assert.deepEqual(muros(225), ['0,1', '1,0'])
})

test('enfocar centra la habitación y la acerca', () => {
  const zona = { x: 30, y: 1, ancho: 5, alto: 4 }
  const c = camaraSobre(camaraInicial(caja), zona, area, base)
  assert.deepEqual(c.centro, { x: 32.5, y: 3 })
  assert.ok(c.zoom > 1)
})

const anchoVista = 1000 / base
const sala = (x) => ({ ...camaraInicial(caja), zoom: 4, centro: { x, y: 3 } })
const cuadrosDe = ({ duracion, en }) => {
  const n = Math.ceil(duracion / 16.7)
  return Array.from({ length: n + 1 }, (_, i) => en(i / n))
}

test('el giro va por el camino más corto', () => {
  const a = { ...camaraInicial(caja), azimut: 350 }
  const medio = vuelo(a, { ...a, azimut: 10 }, anchoVista).en(0.5)
  cerca(((medio.azimut % 360) + 360) % 360, 0, 'azimut a mitad de camino')
})

test('entre habitaciones lejanas se aleja, viaja y se vuelve a acercar', () => {
  const v = vuelo(sala(5), { ...sala(35), azimut: 225 }, anchoVista)
  const zooms = cuadrosDe(v).map((c) => c.zoom)
  const minimo = Math.min(...zooms)
  const iMin = zooms.indexOf(minimo)
  assert.ok(minimo < 4 * 0.6, `se aleja hasta ${minimo.toFixed(2)}×`)
  assert.ok(iMin > zooms.length * 0.3 && iMin < zooms.length * 0.7, 'lo más lejos queda a mitad del vuelo')
  /* Primero se aleja (zoom baja) y al final se acerca (zoom sube). */
  assert.ok(zooms[Math.floor(zooms.length * 0.2)] < zooms[0] && zooms.at(-1) > zooms[Math.floor(zooms.length * 0.8)])
  assert.ok(v.duracion > 1500 && v.duracion <= 2800)
  const cercano = vuelo(sala(5), sala(6), anchoVista)
  assert.ok(Math.min(...cuadrosDe(cercano).map((c) => c.zoom)) > 4 * 0.85, 'a la habitación vecina casi no se aleja')
})

test('ningún cuadro salta, y arranca y llega despacio', () => {
  for (const [a, b] of [[sala(5), { ...sala(35), azimut: 225 }], [sala(5), { ...sala(5), azimut: 135 }], [camaraInicial(caja), sala(20)]]) {
    const c = cuadrosDe(vuelo(a, b, anchoVista))
    const saltos = c.slice(1).map((p, i) => ({
      giro: Math.abs(((p.azimut - c[i].azimut + 540) % 360) - 180),
      /* Lo que se ve: el desplazamiento en px de pantalla con el zoom de ese cuadro. */
      px: Math.hypot(p.centro.x - c[i].centro.x, p.centro.y - c[i].centro.y) * base * Math.max(p.zoom, c[i].zoom),
      zoom: Math.abs(Math.log(p.zoom / c[i].zoom)),
    }))
    assert.ok(Math.max(...saltos.map((x) => x.giro)) < 4, 'giro por cuadro')
    assert.ok(Math.max(...saltos.map((x) => x.px)) < 40, 'px por cuadro')
    assert.ok(Math.max(...saltos.map((x) => x.zoom)) < 0.06, 'zoom por cuadro')
    const total = (x) => x.giro + x.px / 10 + x.zoom * 20
    const medio = total(saltos[Math.floor(saltos.length / 2)])
    assert.ok(total(saltos[0]) < medio / 5 && total(saltos.at(-1)) < medio / 5, 'arranca y llega despacio')
    assert.deepEqual(c.at(-1), b)
  }
})

test('girar sin viajar también se anima, con un respiro de zoom', () => {
  const a = sala(5)
  const v = vuelo(a, { ...a, azimut: a.azimut + 90 }, anchoVista)
  assert.ok(v.duracion >= 1100)
  assert.ok(v.en(0.5).zoom < 4 * 0.97 && v.en(0.5).zoom > 4 * 0.9)
})

test('la deriva en reposo es sutil y entra sin salto', () => {
  const c = sala(5)
  cerca(deriva(c, 0).azimut, c.azimut, 'sin salto al empezar')
  const giros = Array.from({ length: 400 }, (_, i) => deriva(c, i / 10).azimut - c.azimut)
  assert.ok(Math.max(...giros.map(Math.abs)) < 2.5)
  assert.equal(deriva(c, 30).zoom, c.zoom)
})
