"""Corre las migraciones con la cuenta dueña de la base."""

from alembic import context
from sqlalchemy import create_engine, pool

from app.config import url_owner


def correr() -> None:
    url = context.config.attributes.get("url") or url_owner()
    motor = create_engine(url, poolclass=pool.NullPool)
    with motor.connect() as conexion:
        context.configure(connection=conexion, transaction_per_migration=True)
        with context.begin_transaction():
            context.run_migrations()


correr()
