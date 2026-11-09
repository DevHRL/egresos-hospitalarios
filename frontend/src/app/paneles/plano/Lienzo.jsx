import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@hrl/core-ui'
import {
  LADO_MINIMO,
  accionHabitacionPlantilla,
  ajustar,
  crearCama,
  crearZona,
  etiquetaCama,
  habitacionEn,
  huella,
  posicionDentro,
  rectCama,
  rectPlantilla,
} from '../../dominio/plano.js'
import { camaContraPared, distribuir, tipoCama } from '../../dominio/estandar.js'
import { servicioPorId } from '../../datos/catalogo.js'
import { useTamano, textoCama, textoZona } from './comun.js'

/* Planta 2D editable.

   Todo se dibuja en coordenadas de pantalla (no con un `transform` de escala
   sobre el SVG): así los bordes miden siempre 1 px y los textos usan la
   escala tipográfica del sistema en vez de crecer con el zoom. La cámara es
   { x, y, escala }: dónde cae el metro 0 en pantalla y cuántos px mide un
   metro.

   Los eventos del puntero se escuchan en el SVG y el puntero se captura en
   el mismo SVG (`currentTarget`): si se captura en otro elemento, los
   movimientos y el soltar van a ese elemento y el gesto nunca termina. */

const ESCALA_MIN = 4
const ESCALA_MAX = 160
const MANIJAS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/* Movimiento mínimo para que un clic se considere arrastre. */
const UMBRAL_PX = 4

/* Hueco del lienzo que no tapan las barras ni los paneles flotantes. */
const areaLibre = (tamano, m) => ({
  x: m.izquierda,
  y: m.arriba,
  ancho: Math.max(120, tamano.ancho - m.izquierda - m.derecha),
  alto: Math.max(120, tamano.alto - m.arriba - m.abajo),
})

const SIN_MARGENES = { arriba: 24, abajo: 24, izquierda: 24, derecha: 24 }

export function camaraAjustada(piso, tamano, margenes = SIN_MARGENES) {
  const a = areaLibre(tamano, margenes)
  const escala = Math.min(a.ancho / piso.ancho, a.alto / piso.alto)
  const e = Math.min(Math.max(escala, ESCALA_MIN), ESCALA_MAX)
  return { escala: e, x: a.x + (a.ancho - piso.ancho * e) / 2, y: a.y + (a.alto - piso.alto * e) / 2 }
}

export function zoomEn(camara, factor, px, py) {
  const escala = Math.min(Math.max(camara.escala * factor, ESCALA_MIN), ESCALA_MAX)
  const f = escala / camara.escala
  return { escala, x: px - (px - camara.x) * f, y: py - (py - camara.y) * f }
}

/* Nuevo rectángulo al arrastrar una manija, con lados ajustados y un mínimo
   de un metro para que la habitación no se invierta al cruzar el borde. */
function redimensionar(orig, manija, dx, dy) {
  let { x, y } = orig
  let x2 = orig.x + orig.ancho
  let y2 = orig.y + orig.alto
  if (manija.includes('w')) x = Math.min(ajustar(orig.x + dx), x2 - LADO_MINIMO)
  if (manija.includes('e')) x2 = Math.max(ajustar(x2 + dx), x + LADO_MINIMO)
  if (manija.includes('n')) y = Math.min(ajustar(orig.y + dy), y2 - LADO_MINIMO)
  if (manija.includes('s')) y2 = Math.max(ajustar(y2 + dy), y + LADO_MINIMO)
  return { x, y, ancho: x2 - x, alto: y2 - y }
}

const rectDe = ({ desde, hasta }) => ({
  x: Math.min(desde.x, hasta.x),
  y: Math.min(desde.y, hasta.y),
  ancho: Math.abs(hasta.x - desde.x),
  alto: Math.abs(hasta.y - desde.y),
})

