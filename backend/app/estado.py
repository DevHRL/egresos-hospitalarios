"""Arma el estado con la forma que consumen las pantallas, leído de la base.

Devuelve la historia completa: sirve para probar el flujo por la interfaz. Antes de
producción hay que limitarlo por periodo y servicio."""

from sqlalchemy import text

from app.config import es_demo

SIN_DATOS_DE_PACIENTE = ("consulta", "ti")


def _todas(conexion, sql: str, **p):
    return conexion.execute(text(sql), p).mappings().all()


def _s(v):
    return None if v is None else str(v)


def _n(v):
    return None if v is None else float(v)


def construir(conexion, cuenta: dict, ahora: str) -> dict:
    servicios = _todas(conexion, """SELECT s.id, s.fecha_arranque, d.reporte_diresa FROM servicio s JOIN departamento d ON d.id = s.departamento_id""")
    arranques = {f["id"]: f["fecha_arranque"].isoformat() for f in servicios if f["fecha_arranque"]}
    ids_activas = _todas(
        conexion,
        """SELECT c.id, c.codigo, c.tipo, c.zona_id, z.codigo AS habitacion, c.servicio_id, c.fuera_de_servicio, c.x, c.y, c.rotacion,
             (SELECT a.codigo_interno FROM activo_cama a WHERE a.cama_id = c.id LIMIT 1) AS activo,
             b.motivo AS bloqueo_motivo, texto_local(b.desde) AS bloqueo_desde
           FROM cama c JOIN zona z ON z.id = c.zona_id
           LEFT JOIN bloqueo_cama b ON b.cama_id = c.id AND b.hasta IS NULL
           WHERE c.activa ORDER BY c.codigo""",
    )
    # Las camas de baja siguen en la lista para que la historia pueda nombrarlas.
    de_baja = _todas(
        conexion,
        """SELECT c.id, c.codigo, c.tipo, c.zona_id, z.codigo AS habitacion, c.servicio_id FROM cama c JOIN zona z ON z.id = c.zona_id WHERE NOT c.activa""",
    )
    camas = [
        {
            "id": c["id"], "codigo": c["codigo"], "tipo": c["tipo"], "zonaId": c["zona_id"], "habitacion": c["habitacion"],
            "servicioId": c["servicio_id"], "activo": c["activo"] or "—",
            "bloqueo": {"motivo": c["bloqueo_motivo"], "desde": c["bloqueo_desde"]} if c["bloqueo_motivo"] else None,
            "fueraDeServicio": c["fuera_de_servicio"],
        }
        for c in ids_activas
    ]
    baja = [
        {"id": c["id"], "codigo": c["codigo"], "tipo": c["tipo"], "zonaId": c["zona_id"], "habitacion": c["habitacion"], "servicioId": c["servicio_id"]}
        for c in de_baja
    ]
    restringida = cuenta["rol"] in SIN_DATOS_DE_PACIENTE

    pacientes = [] if restringida else [
        {
            "id": _s(p["id"]), "hc": p["n_hc"], "dni": p["numero_documento"] or "", "tipoDocumento": p["tipo_documento"], "nombres": p["nombres"],
            "sexo": p["sexo"], "nacimiento": p["fecha_nacimiento"].isoformat() if p["fecha_nacimiento"] else "",
        }
        for p in _todas(conexion, "SELECT * FROM paciente WHERE fusionado_en_id IS NULL ORDER BY id")
    ]

    ordenes = [] if restringida else [
        {
            "id": _s(o["id"]), "pacienteId": _s(o["paciente_id"]), "origen": o["origen"], "servicioId": o["servicio_id"],
            "servicioProcedencia": o["servicio_procedencia_id"], "fechaHora": o["fecha"], "medicoOrdena": o["medico_ordena"] or "",
            "diagnosticoIngreso": o["diagnostico_ingreso"] or "", "enviadaPor": o["enviada_por"] or "", "estado": o["estado"],
            "motivoAnulacion": o["motivo_anulacion"], "hospitalizacionId": _s(o["hosp"]),
        }
        for o in _todas(
            conexion,
            """SELECT o.*, texto_local(o.fecha_hora) AS fecha,
                 (SELECT h.id FROM hospitalizacion h WHERE h.orden_id = o.id AND h.estado <> 'anulada' LIMIT 1) AS hosp
               FROM orden_hospitalizacion o ORDER BY o.id""",
        )
    ]

    egresos = {}
    for e in _todas(
        conexion,
        """SELECT e.*, texto_local(e.fecha_hora) AS fecha, texto_local(e.alta_medica_en) AS alta, texto_local(e.completado_en) AS completado,
             texto_local(e.validado_en) AS validado, ch.estado AS hc, texto_local(ch.recibida_en) AS recibida,
             (SELECT array_agg(d.cie10 ORDER BY d.orden) FROM diagnostico_egreso d WHERE d.egreso_id = e.id) AS cie
           FROM egreso e LEFT JOIN control_hc ch ON ch.egreso_id = e.id WHERE NOT e.anulado""",
    ):
        egresos[e["hospitalizacion_id"]] = {
            "fechaHora": e["fecha"], "altaMedica": e["alta"], "tipo": e["tipo"], "condicion": e["condicion"], "destino": e["destino"] or "",
            "servicioId": e["servicio_id"], "medicoId": e["medico_id"], "cie10": [] if restringida else list(e["cie"] or []), "estado": e["estado"],
            "hc": e["hc"], "hcRecibidaEn": e["recibida"], "motivoObservacion": e["motivo_observacion"], "completadoEn": e["completado"], "validadoEn": e["validado"],
        }

    hospitalizaciones = [
        {
            "id": _s(h["id"]), "pacienteId": None if restringida else _s(h["paciente_id"]), "ordenId": _s(h["orden_id"]), "origen": h["origen"],
            "fechaIngreso": h["fecha"], "fechaIngresoEstimada": h["fecha_ingreso_estimada"], "ingresoPrevio": h["ingreso_previo_sistema"],
            "diagnosticoIngreso": "" if restringida else h["diagnostico_ingreso"] or "", "egreso": egresos.get(h["id"]), "anulada": h["estado"] == "anulada",
        }
        for h in _todas(conexion, "SELECT h.*, texto_local(h.fecha_ingreso) AS fecha FROM hospitalizacion h ORDER BY h.id")
    ]

    movimientos = [
        {
            "id": _s(m["id"]), "seq": m["id"], "hospitalizacionId": _s(m["hospitalizacion_id"]), "tipo": m["tipo"], "fechaHora": m["fecha"], "registradoEn": m["registro"],
            "cuenta": m["cuenta_id"], "camaId": m["cama_id"], "servicioId": m["servicio_id"], "servicioOrigen": m["servicio_origen_id"], "camaOrigen": m["cama_origen_id"],
            "soporte": m["soporte"], "tipoEgreso": m["tipo_egreso"], "anulado": m["anulado"], "motivoAnulacion": m["motivo_anulacion"],
        }
        for m in _todas(conexion, "SELECT m.*, texto_local(m.fecha_hora) AS fecha, texto_local(m.registrado_en) AS registro FROM movimiento m ORDER BY m.id")
    ]

    traslados = [
        {
            "id": _s(t["id"]), "hospitalizacionId": _s(t["hospitalizacion_id"]), "servicioOrigen": t["servicio_origen_id"], "servicioDestino": t["servicio_destino_id"],
            "camaOrigen": t["cama_origen_id"], "solicitadoEn": t["solicitado"], "estado": t["estado"], "confirmadoEn": t["confirmado"],
        }
        for t in _todas(conexion, "SELECT t.*, texto_local(t.solicitado_en) AS solicitado, texto_local(t.confirmado_en) AS confirmado FROM traslado t ORDER BY t.id")
    ]

    ordenes_cama = [
        {
            "id": _s(o["id"]), "camaId": o["cama_id"], "activo": o["activo"], "falla": o["falla"], "reportadaEn": o["reportada"], "estado": o["estado"],
            "conReemplazo": o["con_reemplazo"], "retiradaEn": o["retirada"], "diagnostico": o["diagnostico"], "resultado": o["resultado"],
            "resueltaEn": o["resuelta"], "entregadaEn": o["entregada"], "recibidaEn": o["recibida"],
        }
        for o in _todas(
            conexion,
            """SELECT o.*, a.codigo_interno AS activo, texto_local(o.reportada_en) AS reportada, texto_local(o.retirada_en) AS retirada,
                 texto_local(o.resuelta_en) AS resuelta, texto_local(o.entregada_en) AS entregada, texto_local(o.recibida_en) AS recibida
               FROM orden_mantenimiento o JOIN activo_cama a ON a.id = o.activo_id ORDER BY o.id""",
        )
    ]

    bloqueos = [
        {"camaId": b["cama_id"], "desde": b["inicio"], "hasta": b["fin"]}
        for b in _todas(conexion, "SELECT cama_id, texto_local(desde) AS inicio, texto_local(hasta) AS fin FROM bloqueo_cama")
    ]

    notas: dict[int, dict] = {}
    for n in _todas(conexion, "SELECT * FROM censo_nota"):
        notas.setdefault(n["censo_id"], {})[_s(n["hospitalizacion_id"])] = n["nota"]
    censos = {}
    for c in _todas(conexion, "SELECT c.*, texto_local(c.cerrado_en) AS cerrado FROM censo_diario c"):
        censos[f"{c['servicio_id']}|{c['fecha'].isoformat()}"] = {
            "estado": c["estado"], "conteoFisico": c["conteo_fisico"], "observacion": c["observacion"] or "", "cerradoEn": c["cerrado"], "cerradoPor": c["cerrado_por"],
            "motivoReapertura": c["motivo_reapertura"], "notas": notas.get(c["id"], {}),
        }

    renoxi = {
        r["dia"].isoformat(): {"cargadoEn": r["cargado"], "cuenta": r["cuenta_id"]}
        for r in _todas(conexion, "SELECT dia, texto_local(cargado_en) AS cargado, cuenta_id FROM renoxi_carga")
    }
    meses = [m["mes"].strftime("%Y-%m") for m in _todas(conexion, "SELECT mes FROM periodo WHERE estado = 'cerrado' ORDER BY mes")]
    indicadores_cerrados: dict[str, list] = {}
    for f in _todas(conexion, "SELECT * FROM indicador_mes_cerrado WHERE base = 'mapeo' ORDER BY mes, servicio_id"):
        indicadores_cerrados.setdefault(f["mes"].strftime("%Y-%m"), []).append(
            {"servicioId": f["servicio_id"], "A": f["a"], "B": f["b"], "C": f["c"], "D": f["d"], "E": f["e"], "Cf": f["c_f"], "Ef": f["e_f"], "F": _n(f["f"]), "G": _n(f["g"]), "H": _n(f["h"]), "I": _n(f["i"]), "diasConCenso": f["dias_con_censo"]}
        )
    ajustes = [
        {"id": _s(a["id"]), "mes": a["mes"].strftime("%Y-%m"), "servicioId": a["servicio_id"], "variable": a["variable"], "valorCorregido": _n(a["valor_corregido"]), "motivo": a["motivo"], "fecha": a["fecha"], "cuenta": a["cuenta_id"]}
        for a in _todas(conexion, "SELECT a.*, texto_local(a.registrado_en) AS fecha FROM ajuste_periodo a ORDER BY a.id")
    ]
    bitacora = [
        {"id": _s(b["id"]), "fecha": b["fecha"], "cuenta": b["cuenta_id"], "accion": b["descripcion"], "detalle": b["detalle"]}
        for b in _todas(conexion, "SELECT id, texto_local(fecha_hora) AS fecha, cuenta_id, descripcion, detalle FROM bitacora ORDER BY fecha_hora DESC, id DESC LIMIT 500")
    ]

    pisos = _todas(conexion, "SELECT * FROM piso WHERE activo ORDER BY id")
    zonas = _todas(conexion, "SELECT * FROM zona WHERE activo ORDER BY id")
    plano = {
        "version": 2,
        "nombre": "Plano de camas",
        "pisos": [{"id": p["id"], "nombre": p["nombre"], "ancho": _n(p["ancho"]), "alto": _n(p["alto"])} for p in pisos],
        "zonas": [
            {"id": z["id"], "pisoId": z["piso_id"], "tipo": z["tipo"], "codigo": z["codigo"], "nombre": z["nombre"], "servicioId": z["servicio_id"], "x": _n(z["x"]), "y": _n(z["y"]), "ancho": _n(z["ancho"]), "alto": _n(z["alto"])}
            for z in zonas
        ],
        "camas": [
            {"id": c["id"], "zonaId": c["zona_id"], "codigo": c["codigo"], "tipo": c["tipo"], "estado": "fuera_servicio" if c["fuera_de_servicio"] else "operativa", "servicioId": c["servicio_id"], "x": _n(c["x"]), "y": _n(c["y"]), "rotacion": c["rotacion"]}
            for c in ids_activas
        ],
    }

    return {
        "version": 1,
        "ahora": ahora,
        "arranque": min(arranques.values()) if arranques else ahora[:10],
        "arranques": arranques,
        "serviciosConVM": [f["id"] for f in servicios if f["reporte_diresa"] == "uci"],
        "camas": camas,
        "camasDeBaja": baja,
        "pacientes": pacientes,
        "ordenes": ordenes,
        "hospitalizaciones": hospitalizaciones,
        "movimientos": movimientos,
        "traslados": traslados,
        "ordenesCama": ordenes_cama,
        "bloqueos": bloqueos,
        "censos": censos,
        "renoxi": renoxi,
        "mesesCerrados": meses,
        "indicadoresCerrados": indicadores_cerrados,
        "ajustes": ajustes,
        "bitacora": bitacora,
        "plano": plano,
        "modoDemo": es_demo(),
    }
