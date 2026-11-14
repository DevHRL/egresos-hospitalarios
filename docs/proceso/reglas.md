# Reglas de negocio

Definiciones que el sistema aplica al calcular. Las marcadas *configurable*
dependen de un pendiente con Estadística y se guardan como parámetro, no en
el código.

## Jerarquía

**Departamento → servicio (censo) → habitación → puesto de cama.** Los
indicadores se calculan por servicio y se suman al departamento. Cada puesto
tiene un ID único del mapeo físico y pertenece a un servicio (su dueño). La
cama física (activo) se registra aparte para el mantenimiento; ver
[Camas, habitaciones y mantenimiento](camas-y-mantenimiento.md).

## Movimientos

| Regla | Definición |
|---|---|
| Hospitalización | Episodio que va del ingreso al egreso del hospital. Un paciente tiene a lo sumo una hospitalización abierta. |
| Ingreso obligatorio | Ningún paciente ocupa cama, aparece en un censo ni egresa sin una hospitalización abierta con su ingreso. Los ingresos anteriores al arranque se marcan *ingreso previo al sistema*. |
| Ingreso | Primer movimiento de la hospitalización. Abre la hospitalización y ocupa una cama. |
| Traslado | Cambio de servicio y/o cama dentro de la misma hospitalización. **No es egreso** (decisión 5). |
| Préstamo de cama | El paciente ocupa una cama cuyo servicio dueño no es el que lo atiende. Cuenta para el **servicio que atiende** (decisión 6). Se marca solo; no requiere aprobación previa: se regulariza al cierre del censo. |
| Egreso | Salida del hospital. Cierra la hospitalización y libera la cama. Se registra con poco: médico que dio el alta, fecha, hora y tipo de egreso (o traslado). Los datos del paciente salen del ingreso. |
| Traslado a un servicio fuera del sistema | Mientras el sistema no cubra todo el hospital (piloto), el traslado a un servicio no incorporado (p. ej. UCI) cierra la estancia en el sistema con tipo *traslado a servicio no incorporado*. **No cuenta como egreso hospitalario.** Lo mismo al revés: quien llega de un servicio no incorporado entra con procedencia *traslado desde X*. |
| Tipo de egreso | Alta médica, alta voluntaria, retiro sin alta (fuga), referido a otro establecimiento, fallecido < 48 h, fallecido ≥ 48 h. |
| Egreso de servicio | Traslado de salida visto desde el servicio. Se calcula aparte; si entra en los indicadores por servicio es *configurable* (pendiente 6). |

## Censo diario

- **Periodo del censo**: día calendario. El censo del 25 va de 00:00 a
  23:59 del 25; a las 23:59 se cierra y a las 00:00 del 26 empieza el
  siguiente. Estadística recoge el del 25 a las 08:00 del 26.
- **Hora de corte**: 24:00. Paciente presente al cierre = paciente-día.
- **Registro diferido**: no hace falta registrar en el momento en que el
  paciente entra o sale. La enfermera anota la hora aproximada (en el
  sistema o en una hoja de movimientos) y lo registra cuando tiene tiempo.
  Los movimientos de D se registran hasta las 08:00 de D+1, cuando Estadística
  recoge el censo; después, solo con reapertura de Estadística.
- **Hora de los movimientos**: la registra la enfermera que llena el censo;
  se acepta hora aproximada. El sistema ordena los movimientos por esa hora,
  no por el momento en que se digitaron, y guarda ambas.
- **Paciente-día**: paciente presente en el servicio a la hora de corte. Un
  paciente que ingresa y egresa entre dos cortes cuenta 1 paciente-día.
- **Cuadre**: `saldo anterior + ingresos + traslados entrantes − egresos − traslados salientes = pacientes al corte`.
  El sistema lo calcula; si no cuadra, el censo no se puede cerrar sin una
  observación justificada. **No hay ajuste manual de números.**
- **Ocupadas** = sin soporte + con O2 (o VM en UCI).
- **Disponibles** = camas operativas − ocupadas, donde camas operativas =
  puestos del mapeo − fuera de servicio − bloqueadas. Puede ser negativo; el
  reporte muestra cuántas de las ocupadas son préstamos para explicarlo.
- **Novedades de camas**: el censo incluye las camas enviadas a
  mantenimiento y las recibidas; deben cuadrar con las órdenes de
  mantenimiento.

## Estancia

- Estancia de un egreso = fecha de egreso − fecha de ingreso al hospital, en
  días. Mismo día = 1.
- Se imputa al servicio del que egresa (servicio que atiende al momento del
  alta). El desglose por tramo de servicio queda disponible para análisis.

## Dotación

- La dotación se guarda **versionada por fecha de vigencia** y con el
  documento que la respalda (RD 155-2023: 217; relación actualizada: 249).
- Un mes usa la dotación vigente el primer día del mes. Cambiar la dotación
  nunca reescribe meses cerrados.
- Base adoptada: 249 camas, que se reemplaza servicio por servicio por el
  conteo físico (ya hecho en Medicina, Psiquiatría, Quemados, Infectología y
  Oncología).
- **Medicina** tiene **53 camas reales**: Medicina A 24, Medicina B 24 y
  Medicina Intermedios 5. DIRESA y RENOXI siguen usando 42. La
  sobreocupación que mostraba el Excel venía de esa dotación desactualizada,
  no de pacientes sin cama.
- Se calculan dos bases por día: **dotación oficial** y **camas operativas**.
  Cuál usa DIRESA está pendiente; el sistema emite ambas.

## Indicadores DIRESA

Por servicio y sumados al departamento, del mes calendario:

| Var. | Definición | Fuente en el sistema |
|---|---|---|
| A | N° de camas | Dotación vigente |
| B | Pacientes-día del mes | Suma de censos diarios cerrados |
| C | Días de estancia de los egresados | Egresos del mes |
| D | Días-cama disponibles | A × días del mes |
| E | Egresos | Egresos del mes (hospitalarios) |
| F | Promedio de permanencia | C / E |
| G | % de ocupación | B × 100 / D |
| H | Rendimiento de cama | E / A |
| I | Intervalo de sustitución | (D − B) / E |

B sale **solo** de los censos del sistema. Es la única fuente de pacientes-día
para RENOXI y para DIRESA.

Reportes:

1. Hospitalización general: Medicina, Infectología, Obstetricia, Pediatría,
   Cirugía, Ginecología, Salud Mental, Oncología.
2. UCI: UCI Medicina, UCI Cirugía, UCI Pediatría, UCI Neonatología, Quemados.
3. UTIN.

## RENOXI

- Grupos: UCI (con/sin VM), Intermedios (con/sin O2), Hospitalización adultos
  (con/sin O2), Hospitalización pediátrica, Emergencia, Otros.
- El mapeo servicio → fila de RENOXI es una tabla de configuración. Nombre
  único por unidad: lo que el Excel llamaba "UCIN Adultos" es Medicina
  Intermedios.
- Lunes a sábado; el sistema avisa si el mes va camino de quedar por debajo
  de 20 días cargados.

## Periodos

- Un censo cerrado solo se reabre con permiso de Estadística y queda auditado.
- Un mes cerrado es de solo lectura. Una corrección posterior se registra como
  ajuste con motivo y queda visible en el reporte.