export function Lienzo({
  plano,
  piso,
  seleccion,
  onSeleccionar,
  herramienta,
  servicioNuevo,
  plantilla,
  variante,
  tipoCamaNueva,
  tipoZonaNueva,
  historial,
  camara,
  setCamara,
  orden,
  margenes,
  onCursor,
  onAviso,
  tip,
}) {
  const ref = useRef(null)
  const tamano = useTamano(ref)
  /* Datos del gesto en curso (no provocan render) y su tipo en estado (sí
     lo provoca: de él depende el cursor). */
  const gesto = useRef(null)
  const [arrastre, setArrastre] = useState(null)
  const [borrador, setBorrador] = useState(null)
  const [fantasma, setFantasma] = useState(null)
  const [espacio, setEspacio] = useState(false)

  const zonas = plano.zonas.filter((z) => z.pisoId === piso.id)
  const idsZonas = new Set(zonas.map((z) => z.id))
  const camas = plano.camas.filter((c) => idsZonas.has(c.zonaId))
  const zonaPorId = new Map(zonas.map((z) => [z.id, z]))

  const sx = (m) => camara.x + m * camara.escala
  const sy = (m) => camara.y + m * camara.escala
  const pantalla = (r) => ({ x: sx(r.x), y: sy(r.y), w: r.ancho * camara.escala, h: r.alto * camara.escala })

  const aMundo = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { x: (e.clientX - r.left - camara.x) / camara.escala, y: (e.clientY - r.top - camara.y) / camara.escala }
  }

  /* Al cambiar de herramienta se descarta la vista previa de la anterior. */
  useEffect(() => setFantasma(null), [herramienta, plantilla, variante, tipoCamaNueva])

  /* Órdenes de la barra (ajustar, acercar, enfocar una habitación). Llegan
     como objeto nuevo cada vez para que repetir la misma orden funcione. */
  useEffect(() => {
    if (!orden || !tamano.ancho) return
    const a = areaLibre(tamano, margenes ?? SIN_MARGENES)
    const centro = { x: a.x + a.ancho / 2, y: a.y + a.alto / 2 }
    if (orden.tipo === 'ajustar') setCamara(camaraAjustada(piso, tamano, margenes ?? SIN_MARGENES))
    if (orden.tipo === 'zoom') setCamara((c) => zoomEn(c, orden.factor, centro.x, centro.y))
    if (orden.tipo === 'enfocar') {
      const z = zonaPorId.get(orden.id)
      if (!z) return
      setCamara((c) => ({
        ...c,
        x: centro.x - (z.x + z.ancho / 2) * c.escala,
        y: centro.y - (z.y + z.alto / 2) * c.escala,
      }))
    }
    // Solo reacciona a una orden nueva o a que el lienzo tenga tamaño.
  }, [orden, tamano.ancho > 0])

  /* La rueda acerca hacia el cursor. Se registra a mano porque React
     registra `wheel` como pasivo y entonces no se puede evitar el scroll de
     la página. */
  useEffect(() => {
    const el = ref.current
    const rueda = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      setCamara((c) => zoomEn(c, factor, e.clientX - r.left, e.clientY - r.top))
    }
    el.addEventListener('wheel', rueda, { passive: false })
    return () => el.removeEventListener('wheel', rueda)
  }, [setCamara])

  /* Barra espaciadora mantenida: mano para desplazar, como en cualquier
     editor de dibujo. Al perder el foco la ventana se suelta, para que la
     mano no quede pegada si se cambió de ventana con la tecla abajo. */
  useEffect(() => {
    const escribiendo = (e) => e.target.closest?.('input, select, textarea')
    const abajo = (e) => {
      if (e.code === 'Space' && !escribiendo(e)) {
        e.preventDefault()
        setEspacio(true)
      }
    }
    const arriba = (e) => e.code === 'Space' && setEspacio(false)
    const soltar = () => setEspacio(false)
    window.addEventListener('keydown', abajo)
    window.addEventListener('keyup', arriba)
    window.addEventListener('blur', soltar)
    return () => {
      window.removeEventListener('keydown', abajo)
      window.removeEventListener('keyup', arriba)
      window.removeEventListener('blur', soltar)
    }
  }, [])

  const terminarGesto = () => {
    gesto.current = null
    setArrastre(null)
  }

  /* Vista previa de lo que se colocaría con un clic en el punto p. */
  const calcularFantasma = (p) => {
    if (herramienta === 'cama') {
      const hab = habitacionEn(plano, piso.id, p.x, p.y)
      const pos = hab && camaContraPared(hab, p.x - hab.x, p.y - hab.y, tipoCamaNueva)
      if (!pos) return { tipo: 'cama', valido: false, p }
      const { ancho, alto } = huella({ tipo: tipoCamaNueva, rotacion: pos.rotacion })
      return { tipo: 'cama', valido: true, rect: { x: hab.x + pos.x, y: hab.y + pos.y, ancho, alto }, rotacion: pos.rotacion }
    }
    if (herramienta === 'habitacion' && plantilla > 0) {
      const rect = rectPlantilla(plantilla, tipoCamaNueva, variante, p.x, p.y)
      const { posiciones = [] } = distribuir(rect, plantilla, tipoCamaNueva, variante)
      return { tipo: 'plantilla', valido: true, rect, posiciones }
    }
    return null
  }

  const alPresionar = (e) => {
    if (e.button !== 0 && e.button !== 1) return
    const p = aMundo(e)
    const objetivo = e.target.closest('[data-tipo]')
    const inicio = { cx: e.clientX, cy: e.clientY, p }
    tip.hide()

    const empezar = (g) => {
      gesto.current = { ...g, inicio, movio: false }
      setArrastre(g.tipo)
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    if (e.button === 1 || espacio) return empezar({ tipo: 'pan', camara })

    if (herramienta === 'cama') {
      /* Clic sobre una cama existente: se selecciona en vez de apilar otra. */
      if (objetivo?.dataset.tipo === 'cama') return onSeleccionar({ tipo: 'cama', id: objetivo.dataset.id })
      const hab = habitacionEn(plano, piso.id, p.x, p.y)
      if (!hab) return onAviso('Las camas se colocan dentro de una habitación. Dibuja primero la habitación.')
      const cama = crearCama(plano, hab, p.x, p.y, tipoCamaNueva)
      if (!cama) return onAviso(`La habitación ${hab.codigo} es más chica que una cama ${tipoCama(tipoCamaNueva).label.toLowerCase()}.`)
      historial.ejecutar({ tipo: 'cama/crear', cama })
      onSeleccionar({ tipo: 'cama', id: cama.id })
      return
    }

    if (herramienta === 'habitacion' && plantilla > 0) {
      const r = accionHabitacionPlantilla(plano, { pisoId: piso.id, cx: p.x, cy: p.y, n: plantilla, tipo: tipoCamaNueva, variante, servicioId: servicioNuevo || null })
      historial.ejecutar(r.accion)
      onSeleccionar({ tipo: 'zona', id: r.zonaId })
      return
    }

    if (herramienta === 'habitacion' || herramienta === 'zona') {
      const punto = { x: ajustar(p.x), y: ajustar(p.y) }
      setBorrador({ desde: punto, hasta: punto })
      return empezar({ tipo: 'crear', desde: punto })
    }

    const tipo = objetivo?.dataset.tipo
    const id = objetivo?.dataset.id
    if (tipo === 'manija') {
      const zona = zonaPorId.get(id)
      return empezar({ tipo: 'redimensionar', manija: objetivo.dataset.manija, zona, camasZona: camas.filter((c) => c.zonaId === id) })
    }
    if (tipo === 'cama') {
      onSeleccionar({ tipo: 'cama', id })
      const cama = camas.find((c) => c.id === id)
      return empezar({ tipo: 'mover-cama', cama, abs: rectCama(cama, zonaPorId.get(cama.zonaId)) })
    }
    if (tipo === 'zona') {
      onSeleccionar({ tipo: 'zona', id })
      return empezar({ tipo: 'mover-zona', zona: zonaPorId.get(id) })
    }
    empezar({ tipo: 'pan', camara, deseleccionar: true })
  }

  const alMover = (e) => {
    const p = aMundo(e)
    onCursor(p)
    const g = gesto.current

    if (!g) {
      setFantasma(calcularFantasma(p))
      describir(e)
      return
    }
    if (!g.movio && Math.hypot(e.clientX - g.inicio.cx, e.clientY - g.inicio.cy) < UMBRAL_PX) return
    g.movio = true
    const dx = p.x - g.inicio.p.x
    const dy = p.y - g.inicio.p.y

    switch (g.tipo) {
      case 'pan':
        setCamara({ ...g.camara, x: g.camara.x + e.clientX - g.inicio.cx, y: g.camara.y + e.clientY - g.inicio.cy })
        break
      case 'crear':
        setBorrador({ desde: g.desde, hasta: { x: ajustar(p.x), y: ajustar(p.y) } })
        break
      case 'mover-zona':
        historial.previsualizar({
          tipo: 'zona/actualizar',
          id: g.zona.id,
          cambios: { x: ajustar(g.zona.x + dx), y: ajustar(g.zona.y + dy) },
        })
        break
      case 'mover-cama': {
        /* Si el centro de la cama entra en otra habitación, pasa a ella; si
           no, se queda acotada a la suya. Así una cama nunca queda suelta. */
        const { ancho, alto } = huella(g.cama)
        const nx = g.abs.x + dx
        const ny = g.abs.y + dy
        const destino = habitacionEn(plano, piso.id, nx + ancho / 2, ny + alto / 2) ?? zonaPorId.get(g.cama.zonaId)
        historial.previsualizar({
          tipo: 'cama/actualizar',
          id: g.cama.id,
          cambios: { zonaId: destino.id, ...posicionDentro(destino, ancho, alto, nx, ny) },
        })
        break
      }
      case 'redimensionar': {
        const r = redimensionar(g.zona, g.manija, dx, dy)
        /* Las camas guardan posición relativa: si se mueve la pared de la
           izquierda o la de arriba, se compensan para que no se desplacen. */
        const ox = r.x - g.zona.x
        const oy = r.y - g.zona.y
        historial.previsualizar({
          tipo: 'lote',
          acciones: [
            { tipo: 'zona/actualizar', id: g.zona.id, cambios: r },
            ...g.camasZona.map((c) => ({ tipo: 'cama/actualizar', id: c.id, cambios: { x: c.x - ox, y: c.y - oy } })),
          ],
        })
        break
      }
    }
  }

  const alSoltar = (e) => {
    const g = gesto.current
    if (!g) return
    terminarGesto()
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)

    if (g.tipo === 'pan') {
      if (!g.movio && g.deseleccionar) onSeleccionar(null)
      return
    }
    if (g.tipo === 'crear') {
      const r = borrador && rectDe(borrador)
      setBorrador(null)
      if (!r || r.ancho < LADO_MINIMO || r.alto < LADO_MINIMO) {
        onAviso(
          herramienta === 'habitacion'
            ? 'Arrastra para dibujar la habitación (mínimo 1 × 1 m), o elige una plantilla y haz clic.'
            : 'Arrastra para dibujar la zona (mínimo 1 × 1 m).',
        )
        return
      }
      const habitacion = herramienta === 'habitacion'
      const zona = crearZona(plano, {
        pisoId: piso.id,
        tipo: habitacion ? 'habitacion' : tipoZonaNueva,
        servicioId: habitacion ? servicioNuevo || null : null,
        ...r,
      })
      historial.ejecutar({ tipo: 'zona/crear', zona })
      onSeleccionar({ tipo: 'zona', id: zona.id })
      return
    }
    historial.confirmar()
  }

  const cancelar = () => {
    if (!gesto.current) return
    terminarGesto()
    setBorrador(null)
    historial.cancelar()
  }

  const describir = (e) => {
    const objetivo = e.target.closest('[data-tipo]')
    if (herramienta !== 'seleccionar' || !objetivo) return tip.hide()
    if (objetivo.dataset.tipo === 'cama') {
      const cama = camas.find((c) => c.id === objetivo.dataset.id)
      const t = textoCama(cama, zonaPorId.get(cama.zonaId))
      tip.follow(e, t.titulo, t.cuerpo)
    } else if (objetivo.dataset.tipo === 'zona') {
      const zona = zonaPorId.get(objetivo.dataset.id)
      const t = textoZona(zona, camas.filter((c) => c.zonaId === zona.id))
      tip.follow(e, t.titulo, t.cuerpo)
    } else {
      tip.hide()
    }
  }

  /* El cursor sale de una clase en el contenedor; los elementos pueden
     cambiarlo encima (mover, redimensionar) solo con «Seleccionar». */
  const modo =
    arrastre === 'pan' ? 'arrastrando' :
    arrastre ? 'moviendo' :
    espacio ? 'mano' :
    herramienta === 'cama' && fantasma && !fantasma.valido ? 'prohibido' :
    herramienta === 'seleccionar' ? 'seleccionar' : 'dibujar'

  const seleccionada = (tipo, id) => seleccion?.tipo === tipo && seleccion.id === id
  const zonaSel = seleccion?.tipo === 'zona' ? zonaPorId.get(seleccion.id) : null
  const rPiso = pantalla({ x: 0, y: 0, ancho: piso.ancho, alto: piso.alto })

  return (
    <div className={`plano-lienzo plano-lienzo--${modo}`} ref={ref}>
      <svg
        className="plano-svg"
        width={tamano.ancho}
        height={tamano.alto}
        onPointerDown={alPresionar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={cancelar}
        onLostPointerCapture={() => gesto.current && cancelar()}
        onPointerLeave={() => {
          if (gesto.current) return
          tip.hide()
          setFantasma(null)
          onCursor(null)
        }}
        role="application"
        aria-label={`Planta de ${piso.nombre}`}
      >
        <defs>
          <pattern id="rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="plano-rayado" />
          </pattern>
        </defs>

        <rect className="plano-piso" x={rPiso.x} y={rPiso.y} width={rPiso.w} height={rPiso.h} />
        <Cuadricula piso={piso} camara={camara} sx={sx} sy={sy} />

        {zonas.map((z) => {
          const r = pantalla(z)
          const servicio = servicioPorId(z.servicioId)
          return (
            <g key={z.id} style={servicio ? { '--color-servicio': `var(--serie-${servicio.color})` } : undefined}>
              <rect
                data-tipo="zona"
                data-id={z.id}
                className={`plano-zona plano-zona--${z.tipo}${z.tipo === 'habitacion' && !servicio ? ' plano-zona--sin-servicio' : ''}${seleccionada('zona', z.id) ? ' es-seleccion' : ''}`}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
              />
            </g>
          )
        })}

        {camas.map((c) => {
          const zona = zonaPorId.get(c.zonaId)
          const servicio = servicioPorId(c.servicioId ?? zona.servicioId)
          return (
            <Cama
              key={c.id}
              r={pantalla(rectCama(c, zona))}
              rotacion={c.rotacion}
              codigo={etiquetaCama(c, zona)}
              color={servicio?.color}
              fuera={c.estado === 'fuera_servicio'}
              seleccionada={seleccionada('cama', c.id)}
              id={c.id}
            />
          )
        })}

        {/* Los rótulos van después de las camas para que ninguna los tape, y
            recortados a su habitación: nunca sobresalen del borde aunque el
            nombre sea largo o el zoom chico. */}
        {zonas.map((z) => {
          const r = pantalla(z)
          if (r.w <= 28 || r.h <= 20) return null
          const servicio = servicioPorId(z.servicioId)
          const habitacion = z.tipo === 'habitacion'
          return (
            <g key={z.id} clipPath={`url(#recorte-${z.id})`} pointerEvents="none">
              <clipPath id={`recorte-${z.id}`}>
                <rect x={r.x + 1} y={r.y + 1} width={Math.max(0, r.w - 2)} height={Math.max(0, r.h - 2)} />
              </clipPath>
              <text className="plano-rotulo plano-rotulo__codigo" x={r.x + 6} y={r.y + 16}>
                {habitacion ? z.codigo : z.nombre}
              </text>
              {habitacion && r.h > 48 && r.w > 70 && (
                <text className="plano-rotulo plano-rotulo__detalle" x={r.x + 6} y={r.y + 30}>
                  {servicio?.nombre ?? 'Sin servicio'}
                </text>
              )}
            </g>
          )
        })}

        {zonaSel && herramienta === 'seleccionar' && !arrastre && <Manijas r={pantalla(zonaSel)} id={zonaSel.id} />}

        {borrador && <Medida r={pantalla(rectDe(borrador))} metros={rectDe(borrador)} />}

        {fantasma?.valido && fantasma.tipo === 'cama' && !arrastre && (
          <Cama r={pantalla(fantasma.rect)} rotacion={fantasma.rotacion} fantasma />
        )}
        {fantasma?.tipo === 'plantilla' && !arrastre && (
          <>
            <Medida r={pantalla(fantasma.rect)} metros={fantasma.rect} texto={`${plantilla} ${plantilla === 1 ? 'cama' : 'camas'} · ${fantasma.rect.ancho} × ${fantasma.rect.alto} m`} />
            {fantasma.posiciones.map((pos, i) => {
              const { ancho, alto } = huella({ tipo: tipoCamaNueva, rotacion: pos.rotacion })
              return <Cama key={i} r={pantalla({ x: fantasma.rect.x + pos.x, y: fantasma.rect.y + pos.y, ancho, alto })} rotacion={pos.rotacion} fantasma />
            })}
          </>
        )}
      </svg>

      {zonas.length === 0 && !borrador && !fantasma && (
        <div className="plano-vacio">
          <EmptyState
            icon="sh-home"
            title="Este piso aún no tiene habitaciones"
            body="Elige «Habitación» (H). Con una plantilla («4 camas»…) haz clic donde va la habitación y se crea con sus camas al estándar; en «Libre», arrastra para dibujarla. Luego ajusta su código y servicio en el panel de la derecha."
          />
        </div>
      )}
    </div>
  )
}

