# Piloto Medicina

Medicina A (24 camas), Medicina B (24) y Medicina Intermedios (5): 53 camas.

## Alcance del piloto

**Entra:**

1. Habitaciones y camas de Medicina, con su plano.
2. Padrón de pacientes con alta manual (búsqueda por DNI o HC; si no existe,
   se crea).
3. Ingreso, traslado dentro de Medicina, traslado hacia o desde servicios no
   incorporados, egreso.
4. Censo diario (00:00 a 23:59), cierre, impresión y bloqueo a las 08:00 del
   día siguiente.
5. Hoja de movimientos imprimible para anotar a mano cuando no hay tiempo de
   digitar.
6. Camas fuera de servicio por mantenimiento (las 2 actuales de A y B), con
   orden básica.
7. Consolidado diario y mensual de Medicina: pacientes-día, ingresos,
   egresos, estancias, indicadores con 42 y con 53 camas.

**Queda fuera** (se suma después): migración de Aletheia, reporte RENOXI,
bandeja de completado de CIE-10, préstamos entre departamentos, inventario
con etiquetas, actualización en tiempo real, otros servicios.

Sin migración de Aletheia el piloto no depende de acceder a su base; durante
el piloto Medicina se sigue digitando en Aletheia como hoy.

Cuentas: una por servicio (Medicina A, Medicina B, Medicina Intermedios).

## Lo que hace falta para empezar

### Datos

| Qué | Quién lo provee | Bloquea |
|---|---|---|
| Plano de Medicina a partir del mapeo: habitaciones, camas al estándar y servicio de cada habitación. Viene precargado en `frontend/src/app/datos/planos/` (el editor se retiró el 2026-11-11, decisión 0007) | Equipo del proyecto | Maestro de habitaciones y camas |
| Lista de médicos de Medicina que dan altas | Jefatura de Medicina o Estadística | Formulario de egreso |
| Catálogo CIE-10 | MINSA (público) | Diagnóstico de ingreso opcional |
| Formato actual del censo de Medicina (en blanco, sin datos) | Enfermería de Medicina | Impresión del censo igual al papel |
| Pacientes presentes el día 0 con fecha de ingreso (de la HC) | Enfermería + Estadística, el día de arranque | Censo inicial |

### Decisiones

| Qué | Con quién |
|---|---|
| ¿El CIE-10 de egreso se sigue registrando? ¿Quién: el médico en la HC y Estadística lo digita, o enfermería al dar el alta? | Jefatura de Estadística |
| Fecha de arranque y duración del paralelo con el censo en papel | Estadística y Medicina |
| Criterio de éxito | Estadística |
| Contraparte en Medicina y en Estadística | — |

### Infraestructura

| Qué | Con quién |
|---|---|
| Servidor (o máquina virtual) en el hospital con Docker, o dónde alojar el piloto | TI |
| Que la PC de Medicina llegue al servidor por la red interna; navegador actualizado | TI |
| Respaldo diario de la base | TI |
| Impresora accesible desde la PC de Medicina (censo y hoja de movimientos) | Medicina / TI |

### Capacitación

- Una sesión corta por turno (los turnos rotan: cubrir al menos una semana).
- Guía de una página: ingresar, dar de alta, trasladar, cerrar el censo.

## Secuencia propuesta

| Semana | Trabajo |
|---|---|
| 1 | Validar en sala, con la jefa de enfermería, el plano precargado de Medicina en la vista 3D |
| 2-4 | Desarrollo: maestros, padrón, ingreso/egreso/traslado, censo, plano con estados |
| 5 | Pruebas con datos ficticios en la PC de Medicina; ajustes de pantallas con enfermería |
| 6 | Capacitación por turnos |
| 7 | Día 0: censo inicial. Paralelo con el papel |
| 7-10 | Comparación diaria papel vs sistema; corrección de errores |
| 11 | Decisión de apagar el papel en Medicina |

Las semanas son una estimación para una persona desarrollando; dependen de
la disponibilidad de TI para el servidor.

## Criterio de éxito propuesto

- El censo del sistema coincide con el de papel 10 días hábiles seguidos.
- 100 % de los ingresos registrados antes de las 08:00 del día siguiente.
- Enfermería tarda lo mismo o menos que con el censo en papel.
