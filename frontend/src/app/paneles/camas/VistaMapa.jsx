import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { rectCama } from '../../dominio/plano.js'
import { ESTADOS_CAMA_MAPA } from '../../dominio/consultas.js'
import { useTamano } from '../plano/comun.js'
import { servicioPorId } from '../../datos/catalogo.js'
import { ControlesCamara, useCamara3d } from '../plano/Escena3D.jsx'
import { OCUPADA, bajoElPuntero, construirEscena } from '../plano/escena3d.js'
import { azimutDesdePasillo, suavizar } from '../plano/camara3d.js'
import { pintar, resolverPaleta } from '../plano/pintura3d.js'

/* El plano ya cargado (no se edita desde la interfaz), con cada cama pintada
   según su estado. Se encuadra en las habitaciones de los servicios visibles.
   Además del color, cada cama lleva código e ícono.

   La vista 3D se pinta en canvas (ver `escena3d.js` y `pintura3d.js`) para que
   girar y acercar vaya fluido; la planta 2D sigue en SVG. */

const MARGEN = 18
const FUNDIDO_MS = 700
/* Inclinación al enfocar: lo bastante alta para ver dentro de la habitación. */
const ELEVACION_FOCO = 50

/* A lo largo: las habitaciones del servicio. A lo ancho: todo el piso, para
   orientarse con el corredor y la estación de enfermeras. */
function encuadre(propias, todas) {
  return {
    x0: Math.min(...propias.map((z) => z.x)) - 0.5,
    y0: Math.min(...todas.map((z) => z.y)) - 0.5,
    x1: Math.max(...propias.map((z) => z.x + z.ancho)) + 0.5,
    y1: Math.max(...todas.map((z) => z.y + z.alto)) + 0.5,
  }
}

/* Lo que queda casi todo fuera del encuadre no se dibuja a medias. */
const entraEn = (z, b) => (Math.min(z.x + z.ancho, b.x1) - Math.max(z.x, b.x0)) / z.ancho >= 0.6

/* Ícono del sprite del kit con un solo `<use>` (planta 2D). */
function IconoEstado({ x, y, nombre, lado = 12 }) {
  return <use href={`#${nombre}`} x={x} y={y} width={lado} height={lado} className="mapa-icono" aria-hidden="true" />
}

const iconoDe = (info) => (info.falla ? 'sh-warn' : ESTADOS_CAMA_MAPA[info.estado].icono)
const reducirMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* Memorizado: solo se vuelve a dibujar si cambian los datos, la selección o la
   cámara, no cuando la pantalla de arriba cambia por otra cosa. */
export const VistaMapa = memo(function VistaMapa({ plano, estados, servicios, vista, seleccion, onSeleccionar, tip, texto }) {
  const propias = plano.zonas.filter((z) => z.tipo === 'habitacion' && servicios.includes(z.servicioId))
  const clave = propias.map((z) => z.id).join(',')
  /* Misma caja mientras no cambien las habitaciones: si no, la cámara 3D se
     reiniciaría con cada cambio de estado. */
  const caja = useMemo(() => encuadre(propias, plano.zonas), [clave, plano.zonas])
  const zonas = plano.zonas.filter((z) => entraEn(z, caja) && (z.tipo !== 'habitacion' || servicios.includes(z.servicioId)))
  const porCama = new Map(estados.map((x) => [x.cama.id, x]))
  const camas = plano.camas.filter((c) => porCama.has(c.id) && zonas.some((z) => z.id === c.zonaId))
  const zonaDe = (c) => plano.zonas.find((z) => z.id === c.zonaId)

  const alPasar = (e) => {
    const g = e.target.closest('[data-cama]')
    if (g) {
      const t = texto(porCama.get(g.dataset.cama))
      return tip.follow(e, t.titulo, t.cuerpo)
    }
    const h = e.target.closest('[data-codigo]')
    if (h) return tip.follow(e, `Habitación ${h.dataset.codigo}`, 'Selecciónala para acercarte a ella.')
    tip.hide()
  }
  const claseCama = (id, base) => {
    const info = porCama.get(id)
    return `${base} mapa-estado--${info.estado}${info.falla ? ' mapa-estado--falla' : ''}${seleccion === id ? ' es-seleccion' : ''}`
  }
  const titulo = servicios.map((id) => servicioPorId(id)?.nombre ?? id).join(' y ')
  const comun = { zonas, camas, caja, porCama, claseCama, zonaDe, alPasar, tip, texto, seleccion, onSeleccionar, titulo }

  return vista === 'iso' ? <Isometrica {...comun} /> : <Planta {...comun} />
})

