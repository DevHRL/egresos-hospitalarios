/* Cuadrícula única del plano. Todo lo que se dibuja (habitaciones, camas,
   medidas del estándar, separaciones) es múltiplo de PASO: así los bordes de
   las camas coinciden entre sí y con las paredes, y mover algo nunca lo deja
   «entre dos líneas». */

export const PASO = 0.25

/* Evita 0.30000000000000004: los múltiplos de 0.25 son exactos en binario,
   pero las sumas de valores ya redondeados conviene volver a fijarlas. */
const fijar = (v) => Math.round(v * 100) / 100

export const ajustar = (v) => fijar(Math.round(v / PASO) * PASO)
export const haciaArriba = (v) => fijar(Math.ceil(v / PASO - 1e-9) * PASO)
export const haciaAbajo = (v) => fijar(Math.floor(v / PASO + 1e-9) * PASO)

export const enCuadricula = (v) => Math.abs(v / PASO - Math.round(v / PASO)) < 1e-6
