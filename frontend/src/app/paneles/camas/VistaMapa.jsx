import { useRef } from 'react'
import { rectCama } from '../../dominio/plano.js'
import { ESTADOS_CAMA_MAPA } from '../../dominio/consultas.js'
import { useTamano } from '../plano/comun.js'
import { CamaIsometrica } from '../plano/CamaIsometrica.jsx'

/* El plano en modo consulta: la misma planta del editor, con cada cama pintada
   según su estado. Se encuadra en las habitaciones de los servicios visibles.
   Además del color, cada cama lleva código e ícono. */

const C = Math.cos(Math.PI / 6)
const S = Math.sin(Math.PI / 6)
const ALTO_MURO = 0.9
const MARGEN = 18
const proyectar = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z]

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

export function VistaMapa({ plano, estados, servicios, vista, seleccion, onSeleccionar, tip, texto }) {
  const ref = useRef(null)
  const tamano = useTamano(ref)
  const propias = plano.zonas.filter((z) => z.tipo === 'habitacion' && servicios.includes(z.servicioId))
  const caja = encuadre(propias, plano.zonas)
  const zonas = plano.zonas.filter((z) => entraEn(z, caja) && (z.tipo !== 'habitacion' || servicios.includes(z.servicioId)))
  const porCama = new Map(estados.map((x) => [x.cama.id, x]))
  const camas = plano.camas.filter((c) => porCama.has(c.id) && zonas.some((z) => z.id === c.zonaId))
  const zonaDe = (c) => plano.zonas.find((z) => z.id === c.zonaId)

  const alPasar = (e) => {
    const g = e.target.closest('[data-cama]')
    if (!g) return tip.hide()
    const t = texto(porCama.get(g.dataset.cama))
    tip.follow(e, t.titulo, t.cuerpo)
  }
  const alPulsar = (e) => {
    const g = e.target.closest('[data-cama]')
    if (g) onSeleccionar(g.dataset.cama)
  }
  const claseCama = (id, base) => {
    const info = porCama.get(id)
    return `${base} mapa-estado--${info.estado}${info.falla ? ' mapa-estado--falla' : ''}${seleccion === id ? ' es-seleccion' : ''}`
  }

  let contenido = null
  if (tamano.ancho > 0) {
    contenido = vista === 'iso'
      ? <Isometrica {...{ zonas, camas, caja, tamano, porCama, claseCama, zonaDe }} />
      : <Planta {...{ zonas, camas, caja, tamano, porCama, claseCama, zonaDe }} />
  }

  return (
    <div className="mapa-lienzo" ref={ref}>
      <svg className="plano-svg" width={tamano.ancho} height={tamano.alto} role="img" aria-label="Mapa de camas" onPointerMove={alPasar} onPointerLeave={tip.hide} onClick={alPulsar}>
        <defs>
          <pattern id="rayado-iso" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="plano-rayado" />
          </pattern>
        </defs>
        {contenido}
      </svg>
    </div>
  )
}

function Planta({ zonas, camas, caja, tamano, porCama, claseCama, zonaDe }) {
  const escala = Math.min((tamano.ancho - 2 * MARGEN) / (caja.x1 - caja.x0), (tamano.alto - 2 * MARGEN) / (caja.y1 - caja.y0))
  const ox = (tamano.ancho - (caja.x1 - caja.x0) * escala) / 2 - caja.x0 * escala
  const oy = (tamano.alto - (caja.y1 - caja.y0) * escala) / 2 - caja.y0 * escala
  const X = (v) => ox + v * escala
  const Y = (v) => oy + v * escala
  return (
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
  )
}

function Isometrica({ zonas, camas, caja, tamano, porCama, claseCama, zonaDe }) {
  const esquinas = [proyectar(caja.x0, caja.y0, ALTO_MURO), proyectar(caja.x1, caja.y0), proyectar(caja.x0, caja.y1), proyectar(caja.x1, caja.y1)]
  const [minX, maxX] = [Math.min(...esquinas.map((p) => p[0])), Math.max(...esquinas.map((p) => p[0]))]
  const [minY, maxY] = [Math.min(...esquinas.map((p) => p[1])), Math.max(...esquinas.map((p) => p[1]))]
  const escala = Math.min((tamano.ancho - 2 * MARGEN) / (maxX - minX), (tamano.alto - 2 * MARGEN) / (maxY - minY))
  const ox = (tamano.ancho - (maxX - minX) * escala) / 2 - minX * escala
  const oy = (tamano.alto - (maxY - minY) * escala) / 2 - minY * escala
  const punto = (x, y, z) => {
    const [px, py] = proyectar(x, y, z)
    return [ox + px * escala, oy + py * escala]
  }
  const poligono = (ps) => ps.map((p) => punto(...p).join(',')).join(' ')
  const orden = [...zonas].sort((a, b) => a.x + a.ancho / 2 + a.y + a.alto / 2 - (b.x + b.ancho / 2 + b.y + b.alto / 2))

  return (
    <>
      {orden.map((z) => {
        const x1 = z.x + z.ancho
        const y1 = z.y + z.alto
        const propias = camas.filter((c) => c.zonaId === z.id).map((c) => ({ c, r: rectCama(c, z) })).sort((a, b) => a.r.x + a.r.y - (b.r.x + b.r.y))
        return (
          <g key={z.id}>
            <polygon className={`plano-zona plano-zona--${z.tipo}`} points={poligono([[z.x, z.y, 0], [x1, z.y, 0], [x1, y1, 0], [z.x, y1, 0]])} />
            {z.tipo === 'habitacion' && (
              <>
                <polygon className="plano-muro" points={poligono([[z.x, z.y, 0], [x1, z.y, 0], [x1, z.y, ALTO_MURO], [z.x, z.y, ALTO_MURO]])} />
                <polygon className="plano-muro plano-muro--lateral" points={poligono([[z.x, z.y, 0], [z.x, y1, 0], [z.x, y1, ALTO_MURO], [z.x, z.y, ALTO_MURO]])} />
              </>
            )}
            {propias.map(({ c, r }) => (
              <g key={c.id} data-cama={c.id} className={claseCama(c.id, 'plano-cama3d')}>
                <CamaIsometrica r={r} rotacion={c.rotacion} poligono={poligono} fuera={porCama.get(c.id).estado === 'fuera'} />
              </g>
            ))}
          </g>
        )
      })}
      {orden.filter((z) => z.tipo === 'habitacion').map((z) => {
        /* Sobre la pared del fondo, donde no choca con el rótulo de las camas. */
        const [px, py] = punto(z.x + z.ancho / 2, z.y, ALTO_MURO + 0.25)
        return <text key={z.id} className="plano-rotulo plano-rotulo--iso" x={px} y={py} textAnchor="middle" pointerEvents="none">{z.codigo}</text>
      })}
      {camas.map((c) => {
        const r = rectCama(c, zonaDe(c))
        const [px, py] = punto(r.x + r.ancho / 2, r.y + r.alto / 2, 1.05)
        const info = porCama.get(c.id)
        return (
          <g key={c.id} data-cama={c.id} className="mapa-etiqueta">
            <IconoEstado x={px - 24} y={py - 10} nombre={iconoDe(info)} lado={11} />
            <text className="mapa-cama__codigo mapa-cama__codigo--iso" x={px + 7} y={py} textAnchor="middle">{c.codigo}</text>
          </g>
        )
      })}
    </>
  )
}
