"""Los subflujos, ejecutados con las mismas acciones que usa la interfaz."""

import pytest
from sqlalchemy import text

from app.acciones import SISTEMA, ErrorRegla, aplicar
from app.estado import construir
from app.plano import guardar_plano
from app.tiempo import dias_entre

AHORA = "2026-11-08T10:30"
MED = "medicina"
INT = "medicina-intermedios"


def valor(c, sql, **p):
    return c.execute(text(sql), p).scalar()


def cuenta(c, cuenta_id):
    fila = c.execute(text("SELECT id, rol FROM cuenta WHERE id = :c"), {"c": cuenta_id}).mappings().first()
    servicios = c.execute(text("SELECT servicio_id FROM cuenta_servicio WHERE cuenta_id = :c"), {"c": cuenta_id}).scalars().all()
    return {**fila, "servicios": list(servicios)}


def hacer(c, quien, tipo, ahora=AHORA, **datos):
    aplicar(c, SISTEMA if quien == "sistema" else cuenta(c, quien), {"tipo": tipo, **datos}, ahora)


def falla(c, patron, quien, tipo, ahora=AHORA, **datos):
    with pytest.raises(ErrorRegla, match=patron):
        with c.begin_nested():
            hacer(c, quien, tipo, ahora, **datos)


def paciente(n, **extra):
    return {"hc": f"55500{n}", "dni": f"5550000{n}", "nombres": f"Prueba {n}", "sexo": "F", "nacimiento": "1970-01-01", **extra}


def orden_ultima(c):
    return valor(c, "SELECT max(id) FROM orden_hospitalizacion")


def hosp_ultima(c):
    return valor(c, "SELECT max(id) FROM hospitalizacion")


def ordenar(c, n=1, ahora=AHORA, **extra):
    datos = {"paciente": paciente(n), "origen": "consulta_externa", "departamentoId": MED, **extra}
    hacer(c, "admision", "orden/registrar", ahora=ahora, **datos)
    return orden_ultima(c)


def designar(c, orden, cama="cama-b-01", ahora=AHORA, fecha=AHORA):
    hacer(c, "dep.medicina", "ingreso/confirmar", ahora=ahora, ordenId=orden, camaId=cama, fechaHora=fecha)


def ingresar(c, n=1, cama="cama-b-01"):
    designar(c, ordenar(c, n), cama)
    return hosp_ultima(c)


def test_admision_envia_al_departamento_y_este_designa_la_cama(conn):
    o = ordenar(conn)
    assert valor(conn, "SELECT departamento_id FROM orden_hospitalizacion WHERE id = :o", o=o) == MED
    assert valor(conn, "SELECT servicio_id FROM orden_hospitalizacion WHERE id = :o", o=o) is None
    for quien in ("admision", "medicina.b", "medicina.int", "estadistica", "mantenimiento"):
        falla(conn, "permiso", quien, "ingreso/confirmar", ordenId=o, camaId="cama-b-01", fechaHora=AHORA)
    designar(conn, o, "cama-i-04")
    assert valor(conn, "SELECT estado FROM orden_hospitalizacion WHERE id = :o", o=o) == "ingresada"
    assert valor(conn, "SELECT servicio_id FROM orden_hospitalizacion WHERE id = :o", o=o) == INT
    assert valor(conn, "SELECT servicio_id FROM ocupacion_cama WHERE cama_id = 'cama-i-04' AND hasta IS NULL") == INT


def test_la_orden_va_a_un_departamento_incorporado(conn):
    falla(conn, "departamento", "admision", "orden/registrar", paciente=paciente(1), origen="consulta_externa", departamentoId="cirugia")
    falla(conn, "departamento", "admision", "orden/registrar", paciente=paciente(1), origen="consulta_externa", servicioId="medicina-b")


