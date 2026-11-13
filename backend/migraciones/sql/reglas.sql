-- Reglas que garantiza la base, aunque falle la aplicación.

-- ── Ocupación derivada de los movimientos ───────────────────────────────

CREATE FUNCTION reconstruir_ocupacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM ocupacion_cama WHERE hospitalizacion_id = NEW.hospitalizacion_id;
  INSERT INTO ocupacion_cama (hospitalizacion_id, cama_id, servicio_id, desde, hasta)
  SELECT hospitalizacion_id, cama_id, servicio_id, fecha_hora, siguiente
  FROM (
    SELECT m.*, lead(fecha_hora) OVER (ORDER BY fecha_hora, id) AS siguiente
    FROM movimiento m
    WHERE m.hospitalizacion_id = NEW.hospitalizacion_id
      AND NOT m.anulado AND m.tipo <> 'soporte'
  ) t
  WHERE tipo <> 'egreso' AND (siguiente IS NULL OR siguiente > fecha_hora);
  RETURN NULL;
END $$;

CREATE TRIGGER movimiento_ocupacion
  AFTER INSERT OR UPDATE OF anulado, fecha_hora ON movimiento
  FOR EACH ROW EXECUTE FUNCTION reconstruir_ocupacion();

-- ── Lo que no se borra ──────────────────────────────────────────────────

CREATE FUNCTION impedir_borrado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% no admite borrado: se anula con motivo', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER sin_borrado BEFORE DELETE ON movimiento FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER sin_borrado BEFORE DELETE ON hospitalizacion FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER sin_borrado BEFORE DELETE ON egreso FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER sin_borrado BEFORE DELETE ON orden_hospitalizacion FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER sin_borrado BEFORE DELETE ON orden_mantenimiento FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER sin_borrado BEFORE DELETE ON traslado FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER sin_borrado BEFORE DELETE ON paciente FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER sin_borrado BEFORE DELETE ON censo_diario FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

-- ── Mes cerrado ─────────────────────────────────────────────────────────

CREATE FUNCTION proteger_mes_cerrado() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- NEW.dia aún no está calculado en un trigger BEFORE: se usa fecha_hora.
  IF EXISTS (SELECT 1 FROM periodo
             WHERE estado = 'cerrado'
               AND (mes = date_trunc('month', dia_censo(NEW.fecha_hora))::date
                    OR (TG_OP = 'UPDATE'
                        AND mes = date_trunc('month', dia_censo(OLD.fecha_hora))::date))) THEN
    RAISE EXCEPTION 'El mes de ese registro ya está cerrado'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION proteger_mes_cerrado_fecha() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM periodo
             WHERE estado = 'cerrado'
               AND (mes = date_trunc('month', NEW.fecha)::date
                    OR (TG_OP = 'UPDATE' AND mes = date_trunc('month', OLD.fecha)::date))) THEN
    RAISE EXCEPTION 'El mes de ese censo ya está cerrado'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER mes_cerrado BEFORE INSERT OR UPDATE ON movimiento FOR EACH ROW EXECUTE FUNCTION proteger_mes_cerrado();
CREATE TRIGGER mes_cerrado BEFORE INSERT OR UPDATE ON egreso FOR EACH ROW EXECUTE FUNCTION proteger_mes_cerrado();
CREATE TRIGGER mes_cerrado BEFORE INSERT OR UPDATE ON censo_diario FOR EACH ROW EXECUTE FUNCTION proteger_mes_cerrado_fecha();

-- ── Auditoría ───────────────────────────────────────────────────────────

-- Los argumentos del trigger son las columnas de la clave de cada tabla.
CREATE FUNCTION auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  fila jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  clave text;
BEGIN
  SELECT string_agg(fila->>columna, '|') INTO clave FROM unnest(TG_ARGV) AS columna;
  INSERT INTO auditoria (tabla, registro_id, accion, valor_anterior, valor_nuevo, cuenta_id, ip)
  VALUES (
    TG_TABLE_NAME,
    clave,
    TG_OP,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    NULLIF(current_setting('app.cuenta_id', true), ''),
    NULLIF(current_setting('app.ip', true), '')::inet
  );
  RETURN NULL;
END $$;

DO $$
DECLARE
  claves CONSTANT jsonb := '{
    "departamento": ["id"], "servicio": ["id"], "piso": ["id"], "zona": ["id"], "cama": ["id"],
    "bloqueo_cama": ["id"], "activo_cama": ["id"], "orden_mantenimiento": ["id"],
    "cuenta": ["id"], "cuenta_servicio": ["cuenta_id", "servicio_id"], "medico": ["id"],
    "cie10": ["codigo"], "paciente": ["id"], "orden_hospitalizacion": ["id"],
    "hospitalizacion": ["id"], "movimiento": ["id"], "traslado": ["id"], "egreso": ["id"],
    "diagnostico_egreso": ["egreso_id", "cie10"], "control_hc": ["egreso_id"],
    "correccion_movimiento": ["id"], "censo_diario": ["id"], "censo_detalle": ["id"],
    "censo_nota": ["censo_id", "hospitalizacion_id"], "conteo_unidad_diario": ["servicio_id", "fecha"],
    "dotacion_version": ["id"], "dotacion_detalle": ["version_id", "departamento_id", "servicio_id"],
    "periodo": ["mes"], "indicador_mes_cerrado": ["mes", "base", "departamento_id", "servicio_id"],
    "ajuste_periodo": ["id"], "renoxi_carga": ["dia"], "parametro": ["clave", "vigente_desde"]
  }';
  tabla text;
  columnas jsonb;
BEGIN
  FOR tabla, columnas IN SELECT * FROM jsonb_each(claves) LOOP
    EXECUTE format(
      'CREATE TRIGGER auditoria AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION auditar(%s)',
      tabla,
      (SELECT string_agg(quote_literal(c), ', ') FROM jsonb_array_elements_text(columnas) AS c)
    );
  END LOOP;
END $$;
