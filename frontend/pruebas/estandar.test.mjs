/* Estándar de camas y distribución en habitaciones: node --test pruebas/ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEPARACION, VARIANTES, camaContraPared, capacidad, distribuir, medidasHabitacion, variantesPara } from '../src/app/dominio/estandar.js'
import { accionDistribuir, accionHabitacionPlantilla, aplicar, crearZona, huella, planoVacio, rectCama, validar } from '../src/app/dominio/plano.js'

const observaciones = (plano) => validar(plano, () => true).filter((a) => !a.mensaje.includes('no tiene camas'))

const plantilla = (n, variante, tipo = 'adulto') => {
  const plano = planoVacio()
  const r = accionHabitacionPlantilla(plano, { pisoId: plano.pisos[0].id, cx: 15, cy: 10, n, tipo, variante, servicioId: 'medicina-a' })
  return aplicar(plano, r.accion)
}

test('todas las plantillas (1 a 8 camas, cada variante y tipo) caben sin observaciones', () => {
  for (const tipo of ['adulto', 'uci', 'pediatrica', 'cuna']) {
    for (const n of [1, 2, 3, 4, 6, 8]) {
      for (const v of variantesPara(n)) {
        const final = plantilla(n, v.id, tipo)
        const caso = `${n} camas ${tipo}, ${v.id}`
        assert.equal(final.camas.length, n, caso)
        assert.deepEqual(observaciones(final), [], caso)
      }
    }
  }
})

test('la habitación de 4 camas por defecto tiene las camas horizontales contra izquierda y derecha', () => {
  const final = plantilla(4)
  const zona = final.zonas[0]
  for (const c of final.camas) {
    const h = huella(c)
    assert.ok(h.ancho > h.alto, 'cama horizontal')
  }
  assert.deepEqual(final.camas.map((c) => c.rotacion).sort(), [270, 270, 90, 90])
  const xs = final.camas.map((c) => rectCama(c, zona).x)
  assert.equal(Math.min(...xs), zona.x + SEPARACION.cabecera)
  assert.ok(zona.alto > zona.ancho - 2, 'la habitación crece en vertical con las filas')
})

test('dos filas de camas verticales: cabeceras arriba y abajo', () => {
  const r = distribuir(medidasHabitacion(4, 'adulto', 'v2'), 4, 'adulto', 'v2')
  assert.ok(r.ok)
  assert.deepEqual(r.posiciones.map((p) => p.rotacion), [0, 0, 180, 180])
})

test('una fila contra cada pared apoya la cabecera en esa pared', () => {
  const esperado = { 'h1-izq': 270, 'h1-der': 90, 'v1-arr': 0, 'v1-abj': 180 }
  for (const [id, giro] of Object.entries(esperado)) {
    const zona = medidasHabitacion(3, 'adulto', id)
    const r = distribuir(zona, 3, 'adulto', id)
    assert.ok(r.ok, id)
    assert.ok(r.posiciones.every((p) => p.rotacion === giro), id)
  }
})

test('las variantes de dos filas no se ofrecen para una cama', () => {
  assert.ok(variantesPara(1).every((v) => v.filas.length === 1))
  assert.equal(variantesPara(4).length, VARIANTES.length)
})

test('automática usa otra variante si la habitual no cabe', () => {
  /* Ancha y baja: no caben dos filas de camas horizontales, sí verticales. */
  const r = distribuir({ ancho: 7, alto: 6.25 }, 6)
  assert.ok(r.ok)
  assert.equal(r.variante, 'v2')
})

test('si no caben, distribuir devuelve el tamaño mínimo de la variante pedida', () => {
  const r = distribuir({ ancho: 3, alto: 3 }, 4, 'adulto', 'v2')
  assert.equal(r.ok, false)
  assert.deepEqual(r.requerido, medidasHabitacion(4, 'adulto', 'v2'))
})

test('la capacidad de una plantilla es al menos su número de camas', () => {
  for (const n of [1, 2, 3, 4, 6, 8]) {
    for (const v of variantesPara(n)) assert.ok(capacidad(medidasHabitacion(n, 'adulto', v.id)) >= n, `${n} ${v.id}`)
  }
})

test('la cama colocada con clic apoya la cabecera en la pared más cercana', () => {
  const zona = { ancho: 6, alto: 6 }
  assert.equal(camaContraPared(zona, 3, 0.5).rotacion, 0)
  assert.equal(camaContraPared(zona, 3, 5.5).rotacion, 180)
  assert.equal(camaContraPared(zona, 0.4, 3).rotacion, 270)
  assert.equal(camaContraPared(zona, 5.6, 3).rotacion, 90)
  assert.equal(camaContraPared(zona, 3, 0.5).y, SEPARACION.cabecera)
  assert.equal(camaContraPared({ ancho: 0.5, alto: 0.5 }, 0.2, 0.2), null)
})

test('redistribuir conserva los códigos y quita las que sobran', () => {
  const con4 = plantilla(4)
  const zona = con4.zonas[0]
  const a2 = accionDistribuir(con4, zona, 2)
  assert.deepEqual(a2.quitadas.map((c) => c.codigo), ['H01-C3', 'H01-C4'])
  const con2 = aplicar(con4, a2.accion)
  assert.deepEqual(con2.camas.map((c) => c.codigo).sort(), ['H01-C1', 'H01-C2'])
})

test('camas más juntas que el estándar generan un aviso', () => {
  const plano = planoVacio()
  const zona = crearZona(plano, { pisoId: plano.pisos[0].id, tipo: 'habitacion', x: 0, y: 0, ancho: 6, alto: 4, servicioId: 'x' })
  const base = { zonaId: zona.id, tipo: 'adulto', estado: 'operativa', servicioId: null, rotacion: 0, y: 0.1 }
  let p = aplicar(plano, { tipo: 'zona/crear', zona })
  p = aplicar(p, { tipo: 'cama/crear', cama: { ...base, id: 'a', codigo: 'H01-C1', x: 1 } })
  p = aplicar(p, { tipo: 'cama/crear', cama: { ...base, id: 'b', codigo: 'H01-C2', x: 2.45 } })
  assert.ok(validar(p, () => true).some((a) => a.mensaje.includes('estándar')))
})