def test_el_piso_controla_al_paciente_y_el_departamento_solo_mira(conn):
    h = ingresar(conn, cama="cama-i-04")
    falla(conn, "permiso", "dep.medicina", "soporte/cambiar", hospitalizacionId=h, soporte="o2", fechaHora=AHORA)
    falla(conn, "permiso", "dep.medicina", "traslado/registrar", hospitalizacionId=h, servicioDestino="medicina-b")
    falla(conn, "permiso", "estadistica", "egreso/registrar", hospitalizacionId=h, fechaHora=AHORA, tipoEgreso="alta_medica", condicion="curado")
    falla(conn, "su servicio", "medicina.b", "soporte/cambiar", hospitalizacionId=h, soporte="o2", fechaHora=AHORA)
    hacer(conn, "medicina.int", "soporte/cambiar", hospitalizacionId=h, soporte="o2", fechaHora=AHORA)
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-i-04'") == "ocupada_o2"


def test_salida_y_entrada_en_el_mismo_minuto(conn):
    h = ingresar(conn)
    salida = "2026-11-08T11:00"
    hacer(conn, "medicina.b", "egreso/registrar", ahora=salida, hospitalizacionId=h, fechaHora=salida, tipoEgreso="alta_medica", condicion="curado")
    designar(conn, ordenar(conn, 2, ahora=salida), "cama-b-01", ahora=salida, fecha=salida)
    assert valor(conn, "SELECT count(*) FROM ocupacion_cama WHERE cama_id = 'cama-b-01'") == 2


def test_traslado_entre_pisos_lo_confirma_el_destino(conn):
    h = ingresar(conn)
    falla(conn, "solo se registra en UCI", "medicina.b", "soporte/cambiar", hospitalizacionId=h, soporte="vm", fechaHora=AHORA)
    hacer(conn, "medicina.b", "traslado/registrar", ahora="2026-11-08T11:00", hospitalizacionId=h, servicioDestino=INT)
    t = valor(conn, "SELECT max(id) FROM traslado")
    falla(conn, "Cancela o confirma", "medicina.b", "egreso/registrar", ahora="2026-11-08T11:00", hospitalizacionId=h, fechaHora="2026-11-08T11:00", tipoEgreso="alta_medica", condicion="curado")
    falla(conn, "su servicio", "medicina.b", "traslado/confirmar", ahora="2026-11-08T11:30", trasladoId=t, camaId="cama-i-04", fechaHora="2026-11-08T11:30")
    hacer(conn, "medicina.int", "traslado/confirmar", ahora="2026-11-08T11:30", trasladoId=t, camaId="cama-i-04", fechaHora="2026-11-08T11:30")
    q = conn.execute(text("SELECT traslados_entrada, pacientes_corte FROM cuadre_censo(:s, '2026-11-08')"), {"s": INT}).first()
    assert q.traslados_entrada == 1
    assert valor(conn, "SELECT traslados_salida FROM cuadre_censo('medicina-b', '2026-11-08')") == 1


def test_traslado_a_uci_cierra_al_salir_del_piso(conn):
    """UCI no está en el prototipo: el traslado cierra la estancia en Medicina y libera la cama."""
    h = ingresar(conn)
    falla(conn, "servicio de destino", "medicina.b", "traslado/registrar", ahora="2026-11-08T11:00", hospitalizacionId=h, servicioDestino="cuidados-criticos")
    hacer(conn, "medicina.b", "egreso/registrar", ahora="2026-11-08T11:00", hospitalizacionId=h, fechaHora="2026-11-08T11:00", tipoEgreso="traslado_no_incorporado", destino="UCI Medicina")
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "libre"
    assert valor(conn, "SELECT traslados_salida FROM cuadre_censo('medicina-b', '2026-11-08')") == 1


