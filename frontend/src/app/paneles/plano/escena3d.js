/* La escena 3D del plano como una lista de figuras a pintar, en orden de atrás
   hacia adelante. Solo cálculo: sin React, sin DOM y sin canvas, para probarla
   con `node --test`. `pintura3d.js` la pinta en un canvas.

   Aspecto de figura isométrica (ai-iso-skill): trazo fino, caras opacas, la
   profundidad solo por el orden de pintado, dos grises para las líneas y un
   color vivo para lo seleccionado. La cama ocupada lleva al paciente acostado
   (cabeza en la almohada y el cuerpo bajo la frazada); la frazada toma el color
   de su estado. Los códigos de habitación se pintan sobre el muro del fondo
   con la matriz de su plano.

   Figuras:
   - { t: 'pol', p: [x0, y0, …], relleno, trazo, ancho, guion, brillo, a }
     (`brillo`: resplandor suave alrededor, para el halo de la cama elegida)
   - { t: 'lin', p: [x1, y1, x2, y2, …], trazo, a }       segmentos sueltos
   - { t: 'txt', m: [a, b, c, d, e, f], texto, alto, color, a }  texto sobre un plano
   - { t: 'etq', x, y, texto, icono, marca, a }             rótulo de cama en pantalla;
     `marca` (O2 o VM) va recuadrada al lado, sin color propio
   Los colores son claves que resuelve el pintor (ver `COLORES` en pintura3d.js):
   'cuerpo', 'cubierta', 'linea', 'detalle', 'vivo', 'aviso', 'estacion', 'piel',
   'rayado', 'frazada:<estado>', 'halo', 'halo-suave', 'piso-foco' y, para las
   caras, '<cara>|<tono>'. */

import { rectCama } from '../../dominio/plano.js'
import { ALTO_MURO, deAtrasAdelante, murosDelFondo, rotuloEnMuro } from './camara3d.js'

const GROSOR_MURO = 0.1
const BALDOSA = 1
/* Alto de las letras pintadas, en metros: crecen y se inclinan con el plano. */
const LETRA_CODIGO = 0.42
const LETRA_NOMBRE = 0.28
/* Opacidad de lo que no está en foco, con la atenuación completa. */
const ATENUADA = 0.14
/* Opacidad de las habitaciones de otra área: se ven para ubicarse en el piso,
   pero claramente detrás del área elegida. */
const INACTIVA = 0.4
/* Cama de otra área: sin estado, sin paciente y sin color de leyenda. */
const NEUTRA = { estado: null, ocupada: false, falla: false }
/* Por debajo de estos px por metro, la cama se dibuja con cuatro bloques: las
   patas, barandas y pespuntes medirían uno o dos px y solo costarían tiempo. */
const PX_DETALLE = 28
const PX_BALDOSAS = 10

const PATA = { hasta: 0.3, lado: 0.06, margen: 0.08 }
const BASTIDOR = { desde: 0.3, hasta: 0.42 }
const COLCHON = { desde: 0.42, hasta: 0.58, margen: 0.06 }
const ALMOHADA = { hasta: 0.68 }
const CABECERA = { hasta: 1, grosor: 0.06 }
const PIECERA = { hasta: 0.78, grosor: 0.06 }
const BARANDA = { desde: 0.58, hasta: 0.74, grosor: 0.03 }
const PESPUNTE = 0.24
/* Paciente acostado, en metros para una cama de adulto (2,25 m); en camas más
   cortas (pediátrica, cuna) se achica en proporción. */
const PACIENTE = { cabeza: 0.15, torso: 0.24, piernas: 0.15, brazo: 0.08 }
const LARGO_ADULTO = 2.25

/* Caja: tapa y caras laterales que miran a la cámara. La sombra de cada cara
   depende del eje de su normal: la luz queda fija en el piso aunque se gire. */
