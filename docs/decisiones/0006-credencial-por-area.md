# 0006 · Una credencial por área

- **Estado:** Adoptada
- **Fecha:** 2026-10-27
- **Responsable:** `user:default/giancarlochavez`

## Contexto

Las enfermeras rotan por turnos y el registro lo hace quien llena el censo en
ese momento. Crear y mantener un usuario por persona implica altas y bajas
constantes, y el hospital no tiene directorio de usuarios que el sistema
pueda usar.

## Decisión

Una cuenta por área, con el rol y los servicios de esa área. En enfermería el
área es el **servicio** (el que tiene censo propio): Medicina tiene tres
cuentas, Medicina A, Medicina B y Medicina Intermedios. Estadística y
Mantenimiento tienen una cuenta cada una. Quién la usa en cada turno lo
organiza el área.

## Alternativas consideradas

| Opción | A favor | En contra |
|---|---|---|
| Cuenta por área (elegida) | Simple de administrar; sin altas y bajas por rotación | La bitácora identifica al área, no a la persona |
| Usuario personal | Trazabilidad por persona | Administración constante; resistencia en sala |
| Cuenta por área + PIN personal | Trazabilidad sin multiplicar cuentas | Más fricción en cada registro |

## Consecuencias

- La bitácora registra cuenta, equipo (IP) y hora. Para saber quién hizo un
  registro hay que cruzarlo con el rol de turnos del área.
- La contraseña de un área se cambia cuando alguien deja de trabajar en ella.
- Si más adelante se necesita trazabilidad personal, se puede agregar un PIN
  sin cambiar el modelo de datos.