def test_anular_traslado_deja_constancia(conn):
    h = ingresar(conn)
    hacer(conn, "medicina.b", "traslado/registrar", ahora="2026-11-08T11:00", hospitalizacionId=h, servicioDestino=INT)
    hacer(conn, "medicina.int", "traslado/confirmar", ahora="2026-11-08T11:30", trasladoId=valor(conn, "SELECT max(id) FROM traslado"), camaId="cama-i-04", fechaHora="2026-11-08T11:30")
    m = valor(conn, "SELECT max(id) FROM movimiento")
    hacer(conn, "medicina.int", "movimiento/anular", ahora="2026-11-08T11:40", movimientoId=m, motivo="Se equivocó de paciente")
    assert valor(conn, "SELECT estado FROM traslado WHERE movimiento_id = :m", m=m) == "anulado"
    assert valor(conn, "SELECT cama_id FROM ocupacion_cama WHERE hospitalizacion_id = :h AND hasta IS NULL", h=h) == "cama-b-01"


def test_anular_ingreso_devuelve_la_orden(conn):
    h = ingresar(conn)
    hacer(conn, "medicina.b", "movimiento/anular", movimientoId=valor(conn, "SELECT max(id) FROM movimiento"), motivo="Cama equivocada")
    assert valor(conn, "SELECT estado FROM hospitalizacion WHERE id = :h", h=h) == "anulada"
    assert valor(conn, "SELECT estado FROM orden_hospitalizacion WHERE id = :o", o=orden_ultima(conn)) == "pendiente"
    designar(conn, orden_ultima(conn), "cama-b-02")
    assert valor(conn, "SELECT count(*) FROM hospitalizacion WHERE orden_id = :o", o=orden_ultima(conn)) == 2


def test_egreso_alta_medica_y_anulacion(conn):
    h = ingresar(conn)
    falla(conn, "alta médica", "medicina.b", "egreso/registrar", ahora="2026-11-08T12:00", hospitalizacionId=h, fechaHora="2026-11-08T12:00", tipoEgreso="alta_medica", condicion="curado", altaMedica="2026-11-08T12:30")
    hacer(conn, "medicina.b", "egreso/registrar", ahora="2026-11-08T12:00", hospitalizacionId=h, fechaHora="2026-11-08T12:00", tipoEgreso="alta_medica", condicion="curado", altaMedica="2026-11-08T10:45")
    assert valor(conn, "SELECT texto_local(alta_medica_en) FROM egreso WHERE hospitalizacion_id = :h", h=h) == "2026-11-08T10:45"
    assert valor(conn, "SELECT estado FROM control_hc ORDER BY egreso_id DESC LIMIT 1") == "pendiente_entrega"
    hacer(conn, "medicina.b", "movimiento/anular", ahora="2026-11-08T12:10", movimientoId=valor(conn, "SELECT max(id) FROM movimiento"), motivo="Aún no sale")
    assert valor(conn, "SELECT estado FROM hospitalizacion WHERE id = :h", h=h) == "abierta"
    assert valor(conn, "SELECT count(*) FROM egreso WHERE hospitalizacion_id = :h AND NOT anulado", h=h) == 0


def test_completado_observado_y_validado(conn):
    h = ingresar(conn)
    hacer(conn, "medicina.b", "egreso/registrar", ahora="2026-11-08T12:00", hospitalizacionId=h, fechaHora="2026-11-08T12:00", tipoEgreso="alta_medica", condicion="curado")
    hacer(conn, "estadistica", "hc/recibir", ahora="2026-11-08T12:10", hc="555001")
    hacer(conn, "estadistica", "egreso/completar", ahora="2026-11-08T12:20", hospitalizacionId=h, cie10="J18.9", medicoId="med-1", secundarios=["I10"])
    hacer(conn, "estadistica", "egreso/observar", ahora="2026-11-08T12:30", hospitalizacionId=h, motivo="Revisar CIE-10")
    hacer(conn, "estadistica", "egreso/completar", ahora="2026-11-08T12:40", hospitalizacionId=h, cie10="I10", medicoId="med-1")
    assert valor(conn, "SELECT count(*) FROM diagnostico_egreso d JOIN egreso e ON e.id = d.egreso_id WHERE e.hospitalizacion_id = :h", h=h) == 1
    hacer(conn, "estadistica", "egreso/validar", ahora="2026-11-08T12:50", hospitalizacionId=h)
    hacer(conn, "estadistica", "hc/devolver", ahora="2026-11-08T13:00", hospitalizacionId=h)
    assert valor(conn, "SELECT estado FROM control_hc ORDER BY egreso_id DESC LIMIT 1") == "devuelta"


