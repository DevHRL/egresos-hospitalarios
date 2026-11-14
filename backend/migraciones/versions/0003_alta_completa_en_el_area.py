"""El área registra el alta completa (cambios del 2026-11-13, decisión 0010).

Desde ahora el área que da de alta registra también el CIE-10 y el médico, así
que el egreso nace `completo` y cuenta en los indicadores sin esperar a
Estadística. La validación de Estadística sigue siendo requisito para cerrar el
mes, no para que el egreso aparezca en las cifras del mes en curso.

- `mv_indicadores_mes`: E y C cuentan los egresos `completo`, `validado` y
  `cerrado` (antes, solo `validado` y `cerrado`).

No cambia tablas: la orden ya guardaba `servicio_id` (ahora se llena al crearla)
y el rol `camas` ya existía para la cuenta control.camas."""

from pathlib import Path

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

VISTAS = Path(__file__).parent.parent / "sql" / "vistas.sql"
NUEVO = "e.estado IN ('completo', 'validado', 'cerrado')"
ANTERIOR = "e.estado IN ('validado', 'cerrado')"


def _definicion() -> str:
    """La vista tal como está en vistas.sql, desde su CREATE hasta su índice único."""
    texto = VISTAS.read_text(encoding="utf-8")
    inicio = texto.index("CREATE MATERIALIZED VIEW mv_indicadores_mes")
    indice = texto.index("CREATE UNIQUE INDEX un_mv_indicadores", inicio)
    fin = texto.index(";", indice) + 1
    sql = texto[inicio:fin]
    assert NUEVO in sql, "vistas.sql ya no tiene el filtro que espera la migración 0003"
    return sql


def _recrear(sql: str) -> None:
    cursor = op.get_bind().connection.cursor()
    cursor.execute("DROP MATERIALIZED VIEW IF EXISTS mv_indicadores_mes CASCADE")
    cursor.execute(sql)
    cursor.execute("GRANT SELECT ON mv_indicadores_mes TO egresos_app")
    cursor.execute("REFRESH MATERIALIZED VIEW mv_indicadores_mes")


def upgrade() -> None:
    _recrear(_definicion())


def downgrade() -> None:
    _recrear(_definicion().replace(NUEVO, ANTERIOR))
