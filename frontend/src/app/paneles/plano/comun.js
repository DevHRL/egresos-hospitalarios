import { useLayoutEffect, useState } from 'react'
import { ESTADOS_CAMA, TIPOS_CAMA, TIPOS_ZONA, servicioDeCama } from '../../dominio/plano.js'
import { servicioPorId } from '../../datos/catalogo.js'

/* Tamaño en px de un nodo. Recibe el nodo (no un ref) para volver a
   observar cuando el elemento cambia: al pasar a pantalla completa el
   escenario se monta en otro lugar y el nodo anterior deja de existir. */
export function useTamanoNodo(nodo) {
  const [tamano, setTamano] = useState({ ancho: 0, alto: 0 })
  useLayoutEffect(() => {
    if (!nodo) return
    const observador = new ResizeObserver(([entrada]) => {
      const { width, height } = entrada.contentRect
      setTamano({ ancho: Math.floor(width), alto: Math.floor(height) })
    })
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [nodo])
  return tamano
}

/* Tamaño en px de un contenedor; las dos vistas dibujan en px reales. */
export function useTamano(ref) {
  const [nodo, setNodo] = useState(null)
  useLayoutEffect(() => setNodo(ref.current), [ref])
  return useTamanoNodo(nodo)
}

/* Textos del tooltip. Hoy describen la cama; cuando exista el censo, aquí
   entra el paciente que la ocupa. */
export function textoCama(cama, zona) {
  const servicio = servicioPorId(servicioDeCama(cama, zona))
  const estado = ESTADOS_CAMA.find((e) => e.value === cama.estado)?.label
  return {
    titulo: `Cama ${cama.codigo}`,
    cuerpo: `${servicio?.nombre ?? 'Sin servicio'} · ${TIPOS_CAMA[cama.tipo]?.label ?? cama.tipo} · ${estado}`,
  }
}

export function textoZona(zona, camas) {
  if (zona.tipo !== 'habitacion') {
    return { titulo: zona.nombre || TIPOS_ZONA.find((t) => t.value === zona.tipo)?.label, cuerpo: `${zona.ancho} × ${zona.alto} m` }
  }
  const servicio = servicioPorId(zona.servicioId)
  const fuera = camas.filter((c) => c.estado === 'fuera_servicio').length
  return {
    titulo: `Habitación ${zona.codigo}`,
    cuerpo: `${servicio ? `${servicio.departamento.nombre} · ${servicio.nombre}` : 'Sin servicio asignado'} · ${camas.length} ${camas.length === 1 ? 'cama' : 'camas'}${fuera ? ` (${fuera} fuera de servicio)` : ''}`,
  }
}
