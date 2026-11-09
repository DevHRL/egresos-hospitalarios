import { useEffect, useState } from 'react'
import { Alert, Button, Card, Dialog, Input, SegmentedControl, Stack } from '@hrl/core-ui'
import { ESTADOS_CAMA, FORMATOS_NUMERACION, ORDENES_NUMERACION, TIPOS_ZONA, accionDistribuir, accionNumerar, ajustar, aplicar, huella, posicionDentro } from '../../dominio/plano.js'
import { SEPARACION, TIPOS_CAMA, capacidad, tipoCama, variantesPara } from '../../dominio/estandar.js'
import { GRUPOS_SERVICIO, servicioPorId } from '../../datos/catalogo.js'

/* Panel derecho: propiedades de lo seleccionado o, sin selección, del piso y
   del estándar de camas. */

const OPCIONES_TIPO_CAMA = Object.entries(TIPOS_CAMA).map(([value, t]) => ({ value, label: `${t.label} (${t.ancho} × ${t.largo} m)` }))

const opcionesVariante = (n) => [
  { value: 'auto', label: 'Automática (la habitual que quepa)' },
  ...variantesPara(n).map((v) => ({ value: v.id, label: v.label })),
]

/* Los campos guardan al salir del campo o con Enter, no a cada tecla: así
   deshacer vuelve al valor anterior entero y no letra por letra. El `Input`
   del kit no expone onBlur; el foco que sale burbujea hasta el envoltorio. */
function CampoTexto({ label, value, onCommit, info, error }) {
  const [texto, setTexto] = useState(value ?? '')
  const [editando, setEditando] = useState(false)
  useEffect(() => {
    if (!editando) setTexto(value ?? '')
  }, [value, editando])
  const confirmar = () => {
    setEditando(false)
    if (texto.trim() !== (value ?? '')) onCommit(texto.trim())
  }
  return (
    <div onFocus={() => setEditando(true)} onBlur={confirmar} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}>
      <Input label={label} value={texto} info={info} error={error} onChange={(e) => setTexto(e.target.value)} />
    </div>
  )
}

/* `cuadricula`: el valor confirmado se ajusta al paso de 25 cm, como todo
   lo que se dibuja (5,3 m queda en 5,25 m). */
function CampoNumero({ label, value, onCommit, min = 0, entero = false, cuadricula = false }) {
  const [texto, setTexto] = useState(String(value))
  const [editando, setEditando] = useState(false)
  useEffect(() => {
    if (!editando) setTexto(String(value))
  }, [value, editando])
  const numero = Number(texto.replace(',', '.'))
  const valido = texto.trim() !== '' && Number.isFinite(numero) && numero >= min && (!entero || Number.isInteger(numero))
  const confirmar = () => {
    setEditando(false)
    const final = cuadricula ? Math.max(min, ajustar(numero)) : Math.round(numero * 100) / 100
    if (valido && final !== value) onCommit(final)
    else setTexto(String(value))
  }
  return (
    <div onFocus={() => setEditando(true)} onBlur={confirmar} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}>
      <Input
        label={label}
        kind="number"
        value={texto}
        error={editando && !valido ? (entero ? `Entero ≥ ${min}` : `Número ≥ ${min}`) : undefined}
        onChange={(e) => setTexto(e.target.value)}
      />
    </div>
  )
}

export function Inspector({ plano, piso, seleccion, historial, onSeleccionar, onDuplicar }) {
  const zona = seleccion?.tipo === 'zona' ? plano.zonas.find((z) => z.id === seleccion.id) : null
  const cama = seleccion?.tipo === 'cama' ? plano.camas.find((c) => c.id === seleccion.id) : null

  if (zona) return <PanelZona key={zona.id} plano={plano} zona={zona} historial={historial} onSeleccionar={onSeleccionar} onDuplicar={onDuplicar} />
  if (cama) return <PanelCama plano={plano} cama={cama} historial={historial} onSeleccionar={onSeleccionar} onDuplicar={onDuplicar} />
  return <PanelPiso plano={plano} piso={piso} historial={historial} />
}