function Planta({ zonas, camas, caja, porCama, claseCama, zonaDe, alPasar, tip, onSeleccionar }) {
  const ref = useRef(null)
  const tamano = useTamano(ref)
  const alPulsar = (e) => {
    const g = e.target.closest('[data-cama]')
    if (g) onSeleccionar(g.dataset.cama)
  }
  const escala = Math.min((tamano.ancho - 2 * MARGEN) / (caja.x1 - caja.x0), (tamano.alto - 2 * MARGEN) / (caja.y1 - caja.y0))
  const ox = (tamano.ancho - (caja.x1 - caja.x0) * escala) / 2 - caja.x0 * escala
  const oy = (tamano.alto - (caja.y1 - caja.y0) * escala) / 2 - caja.y0 * escala
  const X = (v) => ox + v * escala
  const Y = (v) => oy + v * escala
  return (
    <div className="mapa-lienzo" ref={ref}>
      <svg className="plano-svg" width={tamano.ancho} height={tamano.alto} role="img" aria-label="Mapa de camas" onPointerMove={alPasar} onPointerLeave={tip.hide} onClick={alPulsar}>
        {tamano.ancho > 0 && (
          <>
            {zonas.map((z) => (
              <g key={z.id}>
                <rect className={`plano-zona plano-zona--${z.tipo}`} x={X(z.x)} y={Y(z.y)} width={z.ancho * escala} height={z.alto * escala} />
                {z.tipo === 'habitacion' && <text className="plano-rotulo plano-rotulo__codigo" x={X(z.x) + 5} y={Y(z.y) + 15}>{z.codigo}</text>}
                {z.tipo !== 'habitacion' && z.nombre && z.ancho * escala > z.nombre.length * 6.5 && <text className="mapa-rotulo-apoyo" x={X(z.x + z.ancho / 2)} y={Y(z.y + z.alto / 2)} textAnchor="middle">{z.nombre}</text>}
              </g>
            ))}
            {camas.map((c) => {
              const r = rectCama(c, zonaDe(c))
              const info = porCama.get(c.id)
              const [px, py, pw, ph] = [X(r.x), Y(r.y), r.ancho * escala, r.alto * escala]
              const banda = Math.min(pw, ph) * 0.22
              const cabecera = { 0: [px, py, pw, banda], 180: [px, py + ph - banda, pw, banda], 270: [px, py, banda, ph], 90: [px + pw - banda, py, banda, ph] }[c.rotacion]
              return (
                <g key={c.id} data-cama={c.id} className={claseCama(c.id, 'mapa-cama')}>
                  <rect className="mapa-cama__cuerpo" x={px} y={py} width={pw} height={ph} rx="3" />
                  <rect className="mapa-cama__cabecera" x={cabecera[0]} y={cabecera[1]} width={cabecera[2]} height={cabecera[3]} />
                  <IconoEstado x={px + pw / 2 - 24} y={py + ph / 2 - 6} nombre={iconoDe(info)} />
                  <text className="mapa-cama__codigo" x={px + pw / 2 + 7} y={py + ph / 2 + 4} textAnchor="middle">{c.codigo}</text>
                </g>
              )
            })}
          </>
        )}
      </svg>
    </div>
  )
}

/* Luz de cada zona (1 = plena, 0 = atenuada). Al enfocar otra habitación, la
   anterior se apaga mientras la nueva se enciende, con la misma curva suave
   que la cámara. Devuelve `luzDe(zonaId)`. */
