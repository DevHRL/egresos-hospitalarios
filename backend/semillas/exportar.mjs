/* Entrega en JSON los datos de referencia que viven en el frontend: así la base
   se carga desde las mismas fuentes que usa el prototipo. */
import fs from 'node:fs'
import { DEPARTAMENTOS } from '../../frontend/src/app/datos/catalogo.js'
import { CUENTAS } from '../../frontend/src/app/datos/cuentas.js'
import { CIE10, MEDICOS } from '../../frontend/src/app/datos/clinicos.js'
import { crearSemilla } from '../../frontend/src/app/datos/semilla.js'

const leer = (nombre) => JSON.parse(fs.readFileSync(new URL(`../../frontend/src/app/datos/planos/${nombre}`, import.meta.url), 'utf8'))
/* Solo Medicina B e Intermedios: UCI salió del prototipo el 2026-11-11. Su plano
   provisional sigue en datos/planos/ para cuando se incorpore. */
const medicina = leer('medicina-b-piso2.json')

process.stdout.write(JSON.stringify({
  departamentos: DEPARTAMENTOS,
  cuentas: CUENTAS,
  cie10: CIE10,
  medicos: MEDICOS,
  planos: [medicina],
  semilla: crearSemilla(medicina),
}))
