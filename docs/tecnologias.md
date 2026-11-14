# Tecnologías

| Capa | Elección | Por qué |
|---|---|---|
| Interfaz | React 19 + Vite 8 en JavaScript, con `@hrl/core-ui` (fijado a `v1.11.0-redesign.3`, el mismo tag que Estadística) | Mismo stack y aspecto que el sistema de Estadística; el kit es JavaScript sin dependencias |
| Plano de camas | SVG dibujado con React, sin librerías de dibujo | Unas decenas de camas por piso no necesitan Konva ni three.js; mantiene el proyecto sin dependencias extra |
| Pruebas | `npm run humo`: carga cada módulo con el cargador SSR de Vite, renderiza cada pantalla con cada cuenta y corre las pruebas de `node --test` del dominio. pytest en la API | La misma forma que la prueba de humo de Estadística; sin dependencias nuevas |
| API y worker | Python 3.13, FastAPI, SQLAlchemy, Alembic | Validaciones y cálculo de reportes en el mismo lenguaje; openpyxl para el Excel de salida |
| Base de datos | PostgreSQL 16 | Constraints de exclusión para camas, vistas materializadas para indicadores, triggers de auditoría |
| Empaquetado | Docker / docker compose | Despliegue reproducible en servidores del hospital |
| Proxy | Nginx | HTTPS y archivos estáticos |
| Ingreso | Argon2id (argon2-cffi) y JWT HS256 (pyjwt) | Las mismas librerías y la misma forma que Estadística, para poder unificar el ingreso ([0011](decisiones/0011-integracion-con-estadistica.md)) |

`java` figura en la ficha del proyecto, pero esta propuesta no lo necesita. Se
mantiene solo si la integración con Aletheia lo exige (por ejemplo, si
Aletheia expone una librería o servicio en Java); se decide al revisar su BD.

## Por qué

Ver [0001 · Stack inicial](decisiones/0001-stack-inicial.md).
