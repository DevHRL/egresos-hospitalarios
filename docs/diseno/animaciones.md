# Estándar de animaciones

Vale para **todas las áreas** del sistema: el plano 3D de camas y cualquier pantalla
que se diseñe después. Nació del plano 3D (decisión
[0007](../decisiones/0007-orden-al-departamento-seis-cuentas.md)) y aquí queda como
regla general. Si una pantalla necesita apartarse, se dice y se registra en una
decisión nueva.

## 1. Principios

1. **Toda animación explica algo.** Un cambio de lugar, de foco o de estado se anima
   para que se entienda de dónde viene y a dónde va. Nada se mueve solo por adorno,
   salvo la deriva en reposo del plano (sección 4.4), que es sutil a propósito.
2. **Nada salta.** Ningún cambio espacial (cámara, foco, giro, panel que entra) es
   instantáneo. Si llega una orden nueva a mitad de camino, la animación parte desde
   donde va, nunca desde el inicio ni desde el destino anterior.
3. **Arranca y llega despacio.** Siempre con curva de aceleración y frenado, nunca
   lineal. La velocidad del primer y del último cuadro es menos de una quinta parte
   de la del medio.
4. **Velocidad percibida pareja.** La duración depende de cuánto cambia (distancia,
   giro, zoom), no es fija: un salto corto es breve y uno largo no corre.
5. **Fluido o nada.** Una animación que no llega a 60 cuadros por segundo se ve peor
   que ninguna. Primero se garantiza el presupuesto de cuadro (sección 6).
6. **El sistema conduce.** En vistas espaciales, la cámara la mueve la selección (en
   la vista o en una lista enlazada), no el arrastre ni la rueda: la página sigue
   debajo y cada selección llega a un ángulo legible.

## 2. Curvas

| Uso | Curva | Dónde está |
|---|---|---|
| Viaje, zoom, fundidos | Ease-in-out cúbica: `t < 0,5 ? 4t³ : 1 − (−2t + 2)³ / 2` | `suavizar` en `paneles/plano/camara3d.js` |
| Giros e inclinación | Ease-in-out sinusoidal: `(1 − cos πt) / 2` (igual de suave en los extremos, sin picos de velocidad) | `suavizarGiro` en `camara3d.js` |
| Interfaz (CSS) | `var(--ease)` del kit: `cubic-bezier(0.33, 1, 0.68, 1)` | `@hrl/core-ui/tokens.css` |

No se escriben curvas nuevas en cada pantalla: se reutilizan estas.

## 3. Duraciones

| Movimiento | Duración | Regla |
|---|---|---|
| Vuelo de cámara (cambiar de habitación, ir a vista general) | 0,9 a 2,8 s | Según el vuelo de van Wijk y Nuij a 0,85 anchos de pantalla por segundo (sección 4.1) |
| Giro de cámara | 0,8 s + 0,7 s × (giro / 180°) | 90° ≈ 1,15 s; 180° = 1,5 s |
| Inclinación | + 8 ms por grado | Se suma a la del giro |
| Fundido de foco (apagar una habitación y encender otra) | 0,9 s | Curva cúbica, cada zona por su cuenta |
| Interfaz: hover, foco, chips | `var(--duration-fast)` 0,2 s | Tokens del kit, siempre con `var(--transition-fast)` |
| Interfaz: paneles, tarjetas que cambian | `var(--duration-base)` 0,35 s | `var(--transition-base)` |
| Interfaz: entradas y salidas grandes | `var(--duration-slow)` 0,5 s | `var(--transition-slow)` |

Ningún valor de tiempo se escribe como literal en CSS: se usan los tokens del kit.

## 4. Patrones

### 4.1 Vuelo de cámara («fly to»)

Para ir de un lugar a otro se usa el camino de zoom y desplazamiento óptimo de
**J. J. van Wijk y W. A. A. Nuij, «Smooth and efficient zooming and panning»
(IEEE InfoVis 2003)**, el mismo «fly to» de los mapas web: la cámara **se aleja,
viaja y se vuelve a acercar** en una sola curva, con velocidad percibida constante.

- Curvatura ρ = 1,42 (el valor de los mapas). Velocidad 0,85 anchos de pantalla por segundo.
- Con la habitación vecina casi no se aleja; con una lejana, se abre hasta ver ambas.
- El giro y la inclinación empiezan al 15 % del vuelo y terminan al llegar, con la
  curva sinusoidal: se llega ya mirando el destino.
- Implementación: `vuelo(desde, hacia, anchoVista)` en `camara3d.js`, que devuelve
  `{ duracion, en(t) }`. Se reutiliza para cualquier vista con cámara.

### 4.2 Giro con respiro

Un giro sin viaje (botones ↺ ↻) se anima con un **respiro de zoom**: se abre hasta un
7 % a mitad del giro y vuelve. Los giros se suman al destino vigente, así dos clics
seguidos giran 180° sin cortarse.

### 4.3 Foco con fundido cruzado

Al enfocar algo, el resto baja a una opacidad de 0,14. Al cambiar de foco, lo anterior
se apaga mientras lo nuevo se enciende, cada zona con su propio valor (nunca un cambio
de golpe). Implementación: `useLuces` en `paneles/camas/VistaMapa.jsx`.

