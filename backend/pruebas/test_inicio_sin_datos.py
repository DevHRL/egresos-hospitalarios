"""El flujo completo desde una base sin datos de pacientes, con las nueve cuentas.

Es el ensayo de la prueba manual con datos nuevos: `iniciar_sin_datos` deja la
base vacía y aquí se recorre todo, de la orden de Admisión al cierre del mes.
Con la variable VOLCAR_ESTADOS=<carpeta> guarda el estado que recibe cada
cuenta (vacío y al final), para revisar las pantallas con esos datos."""

import json
import os
from pathlib import Path

import pytest
from alembic import command
from sqlalchemy import create_engine, text

from app.acciones import ErrorRegla, aplicar
from app.config import url_owner
from app.estado import construir
from pruebas.conftest import alembic, recrear
from semillas.iniciar_sin_datos import iniciar

BASE = "egresos_inicio"
ARRANQUE = "2026-11-28"
CUENTAS = ("admision", "dep.medicina", "medicina.a", "medicina.b", "medicina.int", "uci", "quemados", "estadistica", "mantenimiento")


@pytest.fixture(scope="module")
def conn():
    recrear(BASE)
    command.upgrade(alembic(BASE), "head")
    motor = create_engine(url_owner(BASE), connect_args={"options": "-c timezone=UTC"})
    with motor.connect() as c:
        iniciar(c, ARRANQUE, f"{ARRANQUE}T07:00")
        c.commit()
        yield c
    motor.dispose()


def cuenta(c, cuenta_id):
    fila = c.execute(text("SELECT id, rol FROM cuenta WHERE id = :c AND activo"), {"c": cuenta_id}).mappings().first()
    servicios = c.execute(text("SELECT servicio_id FROM cuenta_servicio WHERE cuenta_id = :c"), {"c": cuenta_id}).scalars().all()
    return {**fila, "servicios": list(servicios)}


def hacer(c, quien, ahora, tipo, **datos):
    """Una acción por transacción, como en la API."""
    try:
        aplicar(c, cuenta(c, quien), {"tipo": tipo, **datos}, ahora)
    except Exception:
        c.rollback()
        raise
    c.commit()


def valor(c, sql, **p):
    return c.execute(text(sql), p).scalar()


def paciente(n, sexo="F"):
    return {"hc": f"70000{n}", "dni": f"7000000{n}", "nombres": f"Nuevo {n}", "sexo": sexo, "nacimiento": "1975-05-05"}


def hosp_de(c, hc):
    return valor(c, "SELECT h.id FROM hospitalizacion h JOIN paciente p ON p.id = h.paciente_id WHERE p.n_hc = :hc ORDER BY h.id DESC LIMIT 1", hc=hc)


def volcar(c, etiqueta):
    carpeta = os.environ.get("VOLCAR_ESTADOS")
    if not carpeta:
        return
    Path(carpeta).mkdir(parents=True, exist_ok=True)
    for quien in CUENTAS:
        e = construir(c, cuenta(c, quien), valor(c, "SELECT valor #>> '{}' FROM parametro WHERE clave = 'reloj_demo'"))
        Path(carpeta, f"{etiqueta}-{quien}.json").write_text(json.dumps(e, default=str), encoding="utf-8")


def test_la_base_queda_sin_datos_de_pacientes(conn):
    for tabla in ("paciente", "orden_hospitalizacion", "hospitalizacion", "movimiento", "censo_diario", "egreso", "orden_mantenimiento", "bitacora"):
        assert valor(conn, f"SELECT count(*) FROM {tabla}") == 0, tabla
    assert valor(conn, "SELECT count(*) FROM cama WHERE activa") == 67
    assert valor(conn, "SELECT count(*) FROM cuenta WHERE activo AND rol <> 'sistema'") == 9
    assert valor(conn, "SELECT count(*) FROM cie10") > 0 and valor(conn, "SELECT count(*) FROM medico") > 0
    assert sorted(conn.execute(text("SELECT id FROM servicio WHERE fecha_arranque IS NOT NULL")).scalars()) == ["cuidados-criticos", "medicina-a", "medicina-b", "medicina-intermedios", "quemados"]
    for quien in CUENTAS:
        e = construir(conn, cuenta(conn, quien), f"{ARRANQUE}T07:00")
        assert e["pacientes"] == [] and e["hospitalizaciones"] == [] and len(e["camas"]) == 67
    volcar(conn, "vacio")


