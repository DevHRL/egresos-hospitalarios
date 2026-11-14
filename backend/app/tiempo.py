"""Fechas del dominio como texto local 'AAAA-MM-DD' y 'AAAA-MM-DDTHH:mm', igual que el frontend."""

import re
from datetime import date, timedelta

_FECHA_HORA = re.compile(r"\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d")


def es_fecha_hora(f: str | None) -> bool:
    return bool(f) and bool(_FECHA_HORA.fullmatch(f))


def dia_de(f: str) -> str:
    return f[:10]


def mes_de(f: str) -> str:
    return f[:7]


def sumar_dias(d: str, n: int) -> str:
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()


def corte_del_dia(d: str) -> str:
    return f"{sumar_dias(d, 1)}T00:00"


def bloqueo_del_dia(d: str) -> str:
    return f"{sumar_dias(d, 1)}T08:00"


def dias_entre(desde: str, hasta: str):
    d = date.fromisoformat(desde)
    fin = date.fromisoformat(hasta)
    while d <= fin:
        yield d.isoformat()
        d += timedelta(days=1)