/* Cama a escala: colchón, almohada en la cabecera y código. La almohada
   indica hacia qué pared mira la cabecera. */
function Cama({ r, rotacion, codigo, color, fuera, seleccionada, id, fantasma }) {
  const vertical = r.h >= r.w
  const almohada = vertical
    ? { x: r.x + r.w * 0.15, y: rotacion === 180 ? r.y + r.h * 0.84 : r.y + r.h * 0.04, w: r.w * 0.7, h: r.h * 0.12 }
    : { x: rotacion === 90 ? r.x + r.w * 0.84 : r.x + r.w * 0.04, y: r.y + r.h * 0.15, w: r.w * 0.12, h: r.h * 0.7 }
  return (
    <g style={color ? { '--color-servicio': `var(--serie-${color})` } : undefined} pointerEvents={fantasma ? 'none' : undefined}>
      <rect
        data-tipo={fantasma ? undefined : 'cama'}
        data-id={id}
        className={`plano-cama${fuera ? ' plano-cama--fuera' : ''}${seleccionada ? ' es-seleccion' : ''}${fantasma ? ' plano-cama--fantasma' : ''}`}
        x={r.x}
        y={r.y}
        width={r.w}
        height={r.h}
        rx={Math.min(r.w, r.h) * 0.12}
      />
      <rect className="plano-almohada" pointerEvents="none" x={almohada.x} y={almohada.y} width={almohada.w} height={almohada.h} rx={Math.min(almohada.w, almohada.h) * 0.3} />
      {fuera && <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="url(#rayado)" pointerEvents="none" />}
      {codigo && <CodigoCama r={r} codigo={codigo} />}
    </g>
  )
}