def test_flujo_completo_con_las_nueve_cuentas(conn):
    d = ARRANQUE
    # Día de arranque: quien ya estaba hospitalizado entra por censo inicial.
    hacer(conn, "medicina.int", f"{d}T07:30", "ingreso/previo", paciente=paciente(0), camaId="cama-i-01", fechaHora="")

    # Admisión → departamento → piso.
    hacer(conn, "admision", f"{d}T08:00", "orden/registrar", paciente=paciente(1), origen="emergencia", enviadaPor="Enfermería de Emergencia", departamentoId="medicina", diagnosticoIngreso="Neumonía")
    orden = valor(conn, "SELECT max(id) FROM orden_hospitalizacion")
    with pytest.raises(ErrorRegla, match="designa"):
        hacer(conn, "medicina.b", f"{d}T08:30", "ingreso/confirmar", ordenId=orden, camaId="cama-b-01", fechaHora=f"{d}T08:30")
    hacer(conn, "dep.medicina", f"{d}T08:30", "ingreso/confirmar", ordenId=orden, camaId="cama-b-01", fechaHora=f"{d}T08:30")
    h1 = hosp_de(conn, "700001")
    hacer(conn, "medicina.b", f"{d}T09:00", "soporte/cambiar", hospitalizacionId=h1, soporte="o2", fechaHora=f"{d}T09:00")
    hacer(conn, "medicina.b", f"{d}T10:00", "traslado/registrar", hospitalizacionId=h1, servicioDestino="medicina-intermedios")
    t = valor(conn, "SELECT max(id) FROM traslado")
    hacer(conn, "medicina.int", f"{d}T10:30", "traslado/confirmar", trasladoId=t, camaId="cama-i-02", fechaHora=f"{d}T10:30")

    # Alta.
    hacer(conn, "admision", f"{d}T11:00", "orden/registrar", paciente=paciente(2), origen="consulta_externa", departamentoId="medicina")
    hacer(conn, "dep.medicina", f"{d}T11:10", "ingreso/confirmar", ordenId=valor(conn, "SELECT max(id) FROM orden_hospitalizacion"), camaId="cama-b-02", fechaHora=f"{d}T11:10")
    hacer(conn, "medicina.b", f"{d}T15:00", "egreso/registrar", hospitalizacionId=hosp_de(conn, "700002"), fechaHora=f"{d}T15:00", tipoEgreso="alta_medica", condicion="curado")

    # Traslado a otro departamento: cierra al salir.
    hacer(conn, "admision", f"{d}T12:00", "orden/registrar", paciente=paciente(3, "M"), origen="consulta_externa", departamentoId="medicina")
    hacer(conn, "dep.medicina", f"{d}T12:10", "ingreso/confirmar", ordenId=valor(conn, "SELECT max(id) FROM orden_hospitalizacion"), camaId="cama-b-03", fechaHora=f"{d}T12:10")
    hacer(conn, "medicina.b", f"{d}T16:00", "egreso/registrar", hospitalizacionId=hosp_de(conn, "700003"), fechaHora=f"{d}T16:00", tipoEgreso="traslado_no_incorporado", destino="Cirugía")
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-b-03'") == "libre"

    # UCI y Quemados: Admisión envía a la unidad y la propia unidad designa la cama.
    hacer(conn, "admision", f"{d}T12:30", "orden/registrar", paciente=paciente(4), origen="emergencia", enviadaPor="Enfermería de Emergencia", departamentoId="uci-medicina")
    hacer(conn, "uci", f"{d}T12:40", "ingreso/confirmar", ordenId=valor(conn, "SELECT max(id) FROM orden_hospitalizacion"), camaId="cama-u-02", fechaHora=f"{d}T12:40")
    hacer(conn, "uci", f"{d}T13:00", "soporte/cambiar", hospitalizacionId=hosp_de(conn, "700004"), soporte="vm", fechaHora=f"{d}T13:00")
    hacer(conn, "admision", f"{d}T13:10", "orden/registrar", paciente=paciente(5), origen="emergencia", enviadaPor="Enfermería de Emergencia", departamentoId="quemados")
    hacer(conn, "quemados", f"{d}T13:20", "ingreso/confirmar", ordenId=valor(conn, "SELECT max(id) FROM orden_hospitalizacion"), camaId="cama-q-01", fechaHora=f"{d}T13:20")

    # Medicina A: designa el departamento, como en B; el piso opera al paciente.
    hacer(conn, "admision", f"{d}T13:30", "orden/registrar", paciente=paciente(6, "M"), origen="consulta_externa", departamentoId="medicina")
    orden = valor(conn, "SELECT max(id) FROM orden_hospitalizacion")
    with pytest.raises(ErrorRegla, match="designa"):
        hacer(conn, "medicina.a", f"{d}T13:40", "ingreso/confirmar", ordenId=orden, camaId="cama-a-24", fechaHora=f"{d}T13:40")
    hacer(conn, "dep.medicina", f"{d}T13:40", "ingreso/confirmar", ordenId=orden, camaId="cama-a-24", fechaHora=f"{d}T13:40")
    hacer(conn, "medicina.a", f"{d}T14:10", "soporte/cambiar", hospitalizacionId=hosp_de(conn, "700006"), soporte="o2", fechaHora=f"{d}T14:10")

    # Cama a mantenimiento y de vuelta.
    hacer(conn, "medicina.int", f"{d}T14:00", "falla/reportar", camaId="cama-i-05", falla="Freno trabado")
    om = valor(conn, "SELECT max(id) FROM orden_mantenimiento")
    hacer(conn, "mantenimiento", f"{d}T14:30", "mant/retirar", ordenId=om, conReemplazo=False)
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-i-05'") == "fuera"
    hacer(conn, "mantenimiento", f"{d}T16:00", "mant/resolver", ordenId=om, diagnostico="Freno ajustado", resultado="reparada")
    hacer(conn, "mantenimiento", f"{d}T16:30", "mant/entregar", ordenId=om)
    hacer(conn, "medicina.int", f"{d}T17:00", "mant/recibir", ordenId=om)
    assert valor(conn, "SELECT estado FROM v_estado_cama WHERE cama_id = 'cama-i-05'") == "libre"

    # Censos de cada noche, cerrados por cada piso antes de las 08:00.
    for dia, manana in (("2026-11-28", "2026-11-29"), ("2026-11-29", "2026-11-30"), ("2026-11-30", "2026-12-01")):
        for servicio, piso in (("medicina-a", "medicina.a"), ("medicina-b", "medicina.b"), ("medicina-intermedios", "medicina.int"), ("cuidados-criticos", "uci"), ("quemados", "quemados")):
            corte = valor(conn, "SELECT pacientes_corte FROM cuadre_censo(:s, CAST(:d AS date))", s=servicio, d=dia)
            hacer(conn, piso, f"{manana}T07:00", "censo/cerrar", servicioId=servicio, dia=dia, conteoFisico=corte, observacion="")
    assert valor(conn, "SELECT pacientes_corte FROM cuadre_censo('medicina-intermedios', '2026-11-28')") == 2

    # Estadística: HC, completado, validación, RENOXI y cierre del mes.
    h2 = hosp_de(conn, "700002")
    hacer(conn, "estadistica", "2026-11-29T09:00", "hc/recibir", hc="700002")
    hacer(conn, "estadistica", "2026-11-29T09:10", "egreso/completar", hospitalizacionId=h2, cie10="J18.9", medicoId="med-1")
    hacer(conn, "estadistica", "2026-11-29T09:20", "egreso/validar", hospitalizacionId=h2)
    hacer(conn, "estadistica", "2026-11-29T09:30", "renoxi/marcar", dia="2026-11-28")
    hacer(conn, "estadistica", "2026-12-01T09:00", "mes/cerrar", mes="2026-11")
    assert valor(conn, "SELECT estado FROM periodo WHERE mes = '2026-11-01'") == "cerrado"
    assert valor(conn, "SELECT e FROM indicador_mes_cerrado WHERE base = 'mapeo' AND servicio_id = 'medicina-b'") == 1

    # Cada cuenta recibe su estado sin error y la bitácora nombra a las nueve.
    for quien in CUENTAS:
        e = construir(conn, cuenta(conn, quien), "2026-12-01T09:00")
        assert len(e["hospitalizaciones"]) == 7
    assert set(conn.execute(text("SELECT DISTINCT cuenta_id FROM bitacora")).scalars()) == set(CUENTAS)
    conn.execute(text("UPDATE parametro SET valor = CAST(:v AS jsonb) WHERE clave = 'reloj_demo'"), {"v": json.dumps("2026-12-01T09:00")})
    conn.commit()
    volcar(conn, "final")
