/* Cámara de las vistas 3D: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SESGO_TRES_CUARTOS, areaLibre, azimutDesdePasillo, camaraHacia, camaraInicial, camaraSobre, escalaBase, interpolar, murosDelFondo, proyector, recorrido,
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

test('la animación gira por el camino más corto', () => {
  const a = { ...camaraInicial(caja), azimut: 350 }
  const b = { ...a, azimut: 10 }
  const medio = interpolar(a, b, 0.5)
  cerca(((medio.azimut % 360) + 360) % 360, 0, 'azimut a mitad de camino')
})

test('el paso entre habitaciones lejanas dura más y se aleja a mitad de camino', () => {
  const cerca = { ...camaraInicial(caja), zoom: 4, centro: { x: 5, y: 3 } }
  const vecina = { ...cerca, centro: { x: 6, y: 3 } }
  const lejana = { ...cerca, azimut: 225, centro: { x: 35, y: 3 } }
  const ancho = 1000 / (base * 4)
  const corto = recorrido(cerca, vecina, ancho)
  const largo = recorrido(cerca, lejana, ancho)
  assert.equal(corto.arco, 0)
  assert.ok(largo.arco > 0.2 && largo.arco <= 0.45)
  assert.ok(corto.duracion >= 700 && largo.duracion <= 1500 && largo.duracion > corto.duracion + 400)
  const medio = interpolar(cerca, lejana, 0.5, { arco: largo.arco })
  assert.ok(medio.zoom < 4 * 0.8, `zoom a mitad de camino: ${medio.zoom}`)
})

test('la animación no salta: de un cuadro a otro cambia poco, y arranca y llega despacio', () => {
  const a = { ...camaraInicial(caja), zoom: 4, centro: { x: 5, y: 3 } }
  const b = { ...a, azimut: 225, centro: { x: 35, y: 3 } }
  const { duracion, arco } = recorrido(a, b, 1000 / (base * 4))
  const cuadros = Math.ceil(duracion / 16.7)
  const pasos = Array.from({ length: cuadros + 1 }, (_, i) => interpolar(a, b, i / cuadros, { arco }))
  const saltoGiro = Math.max(...pasos.slice(1).map((p, i) => Math.abs(p.azimut - pasos[i].azimut)))
  const saltoCentro = Math.max(...pasos.slice(1).map((p, i) => Math.hypot(p.centro.x - pasos[i].centro.x, p.centro.y - pasos[i].centro.y)))
  assert.ok(saltoGiro < 6, `giro por cuadro: ${saltoGiro}`)
  assert.ok(saltoCentro < 1.2, `metros por cuadro: ${saltoCentro}`)
  /* Suave al empezar y al terminar: el primer y el último paso son mucho menores que el del medio. */
  const paso = (i) => Math.abs(pasos[i + 1].azimut - pasos[i].azimut)
  assert.ok(paso(0) < paso(Math.floor(cuadros / 2)) / 10 && paso(cuadros - 1) < paso(Math.floor(cuadros / 2)) / 10)
  assert.deepEqual([(pasos.at(-1).azimut + 360) % 360, pasos.at(-1).zoom, pasos.at(-1).centro], [225, 4, b.centro])
})
