import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { rectCama } from '../../dominio/plano.js'
import { ESTADOS_CAMA_MAPA, MARCA_SOPORTE } from '../../dominio/consultas.js'
import { useTamano } from '../plano/comun.js'
import { nombreServicio } from '../comun.jsx'
import { ControlesCamara, useCamara3d } from '../plano/Escena3D.jsx'
import { bajoElPuntero, construirEscena } from '../plano/escena3d.js'
import { azimutDesdePasillo, suavizar } from '../plano/camara3d.js'
import { pintar, resolverPaleta } from '../plano/pintura3d.js'

/* El plano ya cargado (no se edita desde la interfaz), con cada cama pintada
   según su estado. Se encuadra en las habitaciones de los servicios visibles.
   Además del color, cada cama lleva código e ícono.

   La vista 3D se pinta en canvas (ver `escena3d.js` y `pintura3d.js`) para que
   girar y acercar vaya fluido; la planta 2D sigue en SVG. */

const MARGEN = 18
const FUNDIDO_MS = 900
/* Inclinación al enfocar: lo bastante alta para ver dentro de la habitación. */
const ELEVACION_FOCO = 50

const cajaDe = (zonas) => ({
  x0: Math.min(...zonas.map((z) => z.x)),
  y0: Math.min(...zonas.map((z) => z.y)),
  x1: Math.max(...zonas.map((z) => z.x + z.ancho)),
  y1: Math.max(...zonas.map((z) => z.y + z.alto)),
})

/* Encuadre de un área: sus habitaciones y un margen corto, lo justo para ver
   el corredor que las une sin traer el resto del piso. */
const MARGEN_AREA = 1.5
function encuadre(propias) {
  const b = cajaDe(propias)
  return { x0: b.x0 - MARGEN_AREA, y0: b.y0 - MARGEN_AREA, x1: b.x1 + MARGEN_AREA, y1: b.y1 + MARGEN_AREA }
}

/* Ícono del sprite del kit con un solo `<use>` (planta 2D). */
function IconoEstado({ x, y, nombre, lado = 12 }) {
  return <use href={`#${nombre}`} x={x} y={y} width={lado} height={lado} className="mapa-icono" aria-hidden="true" />
}

const iconoDe = (info) => ESTADOS_CAMA_MAPA[info.estado].icono

/* Paciente visto desde arriba: cabeza junto a la cabecera y el cuerpo bajo la
   frazada. `s` va de la cabecera a los pies y `t` de un costado al otro, ambos
   de 0 a 1 sobre el rectángulo de la cama. */
function PacientePlanta({ x, y, ancho, alto, rotacion }) {
  const girada = rotacion % 180 !== 0
  const [L, W] = girada ? [ancho, alto] : [alto, ancho]
  const punto = {
    0: (s, t) => [x + t * ancho, y + s * alto],
    180: (s, t) => [x + (1 - t) * ancho, y + (1 - s) * alto],
    270: (s, t) => [x + s * ancho, y + t * alto],
    90: (s, t) => [x + (1 - s) * ancho, y + (1 - t) * alto],
  }[rotacion]
  const [hx, hy] = punto(0.16, 0.5)
  const [ax, ay] = punto(0.29, 0.18)
  const [bx, by] = punto(0.9, 0.82)
  return (
    <g className="mapa-paciente" aria-hidden="true">
      <rect className="mapa-paciente__cuerpo" x={Math.min(ax, bx)} y={Math.min(ay, by)} width={Math.abs(bx - ax)} height={Math.abs(by - ay)} rx={W * 0.22} />
      <circle className="mapa-paciente__cabeza" cx={hx} cy={hy} r={Math.min(W * 0.2, L * 0.09)} />
    </g>
  )
}

/* Memorizado: solo se vuelve a dibujar si cambian los datos, la selección o la
   cámara, no cuando la pantalla de arriba cambia por otra cosa.

   Se dibuja el piso entero con su distribución, pero la vista general
   encuadra solo el `area` elegida (`general`); al cambiar de área la cámara
   vuela hasta la nueva. Solo las habitaciones del área van activas (color de
   leyenda, se pueden elegir); las demás quedan atenuadas y con camas neutras.
   `estados` trae las camas de todas las áreas de la cuenta, para fundir
   también la que se apaga. */
