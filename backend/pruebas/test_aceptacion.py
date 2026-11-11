"""Criterios de aceptación de docs/tareas/base-de-datos-postgresql.md."""


import pytest
from alembic import command
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from pruebas.conftest import alembic, recrear
from semillas.cargar_maestros import cargar as cargar_maestros, exportar

B = "medicina-b"
I = "medicina-intermedios"


def uno(c, sql, **p):
    return c.execute(text(sql), p).scalar()


def fila(c, sql, **p):
    return tuple(c.execute(text(sql), p).first())


def rechaza(c, codigo, sql, /, **p):
    with pytest.raises(DBAPIError) as e:
        with c.begin_nested():
            c.execute(text(sql), p)
    assert e.value.orig.sqlstate == codigo


def test_motor_16(conn):
    assert uno(conn, "SHOW server_version_num").startswith("16")


@pytest.mark.parametrize("tabla,total", [("departamento", 16), ("servicio", 25), ("piso", 2), ("zona", 40), ("cama", 45), ("activo_cama", 45), ("cuenta", 13), ("dotacion_version", 2)])
def test_maestros(conn, tabla, total):
    assert uno(conn, f"SELECT count(*) FROM {tabla}") == total


def test_camas_por_servicio(conn):
    assert uno(conn, "SELECT count(*) FROM cama WHERE servicio_id = :s", s=B) == 24
    assert uno(conn, "SELECT count(*) FROM cama WHERE servicio_id = :s", s=I) == 5
    assert uno(conn, "SELECT count(*) FROM cama WHERE servicio_id = 'cuidados-criticos'") == 6


def test_dotaciones(conn):
    assert uno(conn, "SELECT sum(n_camas) FROM dotacion_detalle WHERE version_id = 'relacion-249'") == 249
    assert uno(conn, "SELECT sum(n_camas) FROM dotacion_detalle WHERE version_id = 'conteo-fisico-2026'") == 260


def test_maestros_idempotentes(conn):
    antes = uno(conn, "SELECT count(*) FROM cama") + uno(conn, "SELECT count(*) FROM dotacion_detalle") + uno(conn, "SELECT count(*) FROM cuenta_servicio")
    cargar_maestros(conn, exportar())
    assert antes == uno(conn, "SELECT count(*) FROM cama") + uno(conn, "SELECT count(*) FROM dotacion_detalle") + uno(conn, "SELECT count(*) FROM cuenta_servicio")


def test_demostracion(conn):
    assert uno(conn, "SELECT count(*) FROM paciente") == 19
    assert fila(conn, "SELECT count(*), count(*) FILTER (WHERE estado='ingresada'), count(*) FILTER (WHERE estado='pendiente') FROM orden_hospitalizacion") == (19, 16, 3)
    assert fila(conn, "SELECT count(*), count(*) FILTER (WHERE estado='abierta') FROM hospitalizacion") == (16, 13)
    assert fila(conn, "SELECT count(*) FILTER (WHERE tipo='ingreso'), count(*) FILTER (WHERE tipo='traslado'), count(*) FILTER (WHERE tipo='soporte'), count(*) FILTER (WHERE tipo='egreso') FROM movimiento") == (16, 1, 3, 3)
    assert uno(conn, "SELECT count(*) FROM traslado WHERE estado = 'confirmado'") == 1
    assert uno(conn, "SELECT count(*) FROM orden_mantenimiento") == 2
    assert sorted(r[0] for r in conn.execute(text("SELECT estado FROM egreso"))) == ["completo", "pendiente_hc", "validado"]
    assert uno(conn, "SELECT count(*) FROM censo_diario WHERE estado = 'cerrado'") == 6


@pytest.mark.parametrize(
    "dia,servicio,esperado",
    [
        ("2026-11-05", B, (0, 12, 0, 0, 0, 12, 12, 24)),
        ("2026-11-05", I, (0, 2, 0, 0, 0, 2, 2, 5)),
        ("2026-11-06", B, (12, 1, 0, 1, 0, 12, 12, 25)),
        ("2026-11-06", I, (2, 0, 0, 0, 0, 2, 2, 5)),
        ("2026-11-07", B, (12, 0, 0, 2, 1, 9, 9, 24)),
        ("2026-11-07", I, (2, 0, 1, 0, 0, 3, 3, 5)),
    ],
)
def test_censos(conn, dia, servicio, esperado):
    q = fila(conn, "SELECT saldo_anterior, ingresos, traslados_entrada, egresos, traslados_salida, pacientes_corte, pacientes_dia FROM cuadre_censo(:s, CAST(:d AS date))", s=servicio, d=dia)
    filas = uno(conn, "SELECT count(*) FROM filas_censo(:s, CAST(:d AS date))", s=servicio, d=dia)
    assert (*q, filas) == esperado


