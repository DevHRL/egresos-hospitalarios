import { useMemo, useRef } from 'react'
import { EmptyState } from '@hrl/core-ui'
import { rectCama } from '../../dominio/plano.js'
import { servicioPorId } from '../../datos/catalogo.js'
import { useTamano, textoCama, textoZona } from './comun.js'
import { CamaIsometrica } from './CamaIsometrica.jsx'
import { ControlesCamara, useCamara3d } from './Escena3D.jsx'
import { deAtrasAdelante, murosDelFondo } from './camara3d.js'

/* La misma planta en 3D. Solo consulta: se edita en la planta 2D, donde
   nada tapa a nada. La cámara gira, se inclina y se acerca (`Escena3D.jsx`).
   Al seleccionar una habitación, o una cama, la vista se acerca a esa
   habitación y atenúa el resto.

   Las paredes son bajas y solo se dibujan las del fondo de cada habitación
   según hacia dónde se mire (corte tipo maqueta), para que no tapen las
   camas. */

export function VistaIsometrica({ plano, piso, seleccion, onSeleccionar, tip, margenes }) {
  const ref = useRef(null)
  const tamano = useTamano(ref)
  const caja = useMemo(() => ({ x0: 0, y0: 0, x1: piso.ancho, y1: piso.alto }), [piso.ancho, piso.alto])

  const zonasPiso = plano.zonas.filter((z) => z.pisoId === piso.id)
  const zonaFoco = seleccion?.tipo === 'zona'
    ? zonasPiso.find((z) => z.id === seleccion.id)
    : seleccion?.tipo === 'cama'
      ? zonasPiso.find((z) => z.id === plano.camas.find((c) => c.id === seleccion.id)?.zonaId)
      : null
  const foco = zonaFoco?.tipo === 'habitacion' ? zonaFoco : null

  const pulsar = (el) => {
    const objetivo = el?.closest?.('[data-tipo]')
    onSeleccionar(objetivo ? { tipo: objetivo.dataset.tipo, id: objetivo.dataset.id } : null)
  }
  const escena = useCamara3d({ ref, tamano, caja, margenes, foco, onPulsar: pulsar, onSalirFoco: () => onSeleccionar(null) })
  const { vista } = escena
  const { punto, poligono } = vista

  const zonas = [...zonasPiso].sort(deAtrasAdelante(vista, (z) => [z.x + z.ancho / 2, z.y + z.alto / 2]))
  const atenuada = (z) => (foco && z.id !== foco.id ? ' es-atenuada' : '')

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

  const sel = (tipo, id) => (seleccion?.tipo === tipo && seleccion.id === id ? ' es-seleccion' : '')

  return (
    <div className={`plano-lienzo escena3d${escena.arrastrando ? ' escena3d--arrastrando' : ''}`} ref={ref} {...escena.lienzo} aria-label={`Vista 3D de ${piso.nombre}. Flechas para girar e inclinar, más y menos para acercar.`}>
      <svg
        className="plano-svg"
        width={tamano.ancho}
        height={tamano.alto}
        onPointerMove={(e) => (escena.mover(e) ? tip.hide() : alPasar(e))}
        onPointerLeave={tip.hide}
        {...escena.svg}
        role="img"
        aria-label={`Vista 3D de ${piso.nombre}`}
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
            .sort(deAtrasAdelante(vista, ({ r }) => [r.x + r.ancho / 2, r.y + r.alto / 2]))
          const [cx, cy] = punto(z.x + z.ancho / 2, z.y + z.alto / 2, 0)

          return (
            <g key={z.id} className={`escena3d__zona${atenuada(z)}`} style={servicio ? { '--color-servicio': `var(--serie-${servicio.color})` } : undefined}>
              <polygon
                data-tipo="zona"
                data-id={z.id}
                className={`plano-zona plano-zona--${z.tipo}${habitacion && !servicio ? ' plano-zona--sin-servicio' : ''}${sel('zona', z.id)}`}
                points={poligono([[z.x, z.y, 0], [x1, z.y, 0], [x1, y1, 0], [z.x, y1, 0]])}
              />
              {habitacion && murosDelFondo(z, vista).map((m) => (
                <polygon key={m.clave} className={`plano-muro${m.lateral ? ' plano-muro--lateral' : ''}`} pointerEvents="none" points={m.puntos} />
              ))}

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
                    <CamaIsometrica r={r} rotacion={cama.rotacion} vista={vista} fuera={fuera} />
                  </g>
                )
              })}

              {(habitacion || z.nombre) && vista.escala * Math.min(z.ancho, z.alto) > 40 && (
                <text className="plano-rotulo plano-rotulo--iso" x={cx} y={cy} textAnchor="middle" pointerEvents="none">
                  {habitacion ? z.codigo : z.nombre}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {zonas.length > 0 && <ControlesCamara controles={escena.controles} margenes={margenes} />}

      {zonas.length === 0 && (
        <div className="plano-vacio">
          <EmptyState icon="sh-home" title="Nada que mostrar todavía" body="Dibuja las habitaciones en la vista Planta y vuelve aquí para verlas en isométrico." />
        </div>
      )}
    </div>
  )
}