/* Ancho aproximado de un carácter de la fuente monoespaciada a --text-xs
   (11 px): basta para decidir si el código cabe, sin medir el DOM. */
const ANCHO_CARACTER = 6.8

/* Código dentro de la cama: horizontal si cabe; si no y la cama es vertical,
   girado a lo largo; si tampoco, no se escribe (está en el tooltip). */
function CodigoCama({ r, codigo }) {
  const largo = codigo.length * ANCHO_CARACTER
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  if (largo <= r.w - 4 && r.h >= 14) {
    return (
      <text className="plano-cama__codigo" x={cx} y={cy} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
        {codigo}
      </text>
    )
  }
  if (r.h > r.w && largo <= r.h - 8 && r.w >= 14) {
    return (
      <text className="plano-cama__codigo" x={cx} y={cy} textAnchor="middle" dominantBaseline="central" transform={`rotate(-90 ${cx} ${cy})`} pointerEvents="none">
        {codigo}
      </text>
    )
  }
  return null
}

/* Líneas cada metro y más marcadas cada cinco. Con poco zoom se omiten las
   de cada metro: a menos de 8 px entre líneas solo ensucian. */
function Cuadricula({ piso, camara, sx, sy }) {
  const lineas = []
  const paso = camara.escala < 8 ? 5 : 1
  for (let m = 0; m <= piso.ancho; m += paso) {
    lineas.push(<line key={`v${m}`} className={m % 5 === 0 ? 'plano-guia plano-guia--fuerte' : 'plano-guia'} x1={sx(m)} y1={sy(0)} x2={sx(m)} y2={sy(piso.alto)} />)
  }
  for (let m = 0; m <= piso.alto; m += paso) {
    lineas.push(<line key={`h${m}`} className={m % 5 === 0 ? 'plano-guia plano-guia--fuerte' : 'plano-guia'} x1={sx(0)} y1={sy(m)} x2={sx(piso.ancho)} y2={sy(m)} />)
  }
  return <g pointerEvents="none">{lineas}</g>
}

