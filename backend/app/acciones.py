"""Toda modificación del flujo es una acción: valida reglas y permisos, escribe en
una transacción y deja rastro. Es la contraparte en servidor de
`frontend/src/app/dominio/hospitalizacion.js`; la base garantiza además lo crítico."""

import json
import re

from sqlalchemy import text

from app.tiempo import bloqueo_del_dia, corte_del_dia, dia_de, dias_entre, es_fecha_hora, mes_de, sumar_dias


class ErrorRegla(Exception):
    pass


def falla(mensaje: str):
    raise ErrorRegla(mensaje)


SISTEMA = {"id": "sistema", "rol": "sistema", "servicios": []}
# Desde el 2026-11-11: el piso controla a su paciente; Estadística ya no
# registra movimientos por él. La cuenta del departamento solo designa camas; en
# un departamento sin esa cuenta (UCI, Quemados) designa la enfermería de la
# unidad (2026-11-12, decisión 0008).
ENFERMERIA = ("enfermeria",)
CENSO = ("enfermeria", "jefatura")
ESTADISTICA = ("tecnico", "jefatura")
TRASLADO_NO_INCORPORADO = "traslado_no_incorporado"
ORIGENES = ("consulta_externa", "emergencia", "referencia", "otro_servicio")

PERMISOS = {
    "orden/registrar": ("admision",),
    "orden/anular": ("admision",),
    "ingreso/confirmar": ("departamento", "enfermeria"),
    "ingreso/previo": ENFERMERIA,
    "ingreso/corregir": ESTADISTICA,
    "traslado/registrar": ENFERMERIA,
    "traslado/confirmar": ENFERMERIA,
    "traslado/cancelar": ENFERMERIA,
    "soporte/cambiar": ENFERMERIA,
    "egreso/registrar": ENFERMERIA,
    "movimiento/anular": ENFERMERIA,
    "cama/bloquear": ("enfermeria",),
    "cama/desbloquear": ("enfermeria",),
    "falla/reportar": ("enfermeria",),
    "mant/recibir": ("enfermeria",),
    "mant/retirar": ("mantenimiento",),
    "mant/resolver": ("mantenimiento",),
    "mant/entregar": ("mantenimiento",),
    "censo/cerrar": CENSO,
    "censo/nota": CENSO,
    "censo/reabrir": ("jefatura",),
    "hc/recibir": ESTADISTICA,
    "hc/devolver": ESTADISTICA,
    "egreso/completar": ESTADISTICA,
    "egreso/validar": ESTADISTICA,
    "egreso/observar": ESTADISTICA,
    "mes/cerrar": ("jefatura",),
    "mes/ajustar": ("jefatura",),
    "renoxi/marcar": ("camas", "jefatura"),
}

DESCRIPCION = {
    "orden/registrar": "Registró una orden de hospitalización",
    "orden/anular": "Anuló una orden de hospitalización",
    "ingreso/confirmar": "Designó habitación y cama",
    "ingreso/previo": "Registró un paciente del censo inicial",
    "ingreso/corregir": "Corrigió la fecha de ingreso",
    "traslado/registrar": "Registró un traslado",
    "traslado/confirmar": "Confirmó la llegada de un traslado",
    "traslado/cancelar": "Canceló un traslado",
    "soporte/cambiar": "Cambió el soporte",
    "egreso/registrar": "Registró un egreso",
    "movimiento/anular": "Anuló un movimiento",
    "cama/bloquear": "Bloqueó una cama",
    "cama/desbloquear": "Desbloqueó una cama",
    "falla/reportar": "Reportó una cama con falla",
    "mant/retirar": "Confirmó el retiro de una cama",
    "mant/resolver": "Registró el resultado de la reparación",
    "mant/entregar": "Entregó una cama al servicio",
    "mant/recibir": "Confirmó la recepción de una cama",
    "censo/cerrar": "Cerró un censo",
    "censo/nota": "Escribió una observación en el censo",
    "censo/reabrir": "Reabrió un censo",
    "hc/recibir": "Recibió una HC física",
    "hc/devolver": "Devolvió una HC a archivo",
    "egreso/completar": "Completó un egreso desde la HC",
    "egreso/validar": "Validó un egreso",
    "egreso/observar": "Observó un egreso",
    "mes/cerrar": "Cerró un mes",
    "mes/ajustar": "Registró un ajuste de un mes cerrado",
    "renoxi/marcar": "Marcó RENOXI como cargado",
}


def texto_de(v) -> str:
    return (v or "").strip() if isinstance(v, str) else ""


