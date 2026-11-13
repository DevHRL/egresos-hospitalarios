/* Escena 3D que se pinta en canvas: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { areaLibre, camaraInicial, escalaBase, proyector } from '../src/app/paneles/plano/camara3d.js'
import { bajoElPuntero, construirEscena, dentro } from '../src/app/paneles/plano/escena3d.js'

const piso = JSON.parse(fs.readFileSync(new URL('../src/app/datos/planos/medicina-b-piso2.json', import.meta.url), 'utf8'))
/* Medicina B e Intermedios ocupan el suroeste del piso (x de 0 a 53, y de 38 a 55).
   Las pruebas usan solo esa parte, para que todo quede en pantalla. */
const caja = { x0: 0, y0: 38, x1: 53, y1: 55 }
const zonasSuroeste = piso.zonas.filter((z) => z.x + z.ancho <= caja.x1 && z.y >= caja.y0)
const plano = { zonas: zonasSuroeste, camas: piso.camas.filter((c) => zonasSuroeste.some((z) => z.id === c.zonaId)) }
const pantalla = { ancho: 1300, alto: 450 }
const area = areaLibre(pantalla, { arriba: 18, abajo: 58, izquierda: 18, derecha: 18 })
const base = escalaBase(caja, area)
const vistaCon = (cambios = {}) => proyector({ ...camaraInicial(caja), ...cambios }, area, base)
const infoDe = (c) => ({ estado: c.codigo === 'B-03' ? 'ocupada' : 'libre', ocupada: c.codigo === 'B-03', falla: false, icono: 'sh-check', marca: c.codigo === 'B-03' ? 'O2' : null })
/* Rótulos encendidos en todas las habitaciones, salvo en las pruebas de rótulos. */
const todos = () => 1
const escena = (cambios, extra = {}) => construirEscena({ vista: vistaCon(cambios), zonas: plano.zonas, camas: plano.camas, infoDe, pantalla, rotuloDe: todos, ...extra })

test('en la vista general no hay rótulos de cama; al enfocar, solo los de esa habitación', () => {
  const general = escena({}, { rotuloDe: null })
  assert.equal(general.figuras.filter((f) => f.t === 'etq').length, 0)
  assert.equal(new Set(general.sensibles.filter((s) => s.tipo === 'cama').map((s) => s.id)).size, plano.camas.length, 'las camas se siguen pudiendo elegir')
  const zona = plano.zonas.find((z) => z.codigo === 'B-H06')
  const enFoco = escena({}, { rotuloDe: null, foco: zona })
  const propias = plano.camas.filter((c) => c.zonaId === zona.id).map((c) => c.codigo).sort()
  assert.deepEqual(enFoco.figuras.filter((f) => f.t === 'etq').map((f) => f.texto).sort(), propias)
})

test('cada cama tiene su zona sensible y su rótulo, encima de todo', () => {
  const { figuras, sensibles } = escena()
  assert.equal(figuras.filter((f) => f.t === 'etq').length, plano.camas.length)
  assert.equal(figuras.at(-1).t, 'etq')
  assert.equal(new Set(sensibles.filter((s) => s.tipo === 'cama').map((s) => s.id)).size, plano.camas.length)
})

test('solo la cama ocupada lleva al paciente: cuerpo con el color de su estado y cabeza', () => {
  const { figuras } = escena({ zoom: 3 })
  assert.ok(figuras.some((f) => f.relleno?.endsWith('frazada:ocupada')))
  assert.ok(!figuras.some((f) => f.relleno?.endsWith('frazada:libre')))
  assert.equal(figuras.filter((f) => f.relleno === 'piel').length, 1, 'una cabeza, la del único paciente')
})

test('la marca de O2 o VM va en el rótulo de la cama, no en el color', () => {
  const { figuras } = escena()
  const marcas = figuras.filter((f) => f.t === 'etq' && f.marca)
  assert.deepEqual(marcas.map((f) => [f.texto, f.marca]), [['B-03', 'O2']])
})

test('de lejos la cama es liviana; de cerca lleva todo el detalle', () => {
  const lejos = escena({ zoom: 0.8 }).figuras.length
  const cerca = construirEscena({ vista: vistaCon({ zoom: 0.8 }), zonas: plano.zonas, camas: plano.camas, infoDe, rotuloDe: todos }).figuras.length
  assert.equal(lejos, cerca)
  const porCama = (zoom) => {
    const sola = plano.camas.filter((c) => c.codigo === 'B-03')
    return construirEscena({ vista: vistaCon({ zoom }), zonas: plano.zonas.filter((z) => z.id === sola[0].zonaId), camas: sola, infoDe }).figuras.length
  }
  assert.ok(porCama(4) > 2 * porCama(0.8), `${porCama(4)} vs ${porCama(0.8)}`)
})

test('acercado a una habitación, lo que queda fuera de la pantalla no se calcula', () => {
  const todo = escena().figuras.length
  const cerca = escena({ zoom: 6, centro: { x: 45, y: 41 } })
  assert.ok(cerca.sensibles.filter((s) => s.tipo === 'zona').length < 8)
  assert.ok(cerca.figuras.length < todo * 3)
})

