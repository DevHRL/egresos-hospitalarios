/* Qué pantalla abre cada módulo del menú (`MODULOS` en datos/cuentas.js). App lo
   usa para montar la pantalla activa y la prueba de humo para renderizarlas todas:
   un módulo sin pantalla, o una pantalla sin módulo, falla allí y no en el piso. */

import { CuentasBitacora } from './prototipo/Prototipo.jsx'
import { Ordenes } from './admision/Ordenes.jsx'
import { MapaCamas } from './camas/MapaCamas.jsx'
import { MovimientosDia } from './camas/MovimientosDia.jsx'
import { CensoDiario } from './censo/CensoDiario.jsx'
import { Recepcion } from './estadistica/Recepcion.jsx'
import { Validacion } from './estadistica/Validacion.jsx'
import { Consolidado, Indicadores, Renoxi, Tablero } from './reportes/Reportes.jsx'
import { OrdenesCama } from './mantenimiento/OrdenesCama.jsx'
import { BuscarPaciente } from './pacientes/BuscarPaciente.jsx'

export const PANELES = {
  ordenes: Ordenes,
  mapa: MapaCamas,
  movimientos: MovimientosDia,
  censo: CensoDiario,
  recepcion: Recepcion,
  validacion: Validacion,
  consolidado: Consolidado,
  renoxi: Renoxi,
  indicadores: Indicadores,
  mantenimiento: OrdenesCama,
  tablero: Tablero,
  cuentas: CuentasBitacora,
  pacientes: BuscarPaciente,
}
