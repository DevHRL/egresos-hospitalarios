# Egresos Hospitalarios

Sistema de esgresos hospitalarios. Recopila información de todas las áreas que emiten censos. Conecta y replica las tablas de aletheia y hace segimiento del paciente desde sus ingreso

La documentación completa (situación, proceso, arquitectura, tecnologías y
decisiones) está en [`docs/`](docs/index.md) y se publica en el Portal de
Desarrollo HRL, en la pestaña **Docs** de este proyecto.

## Cómo correrlo

Necesita Docker, Python 3.13 (la misma versión que la API de Estadística), Node 20 o superior y acceso de lectura al
repositorio del kit de diseño (`DevHRL/hrl-core-ui`).

**La primera vez.** Copia `.env.example` como `.env` y completa sus valores.
`CLAVE_INICIAL_CUENTAS` es la clave con la que nacen todas las cuentas, y
`JWT_SECRETO` firma las sesiones (al menos 32 caracteres; la API no arranca sin él).

```bash
docker compose up -d --wait        # PostgreSQL 16 en el puerto 5544
cd backend
py -3.13 -m venv .venv               # o: uv venv --python 3.13 --seed .venv
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
cd frontend && npm run humo        # carga cada módulo, renderiza cada pantalla con cada cuenta y corre las reglas del dominio
cd frontend && npm run lint && npm run build && npx hrl-core-ui doctor
```

## Qué contiene

El flujo completo de hospitalización con pacientes ficticios, guardado en
PostgreSQL: orden de Admisión al área, designación de habitación y cama por el área,
traslados, soporte de O2, alta completa con CIE-10, censo diario, validación,
RENOXI, indicadores DIRESA, cierre de mes con ajustes y mantenimiento
de camas. El plano del piso 2 ya viene cargado: **Medicina A (24 camas),
Medicina B (24), Medicina Intermedios (5), UCI (7) y Quemados (7, dos de ellas
cunas)**, y todas
las cuentas lo ven en 3D. Cada cama es libre, ocupada (con el paciente dibujado
sobre ella), con falla reportada o en mantenimiento; el O2 o la VM van como marca.

Diez cuentas ([decisiones 0007](docs/decisiones/0007-orden-al-departamento-seis-cuentas.md), [0008](docs/decisiones/0008-uci-quemados-y-estados-de-cama.md), [0009](docs/decisiones/0009-medicina-a-en-el-piso-2.md) y [0010](docs/decisiones/0010-el-area-designa-y-registra-el-alta.md)):

| Usuario | Qué hace |
|---|---|
| `admision` | Envía al paciente a un área (Medicina A, B, Intermedios, UCI o Quemados) |
| `dep.medicina` | Supervisa las tres áreas de Medicina; no opera |
| `medicina.a` | Designa la cama de sus pacientes y los controla: O2, traslados, alta con CIE-10, mantenimiento, censo |
| `medicina.b` | Lo mismo en Medicina B |
| `medicina.int` | Lo mismo en Intermedios |
| `uci` | Lo mismo en UCI, con VM |
| `quemados` | Lo mismo en Quemados |
| `estadistica` | Valida las altas, consolidado, RENOXI, indicadores y cierre de mes |
| `control.camas` | Control diario de camas: plano, RENOXI y tablero de ocupación |
| `mantenimiento` | Retira, repara y entrega camas |

Todas nacen con la contraseña de `CLAVE_INICIAL_CUENTAS` en `.env`. El ingreso no
lista las cuentas: esta tabla es la lista.

El ingreso es el mismo que el de Estadística ([decisión 0011](docs/decisiones/0011-integracion-con-estadistica.md)):
contraseñas con Argon2id, sesión con JWT y freno de 15 minutos tras cinco
intentos fallidos. Cada cuenta cambia su contraseña desde su menú. Con
`APP_ENV=produccion`, la clave inicial es provisional y cada cuenta la cambia al
entrar. TI fija la de una cuenta así (la pide dos veces y no la muestra):

```bash
cd backend && .venv/Scripts/python -m semillas.asignar_clave medicina.b      # provisional
cd backend && .venv/Scripts/python -m semillas.asignar_clave medicina.b --definitiva
```

Con `APP_ENV=desarrollo`, el menú de la cuenta adelanta el reloj, cierra los
censos pendientes, entra como otra cuenta sin su clave o reinicia los datos. Con
`APP_ENV=produccion` esas opciones se apagan y la demostración no se puede cargar.

### Empezar sin datos ficticios

Para probar a mano con datos nuevos, este comando borra **todos** los datos
(pacientes, órdenes, censos, egresos, mantenimiento y bitácora) y deja solo el
plano, las cuentas y los catálogos. Sin `--confirmar` solo muestra qué haría:

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
