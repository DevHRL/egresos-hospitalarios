# Preguntas técnicas

Lo que falta responder para dimensionar el desarrollo. Cada pregunta trae por
qué importa y qué asume el diseño mientras no haya respuesta.

**Prioridad:** **P1** bloquea el piloto de Medicina · **P2** se necesita antes
de extender a otros servicios · **P3** puede esperar.

## Respondidas

| # | Pregunta | Respuesta (2026-10-27) | Efecto en el diseño |
|---|---|---|---|
| 1.1 | ¿El DNI es obligatorio? | No para recién nacidos | Documento obligatorio salvo RN; extranjeros y NN quedan en 1.1b |
| 2.1 | ¿Quién registra el ingreso? | La enfermera que hoy llena los censos | Enfermería registra ingreso, hora incluida; sin estado *En espera de cama* en el piloto |
| 2.2 | ¿Qué hora es la de ingreso? | La que registra esa enfermera | Hora editable en el formulario, por defecto la actual |
| 3.2 | ¿Dejan cama de reemplazo al llevarla a mantenimiento? | No: el espacio queda intacto hasta que la reparan | Puesto *fuera de servicio* sin borrarse del plano |
| 3.3 | ¿Las camas tienen código patrimonial? | Muchas no. Se verá con Patrimonio el 29/10/2026 | Código interno obligatorio con etiqueta QR; patrimonial opcional |
| 3.4 | ¿Cómo se registra la sobreocupación de Medicina? | No es real: la dotación estaba desactualizada. Medicina tiene 53 camas | No hacen falta puestos temporales |
| 3.5 | ¿Medicina A y B tienen camas propias? | Sí: A 24, B 24, Intermedios 5 | Tres servicios con camas propias |
| 4.1 | ¿Quién usa el sistema en Mantenimiento? | Una credencial para el área | Ver [0006](decisiones/0006-credencial-por-area.md) |
| 7.1 | ¿Medicina tiene PC? | Sí; ideal una PC dedicada, pero ya se puede trabajar | Diseño para PC, responsivo para tablets a futuro |
| 7.4 | ¿Usuario personal o compartido? | Una credencial por área | Bitácora por cuenta y equipo |
| 8.1 | ¿Para qué es el plano? | Para ver las camas en vez de confiar en una tabla; al pasar el cursor o seleccionar una cama muestra su estado y los datos del paciente | Plano de consulta con detalle al pasar el cursor y panel al seleccionar |
| 8.5 | ¿Habrá pantallas públicas? | No | Detalle con datos completos para cuentas autorizadas |
| 11.0 | ¿Una credencial para todo Medicina o una por servicio? | Una por servicio: A, B e Intermedios | Cada cuenta ve sus camas y cierra su censo |
| 3.1 | ¿En qué formato está el mapeo? | Digital; el equipo lo pasará al sistema con un editor propio | Editor de plano con plantillas de habitación y estándar de camas, sin imagen de fondo (ver [Módulos](modulos.md)) |
| 9.1 | ¿El censo va de medianoche a medianoche? | Sí: 00:00 a 23:59; se recoge a las 08:00 del día siguiente | Corte a las 24:00; registro hasta las 08:00 de D+1 |
| 7.6 | ¿Qué tan "tiempo real"? | No hace falta: consolidado diario; se puede registrar después con hora aproximada | Sin SSE en el piloto; "último registro" por servicio |
| — | ¿Cuándo se registra cada movimiento? | Cuando haya tiempo, con hora aproximada, en el sistema o en una hoja aparte | Hoja de movimientos imprimible; hora del evento separada de la hora de digitación |
| — | ¿Qué se registra en el egreso? | Médico que dio el alta, fecha, hora, o traslado; el resto sale del ingreso | Formulario de egreso corto |

Parcialmente respondidas: 3.6 y 6.2 (siguen abajo con lo que falta).

## 1. Identidad del paciente

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 1.1b | P2 | ¿Cómo se registra a extranjeros (CE, pasaporte) y a pacientes no identificados (NN)? | Sin documento no pueden ingresar si el DNI es obligatorio | Tipo de documento + número; NN con identificador temporal que se fusiona después |
| 1.2 | P1 | ¿Quién asigna el N° de HC? ¿Es único por paciente y nunca se reutiliza? ¿Hay pacientes con dos HC? | La HC es la clave del padrón y de la bandeja de completado | HC única, asignada por Admisión |
| 1.3 | P2 | ¿Hay acceso a RENIEC o al padrón del SIS para validar el DNI y traer nombres? | Evita errores de digitación en nombres | Digitación manual con validación del formato del DNI |
| 1.4 | P2 | ¿Cuántos pacientes duplicados hay en Aletheia (misma persona con distinta HC o nombre escrito diferente)? | Define el esfuerzo de deduplicar en la migración | Se detectan por DNI y por nombre + fecha de nacimiento; los dudosos los revisa Estadística |
| 1.5 | P2 | El recién nacido de Alojamiento Conjunto o UCIN, ¿es un paciente propio con su propio ingreso? ¿Desde cuándo? | Afecta conteo de Alojamiento Conjunto y neonatología | Paciente propio desde que ocupa cuna o cama; identificado por HC y datos de la madre |

