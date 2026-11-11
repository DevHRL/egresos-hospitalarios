/* Cama hospitalaria en isométrico: patas, bastidor, colchón, frazada (con el
   color del servicio), almohada, cabecera, piecera y barandas. Cada pieza es
   una caja proyectada con la cámara de `camara3d.js`; se dibujan de atrás
   hacia adelante según hacia dónde quede la cabecera respecto de quien mira,
   sin ordenar polígono por polígono.

   Alturas en metros desde el piso, aproximadas a una cama clínica. */

const PATA = { hasta: 0.3, lado: 0.06, margen: 0.08 }
const BASTIDOR = { desde: 0.3, hasta: 0.42 }
const COLCHON = { desde: 0.42, hasta: 0.58, margen: 0.06 }
const FRAZADA = { hasta: 0.62 }
const ALMOHADA = { hasta: 0.68 }
const CABECERA = { hasta: 1, grosor: 0.06 }
const PIECERA = { hasta: 0.78, grosor: 0.06 }
const BARANDA = { desde: 0.58, hasta: 0.74, grosor: 0.03 }

/* Pasa de coordenadas de la cama (s: de la cabecera a los pies, t: de un
   costado al otro) a coordenadas del piso, según el giro. */
function marco(r, rotacion) {
  const girada = rotacion % 180 !== 0
  const L = girada ? r.ancho : r.alto
  const W = girada ? r.alto : r.ancho
  const aMundo = {
    0: (s, t) => [r.x + t, r.y + s],
    180: (s, t) => [r.x + W - t, r.y + L - s],
    270: (s, t) => [r.x + s, r.y + t],
    90: (s, t) => [r.x + L - s, r.y + W - t],
  }[rotacion]
  return { L, W, aMundo }
}

/* Caja con su tapa y las caras laterales que miran a la cámara, a partir de
   un rango en coordenadas de la cama. La sombra de cada cara depende del eje
   de su normal: así la luz queda fija en el piso aunque se gire la vista. */
function caja(vista, aMundo, s0, s1, t0, t1, z0, z1) {
  const esquinas = [aMundo(s0, t0), aMundo(s1, t1)]
  const x0 = Math.min(esquinas[0][0], esquinas[1][0])
  const x1 = Math.max(esquinas[0][0], esquinas[1][0])
  const y0 = Math.min(esquinas[0][1], esquinas[1][1])
  const y1 = Math.max(esquinas[0][1], esquinas[1][1])
  const lados = [
    { normal: [1, 0], cara: 'lado', puntos: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
    { normal: [-1, 0], cara: 'lado', puntos: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]] },
    { normal: [0, 1], cara: 'frente', puntos: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]] },
    { normal: [0, -1], cara: 'frente', puntos: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
  ]
  return {
    profundidad: vista.profundidad((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
    tapa: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    lados: lados.filter((l) => vista.mira(...l.normal)),
  }
}

function Pieza({ pieza, clase, poligono, sinLados = false }) {
  return (
    <>
      {!sinLados && pieza.lados.map((l) => (
        <polygon key={l.normal.join(',')} className={`${clase} plano-cama3d__cara--${l.cara}`} points={poligono(l.puntos)} />
      ))}
      <polygon className={`${clase} plano-cama3d__cara--tapa`} points={poligono(pieza.tapa)} />
    </>
  )
}

export function CamaIsometrica({ r, rotacion, vista, fuera }) {
  const { L, W, aMundo } = marco(r, rotacion)
  const c = (...a) => caja(vista, aMundo, ...a)
  const { poligono } = vista

  const patas = [
    [PATA.margen, PATA.margen],
    [PATA.margen, W - PATA.margen - PATA.lado],
    [L - PATA.margen - PATA.lado, PATA.margen],
    [L - PATA.margen - PATA.lado, W - PATA.margen - PATA.lado],
  ]
    .map(([s, t]) => c(s, s + PATA.lado, t, t + PATA.lado, 0, PATA.hasta))
    .sort((a, b) => a.profundidad - b.profundidad)

  const bastidor = c(0.05, L - 0.05, 0, W, BASTIDOR.desde, BASTIDOR.hasta)
  const colchon = c(0.1, L - 0.1, COLCHON.margen, W - COLCHON.margen, COLCHON.desde, COLCHON.hasta)
  const frazada = c(L * 0.42, L - 0.12, COLCHON.margen - 0.02, W - COLCHON.margen + 0.02, COLCHON.hasta, FRAZADA.hasta)
  const almohada = c(0.16, Math.min(0.5, L * 0.3), W * 0.16, W * 0.84, COLCHON.hasta, ALMOHADA.hasta)
  const cabecera = c(0, CABECERA.grosor, 0, W, BASTIDOR.desde, CABECERA.hasta)
  const piecera = c(L - PIECERA.grosor, L, 0, W, BASTIDOR.desde, PIECERA.hasta)
  const barandas = [
    c(L * 0.22, L * 0.6, 0, BARANDA.grosor, BARANDA.desde, BARANDA.hasta),
    c(L * 0.22, L * 0.6, W - BARANDA.grosor, W, BARANDA.desde, BARANDA.hasta),
  ].sort((a, b) => a.profundidad - b.profundidad)

  /* Lo que queda más lejos de la cámara se dibuja antes. */
  const cabeceraAtras = cabecera.profundidad < piecera.profundidad
  const [fondo, delante] = cabeceraAtras ? [cabecera, piecera] : [piecera, cabecera]
  const claseFondo = cabeceraAtras ? 'plano-cama3d__cabecera' : 'plano-cama3d__piecera'
  const claseDelante = cabeceraAtras ? 'plano-cama3d__piecera' : 'plano-cama3d__cabecera'
  const p = { poligono }

  return (
    <>
      {patas.map((pata, i) => <Pieza key={i} pieza={pata} clase="plano-cama3d__pata" {...p} />)}
      <Pieza pieza={bastidor} clase="plano-cama3d__bastidor" {...p} />
      <Pieza pieza={fondo} clase={claseFondo} {...p} />
      <Pieza pieza={barandas[0]} clase="plano-cama3d__baranda" {...p} />
      <Pieza pieza={colchon} clase="plano-cama3d__colchon" {...p} />
      <Pieza pieza={frazada} clase="plano-cama3d__frazada" {...p} />
      {fuera && <polygon className="plano-cama3d__rayado" fill="url(#rayado-iso)" points={poligono(frazada.tapa)} />}
      <Pieza pieza={almohada} clase="plano-cama3d__almohada" {...p} />
      <Pieza pieza={barandas[1]} clase="plano-cama3d__baranda" {...p} />
      <Pieza pieza={delante} clase={claseDelante} {...p} />
    </>
  )
}
