"""Claves y sesiones, con la biblioteca estándar."""

import base64
import hashlib
import hmac
import json
import os
import time

from app.config import variable

DURACION = 12 * 60 * 60


def hash_clave(clave: str) -> str:
    sal = os.urandom(16)
    h = hashlib.scrypt(clave.encode(), salt=sal, n=2**14, r=8, p=1, maxmem=64 * 1024 * 1024)
    return f"scrypt${sal.hex()}${h.hex()}"


def clave_correcta(clave: str, guardado: str | None) -> bool:
    if not guardado:
        return False
    _, sal, esperado = guardado.split("$")
    h = hashlib.scrypt(clave.encode(), salt=bytes.fromhex(sal), n=2**14, r=8, p=1, maxmem=64 * 1024 * 1024)
    return hmac.compare_digest(h.hex(), esperado)


def _firma(cuerpo: str) -> str:
    return hmac.new(variable("APP_SECRETO").encode(), cuerpo.encode(), hashlib.sha256).hexdigest()


def crear_token(cuenta_id: str) -> str:
    datos = json.dumps({"c": cuenta_id, "e": int(time.time()) + DURACION})
    cuerpo = base64.urlsafe_b64encode(datos.encode()).decode()
    return f"{cuerpo}.{_firma(cuerpo)}"


def leer_token(token: str | None) -> str | None:
    if not token or "." not in token:
        return None
    cuerpo, firma = token.rsplit(".", 1)
    if not hmac.compare_digest(_firma(cuerpo), firma):
        return None
    try:
        datos = json.loads(base64.urlsafe_b64decode(cuerpo))
    except ValueError:
        return None
    return datos["c"] if datos["e"] > time.time() else None
