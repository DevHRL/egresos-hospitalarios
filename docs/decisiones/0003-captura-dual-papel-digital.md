# 0003 · Captura dual: papel transcrito o digital por servicio

- **Estado:** Propuesta
- **Fecha:** 2026-10-25
- **Responsable:** `user:default/giancarlochavez`

## Contexto

Solo algunos servicios tienen PC y red estables; puede haber resistencia de
enfermería y restricción de celular en turno. Las HC son físicas y el CIE-10 y
el médico del alta solo están en ellas.

## Decisión

Cada servicio tiene una **modalidad de captura**: *papel* (enfermería llena el
censo nuevo y Estadística lo transcribe en una pantalla espejo que solo pide
los cambios del día) o *digital* (enfermería registra en el mapa de camas).
Los datos que solo están en la HC los completa siempre Estadística en una
bandeja de completado, con control del expediente físico.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Captura dual (elegida) | Arranca sin equipos en sala; migración servicio por servicio | Dos formas de entrada que mantener |
| Todo digital desde el inicio | Un solo flujo | Bloqueado por equipos, red y adopción |
| App offline en celular | Sin depender de la red | Celular restringido en turno; sincronización compleja |
| OCR del censo en papel | Sin transcripción | Letra manuscrita; revisión cuesta más que transcribir solo los cambios |

## Consecuencias

- La fase 1 entrega valor solo con Estadística.
- Pasar un servicio a digital es un cambio de parámetro.
- El papel nuevo sirve también como contingencia si el sistema cae.