function useLuces(focoId, zonas) {
  const luces = useRef(new Map())
  const ids = useRef([])
  ids.current = zonas.map((z) => z.id)
  const [, setCuadro] = useState(0)
  useEffect(() => {
    const destinoDe = (id) => (!focoId || id === focoId ? 1 : 0)
    const desde = new Map(luces.current)
    const todas = new Set([...ids.current, ...desde.keys()])
    if (reducirMovimiento()) {
      for (const z of todas) luces.current.set(z, destinoDe(z))
      setCuadro((n) => n + 1)
      return undefined
    }
    const inicio = performance.now()
    let id = 0
    const paso = (t) => {
      const k = suavizar(Math.min(1, (t - inicio) / FUNDIDO_MS))
      for (const z of todas) {
        const a = desde.get(z) ?? 1
        luces.current.set(z, a + (destinoDe(z) - a) * k)
      }
      setCuadro((n) => n + 1)
      if (k < 1) id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
  }, [focoId])
  /* Toda zona arranca encendida y desde ahí se funde. */
  return (zonaId) => luces.current.get(zonaId) ?? 1
}

/* Paleta resuelta de los tokens del kit; se vuelve a resolver si cambia el tema. */
function usePaleta(ref) {
  const [paleta, setPaleta] = useState(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const resolver = () => setPaleta(resolverPaleta(el))
    resolver()
    const observador = new MutationObserver(resolver)
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })
    const medio = window.matchMedia?.('(prefers-color-scheme: dark)')
    medio?.addEventListener?.('change', resolver)
    return () => {
      observador.disconnect()
      medio?.removeEventListener?.('change', resolver)
    }
  }, [ref])
  return paleta
}

/* En 3D se gira, se inclina y se acerca. Al pulsar una habitación (o una de
   sus camas) la cámara se acerca a ella y el resto se atenúa.

   Se pinta como figura (ai-iso-skill) en un canvas: el marco lleva el número
   de figura, el nombre, cómo se usa y una lectura en vivo. */
