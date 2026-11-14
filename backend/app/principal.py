"""API del sistema. Todas las escrituras pasan por `acciones.aplicar`."""

import json

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from app import acciones, autenticacion, estado
from app.claves import LARGO_MAXIMO
from app.config import es_demo, url_app, url_owner
from app.seguridad import TokenInvalido, leer_token, secreto
from app.tiempo import dia_de, dias_entre, sumar_dias

app = FastAPI(title="Egresos Hospitalarios")
secreto()  # Sin un JWT_SECRETO válido la API no arranca, como la de Estadística.
motor = create_engine(url_app(), pool_pre_ping=True, connect_args={"options": "-c timezone=UTC"})

MENSAJES = {
    "23P01": "Dos pacientes ocuparían la misma cama en ese horario.",
    "23505": "Ya existe un registro igual: revisa si el paciente ya tiene una orden u hospitalización abierta.",
    "23514": "La base rechazó el registro porque incumple una regla del sistema.",
    "23503": "El registro hace referencia a un dato que no existe.",
    "23001": "Ese registro no se puede borrar: se anula con motivo.",
}


def _rechazo(mensaje: str | list[str], codigo: int = 422) -> HTTPException:
    return HTTPException(status_code=codigo, detail=mensaje)


def _cuenta_de(conexion, cuenta_id: str):
    fila = conexion.execute(text("SELECT id, nombre, rol FROM cuenta WHERE id = :c AND activo"), {"c": cuenta_id}).mappings().first()
    if not fila:
        return None
    servicios = conexion.execute(text("SELECT servicio_id FROM cuenta_servicio WHERE cuenta_id = :c"), {"c": cuenta_id}).scalars().all()
    return {**fila, "servicios": list(servicios)}


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def sesion_para_cambiar_clave(authorization: str | None = Header(default=None)) -> dict:
    """La sesión del token, aunque la cuenta deba cambiar su contraseña. Solo la
    usan `/auth/yo` y `/auth/cambiar-clave`."""
    try:
        return leer_token((authorization or "").removeprefix("Bearer ").strip())
    except TokenInvalido as e:
        raise _rechazo("La sesión terminó. Vuelve a entrar." if e.vencido else "La sesión no es válida. Vuelve a entrar.", 401) from e


def cuenta_actual(sesion: dict = Depends(sesion_para_cambiar_clave)) -> dict:
    """La cuenta de una sesión que puede operar. Se lee de la base en cada pedido:
    una cuenta desactivada deja de operar sin esperar a que venza su token."""
    if sesion["cc"]:
        raise _rechazo("Debes cambiar tu contraseña antes de continuar.", 403)
    with motor.connect() as conexion:
        cuenta = _cuenta_de(conexion, sesion["sub"])
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


class Credenciales(BaseModel):
    usuario: str = Field(min_length=1, max_length=60)
    # Tope de largo: Argon2 es caro a propósito.
    clave: str = Field(min_length=1, max_length=LARGO_MAXIMO)


class CambioDeClave(BaseModel):
    clave_actual: str = Field(min_length=1, max_length=LARGO_MAXIMO)
    clave_nueva: str = Field(min_length=1, max_length=LARGO_MAXIMO)


def _con_registro(funcion):
    """Confirma lo que la función anotó (el intento fallido) aunque termine en rechazo."""
    with motor.begin() as conexion:
        try:
            return funcion(conexion)
        except autenticacion.Rechazo as r:
            rechazo = r
    raise _rechazo(rechazo.detalle, rechazo.codigo)


@app.post("/api/auth/login")
def iniciar_sesion(credenciales: Credenciales, request: Request):
    return _con_registro(lambda c: autenticacion.ingresar(c, credenciales.usuario, credenciales.clave, _ip(request)))


@app.get("/api/auth/yo")
def mi_sesion(sesion: dict = Depends(sesion_para_cambiar_clave)):
    return {"usuario": sesion["usr"], "id": sesion["sub"], "nombre": sesion["nom"], "rol": sesion["rol"], "debe_cambiar_clave": sesion["cc"], "expira_en": sesion["exp"]}


@app.post("/api/auth/cambiar-clave")
def cambiar_clave(cambio: CambioDeClave, request: Request, sesion: dict = Depends(sesion_para_cambiar_clave)):
    return _con_registro(lambda c: autenticacion.cambiar_clave(c, sesion["sub"], cambio.clave_actual, cambio.clave_nueva, _ip(request)))


@app.post("/api/demo/entrar-como")
def entrar_como(datos: dict, _cuenta: dict = Depends(cuenta_actual)):
    """Solo en la demostración: pasar a otra cuenta sin su clave, para seguir un
    paciente desde Admisión hasta Estadística."""
    _solo_demo()
    with motor.connect() as conexion:
        destino = conexion.execute(
            text("SELECT id, usuario, nombre, rol FROM cuenta WHERE id = :c AND activo AND rol <> 'sistema'"),
            {"c": str(datos.get("cuentaId"))},
        ).mappings().first()
    if not destino:
        raise _rechazo("Esa cuenta no existe.")
    return autenticacion.respuesta(destino, debe_cambiar_clave=False)


@app.get("/api/estado")
def leer_estado(cuenta: dict = Depends(cuenta_actual)):
    with motor.connect() as conexion:
        return estado.construir(conexion, cuenta, acciones.ahora_de(conexion, es_demo()))


@app.post("/api/acciones")
def ejecutar_accion(accion: dict, request: Request, cuenta: dict = Depends(cuenta_actual)):
    def hacer(conexion):
        acciones.aplicar(conexion, cuenta, accion, acciones.ahora_de(conexion, es_demo()), _ip(request))
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