## 2. Ingreso

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 2.3 | P1 | El día de arranque, ¿se buscará en la HC la fecha real de ingreso de cada paciente ya hospitalizado o se acepta una fecha aproximada? | Los pacientes previos distorsionan la estancia del primer mes | Fecha real si se encuentra; si no, *ingreso previo al sistema* excluido del promedio de permanencia |
| 2.4 | P2 | El paciente que pasa de observación de Emergencia a hospitalización, ¿cuenta su estancia desde Emergencia o desde que sube al piso? | Estancia y pacientes-día | Desde que sube al piso |
| 2.5 | P3 | ¿Se quiere medir reingresos (p. ej. dentro de 7 o 30 días)? | Indicador de calidad que solo es posible con ingresos registrados | Se calcula si se pide; los datos ya alcanzan |

## 3. Camas, habitaciones e inventario

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 3.6 | P1 | DIRESA y RENOXI usan 42 camas para Medicina y hay 53. ¿Desde cuándo se reportan las reales? ¿Hace falta una resolución? ¿Quién lo decide? | Cambia A, D, G, H e I y la ocupación reportada | Se calculan ambas; se reporta la oficial hasta que Estadística decida |
| 3.6b | P1 | ¿Cuántas camas reales tienen Psiquiatría, Quemados, Infectología y Oncología según el conteo? | Actualiza la base de 249 | Base 249 hasta cargar el conteo |
| 3.7 | P2 | Una cama fuera de servicio por mantenimiento, ¿se descuenta de los días-cama disponibles? | Mismo efecto en los indicadores | Se descuenta en la base de camas operativas, no en la oficial |
| 3.8 | P3 | ¿Se quiere medir limpieza o desinfección después del alta (estado *En limpieza*)? | Permite medir el tiempo de recambio de cama | No se incluye en el piloto |
| 3.9 | P2 | ¿Hay habitaciones de aislamiento o camas que se bloquean por aislamiento de un paciente vecino? | Estado *Bloqueada* y disponibles reales | Bloqueo manual con motivo |

## 4. Mantenimiento y Patrimonio

Para la reunión con Patrimonio del 29/10/2026:

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 4.2 | P1 | ¿Qué valida Mantenimiento exactamente: el retiro, la reparación, la baja, la devolución? | Define los estados de la orden | Las cuatro |
| 4.3 | P1 | ¿Patrimonio tiene un registro de camas por servicio (SIGA u otro)? ¿En qué formato se puede obtener? | Fuente inicial del inventario | Inventario propio con etiquetado |
| 4.3b | P1 | ¿Patrimonio puede asignar código a las camas que no lo tienen, o acepta el código interno del sistema? ¿Se puede pegar una etiqueta en la cama? | Identificador único de cada cama física | Código interno con etiqueta QR |
| 4.3c | P2 | ¿Cómo se da de baja una cama en Patrimonio? ¿Mantenimiento o Patrimonio decide la baja? | La baja en el sistema debe coincidir con la patrimonial | Mantenimiento la propone; Patrimonio la confirma fuera del sistema |
| 4.4 | P2 | ¿El alcance es solo camas o también colchones, cunas, incubadoras, monitores, ventiladores? | Los ventiladores alimentan el reporte RENOXI; amplía mucho el módulo | Solo camas y cunas en el piloto |
| 4.5 | P3 | ¿Mantenimiento necesita registrar repuestos, costos o técnico asignado? | Convierte el módulo en un sistema de mantenimiento completo | No; solo estados y tiempos |

## 5. Movimientos y egreso

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 5.1 | P1 | ¿El traslado lo confirma el servicio de destino o se registra en un solo paso? | Evita pacientes "en tránsito" sin cama | Origen registra, destino confirma |
| 5.2 | P1 | Cuando el paciente va a sala de operaciones o a un procedimiento, ¿su cama queda reservada? | La cama no debe aparecer libre | Sigue ocupada; no es movimiento |
| 5.3 | P1 | ¿Alta médica y salida física pueden ser en días distintos? ¿Cuál se registra como egreso? | Pacientes-día y estancia | Egreso = salida física; la hora del alta médica se guarda aparte |
| 5.4 | P2 | ¿Quién autoriza un préstamo de cama entre servicios? | Si requiere autorización hay que modelar una aprobación | Sin aprobación; se regulariza al cierre |
| 5.5 | P2 | Tipos de egreso oficiales que pide DIRESA o MINSA | Lista cerrada en el formulario | La de [Reglas](proceso/reglas.md) |