function PanelZona({ plano, zona, historial, onSeleccionar, onDuplicar }) {
  const [confirmando, setConfirmando] = useState(false)
  const habitacion = zona.tipo === 'habitacion'
  const camas = plano.camas.filter((c) => c.zonaId === zona.id)
  const servicio = servicioPorId(zona.servicioId)
  const actualizar = (cambios) => historial.ejecutar({ tipo: 'zona/actualizar', id: zona.id, cambios })

  /* Al renombrar la habitación, las camas que llevan su código como prefijo
     (H01-C1) lo siguen; las renombradas a mano no se tocan. */
  const cambiarCodigo = (codigo) => {
    const prefijo = `${zona.codigo}-`
    historial.ejecutar({
      tipo: 'lote',
      acciones: [
        { tipo: 'zona/actualizar', id: zona.id, cambios: { codigo } },
        ...camas
          .filter((c) => zona.codigo && c.codigo.startsWith(prefijo))
          .map((c) => ({ tipo: 'cama/actualizar', id: c.id, cambios: { codigo: `${codigo}-${c.codigo.slice(prefijo.length)}` } })),
      ],
    })
  }

  const eliminar = () => {
    historial.ejecutar({ tipo: 'zona/eliminar', id: zona.id })
    setConfirmando(false)
    onSeleccionar(null)
  }

  return (
    <Stack gap={4}>
      <Card title={habitacion ? `Habitación ${zona.codigo || ''}` : zona.nombre || 'Zona'} subtitle={habitacion ? `${camas.length} ${camas.length === 1 ? 'cama' : 'camas'} · ${zona.ancho} × ${zona.alto} m` : 'Referencia del plano, sin camas'}>
        <Stack gap={3}>
          {habitacion ? (
            <>
              <CampoTexto label="Código" value={zona.codigo} onCommit={cambiarCodigo} info="Identificador de la habitación (p. ej. el que figura en la puerta). Las camas lo usan como prefijo." error={!zona.codigo ? 'Obligatorio' : undefined} />
              <Input
                label="Servicio"
                kind="select"
                value={zona.servicioId ?? ''}
                options={[{ value: '', label: 'Sin asignar' }]}
                groups={GRUPOS_SERVICIO}
                error={!zona.servicioId ? 'Asigna el servicio dueño de la habitación' : undefined}
                onChange={(e) => actualizar({ servicioId: e.target.value || null })}
              />
              {servicio && <p className="plano-nota">Departamento: <strong>{servicio.departamento.nombre}</strong></p>}
            </>
          ) : (
            <>
              <Input
                label="Tipo de zona"
                kind="select"
                value={zona.tipo}
                options={TIPOS_ZONA.filter((t) => t.value !== 'habitacion')}
                onChange={(e) => actualizar({ tipo: e.target.value })}
              />
              <CampoTexto label="Nombre" value={zona.nombre} onCommit={(nombre) => actualizar({ nombre })} />
            </>
          )}
        </Stack>
      </Card>

      {habitacion && <DistribuirCamas plano={plano} zona={zona} camas={camas} historial={historial} />}
      {habitacion && camas.length > 0 && <NumerarCamas plano={plano} zona={zona} historial={historial} />}

      <Card title="Posición y tamaño">
        <div className="plano-rejilla-2">
          <CampoNumero label="X (m)" value={zona.x} cuadricula onCommit={(x) => actualizar({ x })} />
          <CampoNumero label="Y (m)" value={zona.y} cuadricula onCommit={(y) => actualizar({ y })} />
          <CampoNumero label="Ancho (m)" value={zona.ancho} cuadricula min={1} onCommit={(ancho) => actualizar({ ancho })} />
          <CampoNumero label="Largo (m)" value={zona.alto} cuadricula min={1} onCommit={(alto) => actualizar({ alto })} />
        </div>
      </Card>

      <Stack direction="row" gap={2} wrap>
        <Button tone="ghost" size="sm" onClick={onDuplicar}>Duplicar (Ctrl+D)</Button>
        <Button tone="danger" size="sm" icon="sh-trash" onClick={() => (camas.length ? setConfirmando(true) : eliminar())}>Eliminar</Button>
      </Stack>

      {confirmando && (
        <Dialog
          title={`Eliminar la habitación ${zona.codigo}`}
          subtitle="Se puede deshacer con Ctrl+Z."
          onClose={() => setConfirmando(false)}
          maxWidth={460}
          footer={
            <>
              <Button tone="ghost" onClick={() => setConfirmando(false)}>Cancelar</Button>
              <Button tone="danger" onClick={eliminar}>Sí, eliminar</Button>
            </>
          }
        >
          <Alert tone="warning" title={`También se eliminan sus ${camas.length} camas`}>
            {camas.map((c) => c.codigo).join(', ')}
          </Alert>
        </Dialog>
      )}
    </Stack>
  )
}