@pytest.mark.parametrize("servicio,esperado", [(B, (24, 23, 10, 13, 2, 1, 0)), (I, (5, 5, 3, 2, 1, 0, 0))])
def test_camas_al_final(conn, servicio, esperado):
    assert fila(conn, "SELECT total, operativas, ocupadas, disponibles, con_o2, fuera, bloqueadas FROM v_resumen_camas WHERE servicio_id = :s", s=servicio) == esperado


@pytest.mark.parametrize("servicio,esperado", [(B, (7, 2, 14)), (I, (2, 1, 2))])
def test_renoxi(conn, servicio, esperado):
    assert fila(conn, "SELECT sin_o2, con_o2, disponibles FROM renoxi_del_dia('2026-11-07') WHERE servicio_id = :s", s=servicio) == esperado


def test_renoxi_de_un_dia_anterior_al_retiro(conn):
    # B-18 se retiró el 07/11: el 06/11 todavía estaba operativa.
    assert uno(conn, "SELECT operativas FROM renoxi_del_dia('2026-11-06') WHERE servicio_id = :s", s=B) == 24


def test_indicadores(conn):
    b = fila(conn, "SELECT a, b, c, d, e, round(f, 2), round(g, 2), round(h, 2), round(i, 2) FROM mv_indicadores_mes WHERE base = 'mapeo' AND servicio_id = :s", s=B)
    assert tuple(float(x) for x in b) == (24, 33, 1, 72, 1, 1.00, 45.83, 0.04, 39.00)
    i = fila(conn, "SELECT a, b, c, d, e, f, round(g, 2), round(h, 2), i FROM mv_indicadores_mes WHERE base = 'mapeo' AND servicio_id = :s", s=I)
    assert (i[0], i[1], i[2], i[3], i[4], i[5], float(i[6]), float(i[7]), i[8]) == (5, 7, 0, 15, 0, None, 46.67, 0.0, None)
    assert uno(conn, "SELECT a FROM mv_indicadores_mes WHERE base = 'oficial' AND departamento_id = 'medicina'") == 42


# ── Rechazos ───────────────────────────────────────────────────────────


def abierta(c):
    return c.execute(text("SELECT id, paciente_id FROM hospitalizacion WHERE estado = 'abierta' ORDER BY id LIMIT 1")).first()


MOV = """INSERT INTO movimiento (hospitalizacion_id, tipo, fecha_hora, cuenta_id, cama_id, servicio_id)
         VALUES (:h, 'ingreso', CAST(:f AS timestamptz), 'sistema', :c, 'medicina-b')"""


def hospitalizacion_nueva(c, paciente=None, orden=None):
    if paciente is None:
        paciente = c.execute(
            text("""INSERT INTO paciente (n_hc, tipo_documento, numero_documento, nombres, sexo, fecha_nacimiento, origen, registrado_en)
                    VALUES ('777777', 'dni', '77777777', 'Prueba, Otra', 'F', '1980-01-01', 'local', now()) RETURNING id""")
        ).scalar()
    return c.execute(
        text("""INSERT INTO hospitalizacion (paciente_id, origen, fecha_ingreso, ingreso_previo_sistema)
                VALUES (:p, 'previo_sistema', now(), true) RETURNING id"""),
        {"p": paciente},
    ).scalar()


def test_segunda_hospitalizacion_abierta(conn):
    _, p = abierta(conn)
    rechaza(conn, "23505", "INSERT INTO hospitalizacion (paciente_id, origen, fecha_ingreso, ingreso_previo_sistema) VALUES (:p, 'previo_sistema', now(), true)", p=p)


def test_segundo_ingreso_vigente(conn):
    h, _ = abierta(conn)
    rechaza(conn, "23505", MOV, h=h, f="2026-11-08T12:00:00-05", c="cama-b-01")


def test_ingreso_en_cama_ocupada(conn):
    h = hospitalizacion_nueva(conn)
    rechaza(conn, "23P01", MOV, h=h, f="2026-11-08T09:00:00-05", c="cama-b-03")


def test_ingreso_diferido_antes_de_la_salida_anterior(conn):
    # B-22: su ocupante salió el 06/11 a las 10:00.
    h = hospitalizacion_nueva(conn)
    rechaza(conn, "23P01", MOV, h=h, f="2026-11-06T09:00:00-05", c="cama-b-22")


