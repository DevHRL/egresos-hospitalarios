"""Configuración leída del ambiente o, en desarrollo, del archivo .env de la raíz."""

import os
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


def _leer_env() -> dict[str, str]:
    archivo = RAIZ / ".env"
    if not archivo.exists():
        return {}
    valores = {}
    for linea in archivo.read_text(encoding="utf-8-sig").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#") and "=" in linea:
            clave, valor = linea.split("=", 1)
            valores[clave.strip()] = valor.strip()
    return valores


_ENV = _leer_env()


def variable(nombre: str, defecto: str | None = None) -> str:
    valor = os.environ.get(nombre) or _ENV.get(nombre) or defecto
    if valor is None:
        raise RuntimeError(f"Falta la variable {nombre}. Revisa .env.example.")
    return valor


def _url(usuario: str, clave: str, base: str | None = None) -> str:
    puerto = variable("EGRESOS_DB_PUERTO", "5544")
    nombre = base or variable("EGRESOS_DB", "egresos")
    return f"postgresql+psycopg://{usuario}:{clave}@127.0.0.1:{puerto}/{nombre}"


def url_owner(base: str | None = None) -> str:
    return _url("egresos_owner", variable("EGRESOS_OWNER_CLAVE"), base)


def url_app(base: str | None = None) -> str:
    return _url("egresos_app", variable("EGRESOS_APP_CLAVE"), base)


def es_demo() -> bool:
    return variable("APP_ENV", "desarrollo") != "produccion"
