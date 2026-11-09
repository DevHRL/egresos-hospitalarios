# 0004 · Plano de camas: datos únicos, vista 2D e isométrica en SVG

- **Estado:** Adoptada (editor construido en `frontend/src/app/paneles/plano/`)
- **Fecha:** 2026-10-27 (revisada)
- **Responsable:** `user:default/giancarlochavez`

## Contexto

Se quiere ver las camas de cada habitación en un plano, porque es más fácil
de leer que una tabla consolidada. Al pasar el cursor o seleccionar una cama
se muestra su estado y los datos del paciente. No es de uso público. Las
habitaciones y camas ya se contaron en persona en Medicina (53 camas),
Psiquiatría, Quemados, Infectología y Oncología. Se usa en la PC de la
estación de enfermería y en Estadística; más adelante, posiblemente en tablets.

## Decisión

1. El plano se guarda **una sola vez como datos**: cada habitación es un
   rectángulo en una cuadrícula por piso (x, y, ancho, alto) y cada cama
   tiene posición y orientación dentro de su habitación.
2. Con esos datos el frontend dibuja dos vistas en **SVG**:
    - **Planta 2D** (vista desde arriba): la de trabajo diario y la del
      editor. Todas las camas a la vista, etiquetas legibles, fácil de
      seleccionar.
    - **Isométrica** (2.5D): la misma planta proyectada, con paredes bajas y
      camas con volumen. Para la vista general del departamento y para
      presentar.
3. Un interruptor cambia de vista sin perder la selección. La vista por
   defecto se decide probando ambas con enfermería.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Datos + 2D e isométrica en SVG (elegida) | Una sola fuente; 2D legible y fácil de editar; isométrica atractiva sin costo extra de datos | Dos dibujos que mantener en el frontend |
| Solo isométrica | Lo más vistoso | Camas que se tapan, etiquetas inclinadas, clic más difícil; editar sobre una vista isométrica es incómodo |
| 3D con three.js | Rotación y zoom libres | Pesado en PCs modestas; modelar cada sala; más difícil de hacer accesible; no aporta información extra |
| Imagen del plano con camas superpuestas | Rápido si hay planos | Hay que redibujar la imagen ante cada cambio |
| Solo cuadrícula de tarjetas | Lo más simple | No muestra la distribución física, que es lo que se busca |

## Consecuencias

- El mapeo debe incluir la posición aproximada de cada cama en su
  habitación y un croquis de la planta.
- El editor trabaja sobre la planta 2D (arrastrar habitaciones y camas sobre
  una cuadrícula).
- Si más adelante se quiere 3D real, los mismos datos sirven para generarlo.
