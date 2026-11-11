import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Alert, Button, Dialog, DropdownMenu, FloatingTip, IconButton, Input, PageActions, SegmentedControl, Toast, Tooltip, useFloatingTip } from '@hrl/core-ui'
import { PASO, TIPOS_ZONA, duplicar, huella, planoVacio, posicionDentro, validar } from '../../dominio/plano.js'
import { TIPOS_CAMA, medidasHabitacion, varianteInicial, variantesPara } from '../../dominio/estandar.js'
import { GRUPOS_SERVICIO, servicioExiste, servicioPorId } from '../../datos/catalogo.js'
import { abrirArchivo, exportarCSV, guardarArchivo, guardarBorrador, leerBorrador } from '../../datos/almacen.js'
import { publicarPlano } from '../../datos/tienda.js'
import { useHistorial } from './useHistorial.js'
import { Lienzo } from './Lienzo.jsx'
import { VistaIsometrica } from './VistaIsometrica.jsx'
import { Inspector } from './Inspector.jsx'
import { Estructura } from './Estructura.jsx'
import { MiniPlantilla } from './MiniPlantilla.jsx'
import { useTamanoNodo } from './comun.js'

/* Editor del plano de camas: el usuario dibuja las habitaciones (libres o
   con plantilla), coloca las camas al estándar y vincula cada habitación a su
   servicio (y por él, al departamento). El resultado es el maestro de
   habitaciones y camas del sistema.

   El plano ocupa todo el escenario; barras y paneles flotan encima y se
   pliegan. Con «Pantalla completa» (F) el editor tapa también el menú y la
   cabecera del sistema. */

const HERRAMIENTAS = [
  { value: 'seleccionar', label: 'Seleccionar', tecla: 'V', ariaLabel: 'Seleccionar y mover (V)' },
  { value: 'habitacion', label: 'Habitación', tecla: 'H', ariaLabel: 'Dibujar habitación (H)' },
  { value: 'cama', label: 'Cama', tecla: 'C', ariaLabel: 'Colocar cama (C)' },
  { value: 'zona', label: 'Otra zona', tecla: 'Z', ariaLabel: 'Dibujar pasillo, estación u otra zona (Z)' },
]

/* Plantillas de habitación: un clic crea la habitación al tamaño estándar con
   sus camas ya colocadas. 0 es «Libre»: arrastrar. */
const PLANTILLAS = [0, 1, 2, 3, 4, 6, 8]

const AYUDAS = {
  seleccionar: 'Clic selecciona · arrastra para mover · bordes cambian el tamaño · Supr borra · Espacio + arrastrar desplaza',
  habitacion: 'Libre: arrastra. Esc vuelve a Seleccionar',
  cama: 'Clic dentro de una habitación: la cabecera se apoya en la pared más cercana · R gira',
  zona: 'Arrastra para dibujar pasillos, la estación de enfermería u otras áreas sin camas',
}

const VISTAS = [
  { value: 'planta', label: 'Planta' },
  { value: 'iso', label: 'Isométrica' },
]

const ANCHO_CAJON_IZQ = 272
const ANCHO_CAJON_DER = 336

const escribiendo = (e) => e.target.closest?.('input, select, textarea, [role="dialog"]')

const nombreArchivo = (plano) =>
  `${plano.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plano'}.json`

/* El editor ocupa el alto que queda bajo la barra del shell: el lienzo no
   tiene sentido con scroll de página. */
function useAltoDisponible(ref) {
  const [alto, setAlto] = useState(600)
  useLayoutEffect(() => {
    const medir = () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0
      setAlto(Math.max(480, window.innerHeight - top - 12))
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [ref])
  return alto
}

/* Preferencia del navegador (paneles abiertos). Sin almacenamiento disponible
   se usa el valor inicial y no pasa nada. */
function usePreferencia(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave)
      return guardado === null ? inicial : guardado === 'si'
    } catch {
      return inicial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(clave, valor ? 'si' : 'no')
    } catch {
      /* Sin almacenamiento: la preferencia dura la sesión. */
    }
  }, [clave, valor])
  return [valor, setValor]
}

