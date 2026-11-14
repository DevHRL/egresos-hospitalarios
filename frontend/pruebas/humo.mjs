/* Prueba de humo, con la misma forma que la de Estadística (frontend/pruebas/humo.mjs
   de Estadistica_hrl), para que las dos se lean igual y puedan juntarse.

   Ni el lint ni el build detectan lo que deja la página en blanco: un import que
   no resuelve, un export que se renombró, un icono pedido por un nombre que no
   está en el registro, una pantalla que lanza con los datos de una cuenta. Esto sí.

   Usa el cargador SSR de Vite para importar cada módulo de verdad, con el alias
   `@` resuelto igual que en el navegador; renderiza cada pantalla con cada cuenta
   que la tiene, con la demostración y con la base vacía; y al final corre las
   pruebas del dominio (`pruebas/*.test.mjs`), que siguen escritas con node:test.

   Lo que NO comprueba: que las pantallas se vean bien, el plano 3D dibujado (el
   lienzo se pinta en un efecto, que aquí no corre) ni el servidor. Eso necesita
   un navegador y la API.

     npm run humo */

import { createServer } from 'vite'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { run } from 'node:test'

const RAIZ = fileURLToPath(new URL('..', import.meta.url))
const APP = join(RAIZ, 'src', 'app')

let fallos = 0
let pasadas = 0

function afirmar(condicion, descripcion, detalle) {
  if (condicion) {
    pasadas += 1
    return
  }
  fallos += 1
  console.error(`  x ${descripcion}${detalle ? `\n      ${detalle}` : ''}`)
}

function titulo(texto) {
  console.log(`\n${texto}`)
}

function archivos(dir, extensiones) {
  const salida = []
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada)
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, extensiones))
    else if (extensiones.some((e) => entrada.endsWith(e))) salida.push(ruta)
  }
  return salida
}

const corta = (ruta) => relative(RAIZ, ruta).replaceAll('\\', '/')