export function caja(vista, x0, x1, y0, y1, z0, z1) {
  const lados = [
    { normal: [1, 0], cara: 'lado', puntos: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { normal: [-1, 0], cara: 'lado', puntos: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]] },
    { normal: [0, 1], cara: 'frente', puntos: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, -1], cara: 'frente', puntos: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ]
  return {
    profundidad: vista.profundidad((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    tapa: vista.poligono([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]),
    lados: lados.filter((l) => vista.mira(...l.normal)).map((l) => ({ cara: l.cara, p: vista.poligono(l.puntos) })),
    rango: { x0, x1, y0, y1, z1 },
  }
}

/* Las caras de una caja como figuras, con el tono de la pieza. */
function pieza(salida, c, tono, a, extra = {}) {
  for (const l of c.lados) salida.push({ t: 'pol', p: l.p, relleno: `${l.cara}|${tono}`, trazo: extra.trazo ?? 'linea', ancho: extra.ancho ?? 1, guion: extra.guion, a })
  salida.push({ t: 'pol', p: c.tapa, relleno: `tapa|${tono}`, trazo: extra.trazoTapa ?? extra.trazo ?? 'linea', ancho: extra.anchoTapa ?? extra.ancho ?? 1, guion: extra.guion, a })
}

/* Pasa de coordenadas de la cama (s: de la cabecera a los pies, t: de un
   costado al otro) a coordenadas del piso, según el giro. */
function marco(r, rotacion) {
  const girada = rotacion % 180 !== 0
  const L = girada ? r.ancho : r.alto
  const W = girada ? r.alto : r.ancho
  const aMundo = {
    0: (s, t) => [r.x + t, r.y + s],
    180: (s, t) => [r.x + W - t, r.y + L - s],
    270: (s, t) => [r.x + s, r.y + t],
    90: (s, t) => [r.x + L - s, r.y + W - t],
  }[rotacion]
  return { L, W, aMundo, girada }
}

/* Polígono en pantalla de una esfera: en proyección paralela es un círculo. */
function esfera(vista, x, y, z, radio, lados = 14) {
  const [cx, cy] = vista.punto(x, y, z)
  const r = radio * vista.escala
  const p = []
  for (let i = 0; i < lados; i++) {
    const ang = (i / lados) * Math.PI * 2
    p.push(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r)
  }
  return p
}

/* El paciente acostado sobre el colchón: el cuerpo bajo la frazada (torso más
   alto que las piernas), los brazos por encima y la cabeza en la almohada. Las
   piezas se pintan de atrás hacia adelante según desde dónde se mire. */
function paciente(salida, vista, c, aMundo, L, W, { tono, a, vivo, detalle }) {
  const k = Math.min(1, L / LARGO_ADULTO)
  const z0 = COLCHON.hasta
  const radio = PACIENTE.cabeza * Math.max(0.6, k)
  const sCabeza = Math.max(radio + 0.12, L * 0.15)
  const hombros = sCabeza + radio * 0.9
  const torso = c(hombros, L * 0.62, W * 0.18, W * 0.82, z0, z0 + PACIENTE.torso * k)
  const piernas = c(L * 0.62, L - 0.14 * k, W * 0.24, W * 0.76, z0, z0 + PACIENTE.piernas * k)
  const [hx, hy] = aMundo(sCabeza, W / 2)
  const zCabeza = ALMOHADA.hasta + radio * 0.75
  const piezas = [
    { profundidad: torso.profundidad, pintar: () => pieza(salida, torso, tono, a, vivo) },
    { profundidad: piernas.profundidad, pintar: () => pieza(salida, piernas, tono, a, vivo) },
    { profundidad: vista.profundidad(hx, hy, zCabeza), pintar: () => salida.push({ t: 'pol', p: esfera(vista, hx, hy, zCabeza, radio), relleno: 'piel', trazo: vivo.trazo ?? 'linea', a }) },
  ]
  if (detalle) {
    const alto = z0 + PACIENTE.torso * k + 0.02
    for (const [t0, t1] of [[W * 0.1, W * 0.1 + PACIENTE.brazo * k], [W * 0.9 - PACIENTE.brazo * k, W * 0.9]]) {
      const brazo = c(hombros + 0.04, L * 0.5, t0, t1, z0, alto)
      piezas.push({ profundidad: brazo.profundidad, pintar: () => pieza(salida, brazo, 'piel', a, vivo) })
    }
  }
  piezas.sort((p, q) => p.profundidad - q.profundidad).forEach((p) => p.pintar())
}

/* Halo en el piso bajo la cama: la cama elegida no se contornea, se posa
   sobre una luz suave del color de selección. Con el puntero encima, el
   mismo halo más tenue y sin resplandor. */
const HALO = 0.22
function halo(salida, vista, r, { seleccionada, a }) {
  const [x0, y0, x1, y1] = [r.x - HALO, r.y - HALO, r.x + r.ancho + HALO, r.y + r.alto + HALO]
  const p = vista.poligono([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]])
  salida.push(seleccionada ? { t: 'pol', p, relleno: 'halo', brillo: true, a } : { t: 'pol', p, relleno: 'halo-suave', a })
}

