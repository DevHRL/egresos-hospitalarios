# Egresos Hospitalarios

Sistema de esgresos hospitalarios. Recopila información de todas las áreas que emiten censos. Conecta y replica las tablas de aletheia y hace segimiento del paciente desde sus ingreso

La documentación completa (situación, proceso, arquitectura, tecnologías y
decisiones) está en [`docs/`](docs/index.md) y se publica en el Portal de
Desarrollo HRL, en la pestaña **Docs** de este proyecto.

## Cómo correrlo

Necesita Docker, Python 3.12, Node 20 o superior y acceso de lectura al
repositorio del kit de diseño (`DevHRL/hrl-core-ui`).

**La primera vez.** Copia `.env.example` como `.env` y completa sus valores.
`CLAVE_INICIAL_CUENTAS` es la clave con la que entran todas las cuentas.

```bash
docker compose up -d --wait        # PostgreSQL 16 en el puerto 5544
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # en Linux: .venv/bin/pip
.venv/Scripts/alembic upgrade head
.venv/Scripts/python -m semillas.cargar_demostracion
cd ../frontend
npm install
```

**Cada vez.** En dos terminales:

```bash
cd backend  && .venv/Scripts/python -m uvicorn app.principal:app --port 8010
cd frontend && npm run dev         # http://localhost:5173
```

**Pruebas.**

```bash
cd backend  && .venv/Scripts/python -m pytest pruebas   # sobre PostgreSQL 16, en una base aparte
cd frontend && npm test
```

## Qué contiene

El flujo completo de hospitalización con pacientes ficticios, guardado en
PostgreSQL: orden de Admisión, confirmación de cama, censo inicial, traslados,
soporte de O2 y VM, egreso, censo diario, completado desde la HC, validación,
RENOXI, indicadores DIRESA, cierre de mes con ajustes, mantenimiento de camas y
editor del plano. Incluye **Medicina B (24 camas), Medicina Intermedios (5) y tres
UCI (16)**. El plano de UCI es provisional: usa las cifras del catálogo hasta tener
su mapeo físico.

Se entra con una cuenta por área:

| Usuario | Área |
|---|---|
| `admision` | Admisión |
| `medicina.b` | Enfermería de Medicina B |
| `medicina.int` | Enfermería de Intermedios |
| `uci.medicina`, `uci.cirugia`, `uci.pediatria` | Enfermería de cada UCI |
| `estadistica.tec` | Técnicos de Estadística |
| `estadistica.camas` | Responsable de camas y RENOXI |
| `estadistica.jefe` | Jefatura de Estadística |
| `mantenimiento` | Mantenimiento |
| `direccion` | Dirección, sin datos de pacientes |
| `ti` | Administración técnica |

Con `APP_ENV=desarrollo`, la barra superior adelanta el reloj y cierra los censos
pendientes, y el menú de la cuenta cambia de área o reinicia los datos. Con
`APP_ENV=produccion` esas opciones se apagan y la demostración no se puede cargar.

El modelo de datos y sus reglas están en
[`docs/tareas/base-de-datos-postgresql.md`](docs/tareas/base-de-datos-postgresql.md).

## Cómo documentar

- Escribe en los archivos de `docs/` con Markdown normal. Cada página del portal
  tiene un botón para editarla aquí en GitHub.
- Diagramas: guárdalos en draw.io como `.drawio.svg` dentro de `docs/proceso/`
  y enlázalos como imagen. Ver [`docs/proceso/index.md`](docs/proceso/index.md).
- Nada con datos de pacientes en este repo ni en la documentación.
- Para agregar una página nueva, créala en `docs/` y añádela a `nav` en `mkdocs.yml`.
