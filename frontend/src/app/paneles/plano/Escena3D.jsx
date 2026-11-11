import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Tooltip } from '@hrl/core-ui'
import {
  acotar, areaLibre, camaraHacia, camaraInicial, camaraSobre, escalaBase, interpolar, pantallaAPiso, proyector, zoomHacia,
} from './camara3d.js'

/* Gestos y controles de las vistas 3D. La cuenta está en `camara3d.js`;
   aquí solo se traduce el puntero, la rueda y el teclado a cambios de
   cámara, y se anima el paso de una cámara a otra.

   - Arrastrar: gira (de lado a lado) e inclina (de arriba abajo).
   - Mayús + arrastrar o clic derecho: desplaza.
   - Rueda o pellizco: acerca hacia el puntero.
   - Un clic sin arrastrar llega a `onPulsar` con el evento del puntero.

   Rendimiento: los gestos llegan más rápido que la pantalla, así que la
   cámara se publica como mucho una vez por cuadro. */

const UMBRAL_PX = 4
const GRADOS_POR_PX = 0.4
const DURACION_MS = 520
const SIN_MARGENES = { arriba: 16, abajo: 16, izquierda: 16, derecha: 16 }

const reducirMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* `foco` es la habitación a encuadrar; `objetivo` ({ clave, azimut, elevacion,
   centro }) dice además desde dónde mirarla y qué centrar. Cada `clave` nueva
   anima la cámara hasta ahí (girando por el camino más corto). */
