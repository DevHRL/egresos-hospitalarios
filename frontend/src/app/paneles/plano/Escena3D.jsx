import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Tooltip } from '@hrl/core-ui'
import { acotar, areaLibre, camaraGeneral, camaraHacia, camaraInicial, camaraSobre, camaraSobreCaja, deriva, escalaBase, proyector, vuelo } from './camara3d.js'

/* Cámara guiada del plano 3D. Quien usa el plano no la mueve a mano: la
   mueve el sistema al elegir una cama o una habitación (en el plano o en la
   lista), con «Vista general» y con los giros de 90°. La cuenta está en
   `camara3d.js`; aquí solo se anima el paso de una cámara a otra.

   Por qué guiada: la página sigue debajo del plano (la ficha de la cama), y
   con la rueda o el arrastre el plano se quedaba con el desplazamiento de la
   página; además, cada selección llega siempre a un ángulo legible.

   Movimiento: cada cambio es un vuelo (se aleja, viaja y se acerca en una
   sola curva, ver `vuelo`) y, en reposo, una deriva muy lenta mantiene viva
   la maqueta. Las animaciones se muestran aunque el sistema pida reducir
   movimiento: sin ellas el plano saltaba y no se entendía a dónde iba.

   Un clic (o un toque) sobre el plano llega a `onPulsar` con el evento. */

const SIN_MARGENES = { arriba: 16, abajo: 16, izquierda: 16, derecha: 16 }
/* La deriva se pinta a la mitad de cuadros: es lenta y así gasta menos. */
const CUADROS_DERIVA = 2

/* `caja` fija la escala del plano (no cambia al cambiar de área); `general`,
   lo que encuadra la vista general (el área elegida; sin ella, toda la caja).
   Al cambiar `general` la cámara vuela hasta ahí.

   `foco` es la habitación a encuadrar; `objetivo` ({ clave, azimut, elevacion,
   centro }) dice además desde dónde mirarla y qué centrar. Cada `clave` nueva
   anima la cámara hasta ahí (girando por el camino más corto). */
