/* Punto de conexión con Admisión (Galeno). Hoy las órdenes se escriben en la
   pantalla simulada del prototipo; cuando el desarrollo de Admisión esté listo,
   estas funciones leen de ese sistema y el resto no cambia.

   Lo único que este sistema necesita de Admisión: el paciente, el origen
   (consulta externa o emergencia), el área de hospitalización y la fecha y hora
   de la orden. La cama la confirma enfermería de piso al recibir al paciente. */

export const ordenesPendientes = (estado, servicios) =>
  estado.ordenes.filter((o) => o.estado === 'pendiente' && (!servicios || servicios.includes(o.servicioId)))

export const buscarEnPadron = (estado, texto) => {
  const t = texto.trim().toLowerCase()
  if (!t) return []
  return estado.pacientes.filter((p) => p.hc.includes(t) || p.dni.includes(t) || p.nombres.toLowerCase().includes(t))
}
