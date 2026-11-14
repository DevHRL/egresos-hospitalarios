"""Ingreso y cambio de contraseña, con el mismo comportamiento que Estadística
(`servidor/api/app/api/auth.py` de Estadistica_hrl).

Cada función recibe la conexión: la API le pasa la suya y las pruebas, la de su
base de pruebas. Un rechazo se devuelve como `Rechazo` para que quien llama
confirme antes lo que haya que anotar (el intento fallido) y no se pierda con
el rollback."""

from sqlalchemy import text

from app.claves import LARGO_MAXIMO, problemas_de_clave
from app.seguridad import crear_token, hash_de_relleno, hashear_clave, necesita_rehash, verificar_clave

MAX_FALLOS = 5
MINUTOS_DE_ESPERA = 15
# Una sola respuesta para «no existe» y «clave equivocada»: distinguirlas le diría
# a quien prueba qué usuarios están registrados.
CREDENCIALES_INCORRECTAS = "Usuario o contraseña incorrectos."


class Rechazo(Exception):
    def __init__(self, codigo: int, detalle):
        super().__init__(str(detalle))
        self.codigo = codigo
        self.detalle = detalle


def _anotar_quien(conexion, cuenta_id: str, ip: str | None) -> None:
    """Para que la auditoría sepa quién cambió la fila de su cuenta."""
    conexion.execute(
        text("SELECT set_config('app.cuenta_id', :c, true), set_config('app.ip', :i, true)"),
        {"c": cuenta_id, "i": ip or ""},
    )


def _cuenta_por_usuario(conexion, usuario: str):
    # Sin distinguir mayúsculas, como el índice de Estadística.
    return conexion.execute(
        text("SELECT id, usuario, nombre, rol, clave_hash, activo, debe_cambiar_clave FROM cuenta WHERE lower(usuario) = :u AND rol <> 'sistema'"),
        {"u": usuario},
    ).mappings().first()


def anotar_intento(conexion, usuario: str, ip: str | None, *, exitoso: bool) -> None:
    conexion.execute(
        text("INSERT INTO intento_acceso (usuario, ip, exitoso) VALUES (:u, CAST(NULLIF(:ip, '') AS inet), :e)"),
        {"u": usuario[:150], "ip": ip or "", "e": exitoso},
    )


def demasiados_intentos(conexion, usuario: str) -> bool:
    """Cinco fallos seguidos en 15 minutos frenan esa cuenta hasta que pase la espera.

    Cuentan los fallos posteriores al último ingreso correcto, y es por nombre de
    usuario, también uno que no existe, para no delatar cuáles existen."""
    fallos = conexion.execute(
        text(
            """SELECT count(*) FROM intento_acceso i
               WHERE i.usuario = :u AND NOT i.exitoso
                 AND i.fecha > now() - make_interval(mins => :m)
                 AND i.fecha > coalesce((SELECT max(fecha) FROM intento_acceso
                                         WHERE usuario = :u AND exitoso), '-infinity')"""
        ),
        {"u": usuario[:150], "m": MINUTOS_DE_ESPERA},
    ).scalar_one()
    return fallos >= MAX_FALLOS


def respuesta(cuenta, *, debe_cambiar_clave: bool) -> dict:
    """La forma de la respuesta de Estadística: token, tipo, vencimiento, la
    marca de cambio obligatorio y la cuenta."""
    token, expira = crear_token(dict(cuenta), debe_cambiar_clave=debe_cambiar_clave)
    return {
        "token": token,
        "tipo": "Bearer",
        "expira_en": expira,
        "debe_cambiar_clave": debe_cambiar_clave,
        "usuario": {"id": cuenta["id"], "usuario": cuenta["usuario"], "nombre": cuenta["nombre"], "rol": cuenta["rol"]},
    }


def ingresar(conexion, usuario: str, clave: str, ip: str | None) -> dict:
    nombre = (usuario or "").strip().lower()
    clave = clave or ""
    if not nombre or not clave or len(clave) > LARGO_MAXIMO:
        raise Rechazo(401, CREDENCIALES_INCORRECTAS)

    # Antes de comprobar nada: quien prueba contraseñas no sigue probando ni sabe si acertó.
    if demasiados_intentos(conexion, nombre):
        raise Rechazo(429, f"Demasiados intentos fallidos. Espera {MINUTOS_DE_ESPERA} minutos o pide a TI que revise tu cuenta.")

    cuenta = _cuenta_por_usuario(conexion, nombre)
    if cuenta is None:
        # El mismo trabajo que con una cuenta real: el tiempo no delata qué usuarios existen.
        verificar_clave(clave, hash_de_relleno())
        anotar_intento(conexion, nombre, ip, exitoso=False)
        raise Rechazo(401, CREDENCIALES_INCORRECTAS)
    if not verificar_clave(clave, cuenta["clave_hash"]):
        anotar_intento(conexion, nombre, ip, exitoso=False)
        raise Rechazo(401, CREDENCIALES_INCORRECTAS)

    # Solo lo sabe quien ya demostró conocer la contraseña.
    if not cuenta["activo"]:
        raise Rechazo(403, "La cuenta está desactivada. Consulta con TI.")

    if necesita_rehash(cuenta["clave_hash"]):
        _anotar_quien(conexion, cuenta["id"], ip)
        conexion.execute(text("UPDATE cuenta SET clave_hash = :h WHERE id = :c"), {"h": hashear_clave(clave), "c": cuenta["id"]})
    anotar_intento(conexion, nombre, ip, exitoso=True)
    return respuesta(cuenta, debe_cambiar_clave=cuenta["debe_cambiar_clave"])


def cambiar_clave(conexion, cuenta_id: str, clave_actual: str, clave_nueva: str, ip: str | None) -> dict:
    """La única operación que puede hacer una cuenta con contraseña provisional.
    Devuelve un token nuevo, ya sin la marca de cambio obligatorio."""
    cuenta = conexion.execute(
        text("SELECT id, usuario, nombre, rol, clave_hash, activo FROM cuenta WHERE id = :c"), {"c": cuenta_id}
    ).mappings().first()
    if cuenta is None or not cuenta["activo"]:
        raise Rechazo(401, "La cuenta ya no está disponible.")
    if not verificar_clave(clave_actual or "", cuenta["clave_hash"]):
        raise Rechazo(403, "La contraseña actual no es correcta.")
    problemas = problemas_de_clave(clave_nueva or "", cuenta["usuario"], clave_actual=clave_actual)
    if problemas:
        raise Rechazo(422, problemas)
    _anotar_quien(conexion, cuenta["id"], ip)
    conexion.execute(
        text("UPDATE cuenta SET clave_hash = :h, debe_cambiar_clave = false WHERE id = :c"),
        {"h": hashear_clave(clave_nueva), "c": cuenta["id"]},
    )
    return respuesta(cuenta, debe_cambiar_clave=False)


def fijar_clave(conexion, usuario: str, clave: str, *, definitiva: bool) -> list[str]:
    """Para TI (`semillas.asignar_clave`). Sin `definitiva`, la cuenta la cambia al entrar."""
    cuenta = _cuenta_por_usuario(conexion, usuario.strip().lower())
    if cuenta is None:
        return [f"No existe la cuenta «{usuario}»."]
    problemas = problemas_de_clave(clave, cuenta["usuario"])
    if problemas:
        return problemas
    _anotar_quien(conexion, "sistema", None)
    conexion.execute(
        text("UPDATE cuenta SET clave_hash = :h, debe_cambiar_clave = :cc WHERE id = :c"),
        {"h": hashear_clave(clave), "cc": not definitiva, "c": cuenta["id"]},
    )
    return []