def test_cie_incompatible(conn):
    designar(conn, ordenar(conn, 2, paciente=paciente(2, sexo="M")))
    h = hosp_ultima(conn)
    hacer(conn, "medicina.b", "egreso/registrar", ahora="2026-11-08T12:00", hospitalizacionId=h, fechaHora="2026-11-08T12:00", tipoEgreso="alta_medica", condicion="curado")
    falla(conn, "obstétrico", "estadistica", "egreso/completar", ahora="2026-11-08T12:20", hospitalizacionId=h, cie10="O80", medicoId="med-1")


def test_traslado_a_servicio_no_incorporado(conn):
    h = ingresar(conn)
    hacer(conn, "medicina.b", "egreso/registrar", ahora="2026-11-08T12:00", hospitalizacionId=h, fechaHora="2026-11-08T12:00", tipoEgreso="traslado_no_incorporado", destino="Oncología")
    q = conn.execute(text("SELECT egresos, traslados_salida FROM cuadre_censo('medicina-b', '2026-11-08')")).first()
    assert q.traslados_salida == 1
    assert valor(conn, "SELECT estado FROM egreso WHERE hospitalizacion_id = :h", h=h) is None
    assert valor(conn, "SELECT count(*) FROM control_hc c JOIN egreso e ON e.id = c.egreso_id WHERE e.hospitalizacion_id = :h", h=h) == 0


def test_llegada_de_otro_servicio_cuenta_como_traslado(conn):
    designar(conn, ordenar(conn, 3, origen="otro_servicio", servicioProcedencia="oncologia"))
    q = conn.execute(text("SELECT ingresos, traslados_entrada FROM cuadre_censo('medicina-b', '2026-11-08')")).first()
    assert (q.ingresos, q.traslados_entrada) == (1, 1)  # el ingreso de las 08:15 de la demostración y este


def test_recien_nacido_y_paciente_sin_identificar(conn):
    hacer(conn, "admision", "orden/registrar", paciente={"hc": "888001", "tipoDocumento": "sin_documento", "nombres": "NN Varón", "sexo": "M"}, origen="emergencia", enviadaPor="Enfermería de Emergencia", departamentoId=MED)
    assert valor(conn, "SELECT fecha_nacimiento FROM paciente WHERE n_hc = '888001'") is None
    madre = valor(conn, "SELECT n_hc FROM paciente ORDER BY id LIMIT 1")
    hacer(conn, "admision", "orden/registrar", paciente={"hc": "888002", "tipoDocumento": "sin_documento", "nombres": "RN de Prueba", "sexo": "F", "nacimiento": "2026-11-08", "hcMadre": madre}, origen="consulta_externa", departamentoId=MED)
    assert valor(conn, "SELECT madre_id FROM paciente WHERE n_hc = '888002'") is not None
    falla(conn, "fecha de nacimiento", "admision", "orden/registrar", paciente={"hc": "888003", "tipoDocumento": "ce", "dni": "X1", "nombres": "Sin Fecha", "sexo": "F"}, origen="consulta_externa", departamentoId=MED)


def arrancar_hoy(c, servicio=INT):
    """Simula un servicio que se incorpora hoy, el único día que admite censo inicial."""
    c.execute(text("UPDATE servicio SET fecha_arranque = '2026-11-08' WHERE id = :s"), {"s": servicio})


