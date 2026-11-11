# 0007 · Orden al departamento, seis cuentas y plano precargado

- **Estado:** Adoptada
- **Fecha:** 2026-11-11
- **Reemplaza en parte:** [0006](0006-credencial-por-area.md) (qué cuentas hay)
  y [0004](0004-vista-isometrica-svg.md) (el plano ya no se edita en la interfaz)

## Contexto

El prototipo tenía doce cuentas, un editor para dibujar habitaciones y camas, y
Admisión elegía el área (Medicina B o Intermedios). Para la demostración se pidió
un recorrido más corto, con las cuentas que de verdad intervienen y el plano ya
cargado.

## Decisión

**Seis cuentas.** Todas ven el plano 3D de camas.

| Cuenta | Rol | Qué hace |
|---|---|---|
| `admision` | `admision` | Envía al paciente al **departamento** (Medicina). No elige área ni cama |
| `dep.medicina` | `departamento` | Designa habitación y cama. Su única acción: después solo supervisa |
| `medicina.b` | `enfermeria` | Controla a sus pacientes y sus camas: O2, cambio de cama, traslado, alta, falla a Mantenimiento, censo |
| `medicina.int` | `enfermeria` | Lo mismo en Intermedios |
| `estadistica` | `jefatura` | Todo lo de Estadística: HC, completado, validación, RENOXI, indicadores y cierre |
| `mantenimiento` | `mantenimiento` | Retira, repara y entrega las camas |

**Recorrido.** Admisión envía al departamento → el departamento designa
habitación y cama, y con eso queda el área y se registra el ingreso → el piso
controla al paciente. Estadística ya no registra movimientos de pacientes.

**Traslados.** Entre Medicina B e Intermedios, el piso de destino confirma la
llegada. A otro departamento (UCI, Cirugía…), la estancia en Medicina se cierra
al salir y la cama queda libre. Por eso UCI deja de estar incorporada en el
prototipo; su plano provisional sigue en `frontend/src/app/datos/planos/`.

**Plano.** Ya viene cargado desde `datos/planos/medicina-b-piso2.json`. Se quitó
el editor y la ruta `POST /api/plano`. Un cambio físico del piso se carga con
las semillas de maestros.

## Consecuencias

- Migración `0002`: `orden_hospitalizacion.departamento_id` (obligatorio) y
  `servicio_id` vacío hasta la designación; rol `departamento`.
- Las cuentas que salieron quedan inactivas, no se borran: la bitácora las nombra.
- Los préstamos de cama siguen apagados. Con la designación por cama, el
  servicio que atiende es siempre el dueño de la cama; si se activan, habrá que
  decidir quién elige el servicio que atiende.
- La vista 3D sigue el aspecto de figura isométrica de
  [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill): trazo fino, caras
  opacas y el texto pintado sobre su plano con una matriz.
- **Actualizado el 2026-11-11:** la vista 3D se pinta en **canvas 2D** (API del
  navegador, sin librerías), no en SVG. En SVG, con cientos de caras que cambian en
  cada cuadro, girar iba a saltos; aun simplificado, arrastrar no pasaba de unos 35
  cuadros por segundo en desarrollo. En canvas, armar y pintar un cuadro cuesta
  unos 3 ms. La escena se arma como una lista de figuras en
  `paneles/plano/escena3d.js` (probada con `node --test`) y la pinta
  `pintura3d.js`. La planta 2D sigue en SVG. Contradice la regla de `CLAUDE.md`
  «el plano se dibuja con SVG y React»: hay que actualizarla.
- Se quitó el módulo «Recorrido del flujo»: cada cuenta entra directo al plano 3D.
