# Contrato de implementación — egresos-hospitalarios-frontend

Reglas obligatorias para cualquier trabajo sobre este repositorio. Si una regla
impide resolver algo, dilo y propón cambiarla; no la rodees en silencio.

<!-- hrl-core-ui:inicio -->
<!-- Generado por `npx hrl-core-ui init` y refrescado por `npx hrl-core-ui upgrade`. No lo edites: lo que sea de este proyecto va fuera de estas marcas. -->

## Sistema de diseño (`@hrl/core-ui` v1.11.0-redesign.3)

El sistema de diseño **no vive en este repositorio**: es el paquete `@hrl/core-ui`,
fijado a un tag en `package.json`. Este proyecto es un consumidor.

- Contrato completo para modificar el kit: `node_modules/@hrl/core-ui/design.md`.
  Catálogo de componentes: `node_modules/@hrl/core-ui/UI_CATALOG.md`. Léelos antes de
  crear un componente.
- Si falta un componente, un token o un icono, **se pide en el repositorio del kit**,
  se publica una versión y aquí se sube el tag. No se copia ni se edita aquí:
  `node_modules` se pierde en cada instalación.
- Importa solo de `@hrl/core-ui` y de `@hrl/core-ui/tokens.css`; nunca por una ruta
  interna. `tokens.css` se carga **antes** que los estilos de la aplicación.
- Sin HTML nativo con contraparte en el kit: `<button>` → `Button`/`IconButton`;
  `<input>`/`<select>`/`<textarea>` → `Input`; `<table>` → `DataTable`/`PaginatedTable`;
  modales → `Dialog`/`DetailDialog`; `title="…"` como tooltip → `Tooltip`; menús →
  `DropdownMenu`; `alert()`/`confirm()` → `Dialog`/`Toast`.
- Sin valores arbitrarios: colores, radios, sombras y tamaños de fuente salen de
  tokens (`var(--…)`), nunca escritos como literal.
- Los iconos salen solo de `<Icon name="sh-…" />`.
- La API del kit está en inglés; el código de la aplicación, sus comentarios y sus
  textos, en español.

Comprobar que la integración sigue sana: `npx hrl-core-ui doctor`.
Actualizar el kit: `npx hrl-core-ui upgrade vX.Y.Z` (cambia el tag, instala sin subir
otras dependencias, muestra el CHANGELOG y revisa el proyecto).
<!-- hrl-core-ui:fin -->

## Reglas propias de este proyecto

Antes de tocar código, lee `docs/` (en especial `proceso/reglas.md`,
`proceso/camas-y-mantenimiento.md` y `piloto-medicina.md`): ahí están las
decisiones del dominio.

### Stack

React 19 + Vite 8 en **JavaScript** (sin TypeScript), igual que el sistema de
Estadística del hospital. No instales una dependencia sin pedirlo y explicar
qué problema resuelve que no se pueda resolver con lo que ya hay. El plano se
dibuja con SVG y React, sin librerías de dibujo.

### Estructura de `frontend/src/app/`

| Si es… | Va en |
|---|---|
| Una regla o cálculo del dominio (plano, censo, indicadores) | `dominio/` |
| Datos de referencia (catálogo de servicios) o persistencia | `datos/` |
| Una pantalla y sus componentes | `paneles/<módulo>/` |

`dominio/` no importa de `datos/` ni de React: son funciones puras y se
prueban con `npm test` (`node --test`, carpeta `pruebas/`). Todo cambio del
plano pasa por `aplicar(plano, accion)`, para que deshacer y guardar vean un
único punto de cambio.

### Datos

- **Nada de datos de pacientes** en el repositorio ni en la documentación.
- Los `id` del catálogo de servicios (`datos/catalogo.js`) los guarda el
  plano: no se renombran.
- El archivo del plano lleva `version`; si cambia su forma, se sube la versión
  y se migra al abrir.

### Antes de dar algo por terminado

`npm test`, `npm run build`, `npm run lint` y `npx hrl-core-ui doctor`, todo
desde `frontend/`.