/* Acomoda n camas en la habitación con el estándar. Si no caben, ofrece
   agrandar la habitación al tamaño mínimo; si sobran camas, confirma cuáles
   se quitan. */
function DistribuirCamas({ plano, zona, camas, historial }) {
  const tipoActual = camas[0]?.tipo ?? 'adulto'
  const [tipo, setTipo] = useState(tipoActual)
  const [cantidad, setCantidad] = useState(camas.length || Math.max(1, capacidad(zona, tipoActual)))
  const [modo, setModo] = useState('auto')
  /* Si se baja a una cama, una variante de dos filas deja de aplicar. */
  const modoValido = opcionesVariante(cantidad).some((o) => o.value === modo) ? modo : 'auto'
  const [resultado, setResultado] = useState(null)

  const maximo = capacidad(zona, tipo)

  const probar = () => {
    const r = accionDistribuir(plano, zona, cantidad, tipo, modoValido)
    if (!r.ok) return setResultado(r)
    if (r.quitadas.length) return setResultado(r)
    historial.ejecutar(r.accion)
    setResultado(null)
  }

  const agrandar = () => {
    const cambios = { ancho: Math.max(zona.ancho, resultado.requerido.ancho), alto: Math.max(zona.alto, resultado.requerido.alto) }
    const agrandado = aplicar(plano, { tipo: 'zona/actualizar', id: zona.id, cambios })
    const r = accionDistribuir(agrandado, { ...zona, ...cambios }, cantidad, tipo, modoValido)
    if (!r.ok) return
    historial.ejecutar({ tipo: 'lote', acciones: [{ tipo: 'zona/actualizar', id: zona.id, cambios }, ...r.accion.acciones] })
    setResultado(null)
  }

  return (
    <Card title="Camas de la habitación" subtitle={`Con el estándar caben hasta ${maximo} ${maximo === 1 ? 'cama' : 'camas'} de este tipo`}>
      <Stack gap={3}>
        <CampoNumero label="Cantidad" value={cantidad} min={1} entero onCommit={setCantidad} />
        <Input label="Tipo de cama" kind="select" value={tipo} options={OPCIONES_TIPO_CAMA} onChange={(e) => setTipo(e.target.value)} />
        <Input label="Distribución" kind="select" value={modoValido} options={opcionesVariante(cantidad)} onChange={(e) => setModo(e.target.value)} />
        <Button tone="blue" onClick={probar}>{camas.length ? 'Redistribuir camas' : 'Colocar camas'}</Button>
        <p className="plano-nota">
          Cabecera contra la pared, {SEPARACION.entreCamas} m entre camas y {SEPARACION.lateral} m a la pared lateral. Las camas que ya existen conservan su código y estado.
        </p>

        {resultado && !resultado.ok && (
          <Alert tone="warning" title={`No caben ${cantidad} camas con el estándar`} action={<Button tone="ghost" size="sm" onClick={agrandar}>Agrandar a {resultado.requerido.ancho} × {resultado.requerido.alto} m</Button>}>
            La habitación necesita al menos {resultado.requerido.ancho} × {resultado.requerido.alto} m (ahora mide {zona.ancho} × {zona.alto} m).
          </Alert>
        )}
      </Stack>

      {resultado?.ok && resultado.quitadas.length > 0 && (
        <Dialog
          title={`Quedarán ${cantidad} camas en ${zona.codigo}`}
          onClose={() => setResultado(null)}
          maxWidth={460}
          footer={
            <>
              <Button tone="ghost" onClick={() => setResultado(null)}>Cancelar</Button>
              <Button
                tone="danger"
                onClick={() => {
                  historial.ejecutar(resultado.accion)
                  setResultado(null)
                }}
              >
                Quitar y redistribuir
              </Button>
            </>
          }
        >
          <Alert tone="warning" title={`Se quitan ${resultado.quitadas.length} camas`}>
            {resultado.quitadas.map((c) => c.codigo).join(', ')}. Se puede deshacer con Ctrl+Z.
          </Alert>
        </Dialog>
      )}
    </Card>
  )
}