/* Cama hospitalaria: patas, bastidor, colchón con pespuntes, almohada,
   cabecera, piecera y barandas; si está ocupada, el paciente. */
function cama(salida, vista, r, rotacion, { estado, ocupada, falla, seleccionada, encima, a, detalle }) {
  const { L, W, aMundo, girada } = marco(r, rotacion)
  const c = (s0, s1, t0, t1, z0, z1) => {
    const [p, q] = [aMundo(s0, t0), aMundo(s1, t1)]
    return caja(vista, Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1]), z0, z1)
  }
  if (seleccionada || encima) halo(salida, vista, r, { seleccionada, a })
  /* Las líneas de la cama no cambian al elegirla: lo dice el halo. */
  const vivo = {}
  const tapaColchon = {}
  /* El colchón de una cama libre con falla toma el tono de la falla; si está
     ocupada, lo toma la frazada del paciente. */
  const tonoColchon = falla && !ocupada ? 'frazada:falla' : 'cuerpo'
  const alerta = estado === 'mantenimiento' || falla ? { trazo: 'aviso', ancho: 1.5 } : vivo
  const conPaciente = () => ocupada && paciente(salida, vista, c, aMundo, L, W, { tono: `frazada:${estado}`, a, vivo, detalle })
  const volumen = () => {
    const v = c(0, L, 0, W, 0, CABECERA.hasta)
    return [v.tapa, ...v.lados.map((l) => l.p)]
  }

  if (!detalle) {
    const base = c(0.05, L - 0.05, 0, W, 0, BASTIDOR.hasta)
    const colchonSimple = c(0.1, L - 0.1, COLCHON.margen, W - COLCHON.margen, COLCHON.desde, COLCHON.hasta)
    const cabeceraSimple = c(0, CABECERA.grosor, 0, W, BASTIDOR.desde, CABECERA.hasta)
    const atras = cabeceraSimple.profundidad < colchonSimple.profundidad
    if (atras) pieza(salida, cabeceraSimple, 'cubierta', a, vivo)
    pieza(salida, base, 'detalle', a, alerta)
    pieza(salida, colchonSimple, tonoColchon, a, tapaColchon)
    if (estado === 'mantenimiento') salida.push({ t: 'pol', p: colchonSimple.tapa, relleno: 'rayado', a })
    conPaciente()
    if (!atras) pieza(salida, cabeceraSimple, 'cubierta', a, vivo)
    return volumen()
  }

  const patas = [
    [PATA.margen, PATA.margen],
    [PATA.margen, W - PATA.margen - PATA.lado],
    [L - PATA.margen - PATA.lado, PATA.margen],
    [L - PATA.margen - PATA.lado, W - PATA.margen - PATA.lado],
  ]
    .map(([s, t]) => c(s, s + PATA.lado, t, t + PATA.lado, 0, PATA.hasta))
    .sort((p, q) => p.profundidad - q.profundidad)
  const bastidor = c(0.05, L - 0.05, 0, W, BASTIDOR.desde, BASTIDOR.hasta)
  const colchon = c(0.1, L - 0.1, COLCHON.margen, W - COLCHON.margen, COLCHON.desde, COLCHON.hasta)
  const almohada = c(0.16, Math.min(0.5, L * 0.3), W * 0.16, W * 0.84, COLCHON.hasta, ALMOHADA.hasta)
  const cabecera = c(0, CABECERA.grosor, 0, W, BASTIDOR.desde, CABECERA.hasta)
  const piecera = c(L - PIECERA.grosor, L, 0, W, BASTIDOR.desde, PIECERA.hasta)
  const barandas = [
    c(L * 0.22, L * 0.6, 0, BARANDA.grosor, BARANDA.desde, BARANDA.hasta),
    c(L * 0.22, L * 0.6, W - BARANDA.grosor, W, BARANDA.desde, BARANDA.hasta),
  ].sort((p, q) => p.profundidad - q.profundidad)
  const cabeceraAtras = cabecera.profundidad < piecera.profundidad
  const [fondo, delante] = cabeceraAtras ? [cabecera, piecera] : [piecera, cabecera]

  for (const p of patas) pieza(salida, p, 'linea', a, vivo)
  pieza(salida, bastidor, 'detalle', a, alerta)
  pieza(salida, fondo, 'cubierta', a, vivo)
  pieza(salida, barandas[0], 'linea', a, vivo)
  pieza(salida, colchon, tonoColchon, a, tapaColchon)
  /* Pespuntes a lo ancho del colchón: textura por repetición. */
  const { x0, x1, y0, y1, z1 } = colchon.rango
  const largo = girada ? x1 - x0 : y1 - y0
  const pespuntes = []
  for (let d = PESPUNTE; d < largo - 0.05; d += PESPUNTE) {
    const [p, q] = girada ? [[x0 + d, y0 + 0.04], [x0 + d, y1 - 0.04]] : [[x0 + 0.04, y0 + d], [x1 - 0.04, y0 + d]]
    pespuntes.push(...vista.punto(p[0], p[1], z1), ...vista.punto(q[0], q[1], z1))
  }
  if (pespuntes.length) salida.push({ t: 'lin', p: pespuntes, trazo: 'detalle', a })
  if (estado === 'mantenimiento') salida.push({ t: 'pol', p: colchon.tapa, relleno: 'rayado', a })
  pieza(salida, almohada, 'cuerpo', a, vivo)
  conPaciente()
  pieza(salida, barandas[1], 'linea', a, vivo)
  pieza(salida, delante, 'cubierta', a, vivo)

  /* Zona sensible: el volumen completo de la cama. */
  return volumen()
}