export function useCamara3d({ ref, tamano, caja, margenes = SIN_MARGENES, foco = null, objetivo = null, onPulsar, onSalirFoco }) {
  const [camara, setCamaraEstado] = useState(() => camaraInicial(caja))
  const [arrastrando, setArrastrando] = useState(false)
  const actual = useRef(camara)
  const animacion = useRef(0)
  const cuadro = useRef(0)
  const gesto = useRef(null)
  const punteros = useRef(new Map())

  const area = useMemo(() => areaLibre(tamano, margenes), [tamano, margenes])
  const base = useMemo(() => escalaBase(caja, area), [caja, area])
  const vista = useMemo(() => proyector(camara, area, base), [camara, area, base])

  /* La cámara vive en una ref y se publica al estado una vez por cuadro. */
  const fijar = useCallback((c) => {
    actual.current = c
    if (!cuadro.current) {
      cuadro.current = requestAnimationFrame(() => {
        cuadro.current = 0
        setCamaraEstado(actual.current)
      })
    }
  }, [])

  const detener = () => cancelAnimationFrame(animacion.current)

  const animarA = useCallback((destino) => {
    cancelAnimationFrame(animacion.current)
    const desde = actual.current
    if (reducirMovimiento()) return fijar(destino)
    const inicio = performance.now()
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / DURACION_MS)
      fijar(t === 1 ? destino : interpolar(desde, destino, t))
      if (t < 1) animacion.current = requestAnimationFrame(paso)
    }
    animacion.current = requestAnimationFrame(paso)
  }, [fijar])

  useEffect(() => () => {
    cancelAnimationFrame(animacion.current)
    cancelAnimationFrame(cuadro.current)
  }, [])

  /* Otro piso u otro servicio: se vuelve a la vista inicial. */
  const claveCaja = `${caja.x0},${caja.y0},${caja.x1},${caja.y1}`
  useEffect(() => {
    cancelAnimationFrame(animacion.current)
    fijar(camaraInicial(caja))
    // Solo cuando cambia lo que se encuadra.
  }, [claveCaja])

  /* Enfocar una habitación o volver a ver todo, con el giro que haya. */
  const focoId = foco ? `${foco.id}|${objetivo?.clave ?? ''}` : null
  const habiaFoco = useRef(false)
  useEffect(() => {
    if (!tamano.ancho) return
    if (foco) {
      habiaFoco.current = true
      animarA(objetivo ? camaraHacia(actual.current, foco, area, base, objetivo) : camaraSobre(actual.current, foco, area, base))
    } else if (habiaFoco.current) {
      habiaFoco.current = false
      animarA({ ...actual.current, zoom: 1, centro: camaraInicial(caja).centro })
    }
    // Reacciona al cambio de habitación, no a cada render.
  }, [focoId, tamano.ancho > 0])

  /* La rueda se registra a mano: React la deja pasiva y entonces no se
     puede evitar que la página se desplace. */
  const areaRef = useRef(area)
  const baseRef = useRef(base)
  areaRef.current = area
  baseRef.current = base
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rueda = (e) => {
      e.preventDefault()
      detener()
      const r = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      fijar(zoomHacia(actual.current, factor, areaRef.current, baseRef.current, e.clientX - r.left, e.clientY - r.top))
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [ref, fijar])

  const local = (e) => {
    const r = ref.current.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  const alPresionar = (e) => {
    if (e.button !== 0 && e.button !== 2) return
    detener()
    punteros.current.set(e.pointerId, local(e))
    if (punteros.current.size === 2) {
      /* Dos dedos: pellizco. El gesto de un dedo que había se descarta. */
      const [a, b] = [...punteros.current.values()]
      gesto.current = { tipo: 'pellizco', distancia: Math.hypot(a[0] - b[0], a[1] - b[1]), movido: true }
      return
    }
    gesto.current = {
      tipo: e.button === 2 || e.shiftKey ? 'mover' : 'girar',
      x: e.clientX,
      y: e.clientY,
      movido: false,
      id: e.pointerId,
      superficie: e.currentTarget,
    }
  }

  const alMover = (e) => {
    const g = gesto.current
    if (!g) return false
    if (punteros.current.has(e.pointerId)) punteros.current.set(e.pointerId, local(e))

    if (g.tipo === 'pellizco') {
      const [a, b] = [...punteros.current.values()]
      if (!b) return true
      const distancia = Math.hypot(a[0] - b[0], a[1] - b[1])
      const medio = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      fijar(zoomHacia(actual.current, distancia / g.distancia, area, base, ...medio))
      g.distancia = distancia
      return true
    }

    const dx = e.clientX - g.x
    const dy = e.clientY - g.y
    if (!g.movido) {
      if (Math.hypot(dx, dy) < UMBRAL_PX) return false
      g.movido = true
      /* Se captura recién al arrastrar: así el arrastre sigue aunque el
         puntero salga del plano. */
      try {
        g.superficie.setPointerCapture?.(g.id)
      } catch {
        /* Un puntero que ya se soltó no se puede capturar: el gesto sigue igual. */
      }
      setArrastrando(true)
    }
    g.x = e.clientX
    g.y = e.clientY
    const c = actual.current
    if (g.tipo === 'girar') {
      fijar(acotar({ ...c, azimut: c.azimut - dx * GRADOS_POR_PX, elevacion: c.elevacion + dy * GRADOS_POR_PX * 0.6 }))
    } else {
      const d = pantallaAPiso(c, vista.escala, dx, dy)
      fijar({ ...c, centro: { x: c.centro.x - d.x, y: c.centro.y - d.y } })
    }
    return true
  }

  const alSoltar = (e) => {
    punteros.current.delete(e.pointerId)
    const g = gesto.current
    if (!g) return
    if (g.tipo === 'pellizco') {
      if (punteros.current.size === 0) gesto.current = null
      return
    }
    gesto.current = null
    setArrastrando(false)
    if (!g.movido && e.type === 'pointerup' && e.button === 0) onPulsar?.(e)
  }

  const girar = (grados) => animarA(acotar({ ...actual.current, azimut: actual.current.azimut + grados }))
  const acercar = (factor) => animarA(zoomHacia(actual.current, factor, area, base, area.cx, area.cy))
  const reiniciar = () => {
    if (foco) onSalirFoco?.()
    animarA(camaraInicial(caja))
  }

  const alTeclear = (e) => {
    const acciones = {
      ArrowLeft: () => girar(-15),
      ArrowRight: () => girar(15),
      ArrowUp: () => animarA(acotar({ ...actual.current, elevacion: actual.current.elevacion + 8 })),
      ArrowDown: () => animarA(acotar({ ...actual.current, elevacion: actual.current.elevacion - 8 })),
      '+': () => acercar(1.25),
      '=': () => acercar(1.25),
      '-': () => acercar(0.8),
      0: reiniciar,
      Escape: foco ? onSalirFoco : null,
    }
    const accion = acciones[e.key]
    if (!accion) return
    /* La tecla es de la cámara: que no siga hacia la página (las flechas la
       desplazarían). */
    e.preventDefault()
    e.stopPropagation()
    accion()
  }

  /* Funciones estables para la botonera: así no se vuelve a dibujar en cada
     cuadro del giro. Siempre llaman a la versión vigente. */
  const vigentes = useRef({})
  vigentes.current = { girar, acercar, reiniciar, salirFoco: onSalirFoco }
  const estables = useMemo(() => ({
    girar: (g) => vigentes.current.girar(g),
    acercar: (f) => vigentes.current.acercar(f),
    reiniciar: () => vigentes.current.reiniciar(),
    salirFoco: () => vigentes.current.salirFoco?.(),
  }), [])

  return {
    vista,
    camara,
    arrastrando,
    lienzo: { tabIndex: 0, onKeyDown: alTeclear },
    superficie: {
      onPointerDown: alPresionar,
      onPointerUp: alSoltar,
      onPointerCancel: alSoltar,
      onContextMenu: (e) => e.preventDefault(),
    },
    /* Devuelve true si el movimiento fue parte de un gesto (sin tooltip). */
    mover: alMover,
    controles: { ...estables, hayFoco: Boolean(foco), nombreFoco: foco?.codigo || foco?.nombre || '' },
  }
}