def test_censo_inicial_con_fecha_estimada(conn):
    arrancar_hoy(conn)
    antes = conn.execute(text("SELECT saldo_anterior, ingresos FROM cuadre_censo(:s, '2026-11-08')"), {"s": INT}).first()
    hacer(conn, "medicina.int", "ingreso/previo", paciente=paciente(4), camaId="cama-i-04", fechaHora="")
    h = hosp_ultima(conn)
    assert valor(conn, "SELECT fecha_ingreso_estimada AND ingreso_previo_sistema FROM hospitalizacion WHERE id = :h", h=h)
    assert valor(conn, "SELECT orden_id FROM hospitalizacion WHERE id = :h", h=h) is None
    q = conn.execute(text("SELECT saldo_anterior, ingresos FROM cuadre_censo(:s, '2026-11-08')"), {"s": INT}).first()
    assert (q.saldo_anterior - antes.saldo_anterior, q.ingresos - antes.ingresos) == (1, 0)
    # Medicina B arrancó el 05/11: ya no admite censo inicial.
    falla(conn, "día de arranque", "medicina.b", "ingreso/previo", paciente=paciente(5), camaId="cama-b-01", fechaHora="")


def test_la_fecha_estimada_no_cuenta_en_el_promedio(conn):
    arrancar_hoy(conn)
    hacer(conn, "medicina.int", "ingreso/previo", paciente=paciente(4), camaId="cama-i-04", fechaHora="")
    h = hosp_ultima(conn)
    hacer(conn, "medicina.int", "egreso/registrar", ahora="2026-11-08T12:00", hospitalizacionId=h, fechaHora="2026-11-08T12:00", tipoEgreso="alta_medica", condicion="curado")
    hacer(conn, "estadistica", "egreso/completar", ahora="2026-11-08T12:20", hospitalizacionId=h, cie10="I10", medicoId="med-1")
    hacer(conn, "estadistica", "egreso/validar", ahora="2026-11-08T12:30", hospitalizacionId=h)
    conn.execute(text("SELECT refrescar_indicadores()"))
    assert tuple(conn.execute(text("SELECT e, f FROM mv_indicadores_mes WHERE base = 'mapeo' AND servicio_id = :s"), {"s": INT}).first()) == (1, None)


def test_corregir_fecha_de_ingreso(conn):
    h = valor(conn, "SELECT h.id FROM hospitalizacion h JOIN movimiento m ON m.hospitalizacion_id = h.id JOIN cama c ON c.id = m.cama_id WHERE c.codigo = 'B-06'")
    falla(conn, "motivo", "estadistica", "ingreso/corregir", hospitalizacionId=h, fechaHora="2026-11-08T08:00", motivo="")
    falla(conn, "permiso", "medicina.b", "ingreso/corregir", hospitalizacionId=h, fechaHora="2026-11-08T08:00", motivo="x")
    hacer(conn, "estadistica", "ingreso/corregir", hospitalizacionId=h, fechaHora="2026-11-08T08:00", motivo="La HC dice 08:00")
    assert valor(conn, "SELECT texto_local(fecha_ingreso) FROM hospitalizacion WHERE id = :h", h=h) == "2026-11-08T08:00"
    assert valor(conn, "SELECT texto_local(desde) FROM ocupacion_cama WHERE hospitalizacion_id = :h", h=h) == "2026-11-08T08:00"
    assert valor(conn, "SELECT motivo FROM correccion_movimiento ORDER BY id DESC LIMIT 1") == "La HC dice 08:00"
    falla(conn, "está cerrado", "estadistica", "ingreso/corregir", hospitalizacionId=h, fechaHora="2026-11-07T22:00", motivo="Otro día")


def test_mantenimiento_sin_reemplazo(conn):
    hacer(conn, "medicina.b", "falla/reportar", camaId="cama-b-01", falla="Rueda rota")
    o = valor(conn, "SELECT max(id) FROM orden_mantenimiento")
    falla(conn, "permiso", "medicina.b", "mant/retirar", ordenId=o, conReemplazo=False)
    hacer(conn, "mantenimiento", "mant/retirar", ordenId=o, conReemplazo=False)
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "fuera"
    hacer(conn, "mantenimiento", "mant/resolver", ordenId=o, diagnostico="Cambio de rueda", resultado="reparada")
    hacer(conn, "mantenimiento", "mant/entregar", ordenId=o)
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "fuera"
    hacer(conn, "medicina.b", "mant/recibir", ordenId=o)
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "libre"
    assert valor(conn, "SELECT estado FROM activo_cama WHERE codigo_interno = 'CAM-B-01'") == "en_uso"


