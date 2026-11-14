"""Esquema inicial: tablas, reglas, vistas y roles."""

from pathlib import Path

from alembic import op

from app.config import variable

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

SQL = Path(__file__).parent.parent / "sql"
ROLES = {
    "egresos_app": "EGRESOS_APP_CLAVE",
    "egresos_lectura": "EGRESOS_LECTURA_CLAVE",
    "egresos_respaldo": "EGRESOS_RESPALDO_CLAVE",
}
FUNCIONES = [
    "refrescar_indicadores()",
    "renoxi_del_dia(date)",
    "filas_censo(text, date)",
    "cuadre_censo(text, date)",
    "auditar()",
    "proteger_mes_cerrado_fecha()",
    "proteger_mes_cerrado()",
    "impedir_borrado()",
    "reconstruir_ocupacion()",
    "cama_bloqueada_al(text, timestamptz)",
    "cama_fuera_al(text, timestamptz)",
    "soporte_al(bigint, timestamptz)",
    "inicio_dia(date)",
    "desde_local(text)",
    "texto_local(timestamptz)",
    "dia_censo(timestamptz)",
]


def _ejecutar(sql: str) -> None:
    """Sin parámetros: el `%` de RAISE y format() llega intacto a PostgreSQL."""
    op.get_bind().connection.cursor().execute(sql)


def _literal(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def upgrade() -> None:
    for nombre, clave in ROLES.items():
        _ejecutar(
            f"DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{nombre}') "
            f"THEN CREATE ROLE {nombre} LOGIN; END IF; END $$"
        )
        _ejecutar(f"ALTER ROLE {nombre} PASSWORD {_literal(variable(clave))}")
    for archivo in ("esquema.sql", "reglas.sql", "vistas.sql", "permisos.sql"):
        _ejecutar((SQL / archivo).read_text(encoding="utf-8"))


def downgrade() -> None:
    _ejecutar("DROP MATERIALIZED VIEW IF EXISTS mv_indicadores_mes CASCADE")
    _ejecutar(
        """
        DO $$
        DECLARE r record;
        BEGIN
          FOR r IN SELECT viewname FROM pg_views WHERE schemaname = 'public' LOOP
            EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', r.viewname);
          END LOOP;
          FOR r IN SELECT tablename FROM pg_tables
                   WHERE schemaname = 'public' AND tablename <> 'alembic_version' LOOP
            EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
          END LOOP;
        END $$
        """
    )
    for firma in FUNCIONES:
        _ejecutar(f"DROP FUNCTION IF EXISTS {firma}")
    _ejecutar("DROP EXTENSION IF EXISTS pg_trgm")
    _ejecutar("DROP EXTENSION IF EXISTS btree_gist")
    for nombre in ROLES:
        # Otra base del mismo servidor puede seguir usando el rol: entonces se conserva.
        _ejecutar(
            f"""
            DO $$ BEGIN
              REVOKE ALL ON SCHEMA public FROM {nombre};
              DROP ROLE IF EXISTS {nombre};
            EXCEPTION WHEN dependent_objects_still_exist THEN NULL;
            END $$
            """
        )
