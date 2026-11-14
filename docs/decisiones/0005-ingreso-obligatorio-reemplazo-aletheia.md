# 0005 · Ingreso obligatorio y reemplazo de Aletheia

- **Estado:** Propuesta
- **Fecha:** 2026-10-27
- **Responsable:** `user:default/giancarlochavez`

## Contexto

En Aletheia solo se suben egresos. Ninguna área sabe qué pacientes están
hospitalizados salvo por los censos en papel, aunque los ingresos del día ya
figuran en ellos. Sin ingresos no hay seguimiento en tiempo real, trayectoria
del paciente ni pacientes-día confiables.

## Decisión

- El sistema **exige el ingreso**: sin hospitalización abierta no se ocupa
  cama, no se aparece en el censo y no se egresa.
- El sistema **reemplaza a Aletheia**: se migran sus datos (pacientes,
  CIE-10, médicos, histórico de egresos) y se apaga cuando todos los
  servicios hayan arrancado y se reproduzcan los reportes que otra área use.
- Cada servicio arranca con un **censo inicial** que registra el ingreso de
  todos los pacientes presentes.

Reemplaza la decisión condicionada 7 de la bóveda ("reemplazar Aletheia
conservando su seed, si ninguna otra área depende de él").

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Reemplazar con ingreso obligatorio (elegida) | Seguimiento real; una sola fuente; deja de digitarse dos veces | Requiere migración y censo inicial por servicio |
| Mantener Aletheia y escribir en él | No toca a otras áreas | Mantiene un sistema que solo guarda egresos; doble registro |
| Ingreso opcional | Menos resistencia al inicio | Censo e indicadores incompletos; vuelve el cuadre manual |

## Consecuencias

- Durante la transición conviven servicios en el sistema y servicios en el
  proceso actual; los reportes se combinan hasta el arranque completo.
- Hay que identificar a los consumidores de Aletheia antes de apagarlo.
- Los pacientes ingresados antes del arranque se marcan *ingreso previo al
  sistema* si no se encuentra su fecha real.
