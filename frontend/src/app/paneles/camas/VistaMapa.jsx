import { useMemo, useRef, useState } from 'react'
import { rectCama } from '../../dominio/plano.js'
import { ESTADOS_CAMA_MAPA } from '../../dominio/consultas.js'
import { useTamano } from '../plano/comun.js'
import { CamaIsometrica } from '../plano/CamaIsometrica.jsx'
import { ControlesCamara, useCamara3d } from '../plano/Escena3D.jsx'
import { ALTO_MURO, deAtrasAdelante, murosDelFondo, sobreElFondo } from '../plano/camara3d.js'

/* El plano en modo consulta: la misma planta del editor, con cada cama pintada
   según su estado. Se encuadra en las habitaciones de los servicios visibles.
   Además del color, cada cama lleva código e ícono. */

const MARGEN = 18

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

function IconoEstado({ x, y, nombre, lado = 12 }) {
  return (
    <svg x={x} y={y} width={lado} height={lado} className="mapa-icono" aria-hidden="true">
      <use href={`#${nombre}`} />
    </svg>
  )
}

const iconoDe = (info) => (info.falla ? 'sh-warn' : ESTADOS_CAMA_MAPA[info.estado].icono)

const Rayado = () => (
  <defs>
    <pattern id="rayado-iso" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" className="plano-rayado" />
    </pattern>
  </defs>
)

export function VistaMapa({ plano, estados, servicios, vista, seleccion, onSeleccionar, tip, texto }) {
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
  const comun = { zonas, camas, caja, porCama, claseCama, zonaDe, alPasar, tip, onSeleccionar }

  return vista === 'iso' ? <Isometrica {...comun} /> : <Planta {...comun} />
}

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

/* En 3D se gira, se inclina y se acerca. Al pulsar una habitación (o una de
   sus camas) la cámara se acerca a ella y el resto se atenúa. */
function Isometrica({ zonas, camas, caja, porCama, claseCama, zonaDe, alPasar, tip, onSeleccionar }) {
  const ref = useRef(null)
  const tamano = useTamano(ref)
  const [focoId, setFocoId] = useState(null)
  const foco = zonas.find((z) => z.id === focoId && z.tipo === 'habitacion') ?? null
  const margenes = useMemo(() => ({ arriba: MARGEN, abajo: MARGEN + 40, izquierda: MARGEN, derecha: MARGEN }), [])

  const pulsar = (el) => {
    const cama = el?.closest?.('[data-cama]')
    if (cama) {
      setFocoId(cama.dataset.zona)
      return onSeleccionar(cama.dataset.cama)
    }
    setFocoId(el?.closest?.('[data-zona]')?.dataset.zona ?? null)
  }
  const escena = useCamara3d({ ref, tamano, caja, margenes, foco, onPulsar: pulsar, onSalirFoco: () => setFocoId(null) })
  const { vista } = escena
  const { punto, poligono } = vista
  const atenuada = (zonaId) => (foco && zonaId !== foco.id ? ' es-atenuada' : '')
  const orden = [...zonas].sort(deAtrasAdelante(vista, (z) => [z.x + z.ancho / 2, z.y + z.alto / 2]))
  const centroCama = (c) => {
    const r = rectCama(c, zonaDe(c))
    return [r.x + r.ancho / 2, r.y + r.alto / 2]
  }

  return (
    <div
      className={`mapa-lienzo escena3d${escena.arrastrando ? ' escena3d--arrastrando' : ''}`}
      ref={ref}
      {...escena.lienzo}
      aria-label="Mapa de camas en 3D. Flechas para girar e inclinar, más y menos para acercar, Esc para ver todo."
    >
      <svg
        className="plano-svg"
        width={tamano.ancho}
        height={tamano.alto}
        role="img"
        aria-label="Mapa de camas"
        onPointerMove={(e) => (escena.mover(e) ? tip.hide() : alPasar(e))}
        onPointerLeave={tip.hide}
        {...escena.svg}
      >
        <Rayado />
        {tamano.ancho > 0 && (
          <>
            {orden.map((z) => {
              const x1 = z.x + z.ancho
              const y1 = z.y + z.alto
              const habitacion = z.tipo === 'habitacion'
              const propias = camas
                .filter((c) => c.zonaId === z.id)
                .map((c) => ({ c, r: rectCama(c, z) }))
                .sort(deAtrasAdelante(vista, ({ r }) => [r.x + r.ancho / 2, r.y + r.alto / 2]))
              return (
                <g key={z.id} className={`escena3d__zona${atenuada(z.id)}`} {...(habitacion ? { 'data-zona': z.id } : {})}>
                  <polygon
                    className={`plano-zona plano-zona--${z.tipo}${foco?.id === z.id ? ' es-seleccion' : ''}`}
                    points={poligono([[z.x, z.y, 0], [x1, z.y, 0], [x1, y1, 0], [z.x, y1, 0]])}
                    {...(habitacion ? { 'data-codigo': z.codigo } : {})}
                  />
                  {habitacion && murosDelFondo(z, vista).map((m) => (
                    <polygon key={m.clave} className={`plano-muro${m.lateral ? ' plano-muro--lateral' : ''}`} pointerEvents="none" points={m.puntos} />
                  ))}
                  {propias.map(({ c, r }) => (
                    <g key={c.id} data-cama={c.id} data-zona={z.id} className={claseCama(c.id, 'plano-cama3d')}>
                      <CamaIsometrica r={r} rotacion={c.rotacion} vista={vista} fuera={porCama.get(c.id).estado === 'fuera'} />
                    </g>
                  ))}
                </g>
              )
            })}
            {orden.filter((z) => z.tipo === 'habitacion').map((z) => {
              /* Sobre el muro del fondo, donde no choca con el rótulo de las camas. */
              const [px, py] = sobreElFondo(z, vista, ALTO_MURO + 0.25)
              return (
                <text key={z.id} className={`plano-rotulo plano-rotulo--iso escena3d__zona${atenuada(z.id)}`} x={px} y={py} textAnchor="middle" pointerEvents="none">
                  {z.codigo}
                </text>
              )
            })}
            {[...camas].sort(deAtrasAdelante(vista, centroCama)).map((c) => {
              const [cx, cy] = centroCama(c)
              const [px, py] = punto(cx, cy, 1.05)
              const info = porCama.get(c.id)
              return (
                <g key={c.id} data-cama={c.id} data-zona={c.zonaId} className={`mapa-etiqueta escena3d__zona${atenuada(c.zonaId)}`}>
                  <IconoEstado x={px - 24} y={py - 10} nombre={iconoDe(info)} lado={11} />
                  <text className="mapa-cama__codigo mapa-cama__codigo--iso" x={px + 7} y={py} textAnchor="middle">{c.codigo}</text>
                </g>
              )
            })}
          </>
        )}
      </svg>
      {tamano.ancho > 0 && <ControlesCamara controles={escena.controles} />}
    </div>
  )
}