/* Numeración de camas a partir del código de la habitación. El alcance es
   la habitación o todo su servicio (habitaciones en orden de código); en
   «correlativo» el número sigue de una habitación a la siguiente, así una
   sala de 24 camas puede ir de MA-1 a MA-24. Vista previa antes de aplicar;
   si un código choca con una cama de fuera del alcance, no se aplica. */
function NumerarCamas({ plano, zona, historial }) {
  const [alcance, setAlcance] = useState('habitacion')
  const [formato, setFormato] = useState('hab-c')
  const [orden, setOrden] = useState('filas')
  const [inicio, setInicio] = useState(1)
  const [prefijo, setPrefijo] = useState('')
  const servicio = servicioPorId(zona.servicioId)

  const delServicio = servicio
    ? plano.zonas
        .filter((z) => z.tipo === 'habitacion' && z.servicioId === zona.servicioId)
        .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es', { numeric: true }))
    : [zona]
  const zonas = alcance === 'servicio' ? delServicio : [zona]
  const r = accionNumerar(plano, zonas, { formato, inicio, prefijo, orden })
  const iguales = r.cambios.every((c) => c.antes === c.despues)
  const muestra = r.cambios.map((c) => c.despues)
  const resumen = muestra.length > 6 ? `${muestra.slice(0, 4).join(', ')} … ${muestra.at(-1)}` : muestra.join(', ')

  return (
    <Card title="Numeración de camas" subtitle="Códigos a partir del de la habitación; cada cama también se puede renombrar sola">
      <Stack gap={3}>
        {servicio && delServicio.length > 1 && (
          <SegmentedControl
            label="Alcance"
            value={alcance}
            options={[
              { value: 'habitacion', label: 'Esta habitación' },
              { value: 'servicio', label: `Todo ${servicio.nombre} (${delServicio.length})` },
            ]}
            onChange={setAlcance}
          />
        )}
        <Input label="Formato" kind="select" value={formato} options={FORMATOS_NUMERACION.map(({ value, label }) => ({ value, label }))} onChange={(e) => setFormato(e.target.value)} />
        <div className="plano-rejilla-2">
          {formato === 'correlativo' && (
            <Input label="Prefijo" value={prefijo} info="Texto antes del número, p. ej. MA- para MA-1, MA-2…" onChange={(e) => setPrefijo(e.target.value)} />
          )}
          <CampoNumero label="Empieza en" value={inicio} min={0} entero onCommit={setInicio} />
        </div>
        <SegmentedControl label="Orden" value={orden} options={ORDENES_NUMERACION} onChange={setOrden} />
        <p className="plano-nota">
          {r.cambios.length} {r.cambios.length === 1 ? 'cama' : 'camas'}: <span className="plano-codigos">{resumen}</span>
        </p>
        {r.conflictos.length > 0 && (
          <Alert tone="warning" title="Hay códigos repetidos">
            {r.conflictos.join(', ')} ya {r.conflictos.length === 1 ? 'lo usa' : 'los usan'} otras camas. Cambia el formato, el prefijo o el número de inicio.
          </Alert>
        )}
        <Button tone="blue" disabled={iguales || r.conflictos.length > 0} onClick={() => historial.ejecutar(r.accion)}>
          {iguales ? 'Ya están numeradas así' : 'Aplicar numeración'}
        </Button>
      </Stack>
    </Card>
  )
}

