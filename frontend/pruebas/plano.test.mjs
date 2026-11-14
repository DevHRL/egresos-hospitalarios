/* Reglas del plano de camas, sin navegador: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicar,
  conteoPorServicio,
  crearCama,
  crearZona,
  duplicar,
  habitacionEn,
  huella,
  planoVacio,
  posicionDentro,
  rectCama,
  validar,
} from '../src/app/dominio/plano.js'

const existe = (id) => ['medicina-a', 'medicina-b'].includes(id)

function conHabitacion(servicioId = 'medicina-a') {
  const plano = planoVacio()
  const zona = crearZona(plano, { pisoId: plano.pisos[0].id, tipo: 'habitacion', x: 2, y: 3, ancho: 6, alto: 5, servicioId })
  return { plano: aplicar(plano, { tipo: 'zona/crear', zona }), zona }
}

test('las habitaciones reciben códigos correlativos sin repetir', () => {
  const { plano } = conHabitacion()
  const otra = crearZona(plano, { pisoId: plano.pisos[0].id, tipo: 'habitacion', x: 10, y: 3, ancho: 4, alto: 4 })
  assert.equal(plano.zonas[0].codigo, 'H01')
  assert.equal(otra.codigo, 'H02')
})

test('una cama nueva queda dentro de la habitación aunque el clic caiga en el borde', () => {
  const { plano, zona } = conHabitacion()
  const cama = crearCama(plano, zona, zona.x + zona.ancho, zona.y + zona.alto)
  const r = rectCama(cama, zona)
  assert.ok(r.x + r.ancho <= zona.x + zona.ancho + 1e-9)
  assert.ok(r.y + r.alto <= zona.y + zona.alto + 1e-9)
  assert.equal(cama.codigo, 'H01-C1')
})

test('girar una cama intercambia su huella', () => {
  assert.deepEqual(huella({ tipo: 'adulto', rotacion: 0 }), { ancho: 1, alto: 2.25 })
  assert.deepEqual(huella({ tipo: 'adulto', rotacion: 90 }), { ancho: 2.25, alto: 1 })
})

test('posicionDentro ajusta a la cuadrícula de 25 cm y acota a las paredes', () => {
  const zona = { x: 0, y: 0, ancho: 4, alto: 4 }
  assert.deepEqual(posicionDentro(zona, 1, 2, 1.13, 0.6), { x: 1.25, y: 0.5 })
  assert.deepEqual(posicionDentro(zona, 1, 2, 10, -5), { x: 3, y: 0 })
})

test('mover la habitación arrastra sus camas (posición relativa)', () => {
  const { plano, zona } = conHabitacion()
  const cama = crearCama(plano, zona, 4, 5)
  let p = aplicar(plano, { tipo: 'cama/crear', cama })
  p = aplicar(p, { tipo: 'zona/actualizar', id: zona.id, cambios: { x: 12 } })
  const movida = p.zonas[0]
  assert.equal(rectCama(p.camas[0], movida).x, 12 + cama.x)
})

test('eliminar una habitación elimina sus camas', () => {
  const { plano, zona } = conHabitacion()
  let p = aplicar(plano, { tipo: 'cama/crear', cama: crearCama(plano, zona, 4, 5) })
  p = aplicar(p, { tipo: 'zona/eliminar', id: zona.id })
  assert.equal(p.zonas.length, 0)
  assert.equal(p.camas.length, 0)
})

test('habitacionEn devuelve la habitación que contiene el punto', () => {
  const { plano, zona } = conHabitacion()
  assert.equal(habitacionEn(plano, zona.pisoId, 3, 4)?.id, zona.id)
  assert.equal(habitacionEn(plano, zona.pisoId, 30, 20), undefined)
})

test('duplicar una habitación copia sus camas con códigos nuevos', () => {
  const { plano, zona } = conHabitacion()
  const p = aplicar(plano, { tipo: 'cama/crear', cama: crearCama(plano, zona, 4, 5) })
  const r = duplicar(p, { tipo: 'zona', id: zona.id })
  const final = aplicar(p, r.accion)
  assert.equal(final.zonas.length, 2)
  assert.deepEqual(final.camas.map((c) => c.codigo).sort(), ['H01-C1', 'H02-C1'])
})

test('validar señala habitación sin servicio, códigos repetidos y camas superpuestas', () => {
  const { plano, zona } = conHabitacion(null)
  const a = crearCama(plano, zona, 4, 5)
  let p = aplicar(plano, { tipo: 'cama/crear', cama: a })
  p = aplicar(p, { tipo: 'cama/crear', cama: { ...a, id: 'otra' } })
  const mensajes = validar(p, existe).map((x) => x.mensaje)
  assert.ok(mensajes.some((m) => m.includes('sin servicio')))
  assert.ok(mensajes.some((m) => m.includes('repetido')))
  assert.ok(mensajes.some((m) => m.includes('se superpone')))
})

test('conteoPorServicio separa operativas y fuera de servicio', () => {
  const { plano, zona } = conHabitacion()
  const c1 = crearCama(plano, zona, 3, 4)
  let p = aplicar(plano, { tipo: 'cama/crear', cama: c1 })
  const c2 = { ...crearCama(p, zona, 6, 4), estado: 'fuera_servicio' }
  p = aplicar(p, { tipo: 'cama/crear', cama: c2 })
  assert.deepEqual(conteoPorServicio(p).get('medicina-a'), { total: 2, operativas: 1, fueraServicio: 1 })
})

test('las camas se agrupan en hospitalización y aislados según el nombre de su habitación', async () => {
  const { categoriaDeZona, CATEGORIAS_CAMA } = await import('../src/app/dominio/plano.js')
  const fs = await import('node:fs')
  const piso = JSON.parse(fs.readFileSync(new URL('../src/app/datos/planos/medicina-b-piso2.json', import.meta.url), 'utf8'))
  const zona = new Map(piso.zonas.map((z) => [z.id, z]))
  const cuenta = (servicio, categoria) => piso.camas.filter((c) => zona.get(c.zonaId).servicioId === servicio && categoriaDeZona(zona.get(c.zonaId)) === categoria).length
  assert.deepEqual(CATEGORIAS_CAMA.map((c) => c.id), ['hospitalizacion', 'aislados'])
  assert.equal(categoriaDeZona({ nombre: 'Aislado invertido' }), 'aislados')
  assert.equal(categoriaDeZona({ nombre: 'Cuarto 01' }), 'hospitalizacion')
  assert.equal(categoriaDeZona(null), 'hospitalizacion')
  /* Medicina B: dos aislados invertidos; Medicina A: uno. */
  assert.equal(cuenta('medicina-b', 'aislados'), 2)
  assert.equal(cuenta('medicina-a', 'aislados'), 1)
  assert.equal(cuenta('medicina-a', 'hospitalizacion'), 23)
})
