import { distribuir, medidasHabitacion } from '../../dominio/estandar.js'
import { huella } from '../../dominio/plano.js'

/* Miniatura de una plantilla: la habitación y sus camas a escala, para
   elegir la distribución viéndola y no por su nombre. Decorativa: el nombre
   va en el control que la contiene. */

const LADO = 30

export function MiniPlantilla({ n, variante, tipo = 'adulto' }) {
  const sala = medidasHabitacion(n, tipo, variante)
  const { posiciones = [] } = distribuir(sala, n, tipo, variante)
  const escala = (LADO - 2) / Math.max(sala.ancho, sala.alto)
  const w = sala.ancho * escala
  const h = sala.alto * escala
  const ox = (LADO - w) / 2
  const oy = (LADO - h) / 2

  return (
    <svg className="plano-mini" width={LADO} height={LADO} viewBox={`0 0 ${LADO} ${LADO}`} aria-hidden="true">
      <rect className="plano-mini__sala" x={ox} y={oy} width={w} height={h} rx={1.5} />
      {posiciones.map((p, i) => {
        const { ancho, alto } = huella({ tipo, rotacion: p.rotacion })
        return <rect key={i} className="plano-mini__cama" x={ox + p.x * escala} y={oy + p.y * escala} width={ancho * escala} height={alto * escala} rx={0.8} />
      })}
    </svg>
  )
}