def test_baja_sin_reemplazo_sigue_fuera_hasta_otra_cama(conn):
    hacer(conn, "medicina.b", "falla/reportar", camaId="cama-b-01", falla="Estructura rota")
    o = valor(conn, "SELECT max(id) FROM orden_mantenimiento")
    hacer(conn, "mantenimiento", "mant/retirar", ordenId=o, conReemplazo=False)
    hacer(conn, "mantenimiento", "mant/resolver", ordenId=o, diagnostico="Irreparable", resultado="baja")
    assert valor(conn, "SELECT estado FROM activo_cama WHERE codigo_interno = 'CAM-B-01'") == "de_baja"
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "fuera"
    hacer(conn, "mantenimiento", "mant/entregar", ordenId=o)
    hacer(conn, "medicina.b", "mant/recibir", ordenId=o)
    assert valor(conn, "SELECT codigo_interno FROM activo_cama WHERE cama_id = 'cama-b-01'") == "CAM-B-01-R1"
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "libre"


def test_mantenimiento_con_reemplazo(conn):
    hacer(conn, "medicina.b", "falla/reportar", camaId="cama-b-01", falla="Colchón")
    o = valor(conn, "SELECT max(id) FROM orden_mantenimiento")
    hacer(conn, "mantenimiento", "mant/retirar", ordenId=o, conReemplazo=True)
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "libre"
    assert valor(conn, "SELECT estado FROM activo_cama WHERE codigo_interno = 'CAM-B-01'") == "en_mantenimiento"
    hacer(conn, "mantenimiento", "mant/resolver", ordenId=o, diagnostico="Reparado", resultado="reparada")
    assert valor(conn, "SELECT estado FROM orden_mantenimiento WHERE id = :o", o=o) == "cerrada"
    assert valor(conn, "SELECT estado FROM activo_cama WHERE codigo_interno = 'CAM-B-01'") == "en_almacen"


def test_no_se_retira_con_paciente(conn):
    ingresar(conn)
    hacer(conn, "medicina.b", "falla/reportar", camaId="cama-b-01", falla="Baranda")
    falla(conn, "tiene un paciente", "mantenimiento", "mant/retirar", ordenId=valor(conn, "SELECT max(id) FROM orden_mantenimiento"), conReemplazo=False)


def test_bloqueo_tiene_historia(conn):
    hacer(conn, "medicina.b", "cama/bloquear", camaId="cama-b-01", motivo="Aislamiento")
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "bloqueada"
    hacer(conn, "medicina.b", "cama/desbloquear", ahora="2026-11-08T12:00", camaId="cama-b-01")
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == "libre"
    assert valor(conn, "SELECT count(*) FROM bloqueo_cama WHERE cama_id = 'cama-b-01'") == 1


def test_censo_cierre_observacion_y_reapertura(conn):
    d = "2026-11-08"
    falla(conn, "24:00", "medicina.b", "censo/cerrar", servicioId="medicina-b", dia=d, conteoFisico=10)
    ma = "2026-11-09T07:00"
    corte = valor(conn, "SELECT pacientes_corte FROM cuadre_censo('medicina-b', :d)", d=d)
    falla(conn, "observación", "medicina.b", "censo/cerrar", ahora=ma, servicioId="medicina-b", dia=d, conteoFisico=corte + 1)
    hacer(conn, "medicina.b", "censo/nota", ahora=ma, servicioId="medicina-b", dia=d, hospitalizacionId=valor(conn, "SELECT min(id) FROM hospitalizacion WHERE estado = 'abierta'"), nota="Familiar avisado")
    hacer(conn, "medicina.b", "censo/cerrar", ahora=ma, servicioId="medicina-b", dia=d, conteoFisico=corte)
    assert valor(conn, "SELECT count(*) FROM censo_detalle c JOIN censo_diario d ON d.id = c.censo_id WHERE d.fecha = :d AND d.servicio_id = 'medicina-b' AND c.observacion = 'Familiar avisado'", d=d) == 1
    falla(conn, "permiso", "medicina.b", "censo/reabrir", ahora=ma, servicioId="medicina-b", dia=d, motivo="x")
    hacer(conn, "estadistica", "censo/reabrir", ahora=ma, servicioId="medicina-b", dia=d, motivo="Corrección")
    hacer(conn, "medicina.b", "censo/cerrar", ahora=ma, servicioId="medicina-b", dia=d, conteoFisico=corte)
    assert valor(conn, "SELECT estado FROM censo_diario WHERE fecha = :d AND servicio_id = 'medicina-b'", d=d) == "cerrado"


