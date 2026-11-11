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
PostgreSQL: orden de Admisión al departamento, designación de habitación y cama,
traslados, soporte de O2, egreso, censo diario, completado desde la HC,
validación, RENOXI, indicadores DIRESA, cierre de mes con ajustes y mantenimiento
de camas. El plano ya viene cargado: **Medicina B (24 camas) y Medicina
Intermedios (5)**, y todas las cuentas lo ven en 3D (girar, acercar y enfocar
una habitación).

Seis cuentas ([decisión 0007](docs/decisiones/0007-orden-al-departamento-seis-cuentas.md)):

| Usuario | Qué hace |
|---|---|
| `admision` | Envía al paciente al departamento de Medicina |
| `dep.medicina` | Designa habitación y cama; después solo supervisa |
| `medicina.b` | Controla a sus pacientes y camas: O2, traslados, alta, mantenimiento, censo |
| `medicina.int` | Lo mismo en Intermedios |
| `estadistica` | HC, completado, validación, RENOXI, indicadores y cierre de mes |
| `mantenimiento` | Retira, repara y entrega camas |

Todas usan la contraseña de `CLAVE_INICIAL_CUENTAS` en `.env`.

Con `APP_ENV=desarrollo`, la barra superior adelanta el reloj y cierra los censos
pendientes, y el menú de la cuenta cambia de área o reinicia los datos. Con
`APP_ENV=produccion` esas opciones se apagan y la demostración no se puede cargar.

### Empezar sin datos ficticios

Para probar a mano con datos nuevos, este comando borra **todos** los datos
(pacientes, órdenes, censos, egresos, mantenimiento y bitácora) y deja solo el
plano, las seis cuentas y los catálogos. Sin `--confirmar` solo muestra qué haría:

```bash
cd backend && .venv/Scripts/python -m semillas.iniciar_sin_datos --confirmar --arranque AAAA-MM-DD
```

El día de arranque, cada piso registra con «Censo inicial» a los pacientes que ya
estaban hospitalizados. En desarrollo el reloj empieza en la hora real y se puede
adelantar desde la barra. Ojo: «Reiniciar demostración», en el menú de la cuenta,
vuelve a cargar los pacientes ficticios.

El modelo de datos y sus reglas están en
[`docs/tareas/base-de-datos-postgresql.md`](docs/tareas/base-de-datos-postgresql.md).

## Cómo documentar

- Escribe en los archivos de `docs/` con Markdown normal. Cada página del portal
  tiene un botón para editarla aquí en GitHub.
- Diagramas: guárdalos en draw.io como `.drawio.svg` dentro de `docs/proceso/`
  y enlázalos como imagen. Ver [`docs/proceso/index.md`](docs/proceso/index.md).
- Nada con datos de pacientes en este repo ni en la documentación.
- Para agregar una página nueva, créala en `docs/` y añádela a `nav` en `mkdocs.yml`.