/* Un JWT sin firma válida: el cliente solo lee lo que dice, nunca lo verifica. */
function tokenFalso(reclamos) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(reclamos)}.firma`
}

const servidor = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })

try {
  /* ------------------------------------------------- 1. carga de módulos */
  titulo('1. Cada módulo de la aplicación carga')

  const modulos = archivos(APP, ['.js', '.jsx']).sort()
  const cargados = new Map()
  for (const ruta of modulos) {
    const nombre = corta(ruta)
    try {
      cargados.set(nombre, await servidor.ssrLoadModule(`/${nombre}`))
      pasadas += 1
    } catch (e) {
      fallos += 1
      console.error(`  x ${nombre}\n      ${e.message.split('\n')[0]}`)
    }
  }
  console.log(`  ${modulos.length} módulos, ${cargados.size} cargados.`)

  /* Un .jsx tiene que exportar algún componente: un renombrado que deja el export
     vacío es el caso real con el que React no montaría nada. Un `memo` es un
     objeto de React, no una función, y también cuenta. */
  const esComponente = (v) => typeof v === 'function' || (typeof v === 'object' && v !== null && typeof v.$$typeof === 'symbol')
  for (const [nombre, mod] of cargados) {
    if (!nombre.endsWith('.jsx')) continue
    const componentes = Object.values(mod).filter(esComponente)
    afirmar(componentes.length > 0, `${nombre} exporta algún componente`, `exports: ${Object.keys(mod).join(', ') || 'ninguno'}`)
  }

  /* --------------------------------------------------------- 2. iconos */
  titulo('2. Todo icono pedido está en el registro')

  const { ICONS } = await servidor.ssrLoadModule('@hrl/core-ui')
  const registro = new Set(ICONS)
  const pedidos = new Map()
  for (const ruta of modulos) {
    for (const m of readFileSync(ruta, 'utf8').matchAll(/['"](sh-[a-z0-9-]+)['"]/g)) {
      if (!pedidos.has(m[1])) pedidos.set(m[1], corta(ruta))
    }
  }
  for (const [nombre, donde] of pedidos) afirmar(registro.has(nombre), `«${nombre}» está en el registro`, `pedido en ${donde}`)
  console.log(`  ${pedidos.size} nombres de icono distintos en uso, ${registro.size} en el registro.`)

  /* ----------------------------------------------------- 3. sin literales */
  titulo('3. Ningún literal de color en la aplicación')

  /* Un `rgb(${…})` armado con valores leídos de los tokens (pintura3d.js, para el
     lienzo del plano) no es un literal: solo cuenta el que lleva números escritos. */
  for (const ruta of modulos) {
    const texto = readFileSync(ruta, 'utf8')
    const literales = [...(texto.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []), ...(texto.match(/rgba?\(\s*\d/g) ?? [])]
    afirmar(literales.length === 0, `${corta(ruta)} usa solo tokens`, literales.join(' '))
  }

  /* ------------------------------------------------- 4. sin punto medio */
  titulo('4. Ningún punto medio como separador en los textos')

  for (const ruta of [...modulos, join(APP, 'estilos.css')]) {
    afirmar(!readFileSync(ruta, 'utf8').includes('·'), `${corta(ruta)} no usa « · »`)
  }

  /* ------------------------------------------ 5. cuentas, menú y pantallas */
  titulo('5. Cada cuenta tiene su menú y ningún módulo queda sin pantalla')

  const { CUENTAS, MODULOS } = await servidor.ssrLoadModule('/src/app/datos/cuentas.js')
  const { PANELES } = await servidor.ssrLoadModule('/src/app/paneles/indice.js')
  const { servicioExiste } = await servidor.ssrLoadModule('/src/app/datos/catalogo.js')

  afirmar(new Set(CUENTAS.map((c) => c.usuario)).size === CUENTAS.length, 'no hay dos cuentas con el mismo usuario')
  afirmar(CUENTAS.every((c) => c.usuario === c.usuario.toLowerCase()), 'los usuarios van en minúsculas (el ingreso no distingue mayúsculas)')
  for (const c of CUENTAS) {
    afirmar(c.modulos.length > 0, `${c.usuario} tiene menú`)
    afirmar(c.modulos[0] === 'mapa', `${c.usuario} abre en Gestión de camas`, c.modulos[0])
    for (const m of c.modulos) afirmar(Boolean(MODULOS[m] && PANELES[m]), `${c.usuario}/${m} tiene módulo y pantalla`)
    for (const s of c.servicios) afirmar(servicioExiste(s), `${c.usuario} opera un servicio del catálogo`, s)
  }
  for (const [id, m] of Object.entries(MODULOS)) {
    afirmar(Boolean(PANELES[id]), `el módulo «${id}» tiene pantalla`)
    afirmar(Boolean(m.label && m.subtitulo && m.grupo), `el módulo «${id}» tiene título, subtítulo y grupo`)
    afirmar(registro.has(m.icono), `el módulo «${id}» usa un icono del registro`, m.icono)
    afirmar(CUENTAS.some((c) => c.modulos.includes(id)), `alguna cuenta usa el módulo «${id}»`)
  }
  for (const id of Object.keys(PANELES)) afirmar(Boolean(MODULOS[id]), `la pantalla «${id}» tiene módulo`)

  /* El README es la única forma de conocer las cuentas desde que el ingreso no las
     lista (el CREDENCIALES.txt de Estadística): no puede faltar ninguna. */
  const readme = readFileSync(join(RAIZ, '..', 'README.md'), 'utf8')
  for (const c of CUENTAS) afirmar(readme.includes(`\`${c.usuario}\``), `el README lista la cuenta «${c.usuario}»`)

  /* -------------------------------------------- 6. ingreso y contraseña */
  titulo('6. El ingreso y el cambio de contraseña')

  const guardado = new Map()
  globalThis.localStorage ??= {
    getItem: (k) => guardado.get(k) ?? null,
    setItem: (k, v) => guardado.set(k, String(v)),
    removeItem: (k) => guardado.delete(k),
  }

  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')

  function render(descripcion, componente, props = {}, envoltura) {
    try {
      const elemento = createElement(componente, props)
      const html = renderToStaticMarkup(envoltura ? envoltura(elemento) : elemento)
      afirmar(html.length > 0, `${descripcion} produce marcado`, `longitud ${html.length}`)
      return html
    } catch (e) {
      fallos += 1
      console.error(`  x ${descripcion} lanzó al renderizar\n      ${e.message.split('\n')[0]}`)
      return ''
    }
  }

  const { Acceso, CambioClave } = await servidor.ssrLoadModule('/src/app/paneles/prototipo/Prototipo.jsx')
  const { default: App } = await servidor.ssrLoadModule('/src/app/App.jsx')

  const ingreso = render('la pantalla de ingreso', Acceso, { onEntrar: () => {} })
  afirmar(ingreso.includes('Egresos Hospitalarios'), 'el ingreso muestra el nombre del sistema')
  afirmar(ingreso.includes('hrl-login'), 'el ingreso es el LoginScreen del kit')
  afirmar(CUENTAS.every((c) => !ingreso.includes(c.usuario)), 'el ingreso no lista las cuentas')
  afirmar(render('la aplicación sin sesión', App).includes('hrl-login'), 'sin sesión, la aplicación abre en el ingreso')

  const obligatorio = render('el cambio obligatorio de contraseña', CambioClave, { obligatorio: true, onListo() {}, onVolver() {} })
  afirmar(obligatorio.includes('mínimo 10 caracteres'), 'el cambio pide el mínimo de la política del servidor (10)')
  afirmar(obligatorio.includes('Salir') && !obligatorio.includes('Volver sin cambiarla'), 'con clave provisional solo se puede salir, no volver')
  const voluntario = render('el cambio de contraseña desde el menú', CambioClave, { obligatorio: false, onListo() {}, onVolver() {} })
  afirmar(voluntario.includes('Volver sin cambiarla'), 'el cambio desde el menú se puede abandonar')

  /* El cliente habla con las rutas de Estadística y lee la marca de cambio
     obligatorio del token. */
  const tienda = await servidor.ssrLoadModule('/src/app/datos/tienda.js')
  const fetchOriginal = globalThis.fetch
  const pedidosApi = []
  const responder = (cuerpo, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo })
  try {
    globalThis.fetch = async (url, opciones) => {
      pedidosApi.push([opciones?.method ?? 'GET', url, opciones?.body ? JSON.parse(opciones.body) : null])
      if (url === '/api/auth/login') {
        return responder({ token: tokenFalso({ sub: 'medicina.b', nom: 'Enfermería Medicina B', cc: true }), tipo: 'Bearer', debe_cambiar_clave: true, usuario: { id: 'medicina.b' } })
      }
      if (url === '/api/auth/cambiar-clave') {
        const { clave_nueva } = JSON.parse(opciones.body)
        if (clave_nueva.length < 10) return responder({ detail: ['Debe tener al menos 10 caracteres.', 'No puede contener su nombre de usuario.'] }, 422)
        return responder({ token: tokenFalso({ sub: 'medicina.b', cc: false }), debe_cambiar_clave: false, usuario: { id: 'medicina.b' } })
      }
      if (url === '/api/demo/entrar-como') return responder({ token: tokenFalso({ sub: 'uci', cc: false }), usuario: { id: 'uci' } })
      return responder({ detail: 'No existe.' }, 404)
    }

    const entrada = await tienda.iniciarSesion('medicina.b', 'clave-provisional')
    afirmar(entrada.cuentaId === 'medicina.b' && entrada.debeCambiarClave === true, 'el ingreso devuelve la cuenta y la marca de cambio obligatorio')
    afirmar(pedidosApi[0][0] === 'POST' && pedidosApi[0][1] === '/api/auth/login', 'el ingreso va a POST /api/auth/login, como en Estadística', pedidosApi[0][1])
    afirmar(tienda.debeCambiarClave(), 'el cliente lee la marca del token (con tildes en el nombre)')
    let error = null
    try {
      await tienda.cambiarClave('clave-provisional', 'corta')
    } catch (e) {
      error = e.message
    }
    afirmar(error?.includes('10 caracteres') && error.includes('nombre de usuario'), 'los problemas de la política se muestran todos juntos', error)
    await tienda.cambiarClave('clave-provisional', 'clave-definitiva-2026')
    afirmar(pedidosApi.at(-1)[2]?.clave_actual === 'clave-provisional', 'el cambio manda clave_actual y clave_nueva')
    afirmar(!tienda.debeCambiarClave(), 'después del cambio, el token ya no pide cambiarla')
    afirmar((await tienda.cambiarCuenta('uci')) === 'uci' && pedidosApi.at(-1)[1] === '/api/demo/entrar-como', 'entrar como otra cuenta es una ruta de la demostración')
    tienda.cerrarSesion()
    afirmar(!tienda.haySesion() && !tienda.debeCambiarClave(), 'cerrar sesión borra el token')
  } finally {
    globalThis.fetch = fetchOriginal
  }
  const fuenteTienda = readFileSync(join(APP, 'datos', 'tienda.js'), 'utf8')
  afirmar(!/['"`]sesion/.test(fuenteTienda), 'no quedan llamadas a las rutas /api/sesion anteriores')

  /* ---------------------------------------- 7. las pantallas renderizan */
  titulo('7. Cada pantalla renderiza con cada cuenta que la tiene')

  const fs = await import('node:fs')
  const plano = JSON.parse(fs.readFileSync(join(APP, 'datos', 'planos', 'medicina-b-piso2.json'), 'utf8'))
  const { crearSemilla, departamentoDe } = await servidor.ssrLoadModule('/src/app/datos/semilla.js')
  const { estadoInicial, maestroDesdePlano } = await servidor.ssrLoadModule('/src/app/dominio/hospitalizacion.js')
  const { ContextoApp } = await servidor.ssrLoadModule('/src/app/paneles/comun.jsx')

  /* La semilla del frontend no trae lo que solo arma el servidor (app/estado.py):
     se completa con su misma forma para que las pantallas vean lo que verían. */
  const comoServidor = (e) => ({
    arranques: Object.fromEntries([...new Set(e.camas.map((c) => c.servicioId))].map((s) => [s, e.arranque])),
    serviciosConVM: ['cuidados-criticos'],
    camasDeBaja: [],
    bloqueos: [],
    indicadoresCerrados: {},
    ajustes: [],
    renoxi: {},
    mesesCerrados: [],
    bitacora: [],
    plano,
    modoDemo: true,
    ...e,
  })
  const escenarios = [
    ['la demostración', comoServidor(crearSemilla(plano))],
    ['la base vacía', comoServidor(estadoInicial(maestroDesdePlano(plano, departamentoDe), '2026-11-14T09:00'))],
  ]

  let pantallas = 0
  for (const [nombre, estado] of escenarios) {
    for (const cuenta of CUENTAS) {
      const conCuenta = (hijo) => createElement(ContextoApp.Provider, { value: { estado, cuenta, hacer: async () => null } }, hijo)
      for (const m of cuenta.modulos) {
        render(`${cuenta.usuario}/${m} con ${nombre}`, PANELES[m], {}, conCuenta)
        pantallas += 1
      }
    }
  }
  console.log(`  ${pantallas} pantallas renderizadas (${CUENTAS.length} cuentas, ${escenarios.length} escenarios).`)

  /* ------------------------------------------- 8. las reglas del dominio */
  titulo('8. Las reglas del dominio (pruebas de node:test)')

  const pruebas = readdirSync(join(RAIZ, 'pruebas')).filter((f) => f.endsWith('.test.mjs')).map((f) => join(RAIZ, 'pruebas', f))
  let corridas = 0
  for await (const evento of run({ files: pruebas })) {
    if (evento.type === 'test:fail' && evento.data.details?.type !== 'suite') {
      corridas += 1
      afirmar(false, `${corta(evento.data.file ?? '')}: ${evento.data.name}`, String(evento.data.details?.error?.cause ?? evento.data.details?.error?.message ?? '').split('\n')[0])
    } else if (evento.type === 'test:pass' && evento.data.details?.type !== 'suite' && evento.data.nesting === 0) {
      corridas += 1
      pasadas += 1
    }
  }
  afirmar(corridas > 0, 'se corrió alguna prueba del dominio')
  console.log(`  ${pruebas.length} archivos, ${corridas} pruebas.`)
} finally {
  await servidor.close()
}

console.log(`\n${fallos === 0 ? 'OK' : 'FALLÓ'}: ${pasadas} comprobaciones pasaron, ${fallos} fallaron.\n`)
process.exit(fallos === 0 ? 0 : 1)
