"""Orden al departamento y rol de departamento (cambios del 2026-11-11).

Admisión envía al paciente a un departamento (Medicina) y no a un área. La
cuenta del departamento designa la habitación y la cama; con eso el área queda
definida y se confirma el ingreso. Desde ahí, el piso (Medicina B o
Intermedios) controla al paciente.

- `orden_hospitalizacion.departamento_id`: a dónde la envió Admisión.
- `orden_hospitalizacion.servicio_id`: queda vacío hasta la designación.
- Rol `departamento`: monitorea todo el departamento y solo designa camas."""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

ROLES_0001 = "'admision', 'enfermeria', 'tecnico', 'camas', 'jefatura', 'mantenimiento', 'consulta', 'ti', 'sistema'"


def upgrade() -> None:
    op.execute("ALTER TABLE orden_hospitalizacion ADD COLUMN departamento_id text REFERENCES departamento")
    op.execute(
        """UPDATE orden_hospitalizacion o SET departamento_id = s.departamento_id
           FROM servicio s WHERE s.id = o.servicio_id"""
    )
    op.execute("ALTER TABLE orden_hospitalizacion ALTER COLUMN departamento_id SET NOT NULL")
    op.execute("ALTER TABLE orden_hospitalizacion ALTER COLUMN servicio_id DROP NOT NULL")
    op.execute(
        """ALTER TABLE orden_hospitalizacion ADD CONSTRAINT orden_ingresada_con_area
           CHECK (estado <> 'ingresada' OR servicio_id IS NOT NULL)"""
    )
    op.execute("CREATE INDEX ix_orden_pendiente_departamento ON orden_hospitalizacion (departamento_id) WHERE estado = 'pendiente'")

    op.execute("ALTER TABLE cuenta DROP CONSTRAINT cuenta_rol_check")
    op.execute(f"ALTER TABLE cuenta ADD CONSTRAINT cuenta_rol_check CHECK (rol IN ({ROLES_0001}, 'departamento'))")


def downgrade() -> None:
    op.execute("UPDATE cuenta SET activo = false WHERE rol = 'departamento'")
    op.execute("UPDATE cuenta SET rol = 'consulta' WHERE rol = 'departamento'")
    op.execute("ALTER TABLE cuenta DROP CONSTRAINT cuenta_rol_check")
    op.execute(f"ALTER TABLE cuenta ADD CONSTRAINT cuenta_rol_check CHECK (rol IN ({ROLES_0001}))")

    op.execute("DROP INDEX ix_orden_pendiente_departamento")
    op.execute("ALTER TABLE orden_hospitalizacion DROP CONSTRAINT orden_ingresada_con_area")
    # Una orden pendiente sin área no tiene a dónde volver: se anula con motivo.
    op.execute(
        """UPDATE orden_hospitalizacion SET estado = 'anulada', motivo_anulacion = 'Revertida la migración 0002 sin área asignada'
           WHERE servicio_id IS NULL"""
    )
    op.execute(
        """UPDATE orden_hospitalizacion o SET servicio_id = (
             SELECT s.id FROM servicio s WHERE s.departamento_id = o.departamento_id ORDER BY s.id LIMIT 1)
           WHERE servicio_id IS NULL"""
    )
    op.execute("ALTER TABLE orden_hospitalizacion ALTER COLUMN servicio_id SET NOT NULL")
    op.execute("ALTER TABLE orden_hospitalizacion DROP COLUMN departamento_id")
