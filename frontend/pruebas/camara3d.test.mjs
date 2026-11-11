/* Cámara de las vistas 3D: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  areaLibre, camaraInicial, camaraSobre, escalaBase, interpolar, murosDelFondo, pantallaAPiso, proyector, zoomHacia,
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

test('arrastrar en pantalla y volver a proyectar deja el punto donde estaba', () => {
  for (const azimut of [0, 45, 130, 270]) {
    const camara = { ...camaraInicial(caja), azimut, elevacion: 50 }
    const v = proyector(camara, area, base)
    const d = pantallaAPiso(camara, v.escala, 37, -21)
    const [x0, y0] = v.punto(5, 5)
    const [x1, y1] = v.punto(5 + d.x, 5 + d.y)
    cerca(x1 - x0, 37, `dx con azimut ${azimut}`)
    cerca(y1 - y0, -21, `dy con azimut ${azimut}`)
  }
})

test('el zoom con la rueda deja fijo el punto bajo el cursor', () => {
  const camara = { ...camaraInicial(caja), azimut: 200 }
  const antes = proyector(camara, area, base)
  const cursor = [300, 200]
  const d = pantallaAPiso(camara, antes.escala, cursor[0] - area.cx, cursor[1] - area.cy)
  const piso = [camara.centro.x + d.x, camara.centro.y + d.y]
  const despues = proyector(zoomHacia(camara, 2, area, base, ...cursor), area, base)
  const [px, py] = despues.punto(...piso)
  cerca(px, cursor[0], 'x bajo el cursor')
  cerca(py, cursor[1], 'y bajo el cursor')
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