export const VistaMapa = memo(function VistaMapa({ plano, estados, area, vista, seleccion, onSeleccionar, tip, texto }) {
  /* El piso entero fija la escala del 3D: no cambia con el área ni con cada
     cambio de estado (la cámara se reiniciaría). */
  const caja = useMemo(() => cajaDe(plano.zonas), [plano.zonas])
  const general = useMemo(
    () => encuadre(plano.zonas.filter((z) => z.tipo === 'habitacion' && z.servicioId === area)),
    [area, plano.zonas],
  )
  const zonas = plano.zonas
  const porCama = new Map(estados.map((x) => [x.cama.id, x]))
  const zonaDe = (c) => plano.zonas.find((z) => z.id === c.zonaId)
  /* Activa: habitación del área con estado conocido. Pasillos y apoyos no son
     de ningún área y quedan siempre a la vista. */
  const esActiva = (z) => z.tipo !== 'habitacion' || z.servicioId === area
  const camas = plano.camas.filter((c) => zonas.some((z) => z.id === c.zonaId) && (!esActiva(zonaDe(c)) || porCama.has(c.id)))
  /* Para la lectura del plano: solo las del área. */
  const delArea = camas.filter((c) => esActiva(zonaDe(c)))

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
    return `${base} mapa-estado--${info.estado}${seleccion === id ? ' es-seleccion' : ''}`
  }
  const titulo = nombreServicio(area)
  const comun = { zonas, camas, delArea, caja, general, porCama, claseCama, zonaDe, esActiva, area, alPasar, tip, texto, seleccion, onSeleccionar, titulo }

  return vista === 'iso' ? <Isometrica {...comun} /> : <Planta {...comun} />
})

/* En la planta, lo de otra área se apaga con una transición de CSS y sus camas
   pierden el color de estado, el paciente y los rótulos. Se encuadra el área;
   lo demás del piso queda en los bordes o fuera de la vista. */
function Planta({ zonas, camas, general: caja, porCama, claseCama, zonaDe, esActiva, alPasar, tip, onSeleccionar }) {
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
              <g key={z.id} className={esActiva(z) ? 'mapa-zona' : 'mapa-zona es-inactiva'}>
                <rect className={`plano-zona plano-zona--${z.tipo}`} x={X(z.x)} y={Y(z.y)} width={z.ancho * escala} height={z.alto * escala} />
                {z.tipo === 'habitacion' && <text className="plano-rotulo plano-rotulo__codigo" x={X(z.x) + 5} y={Y(z.y) + 15}>{z.codigo}</text>}
                {z.tipo !== 'habitacion' && z.nombre && z.ancho * escala > z.nombre.length * 6.5 && <text className="mapa-rotulo-apoyo" x={X(z.x + z.ancho / 2)} y={Y(z.y + z.alto / 2)} textAnchor="middle">{z.nombre}</text>}
              </g>
            ))}
            {camas.map((c) => {
              const r = rectCama(c, zonaDe(c))
              const [px, py, pw, ph] = [X(r.x), Y(r.y), r.ancho * escala, r.alto * escala]
              const banda = Math.min(pw, ph) * 0.22
              const cabecera = { 0: [px, py, pw, banda], 180: [px, py + ph - banda, pw, banda], 270: [px, py, banda, ph], 90: [px + pw - banda, py, banda, ph] }[c.rotacion]
              const cuerpo = (
                <>
                  <rect className="mapa-cama__cuerpo" x={px} y={py} width={pw} height={ph} rx="3" />
                  <rect className="mapa-cama__cabecera" x={cabecera[0]} y={cabecera[1]} width={cabecera[2]} height={cabecera[3]} />
                </>
              )
              /* La misma clave en las dos formas: al cambiar de área, el color
                 se funde en vez de saltar. */
              if (!esActiva(zonaDe(c))) return <g key={c.id} className="mapa-cama mapa-cama--inactiva" aria-hidden="true">{cuerpo}</g>
              const info = porCama.get(c.id)
              return (
                <g key={c.id} data-cama={c.id} className={claseCama(c.id, 'mapa-cama')}>
                  {cuerpo}
                  <g className="mapa-cama__detalle">
                    {info.ocupante && <PacientePlanta x={px} y={py} ancho={pw} alto={ph} rotacion={c.rotacion} />}
                    <IconoEstado x={px + pw / 2 - 24} y={py + ph / 2 - 6} nombre={iconoDe(info)} />
                    <text className="mapa-cama__codigo mapa-cama__codigo--iso" x={px + pw / 2 + 7} y={py + ph / 2 + 4} textAnchor="middle">{c.codigo}</text>
                    {info.soporte && (
                      <g className="mapa-marca">
                        <rect x={px + pw / 2 - 11} y={py + ph / 2 + 8} width={22} height={13} rx="2" />
                        <text x={px + pw / 2} y={py + ph / 2 + 18} textAnchor="middle">{MARCA_SOPORTE[info.soporte]}</text>
                      </g>
                    )}
                  </g>
                </g>
              )
            })}
          </>
        )}
      </svg>
    </div>
  )
}

