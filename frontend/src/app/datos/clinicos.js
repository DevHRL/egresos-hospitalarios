/* Catálogos de la demostración. El CIE-10 es público; aquí va una muestra. Los
   médicos son ficticios: el sistema real los migra de Aletheia. */

export const CIE10 = [
  ['A09', 'Diarrea y gastroenteritis de presunto origen infeccioso'],
  ['A91', 'Fiebre del dengue hemorrágico'],
  ['B50.9', 'Paludismo por P. falciparum, sin otra especificación'],
  ['B51.9', 'Paludismo por P. vivax, sin complicaciones'],
  ['D64.9', 'Anemia de tipo no especificado'],
  ['E11.9', 'Diabetes mellitus tipo 2, sin complicaciones'],
  ['E87.1', 'Hiponatremia'],
  ['G40.9', 'Epilepsia, tipo no especificado'],
  ['I10', 'Hipertensión esencial'],
  ['I21.9', 'Infarto agudo de miocardio, sin otra especificación'],
  ['I50.9', 'Insuficiencia cardíaca, no especificada'],
  ['I63.9', 'Infarto cerebral, no especificado'],
  ['J18.9', 'Neumonía, no especificada'],
  ['J44.1', 'EPOC con exacerbación aguda'],
  ['J45.9', 'Asma, no especificada'],
  ['K29.7', 'Gastritis, no especificada'],
  ['K70.3', 'Cirrosis hepática alcohólica'],
  ['K92.2', 'Hemorragia gastrointestinal, no especificada'],
  ['N17.9', 'Insuficiencia renal aguda, no especificada'],
  ['N18.9', 'Enfermedad renal crónica, no especificada'],
  ['N39.0', 'Infección de vías urinarias, sitio no especificado'],
  ['O80', 'Parto único espontáneo'],
  ['R50.9', 'Fiebre, no especificada'],
].map(([value, nombre]) => ({ value, label: `${value} · ${nombre}` }))

export const MEDICOS = [
  { value: 'med-1', label: 'Dra. Demo Salazar' },
  { value: 'med-2', label: 'Dr. Demo Paredes' },
  { value: 'med-3', label: 'Dra. Demo Vásquez' },
  { value: 'med-4', label: 'Dr. Demo Tuesta' },
]

export const nombreMedico = (id) => MEDICOS.find((m) => m.value === id)?.label ?? '—'
