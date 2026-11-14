# 0001 · Stack inicial

- **Estado:** Propuesta
- **Fecha:** 2026-10-25
- **Responsable:** `user:default/giancarlochavez`

## Contexto

Sistema web interno para ≈ 250 camas, 23 censos y decenas de usuarios. Equipo
de desarrollo pequeño. Debe correr en servidores del hospital (sin aval aún
para la nube), leer la BD de Aletheia y mantener el aspecto de los demás
sistemas del HRL. Necesita reglas fuertes de integridad (una cama, un
paciente) y cálculo de indicadores mensuales.

## Decisión

React 19 + Vite 8 en JavaScript con `@hrl/core-ui` en el frontend (igual que el sistema de Estadística); Python con FastAPI en la API y el
worker; PostgreSQL; todo en Docker, como monolito modular.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| FastAPI + PostgreSQL (elegida) | Ligera, tipado con Pydantic, buen ecosistema para Excel/PDF y ETL | Hay que armar admin y permisos |
| Django + PostgreSQL | Admin incluido para maestros | Más pesado para una SPA React; dos formas de hacer UI |
| Spring Boot (Java) | Figura en la ficha; robusto | Más código para el mismo alcance; ETL y reportes más lentos de escribir |
| Microservicios | Escalan por separado | Innecesario para el volumen; más operación |

## Consecuencias

- Una sola base y un solo despliegue; fácil de respaldar y operar por TI.
- Las reglas críticas (ocupación de camas, hospitalización abierta única,
  auditoría) se implementan también en PostgreSQL, no solo en la API.
- Java queda fuera salvo que la integración con Aletheia lo requiera.
