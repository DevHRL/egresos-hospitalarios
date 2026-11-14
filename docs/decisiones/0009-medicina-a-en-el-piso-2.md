# 0009 · Medicina A en el piso 2

- **Estado:** Adoptada
- **Fecha:** 2026-11-12
- **Completa:** [0008](0008-uci-quemados-y-estados-de-cama.md) (el lado este del hall
  quedaba libre para Medicina A)

## Contexto

Se entregó el plano de Medicina A: un corredor que sale al este del hall de ascensores,
con habitaciones a los dos lados. El dibujo no coincide con el uso actual, y se
indicaron estos cambios:

- La sala de recuperación de endoscopia tiene **2 camas**.
- El área de capacitación pasa a ser hospitalización, con **4 camas**.
- En el cuarto 06 hay 2 camas, y la última está enfrente, en aislados.
- En total, Medicina A tiene **24 camas**, como en el catálogo.

## Decisión

**Plano** (`frontend/src/app/datos/planos/medicina-b-piso2.json`, el mismo del piso).
Medicina A corre de oeste a este desde el hall, con el corredor alineado con el de
Medicina B (de y 45,25 a 47,75). El dibujo se pasó a escala a 32 px por metro, se
ajustó a la cuadrícula de 25 cm y las habitaciones de 4 camas quedaron de 6,25 m, el
estándar. La sala de estar y la hidroterapia de Quemados se redibujaron con este plano,
que las muestra mejor; conservan su `id`.

| Habitación | Nombre en el plano entregado | Camas |
|---|---|---|
| A-H01 | Sala de endoscopia recuperación | A-01, A-02 |
| A-H02 | Cuarto 01 | A-03, A-04 |
| A-H03 | Cuarto 02 | A-05, A-06 |
| A-H04 | Cuarto 03 | A-07 a A-10 |
| A-H05 | Cuarto 04 | A-11 a A-14 |
| A-H06 | Cuarto 05 | A-15 a A-18 |
| A-H07 | Área de capacitación | A-19 a A-22 |
| A-H08 | Cuarto 06 | A-23 |
| A-H09 | Aislados (el del extremo este, frente al cuarto 06) | A-24 |

Las camas van horizontales, con la cabecera contra las paredes laterales, como en
Medicina B. Se numeran de oeste a este; dentro de cada habitación, primero la fila
izquierda y luego la derecha, de arriba abajo. Se pueden renumerar desde el panel de
la habitación.

**Lectura de «el último pasa al frente».** Para llegar a 24, el cuarto 06 queda con
una cama y la otra va al aislado de enfrente. Si el cuarto 06 tiene dos camas además
del aislado, serían 25 y hay que revisar otra habitación. El otro ambiente de aislados
(junto al estar) y las salas de endoscopia quedan sin camas de hospitalización.

**Cuenta.** Se agrega `medicina.a` (enfermería de piso), igual que `medicina.b`. La
cama la designa `dep.medicina`, que ahora cubre Medicina A, Medicina B e Intermedios.
Admisión, Estadística y Mantenimiento ven los cinco servicios.

## Consecuencias

- Maestros: 95 zonas, 67 camas y 10 cuentas (nueve y `sistema`). `medicina-a` pasa a
  captura digital y recibe fecha de arranque; su fila RENOXI es la de hospitalización
  de adultos, igual que Medicina B.
- La demostración suma cinco pacientes en Medicina A (uno con O2, uno en el aislado)
  y cierra también sus censos.
- La dotación por mapeo de Medicina ya está completa (53 camas); la comparación con la
  oficial (42 para el departamento) queda para Estadística.
- Las medidas salen del dibujo y se validan en sala.
