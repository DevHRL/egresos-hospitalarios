import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Tooltip } from '@hrl/core-ui'
import { acotar, areaLibre, camaraHacia, camaraInicial, camaraSobre, escalaBase, interpolar, proyector } from './camara3d.js'

/* Cámara guiada del plano 3D. Quien usa el plano no la mueve a mano: la
   mueve el sistema al elegir una cama o una habitación (en el plano o en la
   lista), con «Vista general» y con los giros de 90°. La cuenta está en
   `camara3d.js`; aquí solo se anima el paso de una cámara a otra.

   Por qué guiada: la página sigue debajo del plano (la ficha de la cama), y
   con la rueda o el arrastre el plano se quedaba con el desplazamiento de la
   página; además, cada selección llega siempre a un ángulo legible.

   Un clic (o un toque) sobre el plano llega a `onPulsar` con el evento. */

const DURACION_MS = 520
const SIN_MARGENES = { arriba: 16, abajo: 16, izquierda: 16, derecha: 16 }

const reducirMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/* `foco` es la habitación a encuadrar; `objetivo` ({ clave, azimut, elevacion,
   centro }) dice además desde dónde mirarla y qué centrar. Cada `clave` nueva
   anima la cámara hasta ahí (girando por el camino más corto). */
export function useCamara3d({ tamano, caja, margenes = SIN_MARGENES, foco = null, objetivo = null, onPulsar, onSalirFoco }) {
  const [camara, setCamaraEstado] = useState(() => camaraInicial(caja))
  const actual = useRef(camara)
  const animacion = useRef(0)
  const cuadro = useRef(0)

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

  /* Enfocar una habitación o volver a ver todo el piso, con el giro que haya. */
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

  const girar = (grados) => animarA(acotar({ ...actual.current, azimut: actual.current.azimut + grados }))
  const vistaGeneral = () => {
    if (foco) onSalirFoco?.()
    animarA(camaraInicial(caja))
  }

  /* Teclado: Esc vuelve a ver todo el piso. Elegir camas se hace con la lista. */
  const alTeclear = (e) => {
    if (e.key !== 'Escape' || !foco) return
    e.preventDefault()
    onSalirFoco?.()
  }

  /* Funciones estables para la botonera: así no se vuelve a dibujar en cada
     cuadro de una animación. Siempre llaman a la versión vigente. */
  const vigentes = useRef({})
  vigentes.current = { girar, vistaGeneral }
  const estables = useMemo(() => ({
    girar: (g) => vigentes.current.girar(g),
    vistaGeneral: () => vigentes.current.vistaGeneral(),
  }), [])

  return {
    vista,
    camara,
    lienzo: { tabIndex: -1, onKeyDown: alTeclear },
    superficie: { onClick: (e) => onPulsar?.(e) },
    controles: { ...estables, hayFoco: Boolean(foco), nombreFoco: foco?.codigo || foco?.nombre || '' },
  }
}

/* Botonera del plano, abajo a la derecha. El kit aún no tiene iconos de girar:
   por eso los giros llevan texto. */
export const ControlesCamara = memo(function ControlesCamara({ girar, vistaGeneral, hayFoco, nombreFoco }) {
  return (
    <div className="escena3d__controles" role="toolbar" aria-label="Vista del plano 3D">
      <div className="plano-flotante">
        <Button tone={hayFoco ? 'blue' : 'ghost'} size="sm" icon={hayFoco ? 'sh-close' : 'sh-home'} onClick={vistaGeneral} aria-label={hayFoco ? `Salir de ${nombreFoco} y ver todo el piso (Esc)` : 'Vista general del piso'}>
          Vista general
        </Button>
        <span className="plano-flotante__separador" aria-hidden="true" />
        <Tooltip title="Girar a la izquierda" body="Gira el plano 90° alrededor de lo que se está viendo." focusable={false}>
          <Button tone="ghost" size="sm" onClick={() => girar(-90)} aria-label="Girar 90° a la izquierda">−90°</Button>
        </Tooltip>
        <Tooltip title="Girar a la derecha" body="Gira el plano 90° alrededor de lo que se está viendo." focusable={false}>
          <Button tone="ghost" size="sm" onClick={() => girar(90)} aria-label="Girar 90° a la derecha">+90°</Button>
        </Tooltip>
      </div>
    </div>
  )
})
