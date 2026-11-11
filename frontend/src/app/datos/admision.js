/* Punto de conexión con Admisión (Galeno). Hoy las órdenes se escriben en la
   pantalla simulada del prototipo; cuando el desarrollo de Admisión esté listo,
   estas funciones leen de ese sistema y el resto no cambia.

   Lo único que este sistema necesita de Admisión: el paciente, el origen
   (consulta externa o emergencia), el departamento y la fecha y hora de la
   orden. La habitación y la cama las designa la cuenta del departamento. */

import { servicioPorId } from './catalogo.js'

/* Órdenes que esperan cama en los departamentos de esos servicios. */
export const ordenesPendientes = (estado, servicios) => {
  const departamentos = servicios && new Set(servicios.map((s) => servicioPorId(s)?.departamento.id))
  return estado.ordenes.filter((o) => o.estado === 'pendiente' && (!departamentos || departamentos.has(o.departamentoId)))
}

export const buscarEnPadron = (estado, texto) => {
  const t = texto.trim().toLowerCase()
  if (!t) return []
  return estado.pacientes.filter((p) => p.hc.includes(t) || p.dni.includes(t) || p.nombres.toLowerCase().includes(t))
}
