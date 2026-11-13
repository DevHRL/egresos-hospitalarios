"""Historia ficticia para desarrollo y pruebas. Se niega a correr en producción."""

import json

from sqlalchemy import create_engine, text

from app.config import es_demo, url_owner
from app.acciones import guardar_censo
from semillas.cargar_maestros import DIGITALES, cargar as cargar_maestros, exportar

# Servicios con su piso en el sistema: Medicina B e Intermedios, UCI y Quemados.
INCORPORADOS = tuple(sorted(DIGITALES))

TABLAS = (
    "auditoria, bitacora, parametro, renoxi_carga, ajuste_periodo, indicador_mes_cerrado, periodo, dotacion_detalle, dotacion_version, "
    "conteo_unidad_diario, censo_nota, censo_detalle, censo_diario, correccion_movimiento, control_hc, diagnostico_egreso, egreso, "
    "traslado, ocupacion_cama, movimiento, hospitalizacion, orden_hospitalizacion, paciente, cie10, medico, orden_mantenimiento, "
    "activo_cama, bloqueo_cama, cuenta_servicio, cuenta, cama, zona, piso, servicio, departamento"
)


def _exigir_demo() -> None:
    if not es_demo():
        raise RuntimeError("La demostración no se carga en producción.")


def _insertar(conexion, sql: str, **p) -> int:
    return conexion.execute(text(sql), p).scalar_one()