function Manijas({ r, id }) {
  const pos = {
    nw: [r.x, r.y], n: [r.x + r.w / 2, r.y], ne: [r.x + r.w, r.y], e: [r.x + r.w, r.y + r.h / 2],
    se: [r.x + r.w, r.y + r.h], s: [r.x + r.w / 2, r.y + r.h], sw: [r.x, r.y + r.h], w: [r.x, r.y + r.h / 2],
  }
  return (
    <g>
      {MANIJAS.map((m) => (
        <g key={m} data-tipo="manija" data-id={id} data-manija={m} className={`plano-manija plano-manija--${m}`}>
          {/* Área de agarre más grande que el cuadro visible. */}
          <rect x={pos[m][0] - 9} y={pos[m][1] - 9} width={18} height={18} fill="transparent" />
          <rect className="plano-manija__cuadro" x={pos[m][0] - 4.5} y={pos[m][1] - 4.5} width={9} height={9} />
        </g>
      ))}
    </g>
  )
}

/* Rectángulo en construcción (o vista previa de plantilla) con su medida. */
function Medida({ r, metros, texto }) {
  return (
    <g pointerEvents="none">
      <rect className="plano-borrador" x={r.x} y={r.y} width={r.w} height={r.h} />
      {r.w > 60 && (
        <text className="plano-medida" x={r.x + r.w / 2} y={r.y + r.h / 2 + 4} textAnchor="middle">
          {texto ?? `${metros.ancho.toFixed(2)} × ${metros.alto.toFixed(2)} m`}
        </text>
      )}
    </g>
  )
}