### 4.4 Deriva en reposo

Con la cámara quieta, un vaivén muy lento mantiene viva la maqueta: ±2,2° de giro
(periodo de 17 s) y ±0,9° de inclinación (23 s), periodos distintos para que no se
note el ciclo. Entra de a poco (constante de 2 s) para no dar un salto, se pinta a
la mitad de cuadros y **se detiene con la vista fuera de la pantalla**
(`IntersectionObserver`). Implementación: `deriva` en `camara3d.js`.

### 4.5 Selección enlazada

Cuando una vista y una lista muestran lo mismo (plano y tarjetas), una sola selección
manda en ambas: elegir en una anima la otra (la cámara vuela; la tarjeta se marca y
se trae a la vista con desplazamiento suave **dentro de la lista**, sin mover la página).

## 5. Movimiento reducido

- **Vistas espaciales (cámara, foco, giro):** se animan aunque el sistema operativo pida
  reducir movimiento. En el equipo de prueba Windows tenía apagados los efectos y el
  plano saltaba sin que se entendiera a dónde iba: el movimiento aquí es información.
- **Animaciones de interfaz:** usan los tokens y componentes del kit, que ya respetan
  `prefers-reduced-motion`.
- **Pendiente:** si alguien necesita menos movimiento, se agrega una preferencia en la
  aplicación («movimiento reducido») que acorte los vuelos y quite la deriva, en vez de
  apagarlos.

## 6. Rendimiento

- **Presupuesto:** armar y pintar un cuadro en **4 ms o menos** (el plano 3D mide unos
  3 ms). A 60 cuadros por segundo hay 16,7 ms.
- **Vistas con cientos de figuras que cambian en cada cuadro se pintan en canvas 2D**
  (API nativa del navegador, sin librerías): la escena es una lista de figuras armada
  en código puro (`escena3d.js`) y un pintor aparte (`pintura3d.js`). En SVG, React
  tenía que comparar y el navegador repintar cada elemento, y el giro iba a saltos.
- **Una sola publicación por cuadro:** los cambios de cámara se juntan en
  `requestAnimationFrame`; los gestos no disparan renders propios.
- **Aislar lo que cambia seguido:** el tooltip vive en su propio componente; mover el
  puntero no vuelve a dibujar la vista.
- **Recortar lo que queda fuera de la pantalla** y simplificar lo que se ve pequeño
  (detalle por tamaño en pantalla).
- **No ajustar a píxeles enteros** en dibujo vectorial: hace temblar los movimientos lentos.
- **Medir antes y después, con la ventana al frente.** Chrome frena a 1–9 cuadros por
  segundo una ventana tapada por otras: ahí no se mide fluidez. Se mide el costo por
  cuadro (Profiler de React, `long-animation-frame`, o cronometrando armar y pintar).

## 7. Cómo se verifica

Cada animación nueva lleva pruebas con `node --test` que muestrean la curva a 60 cuadros
por segundo (ver `frontend/pruebas/camara3d.test.mjs`):

- [ ] Ningún cuadro salta: menos de 4° de giro, 40 px en pantalla y 0,06 de zoom
      (logarítmico) por cuadro.
- [ ] Arranca y llega despacio: primer y último paso menores que un quinto del paso medio.
- [ ] El último cuadro es exactamente el destino.
- [ ] Un salto largo dura más que uno corto y se aleja a mitad de camino; uno corto casi no se aleja.
- [ ] El costo por cuadro está dentro del presupuesto (sección 6).
- [ ] Se vio en el navegador con la ventana al frente.

## 8. Aspecto: figura isométrica

Las vistas 3D siguen la técnica de **[ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill)**
(figura isométrica de línea):

- Trazo fino, caras opacas y la profundidad solo por el orden de pintado (de atrás hacia adelante).
- Dos grises para líneas y detalle, y **un único color vivo** (`--primary`) para lo
  seleccionado. El color de estado va solo donde es el dato que se busca (la frazada).
- Textura por repetición (baldosas, pespuntes), sin sombras ni degradados.
- El texto se pinta sobre su plano con una matriz (códigos en los muros), con el giro
  que lo deja derecho y legible.
- Marco de figura: número («Fig. 1»), nombre, cómo se usa y una lectura en vivo que
  cambia con cada interacción.
- Todos los colores salen de los tokens del kit, en los dos temas.

## 9. Fuentes y skills evaluadas

| Fuente | Qué se tomó | Qué no |
|---|---|---|
| [ai-iso-skill](https://github.com/MrBongoC/ai-iso-skill) | Aspecto de figura isométrica (sección 8) y texto sobre planos | Una matriz por cara en SVG: con cientos de caras era lenta; las caras se calculan ya proyectadas |
| [isometric-game-skills](https://github.com/0xheycat/isometric-game-skills) | Medir primero, recortar lo que queda fuera, una sola transformación por cuadro | Cámara manejada a mano (arrastre, zoom al cursor) y ajuste a píxeles enteros. No trae animación de cámara |
| van Wijk y Nuij (2003) | Vuelo de cámara con zoom y desplazamiento óptimos (sección 4.1) | — |
| Tokens del kit `@hrl/core-ui` | Duraciones y curva de la interfaz | — |