def test_censo_bloqueado_a_las_ocho(conn):
    falla(conn, "Pasaron las 08:00", "medicina.b", "censo/cerrar", ahora="2026-11-09T08:01", servicioId="medicina-b", dia="2026-11-08", conteoFisico=10)


def cerrar_todo_noviembre(c, ahora="2026-12-01T09:00"):
    for egreso in c.execute(text("SELECT hospitalizacion_id, estado FROM egreso WHERE NOT anulado AND estado IS NOT NULL")).all():
        if egreso.estado == "pendiente_hc":
            hacer(c, "estadistica", "egreso/completar", ahora=ahora, hospitalizacionId=egreso.hospitalizacion_id, cie10="I10", medicoId="med-1")
        if egreso.estado in ("pendiente_hc", "completo"):
            hacer(c, "estadistica", "egreso/validar", ahora=ahora, hospitalizacionId=egreso.hospitalizacion_id)
    servicios = c.execute(text("SELECT id, fecha_arranque FROM servicio WHERE fecha_arranque IS NOT NULL")).all()
    for s in servicios:
        for dia in dias_entre(s.fecha_arranque.isoformat(), "2026-11-30"):
            if valor(c, "SELECT estado FROM censo_diario WHERE servicio_id = :s AND fecha = :d", s=s.id, d=dia) != "cerrado":
                n = valor(c, "SELECT pacientes_corte FROM cuadre_censo(:s, :d)", s=s.id, d=dia)
                hacer(c, "sistema", "censo/cerrar", ahora=ahora, servicioId=s.id, dia=dia, conteoFisico=n)


def test_cierre_de_mes_y_ajuste(conn):
    falla(conn, "en curso", "estadistica", "mes/cerrar", mes="2026-11")
    falla(conn, "Falta cerrar", "estadistica", "mes/cerrar", ahora="2026-12-01T09:00", mes="2026-11")
    cerrar_todo_noviembre(conn)
    falla(conn, "permiso", "medicina.b", "mes/cerrar", ahora="2026-12-01T09:00", mes="2026-11")
    falla(conn, "mes cerrado", "estadistica", "mes/ajustar", ahora="2026-12-01T09:00", mes="2026-11", variable="E", valorCorregido=1, motivo="x")
    hacer(conn, "estadistica", "mes/cerrar", ahora="2026-12-01T09:00", mes="2026-11")
    assert valor(conn, "SELECT count(*) FROM egreso WHERE estado = 'cerrado'") == 3
    assert valor(conn, "SELECT dotacion_version_id FROM periodo WHERE mes = '2026-11-01'") == "relacion-249"
    a = valor(conn, "SELECT a FROM indicador_mes_cerrado WHERE base = 'mapeo' AND servicio_id = 'medicina-b'")
    assert a == 24

    # Lo cerrado queda fijo: no se reabre, no se mueve y el plano ya no lo altera.
    falla(conn, "ya está cerrado", "estadistica", "censo/reabrir", ahora="2026-12-01T09:00", servicioId="medicina-b", dia="2026-11-07", motivo="x")
    conn.execute(text("UPDATE cama SET activa = false WHERE id = 'cama-b-24'"))
    conn.execute(text("SELECT refrescar_indicadores()"))
    assert valor(conn, "SELECT a FROM mv_indicadores_mes WHERE base = 'mapeo' AND servicio_id = 'medicina-b'") == 23
    assert valor(conn, "SELECT a FROM indicador_mes_cerrado WHERE base = 'mapeo' AND servicio_id = 'medicina-b'") == 24

    hacer(conn, "estadistica", "mes/ajustar", ahora="2026-12-01T09:00", mes="2026-11", servicioId="medicina-b", variable="E", valorCorregido=4, motivo="Egreso hallado en auditoría")
    estado = construir(conn, cuenta(conn, "estadistica"), "2026-12-01T09:00")
    assert estado["mesesCerrados"] == ["2026-11"]
    assert estado["ajustes"][0]["valorCorregido"] == 4
    assert [f for f in estado["indicadoresCerrados"]["2026-11"] if f["servicioId"] == "medicina-b"][0]["A"] == 24


