import { useRef } from 'react'
import { EmptyState } from '@hrl/core-ui'
import { rectCama } from '../../dominio/plano.js'
import { servicioPorId } from '../../datos/catalogo.js'
import { useTamano, textoCama, textoZona } from './comun.js'
import { CamaIsometrica } from './CamaIsometrica.jsx'

/* La misma planta proyectada en isométrico (2.5D). Solo consulta: se edita
   en la planta 2D, donde nada tapa a nada.

   Proyección: el eje x baja a la derecha y el y baja a la izquierda, ambos a
   30°; z sube. Las paredes son bajas y solo se dibujan las del fondo de cada
   habitación (corte tipo maqueta), para que no tapen las camas. */

const C = Math.cos(Math.PI / 6)
const S = Math.sin(Math.PI / 6)
const ALTO_MURO = 0.9
const MARGEN = 40

const proyectar = (x, y, z = 0) => [(x - y) * C, (x + y) * S - z]

export function VistaIsometrica({ plano, piso, seleccion, onSeleccionar, tip, margenes }) {
  const ref = useRef(null)
  const tamano = useTamano(ref)

  const zonas = plano.zonas
    .filter((z) => z.pisoId === piso.id)
    /* Lo de atrás primero: con habitaciones que no se cruzan, ordenar por el
       centro basta para que lo de delante tape a lo de detrás. */
    .sort((a, b) => a.x + a.ancho / 2 + a.y + a.alto / 2 - (b.x + b.ancho / 2 + b.y + b.alto / 2))

  const esquinas = [proyectar(0, 0, ALTO_MURO), proyectar(piso.ancho, 0), proyectar(0, piso.alto), proyectar(piso.ancho, piso.alto)]
  const minX = Math.min(...esquinas.map((p) => p[0]))
  const maxX = Math.max(...esquinas.map((p) => p[0]))
  const minY = Math.min(...esquinas.map((p) => p[1]))
  const maxY = Math.max(...esquinas.map((p) => p[1]))
  /* Se encuadra en el hueco que dejan las barras y los paneles flotantes. */
  const m = margenes ?? { arriba: MARGEN, abajo: MARGEN, izquierda: MARGEN, derecha: MARGEN }
  const libreAncho = Math.max(120, tamano.ancho - m.izquierda - m.derecha)
  const libreAlto = Math.max(120, tamano.alto - m.arriba - m.abajo)
  const escala = Math.max(0.1, Math.min(libreAncho / (maxX - minX), libreAlto / (maxY - minY)))
  const ox = m.izquierda + (libreAncho - (maxX - minX) * escala) / 2 - minX * escala
  const oy = m.arriba + (libreAlto - (maxY - minY) * escala) / 2 - minY * escala

  const punto = (x, y, z) => {
    const [px, py] = proyectar(x, y, z)
    return [ox + px * escala, oy + py * escala]
  }
  const poligono = (puntos) => puntos.map((p) => punto(...p).join(',')).join(' ')

  const alPasar = (e) => {
    const objetivo = e.target.closest('[data-tipo]')
    if (objetivo?.dataset.tipo === 'cama') {
      const cama = plano.camas.find((c) => c.id === objetivo.dataset.id)
      const t = textoCama(cama, plano.zonas.find((z) => z.id === cama.zonaId))
      tip.follow(e, t.titulo, t.cuerpo)
    } else if (objetivo?.dataset.tipo === 'zona') {
      const zona = plano.zonas.find((z) => z.id === objetivo.dataset.id)
      const t = textoZona(zona, plano.camas.filter((c) => c.zonaId === zona.id))
      tip.follow(e, t.titulo, t.cuerpo)
    } else {
      tip.hide()
    }
  }

  const alPresionar = (e) => {
    const objetivo = e.target.closest('[data-tipo]')
    onSeleccionar(objetivo ? { tipo: objetivo.dataset.tipo, id: objetivo.dataset.id } : null)
  }

  const sel = (tipo, id) => (seleccion?.tipo === tipo && seleccion.id === id ? ' es-seleccion' : '')

  return (
    <div className="plano-lienzo" ref={ref}>
      <svg
        className="plano-svg"
        width={tamano.ancho}
        height={tamano.alto}
        onPointerMove={alPasar}
        onPointerLeave={tip.hide}
        onPointerDown={alPresionar}
        role="img"
        aria-label={`Vista isométrica de ${piso.nombre}`}
      >
        <defs>
          <pattern id="rayado-iso" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="plano-rayado" />
          </pattern>
        </defs>

        <polygon className="plano-piso" points={poligono([[0, 0, 0], [piso.ancho, 0, 0], [piso.ancho, piso.alto, 0], [0, piso.alto, 0]])} />

        {zonas.map((z) => {
          const servicio = servicioPorId(z.servicioId)
          const x1 = z.x + z.ancho
          const y1 = z.y + z.alto
          const habitacion = z.tipo === 'habitacion'
          const camas = plano.camas
            .filter((c) => c.zonaId === z.id)
            .map((c) => ({ cama: c, r: rectCama(c, z) }))
            .sort((a, b) => a.r.x + a.r.y - (b.r.x + b.r.y))
          const [cx, cy] = punto(z.x + z.ancho / 2, z.y + z.alto / 2, 0)

          return (
            <g key={z.id} style={servicio ? { '--color-servicio': `var(--serie-${servicio.color})` } : undefined}>
              <polygon
                data-tipo="zona"
                data-id={z.id}
                className={`plano-zona plano-zona--${z.tipo}${habitacion && !servicio ? ' plano-zona--sin-servicio' : ''}${sel('zona', z.id)}`}
                points={poligono([[z.x, z.y, 0], [x1, z.y, 0], [x1, y1, 0], [z.x, y1, 0]])}
              />
              {habitacion && (
                <>
                  <polygon className="plano-muro" pointerEvents="none" points={poligono([[z.x, z.y, 0], [x1, z.y, 0], [x1, z.y, ALTO_MURO], [z.x, z.y, ALTO_MURO]])} />
                  <polygon className="plano-muro plano-muro--lateral" pointerEvents="none" points={poligono([[z.x, z.y, 0], [z.x, y1, 0], [z.x, y1, ALTO_MURO], [z.x, z.y, ALTO_MURO]])} />
                </>
              )}

              {camas.map(({ cama, r }) => {
                const servicioCama = servicioPorId(cama.servicioId ?? z.servicioId)
                const fuera = cama.estado === 'fuera_servicio'
                return (
                  <g
                    key={cama.id}
                    data-tipo="cama"
                    data-id={cama.id}
                    className={`plano-cama3d${fuera ? ' plano-cama3d--fuera' : ''}${sel('cama', cama.id)}`}
                    style={servicioCama ? { '--color-servicio': `var(--serie-${servicioCama.color})` } : undefined}
                  >
                    <CamaIsometrica r={r} rotacion={cama.rotacion} poligono={poligono} fuera={fuera} />
                  </g>
                )
              })}

              {(habitacion || z.nombre) && escala * Math.min(z.ancho, z.alto) > 40 && (
                <text className="plano-rotulo plano-rotulo--iso" x={cx} y={cy} textAnchor="middle" pointerEvents="none">
                  {habitacion ? z.codigo : z.nombre}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {zonas.length === 0 && (
        <div className="plano-vacio">
          <EmptyState icon="sh-home" title="Nada que mostrar todavía" body="Dibuja las habitaciones en la vista Planta y vuelve aquí para verlas en isométrico." />
        </div>
      )}
    </div>
  )
}