function Isometrica({ zonas, camas, caja, porCama, tip, texto, seleccion, onSeleccionar, titulo }) {
  const ref = useRef(null)
  const lienzo = useRef(null)
  const sensibles = useRef([])
  const tamano = useTamano(ref)
  const paleta = usePaleta(ref)
  /* La cama elegida (aquí o en la lista) manda; sin cama, una habitación
     pulsada en el plano. */
  const [salaId, setSalaId] = useState(null)
  const [encima, setEncima] = useState(null)
  /* Cuando un ícono termina de cargar, se vuelve a pintar. */
  const [, setIconos] = useState(0)
  const camaElegida = seleccion ? camas.find((c) => c.id === seleccion) : null
  const focoId = camaElegida?.zonaId ?? salaId
  const foco = zonas.find((z) => z.id === focoId && z.tipo === 'habitacion') ?? null
  const luzDe = useLuces(foco?.id ?? null, zonas)
  /* Se gira para mirar la habitación desde el pasillo y se centra entre la
     habitación y la cama elegida. */
  const objetivo = useMemo(() => {
    if (!foco) return null
    const azimut = azimutDesdePasillo(foco, zonas) ?? undefined
    const centroSala = { x: foco.x + foco.ancho / 2, y: foco.y + foco.alto / 2 }
    if (!camaElegida) return { clave: `sala:${foco.id}`, azimut, elevacion: ELEVACION_FOCO, centro: centroSala }
    const r = rectCama(camaElegida, foco)
    const centro = { x: (centroSala.x + r.x + r.ancho / 2) / 2, y: (centroSala.y + r.y + r.alto / 2) / 2 }
    return { clave: `cama:${camaElegida.id}`, azimut, elevacion: ELEVACION_FOCO, centro }
  }, [foco, camaElegida, zonas])
  const margenes = useMemo(() => ({ arriba: MARGEN, abajo: MARGEN + 40, izquierda: MARGEN, derecha: MARGEN }), [])

  const local = (e) => {
    const r = lienzo.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }
  const pulsar = (e) => {
    const s = bajoElPuntero(sensibles.current, ...local(e))
    setSalaId(s?.tipo === 'zona' ? s.id : null)
    onSeleccionar(s?.tipo === 'cama' ? s.id : null)
  }
  const salir = () => {
    setSalaId(null)
    onSeleccionar(null)
  }
  const escena = useCamara3d({ tamano, caja, margenes, foco, objetivo, onPulsar: pulsar, onSalirFoco: salir })
  const { vista, camara } = escena

  /* Se pinta tras cada cambio de cámara, datos, foco o tema: un solo canvas,
     sin elementos que React tenga que comparar. */
  useLayoutEffect(() => {
    const canvas = lienzo.current
    if (!canvas || !paleta || !tamano.ancho) return
    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(tamano.ancho * dpr) || canvas.height !== Math.round(tamano.alto * dpr)) {
      canvas.width = Math.round(tamano.ancho * dpr)
      canvas.height = Math.round(tamano.alto * dpr)
    }
    const infoDe = (c) => {
      const info = porCama.get(c.id)
      return { estado: info.estado, falla: info.falla, icono: iconoDe(info) }
    }
    const { figuras, sensibles: zonasSensibles } = construirEscena({ vista, zonas, camas, infoDe, foco, seleccion, encima, luzDe, pantalla: tamano })
    sensibles.current = zonasSensibles
    pintar(canvas.getContext('2d'), figuras, paleta, { ancho: tamano.ancho, alto: tamano.alto, dpr, alCargarIcono: () => setIconos((n) => n + 1) })
  })

  const alPasar = (e) => {
    const s = bajoElPuntero(sensibles.current, ...local(e))
    const camaId = s?.tipo === 'cama' ? s.id : null
    if (camaId !== encima) setEncima(camaId)
    lienzo.current.style.cursor = s ? 'pointer' : ''
    if (s?.tipo === 'cama') {
      const t = texto(porCama.get(s.id))
      tip.follow(e, t.titulo, t.cuerpo)
    } else if (s?.tipo === 'zona') {
      tip.follow(e, `Habitación ${s.codigo}`, s.id === foco?.id ? 'Pulsa una cama para ver sus acciones.' : 'Selecciónala para acercarte a ella.')
    } else {
      tip.hide()
    }
  }
  const alSalir = () => {
    tip.hide()
    setEncima(null)
  }

  const estados = camas.map((c) => porCama.get(c.id).estado)
  const ocupadas = estados.filter((e) => OCUPADA.includes(e)).length
  const libres = estados.filter((e) => e === 'libre').length
  const lectura = [
    `${camas.length} camas`,
    `${ocupadas} ocupadas`,
    `${libres} libres`,
    foco ? `en ${foco.codigo}` : null,
    `giro ${Math.round(camara.azimut)}°`,
    `${camara.zoom.toFixed(1)}×`,
  ].filter(Boolean).join(' · ')

  return (
    <figure className="figura3d">
      <figcaption className="figura3d__fila">
        <span className="figura3d__fig">Fig. 1</span>
        <span>{titulo}</span>
      </figcaption>
      <div
        className="mapa-lienzo escena3d"
        ref={ref}
        {...escena.lienzo}
        aria-label="Plano de camas en 3D. Elige una cama en el plano o en la lista; Esc vuelve a ver todo el piso."
      >
        <canvas
          ref={lienzo}
          className="plano-svg escena3d__canvas"
          style={{ width: tamano.ancho, height: tamano.alto }}
          role="img"
          aria-label={`Plano 3D de ${titulo}: ${lectura}`}
          onPointerMove={alPasar}
          onPointerLeave={alSalir}
          {...escena.superficie}
        />
        {tamano.ancho > 0 && <ControlesCamara {...escena.controles} />}
      </div>
      <div className="figura3d__fila">
        <span>Pulsa una cama o una habitación · o elígela en la lista</span>
        <output className="figura3d__lectura" aria-live="polite">{lectura}</output>
      </div>
    </figure>
  )
}
