# Módulos y pantallas

Interfaz web con el kit `hrl-core-ui`. Pensada para PC de escritorio en
Estadística y para PC o tablet en los servicios (pantallas táctiles con
botones grandes en los módulos de enfermería).

| # | Módulo | Usuarios principales | Fase |
|---|---|---|---|
| 1 | Maestros y configuración | Jefatura Estadística, TI | 0 |
| 2 | Padrón de pacientes | Todos (consulta) | 0 |
| 3 | Mapa de camas | Enfermería, responsable de camas | 1 |
| 4 | Movimientos | Enfermería, técnicos de Estadística | 1 |
| 5 | Censo diario | Enfermería, técnicos de Estadística | 1 |
| 6 | Bandeja de completado y control de HC | Técnicos de Estadística | 1 |
| 7 | Validación y calidad del dato | Jefatura y técnicos de Estadística | 1 |
| 8 | Reportes (RENOXI, consolidado, DIRESA) | Responsable de camas, Jefatura Estadística | 1 |
| 9 | Tablero de ocupación | Dirección, jefaturas | 2 |
| 10 | Migración de Aletheia | Sistema, TI | 0 |
| 11 | Seguridad y auditoría | TI, Jefatura Estadística | 0 |
| 12 | Inventario y mantenimiento de camas | Mantenimiento, enfermería | 1 |

## 1. Maestros y configuración

- **Departamentos y servicios**: jerarquía, si está en dotación, modalidad de
  captura (papel/digital), fila RENOXI y reporte DIRESA al que pertenece.
- **Habitaciones y puestos de cama**: ID del mapeo físico, servicio dueño,
  piso, tipo (adulto/pediátrica/neonatal, UCI), restricciones (sexo,
  aislamiento). Se cargan con el conteo presencial.
