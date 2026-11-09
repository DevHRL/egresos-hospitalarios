# Egresos Hospitalarios

Sistema de esgresos hospitalarios. Recopila información de todas las áreas que emiten censos. Conecta y replica las tablas de aletheia y hace segimiento del paciente desde sus ingreso

La documentación completa (situación, proceso, arquitectura, tecnologías y
decisiones) está en [`docs/`](docs/index.md) y se publica en el Portal de
Desarrollo HRL, en la pestaña **Docs** de este proyecto.

## Cómo correr el frontend

Necesita Node 20 o superior y acceso de lectura al repositorio del kit de
diseño (`DevHRL/hrl-core-ui`).

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm test           # reglas del plano y del flujo
```

## Qué contiene el prototipo

Replica el flujo completo de hospitalización en **Medicina B (24 camas) y Medicina
Intermedios (5)**, con pacientes ficticios: orden de Admisión, confirmación de cama,
traslados, soporte de O2, egreso, censo diario, completado desde la HC, validación,
RENOXI, indicadores DIRESA, mantenimiento de camas y editor del plano.

Se entra con una cuenta por área. La clave de todas es `demo`:

| Usuario | Área |
|---|---|
| `admision` | Admisión |
| `medicina.b` | Enfermería de Medicina B |
| `medicina.int` | Enfermería de Intermedios |
| `estadistica.tec` | Técnicos de Estadística |
| `estadistica.camas` | Responsable de camas y RENOXI |
| `estadistica.jefe` | Jefatura de Estadística |
| `mantenimiento` | Mantenimiento |
| `direccion` | Dirección, sin datos de pacientes |
| `ti` | Administración técnica |

El reloj de la demostración se adelanta desde la barra superior, y el menú de la
cuenta permite cambiar de área o reiniciar los datos.

Todavía no hay backend: el estado se guarda en el navegador de cada persona, así
que dos equipos no comparten datos. La base que lo reemplaza está especificada en
[`docs/tareas/base-de-datos-postgresql.md`](docs/tareas/base-de-datos-postgresql.md).

## Cómo documentar

- Escribe en los archivos de `docs/` con Markdown normal. Cada página del portal
  tiene un botón para editarla aquí en GitHub.
- Diagramas: guárdalos en draw.io como `.drawio.svg` dentro de `docs/proceso/`
  y enlázalos como imagen. Ver [`docs/proceso/index.md`](docs/proceso/index.md).
- Nada con datos de pacientes en este repo ni en la documentación.
- Para agregar una página nueva, créala en `docs/` y añádela a `nav` en `mkdocs.yml`.
