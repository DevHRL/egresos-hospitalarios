/* Cuadrícula exacta, migración y numeración de camas: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASO, enCuadricula } from '../src/app/dominio/cuadricula.js'
import { TIPOS_CAMA, SEPARACION, variantesPara } from '../src/app/dominio/estandar.js'
import { accionHabitacionPlantilla, accionNumerar, aplicar, etiquetaCama, migrar, planoVacio, posicionDentro, rectCama } from '../src/app/dominio/plano.js'

const plantilla = (plano, n, variante, cx, cy, tipo = 'adulto') => {
  const r = accionHabitacionPlantilla(plano, { pisoId: plano.pisos[0].id, cx, cy, n, tipo, variante, servicioId: 'medicina-a' })
  return aplicar(plano, r.accion)
}

const todoEnCuadricula = (plano) => {
  for (const z of plano.zonas) for (const k of ['x', 'y', 'ancho', 'alto']) assert.ok(enCuadricula(z[k]), `${z.codigo}.${k} = ${z[k]}`)
  for (const c of plano.camas) {
    const r = rectCama(c, plano.zonas.find((z) => z.id === c.zonaId))
    for (const k of ['x', 'y', 'ancho', 'alto']) assert.ok(enCuadricula(r[k]), `${c.codigo}.${k} = ${r[k]}`)
  }
}

test('las medidas del estándar son múltiplos de la cuadrícula', () => {
  for (const t of Object.values(TIPOS_CAMA)) assert.ok(enCuadricula(t.ancho) && enCuadricula(t.largo), t.label)
  for (const [k, v] of Object.entries(SEPARACION)) assert.ok(enCuadricula(v), k)
})

test('todas las plantillas quedan sobre la cuadrícula, aun creadas en un punto cualquiera', () => {
  for (const tipo of Object.keys(TIPOS_CAMA)) {
    for (const n of [1, 2, 3, 4, 6, 8]) {
      for (const v of variantesPara(n)) todoEnCuadricula(plantilla(planoVacio(), n, v.id, 7.13, 9.87, tipo))
    }
  }
})

test('mover la habitación o una cama no las saca de la cuadrícula', () => {
  let p = plantilla(planoVacio(), 4, 'h2', 10, 10)
  const zona = p.zonas[0]
  p = aplicar(p, { tipo: 'zona/actualizar', id: zona.id, cambios: { x: zona.x + 1.75, y: zona.y - 0.5 } })
  const cama = p.camas[0]
  const z = p.zonas[0]
  const pos = posicionDentro(z, 1, 2.25, z.x + cama.x + 0.37, z.y + cama.y + 0.61)
  p = aplicar(p, { tipo: 'cama/actualizar', id: cama.id, cambios: pos })
  todoEnCuadricula(p)
})

test('migrar lleva un plano de la versión 1 a la cuadrícula', () => {
  const v1 = {
    version: 1,
    nombre: 'Viejo',
    pisos: [{ id: 'p', nombre: 'Piso 1', ancho: 40, alto: 25, fondo: null }],
    zonas: [{ id: 'z', pisoId: 'p', tipo: 'habitacion', codigo: 'H01', nombre: '', servicioId: null, x: 2.13, y: 3.07, ancho: 6.1, alto: 5.33 }],
    camas: [{ id: 'c', zonaId: 'z', codigo: 'H01-C1', tipo: 'adulto', rotacion: 0, estado: 'operativa', servicioId: null, x: 0.53, y: 0.1 }],
  }
  const v2 = migrar(v1)
  assert.equal(v2.version, 2)
  assert.equal('fondo' in v2.pisos[0], false)
  todoEnCuadricula(v2)
  assert.equal(PASO, 0.25)
})

test('numeración por habitación, con letras y por columnas', () => {
  let p = plantilla(planoVacio(), 4, 'h2', 10, 10)
  const zona = p.zonas[0]
  const porFilas = accionNumerar(p, [zona], { formato: 'hab-letra', orden: 'filas' })
  p = aplicar(p, porFilas.accion)
  /* Dos filas contra izquierda y derecha: por filas va de lado a lado. */
  const izquierda = (codigo) => rectCama(p.camas.find((c) => c.codigo === codigo), zona).x
  assert.ok(izquierda('H01-A') < izquierda('H01-B'))
  const porColumnas = accionNumerar(p, [zona], { formato: 'hab-n', orden: 'columnas' })
  p = aplicar(p, porColumnas.accion)
  assert.equal(izquierda('H01-1'), izquierda('H01-2'))
  assert.equal(etiquetaCama(p.camas.find((c) => c.codigo === 'H01-1'), zona), '1')
})

test('numeración correlativa sigue de una habitación a la siguiente', () => {
  let p = plantilla(planoVacio(), 4, 'h2', 8, 8)
  p = plantilla(p, 3, 'h1-izq', 20, 8)
  const r = accionNumerar(p, p.zonas, { formato: 'correlativo', prefijo: 'MA-', inicio: 1 })
  assert.deepEqual(r.cambios.map((c) => c.despues), ['MA-1', 'MA-2', 'MA-3', 'MA-4', 'MA-5', 'MA-6', 'MA-7'])
  assert.deepEqual(r.conflictos, [])
})

test('la numeración avisa si choca con camas de otra habitación', () => {
  let p = plantilla(planoVacio(), 2, 'h2', 8, 8)
  p = plantilla(p, 2, 'h2', 20, 8)
  const r = accionNumerar(p, [p.zonas[0]], { formato: 'correlativo', prefijo: 'H02-C' })
  assert.deepEqual(r.conflictos, ['H02-C1', 'H02-C2'])
})
