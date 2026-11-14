# 0011: Integración con el sistema de Estadística

- **Estado:** Propuesta (la fase 0 ya está hecha; las demás esperan las decisiones del final)
- **Fecha:** 2026-11-14
- **Afecta a:** [0006](0006-credencial-por-area.md) (cuentas locales del sistema) y a
  la arquitectura de despliegue

## Contexto

Este sistema se prueba hoy en un solo equipo. Para pasar a pruebas con otras personas
tiene que vivir en un servidor, y el lugar natural es el repositorio y el despliegue del
Sistema de Reporte Estadístico (`DevHRL/Estadistica_hrl`), que ya está en el servidor
del hospital y que usa la Oficina de Estadística.

Los dos sistemas comparten el frontend: React 19, Vite 8, JavaScript, oxlint y el mismo
tag del kit (`@hrl/core-ui` v1.11.0-redesign.3). Se diferenciaban en el resto:

| | Egresos (antes) | Estadística | Ahora |
|---|---|---|---|
| Python | 3.12 | 3.13 | **3.13** |
| Contraseñas | scrypt | Argon2id | **Argon2id** (las scrypt pasan solas al entrar) |
| Sesión | Token propio con HMAC | JWT HS256 | **JWT HS256**, con `aud` propio |
| Ingreso | `POST /api/sesion` | `POST /api/auth/login`, `/auth/yo`, `/auth/cambiar-clave` | **Las mismas rutas y la misma respuesta** |
| Clave provisional | No existía | Cambio obligatorio al entrar | **Igual** |
| Intentos fallidos | Sin freno | Cinco en 15 minutos | **Igual** |
| Pruebas del frontend | `node --test` del dominio | `npm run humo` (SSR de Vite) | **`npm run humo`**, que corre también las del dominio |
| Migraciones | Alembic | Gestor SQL propio (`bd/migraciones`) | Sin cambio (ver fase 1) |
| Base | `public`, roles `egresos_*` | Esquemas `seguridad`, `organizacion`… | Sin cambio: **base aparte** |

## Decisión

Integrar en cuatro fases. Cada una deja un sistema que funciona y se puede probar; la
siguiente solo empieza cuando la anterior está en uso.

El destino final es **una sola aplicación con un solo ingreso**. Estadística entra y ve
su menú de siempre y, **debajo**, los módulos de hospitalización. Las cuentas de los
pisos (enfermería, Admisión, Mantenimiento, control de camas) entran al mismo sistema y
ven solo los suyos.

**La base sigue aparte en todas las fases.** Hospitalización guarda datos personales y
de salud de cada paciente, y Estadística guarda cifras mensuales. Juntarlas no aporta
nada que no dé una lectura entre las dos APIs, y mezclaría respaldos, permisos de la
base y migraciones de dos equipos.

### Fase 0: hablar el mismo idioma (hecha el 2026-11-14)

- Python 3.13 en el backend.
- Ingreso igual al de Estadística (`backend/app/seguridad.py`, `autenticacion.py`,
  `claves.py` y la migración `0004`). El token lleva `aud: egresos-hospitalarios`: un
  token de Estadística no abre este sistema ni al revés, aunque algún día se firmen con el
  mismo secreto, hasta que la fase 3 lo decida a propósito.
- La auditoría de `cuenta` ya no guarda el hash de la clave (antes lo copiaba en cada
  cambio de la fila); se limpió lo que había.
- `npm run humo` con la forma de la de Estadística: 8 secciones, 488 comprobaciones,
  cada pantalla renderizada con cada cuenta, con la demostración y con la base vacía.
- `paneles/indice.js`: el mapa de pantallas sale de `App.jsx`, para que la prueba (y
  luego el menú de Estadística) recorra las mismas que la aplicación.
- La tienda (`datos/tienda.js`) se puede renderizar fuera del navegador
  (`getServerSnapshot`), requisito para montarla dentro de otra aplicación.
- Lint sin avisos.

### Fase 1: sistema hermano, en el servidor (pruebas aisladas)

Lo mínimo para dejar de trabajar en local. Dos sistemas en el mismo repositorio y el
mismo servidor, cada uno con su ingreso.

