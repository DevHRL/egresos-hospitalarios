import { useCallback, useReducer } from 'react'
import { aplicar } from '../../dominio/plano.js'

/* Deshacer y rehacer sobre el plano.

   Un arrastre manda decenas de cambios por segundo: se aplican con
   `previsualizar` (sin tocar el historial) y al soltar `confirmar` guarda un
   solo paso, el del estado anterior al gesto. `cancelar` lo revierte (p. ej.
   una cama soltada fuera de toda habitación). */

const LIMITE = 200

function reductor(estado, evento) {
  switch (evento.tipo) {
    case 'ejecutar': {
      const base = estado.base ?? estado.presente
      return {
        pasado: [...estado.pasado, base].slice(-LIMITE),
        presente: aplicar(estado.presente, evento.accion),
        futuro: [],
        base: null,
        version: estado.version + 1,
      }
    }
    case 'previsualizar':
      return {
        ...estado,
        base: estado.base ?? estado.presente,
        presente: aplicar(estado.base ?? estado.presente, evento.accion),
      }
    case 'confirmar':
      if (!estado.base) return estado
      if (estado.base === estado.presente) return { ...estado, base: null }
      return { ...estado, pasado: [...estado.pasado, estado.base].slice(-LIMITE), futuro: [], base: null, version: estado.version + 1 }
    case 'cancelar':
      return estado.base ? { ...estado, presente: estado.base, base: null } : estado
    case 'deshacer':
      if (!estado.pasado.length) return estado
      return {
        pasado: estado.pasado.slice(0, -1),
        presente: estado.pasado.at(-1),
        futuro: [estado.presente, ...estado.futuro],
        base: null,
        version: estado.version + 1,
      }
    case 'rehacer':
      if (!estado.futuro.length) return estado
      return {
        pasado: [...estado.pasado, estado.presente],
        presente: estado.futuro[0],
        futuro: estado.futuro.slice(1),
        base: null,
        version: estado.version + 1,
      }
    case 'cargar':
      return { pasado: [], presente: evento.plano, futuro: [], base: null, version: estado.version + 1 }
    default:
      return estado
  }
}

/* `previsualizar` aplica la acción sobre el estado de antes del gesto, no
   sobre el último: así cada movimiento del ratón manda la posición absoluta
   y no se acumulan errores de redondeo. `version` cambia solo con cambios
   confirmados: es lo que dispara el autoguardado. */
export function useHistorial(inicial) {
  const [estado, despachar] = useReducer(reductor, null, () => ({ pasado: [], presente: inicial, futuro: [], base: null, version: 0 }))

  return {
    plano: estado.presente,
    version: estado.version,
    enGesto: estado.base !== null,
    puedeDeshacer: estado.pasado.length > 0,
    puedeRehacer: estado.futuro.length > 0,
    ejecutar: useCallback((accion) => despachar({ tipo: 'ejecutar', accion }), []),
    previsualizar: useCallback((accion) => despachar({ tipo: 'previsualizar', accion }), []),
    confirmar: useCallback(() => despachar({ tipo: 'confirmar' }), []),
    cancelar: useCallback(() => despachar({ tipo: 'cancelar' }), []),
    deshacer: useCallback(() => despachar({ tipo: 'deshacer' }), []),
    rehacer: useCallback(() => despachar({ tipo: 'rehacer' }), []),
    cargar: useCallback((plano) => despachar({ tipo: 'cargar', plano }), []),
  }
}
