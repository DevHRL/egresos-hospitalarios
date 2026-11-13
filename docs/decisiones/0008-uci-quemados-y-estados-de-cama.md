# 0008 · UCI y Quemados en el piso 2, y cuatro estados de cama

- **Estado:** Adoptada
- **Fecha:** 2026-11-12
- **Reemplaza en parte:** [0007](0007-orden-al-departamento-seis-cuentas.md) (UCI fuera
  del prototipo, las seis cuentas y la regla de quién designa la cama)

## Contexto

UCI y la Unidad de Quemados están en el mismo pasillo del piso 2 que Medicina B. Se
entregó su plano y el plano de cómo se une todo el piso: Medicina B al oeste, el ala
de UCI y Quemados al norte del hall de ascensores y Medicina A al este (se incorporará
después; ver [0009](0009-medicina-a-en-el-piso-2.md)). En la pediatría de Quemados el plano dibuja una cama, pero en realidad hay
**dos cunas**.

También se pidió simplificar la leyenda del plano.

## Decisión

**Plano del piso 2** (`frontend/src/app/datos/planos/medicina-b-piso2.json`). El ala
norte se dibujó girada 90° respecto del plano entregado (que la muestra acostada), a
46 px por metro aproximadamente y ajustada a la cuadrícula de 25 cm. Medicina B e
Intermedios se desplazaron 38 m hacia el sur, sin otro cambio, para dejarle lugar. Los
`id` de zonas y camas no cambian.

| Unidad | Habitación | Camas |
|---|---|---|
| UCI (`cuidados-criticos`) | U-H01 Aislado | U-01 |
| | U-H02 Cuidados intensivos | U-02 a U-07 |
| Quemados (`quemados`) | Q-H01 Ambiente infectados | Q-01, Q-02 |
| | Q-H02 Ambiente común | Q-03 a Q-05 |
| | Q-H03 Área de pediatría | Q-06, Q-07 (cunas) |

El catálogo dice 6 camas para Cuidados Críticos; el plano tiene 7 porque incluye el
aislado. Se deja así hasta confirmarlo con Estadística.

**Cuentas.** Se agregan `uci` y `quemados` (rol `enfermeria`). Admisión puede enviar
pacientes a esos departamentos. **Quién designa la cama:** la cuenta del departamento
en el suyo, y la enfermería de la unidad solo si su departamento no tiene esa cuenta.
Así Medicina sigue como en la 0007 (designa `dep.medicina`) y en UCI y Quemados
designa la propia unidad. La regla está en `datos/cuentas.js` (`designa`) y en el
servidor (`asegurar_designa`). Admisión, Estadística y Mantenimiento ven los cuatro
servicios.

**Traslados.** Medicina ↔ UCI o Quemados es un traslado normal que confirma la unidad
de destino. Solo un traslado a un departamento que no está en el sistema cierra la
estancia.

**Estados de cama.** El plano usa cuatro estados: **libre**, **ocupada**, **falla
reportada** y **en mantenimiento**. El O2 o la VM que recibe el paciente no son un
estado: van como una marca recuadrada (O2, VM) junto al código de la cama, sin color
ni entrada propia en la leyenda. La falla reportada se ve como estado, pero sigue sin
quitar la cama de servicio: si está libre se puede designar, y si está ocupada
conserva a su paciente. La pantalla ya no ofrece bloquear camas; una cama que ya
estaba bloqueada se puede desbloquear desde su ficha.

**Paciente en la cama.** Una cama ocupada muestra a la persona acostada: en 3D, la
cabeza en la almohada y el cuerpo bajo la frazada, que toma el color del estado; en la
planta 2D, la misma figura vista desde arriba. El rótulo de la cama va sobre los pies
para no tapar la cabeza.

**Hora de la demostración.** Se quita la fila de la hora sobre la pantalla. Avanzar el
reloj y cerrar censos pendientes pasan al menú de la cuenta (solo en desarrollo).

## Consecuencias

- Maestros: 71 zonas, 43 camas y 9 cuentas (ocho y `sistema`). Se incorporan
  `cuidados-criticos` y `quemados` (captura digital y fecha de arranque).
- La demostración suma dos pacientes en UCI (uno con VM) y uno en Quemados, y cierra
  también sus censos.
- El plano provisional de UCI queda solo con UCI Cirugía y UCI Pediatría.
- Pendiente: la fila RENOXI de Quemados (hoy vacía) y si sus camas cuentan como UCI
  en los indicadores DIRESA (hoy sí, como en el catálogo).