1. **Repositorio.** Traer este proyecto con su historial a una carpeta propia de
   Estadistica_hrl, en una rama y por PR:
   `git subtree add --prefix=hospitalizacion <este-repo> main`. Lleva su `CLAUDE.md`
   (Claude Code lo carga por carpeta) y una línea en el `CLAUDE.md` raíz que diga que sus
   reglas (humo de las nueve áreas, `CREDENCIALES.txt`, los cuatro roles) no se aplican a
   esa carpeta. Este repositorio se archiva con un enlace al nuevo.
2. **Contenedores.** `backend/app/config.py` lee el host de la base del ambiente (hoy
   está fijo en `127.0.0.1`). Un Dockerfile para la API, que al arrancar corre
   `alembic upgrade head` y `cargar_maestros`, y otro para el frontend con su nginx,
   copiando los de Estadística.
3. **Compose.** Los dos servicios en `docker-compose.yml` con `profiles: [hospitalizacion]`:
   el despliegue de Estadística no cambia si nadie activa el perfil.
4. **Base.** Una base `egresos` en el mismo PostgreSQL del servidor, con
   `ALTER DATABASE egresos SET timezone = 'America/Lima'`, las extensiones `btree_gist` y
   `pg_trgm` (vienen en `postgresql-contrib`) y los roles `egresos_owner`, `egresos_app`,
   `egresos_lectura` y `egresos_respaldo`, creados por quien administra la base. Entra en
   la misma rutina de respaldo que la de Estadística.
5. **Entrada.** Otro puerto o un subdominio (`hospitalizacion.<servidor>`). Montarlo en
   una ruta (`/hospitalizacion/`) choca con el `/` y el `/api` de Estadística y no vale el
   trabajo, porque en la fase 2 el frontend se funde.
6. **Ambiente.** `APP_ENV=produccion` si se prueba con pacientes reales (con HTTPS y
   respaldo diario: Ley 29733). `desarrollo` solo con la demostración: permite entrar
   como cualquier cuenta sin clave.

### Fase 2: un solo frontend, con el menú de Estadística arriba

Los módulos de hospitalización pasan al frontend de Estadística. El ingreso todavía es
doble por dentro: la pantalla de hospitalización habla con su API con su propio token
(fase 3 lo resuelve).

**El menú.** Estadística ya tiene el mecanismo: `navegacion.js` agrega al final del menú
de Estadística y de Administración el grupo «Indicadores de desempeño» solo si el token
trae el permiso (`NAVEGACION_DESEMPENO`, filtrado en `navDe`). Hospitalización entra
igual, con `NAVEGACION_HOSPITALIZACION` y un permiso por entrada:

```
Estadística (menú de siempre)          Enfermería Medicina B
─────────────────────────────          ─────────────────────
CONTROL                                HOSPITALIZACIÓN
  Monitoreo Indicadores                  Gestión de camas
  Cumplimiento                           Movimientos del día
  Bandeja de reportes                    Censo diario
SALIDAS                                  Buscar paciente
  Remisión a DIRESA
  Boletín
CONSULTA
  Consolidados anuales
  …
HOSPITALIZACIÓN                ← nuevo, debajo
  Gestión de camas
  Censo diario
  Recepción de censos
  Validación de altas
  Buscar paciente
REPORTES DE HOSPITALIZACIÓN    ← nuevo
  Consolidado
  RENOXI
  Indicadores DIRESA
```

- Los grupos se renombran para no chocar: el grupo «Estadística» de este sistema no
  tiene sentido dentro de Estadística, y su regla prohíbe grupos de una sola entrada.
- Los `id` de pantalla llevan prefijo (`hosp-mapa`, `hosp-censo`…), porque la pantalla
  activa de Estadística vive en el hash de la URL (`#/hosp-mapa`) y comparte espacio de
  nombres con las suyas.
- Cada pantalla se carga con `lazy`, como todas las de Estadística: el plano 3D no pesa
  en el ingreso de quien no lo usa.

**El código.** `src/app/` de este sistema pasa a `frontend/src/app/hospitalizacion/`
(`dominio/`, `datos/`, `paneles/`), y `datos/tienda.js` pasa a
`servicios/hospitalizacion.js`, que es donde Estadística pone los clientes de lo que
está fuera del frontend. La API queda detrás del nginx de Estadística en
`/api/hospitalizacion/` (la API toma el prefijo de una variable), antes del `/api/` de
Estadística.

**Lo que hay que adaptar a su contrato** (su `CLAUDE.md`):