def test_sin_prestamos_el_cambio_de_cama_es_del_mismo_servicio(conn):
    h = ingresar(conn)
    falla(conn, "mismo servicio", "medicina.b", "traslado/registrar", hospitalizacionId=h, servicioDestino="medicina-b", camaId="cama-i-04", fechaHora=AHORA)
    assert valor(conn, "SELECT prestadas FROM v_resumen_camas WHERE servicio_id = :s", s=INT) == 0


def test_renoxi_marcar(conn):
    falla(conn, "permiso", "medicina.b", "renoxi/marcar", dia="2026-11-07")
    hacer(conn, "estadistica", "renoxi/marcar", dia="2026-11-07")
    assert valor(conn, "SELECT cuenta_id FROM renoxi_carga WHERE dia = '2026-11-07'") == "estadistica"


def test_cada_accion_deja_bitacora(conn):
    antes = valor(conn, "SELECT count(*) FROM bitacora")
    ingresar(conn)
    assert valor(conn, "SELECT count(*) FROM bitacora") == antes + 2
    assert valor(conn, "SELECT cuenta_id FROM bitacora ORDER BY id DESC LIMIT 1") == "dep.medicina"


def test_plano_publicado_da_de_baja_sin_borrar(conn):
    jefe = cuenta(conn, "estadistica")
    plano = construir(conn, jefe, AHORA)["plano"]
    original = len(plano["camas"])
    libre = next(c for c in plano["camas"] if c["id"] == "cama-b-01")
    plano["camas"] = [c for c in plano["camas"] if c is not libre]
    r = guardar_plano(conn, jefe, plano, AHORA, None)
    assert r["bajas"] == 1 and r["camas"] == original - 1
    assert valor(conn, "SELECT activa FROM cama WHERE id = 'cama-b-01'") is False
    assert valor(conn, "SELECT count(*) FROM v_estado_cama WHERE cama_id = 'cama-b-01'") == 0


def test_plano_no_quita_cama_ocupada(conn):
    jefe = cuenta(conn, "estadistica")
    plano = construir(conn, jefe, AHORA)["plano"]
    plano["camas"] = [c for c in plano["camas"] if c["id"] != "cama-b-03"]
    with pytest.raises(ErrorRegla, match="tiene un paciente"):
        with conn.begin_nested():
            guardar_plano(conn, jefe, plano, AHORA, None)


def test_un_rol_de_consulta_no_recibe_datos_de_pacientes(conn):
    """Hoy no hay cuentas de consulta activas; la regla queda para cuando vuelva Dirección."""
    e = construir(conn, {"id": "x", "rol": "consulta", "servicios": []}, AHORA)
    assert e["pacientes"] == [] and e["ordenes"] == []
    assert all(h["pacienteId"] is None and h["diagnosticoIngreso"] == "" for h in e["hospitalizaciones"])
    assert all(h["egreso"] is None or h["egreso"]["cie10"] == [] for h in e["hospitalizaciones"])
