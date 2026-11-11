"""API del sistema. Todas las escrituras pasan por `acciones.aplicar`."""

import json

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from app import acciones, estado
from app.config import es_demo, url_app, url_owner
from app.sesion import clave_correcta, crear_token, leer_token
from app.tiempo import dia_de, dias_entre, sumar_dias

app = FastAPI(title="Egresos Hospitalarios")
motor = create_engine(url_app(), pool_pre_ping=True, connect_args={"options": "-c timezone=UTC"})

MENSAJES = {
    "23P01": "Dos pacientes ocuparían la misma cama en ese horario.",
    "23505": "Ya existe un registro igual: revisa si el paciente ya tiene una orden u hospitalización abierta.",
    "23514": "La base rechazó el registro porque incumple una regla del sistema.",
    "23503": "El registro hace referencia a un dato que no existe.",
    "23001": "Ese registro no se puede borrar: se anula con motivo.",
}


def _rechazo(mensaje: str, codigo: int = 422) -> HTTPException:
    return HTTPException(status_code=codigo, detail=mensaje)


def _cuenta_de(conexion, cuenta_id: str):
    fila = conexion.execute(text("SELECT id, nombre, rol FROM cuenta WHERE id = :c AND activo"), {"c": cuenta_id}).mappings().first()
    if not fila:
        return None
    servicios = conexion.execute(text("SELECT servicio_id FROM cuenta_servicio WHERE cuenta_id = :c"), {"c": cuenta_id}).scalars().all()
    return {**fila, "servicios": list(servicios)}


def cuenta_actual(authorization: str | None = Header(default=None)) -> dict:
    cuenta_id = leer_token((authorization or "").removeprefix("Bearer ").strip())
    if not cuenta_id:
        raise _rechazo("La sesión terminó. Vuelve a entrar.", 401)
    with motor.connect() as conexion:
        cuenta = _cuenta_de(conexion, cuenta_id)
    if not cuenta:
        raise _rechazo("La cuenta ya no está activa.", 401)
    return cuenta


def _solo_demo() -> None:
    if not es_demo():
        raise _rechazo("Solo disponible en la demostración.", 404)


def _escribir(funcion):
    """Ejecuta en una transacción y traduce los rechazos a un mensaje para la pantalla."""
    try:
        with motor.begin() as conexion:
            return funcion(conexion)
    except acciones.ErrorRegla as error:
        raise _rechazo(str(error)) from error
    except DBAPIError as error:
        sqlstate = getattr(error.orig, "sqlstate", None)
        if sqlstate in MENSAJES:
            raise _rechazo(MENSAJES[sqlstate]) from error
        raise


@app.post("/api/sesion")
def iniciar_sesion(datos: dict):
    usuario = str(datos.get("usuario") or "").strip()
    with motor.connect() as conexion:
        fila = conexion.execute(text("SELECT id, clave_hash FROM cuenta WHERE usuario = :u AND activo"), {"u": usuario}).mappings().first()
    if not fila or not clave_correcta(str(datos.get("clave") or ""), fila["clave_hash"]):
        raise _rechazo("Usuario o contraseña incorrectos.", 401)
    return {"token": crear_token(fila["id"]), "cuentaId": fila["id"]}


@app.post("/api/sesion/cambiar")
def cambiar_cuenta(datos: dict, _cuenta: dict = Depends(cuenta_actual)):
    _solo_demo()
    with motor.connect() as conexion:
        destino = _cuenta_de(conexion, str(datos.get("cuentaId")))
    if not destino:
        raise _rechazo("Esa cuenta no existe.")
    return {"token": crear_token(destino["id"]), "cuentaId": destino["id"]}


@app.get("/api/estado")
def leer_estado(cuenta: dict = Depends(cuenta_actual)):
    with motor.connect() as conexion:
        return estado.construir(conexion, cuenta, acciones.ahora_de(conexion, es_demo()))


@app.post("/api/acciones")
def ejecutar_accion(accion: dict, request: Request, cuenta: dict = Depends(cuenta_actual)):
    def hacer(conexion):
        acciones.aplicar(conexion, cuenta, accion, acciones.ahora_de(conexion, es_demo()), request.client.host if request.client else None)
    _escribir(hacer)
    return {"ok": True}


@app.post("/api/demo/reloj")
def mover_reloj(datos: dict, _cuenta: dict = Depends(cuenta_actual)):
    _solo_demo()
    nuevo = datos.get("ahora")
    with create_engine(url_owner()).begin() as conexion:
        actual = acciones.ahora_de(conexion, True)
        if not isinstance(nuevo, str) or nuevo <= actual:
            return {"ok": False}
        conexion.execute(text("UPDATE parametro SET valor = CAST(:v AS jsonb) WHERE clave = 'reloj_demo'"), {"v": json.dumps(nuevo)})
    return {"ok": True}


@app.post("/api/demo/cerrar-censos")
def cerrar_censos_pendientes(_cuenta: dict = Depends(cuenta_actual)):
    """Atajo de la demostración para llegar al cierre de mes sin cerrar día por día."""
    _solo_demo()

    def hacer(conexion):
        ahora = acciones.ahora_de(conexion, True)
        acciones.preparar(conexion, acciones.SISTEMA, None)
        c = acciones.Ctx(conexion, acciones.SISTEMA, ahora)
        cerrados = 0
        ayer = sumar_dias(dia_de(ahora), -1)
        for servicio in c.servicios_con_camas():
            inicio = c.arranque(servicio)
            if inicio > ayer:
                continue
            for dia in dias_entre(inicio, ayer):
                r = c.registro_censo(servicio, dia)
                if r and r["estado"] == "cerrado":
                    continue
                q = c.uno("SELECT * FROM cuadre_censo(:s, CAST(:d AS date))", s=servicio, d=dia)
                cuadra = q["saldo_anterior"] + q["ingresos"] + q["traslados_entrada"] - q["egresos"] - q["traslados_salida"] == q["pacientes_corte"]
                acciones.guardar_censo(conexion, servicio, dia, q["pacientes_corte"], "" if cuadra else "Cierre automático de la demostración", ahora, "sistema")
                cerrados += 1
        c.ejec("SELECT refrescar_indicadores()")
        c.ejec(
            """INSERT INTO bitacora (fecha_hora, cuenta_id, tipo, descripcion, detalle)
               VALUES (desde_local(:ahora), 'sistema', 'censo/cerrar', 'Cerró los censos pendientes de la demostración', :detalle)""",
            ahora=ahora, detalle=f"{cerrados} censos",
        )
        return {"cerrados": cerrados}

    return _escribir(hacer)


@app.post("/api/demo/reiniciar")
def reiniciar_demo(_cuenta: dict = Depends(cuenta_actual)):
    _solo_demo()
    from semillas.cargar_demostracion import reiniciar

    with create_engine(url_owner()).begin() as conexion:
        reiniciar(conexion)
    return {"ok": True}