test('al enfocar, el resto se atenúa y la habitación en foco no', () => {
  const zona = plano.zonas.find((z) => z.codigo === 'B-H06')
  const { figuras } = escena({}, { foco: zona, atenuacion: 1 })
  assert.ok(figuras.some((f) => f.a < 0.2))
  assert.ok(figuras.some((f) => f.relleno === 'piso-foco'), 'la habitación en foco se tiñe apenas')
  assert.ok(!figuras.some((f) => f.trazo === 'vivo'), 'sin contornos de color')
})

test('la cama elegida se posa sobre un halo con resplandor, sin contornos de color', () => {
  const elegida = plano.camas.find((c) => c.codigo === 'B-03')
  const { figuras } = escena({ zoom: 3 }, { seleccion: elegida.id })
  const halos = figuras.filter((f) => f.relleno === 'halo')
  assert.equal(halos.length, 1)
  assert.equal(halos[0].brillo, true)
  assert.ok(!figuras.some((f) => f.trazo === 'vivo'))
  const encima = escena({ zoom: 3 }, { encima: elegida.id }).figuras
  assert.equal(encima.filter((f) => f.relleno === 'halo-suave').length, 1)
  assert.ok(!encima.some((f) => f.brillo))
})

test('el puntero encuentra la cama encima y, si no, la habitación', () => {
  const { sensibles } = escena({ zoom: 3, centro: { x: 30, y: 41 } })
  const cama = sensibles.find((s) => s.tipo === 'cama')
  const p = cama.poligonos[0]
  const [x, y] = [(p[0] + p[4]) / 2, (p[1] + p[5]) / 2]
  assert.equal(bajoElPuntero(sensibles, x, y).id, cama.id)
  assert.equal(bajoElPuntero(sensibles, -500, -500), null)
  assert.equal(dentro([0, 0, 10, 0, 10, 10, 0, 10], 5, 5), true)
  assert.equal(dentro([0, 0, 10, 0, 10, 10, 0, 10], 15, 5), false)
})

/* Área elegida: aquí Intermedios. Medicina B queda atenuada y neutra. */
const servicioDe = new Map(plano.zonas.map((z) => [z.id, z.servicioId]))
const soloIntermedios = (zonaId) => (servicioDe.get(zonaId) && servicioDe.get(zonaId) !== 'medicina-intermedios' ? 0 : 1)
const camasDe = (servicio) => plano.camas.filter((c) => servicioDe.get(c.zonaId) === servicio)

test('las camas de otra área no se pueden elegir, no llevan rótulo ni se consultan', () => {
  const consultadas = new Set()
  const { figuras, sensibles } = escena({}, { activaDe: soloIntermedios, infoDe: (c) => { consultadas.add(c.id); return infoDe(c) } })
  const intermedios = camasDe('medicina-intermedios')
  assert.ok(intermedios.length > 0 && camasDe('medicina-b').length > 0)
  assert.deepEqual([...consultadas].sort(), intermedios.map((c) => c.id).sort())
  assert.equal(figuras.filter((f) => f.t === 'etq').length, intermedios.length)
  const camasSensibles = new Set(sensibles.filter((s) => s.tipo === 'cama').map((s) => s.id))
  assert.deepEqual([...camasSensibles].sort(), intermedios.map((c) => c.id).sort())
  assert.ok(sensibles.filter((s) => s.tipo === 'zona').every((s) => servicioDe.get(s.id) === 'medicina-intermedios'))
})

test('otra área se atenúa y su cama ocupada va sin paciente ni color de estado', () => {
  const { figuras } = escena({ zoom: 3 }, { activaDe: soloIntermedios })
  assert.ok(!figuras.some((f) => f.relleno?.endsWith('frazada:ocupada')), 'B-03 es de Medicina B')
  assert.ok(!figuras.some((f) => f.relleno === 'piel'))
  assert.ok(figuras.some((f) => f.a > 0.39 && f.a < 0.41), 'lo de Medicina B baja a 0,4')
  assert.ok(figuras.some((f) => f.a === 1), 'Intermedios y el pasillo siguen plenos')
})

test('al cambiar de área, la cama neutra y la de color se funden a mitad de camino', () => {
  const mitad = (zonaId) => (servicioDe.get(zonaId) === 'medicina-b' ? 0.5 : soloIntermedios(zonaId))
  const { figuras, sensibles } = escena({ zoom: 3 }, { activaDe: mitad })
  const b03 = figuras.filter((f) => f.t === 'etq' && f.texto === 'B-03')
  assert.equal(b03.length, 1)
  assert.ok(b03[0].a > 0 && b03[0].a < 0.5, 'el rótulo entra de a poco')
  assert.ok(figuras.some((f) => f.relleno?.endsWith('frazada:ocupada')), 'el color ya asoma')
  assert.ok(!sensibles.some((s) => s.tipo === 'cama' && s.id === camasDe('medicina-b')[0].id), 'no se elige hasta pasar la mitad')
})

test('una cama del área sin datos se dibuja neutra y no se puede elegir', () => {
  const sinB03 = (c) => (c.codigo === 'B-03' ? null : infoDe(c))
  const { figuras, sensibles } = escena({ zoom: 3 }, { infoDe: sinB03 })
  const b03 = plano.camas.find((c) => c.codigo === 'B-03')
  assert.ok(!figuras.some((f) => f.t === 'etq' && f.texto === 'B-03'))
  assert.ok(!sensibles.some((s) => s.tipo === 'cama' && s.id === b03.id))
  assert.ok(!figuras.some((f) => f.relleno === 'piel'))
})