def id_de(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


class Ctx:
    def __init__(self, conexion, cuenta: dict, ahora: str):
        self.conexion = conexion
        self.cuenta = cuenta
        self.ahora = ahora

    def uno(self, sql: str, **p):
        return self.conexion.execute(text(sql), p).mappings().first()

    def todos(self, sql: str, **p):
        return self.conexion.execute(text(sql), p).mappings().all()

    def valor(self, sql: str, **p):
        return self.conexion.execute(text(sql), p).scalar()

    def ejec(self, sql: str, **p) -> None:
        self.conexion.execute(text(sql), p)

    # ── Comprobaciones ─────────────────────────────────────────────────

    def asegurar_servicio(self, servicio: str) -> None:
        if self.cuenta["rol"] in ("enfermeria", "departamento") and servicio not in self.cuenta["servicios"]:
            falla("Esta cuenta solo opera las camas de su servicio.")

    def asegurar_designa(self, departamento: str) -> None:
        """La cuenta del departamento designa en el suyo; la enfermería de una unidad,
        solo si su departamento no tiene esa cuenta. Igual que `designa` en
        frontend/src/app/datos/cuentas.js."""
        if self.cuenta["rol"] == "sistema":
            return
        propios = self.valor(
            "SELECT EXISTS (SELECT 1 FROM servicio WHERE departamento_id = :d AND id = ANY(:s))",
            d=departamento, s=list(self.cuenta["servicios"]),
        )
        if self.cuenta["rol"] == "enfermeria" and propios:
            propios = not self.valor(
                """SELECT EXISTS (SELECT 1 FROM cuenta c JOIN cuenta_servicio cs ON cs.cuenta_id = c.id
                     JOIN servicio s ON s.id = cs.servicio_id
                     WHERE c.activo AND c.rol = 'departamento' AND s.departamento_id = :d)""",
                d=departamento,
            )
        if not propios:
            falla("En ese departamento la cama la designa la cuenta del departamento.")

    def asegurar_fecha(self, f) -> None:
        if not es_fecha_hora(f):
            falla("Escribe la fecha y la hora completas (HH:mm).")
        if f > self.ahora:
            falla("La hora del movimiento no puede ser futura.")

    def arranque(self, servicio: str) -> str:
        d = self.valor("SELECT fecha_arranque FROM servicio WHERE id = :s", s=servicio)
        if d is None:
            falla("Ese servicio todavía no está incorporado al sistema.")
        return d.isoformat()

    def registro_censo(self, servicio: str, dia: str):
        return self.uno("SELECT * FROM censo_diario WHERE servicio_id = :s AND fecha = CAST(:d AS date)", s=servicio, d=dia)

    def censo_editable(self, servicio: str, dia: str) -> bool:
        r = self.registro_censo(servicio, dia)
        if r and r["estado"] == "cerrado":
            return False
        if r and r["estado"] == "reabierto":
            return True
        return self.ahora < bloqueo_del_dia(dia)

    def asegurar_editable(self, servicio: str, f) -> None:
        self.asegurar_fecha(f)
        if f < f"{self.arranque(servicio)}T00:00":
            falla("La fecha es anterior al arranque del sistema.")
        if not self.censo_editable(servicio, dia_de(f)):
            falla("El censo de ese día ya se cerró o se recogió. Solo Estadística puede reabrirlo.")

    def cama(self, cama_id):
        if not cama_id:
            return None
        return self.uno(
            """SELECT c.*, EXISTS (SELECT 1 FROM bloqueo_cama b WHERE b.cama_id = c.id AND b.hasta IS NULL) AS bloqueada
               FROM cama c WHERE c.id = :c AND c.activa""",
            c=cama_id,
        )

    def ocupada(self, cama_id: str) -> bool:
        return bool(self.valor("SELECT EXISTS (SELECT 1 FROM ocupacion_cama WHERE cama_id = :c AND hasta IS NULL)", c=cama_id))

    def asegurar_cama_lista(self, cama) -> None:
        if cama["fuera_de_servicio"]:
            falla(f"La cama {cama['codigo']} está fuera de servicio.")
        if cama["bloqueada"]:
            falla(f"La cama {cama['codigo']} está bloqueada.")
        if self.ocupada(cama["id"]):
            falla(f"La cama {cama['codigo']} está ocupada.")

    def asegurar_cama_del_servicio(self, cama, servicio: str, mensaje: str) -> None:
        if cama["servicio_id"] == servicio:
            return
        permitido = self.valor(
            "SELECT valor FROM parametro WHERE clave = 'prestamos_habilitados' ORDER BY vigente_desde DESC LIMIT 1"
        )
        if not permitido:
            falla(mensaje)

    def hospitalizacion_abierta(self, h_id):
        h = self.uno("SELECT * FROM hospitalizacion WHERE id = :h", h=id_de(h_id))
        if not h or h["estado"] != "abierta":
            falla("La hospitalización ya no está abierta.")
        return h

    def posicion(self, h_id: int):
        return self.uno("SELECT * FROM v_ocupacion_actual WHERE hospitalizacion_id = :h", h=h_id)

    def traslado_pendiente(self, h_id: int):
        return self.uno("SELECT * FROM traslado WHERE hospitalizacion_id = :h AND estado = 'pendiente'", h=h_id)

    def asegurar_orden(self, h_id: int, f: str) -> None:
        ultimo = self.valor(
            "SELECT max(texto_local(fecha_hora)) FROM movimiento WHERE hospitalizacion_id = :h AND NOT anulado", h=h_id
        )
        if ultimo and f < ultimo:
            falla("La hora es anterior al último movimiento del paciente.")

    def agregar_movimiento(self, h_id: int, tipo: str, f: str, cama: str, servicio: str, **extra) -> int:
        return self.valor(
            """INSERT INTO movimiento (hospitalizacion_id, tipo, fecha_hora, registrado_en, cuenta_id, cama_id, servicio_id,
                 servicio_origen_id, cama_origen_id, soporte, tipo_egreso)
               VALUES (:h, :tipo, desde_local(:f), desde_local(:ahora), :cuenta, :cama, :servicio, :so, :co, :soporte, :te)
               RETURNING id""",
            h=h_id, tipo=tipo, f=f, ahora=self.ahora, cuenta=self.cuenta["id"], cama=cama, servicio=servicio,
            so=extra.get("servicio_origen"), co=extra.get("cama_origen"), soporte=extra.get("soporte"), te=extra.get("tipo_egreso"),
        )

    def servicios_con_camas(self) -> list[str]:
        return [
            f["id"]
            for f in self.todos(
                "SELECT DISTINCT s.id FROM servicio s JOIN cama c ON c.servicio_id = s.id AND c.activa WHERE s.fecha_arranque IS NOT NULL ORDER BY 1"
            )
        ]

    def departamentos_con_camas(self) -> list[str]:
        return [
            f["id"]
            for f in self.todos(
                """SELECT DISTINCT s.departamento_id AS id FROM servicio s JOIN cama c ON c.servicio_id = s.id AND c.activa
                   WHERE s.fecha_arranque IS NOT NULL ORDER BY 1"""
            )
        ]

    def egreso_de(self, h_id):
        return self.uno(
            """SELECT e.*, p.sexo, p.fecha_nacimiento, p.n_hc, texto_local(e.fecha_hora) AS fecha_texto
               FROM egreso e JOIN hospitalizacion h ON h.id = e.hospitalizacion_id JOIN paciente p ON p.id = h.paciente_id
               WHERE e.hospitalizacion_id = :h AND NOT e.anulado""",
            h=id_de(h_id),
        )


# ── Pacientes ──────────────────────────────────────────────────────────


def _paciente_nuevo(c: Ctx, p: dict) -> int:
    hc = texto_de(p.get("hc"))
    tipo = p.get("tipoDocumento") or "dni"
    numero = texto_de(p.get("dni"))
    nombres = texto_de(p.get("nombres"))
    nacimiento = p.get("nacimiento") or None
    if not re.fullmatch(r"\d{4,10}", hc):
        falla("El N° de HC debe tener solo números.")
    if tipo not in ("dni", "ce", "pasaporte", "sin_documento"):
        falla("Elige el tipo de documento.")
    if tipo == "dni" and not re.fullmatch(r"\d{8}", numero):
        falla("El DNI debe tener 8 dígitos.")
    if tipo in ("ce", "pasaporte") and not numero:
        falla("Escribe el número de documento.")
    if not nombres:
        falla("Escribe los nombres del paciente.")
    if p.get("sexo") not in ("F", "M"):
        falla("Indica el sexo del paciente.")
    if nacimiento and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", nacimiento):
        falla("Indica la fecha de nacimiento.")
    if tipo != "sin_documento" and not nacimiento:
        falla("Indica la fecha de nacimiento.")
    numero = None if tipo == "sin_documento" else numero
    repetido = c.valor(
        """SELECT EXISTS (SELECT 1 FROM paciente WHERE n_hc = :hc
             OR (CAST(:numero AS text) IS NOT NULL AND tipo_documento = :tipo AND numero_documento = :numero))""",
        hc=hc, tipo=tipo, numero=numero,
    )
    if repetido:
        falla("Ya existe un paciente con esa HC o ese documento. Búscalo en el padrón.")
    madre = None
    if texto_de(p.get("hcMadre")):
        madre = c.valor("SELECT id FROM paciente WHERE n_hc = :hc", hc=texto_de(p["hcMadre"]))
        if not madre:
            falla("No se encontró la HC de la madre en el padrón.")
    return c.valor(
        """INSERT INTO paciente (n_hc, tipo_documento, numero_documento, nombres, sexo, fecha_nacimiento, origen, madre_id, registrado_en)
           VALUES (:hc, :tipo, :numero, :nombres, :sexo, CAST(:nac AS date), 'local', :madre, desde_local(:ahora)) RETURNING id""",
        hc=hc, tipo=tipo, numero=numero, nombres=nombres, sexo=p["sexo"], nac=nacimiento, madre=madre, ahora=c.ahora,
    )


def _paciente_de(c: Ctx, d: dict) -> int:
    if d.get("pacienteId"):
        p = c.valor("SELECT id FROM paciente WHERE id = :p", p=id_de(d["pacienteId"]))
        if p:
            return p
    return _paciente_nuevo(c, d.get("paciente") or {})


def _sin_hospitalizacion_abierta(c: Ctx, paciente: int) -> None:
    if c.valor("SELECT EXISTS (SELECT 1 FROM hospitalizacion WHERE paciente_id = :p AND estado = 'abierta')", p=paciente):
        falla("Ese paciente ya está hospitalizado.")


# ── Órdenes e ingreso ──────────────────────────────────────────────────


def orden_registrar(c: Ctx, d: dict) -> str:
    """Admisión envía al paciente a un departamento; la cama la designa el departamento."""
    if d.get("departamentoId") not in c.departamentos_con_camas():
        falla("Elige el departamento de hospitalización.")
    if d.get("origen") not in ORIGENES:
        falla("Indica por dónde llega el paciente.")
    if d["origen"] == "emergencia" and not texto_de(d.get("enviadaPor")):
        falla("Indica qué enfermera de emergencia envió la orden.")
    procedencia = d.get("servicioProcedencia") or None
    if d["origen"] == "otro_servicio" and not procedencia:
        falla("Indica de qué servicio viene el paciente.")
    paciente = _paciente_de(c, d)
    if c.valor("SELECT EXISTS (SELECT 1 FROM orden_hospitalizacion WHERE paciente_id = :p AND estado = 'pendiente')", p=paciente):
        falla("Ese paciente ya tiene una orden de hospitalización pendiente.")
    _sin_hospitalizacion_abierta(c, paciente)
    c.ejec(
        """INSERT INTO orden_hospitalizacion (paciente_id, origen, departamento_id, servicio_procedencia_id, fecha_hora, medico_ordena,
             diagnostico_ingreso, enviada_por, estado, registrada_por)
           VALUES (:p, :origen, :dep, :proc, desde_local(:ahora), NULLIF(:medico, ''), NULLIF(:dx, ''), NULLIF(:env, ''), 'pendiente', :cuenta)""",
        p=paciente, origen=d["origen"], dep=d["departamentoId"], proc=procedencia if d["origen"] == "otro_servicio" else None, ahora=c.ahora,
        medico=texto_de(d.get("medicoOrdena")), dx=texto_de(d.get("diagnosticoIngreso")), env=texto_de(d.get("enviadaPor")), cuenta=c.cuenta["id"],
    )
    hc = c.valor("SELECT n_hc FROM paciente WHERE id = :p", p=paciente)
    return f"HC {hc} a {d['departamentoId']}"


def orden_anular(c: Ctx, d: dict) -> str:
    o = c.uno("SELECT * FROM orden_hospitalizacion WHERE id = :o", o=id_de(d.get("ordenId")))
    if not o or o["estado"] != "pendiente":
        falla("Solo se anula una orden pendiente.")
    motivo = texto_de(d.get("motivo"))
    if not motivo:
        falla("Escribe el motivo de la anulación.")
    c.ejec("UPDATE orden_hospitalizacion SET estado = 'anulada', motivo_anulacion = :m WHERE id = :o", m=motivo, o=o["id"])
    return motivo


def ingreso_confirmar(c: Ctx, d: dict) -> str:
    """Quien designa (el departamento o, si no tiene cuenta, la unidad) elige habitación
    y cama. La cama define el área y desde ese momento el piso controla al paciente."""
    o = c.uno(
        "SELECT *, texto_local(fecha_hora) AS fecha_texto FROM orden_hospitalizacion WHERE id = :o",
        o=id_de(d.get("ordenId")),
    )
    if not o or o["estado"] != "pendiente":
        falla("La orden ya no está pendiente.")
    c.asegurar_designa(o["departamento_id"])
    cama = c.cama(d.get("camaId"))
    if not cama:
        falla("Elige la habitación y la cama.")
    servicio = cama["servicio_id"]
    if c.valor("SELECT departamento_id FROM servicio WHERE id = :s", s=servicio) != o["departamento_id"]:
        falla("La cama debe ser del departamento al que Admisión envió al paciente.")
    c.asegurar_servicio(servicio)
    c.arranque(servicio)
    f = d.get("fechaHora")
    c.asegurar_editable(servicio, f)
    if f < o["fecha_texto"]:
        falla("La hora de ingreso no puede ser anterior a la orden de Admisión.")
    c.asegurar_cama_lista(cama)
    h = c.valor(
        """INSERT INTO hospitalizacion (paciente_id, orden_id, origen, fecha_ingreso, diagnostico_ingreso)
           VALUES (:p, :o, :origen, desde_local(:f), :dx) RETURNING id""",
        p=o["paciente_id"], o=o["id"], origen=o["origen"], f=f, dx=o["diagnostico_ingreso"],
    )
    c.ejec("UPDATE orden_hospitalizacion SET estado = 'ingresada', servicio_id = :s WHERE id = :o", s=servicio, o=o["id"])
    c.agregar_movimiento(h, "ingreso", f, cama["id"], servicio)
    return f"Cama {cama['codigo']} en {servicio}"


def ingreso_previo(c: Ctx, d: dict) -> str:
    """Censo inicial: el paciente ya estaba hospitalizado cuando arrancó el servicio."""
    cama = c.cama(d.get("camaId"))
    if not cama:
        falla("Elige la cama.")
    servicio = cama["servicio_id"]
    c.asegurar_servicio(servicio)
    arranque = c.arranque(servicio)
    if not c.censo_editable(servicio, arranque):
        falla("El censo inicial solo se registra el día de arranque del servicio.")
    c.asegurar_cama_lista(cama)
    f = d.get("fechaHora") or None
    estimada = f is None
    if estimada:
        # Justo antes del arranque: cuenta como saldo anterior, no como ingreso del día.
        f = f"{sumar_dias(arranque, -1)}T23:59"
    else:
        c.asegurar_fecha(f)
    paciente = _paciente_de(c, d)
    _sin_hospitalizacion_abierta(c, paciente)
    h = c.valor(
        """INSERT INTO hospitalizacion (paciente_id, origen, fecha_ingreso, diagnostico_ingreso, ingreso_previo_sistema, fecha_ingreso_estimada)
           VALUES (:p, 'previo_sistema', desde_local(:f), NULLIF(:dx, ''), true, :estimada) RETURNING id""",
        p=paciente, f=f, dx=texto_de(d.get("diagnosticoIngreso")), estimada=estimada,
    )
    c.agregar_movimiento(h, "ingreso", f, cama["id"], servicio)
    return f"Cama {cama['codigo']}{' (fecha estimada)' if estimada else ''}"


def ingreso_corregir(c: Ctx, d: dict) -> str:
    h = c.uno("SELECT * FROM hospitalizacion WHERE id = :h AND estado <> 'anulada'", h=id_de(d.get("hospitalizacionId")))
    if not h:
        falla("La hospitalización ya no está vigente.")
    motivo = texto_de(d.get("motivo"))
    if not motivo:
        falla("Escribe el motivo de la corrección.")
    f = d.get("fechaHora")
    c.asegurar_fecha(f)
    m = c.uno(
        """SELECT *, texto_local(fecha_hora) AS fecha_texto FROM movimiento
           WHERE hospitalizacion_id = :h AND tipo = 'ingreso' AND NOT anulado""",
        h=h["id"],
    )
    siguiente = c.valor(
        "SELECT min(texto_local(fecha_hora)) FROM movimiento WHERE hospitalizacion_id = :h AND NOT anulado AND id <> :m",
        h=h["id"], m=m["id"],
    )
    if siguiente and f > siguiente:
        falla("La fecha de ingreso no puede ser posterior al siguiente movimiento del paciente.")
    if dia_de(f) != dia_de(m["fecha_texto"]):
        desde, hasta = sorted((dia_de(f), dia_de(m["fecha_texto"])))
        for dia in dias_entre(desde, hasta):
            r = c.registro_censo(m["servicio_id"], dia)
            if r and r["estado"] == "cerrado":
                falla(f"El censo del {dia} está cerrado. Reábrelo antes de corregir la fecha.")
    c.ejec("UPDATE movimiento SET fecha_hora = desde_local(:f) WHERE id = :m", f=f, m=m["id"])
    c.ejec("UPDATE hospitalizacion SET fecha_ingreso = desde_local(:f), fecha_ingreso_estimada = false WHERE id = :h", f=f, h=h["id"])
    c.ejec(
        """INSERT INTO correccion_movimiento (movimiento_id, fecha_anterior, fecha_nueva, motivo, registrado_en, cuenta_id)
           VALUES (:m, desde_local(:antes), desde_local(:f), :motivo, desde_local(:ahora), :cuenta)""",
        m=m["id"], antes=m["fecha_texto"], f=f, motivo=motivo, ahora=c.ahora, cuenta=c.cuenta["id"],
    )
    return f"{m['fecha_texto']} a {f}: {motivo}"


# ── Traslados y soporte ────────────────────────────────────────────────


def traslado_registrar(c: Ctx, d: dict) -> str:
    h = c.hospitalizacion_abierta(d.get("hospitalizacionId"))
    actual = c.posicion(h["id"])
    c.asegurar_servicio(actual["servicio_id"])
    if c.traslado_pendiente(h["id"]):
        falla("El paciente ya tiene un traslado pendiente.")
    destino = d.get("servicioDestino")
    if destino == actual["servicio_id"]:
        cama = c.cama(d.get("camaId"))
        if not cama or cama["id"] == actual["cama_id"]:
            falla("Elige la cama nueva.")
        c.asegurar_cama_del_servicio(cama, actual["servicio_id"], "La cama debe ser del mismo servicio.")
        f = d.get("fechaHora")
        c.asegurar_editable(actual["servicio_id"], f)
        c.asegurar_orden(h["id"], f)
        c.asegurar_cama_lista(cama)
        c.agregar_movimiento(h["id"], "traslado", f, cama["id"], actual["servicio_id"], servicio_origen=actual["servicio_id"], cama_origen=actual["cama_id"])
        return f"Cambio de cama a {cama['codigo']}"
    if destino not in c.servicios_con_camas():
        falla("Elige el servicio de destino.")
    c.ejec(
        """INSERT INTO traslado (hospitalizacion_id, servicio_origen_id, servicio_destino_id, cama_origen_id, solicitado_en, solicitado_por, estado)
           VALUES (:h, :so, :sd, :co, desde_local(:ahora), :cuenta, 'pendiente')""",
        h=h["id"], so=actual["servicio_id"], sd=destino, co=actual["cama_id"], ahora=c.ahora, cuenta=c.cuenta["id"],
    )
    return f"{actual['servicio_id']} a {destino}"


def traslado_confirmar(c: Ctx, d: dict) -> str:
    t = c.uno("SELECT * FROM traslado WHERE id = :t", t=id_de(d.get("trasladoId")))
    if not t or t["estado"] != "pendiente":
        falla("El traslado ya no está pendiente.")
    c.asegurar_servicio(t["servicio_destino_id"])
    cama = c.cama(d.get("camaId"))
    if not cama:
        falla("Elige una cama de tu servicio.")
    c.asegurar_cama_del_servicio(cama, t["servicio_destino_id"], "Elige una cama de tu servicio.")
    f = d.get("fechaHora")
    c.asegurar_editable(t["servicio_destino_id"], f)
    c.asegurar_editable(t["servicio_origen_id"], f)
    c.asegurar_orden(t["hospitalizacion_id"], f)
    c.asegurar_cama_lista(cama)
    m = c.agregar_movimiento(
        t["hospitalizacion_id"], "traslado", f, cama["id"], t["servicio_destino_id"], servicio_origen=t["servicio_origen_id"], cama_origen=t["cama_origen_id"]
    )
    c.ejec(
        """UPDATE traslado SET estado = 'confirmado', confirmado_en = desde_local(:ahora), confirmado_por = :cuenta, movimiento_id = :m WHERE id = :t""",
        ahora=c.ahora, cuenta=c.cuenta["id"], m=m, t=t["id"],
    )
    return f"Cama {cama['codigo']}"


def traslado_cancelar(c: Ctx, d: dict) -> str:
    t = c.uno("SELECT * FROM traslado WHERE id = :t", t=id_de(d.get("trasladoId")))
    if not t or t["estado"] != "pendiente":
        falla("El traslado ya no está pendiente.")
    c.asegurar_servicio(t["servicio_origen_id"])
    c.ejec("UPDATE traslado SET estado = 'cancelado' WHERE id = :t", t=t["id"])
    return ""


def soporte_cambiar(c: Ctx, d: dict) -> str:
    h = c.hospitalizacion_abierta(d.get("hospitalizacionId"))
    actual = c.posicion(h["id"])
    c.asegurar_servicio(actual["servicio_id"])
    f = d.get("fechaHora")
    c.asegurar_editable(actual["servicio_id"], f)
    c.asegurar_orden(h["id"], f)
    soporte = d.get("soporte")
    if soporte not in ("ninguno", "o2", "vm"):
        falla("Elige el soporte.")
    if soporte == "vm":
        admite = c.valor(
            """SELECT d.reporte_diresa = 'uci' FROM servicio s JOIN departamento d ON d.id = s.departamento_id WHERE s.id = :s""",
            s=actual["servicio_id"],
        )
        if not admite:
            falla("La ventilación mecánica solo se registra en UCI.")
    if actual["soporte"] == soporte:
        falla("El paciente ya tiene ese soporte.")
    c.agregar_movimiento(h["id"], "soporte", f, actual["cama_id"], actual["servicio_id"], soporte=soporte)
    return {"o2": "Inicio de O2", "vm": "Inicio de VM"}.get(soporte, "Retiro de soporte")


# ── Egreso ─────────────────────────────────────────────────────────────


def egreso_registrar(c: Ctx, d: dict) -> str:
    h = c.hospitalizacion_abierta(d.get("hospitalizacionId"))
    actual = c.posicion(h["id"])
    c.asegurar_servicio(actual["servicio_id"])
    if c.traslado_pendiente(h["id"]):
        falla("Cancela o confirma primero el traslado pendiente.")
    f = d.get("fechaHora")
    c.asegurar_editable(actual["servicio_id"], f)
    c.asegurar_orden(h["id"], f)
    tipo = d.get("tipoEgreso")
    if not tipo:
        falla("Elige el tipo de egreso.")
    hospitalario = tipo != TRASLADO_NO_INCORPORADO
    if hospitalario and not d.get("condicion"):
        falla("Elige la condición de egreso.")
    if not hospitalario and not texto_de(d.get("destino")):
        falla("Indica el servicio de destino.")
    alta = d.get("altaMedica") or None
    if alta and (not es_fecha_hora(alta) or alta > f):
        falla("La hora del alta médica no puede ser posterior a la salida.")
    m = c.agregar_movimiento(h["id"], "egreso", f, actual["cama_id"], actual["servicio_id"], tipo_egreso=tipo)
    e = c.valor(
        """INSERT INTO egreso (hospitalizacion_id, movimiento_id, fecha_hora, alta_medica_en, tipo, condicion, destino, servicio_id, medico_id, estado)
           VALUES (:h, :m, desde_local(:f), desde_local(:alta), :tipo, :cond, NULLIF(:destino, ''), :s, NULLIF(:medico, ''), :estado) RETURNING id""",
        h=h["id"], m=m, f=f, alta=alta, tipo=tipo, cond=d.get("condicion") if hospitalario else None, destino=texto_de(d.get("destino")),
        s=actual["servicio_id"], medico=d.get("medicoId") or "", estado="pendiente_hc" if hospitalario else None,
    )
    c.ejec("UPDATE hospitalizacion SET estado = 'egresada' WHERE id = :h", h=h["id"])
    if hospitalario:
        c.ejec("INSERT INTO control_hc (egreso_id, estado) VALUES (:e, 'pendiente_entrega')", e=e)
    return tipo


def movimiento_anular(c: Ctx, d: dict) -> str:
    m = c.uno("SELECT *, texto_local(fecha_hora) AS fecha_texto FROM movimiento WHERE id = :m", m=id_de(d.get("movimientoId")))
    if not m or m["anulado"]:
        falla("El movimiento ya no se puede anular.")
    motivo = texto_de(d.get("motivo"))
    if not motivo:
        falla("Escribe el motivo de la anulación.")
    c.asegurar_servicio(m["servicio_id"])
    c.asegurar_editable(m["servicio_id"], m["fecha_texto"])
    ultimo = c.valor(
        "SELECT id FROM movimiento WHERE hospitalizacion_id = :h AND NOT anulado ORDER BY fecha_hora DESC, id DESC LIMIT 1",
        h=m["hospitalizacion_id"],
    )
    if ultimo != m["id"]:
        falla("Solo se puede anular el último movimiento del paciente.")
    h = c.uno("SELECT * FROM hospitalizacion WHERE id = :h", h=m["hospitalizacion_id"])
    eg = c.egreso_de(h["id"]) if m["tipo"] == "egreso" else None
    if eg and eg["estado"] and eg["estado"] != "pendiente_hc":
        falla("Estadística ya trabajó ese egreso.")
    c.ejec(
        """UPDATE movimiento SET anulado = true, motivo_anulacion = :motivo, anulado_en = desde_local(:ahora), anulado_por = :cuenta WHERE id = :m""",
        motivo=motivo, ahora=c.ahora, cuenta=c.cuenta["id"], m=m["id"],
    )
    if m["tipo"] == "ingreso":
        c.ejec("UPDATE hospitalizacion SET estado = 'anulada' WHERE id = :h", h=h["id"])
        if h["orden_id"]:
            c.ejec("UPDATE orden_hospitalizacion SET estado = 'pendiente' WHERE id = :o", o=h["orden_id"])
    if m["tipo"] == "egreso":
        c.ejec("UPDATE egreso SET anulado = true WHERE id = :e", e=eg["id"])
        c.ejec("UPDATE hospitalizacion SET estado = 'abierta' WHERE id = :h", h=h["id"])
    if m["tipo"] == "traslado":
        c.ejec("UPDATE traslado SET estado = 'anulado' WHERE movimiento_id = :m", m=m["id"])
    return motivo


# ── Camas y mantenimiento ──────────────────────────────────────────────


def cama_bloquear(c: Ctx, d: dict) -> str:
    cama = c.cama(d.get("camaId"))
    if not cama:
        falla("Elige la cama.")
    c.asegurar_servicio(cama["servicio_id"])
    c.asegurar_cama_lista(cama)
    motivo = texto_de(d.get("motivo"))
    if not motivo:
        falla("Escribe el motivo del bloqueo.")
    c.ejec(
        "INSERT INTO bloqueo_cama (cama_id, motivo, desde, bloqueado_por) VALUES (:c, :m, desde_local(:ahora), :cuenta)",
        c=cama["id"], m=motivo, ahora=c.ahora, cuenta=c.cuenta["id"],
    )
    return cama["codigo"]


def cama_desbloquear(c: Ctx, d: dict) -> str:
    cama = c.cama(d.get("camaId"))
    if not cama:
        falla("Elige la cama.")
    c.asegurar_servicio(cama["servicio_id"])
    c.ejec(
        "UPDATE bloqueo_cama SET hasta = desde_local(:ahora), desbloqueado_por = :cuenta WHERE cama_id = :c AND hasta IS NULL",
        ahora=c.ahora, cuenta=c.cuenta["id"], c=cama["id"],
    )
    return cama["codigo"]


def falla_reportar(c: Ctx, d: dict) -> str:
    cama = c.cama(d.get("camaId"))
    if not cama:
        falla("Elige la cama.")
    c.asegurar_servicio(cama["servicio_id"])
    abierta = c.valor("SELECT EXISTS (SELECT 1 FROM orden_mantenimiento WHERE cama_id = :c AND estado <> 'cerrada')", c=cama["id"])
    if cama["fuera_de_servicio"] or abierta:
        falla("Esa cama ya tiene una orden de mantenimiento abierta.")
    descripcion = texto_de(d.get("falla"))
    if not descripcion:
        falla("Describe la falla.")
    activo = c.valor("SELECT id FROM activo_cama WHERE cama_id = :c", c=cama["id"])
    if not activo:
        falla("Ese puesto no tiene una cama física registrada.")
    c.ejec(
        """INSERT INTO orden_mantenimiento (cama_id, activo_id, falla, reportada_en, reportada_por, estado)
           VALUES (:c, :a, :f, desde_local(:ahora), :cuenta, 'pendiente_retiro')""",
        c=cama["id"], a=activo, f=descripcion, ahora=c.ahora, cuenta=c.cuenta["id"],
    )
    c.ejec("UPDATE activo_cama SET estado = 'reportada' WHERE id = :a", a=activo)
    return f"{cama['codigo']}: {descripcion}"


def _orden_mant(c: Ctx, d: dict):
    return c.uno("SELECT * FROM orden_mantenimiento WHERE id = :o", o=id_de(d.get("ordenId")))


def _nuevo_activo(c: Ctx, cama) -> int:
    """Registra la cama física que ocupa el puesto en lugar de la retirada."""
    n = c.valor("SELECT count(*) FROM activo_cama WHERE codigo_interno LIKE :p", p=f"CAM-{cama['codigo']}%")
    return c.valor(
        "INSERT INTO activo_cama (codigo_interno, tipo, cama_id, estado) VALUES (:codigo, :tipo, :c, 'en_uso') RETURNING id",
        codigo=f"CAM-{cama['codigo']}-R{n}", tipo=cama["tipo"], c=cama["id"],
    )


def mant_retirar(c: Ctx, d: dict) -> str:
    o = _orden_mant(c, d)
    if not o or o["estado"] != "pendiente_retiro":
        falla("La orden ya no está pendiente de retiro.")
    cama = c.uno("SELECT * FROM cama WHERE id = :c", c=o["cama_id"])
    if c.ocupada(cama["id"]):
        falla(f"La cama {cama['codigo']} tiene un paciente. Debe liberarse antes del retiro.")
    con_reemplazo = bool(d.get("conReemplazo"))
    reemplazo = None
    if con_reemplazo:
        c.ejec("UPDATE activo_cama SET cama_id = NULL, estado = 'en_mantenimiento' WHERE id = :a", a=o["activo_id"])
        reemplazo = _nuevo_activo(c, cama)
    else:
        c.ejec("UPDATE activo_cama SET estado = 'en_mantenimiento' WHERE id = :a", a=o["activo_id"])
        c.ejec("UPDATE cama SET fuera_de_servicio = true WHERE id = :c", c=cama["id"])
    c.ejec(
        """UPDATE orden_mantenimiento SET estado = 'en_reparacion', con_reemplazo = :r, activo_reemplazo_id = :a, retirada_en = desde_local(:ahora) WHERE id = :o""",
        r=con_reemplazo, a=reemplazo, ahora=c.ahora, o=o["id"],
    )
    return f"{cama['codigo']} {'con reemplazo' if con_reemplazo else 'sin reemplazo'}"


def mant_resolver(c: Ctx, d: dict) -> str:
    o = _orden_mant(c, d)
    if not o or o["estado"] != "en_reparacion":
        falla("La orden no está en reparación.")
    diagnostico = texto_de(d.get("diagnostico"))
    if not diagnostico:
        falla("Escribe el diagnóstico.")
    resultado = d.get("resultado")
    if resultado not in ("reparada", "baja"):
        falla("Indica si la cama quedó reparada o de baja.")
    if resultado == "baja":
        c.ejec("UPDATE activo_cama SET estado = 'de_baja', cama_id = NULL WHERE id = :a", a=o["activo_id"])
    elif o["con_reemplazo"]:
        c.ejec("UPDATE activo_cama SET estado = 'en_almacen' WHERE id = :a", a=o["activo_id"])
    c.ejec(
        """UPDATE orden_mantenimiento SET diagnostico = :dx, resultado = :r, resuelta_en = desde_local(:ahora), estado = :estado WHERE id = :o""",
        dx=diagnostico, r=resultado, ahora=c.ahora, estado="cerrada" if o["con_reemplazo"] else "lista_entrega", o=o["id"],
    )
    return resultado


def mant_entregar(c: Ctx, d: dict) -> str:
    o = _orden_mant(c, d)
    if not o or o["estado"] != "lista_entrega":
        falla("La orden no está lista para entregar.")
    cama = c.uno("SELECT * FROM cama WHERE id = :c", c=o["cama_id"])
    reemplazo = None
    if o["resultado"] == "baja":
        # La cama retirada ya no vuelve: lo que se entrega es otra cama física.
        reemplazo = _nuevo_activo(c, cama)
    c.ejec(
        """UPDATE orden_mantenimiento SET estado = 'por_recibir', entregada_en = desde_local(:ahora), activo_reemplazo_id = coalesce(:a, activo_reemplazo_id) WHERE id = :o""",
        ahora=c.ahora, a=reemplazo, o=o["id"],
    )
    return cama["codigo"]


def mant_recibir(c: Ctx, d: dict) -> str:
    o = _orden_mant(c, d)
    if not o or o["estado"] != "por_recibir":
        falla("La cama no está por recibir.")
    cama = c.uno("SELECT * FROM cama WHERE id = :c", c=o["cama_id"])
    c.asegurar_servicio(cama["servicio_id"])
    c.ejec("UPDATE orden_mantenimiento SET estado = 'cerrada', recibida_en = desde_local(:ahora) WHERE id = :o", ahora=c.ahora, o=o["id"])
    c.ejec("UPDATE cama SET fuera_de_servicio = false WHERE id = :c", c=cama["id"])
    if o["resultado"] == "reparada":
        c.ejec("UPDATE activo_cama SET estado = 'en_uso' WHERE id = :a", a=o["activo_id"])
    return cama["codigo"]


# ── Censo ──────────────────────────────────────────────────────────────


def guardar_censo(conexion, servicio: str, dia: str, conteo: int, observacion: str, cuando: str, cuenta: str) -> None:
    """Fija los conteos y la foto del día. Reemplaza las filas de un censo reabierto."""
    p = {"s": servicio, "d": dia, "conteo": conteo, "obs": observacion or None, "cuando": cuando, "cuenta": cuenta}
    censo = conexion.execute(
        text(
            """INSERT INTO censo_diario (servicio_id, fecha, estado, saldo_anterior, ingresos, traslados_entrada, egresos, traslados_salida,
                 pacientes_corte, entraron_y_salieron, pacientes_dia, conteo_fisico, observacion, cerrado_en, cerrado_por)
               SELECT :s, CAST(:d AS date), 'cerrado', c.saldo_anterior, c.ingresos, c.traslados_entrada, c.egresos, c.traslados_salida,
                 c.pacientes_corte, c.entraron_y_salieron, c.pacientes_dia, :conteo, :obs, desde_local(:cuando), :cuenta
               FROM cuadre_censo(:s, CAST(:d AS date)) c
               ON CONFLICT (servicio_id, fecha) DO UPDATE SET
                 estado = 'cerrado', saldo_anterior = EXCLUDED.saldo_anterior, ingresos = EXCLUDED.ingresos,
                 traslados_entrada = EXCLUDED.traslados_entrada, egresos = EXCLUDED.egresos, traslados_salida = EXCLUDED.traslados_salida,
                 pacientes_corte = EXCLUDED.pacientes_corte, entraron_y_salieron = EXCLUDED.entraron_y_salieron,
                 pacientes_dia = EXCLUDED.pacientes_dia, conteo_fisico = EXCLUDED.conteo_fisico, observacion = EXCLUDED.observacion,
                 cerrado_en = EXCLUDED.cerrado_en, cerrado_por = EXCLUDED.cerrado_por
               RETURNING id"""
        ),
        p,
    ).scalar_one()
    conexion.execute(text("DELETE FROM censo_detalle WHERE censo_id = :c"), {"c": censo})
    conexion.execute(
        text(
            """INSERT INTO censo_detalle (censo_id, cama_id, hospitalizacion_id, estado_cama, movimiento, relacion, soporte, dias_estancia,
                 tipo_egreso, presente_al_corte, observacion)
               SELECT :c, f.cama_id, f.hospitalizacion_id, f.estado_cama, f.movimiento, f.relacion, f.soporte, f.dias_estancia,
                 f.tipo_egreso, f.presente_al_corte, n.nota
               FROM filas_censo(:s, CAST(:d AS date)) f
               LEFT JOIN censo_nota n ON n.censo_id = :c AND n.hospitalizacion_id = f.hospitalizacion_id"""
        ),
        {"c": censo, "s": servicio, "d": dia},
    )


def censo_cerrar(c: Ctx, d: dict) -> str:
    servicio, dia = d.get("servicioId"), d.get("dia")
    c.asegurar_servicio(servicio)
    r = c.registro_censo(servicio, dia)
    if r and r["estado"] == "cerrado":
        falla("Ese censo ya está cerrado.")
    if c.ahora < corte_del_dia(dia):
        falla("El censo se cierra después de las 24:00 del día.")
    if not r and not c.censo_editable(servicio, dia) and c.cuenta["rol"] == "enfermeria":
        falla("Pasaron las 08:00: solo Estadística puede cerrar este censo.")
    q = c.uno("SELECT * FROM cuadre_censo(:s, CAST(:d AS date))", s=servicio, d=dia)
    conteo = d.get("conteoFisico")
    if not isinstance(conteo, int) or isinstance(conteo, bool) or conteo < 0:
        falla("Escribe cuántos pacientes había en sala al corte.")
    observacion = texto_de(d.get("observacion"))
    cuadra = q["saldo_anterior"] + q["ingresos"] + q["traslados_entrada"] - q["egresos"] - q["traslados_salida"] == q["pacientes_corte"]
    if (conteo != q["pacientes_corte"] or not cuadra) and not observacion:
        falla("El conteo no coincide con el sistema: escribe una observación.")
    guardar_censo(c.conexion, servicio, dia, conteo, observacion, c.ahora, c.cuenta["id"])
    c.ejec("SELECT refrescar_indicadores()")
    return f"{servicio} {dia}"


def censo_nota(c: Ctx, d: dict) -> str:
    servicio, dia = d.get("servicioId"), d.get("dia")
    c.asegurar_servicio(servicio)
    if not c.censo_editable(servicio, dia):
        falla("El censo de ese día ya no admite cambios.")
    censo = c.valor(
        """INSERT INTO censo_diario (servicio_id, fecha, estado) VALUES (:s, CAST(:d AS date), 'abierto')
           ON CONFLICT (servicio_id, fecha) DO UPDATE SET fecha = EXCLUDED.fecha RETURNING id""",
        s=servicio, d=dia,
    )
    c.ejec(
        """INSERT INTO censo_nota (censo_id, hospitalizacion_id, nota) VALUES (:c, :h, :n)
           ON CONFLICT (censo_id, hospitalizacion_id) DO UPDATE SET nota = EXCLUDED.nota""",
        c=censo, h=id_de(d.get("hospitalizacionId")), n=texto_de(d.get("nota")),
    )
    return ""


def _periodo_cerrado(c: Ctx, mes: str) -> bool:
    return bool(c.valor("SELECT EXISTS (SELECT 1 FROM periodo WHERE mes = CAST(:m AS date) AND estado = 'cerrado')", m=f"{mes}-01"))


def censo_reabrir(c: Ctx, d: dict) -> str:
    servicio, dia = d.get("servicioId"), d.get("dia")
    r = c.registro_censo(servicio, dia)
    if not r or r["estado"] != "cerrado":
        falla("Solo se reabre un censo cerrado.")
    if _periodo_cerrado(c, mes_de(dia)):
        falla("El mes de ese censo ya está cerrado.")
    motivo = texto_de(d.get("motivo"))
    if not motivo:
        falla("Escribe el motivo de la reapertura.")
    c.ejec(
        """UPDATE censo_diario SET estado = 'reabierto', motivo_reapertura = :m, reabierto_en = desde_local(:ahora), reabierto_por = :cuenta WHERE id = :id""",
        m=motivo, ahora=c.ahora, cuenta=c.cuenta["id"], id=r["id"],
    )
    c.ejec("SELECT refrescar_indicadores()")
    return f"{servicio} {dia}: {motivo}"


# ── Estadística ────────────────────────────────────────────────────────


def hc_recibir(c: Ctx, d: dict) -> str:
    hc = texto_de(d.get("hc"))
    fila = c.uno(
        """SELECT ch.egreso_id FROM control_hc ch
           JOIN egreso e ON e.id = ch.egreso_id AND NOT e.anulado
           JOIN hospitalizacion h ON h.id = e.hospitalizacion_id AND h.estado <> 'anulada'
           JOIN paciente p ON p.id = h.paciente_id
           WHERE ch.estado = 'pendiente_entrega' AND p.n_hc = :hc
           ORDER BY e.fecha_hora LIMIT 1""",
        hc=hc,
    )
    if not fila:
        falla(f"No hay un egreso esperando la HC {hc}.")
    c.ejec(
        """UPDATE control_hc SET estado = 'recibida', recibida_en = desde_local(:ahora), recibida_por = :cuenta WHERE egreso_id = :e""",
        ahora=c.ahora, cuenta=c.cuenta["id"], e=fila["egreso_id"],
    )
    return hc


def hc_devolver(c: Ctx, d: dict) -> str:
    e = c.egreso_de(d.get("hospitalizacionId"))
    estado = c.valor("SELECT estado FROM control_hc WHERE egreso_id = :e", e=e["id"]) if e else None
    if estado != "completada":
        falla("Primero se completa el egreso con la HC.")
    c.ejec(
        """UPDATE control_hc SET estado = 'devuelta', devuelta_en = desde_local(:ahora), devuelta_por = :cuenta WHERE egreso_id = :e""",
        ahora=c.ahora, cuenta=c.cuenta["id"], e=e["id"],
    )
    return ""


def _validar_cie(codigo: str, e) -> None:
    if codigo.startswith("O") and e["sexo"] != "F":
        falla("El código obstétrico no corresponde al sexo del paciente.")
    if codigo.startswith("P") and e["fecha_nacimiento"] and int(e["fecha_texto"][:4]) - e["fecha_nacimiento"].year > 1:
        falla("El código perinatal no corresponde a la edad del paciente.")


def egreso_completar(c: Ctx, d: dict) -> str:
    e = c.egreso_de(d.get("hospitalizacionId"))
    if not e or e["estado"] not in ("pendiente_hc", "observado"):
        falla("Ese egreso no está pendiente de completar.")
    principal = texto_de(d.get("cie10"))
    if not principal:
        falla("Elige el CIE-10 principal.")
    if not d.get("medicoId"):
        falla("Elige el médico que dio el alta.")
    _validar_cie(principal, e)
    secundarios = [s for s in dict.fromkeys(d.get("secundarios") or []) if s and s != principal]
    c.ejec("DELETE FROM diagnostico_egreso WHERE egreso_id = :e", e=e["id"])
    for orden, codigo in enumerate([principal, *secundarios], start=1):
        c.ejec(
            "INSERT INTO diagnostico_egreso (egreso_id, cie10, principal, orden) VALUES (:e, :c, :p, :o)",
            e=e["id"], c=codigo, p=orden == 1, o=orden,
        )
    c.ejec(
        """UPDATE egreso SET medico_id = :m, estado = 'completo', motivo_observacion = NULL, completado_en = desde_local(:ahora), completado_por = :cuenta WHERE id = :e""",
        m=d["medicoId"], ahora=c.ahora, cuenta=c.cuenta["id"], e=e["id"],
    )
    c.ejec("UPDATE control_hc SET estado = 'completada', completada_en = desde_local(:ahora) WHERE egreso_id = :e", ahora=c.ahora, e=e["id"])
    return principal


def egreso_validar(c: Ctx, d: dict) -> str:
    e = c.egreso_de(d.get("hospitalizacionId"))
    if not e or e["estado"] != "completo":
        falla("Solo se valida un egreso completo.")
    c.ejec(
        "UPDATE egreso SET estado = 'validado', validado_en = desde_local(:ahora), validado_por = :cuenta WHERE id = :e",
        ahora=c.ahora, cuenta=c.cuenta["id"], e=e["id"],
    )
    return ""


def egreso_observar(c: Ctx, d: dict) -> str:
    e = c.egreso_de(d.get("hospitalizacionId"))
    if not e or e["estado"] != "completo":
        falla("Solo se observa un egreso completo.")
    motivo = texto_de(d.get("motivo"))
    if not motivo:
        falla("Escribe qué hay que corregir.")
    c.ejec("UPDATE egreso SET estado = 'observado', motivo_observacion = :m WHERE id = :e", m=motivo, e=e["id"])
    return motivo


# ── Periodos y reportes ────────────────────────────────────────────────


def mes_cerrar(c: Ctx, d: dict) -> str:
    mes = d.get("mes") or ""
    if not re.fullmatch(r"\d{4}-\d{2}", mes):
        falla("Elige el mes.")
    if _periodo_cerrado(c, mes):
        falla("Ese mes ya está cerrado.")
    if mes >= mes_de(c.ahora):
        falla("El mes todavía está en curso.")
    hoy = dia_de(c.ahora)
    primero, siguiente = f"{mes}-01", sumar_dias(f"{mes}-28", 4)[:7] + "-01"
    for servicio in c.servicios_con_camas():
        inicio = max(c.arranque(servicio), primero)
        ultimo = min(sumar_dias(siguiente, -1), sumar_dias(hoy, -1))
        if inicio > ultimo:
            continue
        for dia in dias_entre(inicio, ultimo):
            r = c.registro_censo(servicio, dia)
            if not r or r["estado"] != "cerrado":
                falla(f"Falta cerrar el censo de {servicio} del {dia}.")
    sin_validar = c.valor(
        """SELECT count(*) FROM egreso
           WHERE NOT anulado AND estado IS NOT NULL AND estado <> 'validado'
             AND date_trunc('month', dia_censo(fecha_hora))::date = CAST(:m AS date)""",
        m=primero,
    )
    if sin_validar:
        falla(f"Faltan validar {sin_validar} egresos del mes.")
    # Los egresos pasan a cerrado antes de marcar el periodo: después ya no se pueden tocar.
    c.ejec(
        """UPDATE egreso SET estado = 'cerrado'
           WHERE NOT anulado AND estado = 'validado' AND date_trunc('month', dia_censo(fecha_hora))::date = CAST(:m AS date)""",
        m=primero,
    )
    c.ejec("SELECT refrescar_indicadores()")
    version = c.valor(
        """SELECT id FROM dotacion_version WHERE oficial AND vigente_desde <= CAST(:m AS date)
             AND (vigente_hasta IS NULL OR vigente_hasta >= CAST(:m AS date)) ORDER BY vigente_desde DESC LIMIT 1""",
        m=primero,
    )
    c.ejec(
        """INSERT INTO periodo (mes, estado, dotacion_version_id, cerrado_en, cerrado_por)
           VALUES (CAST(:m AS date), 'cerrado', :v, desde_local(:ahora), :cuenta)
           ON CONFLICT (mes) DO UPDATE SET estado = 'cerrado', dotacion_version_id = EXCLUDED.dotacion_version_id,
             cerrado_en = EXCLUDED.cerrado_en, cerrado_por = EXCLUDED.cerrado_por""",
        m=primero, v=version, ahora=c.ahora, cuenta=c.cuenta["id"],
    )
    c.ejec(
        """INSERT INTO indicador_mes_cerrado (mes, base, departamento_id, servicio_id, a, b, c, d, e, c_f, e_f, f, g, h, i, dias_con_censo)
           SELECT mes, base, departamento_id, servicio_id, a, b, c, d, e, c_f, e_f, f, g, h, i, dias_con_censo
           FROM mv_indicadores_mes WHERE mes = CAST(:m AS date)""",
        m=primero,
    )
    return mes


def mes_ajustar(c: Ctx, d: dict) -> str:
    mes = d.get("mes") or ""
    if not _periodo_cerrado(c, mes):
        falla("Solo se ajusta un mes cerrado.")
    variable = d.get("variable")
    if variable not in ("A", "B", "C", "D", "E"):
        falla("Elige la variable que se corrige.")
    motivo = texto_de(d.get("motivo"))
    if not motivo:
        falla("Escribe el motivo del ajuste.")
    try:
        valor = float(d.get("valorCorregido"))
    except (TypeError, ValueError):
        falla("Escribe el valor corregido.")
    c.ejec(
        """INSERT INTO ajuste_periodo (mes, servicio_id, variable, valor_corregido, motivo, registrado_en, cuenta_id)
           VALUES (CAST(:m AS date), NULLIF(:s, ''), :v, :valor, :motivo, desde_local(:ahora), :cuenta)""",
        m=f"{mes}-01", s=d.get("servicioId") or "", v=variable, valor=valor, motivo=motivo, ahora=c.ahora, cuenta=c.cuenta["id"],
    )
    return f"{mes} {variable}: {motivo}"


def renoxi_marcar(c: Ctx, d: dict) -> str:
    dia = d.get("dia")
    c.ejec(
        """INSERT INTO renoxi_carga (dia, cargado_en, cuenta_id) VALUES (CAST(:d AS date), desde_local(:ahora), :cuenta)
           ON CONFLICT (dia) DO UPDATE SET cargado_en = EXCLUDED.cargado_en, cuenta_id = EXCLUDED.cuenta_id""",
        d=dia, ahora=c.ahora, cuenta=c.cuenta["id"],
    )
    return dia


MANEJADORES = {
    "orden/registrar": orden_registrar,
    "orden/anular": orden_anular,
    "ingreso/confirmar": ingreso_confirmar,
    "ingreso/previo": ingreso_previo,
    "ingreso/corregir": ingreso_corregir,
    "traslado/registrar": traslado_registrar,
    "traslado/confirmar": traslado_confirmar,
    "traslado/cancelar": traslado_cancelar,
    "soporte/cambiar": soporte_cambiar,
    "egreso/registrar": egreso_registrar,
    "movimiento/anular": movimiento_anular,
    "cama/bloquear": cama_bloquear,
    "cama/desbloquear": cama_desbloquear,
    "falla/reportar": falla_reportar,
    "mant/retirar": mant_retirar,
    "mant/resolver": mant_resolver,
    "mant/entregar": mant_entregar,
    "mant/recibir": mant_recibir,
    "censo/cerrar": censo_cerrar,
    "censo/nota": censo_nota,
    "censo/reabrir": censo_reabrir,
    "hc/recibir": hc_recibir,
    "hc/devolver": hc_devolver,
    "egreso/completar": egreso_completar,
    "egreso/validar": egreso_validar,
    "egreso/observar": egreso_observar,
    "mes/cerrar": mes_cerrar,
    "mes/ajustar": mes_ajustar,
    "renoxi/marcar": renoxi_marcar,
}


def preparar(conexion, cuenta: dict, ip: str | None) -> None:
    """Las escrituras van de una en una; los triggers de auditoría leen quién y desde dónde."""
    conexion.execute(text("SELECT pg_advisory_xact_lock(724001)"))
    conexion.execute(
        text("SELECT set_config('app.cuenta_id', :c, true), set_config('app.ip', :i, true)"),
        {"c": cuenta["id"], "i": ip or ""},
    )


def aplicar(conexion, cuenta: dict, accion: dict, ahora: str, ip: str | None = None) -> None:
    datos = dict(accion)
    tipo = datos.pop("tipo", None)
    manejador = MANEJADORES.get(tipo)
    if manejador is None:
        falla(f"Acción desconocida: {tipo}")
    if cuenta["rol"] != "sistema" and cuenta["rol"] not in PERMISOS[tipo]:
        falla("Esta cuenta no tiene permiso para esta acción.")
    preparar(conexion, cuenta, ip)
    c = Ctx(conexion, cuenta, ahora)
    detalle = manejador(c, datos) or ""
    c.ejec(
        """INSERT INTO bitacora (fecha_hora, cuenta_id, ip, tipo, descripcion, detalle)
           VALUES (desde_local(:ahora), :cuenta, CAST(NULLIF(:ip, '') AS inet), :tipo, :descripcion, :detalle)""",
        ahora=ahora, cuenta=cuenta["id"], ip=ip or "", tipo=tipo, descripcion=DESCRIPCION[tipo], detalle=detalle,
    )


def ahora_de(conexion, demo: bool) -> str:
    if demo:
        valor = conexion.execute(text("SELECT valor FROM parametro WHERE clave = 'reloj_demo' LIMIT 1")).scalar()
        if valor:
            return valor if isinstance(valor, str) else json.loads(valor)
    return conexion.execute(text("SELECT texto_local(now())")).scalar()