/* Un valor de 0 a 1 por zona que se funde hacia `destinoDe(zonaId)` cada vez
   que cambia `clave`, con la misma curva suave que la cámara: lo que se apaga
   y lo que se enciende van a la vez, cada zona desde donde iba. Al montarse,
   cada zona ya está en su destino. Devuelve `valorDe(zonaId)`. */
function useFundido(clave, zonas, destinoDe) {
  const valores = useRef(new Map())
  const ids = useRef([])
  ids.current = zonas.map((z) => z.id)
  const destino = useRef(destinoDe)
  destino.current = destinoDe
  /* El destino anterior: de ahí parte una zona que aún no tenía valor. */
  const anterior = useRef(destinoDe)
  const [, setCuadro] = useState(0)
  useEffect(() => {
    const hacia = destino.current
    const previo = anterior.current
    anterior.current = hacia
    const todas = new Set([...ids.current, ...valores.current.keys()])
    const desde = new Map([...todas].map((z) => [z, valores.current.get(z) ?? previo(z)]))
    if ([...todas].every((z) => desde.get(z) === hacia(z))) {
      for (const z of todas) valores.current.set(z, hacia(z))
      return undefined
    }
    const inicio = performance.now()
    let id = 0
    const paso = (t) => {
      const k = suavizar(Math.min(1, (t - inicio) / FUNDIDO_MS))
      for (const z of todas) {
        const a = desde.get(z)
        valores.current.set(z, a + (hacia(z) - a) * k)
      }
      setCuadro((n) => n + 1)
      if (k < 1) id = requestAnimationFrame(paso)
    }
    id = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(id)
    // Solo se funde cuando cambia lo que se enfoca o se activa.
  }, [clave])
  return (zonaId) => valores.current.get(zonaId) ?? anterior.current(zonaId)
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

   Se pinta en un canvas, sin marco alrededor: un panel redondeado con la
   lectura en vivo arriba a la izquierda y la botonera abajo a la derecha. */
function Isometrica({ zonas, camas, delArea, caja, general,porCama, esActiva, area, tip, texto, seleccion, onSeleccionar, titulo }) {
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
  const foco = zonas.find((z) => z.id === focoId && z.tipo === 'habitacion' && esActiva(z)) ?? null
  const luzDe = useFundido(foco?.id ?? null, zonas, (id) => (!foco || id === foco.id ? 1 : 0))
  const activas = new Set(zonas.filter(esActiva).map((z) => z.id))
  const activaDe = useFundido(area, zonas, (id) => (activas.has(id) ? 1 : 0))
  /* Los códigos de cama solo en la habitación enfocada; entran y salen con
     el mismo fundido. */
  const rotuloDe = useFundido(foco?.id ?? null, zonas, (id) => (foco && id === foco.id ? 1 : 0))
  /* Otra área: la habitación pulsada de la anterior deja de mandar. */
  useEffect(() => setSalaId(null), [area])
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
  const escena = useCamara3d({ tamano, caja, general, margenes, foco, objetivo, onPulsar: pulsar, onSalirFoco: salir })
  const { vista, camara } = escena

  /* Con el plano fuera de la pantalla, la deriva en reposo se detiene. */
  const alVerse = escena.alVerse
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const observador = new IntersectionObserver(([e]) => alVerse(e.isIntersecting))
    observador.observe(el)
    return () => observador.disconnect()
  }, [alVerse])

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
      if (!info) return null
      return { estado: info.estado, ocupada: Boolean(info.ocupante), falla: info.falla, icono: iconoDe(info), marca: MARCA_SOPORTE[info.soporte] ?? null }
    }
    const { figuras, sensibles: zonasSensibles } = construirEscena({ vista, zonas, camas, infoDe, foco, seleccion, encima, luzDe, activaDe, rotuloDe, pantalla: tamano })
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

  const infos = delArea.map((c) => porCama.get(c.id))
  const ocupadas = infos.filter((x) => x.ocupante).length
  const libres = infos.filter((x) => x.libre).length
  const lectura = [
    `${infos.length} camas`,
    `${ocupadas} ocupadas`,
    `${libres} libres`,
    foco ? `en ${foco.codigo}` : null,
    `giro ${Math.round(camara.azimut)}°`,
    `${camara.zoom.toFixed(1)}×`,
  ].filter(Boolean).join(' · ')

  return (
    <figure className="figura3d">
      <div
        className="mapa-lienzo escena3d"
        ref={ref}
        {...escena.lienzo}
        aria-label="Plano de camas en 3D. Elige una cama en el plano o en la lista; Esc vuelve a ver toda el área."
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
        <output className="figura3d__lectura" aria-live="polite">{lectura}</output>
        {tamano.ancho > 0 && <ControlesCamara {...escena.controles} />}
      </div>
    </figure>
  )
}
