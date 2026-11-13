# Plan de implementación

El orden evita depender de que todos los servicios tengan PC o cambien su
forma de trabajar desde el primer día. El piloto es **Medicina**: es el
departamento más grande (53 camas reales: A 24, B 24, Intermedios 5; DIRESA
y RENOXI todavía usan 42), su mapeo físico ya está hecho y su estación de
enfermería tiene PC.

| Fase | Qué se entrega | Quién lo usa | Qué reemplaza |
|---|---|---|---|
| **0. Base** | Maestros, habitaciones y puestos de cama de los 5 departamentos ya mapeados, plano isométrico de Medicina, dotación versionada, migración de Aletheia, usuarios y auditoría | Estadística, TI | — |
| **1. Piloto Medicina** | Censo inicial, ingresos obligatorios, mapa isométrico, movimientos, censo diario, novedades de camas y mantenimiento, bandeja de completado, reportes | Enfermería de Medicina, Estadística, Mantenimiento | Censo en papel de Medicina, digitación en Aletheia para Medicina |
| **2. Resto de mapeados** | Psiquiatría, Quemados, Infectología, Oncología | Enfermería de esos servicios | Sus censos en papel |
| **3. Hospital completo** | Mapeo físico y arranque de los 9 departamentos restantes; servicios sin equipos en modalidad papel con transcripción | Todos | Excel de camas, consolidado manual, Aletheia |
| **4. Mejoras** | Tablero para Dirección, indicadores adicionales, HC electrónica cuando exista | — | — |

Los servicios que todavía no arrancaron siguen el proceso actual; el sistema
no los reporta hasta que tengan su censo inicial. RENOXI y DIRESA se arman
combinando sistema y proceso actual hasta la fase 3.

### Arranque de un servicio

1. Cargar y validar con la jefa de enfermería las habitaciones y camas del mapeo.
2. Dibujar el plano y revisarlo en sala.
3. Capacitar a cada turno (se necesita al menos una semana para cubrir los turnos rotativos).
4. Día 0: censo inicial a la hora de corte, con ingreso de todos los presentes.
5. Paralelo: el censo en papel sigue y se compara a diario con el del sistema.
6. Se apaga el papel cuando ambos coinciden 10 días hábiles seguidos (criterio propuesto; se valida con Estadística).

### Validación del arranque

Durante el paralelo se comparan pacientes-día y egresos contra el
consolidado y el Excel. Las diferencias se explican una a una antes de apagar
el proceso anterior.

## Pendientes que condicionan el diseño

| # | Pendiente | Afecta a | Mientras tanto |
|---|---|---|---|
| 1 | Confirmar que ninguna área consume datos de Aletheia (no se conoce ninguna) | Apagado de Aletheia | Se reemplaza; se confirma antes de apagarlo |
| 2 | Origen de la diferencia de pacientes-día consolidado vs Excel | Validación del arranque | La regla del sistema es la de [Reglas](proceso/reglas.md) |
| 3 | Mapeo físico de los 9 departamentos restantes | Fase 3 | Base 249 |
| 4 | Composición de Emergencia Adultos | Fila RENOXI | Contingencia + Observación Medicina + Tópico |
| 5 | Flujo de préstamo de camas con supervisoras | Movimiento préstamo | Se ocupa de inmediato y se regulariza al cierre |
| 6 | Si el traslado de salida cuenta como egreso del servicio | Indicadores por servicio | Parámetro, por defecto no |
| 7 | Qué se cuenta en Alojamiento Conjunto y Atención Inmediata | Censo de esas unidades | Parámetro |
| 8 | Si Aletheia guarda servicio, cama y traslados | Carga histórica | Se carga solo lo disponible |
| 9 | Campos exactos de RENOXI | Reporte RENOXI | Los del Excel actual |
| 10 | Aval de la Dirección para nube | Despliegue | Servidor del hospital |
| 11 | Desde cuándo reportar a DIRESA y RENOXI las camas reales (Medicina 53 en vez de 42) | Indicadores | Se calculan ambas bases |
| 12 | Registro de camas de Patrimonio (reunión 29/10/2026) | Inventario de camas | Código interno y etiquetado propio |

El detalle del piloto está en [Piloto Medicina](piloto-medicina.md). Las preguntas técnicas abiertas están en [Preguntas técnicas](preguntas-tecnicas.md).
