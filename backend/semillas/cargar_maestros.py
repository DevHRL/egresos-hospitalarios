"""Maestros: se cargan en todos los ambientes y se pueden correr varias veces."""

import json
import subprocess
from pathlib import Path

from sqlalchemy import create_engine, text

from app.config import url_owner, variable
from app.sesion import hash_clave

# UCI vuelve a papel el 2026-11-11: sale del prototipo hasta tener su mapeo físico.
DIGITALES = {"medicina-b", "medicina-intermedios"}
REPORTE_DIRESA = {
    **dict.fromkeys(["medicina", "infectologia", "obstetricia", "pediatria", "cirugia", "ginecologia", "salud-mental", "oncologia"], "hospitalizacion"),
    **dict.fromkeys(["uci-medicina", "uci-cirugia", "uci-pediatria", "uci-neonatologia", "quemados"], "uci"),
    "utin": "utin",
}
FILA_RENOXI = {
    "medicina-a": "hospitalizacion_adultos",
    "medicina-b": "hospitalizacion_adultos",
    "medicina-intermedios": "intermedios",
    "cuidados-criticos": "uci",
    "uci-cirugia": "uci",
    "uci-pediatria": "uci",
}
PARAMETROS = {
    "umbral_estancia_dias": 60,
    "umbral_orden_horas": 24,
    "umbral_traslado_horas": 6,
    "umbral_hc_dias": 3,
    "hora_recojo_censo": "08:00",
    "prestamos_habilitados": False,  # pendiente de definir su política
}


def exportar() -> dict:
    script = Path(__file__).with_name("exportar.mjs")
    salida = subprocess.run(["node", str(script)], capture_output=True, check=True, encoding="utf-8")
    return json.loads(salida.stdout)


def _ejec(conexion, sql: str, **parametros) -> None:
    conexion.execute(text(sql), parametros)


def _estructura(conexion, datos: dict) -> None:
    for d in datos["departamentos"]:
        _ejec(
            conexion,
            """INSERT INTO departamento (id, nombre, en_dotacion, reporte_diresa)
               VALUES (:id, :nombre, :dotacion, :diresa)
               ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, en_dotacion = EXCLUDED.en_dotacion,
                 reporte_diresa = EXCLUDED.reporte_diresa""",
            id=d["id"], nombre=d["nombre"], dotacion=not d.get("fueraDeDotacion", False), diresa=REPORTE_DIRESA.get(d["id"]),
        )
        for s in d["servicios"]:
            _ejec(
                conexion,
                """INSERT INTO servicio (id, departamento_id, nombre, modalidad_captura, fila_renoxi, camas_referencia)
                   VALUES (:id, :dep, :nombre, :modalidad, :fila, :camas)
                   ON CONFLICT (id) DO UPDATE SET departamento_id = EXCLUDED.departamento_id, nombre = EXCLUDED.nombre,
                     modalidad_captura = EXCLUDED.modalidad_captura, fila_renoxi = EXCLUDED.fila_renoxi,
                     camas_referencia = EXCLUDED.camas_referencia""",
                id=s["id"], dep=d["id"], nombre=s["nombre"], modalidad="digital" if s["id"] in DIGITALES else "papel",
                fila=FILA_RENOXI.get(s["id"]), camas=s.get("camas"),
            )


def _plano(conexion, plano: dict) -> None:
    version = plano.get("version", 0)
    if version > 2:
        raise ValueError(f"El plano tiene una versión más nueva que la admitida: {version}")
    for p in plano["pisos"]:
        _ejec(
            conexion,
            """INSERT INTO piso (id, nombre, ancho, alto) VALUES (:id, :nombre, :ancho, :alto)
               ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, ancho = EXCLUDED.ancho, alto = EXCLUDED.alto""",
            id=p["id"], nombre=p["nombre"], ancho=p["ancho"], alto=p["alto"],
        )
    zonas = {z["id"]: z for z in plano["zonas"]}
    for z in plano["zonas"]:
        _ejec(
            conexion,
            """INSERT INTO zona (id, piso_id, tipo, codigo, nombre, servicio_id, x, y, ancho, alto)
               VALUES (:id, :piso, :tipo, :codigo, :nombre, :servicio, :x, :y, :ancho, :alto)
               ON CONFLICT (id) DO UPDATE SET piso_id = EXCLUDED.piso_id, tipo = EXCLUDED.tipo, codigo = EXCLUDED.codigo,
                 nombre = EXCLUDED.nombre, servicio_id = EXCLUDED.servicio_id, x = EXCLUDED.x, y = EXCLUDED.y,
                 ancho = EXCLUDED.ancho, alto = EXCLUDED.alto""",
            id=z["id"], piso=z["pisoId"], tipo=z["tipo"], codigo=z.get("codigo") or "", nombre=z.get("nombre") or "",
            servicio=z.get("servicioId"), x=z["x"], y=z["y"], ancho=z["ancho"], alto=z["alto"],
        )
    for c in plano["camas"]:
        _ejec(
            conexion,
            """INSERT INTO cama (id, zona_id, servicio_id, codigo, tipo, x, y, rotacion, fuera_de_servicio)
               VALUES (:id, :zona, :servicio, :codigo, :tipo, :x, :y, :rotacion, :fuera)
               ON CONFLICT (id) DO UPDATE SET zona_id = EXCLUDED.zona_id, servicio_id = EXCLUDED.servicio_id,
                 codigo = EXCLUDED.codigo, tipo = EXCLUDED.tipo, x = EXCLUDED.x, y = EXCLUDED.y, rotacion = EXCLUDED.rotacion""",
            id=c["id"], zona=c["zonaId"], servicio=c.get("servicioId") or zonas[c["zonaId"]]["servicioId"], codigo=c["codigo"],
            tipo=c["tipo"], x=c["x"], y=c["y"], rotacion=c["rotacion"], fuera=c.get("estado") == "fuera_servicio",
        )
        _ejec(
            conexion,
            """INSERT INTO activo_cama (codigo_interno, tipo, cama_id, estado)
               VALUES (:codigo, :tipo, :cama, 'en_uso') ON CONFLICT (codigo_interno) DO NOTHING""",
            codigo=f"CAM-{c['codigo']}", tipo=c["tipo"], cama=c["id"],
        )


