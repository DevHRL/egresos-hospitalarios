/* Escena 3D que se pinta en canvas: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { areaLibre, camaraInicial, escalaBase, proyector } from '../src/app/paneles/plano/camara3d.js'
import { bajoElPuntero, construirEscena, dentro } from '../src/app/paneles/plano/escena3d.js'

const plano = JSON.parse(fs.readFileSync(new URL('../src/app/datos/planos/medicina-b-piso2.json', import.meta.url), 'utf8'))
const caja = { x0: 0, y0: 0, x1: 53, y1: 17 }
const pantalla = { ancho: 1300, alto: 450 }
const area = areaLibre(pantalla, { arriba: 18, abajo: 58, izquierda: 18, derecha: 18 })
const base = escalaBase(caja, area)
const vistaCon = (cambios = {}) => proyector({ ...camaraInicial(caja), ...cambios }, area, base)
const infoDe = (c) => ({ estado: c.codigo === 'B-03' ? 'ocupada' : 'libre', falla: false, icono: 'sh-check' })
const escena = (cambios, extra = {}) => construirEscena({ vista: vistaCon(cambios), zonas: plano.zonas, camas: plano.camas, infoDe, pantalla, ...extra })

test('cada cama tiene su zona sensible y su rótulo, encima de todo', () => {
  const { figuras, sensibles } = escena()
  assert.equal(figuras.filter((f) => f.t === 'etq').length, plano.camas.length)
  assert.equal(figuras.at(-1).t, 'etq')
  assert.equal(new Set(sensibles.filter((s) => s.tipo === 'cama').map((s) => s.id)).size, plano.camas.length)
})

test('solo la cama ocupada lleva frazada, con el color de su estado', () => {
  const { figuras } = escena({ zoom: 3 })
  const frazadas = figuras.filter((f) => f.relleno?.endsWith('frazada:ocupada'))
  assert.ok(frazadas.length > 0)
  assert.ok(!figuras.some((f) => f.relleno?.endsWith('frazada:libre')))
})

test('de lejos la cama es liviana; de cerca lleva todo el detalle', () => {
  const lejos = escena({ zoom: 0.8 }).figuras.length
  const cerca = construirEscena({ vista: vistaCon({ zoom: 0.8 }), zonas: plano.zonas, camas: plano.camas, infoDe }).figuras.length
  assert.equal(lejos, cerca)
  const porCama = (zoom) => {
    const sola = plano.camas.filter((c) => c.codigo === 'B-03')
    return construirEscena({ vista: vistaCon({ zoom }), zonas: plano.zonas.filter((z) => z.id === sola[0].zonaId), camas: sola, infoDe }).figuras.length
  }
  assert.ok(porCama(4) > 2 * porCama(0.8), `${porCama(4)} vs ${porCama(0.8)}`)
})

test('acercado a una habitación, lo que queda fuera de la pantalla no se calcula', () => {
  const todo = escena().figuras.length
  const cerca = escena({ zoom: 6, centro: { x: 45, y: 3 } })
  assert.ok(cerca.sensibles.filter((s) => s.tipo === 'zona').length < 8)
  assert.ok(cerca.figuras.length < todo * 3)
})

test('al enfocar, el resto se atenúa y la habitación en foco no', () => {
  const zona = plano.zonas.find((z) => z.codigo === 'B-H06')
  const { figuras } = escena({}, { foco: zona, atenuacion: 1 })
  assert.ok(figuras.some((f) => f.a < 0.2))
  assert.ok(figuras.some((f) => f.trazo === 'vivo'))
})

test('el puntero encuentra la cama encima y, si no, la habitación', () => {
  const { sensibles } = escena({ zoom: 3, centro: { x: 30, y: 3 } })
  const cama = sensibles.find((s) => s.tipo === 'cama')
  const p = cama.poligonos[0]
  const [x, y] = [(p[0] + p[4]) / 2, (p[1] + p[5]) / 2]
  assert.equal(bajoElPuntero(sensibles, x, y).id, cama.id)
  assert.equal(bajoElPuntero(sensibles, -500, -500), null)
  assert.equal(dentro([0, 0, 10, 0, 10, 10, 0, 10], 5, 5), true)
  assert.equal(dentro([0, 0, 10, 0, 10, 10, 0, 10], 15, 5), false)
})
