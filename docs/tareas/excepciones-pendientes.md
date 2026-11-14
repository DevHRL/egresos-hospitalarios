# Excepciones pendientes

El flujo principal está construido y probado: orden de Admisión al área, designación
de cama, oxígeno y ventilación mecánica, envío a mantenimiento y reactivación, alta
completa desde el área, traslado, censo diario con cierre a las 24:00, indicadores y
RENOXI (ver [decisión 0010](../decisiones/0010-el-area-designa-y-registra-el-alta.md)).

Estas excepciones quedan por implementar o por decidir. Las marcadas *por decidir*
necesitan una respuesta antes de construirse.

## Ingreso

| Excepción | Hoy | Falta |
|---|---|---|
| Orden sin cama libre en el área | La orden queda pendiente; a las 24 h aparece como inconsistencia en Estadística | Aviso al área y a Admisión; decidir si se puede reenviar a otra área (*por decidir*) |
| Orden enviada al área equivocada | Admisión la anula con motivo y emite otra | Reasignar la orden a otra área sin anularla |
| Paciente que no llega | Admisión anula la orden con motivo | Plazo de vencimiento automático (*por decidir*) |
| Enfermera de Emergencia que envía la orden | Se escribe a mano | Catálogo del personal de Emergencia |
| Datos del paciente | Admisión los escribe porque Galeno aún no está conectado | Leerlos del padrón (`datos/admision.js` es el punto de conexión) |
| Censo inicial | Solo el día de arranque de cada área | Probarlo con la base vacía el día que arranque cada área |

## Durante la estancia

| Excepción | Hoy | Falta |
|---|---|---|
| Falla en una cama ocupada | Se reporta, pero Mantenimiento no puede retirarla mientras tenga paciente | Avisar al área que primero cambie al paciente de cama |
| Cama dada de baja | Mantenimiento la da de baja; el puesto sigue fuera de servicio hasta que entregue otra cama | Probar el flujo de reemplazo con la base vacía |
| Traslado que el destino no recibe | El origen lo cancela; a las 6 h aparece como inconsistencia | Rechazo explícito por el área de destino, con motivo |
| Préstamo de cama entre servicios | Apagado (decisión 0007) | Política de préstamos (*por decidir*) |

## Alta

| Excepción | Hoy | Falta |
|---|---|---|
| Referido a otro establecimiento | Se registra el tipo, sin destino | Catálogo de establecimientos para elegir el destino |
| Estadística encuentra un error en un alta | Solo puede validarla; se retiró «Observar» | Devolver el alta al área con motivo para que la corrija |
| CIE-10 | Muestra de 23 códigos | Catálogo completo del MINSA, con búsqueda |
| Médicos | Cuatro ficticios en `datos/clinicos.js` | Lista real desde Aletheia o Jefatura |
| HC física | Ya no se controla su entrega a Estadística | Decidir si se sigue controlando (*por decidir*) |
| Alta anulada después de validada | No se permite | Reapertura por Estadística, con motivo |

## Censo, reportes y cuentas

| Excepción | Hoy | Falta |
|---|---|---|
| Censo sin cerrar a las 08:00 | Lo cierra Estadística | Aviso al área antes de las 08:00 |
| Cierre de mes | Exige censos cerrados y altas validadas | Probarlo de punta a punta con la base vacía |
| Formulario de RENOXI | La descarga sigue el Excel diario de camas | Comparar con el formulario web real y ajustar columnas |
| Datos personales en `control.camas` | Ve nombres en el plano | Mostrarle solo cifras y estados de cama |
| Indicadores por departamento | Solo los ve Estadística | Decidir si el departamento y las áreas ven los suyos (*por decidir*) |