def _cuentas(conexion, datos: dict) -> None:
    _ejec(
        conexion,
        """INSERT INTO cuenta (id, usuario, nombre, rol) VALUES ('sistema', 'sistema', 'Sistema', 'sistema')
           ON CONFLICT (id) DO NOTHING""",
    )
    clave = hash_clave(variable("CLAVE_INICIAL_CUENTAS"))
    for c in datos["cuentas"]:
        _ejec(
            conexion,
            """INSERT INTO cuenta (id, usuario, nombre, rol, clave_hash) VALUES (:id, :usuario, :nombre, :rol, :clave)
               ON CONFLICT (id) DO UPDATE SET usuario = EXCLUDED.usuario, nombre = EXCLUDED.nombre, rol = EXCLUDED.rol""",
            id=c["id"], usuario=c["usuario"], nombre=c["nombre"], rol=c["rol"], clave=clave,
        )
        _ejec(conexion, "DELETE FROM cuenta_servicio WHERE cuenta_id = :id", id=c["id"])
        for servicio in c["servicios"]:
            _ejec(conexion, "INSERT INTO cuenta_servicio (cuenta_id, servicio_id) VALUES (:id, :s)", id=c["id"], s=servicio)
    # Las cuentas que ya no están en la lista quedan inactivas: no se borran porque la
    # bitácora y los movimientos las nombran.
    _ejec(
        conexion,
        "UPDATE cuenta SET activo = (id = 'sistema' OR id = ANY(:ids))",
        ids=[c["id"] for c in datos["cuentas"]],
    )


def _dotacion(conexion, datos: dict) -> None:
    versiones = [
        ("relacion-249", "Relación actualizada (249 camas)", "Relación actualizada", True, "2023-01-01", False),
        ("conteo-fisico-2026", "Conteo físico 2026", "Conteo físico por habitación", False, "2026-01-01", True),
    ]
    for id_version, nombre, documento, oficial, desde, medicina_por_servicio in versiones:
        _ejec(
            conexion,
            """INSERT INTO dotacion_version (id, nombre, documento, oficial, vigente_desde) VALUES (:id, :nombre, :doc, :oficial, :desde)
               ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, documento = EXCLUDED.documento, oficial = EXCLUDED.oficial""",
            id=id_version, nombre=nombre, doc=documento, oficial=oficial, desde=desde,
        )
        _ejec(conexion, "DELETE FROM dotacion_detalle WHERE version_id = :id", id=id_version)
        for d in datos["departamentos"]:
            if d.get("fueraDeDotacion"):
                continue
            if d["id"] == "medicina" and not medicina_por_servicio:
                filas = [(None, 42)]
            elif d["id"] == "salud-mental":
                filas = [(None, d["camas"])]
            else:
                filas = [(s["id"], s["camas"]) for s in d["servicios"]]
            for servicio, camas in filas:
                _ejec(
                    conexion,
                    "INSERT INTO dotacion_detalle (version_id, departamento_id, servicio_id, n_camas) VALUES (:v, :d, :s, :n)",
                    v=id_version, d=d["id"], s=servicio, n=camas,
                )


def _parametros(conexion) -> None:
    for clave, valor in PARAMETROS.items():
        _ejec(
            conexion,
            """INSERT INTO parametro (clave, vigente_desde, valor) VALUES (:clave, DATE '2026-01-01', CAST(:valor AS jsonb))
               ON CONFLICT (clave, vigente_desde) DO NOTHING""",
            clave=clave, valor=json.dumps(valor),
        )


def cargar(conexion, datos: dict | None = None) -> None:
    conexion.execute(text("SELECT set_config('app.cuenta_id', 'sistema', true)"))
    datos = datos or exportar()
    _estructura(conexion, datos)
    for plano in datos["planos"]:
        _plano(conexion, plano)
    _cuentas(conexion, datos)
    _dotacion(conexion, datos)
    _parametros(conexion)


if __name__ == "__main__":
    with create_engine(url_owner()).begin() as c:
        cargar(c)
    print("Maestros cargados.")
