"""Cada corrida arma una base propia sobre el PostgreSQL 16 del docker-compose."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import url_owner
from semillas.cargar_demostracion import cargar as cargar_demo
from semillas.cargar_maestros import cargar as cargar_maestros, exportar

BACKEND = Path(__file__).resolve().parents[1]
BASE = "egresos_pruebas"


def recrear(nombre: str) -> None:
    motor = create_engine(url_owner("postgres"), isolation_level="AUTOCOMMIT")
    with motor.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{nombre}" WITH (FORCE)'))
        c.execute(text(f'CREATE DATABASE "{nombre}"'))
    motor.dispose()


def alembic(nombre: str) -> Config:
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migraciones"))
    config.attributes["url"] = url_owner(nombre)
    return config


@pytest.fixture(scope="session")
def motor():
    recrear(BASE)
    command.upgrade(alembic(BASE), "head")
    m = create_engine(url_owner(BASE), connect_args={"options": "-c timezone=UTC"})
    datos = exportar()
    with m.begin() as c:
        cargar_maestros(c, datos)
        cargar_demo(c, datos)
    yield m
    m.dispose()


@pytest.fixture
def conn(motor):
    """Cada prueba corre en una transacción que se deshace al terminar."""
    with motor.connect() as c:
        t = c.begin()
        yield c
        t.rollback()
