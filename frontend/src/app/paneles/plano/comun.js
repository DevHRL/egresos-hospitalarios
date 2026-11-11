import { useLayoutEffect, useState } from 'react'

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

/* Tamaño en px de un contenedor; el plano 3D dibuja en px reales. */
export function useTamano(ref) {
  const [nodo, setNodo] = useState(null)
  useLayoutEffect(() => setNodo(ref.current), [ref])
  return useTamanoNodo(nodo)
}