- **Editor de plano** (construido, en `frontend/`): se diseñan las habitaciones
  y se colocan las camas a escala sobre una cuadrícula de 25 cm. Una
  habitación se crea con una **plantilla** (un clic: 1, 2, 3, 4, 6 u 8 camas
  al tamaño estándar, con las camas ya colocadas, eligiendo la distribución
  en una galería con miniaturas: dos filas horizontales o verticales, o una
  fila contra cualquier pared) o **libre** (arrastrando). El plano ocupa todo
  el ancho; barras y paneles flotan encima y se pliegan, y la **pantalla
  completa** (F) tapa también el menú del sistema.
  Una cama se coloca con un clic y su cabecera se apoya en la pared más
  cercana. Todo queda sobre una cuadrícula exacta de 25 cm. Las camas se
  numeran por habitación o por servicio con varios formatos (101-C1, 101-A,
  101A, MA-1…), con vista previa. Desde el panel de la habitación se **distribuyen** n camas con el
  estándar y, si no caben, se ofrece agrandar la habitación al mínimo. Cada
  habitación se vincula a su servicio y, por él, al departamento. Compara lo
  mapeado contra las camas esperadas por servicio, señala errores (códigos
  repetidos, habitación sin servicio, camas superpuestas o más juntas que el
  estándar), tiene vista isométrica, deshacer, varios pisos y guarda en un
  archivo JSON (más un borrador automático en el navegador) y exporta las
  camas a CSV. Ver el estándar en [Camas, habitaciones y mantenimiento](proceso/camas-y-mantenimiento.md#estandar-de-camas).

*Vista:* tablas editables con formulario lateral; la dotación como tabla por
departamento con columnas por versión.

## 2. Padrón de pacientes

- Búsqueda por N° de HC, DNI o apellidos (réplica de Aletheia).
- Alta de paciente nuevo con los datos mínimos (HC, documento, nombres, sexo,
  fecha de nacimiento) cuando no está en el padrón.
- Ficha con sus hospitalizaciones y la **trayectoria** de cada una: línea de
  tiempo con ingreso, cada tramo (servicio, habitación, cama, desde/hasta),
  préstamos, soporte O2/VM y egreso.
- "¿Dónde está el paciente?": búsqueda por DNI o HC que devuelve la cama
  actual. Reemplaza la consulta a los censos en papel.

*Vista:* buscador único en la cabecera de todas las pantallas.

## 3. Mapa de camas

La pantalla principal de enfermería y de monitoreo. El plano existe para que
el estado de las camas se vea de un vistazo, en vez de depender de una tabla
consolidada.

- **Vista isométrica** del servicio: habitaciones dibujadas según el plano y
  cada puesto de cama en su lugar. Se navega departamento → servicio →
  habitación.
- **Al pasar el cursor** sobre una cama: estado, paciente (nombre, HC, DNI,
  edad), días de estancia y soporte O2/VM. **Al seleccionarla**: panel con el
  detalle completo y la trayectoria del paciente, y desde ahí las acciones.
  No hay pantallas de acceso público, así que el detalle muestra los datos
  completos del paciente a las cuentas autorizadas.
- **Vista de tarjetas** con la misma información, para impresión,
  accesibilidad y pantallas chicas: código, paciente, días de estancia,
  ícono O2/VM.
- Diseñado para la PC de la estación de enfermería; responsivo para usarlo
  más adelante en tablets o celulares.
- Colores por estado: **libre**, **ocupada**, **ocupada por otro servicio
  (préstamo)**, **bloqueada**, **fuera de servicio (mantenimiento)**. Además
  del color, un ícono y texto, para no depender solo del color.
- Se actualiza en tiempo real cuando otro usuario registra un movimiento.
- Al tocar una cama libre: *Ingresar paciente*. Al tocar una ocupada: *Trasladar*,
  *Cambiar soporte*, *Dar de alta*.
- Pacientes de este servicio en camas de otro servicio aparecen en una franja
  aparte ("Atendidos en camas prestadas").
- Resumen arriba: dotación, ocupadas, disponibles, con O2/VM, pendientes de
  recibir por traslado.
- La responsable de camas ve todos los servicios agrupados por departamento.

## 4. Movimientos

Formularios cortos, uno por tipo, que se abren desde el mapa de camas:

- **Ingreso**: paciente (buscador), fecha/hora (por defecto ahora), procedencia,
  diagnóstico de ingreso opcional.
- **Traslado**: servicio destino, cama destino (o "por asignar"); el destino
  ve el traslado como pendiente de recibir y lo confirma al asignar cama.
- **Préstamo**: se elige una cama de otro servicio; queda marcada.
- **Cambio de soporte**: ninguno / O2 / VM, con hora.
- **Alta**: fecha/hora, tipo de egreso, condición, CIE-10 y médico opcionales
  (si el médico ya lo dejó escrito, enfermería puede cargarlo).

Todos permiten **anular** con motivo (no se borra nada). Historial del día por
servicio.

## 5. Censo diario

- Lista del día por servicio con el mismo orden y columnas que el censo en
  papel nuevo, generada de los movimientos.
- **Modo transcripción** (servicios en papel): trae los pacientes del día
  anterior; el técnico marca solo los cambios.
- **Cuadre** al pie, calculado; el botón *Cerrar censo* se habilita cuando
  cuadra o cuando se escribe una observación.
- Impresión del censo cerrado para firma y archivo.
- Vista de estado: qué servicios cerraron el censo de hoy y cuáles faltan.

## 6. Bandeja de completado y control de HC

Ver [Completado desde la HC física](proceso/completado-hc.md).

- Cola de egresos pendientes con antigüedad, flujo de teclado, sugerencias.
- Recepción de HC por lote (escaneo o digitación del N° de HC).
- Reporte de HC no entregadas por servicio.

## 7. Validación y calidad del dato

Lista de inconsistencias detectadas por reglas, cada una con enlace al registro:

- Paciente con dos hospitalizaciones abiertas.
- Egreso anterior al ingreso; estancia mayor a un umbral (p. ej. 60 días).
- Cama con dos pacientes; servicio con disponibles negativos sin préstamo registrado.
- Traslado sin confirmar por el destino después de N horas.
- Censo sin cerrar; egreso pendiente de HC por más de N días.
- CIE-10 incompatible con sexo o edad.

Indicadores de calidad: % de egresos completos a 48 h, censos cerrados a
tiempo, HC no entregadas.

## 8. Reportes

- **RENOXI diario**: tabla en el mismo orden y agrupación que el formulario
  web, con totales; botón *Marcar como cargado* y contador de días del mes.
- **Consolidado mensual de egresos**: por servicio y departamento; egresos por
  tipo, estancias, CIE-10 más frecuentes.
- **Indicadores DIRESA**: los 3 reportes con variables A a I y la dotación
  vigente; los meses anteriores salen con la dotación que tenían.
- **Comparativos**: mes contra mes; durante la transición, sistema contra
  Excel/Aletheia para validar el arranque.
- Exportación a Excel y PDF.

## 9. Tablero de ocupación

- Tarjetas por departamento: ocupación actual, disponibles, préstamos.
- Tendencia de ocupación de los últimos 30 días y egresos por día.
- Solo lectura; sin datos personales de pacientes.

## 10. Migración de Aletheia

El sistema reemplaza a Aletheia.

- Migración inicial del padrón, CIE-10, médicos, servicios e histórico de
  egresos, con deduplicación de pacientes.
- Réplica nocturna solo mientras ambos sistemas corran en paralelo.
- Los reportes que hoy salen de Aletheia y use otra área se reproducen aquí
  antes de apagarlo (pendiente: identificar consumidores).
- Pantalla de estado: última sincronización, registros, errores, duplicados.

## 12. Inventario y mantenimiento de camas

Ver [Camas, habitaciones y mantenimiento](proceso/camas-y-mantenimiento.md).

- **Inventario de activos cama**: código interno, código patrimonial si
  existe, tipo, puesto donde está, estado (en uso, reportada, en
  mantenimiento, en almacén, de baja).
- **Etiquetado**: genera e imprime etiquetas con QR para las camas sin
  código; escanear la etiqueta abre la cama en el sistema.
- **Bandeja de órdenes** para mantenimiento: pendientes de retiro, en
  reparación, listas para entregar; con antigüedad.
- **Acciones**: confirmar retiro (con o sin reemplazo), registrar
  diagnóstico, marcar reparada o de baja, entregar a un puesto.
- **Novedades de camas** en el censo de enfermería: reportar falla, confirmar
  recepción.
- **Cuadre** censo vs órdenes, y reporte de días-cama perdidos por servicio.

## 11. Seguridad y auditoría

- **Una cuenta por área**: una credencial por servicio de enfermería, otra
  para Estadística, otra para Mantenimiento, etc. Quién la usa en cada turno
  lo organiza el área. Ver [0006](decisiones/0006-credencial-por-area.md).
- Cada cuenta tiene un rol y sus servicios asignados (enfermería solo ve y
  opera los suyos).
- Bitácora de cada creación, modificación, anulación y reapertura: qué
  cuenta, desde qué equipo, cuándo, valor anterior y nuevo.
- Consulta de bitácora por registro y por cuenta.

## Roles y permisos

| Permiso | Enfermería | Técnico Estadística | Resp. camas | Jefatura Estadística | Mantenimiento | Consulta | TI |
|---|---|---|---|---|---|---|---|
| Registrar movimientos | Sus servicios | Todos (transcripción) | — | Todos | — | — | — |
| Cerrar censo | Sus servicios | Todos | — | Todos | — | — | — |
| Reabrir censo | — | — | — | Sí | — | — | — |
| Completar egresos | Opcional | Sí | — | Sí | — | — | — |
| Validar / cerrar mes | — | Validar | — | Sí | — | — | — |
| Reporte RENOXI | Ver | Ver | Sí | Sí | — | Ver | — |
| Indicadores DIRESA | — | Ver | Ver | Sí | — | Ver | — |
| Reportar falla / recibir cama | Sus servicios | — | — | — | — | — | — |
| Órdenes e inventario de camas | Ver | — | Ver | Ver | Sí | Ver | — |
| Maestros, plano y dotación | — | — | — | Sí | — | — | Sí |
| Usuarios | — | — | — | — | — | — | Sí |
