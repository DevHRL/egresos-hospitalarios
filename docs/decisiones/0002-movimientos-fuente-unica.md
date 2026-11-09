# 0002 · Los movimientos son la fuente única

- **Estado:** Propuesta
- **Fecha:** 2026-10-25
- **Responsable:** `user:default/giancarlochavez`

## Contexto

Hoy hay dos fuentes de pacientes-día (consolidado de egresos y Excel de
camas) que en septiembre de 2026 difirieron en 317 (-5,7 %). Los traslados se
anotan como altas, los préstamos de cama no se registran y el Excel se cuadra
a mano.

## Decisión

El sistema registra **movimientos de pacientes sobre camas** (ingreso,
traslado, préstamo, cambio de soporte, egreso). Censo diario, egresos,
estancias, pacientes-día, reporte RENOXI e indicadores DIRESA se calculan de
esos movimientos. No existe ningún campo para escribir a mano un total.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Movimientos (elegida) | Una sola verdad; traslados y préstamos explícitos; trazabilidad | Exige registrar cada movimiento |
| Registrar solo egresos (como Aletheia) | Menos registros | Repite las brechas: sin ingresos, sin pacientes-día propios |
| Censo diario por conteos | Rápido de capturar | No da estancias ni egresos por paciente; sigue el cuadre manual |

## Consecuencias

- Traslado ≠ egreso; préstamo cuenta para el servicio que atiende.
- La fecha de ingreso deja de buscarse en la HC.
- Durante la transición, los servicios en papel deben usar el formato nuevo
  con columna de movimiento.