export function useCamara3d({ tamano, caja, general = null, margenes = SIN_MARGENES, foco = null, objetivo = null, onPulsar, onSalirFoco }) {
  const [camara, setCamaraEstado] = useState(() => camaraInicial(general ?? caja))
  const actual = useRef(camara)
  const animacion = useRef(0)
  const cuadro = useRef(0)

  const area = useMemo(() => areaLibre(tamano, margenes), [tamano, margenes])
  const base = useMemo(() => escalaBase(caja, area), [caja, area])
  const vista = useMemo(() => proyector(camara, area, base), [camara, area, base])

  /* La cámara que se ve vive en una ref y se publica al estado una vez por
     cuadro. `destino` es a dónde va (o donde reposa): los giros se suman a
     él, así dos clics seguidos giran 180°. */
  const destinoRef = useRef(camara)
  const fijar = useCallback((c) => {
    actual.current = c
    if (!cuadro.current) {
      cuadro.current = requestAnimationFrame(() => {
        cuadro.current = 0
        setCamaraEstado(actual.current)
      })
    }
  }, [])

  const anchoVista = useRef(1)
  anchoVista.current = area.ancho / base

  /* En reposo, deriva lenta alrededor del destino, mientras el plano se vea. */
  const enPantalla = useRef(true)
  const derivar = useCallback(() => {
    const reposo = destinoRef.current
    const inicio = performance.now()
    let n = 0
    const paso = (ahora) => {
      if (enPantalla.current && n++ % CUADROS_DERIVA === 0) fijar(deriva(reposo, (ahora - inicio) / 1000))
      animacion.current = requestAnimationFrame(paso)
    }
    animacion.current = requestAnimationFrame(paso)
  }, [fijar])

  const verse = useCallback((visible) => { enPantalla.current = visible }, [])

  /* Vuela desde lo que se ve ahora (con su deriva) hasta el destino. */
  const animarA = useCallback((destino) => {
    cancelAnimationFrame(animacion.current)
    destinoRef.current = destino
    const desde = actual.current
    const { duracion, en } = vuelo(desde, destino, anchoVista.current)
    const inicio = performance.now()
    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / duracion)
      fijar(en(t))
      if (t < 1) animacion.current = requestAnimationFrame(paso)
      else derivar()
    }
    animacion.current = requestAnimationFrame(paso)
  }, [fijar, derivar])

  useEffect(() => {
    derivar()
    return () => {
      cancelAnimationFrame(animacion.current)
      cancelAnimationFrame(cuadro.current)
    }
  }, [derivar])

  /* La vista general desde la cámara `desde` (con su giro): el área entera. */
  const vistaDelArea = (desde) => (general
    ? camaraSobreCaja(desde, general, area, base)
    : { ...desde, zoom: 1, centro: camaraInicial(caja).centro })

  /* Se deja la cámara en `c` sin animar y la deriva sigue desde ahí. */
  const reposar = (c) => {
    cancelAnimationFrame(animacion.current)
    destinoRef.current = c
    fijar(c)
    derivar()
  }

  /* Vista general canónica: el área con su giro propio (ver `azimutGeneral`). */
  const generalCanonica = () => vistaDelArea(general ? camaraGeneral(general) : camaraInicial(caja))

  /* Otro piso: se encuadra el área sin animar (también la primera vez que se
     conoce el tamaño). Otra área del mismo piso: la cámara vuela hasta ella. */
  const claveCaja = `${caja.x0},${caja.y0},${caja.x1},${caja.y1}`
  const claveGeneral = general ? `${general.x0},${general.y0},${general.x1},${general.y1}` : ''
  const encuadrada = useRef(null)
  useEffect(() => {
    if (!tamano.ancho) return
    if (encuadrada.current !== claveCaja) reposar(generalCanonica())
    else if (!foco) animarA(generalCanonica())
    encuadrada.current = claveCaja
    // Solo cuando cambia lo que se encuadra.
  }, [claveCaja, claveGeneral, tamano.ancho > 0])

  /* Enfocar una habitación o volver a ver el área, con el giro que haya. */
  const focoId = foco ? `${foco.id}|${objetivo?.clave ?? ''}` : null
  const habiaFoco = useRef(false)
  useEffect(() => {
    if (!tamano.ancho) return
    if (foco) {
      habiaFoco.current = true
      const desde = destinoRef.current
      animarA(objetivo ? camaraHacia(desde, foco, area, base, objetivo) : camaraSobre(desde, foco, area, base))
    } else if (habiaFoco.current) {
      habiaFoco.current = false
      animarA(vistaDelArea(destinoRef.current))
    }
    // Reacciona al cambio de habitación, no a cada render.
  }, [focoId, tamano.ancho > 0])

  const girar = (grados) => animarA(acotar({ ...destinoRef.current, azimut: destinoRef.current.azimut + grados }))
  const vistaGeneral = () => {
    if (foco) onSalirFoco?.()
    animarA(generalCanonica())
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
    /* Para pausar la deriva cuando el plano sale de la pantalla. */
    alVerse: verse,
    lienzo: { tabIndex: -1, onKeyDown: alTeclear },
    superficie: { onClick: (e) => onPulsar?.(e) },
    controles: { ...estables, hayFoco: Boolean(foco), nombreFoco: foco?.codigo || foco?.nombre || '' },
  }
}

/* Botonera del plano, abajo a la derecha. Las flechas circulares de girar son
   caracteres de texto (↺ ↻) porque el kit aún no tiene esos iconos: cuando
   el kit publique `sh-girar-…`, se reemplazan por `<Icon>`. */
export const ControlesCamara = memo(function ControlesCamara({ girar, vistaGeneral, hayFoco, nombreFoco }) {
  return (
    <div className="escena3d__controles" role="toolbar" aria-label="Vista del plano 3D">
      <div className="plano-flotante">
        <Button tone={hayFoco ? 'blue' : 'ghost'} size="sm" icon={hayFoco ? 'sh-close' : 'sh-home'} onClick={vistaGeneral} aria-label={hayFoco ? `Salir de ${nombreFoco} y ver toda el área (Esc)` : 'Vista general del área'}>
          Vista general
        </Button>
        <span className="plano-flotante__separador" aria-hidden="true" />
        <Tooltip title="Girar a la izquierda" body="Gira el plano 90° alrededor de lo que se está viendo." focusable={false}>
          <Button tone="ghost" size="sm" onClick={() => girar(-90)} aria-label="Girar a la izquierda"><span className="escena3d__giro" aria-hidden="true">↺</span></Button>
        </Tooltip>
        <Tooltip title="Girar a la derecha" body="Gira el plano 90° alrededor de lo que se está viendo." focusable={false}>
          <Button tone="ghost" size="sm" onClick={() => girar(90)} aria-label="Girar a la derecha"><span className="escena3d__giro" aria-hidden="true">↻</span></Button>
        </Tooltip>
      </div>
    </div>
  )
})
