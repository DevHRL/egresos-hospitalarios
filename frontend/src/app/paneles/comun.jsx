import { createContext, useContext, useState } from 'react'
import { Alert, Button, Dialog, Input, Stack } from '@hrl/core-ui'
import { servicioPorId } from '../datos/catalogo.js'
import { diaDe, sumarDias } from '../dominio/tiempo.js'

/* Lo que toda pantalla necesita: el estado, la cuenta con la que se entró y
   la forma de ejecutar una acción. */
export const ContextoApp = createContext(null)
export const useApp = () => useContext(ContextoApp)

export const nombreServicio = (id) => servicioPorId(id)?.nombre ?? id

export const opcionesServicio = (ids) => ids.map((id) => ({ value: id, label: nombreServicio(id) }))

/* El censo que corresponde mirar: antes de las 08:00, todavía el de ayer. */
export const diaOperativo = (ahora) => (ahora.slice(11) < '08:00' ? sumarDias(diaDe(ahora), -1) : diaDe(ahora))

/* Ejecuta una acción desde un diálogo: si una regla la rechaza, el mensaje se
   queda en el diálogo; si se aplica, el diálogo se cierra. */
export function useEnvio(onCerrar) {
  const { hacer } = useApp()
  const [error, setError] = useState(null)
  const enviar = (tipo, datos, aviso) => {
    const mensaje = hacer(tipo, datos, aviso)
    if (mensaje) setError(mensaje)
    else onCerrar?.()
  }
  return { error, enviar }
}

export function DialogoAccion({ titulo, subtitulo, textoConfirmar = 'Guardar', tono = 'cta', onCerrar, onConfirmar, error, maxWidth = 560, children }) {
  return (
    <Dialog
      title={titulo}
      subtitle={subtitulo}
      onClose={onCerrar}
      maxWidth={maxWidth}
      footer={
        <>
          <Button tone="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button tone={tono} onClick={onConfirmar}>{textoConfirmar}</Button>
        </>
      }
    >
      <Stack gap={3}>
        {error && <Alert tone="error" title="No se pudo registrar">{error}</Alert>}
        {children}
      </Stack>
    </Dialog>
  )
}

/* La hora del evento, que puede ser anterior a la hora en que se digita. */
export function CampoFechaHora({ value, onChange, etiqueta = 'Fecha del evento' }) {
  return (
    <div className="campos-dos">
      <Input label={etiqueta} kind="date" value={value.slice(0, 10)} onChange={(e) => onChange(`${e.target.value}T${value.slice(11)}`)} />
      <Input label="Hora" placeholder="HH:mm" info="La hora real o aproximada en que ocurrió. Puede ser anterior a este momento." value={value.slice(11)} onChange={(e) => onChange(`${value.slice(0, 10)}T${e.target.value}`)} />
    </div>
  )
}

export function ListaDatos({ datos }) {
  return (
    <dl className="lista-datos">
      {datos.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}
