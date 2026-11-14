-- Qué puede hacer cada rol de la base.

GRANT USAGE ON SCHEMA public TO egresos_app, egresos_lectura, egresos_respaldo;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO egresos_app;
GRANT SELECT ON mv_indicadores_mes TO egresos_app;
GRANT DELETE ON censo_detalle, censo_nota, diagnostico_egreso TO egresos_app;

-- La tabla derivada y la auditoría solo las escriben los triggers.
REVOKE INSERT, UPDATE ON ocupacion_cama FROM egresos_app;
REVOKE INSERT, UPDATE ON auditoria FROM egresos_app;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO egresos_app;

-- egresos_lectura solo ve lo que no tiene datos personales.
GRANT SELECT ON v_tablero TO egresos_lectura;

GRANT pg_read_all_data TO egresos_respaldo;