function PanelCama({ plano, cama, historial, onSeleccionar, onDuplicar }) {
  const zona = plano.zonas.find((z) => z.id === cama.zonaId)
  const servicioZona = servicioPorId(zona?.servicioId)
  const t = tipoCama(cama.tipo)
  const actualizar = (cambios) => historial.ejecutar({ tipo: 'cama/actualizar', id: cama.id, cambios })

  /* Cambiar el tipo o girar cambia la huella: se reacomoda para que no
     quede sobresaliendo de la habitación. */
  const cambiarForma = (cambios) => {
    const { ancho, alto } = huella({ ...cama, ...cambios })
    actualizar({ ...cambios, ...posicionDentro(zona, ancho, alto, zona.x + cama.x, zona.y + cama.y) })
  }

  return (
    <Stack gap={4}>
      <Card title={`Cama ${cama.codigo}`} subtitle={`Habitación ${zona?.codigo ?? '—'} · ${t.ancho} × ${t.largo} m`}>
        <Stack gap={3}>
          <CampoTexto label="Código" value={cama.codigo} onCommit={(codigo) => actualizar({ codigo })} info="Identificador único de la cama en el hospital. Es el ID de cama del censo." error={!cama.codigo ? 'Obligatorio' : undefined} />
          <Input label="Tipo" kind="select" value={cama.tipo} options={OPCIONES_TIPO_CAMA} onChange={(e) => cambiarForma({ tipo: e.target.value })} />
          <SegmentedControl label="Estado" value={cama.estado} options={ESTADOS_CAMA} onChange={(estado) => actualizar({ estado })} />
          {cama.estado === 'fuera_servicio' && <p className="plano-nota">El puesto sigue en el plano; no cuenta como disponible hasta que vuelva la cama.</p>}
          <Input
            label="Servicio"
            kind="select"
            value={cama.servicioId ?? ''}
            options={[{ value: '', label: `El de la habitación (${servicioZona?.nombre ?? 'sin asignar'})` }]}
            groups={GRUPOS_SERVICIO}
            info="Solo si esta cama pertenece a un servicio distinto al de su habitación."
            onChange={(e) => actualizar({ servicioId: e.target.value || null })}
          />
        </Stack>
      </Card>

      <Stack direction="row" gap={2} wrap>
        <Button tone="ghost" size="sm" onClick={() => cambiarForma({ rotacion: (cama.rotacion + 90) % 360 })}>Girar 90° (R)</Button>
        <Button tone="ghost" size="sm" onClick={onDuplicar}>Duplicar (Ctrl+D)</Button>
        <Button
          tone="danger"
          size="sm"
          icon="sh-trash"
          onClick={() => {
            historial.ejecutar({ tipo: 'cama/eliminar', id: cama.id })
            onSeleccionar(null)
          }}
        >
          Eliminar
        </Button>
      </Stack>
      <p className="plano-nota">Arrastra la cama para moverla; si la sueltas en otra habitación, pasa a esa habitación.</p>
    </Stack>
  )
}

function PanelPiso({ plano, piso, historial }) {
  const actualizarPiso = (cambios) => historial.ejecutar({ tipo: 'piso/actualizar', id: piso.id, cambios })

  return (
    <Stack gap={4}>
      <Card title="Piso" subtitle="Área de dibujo">
        <Stack gap={3}>
          <CampoTexto label="Nombre" value={piso.nombre} onCommit={(nombre) => actualizarPiso({ nombre: nombre || piso.nombre })} />
          <div className="plano-rejilla-2">
            <CampoNumero label="Ancho (m)" value={piso.ancho} cuadricula min={5} onCommit={(ancho) => actualizarPiso({ ancho })} />
            <CampoNumero label="Largo (m)" value={piso.alto} cuadricula min={5} onCommit={(alto) => actualizarPiso({ alto })} />
          </div>
        </Stack>
      </Card>

      <Card title="Estándar de camas" subtitle="Medidas con las que se dibuja a escala">
        <Stack gap={3}>
          <dl className="plano-estandar">
            {Object.values(TIPOS_CAMA).map((t) => (
              <div key={t.label} style={{ display: 'contents' }}>
                <dt>{t.label}</dt>
                <dd>{t.ancho} × {t.largo} m</dd>
              </div>
            ))}
            <dt>Entre camas</dt>
            <dd>{SEPARACION.entreCamas} m</dd>
            <dt>A la pared lateral</dt>
            <dd>{SEPARACION.lateral} m</dd>
            <dt>Libre a los pies (una fila)</dt>
            <dd>{SEPARACION.pies} m</dd>
            <dt>Pasillo entre dos filas</dt>
            <dd>{SEPARACION.pasilloCentral} m</dd>
          </dl>
          <p className="plano-nota">Medidas de trabajo para dibujar a escala. Se validan con Infraestructura contra la norma técnica del MINSA antes de usarlas para decidir capacidad.</p>
        </Stack>
      </Card>

      <Card title="Plano">
        <CampoTexto label="Nombre del plano" value={plano.nombre} onCommit={(nombre) => historial.ejecutar({ tipo: 'plano/reemplazar', plano: { ...plano, nombre: nombre || plano.nombre } })} />
      </Card>
    </Stack>
  )
}
