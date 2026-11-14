/* Entrega en JSON los datos de referencia que viven en el frontend: así la base
   se carga desde las mismas fuentes que usa el prototipo. */
import fs from 'node:fs'
import { DEPARTAMENTOS } from '../../frontend/src/app/datos/catalogo.js'
import { CUENTAS } from '../../frontend/src/app/datos/cuentas.js'
import { CIE10, MEDICOS } from '../../frontend/src/app/datos/clinicos.js'
import { crearSemilla } from '../../frontend/src/app/datos/semilla.js'

const leer = (nombre) => JSON.parse(fs.readFileSync(new URL(`../../frontend/src/app/datos/planos/${nombre}`, import.meta.url), 'utf8'))
/* El piso 2: Medicina A y B, Intermedios, UCI y Quemados (decisiones 0008 y 0009). UCI
   Cirugía y UCI Pediatría siguen con plano provisional, fuera del prototipo. */
const medicina = leer('medicina-b-piso2.json')

process.stdout.write(JSON.stringify({
  departamentos: DEPARTAMENTOS,
  cuentas: CUENTAS,
  cie10: CIE10,
  medicos: MEDICOS,
  planos: [medicina],
  semilla: crearSemilla(medicina),
}))