/* Piso de una zona con su textura de baldosas (un trazo por zona). */
function losa(salida, vista, z, { enFoco, a, baldosas: conBaldosas }) {
  const [x1, y1] = [z.x + z.ancho, z.y + z.alto]
  const p = vista.poligono([[z.x, z.y, 0], [x1, z.y, 0], [x1, y1, 0], [z.x, y1, 0]])
  /* La habitación enfocada no lleva contorno de color: su piso toma un tinte
     muy leve y el resto ya se atenúa. */
  const relleno = enFoco ? 'piso-foco' : ({ pasillo: 'cubierta', apoyo: 'cubierta', estacion: 'estacion' }[z.tipo] ?? 'cuerpo')
  salida.push({ t: 'pol', p, relleno, trazo: 'linea', ancho: 1, guion: z.tipo === 'apoyo' ? [2, 3] : undefined, a })
  const baldosas = []
  if (!conBaldosas) return p
  for (let x = z.x + BALDOSA; x < x1 - 0.05; x += BALDOSA) baldosas.push(...vista.punto(x, z.y, 0), ...vista.punto(x, y1, 0))
  for (let y = z.y + BALDOSA; y < y1 - 0.05; y += BALDOSA) baldosas.push(...vista.punto(z.x, y, 0), ...vista.punto(x1, y, 0))
  if (baldosas.length) salida.push({ t: 'lin', p: baldosas, trazo: 'detalle', a })
  return p
}

