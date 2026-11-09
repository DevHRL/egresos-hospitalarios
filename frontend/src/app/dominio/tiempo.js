/* Fechas del dominio: cadenas locales 'AAAA-MM-DD' y 'AAAA-MM-DDTHH:mm'.
   Se comparan como texto y no dependen de la zona horaria del equipo. */

const aUtc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const dos = (n) => String(n).padStart(2, '0')
const aDia = (ms) => {
  const f = new Date(ms)
  return `${f.getUTCFullYear()}-${dos(f.getUTCMonth() + 1)}-${dos(f.getUTCDate())}`
}

export const diaDe = (f) => f.slice(0, 10)
export const horaDe = (f) => f.slice(11, 16)
export const mesDe = (f) => f.slice(0, 7)

export const sumarDias = (d, n) => aDia(aUtc(d) + n * 86400000)
export const diasEntre = (a, b) => Math.round((aUtc(diaDe(b)) - aUtc(diaDe(a))) / 86400000)

export function sumarHoras(f, h) {
  const total = +f.slice(11, 13) * 60 + +f.slice(14, 16) + h * 60
  const dias = Math.floor(total / 1440)
  const resto = total - dias * 1440
  return `${sumarDias(diaDe(f), dias)}T${dos(Math.floor(resto / 60))}:${dos(resto % 60)}`
}

/* Corte del censo de D: las 24:00, es decir las 00:00 de D+1. */
export const corteDelDia = (d) => `${sumarDias(d, 1)}T00:00`
/* Estadística recoge el censo de D a las 08:00 de D+1. */
export const bloqueoDelDia = (d) => `${sumarDias(d, 1)}T08:00`

/* Límite para «todo lo ocurrido hasta f, incluido f»: en orden de texto va
   después de cualquier movimiento registrado a esa misma hora. */
export const hasta = (f) => `${f}~`

/* La próxima vez que el reloj marca esa hora, siempre después de `f`. */
export function proximaHora(f, hhmm) {
  const hoy = `${diaDe(f)}T${hhmm}`
  return hoy > f ? hoy : `${sumarDias(diaDe(f), 1)}T${hhmm}`
}

export const esFechaHora = (f) => /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(f ?? '')

export function edad(nacimiento, f) {
  const [a, m, d] = [+nacimiento.slice(0, 4), +nacimiento.slice(5, 7), +nacimiento.slice(8, 10)]
  const [fa, fm, fd] = [+f.slice(0, 4), +f.slice(5, 7), +f.slice(8, 10)]
  return fa - a - (fm < m || (fm === m && fd < d) ? 1 : 0)
}

/* Estancia en días; el mismo día cuenta 1. */
export const estancia = (ingreso, salida) => Math.max(1, diasEntre(ingreso, salida))

export const diasDelMes = (mes) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()

export const verFecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
export const verFechaHora = (f) => (f ? `${verFecha(f)} ${horaDe(f)}` : '—')
