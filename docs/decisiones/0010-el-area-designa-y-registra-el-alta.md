# 0010: El área designa la cama y registra el alta completa

- **Estado:** Adoptada
- **Fecha:** 2026-11-13
- **Reemplaza en parte:** [0007](0007-orden-al-departamento-seis-cuentas.md) (la cuenta
  del departamento designaba la cama) y [0008](0008-uci-quemados-y-estados-de-cama.md)
  (solo UCI y Quemados designaban por sí mismas)

## Contexto

Al preparar la prueba del flujo completo sobre una base vacía se revisó quién hace
cada paso. Hasta ahora Admisión enviaba al paciente al **departamento**, la cuenta del
departamento designaba la cama y Estadística completaba el CIE-10 y el médico del alta
con la HC física en la mano, días después. Eso dejaba dos problemas:

- El departamento accionaba, cuando su papel es supervisar.
- El alta se completaba dos veces: el área la registraba incompleta y Estadística la
  terminaba. Mientras tanto no contaba en los indicadores.

También se pidió separar con claridad las dos formas de salida, para que un traslado no
se registre como alta (en el papel, los traslados se anotaban como altas).

## Decisión

**Orden al área.** Admisión elige el **área** (Medicina A, Medicina B, Intermedios, UCI,
Quemados), no el departamento. El médico que ordena y el diagnóstico de ingreso se
eligen de una lista; el diagnóstico es opcional.

**El área designa.** La enfermería del área a la que va la orden designa la habitación y
la cama, y desde ese momento controla al paciente. Vale igual para un traslado que
llega: el área de destino lo recibe y le designa la cama. La cuenta `dep.medicina` solo
monitorea: ve el plano, el censo y el tablero de su departamento, sin ninguna acción.

**Dos procesos de salida.** Toda salida es un **alta** o un **traslado**, y cada uno tiene
su propio botón y su propio formulario.

| Proceso | Tipos | Qué pasa |
|---|---|---|
| Alta | Alta médica, alta voluntaria, fuga, referido a otro establecimiento, fallecido | Sale del hospital. Es egreso. |
| Traslado | Otra área del sistema, otra cama de la misma área, otro departamento aún no incorporado | Sigue hospitalizado. No es egreso. |

El fallecimiento antes o después de 48 h no se elige: lo calcula el servidor con la hora
de ingreso.

**Alta completa desde el área.** Al registrar el alta, el área elige el CIE-10 principal,
un secundario opcional y el médico que dio el alta, todo de listas. Los datos del
paciente salen del ingreso. El egreso nace `completo` y cuenta en los indicadores desde
ese momento. Estadística ya no completa: revisa y valida, y validar sigue siendo
requisito para cerrar el mes. Se retiró la bandeja «Completado desde HC» y el control de
HC físicas.

**El mismo formulario en dos lugares.** El alta y el traslado se registran desde la ficha
de la cama o desde el censo diario, que ahora tiene dos secciones separadas: «Altas del
día» y «Traslados del día». En las dos se elige al paciente de una lista con solo los
hospitalizados en el área, sin escribir.

**Corregir un alta que era traslado.** Existe, pero no está a mano: solo en Movimientos
del día, como un enlace junto a Anular. Pide el destino y el motivo, anula el alta y
registra el traslado. No procede si la cama que dejó el paciente ya la ocupa otro, ni si
Estadística ya validó el alta.

**Cuenta `control.camas`.** Para quien lleva el control diario de camas y carga RENOXI a
mano (rol `camas`). Ve el plano, el tablero de ocupación y la pantalla RENOXI, que ahora
sigue el orden de grupos del Excel diario y se descarga en CSV (el día o el mes). Quemados
y UCI Cirugía van en el grupo «Otros», como en ese Excel.

## Consecuencias

- Migración `0003`: los indicadores (`mv_indicadores_mes`) cuentan los egresos
  `completo`, `validado` y `cerrado`. No cambia tablas: `orden_hospitalizacion.servicio_id`
  ya existía y ahora se llena al crear la orden.
- Diez cuentas activas. `dep.medicina` ya no aparece en la bitácora porque no acciona.
- El formulario web de RENOXI no se ha visto: la descarga sigue la estructura del Excel
  diario. Si el formulario pide otras columnas, se ajusta la tabla de grupos.
- Las excepciones que quedan fuera están en
  [Excepciones pendientes](../tareas/excepciones-pendientes.md).
