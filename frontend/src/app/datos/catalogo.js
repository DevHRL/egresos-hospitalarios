/* Departamentos y servicios del hospital. Un servicio es un censo.

   `camas` es la cifra de referencia contra la que se compara lo mapeado: el
   conteo físico donde ya se hizo (Medicina) y, si no, la relación actualizada
   de 249 camas. `null` cuando no se conoce el reparto entre servicios de un
   mismo departamento (Psiquiatría V/M): entonces se compara contra el total
   del departamento.

   Cuando exista el backend este catálogo vendrá de la base; los `id` son los
   que guarda el plano, así que no se renombran. */
export const DEPARTAMENTOS = [
  {
    id: 'medicina',
    nombre: 'Medicina',
    camas: 53,
    servicios: [
      { id: 'medicina-a', nombre: 'Medicina A', camas: 24 },
      { id: 'medicina-b', nombre: 'Medicina B', camas: 24 },
      { id: 'medicina-intermedios', nombre: 'Medicina Intermedios', camas: 5 },
    ],
  },
  { id: 'infectologia', nombre: 'Infectología', camas: 25, servicios: [{ id: 'infectologia', nombre: 'Infectología', camas: 25 }] },
  { id: 'obstetricia', nombre: 'Obstetricia', camas: 37, servicios: [{ id: 'maternidad', nombre: 'Maternidad', camas: 37 }] },
  {
    id: 'pediatria',
    nombre: 'Pediatría',
    camas: 29,
    servicios: [
      { id: 'pediatria', nombre: 'Pediatría', camas: 25 },
      { id: 'pediatria-intermedios', nombre: 'Pediatría Intermedios', camas: 4 },
    ],
  },
  { id: 'cirugia', nombre: 'Cirugía', camas: 33, servicios: [{ id: 'cirugia', nombre: 'Cirugía', camas: 33 }] },
  { id: 'ginecologia', nombre: 'Ginecología', camas: 15, servicios: [{ id: 'ginecologia', nombre: 'Ginecología', camas: 15 }] },
  {
    id: 'salud-mental',
    nombre: 'Salud Mental',
    camas: 10,
    servicios: [
      { id: 'psiquiatria-varones', nombre: 'Psiquiatría Varones', camas: null },
      { id: 'psiquiatria-mujeres', nombre: 'Psiquiatría Mujeres', camas: null },
    ],
  },
  { id: 'oncologia', nombre: 'Oncología', camas: 7, servicios: [{ id: 'oncologia', nombre: 'Oncología', camas: 7 }] },
  { id: 'uci-medicina', nombre: 'UCI Medicina', camas: 6, servicios: [{ id: 'cuidados-criticos', nombre: 'Cuidados Críticos', camas: 6 }] },
  { id: 'uci-pediatria', nombre: 'UCI Pediatría', camas: 4, servicios: [{ id: 'uci-pediatria', nombre: 'UCI Pediatría', camas: 4 }] },
  { id: 'uci-cirugia', nombre: 'UCI Cirugía', camas: 6, servicios: [{ id: 'uci-cirugia', nombre: 'UCI Cirugía', camas: 6 }] },
  { id: 'quemados', nombre: 'Unidad de Quemados', camas: 7, servicios: [{ id: 'quemados', nombre: 'Quemados', camas: 7 }] },
  { id: 'uci-neonatologia', nombre: 'UCI Neonatología', camas: 6, servicios: [{ id: 'ucin', nombre: 'UCIN', camas: 6 }] },
  { id: 'utin', nombre: 'UTIN Neonatología', camas: 22, servicios: [{ id: 'utin', nombre: 'UTIN', camas: 22 }] },
  {
    id: 'emergencia',
    nombre: 'Emergencia',
    fueraDeDotacion: true,
    camas: null,
    servicios: [
      { id: 'emergencia-contingencia', nombre: 'Emergencia Contingencia', camas: null },
      { id: 'observacion-medicina', nombre: 'Observación Medicina', camas: null },
      { id: 'topico', nombre: 'Tópico', camas: null },
      { id: 'observacion-pediatria', nombre: 'Observación Pediatría', camas: null },
      { id: 'trauma-shock', nombre: 'Trauma Shock', camas: 2 },
    ],
  },
  {
    id: 'otros',
    nombre: 'Otros (fuera de dotación)',
    fueraDeDotacion: true,
    camas: null,
    servicios: [
      { id: 'alojamiento-conjunto', nombre: 'Alojamiento Conjunto', camas: 15 },
      { id: 'atencion-inmediata', nombre: 'Atención Inmediata', camas: null },
    ],
  },
]

const SERVICIOS = new Map(
  DEPARTAMENTOS.flatMap((d, i) => d.servicios.map((s) => [s.id, { ...s, departamento: d, color: (i % 11) + 1 }])),
)

/* Incluye el departamento y el número de color de serie (`--serie-N`), que es
   el del departamento: así A, B e Intermedios se leen como un mismo bloque. */
export const servicioPorId = (id) => SERVICIOS.get(id) ?? null

export const servicioExiste = (id) => SERVICIOS.has(id)

/* Formato de `groups` del `Input` del kit: un encabezado por departamento. */
export const GRUPOS_SERVICIO = DEPARTAMENTOS.map((d) => ({
  label: d.nombre,
  options: d.servicios.map((s) => ({ value: s.id, label: s.nombre })),
}))