def cargar(conexion, datos: dict | None = None) -> None:
    _exigir_demo()
    conexion.execute(text("SELECT set_config('app.cuenta_id', 'sistema', true)"))
    datos = datos or exportar()
    e = datos["semilla"]

    for m in datos["medicos"]:
        conexion.execute(text("INSERT INTO medico (id, nombre) VALUES (:id, :n) ON CONFLICT DO NOTHING"), {"id": m["value"], "n": m["label"]})
    for c in datos["cie10"]:
        conexion.execute(text("INSERT INTO cie10 (codigo, nombre) VALUES (:c, :n) ON CONFLICT DO NOTHING"), {"c": c["value"], "n": c["label"]})

    conexion.execute(
        text("UPDATE servicio SET fecha_arranque = CAST(:d AS date) WHERE id = ANY(:s)"), {"d": e["arranque"], "s": list(INCORPORADOS)}
    )
    conexion.execute(
        text("""INSERT INTO parametro (clave, vigente_desde, valor) VALUES ('reloj_demo', DATE '2000-01-01', CAST(:v AS jsonb))
                ON CONFLICT (clave, vigente_desde) DO UPDATE SET valor = EXCLUDED.valor"""),
        {"v": json.dumps(e["ahora"])},
    )

    pacientes, ordenes, hospitalizaciones, movimientos = {}, {}, {}, {}
    for p in e["pacientes"]:
        pacientes[p["id"]] = _insertar(
            conexion,
            """INSERT INTO paciente (n_hc, tipo_documento, numero_documento, nombres, sexo, fecha_nacimiento, origen, registrado_en)
               VALUES (:hc, 'dni', :dni, :nombres, :sexo, CAST(:nac AS date), 'local', desde_local(:reg)) RETURNING id""",
            hc=p["hc"], dni=p["dni"], nombres=p["nombres"], sexo=p["sexo"], nac=p["nacimiento"], reg=e["arranque"] + "T00:00",
        )
    for o in e["ordenes"]:
        ordenes[o["id"]] = _insertar(
            conexion,
            """INSERT INTO orden_hospitalizacion (paciente_id, origen, departamento_id, servicio_id, fecha_hora, medico_ordena, diagnostico_ingreso,
                 enviada_por, estado, registrada_por)
               VALUES (:p, :origen, :dep, :s, desde_local(:f), NULLIF(:medico, ''), NULLIF(:dx, ''), NULLIF(:env, ''), :estado, 'sistema') RETURNING id""",
            p=pacientes[o["pacienteId"]], origen=o["origen"], dep=o["departamentoId"], s=o["servicioId"], f=o["fechaHora"], medico=o["medicoOrdena"],
            dx=o["diagnosticoIngreso"], env=o["enviadaPor"], estado=o["estado"],
        )
    for h in e["hospitalizaciones"]:
        hospitalizaciones[h["id"]] = _insertar(
            conexion,
            """INSERT INTO hospitalizacion (paciente_id, orden_id, origen, fecha_ingreso, diagnostico_ingreso, estado)
               VALUES (:p, :o, :origen, desde_local(:f), NULLIF(:dx, ''), :estado) RETURNING id""",
            p=pacientes[h["pacienteId"]], o=ordenes[h["ordenId"]], origen=h["origen"], f=h["fechaIngreso"], dx=h["diagnosticoIngreso"],
            estado="egresada" if h["egreso"] else "abierta",
        )
    # La identidad desempata los movimientos de un mismo minuto: van en orden de seq.
    for m in sorted(e["movimientos"], key=lambda x: x["seq"]):
        movimientos[m["id"]] = _insertar(
            conexion,
            """INSERT INTO movimiento (hospitalizacion_id, tipo, fecha_hora, registrado_en, cuenta_id, cama_id, servicio_id,
                 servicio_origen_id, cama_origen_id, soporte, tipo_egreso)
               VALUES (:h, :tipo, desde_local(:f), desde_local(:r), 'sistema', :cama, :s, :so, :co, :soporte, :te) RETURNING id""",
            h=hospitalizaciones[m["hospitalizacionId"]], tipo=m["tipo"], f=m["fechaHora"], r=m["registradoEn"], cama=m["camaId"], s=m["servicioId"],
            so=m.get("servicioOrigen"), co=m.get("camaOrigen"), soporte=m.get("soporte"), te=m.get("tipoEgreso"),
        )
    for t in e["traslados"]:
        mov = next(
            (movimientos[m["id"]] for m in e["movimientos"]
             if m["hospitalizacionId"] == t["hospitalizacionId"] and m["tipo"] == "traslado" and m["servicioId"] == t["servicioDestino"]),
            None,
        )
        conexion.execute(
            text("""INSERT INTO traslado (hospitalizacion_id, servicio_origen_id, servicio_destino_id, cama_origen_id, solicitado_en,
                      solicitado_por, estado, confirmado_en, confirmado_por, movimiento_id)
                    VALUES (:h, :so, :sd, :co, desde_local(:en), 'sistema', :estado, desde_local(:conf), 'sistema', :mov)"""),
            {"h": hospitalizaciones[t["hospitalizacionId"]], "so": t["servicioOrigen"], "sd": t["servicioDestino"], "co": t["camaOrigen"],
             "en": t["solicitadoEn"], "estado": t["estado"], "conf": t.get("confirmadoEn"), "mov": mov},
        )
    for h in e["hospitalizaciones"]:
        eg = h["egreso"]
        if not eg:
            continue
        mov = next(m for m in e["movimientos"] if m["hospitalizacionId"] == h["id"] and m["tipo"] == "egreso")
        id_egreso = _insertar(
            conexion,
            """INSERT INTO egreso (hospitalizacion_id, movimiento_id, fecha_hora, tipo, condicion, destino, servicio_id, medico_id, estado,
                 completado_en, validado_en)
               VALUES (:h, :m, desde_local(:f), :tipo, :cond, NULLIF(:destino, ''), :s, :med, :estado, desde_local(:comp), desde_local(:val)) RETURNING id""",
            h=hospitalizaciones[h["id"]], m=movimientos[mov["id"]], f=eg["fechaHora"], tipo=eg["tipo"], cond=eg["condicion"], destino=eg["destino"],
            s=eg["servicioId"], med=eg["medicoId"], estado=eg["estado"], comp=eg.get("completadoEn"), val=eg.get("validadoEn"),
        )
        for i, codigo in enumerate(eg.get("cie10") or []):
            conexion.execute(
                text("INSERT INTO diagnostico_egreso (egreso_id, cie10, principal, orden) VALUES (:e, :c, :p, :o)"),
                {"e": id_egreso, "c": codigo, "p": i == 0, "o": i + 1},
            )
        if eg.get("hc"):
            conexion.execute(
                text("INSERT INTO control_hc (egreso_id, estado, recibida_en) VALUES (:e, :estado, desde_local(:r))"),
                {"e": id_egreso, "estado": eg["hc"], "r": eg.get("hcRecibidaEn")},
            )
    for o in e["ordenesCama"]:
        activo = conexion.execute(text("SELECT id FROM activo_cama WHERE cama_id = :c"), {"c": o["camaId"]}).scalar_one()
        conexion.execute(
            text("""INSERT INTO orden_mantenimiento (cama_id, activo_id, falla, reportada_en, reportada_por, estado, con_reemplazo, retirada_en)
                    VALUES (:c, :a, :falla, desde_local(:r), 'sistema', :estado, :reemplazo, desde_local(:ret))"""),
            {"c": o["camaId"], "a": activo, "falla": o["falla"], "r": o["reportadaEn"], "estado": o["estado"], "reemplazo": o["conReemplazo"], "ret": o["retiradaEn"]},
        )
        conexion.execute(
            text("UPDATE activo_cama SET estado = :estado WHERE id = :a"),
            {"a": activo, "estado": "en_mantenimiento" if o["retiradaEn"] else "reportada"},
        )
    for c in e["camas"]:
        if c["fueraDeServicio"]:
            conexion.execute(text("UPDATE cama SET fuera_de_servicio = true WHERE id = :c"), {"c": c["id"]})
    for clave, r in e["censos"].items():
        servicio, dia = clave.split("|")
        guardar_censo(conexion, servicio, dia, r["conteoFisico"], r.get("observacion") or "", r["cerradoEn"], "sistema")
    conexion.execute(text("SELECT refrescar_indicadores()"))


def reiniciar(conexion) -> None:
    """Vuelve la base al punto de partida de la demostración."""
    _exigir_demo()
    datos = exportar()
    conexion.execute(text(f"TRUNCATE {TABLAS} RESTART IDENTITY CASCADE"))
    cargar_maestros(conexion, datos)
    cargar(conexion, datos)


if __name__ == "__main__":
    with create_engine(url_owner()).begin() as c:
        reiniciar(c)
    print("Demostración cargada.")