/* La escena completa. `camas` son las del plano con estado conocido;
   `infoDe(cama)` da { estado, ocupada, falla, icono, marca }. Devuelve las figuras y las zonas
   sensibles en el mismo orden de pintado (la última que contiene un punto es
   la que está encima). Con `pantalla` ({ ancho, alto }) se omite lo que cae
   fuera de ella: acercado a una habitación, el resto no se calcula.

   `activaDe(zonaId)` (0 a 1, por omisión 1) dice si la zona es del área
   elegida. Lo de otra área se atenúa, sus camas van neutras (sin estado ni
   paciente: `infoDe` no se consulta) y no responden al puntero. Entre 0 y 1
   la cama neutra y la de color se funden.

   Los rótulos de cama (código e ícono) solo van en la habitación enfocada: en
   la vista general serían demasiado texto. `rotuloDe(zonaId)` (0 a 1) permite
   fundirlos; por omisión, 1 en la habitación de `foco` y 0 en el resto. */
export function construirEscena({ vista, zonas, camas, infoDe, foco = null, seleccion = null, encima = null, atenuacion = 0, luzDe = null, activaDe = null, rotuloDe = null, pantalla = null }) {
  const figuras = []
  const sensibles = []
  const activa = activaDe ?? (() => 1)
  const rotulo = rotuloDe ?? ((zonaId) => (foco && zonaId === foco.id ? 1 : 0))
  /* Con `luzDe(zonaId)` (0 a 1) cada zona se funde por su cuenta; si no, todo
     lo que no está en foco se atenúa junto según `atenuacion`. Encima, lo de
     otra área baja hasta `INACTIVA`. */
  const alfaFoco = luzDe
    ? (zonaId) => ATENUADA + (1 - ATENUADA) * luzDe(zonaId)
    : (zonaId) => (foco && zonaId !== foco.id ? 1 - (1 - ATENUADA) * atenuacion : 1)
  const alfa = (zonaId) => alfaFoco(zonaId) * (INACTIVA + (1 - INACTIVA) * activa(zonaId))
  /* Solo responde al puntero lo que está (o va quedando) en el área elegida. */
  const sensible = (zonaId) => activa(zonaId) > 0.5
  const zonaPorId = new Map(zonas.map((z) => [z.id, z]))
  const rectDe = (c) => rectCama(c, zonaPorId.get(c.zonaId))
  const centroCama = (c) => {
    const r = rectDe(c)
    return [r.x + r.ancho / 2, r.y + r.alto / 2]
  }
  const detalle = vista.escala >= PX_DETALLE
  const conBaldosas = vista.escala >= PX_BALDOSAS
  const visible = (z) => {
    if (!pantalla) return true
    const p = vista.poligono([[z.x, z.y, 0], [z.x + z.ancho, z.y, 0], [z.x + z.ancho, z.y + z.alto, 0], [z.x, z.y + z.alto, 0], [z.x, z.y, 1.2], [z.x + z.ancho, z.y + z.alto, 1.2]])
    const xs = p.filter((_, i) => i % 2 === 0)
    const ys = p.filter((_, i) => i % 2 === 1)
    const m = 40
    return Math.max(...xs) > -m && Math.min(...xs) < pantalla.ancho + m && Math.max(...ys) > -m && Math.min(...ys) < pantalla.alto + m
  }
  const zonasVisibles = zonas.filter(visible)
  const idsVisibles = new Set(zonasVisibles.map((z) => z.id))
  const camasVisibles = camas.filter((c) => idsVisibles.has(c.zonaId))
  const ordenZonas = zonasVisibles.sort(deAtrasAdelante(vista, (z) => [z.x + z.ancho / 2, z.y + z.alto / 2]))

  for (const z of ordenZonas) {
    const a = alfa(z.id)
    const habitacion = z.tipo === 'habitacion'
    const piso = losa(figuras, vista, z, { enFoco: foco?.id === z.id, a, baldosas: conBaldosas })
    if (habitacion && sensible(z.id)) sensibles.push({ tipo: 'zona', id: z.id, codigo: z.codigo, poligonos: [piso] })

    const centro = vista.planoLegible(z.x + z.ancho / 2, z.y + z.alto / 2)
    if (!habitacion && z.nombre && z.nombre.length * LETRA_NOMBRE * 0.62 < Math.max(z.ancho, z.alto) - 0.4) {
      figuras.push({ t: 'txt', m: centro, texto: z.nombre, alto: LETRA_NOMBRE, color: 'apagado', a })
    }
    /* El código va en la cara interior del muro del fondo; mirando desde
       arriba, en el centro del piso. */
    const enMuro = habitacion ? rotuloEnMuro(z, vista, ALTO_MURO, GROSOR_MURO) : null
    if (habitacion && !enMuro) figuras.push({ t: 'txt', m: centro, texto: z.codigo, alto: LETRA_CODIGO, color: 'fuerte', a })
    if (habitacion) {
      murosDelFondo(z, vista, GROSOR_MURO)
        .map((m) => caja(vista, ...m.cajon, 0, ALTO_MURO))
        .sort((p, q) => p.profundidad - q.profundidad)
        .forEach((m) => pieza(figuras, m, 'cubierta', a))
    }
    if (enMuro) figuras.push({ t: 'txt', m: enMuro, texto: z.codigo, alto: LETRA_CODIGO, color: 'fuerte', a })

    const propias = camasVisibles.filter((c) => c.zonaId === z.id).sort(deAtrasAdelante(vista, centroCama))
    const k = activa(z.id)
    for (const c of propias) {
      /* La cama neutra debajo y la de color encima, con opacidad según `k`. */
      /* Sin datos (`infoDe` da null), la cama va neutra aunque sea del área. */
      const info = k > 0 ? infoDe(c) : null
      let volumen = null
      if (k < 1 || !info) volumen = cama(figuras, vista, rectDe(c), c.rotacion, { ...NEUTRA, seleccionada: false, encima: false, a, detalle })
      if (info) {
        volumen = cama(figuras, vista, rectDe(c), c.rotacion, { estado: info.estado, ocupada: info.ocupada, falla: info.falla, seleccionada: seleccion === c.id, encima: encima === c.id, a: a * k, detalle })
      }
      if (info && sensible(z.id)) sensibles.push({ tipo: 'cama', id: c.id, zonaId: z.id, poligonos: volumen })
    }
  }

  /* Rótulos de cama encima de todo, para que se lean aunque los tape otra cama.
     Van sobre los pies: así no tapan la cabeza del paciente. */
  const piesDe = (c) => {
    const { L, W, aMundo } = marco(rectDe(c), c.rotacion)
    return aMundo(L * 0.8, W / 2)
  }
  for (const c of [...camasVisibles].sort(deAtrasAdelante(vista, centroCama))) {
    const k = activa(c.zonaId) * rotulo(c.zonaId)
    if (k <= 0) continue
    const info = infoDe(c)
    if (!info) continue
    const [cx, cy] = piesDe(c)
    const [x, y] = vista.punto(cx, cy, 1.05)
    figuras.push({ t: 'etq', x, y, texto: c.codigo, icono: info.icono, marca: info.marca ?? null, a: alfa(c.zonaId) * k })
    if (!sensible(c.zonaId) || rotulo(c.zonaId) <= 0.5) continue
    const derecha = x + 26 + (info.marca ? 26 : 0)
    sensibles.push({ tipo: 'cama', id: c.id, zonaId: c.zonaId, poligonos: [[x - 28, y - 13, derecha, y - 13, derecha, y + 6, x - 28, y + 6]] })
  }
  return { figuras, sensibles }
}

/* ¿El punto (x, y) cae dentro del polígono plano? (par-impar) */
export function dentro(p, x, y) {
  let adentro = false
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [p[i], p[i + 1], p[j], p[j + 1]]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) adentro = !adentro
  }
  return adentro
}

/* Lo que está bajo el puntero: la última zona sensible que lo contiene. */
export function bajoElPuntero(sensibles, x, y) {
  for (let i = sensibles.length - 1; i >= 0; i--) {
    if (sensibles[i].poligonos.some((p) => dentro(p, x, y))) return sensibles[i]
  }
  return null
}
