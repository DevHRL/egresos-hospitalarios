"""Arranque sin datos ficticios: para probar el flujo a mano con datos nuevos.

Borra TODO (pacientes, órdenes, hospitalizaciones, censos, bitácora…) y deja solo
lo de referencia: estructura, plano, cuentas, dotación, parámetros, CIE-10 y
médicos. Pone la fecha de arranque de Medicina B e Intermedios y, en
desarrollo, el reloj de la demostración en la hora real, para poder adelantarlo
desde la barra superior (24:00, 08:00, mes siguiente).

    .venv/Scripts/python -m semillas.iniciar_sin_datos                     # muestra qué haría
    .venv/Scripts/python -m semillas.iniciar_sin_datos --confirmar         # arranca hoy
    .venv/Scripts/python -m semillas.iniciar_sin_datos --confirmar --arranque 2026-11-12

No borra nada sin `--confirmar`. Después, el día de arranque, enfermería registra
con «Censo inicial» a los pacientes que ya estaban hospitalizados."""

import argparse
import json
from datetime import date, datetime

from sqlalchemy import create_engine, text

from app.config import es_demo, url_owner
from semillas.cargar_demostracion import TABLAS
from semillas.cargar_maestros import cargar as cargar_maestros, exportar

INCORPORADOS = ("medicina-b", "medicina-intermedios")


def cargar_clinicos(conexion, datos: dict) -> None:
    """CIE-10 y médicos. Hoy son la muestra del prototipo (ver datos/clinicos.js)."""
    for c in datos["cie10"]:
        conexion.execute(text("INSERT INTO cie10 (codigo, nombre) VALUES (:c, :n) ON CONFLICT DO NOTHING"), {"c": c["value"], "n": c["label"]})
    for m in datos["medicos"]:
        conexion.execute(text("INSERT INTO medico (id, nombre) VALUES (:id, :n) ON CONFLICT DO NOTHING"), {"id": m["value"], "n": m["label"]})


def iniciar(conexion, arranque: str, reloj: str | None) -> None:
    datos = exportar()
    conexion.execute(text(f"TRUNCATE {TABLAS} RESTART IDENTITY CASCADE"))
    cargar_maestros(conexion, datos)
    conexion.execute(text("SELECT set_config('app.cuenta_id', 'sistema', true)"))
    cargar_clinicos(conexion, datos)
    conexion.execute(
        text("UPDATE servicio SET fecha_arranque = CAST(:d AS date) WHERE id = ANY(:s)"), {"d": arranque, "s": list(INCORPORADOS)}
    )
    if reloj:
        conexion.execute(
            text("""INSERT INTO parametro (clave, vigente_desde, valor) VALUES ('reloj_demo', DATE '2000-01-01', CAST(:v AS jsonb))
                    ON CONFLICT (clave, vigente_desde) DO UPDATE SET valor = EXCLUDED.valor"""),
            {"v": json.dumps(reloj)},
        )
    conexion.execute(text("SELECT refrescar_indicadores()"))


def principal() -> None:
    p = argparse.ArgumentParser(description="Borra todos los datos y deja el sistema listo para cargar datos nuevos.")
    p.add_argument("--arranque", default=date.today().isoformat(), help="Día de arranque de Medicina B e Intermedios (AAAA-MM-DD). Por defecto, hoy.")
    p.add_argument("--confirmar", action="store_true", help="Sin esto no se borra nada.")
    a = p.parse_args()
    date.fromisoformat(a.arranque)
    reloj = datetime.now().strftime("%Y-%m-%dT%H:%M") if es_demo() else None
    if a.arranque > (reloj or datetime.now().strftime("%Y-%m-%d"))[:10]:
        raise SystemExit("El arranque no puede ser una fecha futura.")
    if not a.confirmar:
        print("No se borró nada. Con --confirmar se haría esto:")
        print("  - borrar pacientes, órdenes, hospitalizaciones, movimientos, censos, egresos, mantenimiento y bitácora;")
        print("  - cargar estructura, plano, las seis cuentas, dotación, parámetros, CIE-10 y médicos;")
        print(f"  - arranque de Medicina B e Intermedios: {a.arranque};")
        print(f"  - reloj de la demostración: {reloj or 'apagado (producción): hora real'}.")
        return
    with create_engine(url_owner()).begin() as c:
        iniciar(c, a.arranque, reloj)
    print(f"Listo: sin datos de pacientes. Arranque {a.arranque}.")


if __name__ == "__main__":
    principal()
