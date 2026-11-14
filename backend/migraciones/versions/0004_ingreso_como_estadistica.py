"""Ingreso con la misma forma que Estadística (cambios del 2026-11-14, decisión 0011).

- `cuenta.debe_cambiar_clave`: una cuenta con clave provisional solo puede
  cambiarla. Las cuentas que ya existen quedan sin la marca (la demostración no
  se interrumpe); las nuevas nacen con ella, salvo que la semilla diga otra cosa.
- `intento_acceso`: cada intento de ingreso, para frenar a quien prueba claves
  (cinco fallos en 15 minutos) y saber cuándo entró cada cuenta. Sin datos de
  pacientes; no se borra desde la aplicación.
- `auditar()` deja fuera `clave_hash`. Hasta hoy, la auditoría de `cuenta`
  copiaba el hash de la clave en cada cambio de la fila; ahora que las cuentas
  cambian su clave desde la aplicación, el hash no debe quedar en la bitácora.
  Se limpia también lo que ya estaba guardado.

Las claves guardadas con scrypt siguen sirviendo: se pasan a Argon2 en el
siguiente ingreso correcto (`app/seguridad.py`)."""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

AUDITAR = """
CREATE OR REPLACE FUNCTION auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  -- Lo que nunca se copia a la auditoría.
  ocultas CONSTANT text[] := ARRAY['clave_hash'];
  anterior jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - ocultas END;
  nuevo jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - ocultas END;
  clave text;
BEGIN
  SELECT string_agg(coalesce(nuevo, anterior)->>columna, '|') INTO clave FROM unnest(TG_ARGV) AS columna;
  INSERT INTO auditoria (tabla, registro_id, accion, valor_anterior, valor_nuevo, cuenta_id, ip)
  VALUES (
    TG_TABLE_NAME,
    clave,
    TG_OP,
    anterior,
    nuevo,
    NULLIF(current_setting('app.cuenta_id', true), ''),
    NULLIF(current_setting('app.ip', true), '')::inet
  );
  RETURN NULL;
END $$;
"""


def _ejecutar(sql: str) -> None:
    """Sin parámetros: el `%` de RAISE llega intacto a PostgreSQL."""
    op.get_bind().connection.cursor().execute(sql)


def upgrade() -> None:
    op.execute("ALTER TABLE cuenta ADD COLUMN debe_cambiar_clave boolean NOT NULL DEFAULT false")
    op.execute("ALTER TABLE cuenta ALTER COLUMN debe_cambiar_clave SET DEFAULT true")

    op.execute(
        """CREATE TABLE intento_acceso (
             id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
             usuario text NOT NULL,
             ip inet,
             exitoso boolean NOT NULL,
             -- La hora real de cada intento, no la de inicio de la transacción.
             fecha timestamptz NOT NULL DEFAULT clock_timestamp()
           )"""
    )
    op.execute("CREATE INDEX ix_intento_acceso_usuario ON intento_acceso (usuario, fecha DESC)")
    op.execute("GRANT SELECT, INSERT ON intento_acceso TO egresos_app")

    _ejecutar(AUDITAR)
    op.execute(
        """UPDATE auditoria
              SET valor_anterior = valor_anterior - 'clave_hash',
                  valor_nuevo = valor_nuevo - 'clave_hash'
            WHERE tabla = 'cuenta'"""
    )


def downgrade() -> None:
    op.execute("DROP TABLE intento_acceso")
    op.execute("ALTER TABLE cuenta DROP COLUMN debe_cambiar_clave")
    # auditar() se queda sin el hash: volver a copiarlo no tiene ningún uso.
