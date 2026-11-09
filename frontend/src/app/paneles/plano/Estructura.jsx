import { Badge, Icon } from '@hrl/core-ui'
import { conteoPorServicio } from '../../dominio/plano.js'
import { DEPARTAMENTOS } from '../../datos/catalogo.js'

/* Panel izquierdo: lo mapeado agrupado por departamento y servicio, contra
   las camas que se esperan. Es la comprobación de que el plano cuadra con el
   conteo físico (Medicina A 24, B 24, Intermedios 5). */

function comparacion(mapeadas, esperadas) {
  if (esperadas == null) return <Badge tone="none" label={`${mapeadas}`} />
  const tono = mapeadas === esperadas ? 'ok' : 'warn'
  return <Badge tone={tono} label={`${mapeadas} / ${esperadas}`} />
}

export function Estructura({ plano, seleccion, avisos, onIr }) {
  const conteo = conteoPorServicio(plano)
  const habitaciones = plano.zonas.filter((z) => z.tipo === 'habitacion')
  const camasPorZona = new Map()
  for (const c of plano.camas) camasPorZona.set(c.zonaId, (camasPorZona.get(c.zonaId) ?? 0) + 1)
  const pisos = new Map(plano.pisos.map((p) => [p.id, p]))
  const variosPisos = plano.pisos.length > 1

  const conMapeo = DEPARTAMENTOS.filter((d) => d.servicios.some((s) => conteo.has(s.id) || habitaciones.some((h) => h.servicioId === s.id)))
  const sinServicio = habitaciones.filter((h) => !h.servicioId)
  const errores = avisos.filter((a) => a.nivel === 'error').length

  const filaHabitacion = (h) => {
    const activa = seleccion?.tipo === 'zona' && seleccion.id === h.id
    const n = camasPorZona.get(h.id) ?? 0
    return (
      <li key={h.id}>
        {/* hrl-nativo: fila de árbol seleccionable; el kit no tiene árbol ni lista navegable. */}
        <button type="button" className={`plano-arbol__fila${activa ? ' es-activa' : ''}`} onClick={() => onIr({ tipo: 'zona', id: h.id })}>
          <span className="plano-arbol__codigo">{h.codigo || 'Sin código'}</span>
          {variosPisos && <span className="plano-arbol__piso">{pisos.get(h.pisoId)?.nombre}</span>}
          <span className="plano-arbol__cifra">{n} {n === 1 ? 'cama' : 'camas'}</span>
        </button>
      </li>
    )
  }

  return (
    <div className="plano-estructura">
      <section aria-label="Camas por servicio">
        {conMapeo.length === 0 && sinServicio.length === 0 && (
          <p className="plano-nota">Aún no hay habitaciones. A medida que dibujes y asignes servicios, aquí verás cuántas camas llevas contra las esperadas.</p>
        )}

        {conMapeo.map((d) => {
          const total = d.servicios.reduce((s, sv) => s + (conteo.get(sv.id)?.total ?? 0), 0)
          return (
            <div key={d.id} className="plano-arbol__departamento">
              <div className="plano-arbol__cabecera">
                <span className="plano-arbol__muestra" style={{ '--color-servicio': `var(--serie-${(DEPARTAMENTOS.indexOf(d) % 11) + 1})` }} aria-hidden="true" />
                <strong>{d.nombre}</strong>
                {comparacion(total, d.camas)}
              </div>
              {d.servicios.map((s) => {
                const propias = habitaciones.filter((h) => h.servicioId === s.id)
                const c = conteo.get(s.id)
                if (!propias.length && !c) return null
                return (
                  <div key={s.id} className="plano-arbol__servicio">
                    <div className="plano-arbol__subcabecera">
                      <span>{s.nombre}</span>
                      {comparacion(c?.total ?? 0, s.camas)}
                    </div>
                    {c?.fueraServicio > 0 && (
                      <p className="plano-arbol__detalle">
                        <Icon name="sh-wrench" size={14} /> {c.fueraServicio} fuera de servicio
                      </p>
                    )}
                    <ul className="plano-arbol__lista">{propias.map(filaHabitacion)}</ul>
                  </div>
                )
              })}
            </div>
          )
        })}

        {sinServicio.length > 0 && (
          <div className="plano-arbol__departamento">
            <div className="plano-arbol__cabecera">
              <Icon name="sh-warn" size={16} />
              <strong>Sin servicio</strong>
              <Badge tone="crit" label={String(sinServicio.length)} />
            </div>
            <ul className="plano-arbol__lista">{sinServicio.map(filaHabitacion)}</ul>
          </div>
        )}
      </section>

      <section aria-labelledby="titulo-avisos">
        <h2 id="titulo-avisos" className="plano-seccion">
          Revisión {avisos.length > 0 && <Badge tone={errores ? 'crit' : 'warn'} label={String(avisos.length)} />}
        </h2>
        {avisos.length === 0 ? (
          <p className="plano-nota plano-nota--ok">
            <Icon name="sh-ok" size={16} /> Sin observaciones.
          </p>
        ) : (
          <ul className="plano-arbol__lista">
            {avisos.slice(0, 50).map((a, i) => (
              <li key={i}>
                {/* hrl-nativo: aviso que lleva al elemento; misma fila que el árbol. */}
                <button type="button" className={`plano-aviso plano-aviso--${a.nivel}`} onClick={() => onIr(a.ref)}>
                  <Icon name={a.nivel === 'error' ? 'sh-crit' : 'sh-warn'} size={14} />
                  <span>{a.mensaje}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