/* Botonera de la cámara, abajo a la derecha del plano. El kit aún no tiene
   iconos de girar ni de zoom: por eso los botones llevan texto. */
export const ControlesCamara = memo(function ControlesCamara({ girar, acercar, reiniciar, salirFoco, hayFoco, nombreFoco }) {
  return (
    <div className="escena3d__controles" role="toolbar" aria-label="Cámara 3D">
      {hayFoco && (
        <Button tone="blue" size="sm" icon="sh-close" onClick={salirFoco} aria-label="Ver todo el piso (Esc)">
          {nombreFoco ? `Salir de ${nombreFoco}` : 'Ver todo'}
        </Button>
      )}
      <div className="plano-flotante">
        <Tooltip title="Girar a la izquierda (←)" body="Arrastra de lado a lado para girar libremente." focusable={false}>
          <Button tone="ghost" size="sm" onClick={() => girar(-90)} aria-label="Girar 90° a la izquierda">−90°</Button>
        </Tooltip>
        <Tooltip title="Girar a la derecha (→)" body="Arrastra hacia arriba o abajo para inclinar." focusable={false}>
          <Button tone="ghost" size="sm" onClick={() => girar(90)} aria-label="Girar 90° a la derecha">+90°</Button>
        </Tooltip>
        <span className="plano-flotante__separador" aria-hidden="true" />
        <Button tone="ghost" size="sm" onClick={() => acercar(0.8)} aria-label="Alejar (−)">−</Button>
        <Tooltip title="Vista inicial (0)" body="Vuelve al isométrico con todo el piso a la vista." focusable={false}>
          <Button tone="ghost" size="sm" onClick={reiniciar}>Inicial</Button>
        </Tooltip>
        <Button tone="ghost" size="sm" onClick={() => acercar(1.25)} aria-label="Acercar (+)">+</Button>
      </div>
    </div>
  )
})