def test_anular_egreso_con_cama_reocupada(conn):
    m = uno(conn, "SELECT m.id FROM movimiento m JOIN cama c ON c.id = m.cama_id WHERE m.tipo = 'egreso' AND c.codigo = 'B-22'")
    rechaza(conn, "23P01", "UPDATE movimiento SET anulado = true, motivo_anulacion = 'x' WHERE id = :m", m=m)


def test_anular_sin_motivo(conn):
    m = uno(conn, "SELECT id FROM movimiento WHERE tipo = 'soporte' LIMIT 1")
    rechaza(conn, "23514", "UPDATE movimiento SET anulado = true WHERE id = :m", m=m)


def test_movimiento_en_mes_cerrado(conn):
    conn.execute(text("INSERT INTO periodo (mes, estado) VALUES ('2026-11-01', 'cerrado')"))
    m = uno(conn, "SELECT id FROM movimiento WHERE tipo = 'soporte' LIMIT 1")
    rechaza(conn, "23514", "UPDATE movimiento SET registrado_en = now() WHERE id = :m", m=m)


def test_habitacion_sin_servicio(conn):
    rechaza(conn, "23514", "INSERT INTO zona (id, piso_id, tipo, codigo, x, y, ancho, alto) VALUES ('z', 'piso-2', 'habitacion', 'Z-1', 0, 0, 1, 1)")


def test_orden_de_emergencia_sin_enviada_por(conn):
    p = abierta(conn)[1]
    rechaza(conn, "23514", "INSERT INTO orden_hospitalizacion (paciente_id, origen, servicio_id, fecha_hora, estado, registrada_por) VALUES (:p, 'emergencia', 'medicina-b', now(), 'anulada', 'sistema')", p=p)


def test_egreso_hospitalario_sin_condicion(conn):
    h = uno(conn, "SELECT hospitalizacion_id FROM egreso LIMIT 1")
    m = uno(conn, "SELECT movimiento_id FROM egreso LIMIT 1")
    rechaza(conn, "23514", "INSERT INTO egreso (hospitalizacion_id, movimiento_id, fecha_hora, tipo, servicio_id, estado, anulado) VALUES (:h, :m, now(), 'alta_medica', 'medicina-b', 'pendiente_hc', true)", h=h, m=m)


def test_borrar_movimiento(conn):
    m = uno(conn, "SELECT id FROM movimiento LIMIT 1")
    rechaza(conn, "23001", "DELETE FROM movimiento WHERE id = :m", m=m)


def test_dia_censo(conn):
    assert str(uno(conn, "SELECT dia_censo('2026-11-06 04:59+00')")) == "2026-11-05"


# ── Auditoría, roles y migraciones ─────────────────────────────────────


def test_auditoria(conn):
    conn.execute(text("SELECT set_config('app.cuenta_id', 'estadistica.jefe', true), set_config('app.ip', '10.1.2.3', true)"))
    conn.execute(text("UPDATE medico SET nombre = 'Cambio' WHERE id = 'med-1'"))
    a = conn.execute(text("SELECT cuenta_id, host(ip), valor_anterior->>'nombre', valor_nuevo->>'nombre' FROM auditoria WHERE tabla = 'medico' AND registro_id = 'med-1' ORDER BY id DESC LIMIT 1")).first()
    assert tuple(a) == ("estadistica.jefe", "10.1.2.3", "Dra. Demo Salazar", "Cambio")


def test_rol_lectura(conn):
    conn.execute(text("SET LOCAL ROLE egresos_lectura"))
    assert uno(conn, "SELECT count(*) FROM v_tablero") == 5
    rechaza(conn, "42501", "SELECT * FROM paciente")


def test_rol_aplicacion(conn):
    conn.execute(text("SET LOCAL ROLE egresos_app"))
    rechaza(conn, "42501", "DELETE FROM movimiento")
    rechaza(conn, "42501", "INSERT INTO ocupacion_cama (hospitalizacion_id, cama_id, servicio_id, desde) VALUES (1, 'cama-b-01', 'medicina-b', now())")
    rechaza(conn, "42501", "UPDATE auditoria SET accion = 'x'")


def test_la_vista_de_tablero_no_tiene_datos_personales(conn):
    columnas = {r[0] for r in conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'v_tablero'"))}
    assert not columnas & {"nombres", "n_hc", "paciente_id", "numero_documento"}


def test_migraciones_ida_y_vuelta():
    nombre = "egresos_migracion"
    recrear(nombre)
    config = alembic(nombre)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")