| Su regla | Hoy en hospitalización | Trabajo |
|---|---|---|
| Cada panel es un `Mosaic` | `div.panel` con `Stack` | Mecánico, pantalla por pantalla |
| La pantalla activa vive en el hash (`irA`) | Estado de React | Pasar a `irA`/`ruta.js` |
| Tooltip en todo KPI, botón e icono | Parcial | Revisar cada pantalla |
| El aviso de Dr. Mochi en la cabecera | No existe | Decidir qué estados de hospitalización apremian |
| Prueba de humo única | `npm run humo` propio, con la misma forma | Sus 8 secciones entran como secciones de la suya |

Las reglas propias de este sistema (animaciones de `docs/diseno/animaciones.md`, el plano
3D, `aplicar(plano, accion)`) viajan en el `CLAUDE.md` de la carpeta.

### Fase 3: un solo ingreso

1. **Cuentas en la base de Estadística.** Las unidades de los pisos (Medicina A,
   Medicina B, Intermedios, UCI, Quemados, Admisión) y la de Mantenimiento, que
   Estadística retiró con su seeder `0004` porque no reporta. Una cuenta de piso no
   reporta (`es_reportante = false`).
2. **Permisos.** `hospitalizacion.ver`, `.operar` (enfermería del área), `.admision`,
   `.validar` (Estadística), `.mantenimiento`, `.camas` y `.supervisar` (departamento),
   en `seguridad.permiso`. Viajan en el token, como los suyos, y deciden el menú.
3. **Un token para los dos.** El token de Estadística se emite con
   `aud: ["estadistica", "egresos-hospitalarios"]` y el mismo `JWT_SECRETO` en las dos
   APIs. La API de hospitalización deja de emitir tokens (`/api/auth/login` se apaga con
   una variable) y traduce los permisos del token a sus roles. La tabla `cuenta` sigue
   existiendo como espejo: los movimientos, censos y la bitácora la nombran, y se llena
   la primera vez que una cuenta entra.
4. **La cuenta `estadistica` de este sistema desaparece**: sus permisos los recibe la
   cuenta real de Estadística.

### Fase 4: las cifras de hospitalización llegan a Monitoreo

Hoy Estadística digita a mano «camas» y «egresos» en Monitoreo
(`PUT /monitoreo/{anio}/datos`). Al cerrar el mes, hospitalización ya tiene esas cifras
calculadas desde los movimientos (`indicador_mes_cerrado`). La API de hospitalización
expone el mes cerrado en solo lectura y Monitoreo lo muestra como su fuente, con su
regla de siempre: la cifra oficial no se pisa a mano y la del hospital se pone al lado.
La dotación también: el conteo físico (260 camas) frente a la relación oficial (249).

## Consecuencias

- La fase 1 no toca nada de Estadística salvo dos archivos (`docker-compose.yml`, con un
  perfil apagado, y una línea de su `CLAUDE.md`). Se puede retirar sin dejar rastro.
- Las fases 2 y 3 cambian el código de Estadística: su menú, su nginx, su base de
  cuentas y sus permisos. Las revisa y las acepta su equipo.
- Hasta la fase 3 hay dos cuentas `estadistica` con claves distintas, una en cada
  sistema.
- Mientras dure la fase 1, el ingreso de los dos sistemas se parece pero no se
  comparte: una mejora de seguridad en uno se copia al otro a mano.

## Pendiente de decidir

| Pregunta | Quién | Bloquea |
|---|---|---|
| ¿El equipo de Estadística acepta la carpeta y el perfil en su repositorio? | Equipo de Estadística | Fase 1 |
| ¿Quién crea la base y los roles en el PostgreSQL del servidor? ¿Qué versión tiene? | Quien administra el servidor | Fase 1 |
| ¿Las pruebas son con pacientes ficticios o reales? (HTTPS, respaldo y `produccion` desde el primer día) | Usuario | Fase 1 |
| ¿Puerto o subdominio para la fase 1? | Quien administra el servidor | Fase 1 |
| ¿Un quinto tipo de usuario para las cuentas de piso? Su contrato dice «cuatro roles del flujo, no se negocian sin decirlo», y una cuenta de piso no es ninguno de los cuatro | Equipo de Estadística | Fase 3 |
| ¿Mantenimiento vuelve como unidad, sin reportar? | Equipo de Estadística | Fase 3 |
| ¿Monitoreo lee las cifras de hospitalización de su API o se copian a `desempeno.dato_mes` al cerrar el mes? | Los dos equipos | Fase 4 |