/* Panel lateral flotante y plegable. Plegado deja una pestaña en el borde. */
function Cajon({ lado, titulo, abierto, onAlternar, children }) {
  if (!abierto) {
    return (
      <div className={`plano-pestana plano-pestana--${lado}`}>
        <Button tone="ghost" size="sm" onClick={onAlternar} aria-label={`Mostrar ${titulo.toLowerCase()}`}>
          {titulo}
        </Button>
      </div>
    )
  }
  return (
    <aside className={`plano-cajon plano-cajon--${lado}`} aria-label={titulo}>
      <div className="plano-cajon__cabecera">
        <h2 className="plano-seccion">{titulo}</h2>
        <Tooltip title={`Ocultar ${titulo.toLowerCase()}`} body="Más espacio para el plano." focusable={false}>
          <IconButton icon="sh-close" aria-label={`Ocultar ${titulo.toLowerCase()}`} onClick={onAlternar} />
        </Tooltip>
      </div>
      <div className="plano-cajon__cuerpo">{children}</div>
    </aside>
  )
}

export function EditorPlano({ planoInicial = null }) {
  const historial = useHistorial(planoInicial ?? planoVacio())
  const { plano, version } = historial
  const [cargado, setCargado] = useState(false)
  const [pisoId, setPisoId] = useState(plano.pisos[0].id)
  const [seleccion, setSeleccion] = useState(null)
  const [herramienta, setHerramienta] = useState('seleccionar')
  const [vista, setVista] = useState('planta')
  const [servicioNuevo, setServicioNuevo] = useState('medicina-a')
  const [plantilla, setPlantilla] = useState(4)
  const [variante, setVariante] = useState('h2')
  const [tipoCamaNueva, setTipoCamaNueva] = useState('adulto')
  const [tipoZonaNueva, setTipoZonaNueva] = useState('pasillo')
  const [camara, setCamara] = useState({ x: 0, y: 0, escala: 20 })
  const [orden, setOrden] = useState({ tipo: 'ajustar' })
  const [cursor, setCursor] = useState(null)
  const [archivo, setArchivo] = useState({ nombre: null, manejador: null, version: 0 })
  const [borrador, setBorrador] = useState(null)
  const [toast, setToast] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [inmersivo, setInmersivo] = useState(false)
  const [panelIzq, setPanelIzq] = usePreferencia('egresos_plano_estructura', true)
  const [panelDer, setPanelDer] = usePreferencia('egresos_plano_propiedades', true)
  const tip = useFloatingTip()
  const ref = useRef(null)
  /* Callback ref y no useRef: al cambiar a pantalla completa la barra se
     vuelve a montar y hay que medir la nueva. */
  const [nodoBarra, setNodoBarra] = useState(null)
  const alto = useAltoDisponible(ref)
  const barra = useTamanoNodo(nodoBarra)

  const piso = plano.pisos.find((p) => p.id === pisoId) ?? plano.pisos[0]
  const avisos = useMemo(() => validar(plano, servicioExiste), [plano])
  const sinGuardar = version !== archivo.version

  /* Al abrir, se recupera el borrador de este navegador. */
  useEffect(() => {
    leerBorrador().then((b) => {
      if (b?.plano) {
        historial.cargar(b.plano)
        setPisoId(b.plano.pisos[0].id)
        setBorrador(b.fecha)
        setOrden({ tipo: 'ajustar' })
      }
      setCargado(true)
    })
  }, [historial.cargar])

  /* Autoguardado: medio segundo después del último cambio confirmado. */
  useEffect(() => {
    if (!cargado || version === 0) return
    const t = setTimeout(() => {
      guardarBorrador(plano)
        .then(() => setBorrador(Date.now()))
        .catch(() => setToast('No se pudo guardar el borrador en este navegador. Guarda el archivo para no perder cambios.'))
    }, 500)
    return () => clearTimeout(t)
    // Solo con cambios confirmados (version), no con cada cuadro de un arrastre.
  }, [version, cargado])

  /* Si lo seleccionado desaparece (deshacer, eliminar), se suelta. */
  useEffect(() => {
    if (!seleccion) return
    const existe = seleccion.tipo === 'zona' ? plano.zonas.some((z) => z.id === seleccion.id) : plano.camas.some((c) => c.id === seleccion.id)
    if (!existe) setSeleccion(null)
  }, [plano, seleccion])

  /* Al seleccionar algo con el panel de propiedades plegado, se abre: es
     donde se edita lo seleccionado. */
  useEffect(() => {
    if (seleccion) setPanelDer(true)
  }, [seleccion, setPanelDer])

  /* Pantalla completa: el editor tapa el shell (CSS) y, si el navegador lo
     permite, la ventana entera. Salir con Esc desde el navegador también
     sale del modo. */
  const alternarInmersivo = useCallback(() => {
    setInmersivo((v) => {
      const siguiente = !v
      if (siguiente) document.documentElement.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
      return siguiente
    })
    setOrden({ tipo: 'ajustar' })
  }, [])

  useEffect(() => {
    const alCambiar = () => {
      if (!document.fullscreenElement) setInmersivo(false)
    }
    document.addEventListener('fullscreenchange', alCambiar)
    return () => document.removeEventListener('fullscreenchange', alCambiar)
  }, [])

  const ir = useCallback(
    (destino) => {
      const zona =
        destino.tipo === 'zona'
          ? plano.zonas.find((z) => z.id === destino.id)
          : plano.zonas.find((z) => z.id === plano.camas.find((c) => c.id === destino.id)?.zonaId)
      if (!zona) return
      setPisoId(zona.pisoId)
      setSeleccion(destino)
      setOrden({ tipo: 'enfocar', id: zona.id })
    },
    [plano],
  )

  const hacerDuplicado = useCallback(() => {
    const r = duplicar(plano, seleccion)
    if (!r) return
    historial.ejecutar(r.accion)
    setSeleccion(r.seleccion)
  }, [plano, seleccion, historial])

  const eliminarSeleccion = useCallback(() => {
    if (seleccion?.tipo === 'zona') {
      const n = plano.camas.filter((c) => c.zonaId === seleccion.id).length
      historial.ejecutar({ tipo: 'zona/eliminar', id: seleccion.id })
      if (n) setToast(`Habitación eliminada con sus ${n} camas. Ctrl+Z para deshacer.`)
    } else if (seleccion?.tipo === 'cama') {
      historial.ejecutar({ tipo: 'cama/eliminar', id: seleccion.id })
    }
    setSeleccion(null)
  }, [seleccion, plano, historial])

  /* Flechas: mueve lo seleccionado un paso de cuadrícula (con Mayús, 1 m). */
  const desplazar = useCallback(
    (dx, dy) => {
      if (seleccion?.tipo === 'zona') {
        const z = plano.zonas.find((x) => x.id === seleccion.id)
        historial.ejecutar({ tipo: 'zona/actualizar', id: z.id, cambios: { x: z.x + dx, y: z.y + dy } })
      } else if (seleccion?.tipo === 'cama') {
        const c = plano.camas.find((x) => x.id === seleccion.id)
        const z = plano.zonas.find((x) => x.id === c.zonaId)
        const { ancho, alto } = huella(c)
        historial.ejecutar({ tipo: 'cama/actualizar', id: c.id, cambios: posicionDentro(z, ancho, alto, z.x + c.x + dx, z.y + c.y + dy) })
      }
    },
    [seleccion, plano, historial],
  )

  const girar = useCallback(() => {
    if (seleccion?.tipo !== 'cama') return
    const c = plano.camas.find((x) => x.id === seleccion.id)
    const z = plano.zonas.find((x) => x.id === c.zonaId)
    const rotacion = (c.rotacion + 90) % 360
    const { ancho, alto } = huella({ ...c, rotacion })
    historial.ejecutar({ tipo: 'cama/actualizar', id: c.id, cambios: { rotacion, ...posicionDentro(z, ancho, alto, z.x + c.x, z.y + c.y) } })
  }, [seleccion, plano, historial])

  /* ── Archivo ─────────────────────────────────────────────────────────── */

  const guardar = useCallback(
    async (como = false) => {
      try {
        const r = await guardarArchivo(plano, como ? null : archivo.manejador, archivo.nombre ?? nombreArchivo(plano))
        if (!r) return
        setArchivo({ ...r, version })
        setToast(`Plano guardado en ${r.nombre}.`)
      } catch (e) {
        setToast(`No se pudo guardar: ${e.message}`)
      }
    },
    [plano, archivo, version],
  )

  const publicar = async () => {
    try {
      const r = await publicarPlano(plano)
      setToast(`Plano publicado: ${r.camas} camas, ${r.nuevas} nuevas, ${r.bajas} dadas de baja.`)
    } catch (e) {
      setToast(e.message)
    }
  }

  const cargarPlano = (nuevo, datosArchivo) => {
    historial.cargar(nuevo)
    setPisoId(nuevo.pisos[0].id)
    setSeleccion(null)
    setHerramienta('seleccionar')
    setOrden({ tipo: 'ajustar' })
    /* `cargar` sube la versión en 1: el archivo recién abierto queda «guardado». */
    setArchivo({ ...datosArchivo, version: version + 1 })
  }

  /* Abrir o empezar de nuevo descarta lo que no esté en un archivo: se pide
     confirmación solo si hay algo que perder. */
  const conConfirmacion = (titulo, accion) => {
    if (sinGuardar && (plano.zonas.length || plano.camas.length)) setConfirmar({ titulo, accion })
    else accion()
  }

  const abrir = () =>
    conConfirmacion('Abrir otro plano', async () => {
      try {
        const r = await abrirArchivo()
        if (r) cargarPlano(r.plano, { nombre: r.nombre, manejador: r.manejador })
      } catch (e) {
        setToast(e.message)
      }
    })

  const nuevo = () => conConfirmacion('Empezar un plano nuevo', () => cargarPlano(planoVacio(), { nombre: null, manejador: null }))

  const agregarPiso = () => {
    const nuevoPiso = { id: crypto.randomUUID(), nombre: `Piso ${plano.pisos.length + 1}`, ancho: piso.ancho, alto: piso.alto }
    historial.ejecutar({ tipo: 'piso/crear', piso: nuevoPiso })
    setPisoId(nuevoPiso.id)
    setSeleccion(null)
    setOrden({ tipo: 'ajustar' })
  }

  const eliminarPiso = () =>
    setConfirmar({
      titulo: `Eliminar ${piso.nombre}`,
      detalle: `Se eliminan sus ${plano.zonas.filter((z) => z.pisoId === piso.id).length} zonas y las camas que contienen. Se puede deshacer con Ctrl+Z.`,
      accion: () => {
        historial.ejecutar({ tipo: 'piso/eliminar', id: piso.id })
        setPisoId(plano.pisos.find((p) => p.id !== piso.id).id)
        setSeleccion(null)
      },
    })

  /* ── Teclado ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    const alTeclear = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      const tecla = e.key.toLowerCase()
      if (ctrl && tecla === 's') {
        e.preventDefault()
        guardar(e.shiftKey)
        return
      }
      if (escribiendo(e)) return
      if (ctrl && tecla === 'z') {
        e.preventDefault()
        if (e.shiftKey) historial.rehacer()
        else historial.deshacer()
      } else if (ctrl && tecla === 'y') {
        e.preventDefault()
        historial.rehacer()
      } else if (ctrl && tecla === 'd') {
        e.preventDefault()
        hacerDuplicado()
      } else if (ctrl) {
        return
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        eliminarSeleccion()
      } else if (e.key === 'Escape') {
        if (herramienta !== 'seleccionar') setHerramienta('seleccionar')
        else if (seleccion) setSeleccion(null)
        else if (inmersivo) alternarInmersivo()
      } else if (e.key.startsWith('Arrow')) {
        if (!seleccion) return
        e.preventDefault()
        const paso = e.shiftKey ? 1 : PASO
        const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key]
        desplazar(...d)
      } else if (tecla === 'r') {
        girar()
      } else if (tecla === 'f') {
        alternarInmersivo()
      } else if (tecla === '+' || tecla === '=') {
        setOrden({ tipo: 'zoom', factor: 1.25 })
      } else if (tecla === '-') {
        setOrden({ tipo: 'zoom', factor: 0.8 })
      } else if (tecla === '0') {
        setOrden({ tipo: 'ajustar' })
      } else {
        const h = HERRAMIENTAS.find((x) => x.tecla.toLowerCase() === tecla)
        if (h && vista === 'planta') setHerramienta(h.value)
      }
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [guardar, historial, hacerDuplicado, eliminarSeleccion, herramienta, seleccion, desplazar, girar, vista, inmersivo, alternarInmersivo])

  const hora = (t) => new Date(t).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  const varianteEfectiva = variantesPara(plantilla).some((v) => v.id === variante) ? variante : varianteInicial(plantilla)
  const medidaPlantilla = plantilla > 0 ? medidasHabitacion(plantilla, tipoCamaNueva, varianteEfectiva) : null

  /* Lo que tapan las capas flotantes: «Ajustar» encuadra el piso en el hueco
     que queda libre, no detrás de un panel. */
  const margenes = {
    arriba: barra.alto + 24,
    abajo: 48,
    izquierda: panelIzq ? ANCHO_CAJON_IZQ + 32 : 32,
    derecha: panelDer ? ANCHO_CAJON_DER + 32 : 32,
  }

  const menuArchivo = (
    <DropdownMenu
      label="Archivo"
      trigger={<Button tone="ghost" size="sm" icon="sh-folder">Archivo</Button>}
      items={[
        { id: 'nuevo', label: 'Plano nuevo', icon: 'sh-doc', onSelect: nuevo },
        { id: 'abrir', label: 'Abrir…', icon: 'sh-folder', onSelect: abrir },
        { id: 'guardar-como', label: 'Guardar como… (Ctrl+Mayús+S)', icon: 'sh-export', onSelect: () => guardar(true) },
        { separator: true },
        { id: 'csv', label: 'Exportar camas a CSV', icon: 'sh-table', onSelect: () => exportarCSV(plano, servicioPorId) },
      ]}
    />
  )

  /* Las capas flotantes se ubican debajo de la barra, cuyo alto cambia con
     las opciones de cada herramienta. */
  const variablesCss = {
    '--alto-barra': `${barra.alto}px`,
    '--ancho-cajon-izq': `${ANCHO_CAJON_IZQ}px`,
    '--ancho-cajon-der': `${ANCHO_CAJON_DER}px`,
  }

  const escenario = (
      <div className="plano-escenario">
        {vista === 'planta' ? (
          <Lienzo
            plano={plano}
            piso={piso}
            seleccion={seleccion}
            onSeleccionar={setSeleccion}
            herramienta={herramienta}
            servicioNuevo={servicioNuevo}
            plantilla={plantilla}
            variante={varianteEfectiva}
            tipoCamaNueva={tipoCamaNueva}
            tipoZonaNueva={tipoZonaNueva}
            historial={historial}
            camara={camara}
            setCamara={setCamara}
            orden={orden}
            margenes={margenes}
            onCursor={setCursor}
            onAviso={setToast}
            tip={tip}
          />
        ) : (
          <VistaIsometrica plano={plano} piso={piso} seleccion={seleccion} onSeleccionar={setSeleccion} tip={tip} margenes={margenes} />
        )}

        {/* Barra superior flotante: a la izquierda qué se dibuja y cómo; a la
            derecha historial, vista, zoom y pantalla completa. */}
        <div className="plano-barra" ref={setNodoBarra} role="toolbar" aria-label="Herramientas del plano">
          <div className="plano-flotante">
            <Input
              label="Piso"
              kind="select"
              labelHidden
              value={piso.id}
              options={plano.pisos.map((p) => ({ value: p.id, label: p.nombre }))}
              onChange={(e) => {
                setPisoId(e.target.value)
                setSeleccion(null)
                setOrden({ tipo: 'ajustar' })
              }}
            />
            <Tooltip title="Agregar piso" body="Otro piso o ala del hospital." focusable={false}>
              <IconButton icon="sh-expand" aria-label="Agregar piso" onClick={agregarPiso} />
            </Tooltip>
            {plano.pisos.length > 1 && (
              <Tooltip title="Eliminar piso" body={`Elimina ${piso.nombre} y todo lo dibujado en él.`} focusable={false}>
                <IconButton icon="sh-trash" aria-label={`Eliminar ${piso.nombre}`} onClick={eliminarPiso} />
              </Tooltip>
            )}
            {vista === 'planta' && (
              <>
                <span className="plano-flotante__separador" aria-hidden="true" />
                <SegmentedControl label="Herramienta" value={herramienta} options={HERRAMIENTAS.map(({ value, label, ariaLabel }) => ({ value, label, ariaLabel }))} onChange={setHerramienta} />
              </>
            )}
          </div>

          <div className="plano-flotante plano-barra__derecha">
            <Button tone="ghost" size="sm" disabled={!historial.puedeDeshacer} onClick={historial.deshacer} aria-label="Deshacer (Ctrl+Z)">Deshacer</Button>
            <Button tone="ghost" size="sm" disabled={!historial.puedeRehacer} onClick={historial.rehacer} aria-label="Rehacer (Ctrl+Y)">Rehacer</Button>
            <span className="plano-flotante__separador" aria-hidden="true" />
            <SegmentedControl label="Vista" value={vista} options={VISTAS} onChange={(v) => { setVista(v); setHerramienta('seleccionar') }} />
            {vista === 'planta' && (
              <>
                <Button tone="ghost" size="sm" onClick={() => setOrden({ tipo: 'zoom', factor: 0.8 })} aria-label="Alejar (−)">−</Button>
                <Button tone="ghost" size="sm" onClick={() => setOrden({ tipo: 'ajustar' })} aria-label="Ajustar el piso a la pantalla (0)">Ajustar</Button>
                <Button tone="ghost" size="sm" onClick={() => setOrden({ tipo: 'zoom', factor: 1.25 })} aria-label="Acercar (+)">+</Button>
              </>
            )}
            <span className="plano-flotante__separador" aria-hidden="true" />
            {inmersivo ? (
              <Button tone="blue" size="sm" icon="sh-close" onClick={alternarInmersivo} aria-label="Salir de pantalla completa (F)">Salir</Button>
            ) : (
              <Tooltip title="Pantalla completa (F)" body="El plano ocupa toda la pantalla. Esc o F para volver." focusable={false}>
                <IconButton icon="sh-expand" tone="action" aria-label="Pantalla completa (F)" onClick={alternarInmersivo} />
              </Tooltip>
            )}
            {inmersivo && (
              <>
                {menuArchivo}
                <Button size="sm" icon="sh-ok" onClick={() => guardar(false)}>Guardar</Button>
              </>
            )}
          </div>

          {vista === 'planta' && (
            <div className="plano-flotante plano-opciones" aria-label="Opciones de la herramienta">
              {herramienta === 'habitacion' && (
                <>
                  <Input
                    label="Servicio"
                    kind="select"
                    labelHidden
                    value={servicioNuevo}
                    options={[{ value: '', label: 'Sin servicio' }]}
                    groups={GRUPOS_SERVICIO}
                    onChange={(e) => setServicioNuevo(e.target.value)}
                  />
                  <SegmentedControl
                    label="Camas de la plantilla"
                    value={plantilla}
                    options={PLANTILLAS.map((n) => ({
                      value: n,
                      label: n === 0 ? 'Libre' : `${n} ${n === 1 ? 'cama' : 'camas'}`,
                      ariaLabel: n === 0 ? 'Libre: arrastrar' : `Plantilla de ${n} ${n === 1 ? 'cama' : 'camas'}`,
                    }))}
                    onChange={setPlantilla}
                  />
                </>
              )}
              {(herramienta === 'cama' || (herramienta === 'habitacion' && plantilla > 0)) && (
                <Input
                  label="Tipo de cama"
                  kind="select"
                  labelHidden
                  value={tipoCamaNueva}
                  options={Object.entries(TIPOS_CAMA).map(([value, t]) => ({ value, label: `Cama ${t.label.toLowerCase()} · ${t.ancho} × ${t.largo} m` }))}
                  onChange={(e) => setTipoCamaNueva(e.target.value)}
                />
              )}
              {herramienta === 'zona' && (
                <Input
                  label="Tipo de zona"
                  kind="select"
                  labelHidden
                  value={tipoZonaNueva}
                  options={TIPOS_ZONA.filter((t) => t.value !== 'habitacion')}
                  onChange={(e) => setTipoZonaNueva(e.target.value)}
                />
              )}
              {herramienta === 'habitacion' && plantilla > 0 ? (
                <div className="plano-opciones__fila">
                  <SegmentedControl
                    label="Distribución de las camas"
                    className="plano-variantes"
                    value={varianteEfectiva}
                    options={variantesPara(plantilla).map((v) => ({
                      value: v.id,
                      ariaLabel: v.label,
                      label: (
                        <span className="plano-variante">
                          <MiniPlantilla n={plantilla} variante={v.id} tipo={tipoCamaNueva} />
                          <span>{v.corto}</span>
                        </span>
                      ),
                    }))}
                    onChange={setVariante}
                  />
                  <span className="plano-opciones__ayuda">
                    {medidaPlantilla.ancho} × {medidaPlantilla.alto} m · clic donde va la habitación
                  </span>
                </div>
              ) : (
                <span className="plano-opciones__ayuda">{AYUDAS[herramienta]}</span>
              )}
            </div>
          )}
        </div>

        <Cajon lado="izq" titulo="Estructura" abierto={panelIzq} onAlternar={() => setPanelIzq((v) => !v)}>
          <Estructura plano={plano} seleccion={seleccion} avisos={avisos} onIr={ir} />
        </Cajon>

        <Cajon lado="der" titulo="Propiedades" abierto={panelDer} onAlternar={() => setPanelDer((v) => !v)}>
          <Inspector plano={plano} piso={piso} seleccion={seleccion} historial={historial} onSeleccionar={setSeleccion} onDuplicar={hacerDuplicado} />
        </Cajon>

        <div className="plano-estado" aria-live="polite">
          <span>{cursor && vista === 'planta' ? `x ${cursor.x.toFixed(2)} m · y ${cursor.y.toFixed(2)} m` : `${piso.ancho} × ${piso.alto} m`}</span>
          {vista === 'planta' && <span>1 m = {Math.round(camara.escala)} px</span>}
          <span className="plano-estado__espacio" />
          <span>{borrador ? `Borrador guardado · ${hora(borrador)}` : 'Sin borrador'}</span>
          <span className={sinGuardar ? 'plano-estado__pendiente' : undefined}>
            {archivo.nombre ? `${archivo.nombre}${sinGuardar ? ' · cambios sin guardar' : ' · guardado'}` : 'Sin archivo: Ctrl+S para guardar'}
          </span>
        </div>
      </div>
  )

  return (
    <div className="plano-editor" ref={ref} style={{ ...variablesCss, height: alto }}>
      <PageActions>
        {menuArchivo}
        <Button tone="ghost" icon="sh-ok" onClick={() => guardar(false)}>Guardar archivo</Button>
        <Button icon="sh-send" onClick={publicar}>Publicar en el sistema</Button>
      </PageActions>

      {/* En pantalla completa el escenario se monta en document.body: el
          contenido del shell se anima con transform y eso atraparía un
          position: fixed dentro de él. hrl-portal le da los tokens del kit. */}
      {inmersivo
        ? createPortal(<div className="hrl-portal plano-editor plano-editor--inmersivo" style={variablesCss}>{escenario}</div>, document.body)
        : escenario}

      <FloatingTip tip={tip.tip} />
      <Toast message={toast} onClose={() => setToast(null)} />

      {confirmar && (
        <Dialog
          title={confirmar.titulo}
          onClose={() => setConfirmar(null)}
          maxWidth={480}
          footer={
            <>
              <Button tone="ghost" onClick={() => setConfirmar(null)}>Cancelar</Button>
              <Button
                tone="danger"
                onClick={() => {
                  const accion = confirmar.accion
                  setConfirmar(null)
                  accion()
                }}
              >
                Continuar
              </Button>
            </>
          }
        >
          <Alert tone="warning" title={confirmar.detalle ? 'Atención' : 'Hay cambios sin guardar en un archivo'}>
            {confirmar.detalle ?? 'El borrador de este navegador se reemplazará. Si quieres conservar el plano actual, cancela y usa Guardar.'}
          </Alert>
        </Dialog>
      )}
    </div>
  )
}
