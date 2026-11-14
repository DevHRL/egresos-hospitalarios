"""Contraseñas y tokens, igual que el sistema de Estadística.

Las contraseñas se guardan con Argon2id (el valor por omisión de argon2-cffi) y
las sesiones son JWT firmados con HS256, como en `servidor/api/app/seguridad.py`
de Estadistica_hrl. Así, el día que los dos sistemas compartan el ingreso, solo
cambia quién emite el token, no cómo se lee.

Diferencia a propósito: el token lleva `aud` (para quién es). Aunque los dos
sistemas llegaran a firmar con el mismo secreto, un token de Estadística no abre
este sistema ni al revés, mientras no se decida unificarlos (decisión 0011)."""

import hashlib
import hmac
import time
from functools import lru_cache

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import variable

ALGORITMO = "HS256"
AUDIENCIA = "egresos-hospitalarios"
SECRETO_MINIMO = 32

_hasher = PasswordHasher()


def hashear_clave(clave: str) -> str:
    return _hasher.hash(clave)


def _scrypt_correcta(clave: str, guardado: str) -> bool:
    """Las claves guardadas antes del 2026-11-14 son scrypt. Se aceptan solo para
    pasarlas a Argon2 en el siguiente ingreso correcto."""
    try:
        _, sal, esperado = guardado.split("$")
        h = hashlib.scrypt(clave.encode(), salt=bytes.fromhex(sal), n=2**14, r=8, p=1, maxmem=64 * 1024 * 1024)
    except ValueError:
        return False
    return hmac.compare_digest(h.hex(), esperado)


def verificar_clave(clave: str, guardado: str | None) -> bool:
    """`False` ante cualquier fallo, sin distinguir una clave equivocada de un
    hash ilegible: quien llama no debe poder saber cuál fue."""
    if not guardado:
        return False
    if guardado.startswith("scrypt$"):
        return _scrypt_correcta(clave, guardado)
    try:
        return _hasher.verify(guardado, clave)
    except (VerificationError, InvalidHashError):
        return False


def necesita_rehash(guardado: str) -> bool:
    return guardado.startswith("scrypt$") or _hasher.check_needs_rehash(guardado)


@lru_cache
def hash_de_relleno() -> str:
    """Un hash que no corresponde a ninguna clave real.

    Con un usuario que no existe se verifica contra este, para que la respuesta
    tarde lo mismo que con uno que sí existe y el tiempo no delate las cuentas."""
    return _hasher.hash("relleno-que-nadie-conoce")


# ------------------------------------------------------------------- tokens


class TokenInvalido(Exception):
    """`vencido` lo distingue de uno falso: a quien solo venció la sesión se le
    pide entrar de nuevo, sin alarma."""

    def __init__(self, motivo: str, *, vencido: bool = False):
        super().__init__(motivo)
        self.vencido = vencido


def secreto() -> str:
    valor = variable("JWT_SECRETO")
    if len(valor) < SECRETO_MINIMO:
        raise RuntimeError(f"JWT_SECRETO debe tener al menos {SECRETO_MINIMO} caracteres. Revisa .env.example.")
    return valor


def horas_de_sesion() -> int:
    """12 horas por omisión, no las 8 de Estadística: la guardia de enfermería es
    de 12 y cortarle la sesión a mitad de turno es pedirle la clave con un
    paciente delante."""
    return int(variable("JWT_HORAS", "12"))


def crear_token(cuenta: dict, *, debe_cambiar_clave: bool, ahora: float | None = None) -> tuple[str, int]:
    """Devuelve el token y su vencimiento (segundos desde 1970).

    La hora es la real, no el reloj de la demostración: la sesión dura lo que
    dura en el mundo, aunque la demostración adelante días."""
    emitido = int(ahora if ahora is not None else time.time())
    expira = emitido + horas_de_sesion() * 3600
    reclamos = {
        "sub": cuenta["id"],
        "usr": cuenta["usuario"],
        "nom": cuenta["nombre"],
        "rol": cuenta["rol"],
        "cc": bool(debe_cambiar_clave),
        "aud": AUDIENCIA,
        "iat": emitido,
        "exp": expira,
    }
    return jwt.encode(reclamos, secreto(), algorithm=ALGORITMO), expira


def leer_token(token: str | None, *, ahora: float | None = None) -> dict:
    """Comprueba firma, destinatario, forma y vigencia. Lanza `TokenInvalido`."""
    if not token:
        raise TokenInvalido("Falta iniciar sesión.")
    try:
        r = jwt.decode(
            token,
            secreto(),
            algorithms=[ALGORITMO],
            audience=AUDIENCIA,
            options={"require": ["exp", "iat", "sub", "aud"], "verify_exp": False, "verify_iat": False},
        )
    except jwt.PyJWTError as e:
        raise TokenInvalido("El token no es válido.") from e
    if not isinstance(r.get("sub"), str) or not isinstance(r.get("cc"), bool):
        raise TokenInvalido("El token no tiene la forma esperada.")
    if (ahora if ahora is not None else time.time()) >= float(r["exp"]):
        raise TokenInvalido("La sesión venció.", vencido=True)
    return r