## 6. Aletheia

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 6.1 | P1 | ¿Qué motor de base de datos y versión usa? ¿Hay documentación del esquema o un responsable técnico? | Define cómo se migra | Lectura directa por conexión de solo lectura |
| 6.2 | P2 | Confirmar que ninguna área usa datos o reportes de Aletheia (no se conoce ninguna) | Apagado seguro | Se apaga al terminar el arranque |
| 6.3 | P2 | ¿Cuántos años de historia se migran? | Volumen y tiempo de migración | Los necesarios para comparar indicadores (p. ej. 2 años) |
| 6.4 | P2 | ¿Cuánto tiempo correrán en paralelo Aletheia y el sistema? | Réplica y doble digitación en ese periodo | Hasta que todos los servicios arranquen |

## 7. Infraestructura, red y tiempo real

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 7.2 | P1 | ¿Qué servidor provee TI: SO, CPU, RAM, disco? ¿Permite Docker? ¿Quién lo administra? | Despliegue | Linux con Docker, 4 vCPU, 8 GB RAM, 200 GB |
| 7.2b | P2 | ¿Se consigue una PC dedicada para Medicina? Si la PC es compartida, ¿quién más la usa? | Con PC compartida la cuenta de Medicina queda abierta para otros | Sesión con expiración por inactividad |
| 7.5 | P2 | ¿Cuántos usuarios simultáneos se esperan? ¿Habrá pantallas de monitoreo permanentes en Estadística o Dirección? | Dimensiona el tiempo real y el servidor | < 100 simultáneos |
| 7.7 | P2 | ¿Acceso solo desde la red del hospital o también desde fuera (VPN)? | Seguridad y exposición del servidor | Solo red interna |
| 7.8 | P2 | ¿Son frecuentes los cortes de luz o red? ¿El servidor tiene UPS y respaldo? | Contingencia en papel y respaldos | Contingencia con el censo en papel |

## 8. Vista isométrica

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 8.2 | P1 | ¿Hay planos arquitectónicos (CAD, PDF) o se dibuja desde el croquis del conteo? | Esfuerzo de armar cada plano | Desde el croquis, en una cuadrícula simple |
| 8.3 | P2 | ¿Un departamento ocupa más de un piso o ala? ¿Se quiere ver el hospital completo por pisos? | Navegación y estructura del plano | Un plano por servicio; vista por piso después |
| 8.4 | P2 | ¿Quién actualiza el plano cuando cambia la distribución? | Si nadie lo mantiene, el plano deja de servir | Jefatura de Estadística con el editor de plano |

## 9. Indicadores y reportes

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 9.0 | P1 | ¿El CIE-10 de egreso se sigue registrando? ¿Quién lo hace ahora que el egreso solo pide médico, fecha y hora? | Define si la bandeja de completado entra al piloto | Estadística desde la HC, después del piloto |
| 9.2 | P2 | ¿Qué indicadores se quieren además de los DIRESA (giro de cama, tiempo de cama vacía, % de altas antes del mediodía, mortalidad, estancia prolongada, reingresos)? | Cada uno requiere datos que hay que capturar desde el inicio | Solo DIRESA en el piloto; los datos para los demás se guardan |
| 9.3 | P2 | ¿Hay plantillas oficiales de DIRESA o MINSA que deban replicarse tal cual? | Formato del reporte | Se replica el formato actual de Estadística |
| 9.4 | P2 | ¿Qué campos exactos tiene el formulario de RENOXI? | Reporte RENOXI | Los del Excel actual |

## 10. Seguridad y normativa

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 10.1 | P2 | ¿El banco de datos debe inscribirse ante la Autoridad Nacional de Protección de Datos Personales (Ley 29733)? ¿Quién lo gestiona? | Requisito legal para datos de salud | Lo gestiona la Dirección con Asesoría Legal |
| 10.2 | P2 | ¿El censo en papel firmado es un documento legal que debe conservarse? ¿Basta con anotar el nombre de quien cierra el censo? | Con credencial por área, la firma es lo único que identifica a la persona | Se imprime el censo cerrado para firma |
| 10.3 | P3 | ¿Cuánto tiempo se conservan los datos y las bitácoras? | Retención y tamaño de la base | Indefinido para hospitalizaciones; 5 años para bitácoras |

## 11. Piloto y gestión del cambio

| # | P | Pregunta | Por qué importa | Supuesto actual |
|---|---|---|---|---|
| 11.1 | P1 | ¿Cuántas enfermeras y turnos tiene Medicina? ¿Quién es la contraparte (jefa de servicio)? | Capacitación | Capacitación por turno durante una semana |
| 11.2 | P1 | ¿Qué define que el piloto fue exitoso? | Saber cuándo pasar a los siguientes servicios | Censo coincide 10 días hábiles seguidos; egresos completos al 95 % a 48 h |
| 11.3 | P2 | ¿Quién en Estadística será dueño funcional del sistema (aprueba cambios, valida reportes)? | Decisiones durante el desarrollo | La jefatura de Estadística |
| 11.4 | P2 | ¿Hay fecha comprometida (fin de internado, presupuesto, informe a la Dirección)? | Alcance realista del piloto | Sin fecha |
