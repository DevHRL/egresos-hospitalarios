-- Lo que se calcula: nada de esto se digita.

-- ── Estado a una fecha ──────────────────────────────────────────────────

CREATE FUNCTION soporte_al(p_hospitalizacion bigint, p_limite timestamptz) RETURNS text
  LANGUAGE sql STABLE
  RETURN coalesce((
    SELECT m.soporte FROM movimiento m
    WHERE m.hospitalizacion_id = p_hospitalizacion AND m.tipo = 'soporte'
      AND NOT m.anulado AND m.fecha_hora < p_limite
    ORDER BY m.fecha_hora DESC, m.id DESC LIMIT 1
  ), 'ninguno');

-- La cama estaba fuera si un retiro sin reemplazo cubría ese instante.
CREATE FUNCTION cama_fuera_al(p_cama text, p_limite timestamptz) RETURNS boolean
  LANGUAGE sql STABLE
  RETURN EXISTS (
    SELECT 1 FROM orden_mantenimiento o
    WHERE o.cama_id = p_cama AND o.con_reemplazo IS FALSE AND o.retirada_en < p_limite
      AND (o.recibida_en IS NULL OR o.recibida_en >= p_limite)
  ) OR EXISTS (
    SELECT 1 FROM cama c
    WHERE c.id = p_cama AND c.fuera_de_servicio
      AND NOT EXISTS (SELECT 1 FROM orden_mantenimiento o WHERE o.cama_id = c.id)
  );

CREATE FUNCTION cama_bloqueada_al(p_cama text, p_limite timestamptz) RETURNS boolean
  LANGUAGE sql STABLE
  RETURN EXISTS (
    SELECT 1 FROM bloqueo_cama b
    WHERE b.cama_id = p_cama AND b.desde < p_limite AND (b.hasta IS NULL OR b.hasta >= p_limite)
  );

-- ── Camas ahora ─────────────────────────────────────────────────────────

CREATE VIEW v_ocupacion_actual AS
SELECT o.hospitalizacion_id,
       h.paciente_id,
       p.n_hc,
       p.nombres,
       o.cama_id,
       c.codigo AS cama_codigo,
       c.servicio_id AS servicio_dueno_id,
       o.servicio_id,
       o.desde,
       soporte_al(o.hospitalizacion_id, 'infinity') AS soporte,
       o.servicio_id <> c.servicio_id AS prestada
FROM ocupacion_cama o
JOIN hospitalizacion h ON h.id = o.hospitalizacion_id
JOIN paciente p ON p.id = h.paciente_id
JOIN cama c ON c.id = o.cama_id
WHERE o.hasta IS NULL;

CREATE VIEW v_estado_cama AS
SELECT c.id AS cama_id,
       c.codigo,
       c.servicio_id,
       a.hospitalizacion_id,
       coalesce(a.prestada, false) AS prestada,
       CASE
         WHEN c.fuera_de_servicio THEN 'fuera'
         WHEN a.soporte = 'vm' THEN 'ocupada_vm'
         WHEN a.soporte = 'o2' THEN 'ocupada_o2'
         WHEN a.hospitalizacion_id IS NOT NULL THEN 'ocupada'
         WHEN b.id IS NOT NULL THEN 'bloqueada'
         ELSE 'libre'
       END AS estado
FROM cama c
LEFT JOIN v_ocupacion_actual a ON a.cama_id = c.id
LEFT JOIN bloqueo_cama b ON b.cama_id = c.id AND b.hasta IS NULL
WHERE c.activa;

CREATE VIEW v_resumen_camas AS
WITH cuenta AS (
  SELECT servicio_id,
         count(*) AS total,
         count(*) FILTER (WHERE estado = 'fuera') AS fuera,
         count(*) FILTER (WHERE estado = 'bloqueada') AS bloqueadas,
         count(*) FILTER (WHERE estado LIKE 'ocupada%') AS ocupadas,
         count(*) FILTER (WHERE estado = 'ocupada_o2') AS con_o2,
         count(*) FILTER (WHERE estado = 'ocupada_vm') AS con_vm,
         count(*) FILTER (WHERE prestada) AS prestadas
  FROM v_estado_cama
  GROUP BY servicio_id
)
SELECT servicio_id, total,
       total - fuera - bloqueadas AS operativas,
       ocupadas,
       total - fuera - bloqueadas - ocupadas AS disponibles,
       con_o2, con_vm, fuera, bloqueadas, prestadas
FROM cuenta;

CREATE VIEW v_tablero AS
SELECT s.id AS servicio_id, s.nombre AS servicio, d.nombre AS departamento,
       r.total, r.operativas, r.ocupadas, r.disponibles, r.con_o2, r.con_vm, r.fuera, r.bloqueadas
FROM v_resumen_camas r
JOIN servicio s ON s.id = r.servicio_id
JOIN departamento d ON d.id = s.departamento_id;

-- ── Censo ───────────────────────────────────────────────────────────────

CREATE FUNCTION cuadre_censo(p_servicio text, p_dia date)
RETURNS TABLE (saldo_anterior integer, ingresos integer, traslados_entrada integer, egresos integer,
               traslados_salida integer, pacientes_corte integer, entraron_y_salieron integer, pacientes_dia integer)
LANGUAGE sql STABLE AS $$
  WITH lim AS (SELECT inicio_dia(p_dia) AS inicio, inicio_dia(p_dia + 1) AS corte),
  del_dia AS (
    SELECT m.*, h.origen AS origen_hospitalizacion
    FROM movimiento m JOIN hospitalizacion h ON h.id = m.hospitalizacion_id, lim
    WHERE NOT m.anulado AND m.fecha_hora >= lim.inicio AND m.fecha_hora < lim.corte
  ),
  conteo AS (
    SELECT
      (SELECT count(DISTINCT o.hospitalizacion_id) FROM ocupacion_cama o, lim
       WHERE o.servicio_id = p_servicio AND o.desde < lim.inicio AND (o.hasta IS NULL OR o.hasta >= lim.inicio))::integer AS saldo,
      (SELECT count(DISTINCT o.hospitalizacion_id) FROM ocupacion_cama o, lim
       WHERE o.servicio_id = p_servicio AND o.desde < lim.corte AND (o.hasta IS NULL OR o.hasta >= lim.corte))::integer AS corte,
      (SELECT count(*) FROM del_dia d
       WHERE d.tipo = 'ingreso' AND d.servicio_id = p_servicio AND d.origen_hospitalizacion <> 'otro_servicio')::integer AS ingresos,
      (SELECT count(*) FROM del_dia d
       WHERE d.servicio_id = p_servicio
         AND ((d.tipo = 'traslado' AND d.servicio_origen_id <> d.servicio_id)
              OR (d.tipo = 'ingreso' AND d.origen_hospitalizacion = 'otro_servicio')))::integer AS entran,
      (SELECT count(*) FROM del_dia d
       WHERE d.tipo = 'egreso' AND d.servicio_id = p_servicio AND d.tipo_egreso <> 'traslado_no_incorporado')::integer AS egresos,
      (SELECT count(*) FROM del_dia d
       WHERE (d.tipo = 'traslado' AND d.servicio_origen_id = p_servicio AND d.servicio_id <> p_servicio)
          OR (d.tipo = 'egreso' AND d.servicio_id = p_servicio AND d.tipo_egreso = 'traslado_no_incorporado'))::integer AS salen,
      (SELECT count(*) FROM (
         SELECT d.hospitalizacion_id FROM del_dia d
         GROUP BY d.hospitalizacion_id
         HAVING bool_or((d.tipo = 'ingreso' AND d.servicio_id = p_servicio)
                     OR (d.tipo = 'traslado' AND d.servicio_id = p_servicio AND d.servicio_origen_id <> p_servicio))
            AND bool_or((d.tipo = 'egreso' AND d.servicio_id = p_servicio)
                     OR (d.tipo = 'traslado' AND d.servicio_origen_id = p_servicio AND d.servicio_id <> p_servicio))
            AND NOT EXISTS (SELECT 1 FROM ocupacion_cama o, lim
                            WHERE o.hospitalizacion_id = d.hospitalizacion_id AND o.servicio_id = p_servicio
                              AND o.desde < lim.corte AND (o.hasta IS NULL OR o.hasta >= lim.corte))
       ) x)::integer AS paso
  )
  SELECT saldo, ingresos, entran, egresos, salen, corte, paso, corte + paso FROM conteo;
$$;

CREATE FUNCTION filas_censo(p_servicio text, p_dia date)
RETURNS TABLE (cama_id text, hospitalizacion_id bigint, estado_cama text, movimiento text, relacion text,
               soporte text, dias_estancia integer, tipo_egreso text, presente_al_corte boolean)
LANGUAGE sql STABLE AS $$
  WITH lim AS (SELECT inicio_dia(p_dia) AS inicio, inicio_dia(p_dia + 1) AS corte),
  presentes AS (
    SELECT o.hospitalizacion_id AS h_id, o.cama_id AS c_id
    FROM ocupacion_cama o, lim
    WHERE o.servicio_id = p_servicio AND o.desde < lim.corte AND (o.hasta IS NULL OR o.hasta >= lim.corte)
  ),
  al_inicio AS (
    SELECT o.hospitalizacion_id AS h_id, o.cama_id AS c_id
    FROM ocupacion_cama o, lim
    WHERE o.servicio_id = p_servicio AND o.desde < lim.inicio AND (o.hasta IS NULL OR o.hasta >= lim.inicio)
  ),
  del_dia AS (
    SELECT m.* FROM movimiento m, lim
    WHERE NOT m.anulado AND m.fecha_hora >= lim.inicio AND m.fecha_hora < lim.corte
      AND (m.servicio_id = p_servicio OR m.servicio_origen_id = p_servicio)
  ),
  de_paso AS (
    SELECT t.h_id,
           coalesce(
             (SELECT d.cama_id FROM del_dia d WHERE d.hospitalizacion_id = t.h_id AND d.servicio_id = p_servicio AND d.tipo <> 'egreso'
              ORDER BY d.fecha_hora DESC, d.id DESC LIMIT 1),
             (SELECT d.cama_origen_id FROM del_dia d WHERE d.hospitalizacion_id = t.h_id AND d.servicio_origen_id = p_servicio
              ORDER BY d.fecha_hora, d.id LIMIT 1),
             (SELECT d.cama_id FROM del_dia d WHERE d.hospitalizacion_id = t.h_id AND d.tipo = 'egreso' LIMIT 1),
             (SELECT i.c_id FROM al_inicio i WHERE i.h_id = t.h_id LIMIT 1)
           ) AS c_id
    FROM (SELECT d.hospitalizacion_id AS h_id FROM del_dia d UNION SELECT i.h_id FROM al_inicio i) t
    WHERE t.h_id NOT IN (SELECT p.h_id FROM presentes p)
  ),
  con_paciente AS (
    SELECT p.h_id, p.c_id, true AS presente FROM presentes p
    UNION ALL
    SELECT x.h_id, x.c_id, false FROM de_paso x
  )
  SELECT c.c_id, c.h_id, NULL::text,
         (SELECT string_agg(CASE d.tipo WHEN 'ingreso' THEN 'I' WHEN 'traslado' THEN 'T' ELSE 'E' END, ' · ' ORDER BY d.fecha_hora, d.id)
          FROM del_dia d WHERE d.hospitalizacion_id = c.h_id AND d.tipo <> 'soporte'),
         (SELECT string_agg(CASE WHEN d.servicio_id = p_servicio THEN 'De ' || so.nombre ELSE 'A ' || sd.nombre END, ', ' ORDER BY d.fecha_hora, d.id)
          FROM del_dia d
          JOIN servicio so ON so.id = d.servicio_origen_id
          JOIN servicio sd ON sd.id = d.servicio_id
          WHERE d.hospitalizacion_id = c.h_id AND d.tipo = 'traslado' AND d.servicio_origen_id <> d.servicio_id),
         CASE WHEN c.presente THEN soporte_al(c.h_id, lim.corte) END,
         greatest(1, coalesce(e.dia, p_dia + 1) - dia_censo(h.fecha_ingreso))::integer,
         e.tipo,
         c.presente
  FROM con_paciente c
  CROSS JOIN lim
  JOIN hospitalizacion h ON h.id = c.h_id
  LEFT JOIN LATERAL (
    SELECT eg.tipo, dia_censo(eg.fecha_hora) AS dia
    FROM egreso eg
    WHERE eg.hospitalizacion_id = c.h_id AND NOT eg.anulado AND dia_censo(eg.fecha_hora) = p_dia
      AND EXISTS (SELECT 1 FROM del_dia d WHERE d.hospitalizacion_id = c.h_id AND d.tipo = 'egreso')
  ) e ON true
  UNION ALL
  SELECT ca.id, NULL::bigint,
         CASE WHEN cama_fuera_al(ca.id, lim.corte) THEN 'fuera'
              WHEN cama_bloqueada_al(ca.id, lim.corte) THEN 'bloqueada'
              ELSE 'libre' END,
         NULL, NULL, NULL, NULL, NULL, false
  FROM cama ca CROSS JOIN lim
  WHERE ca.servicio_id = p_servicio AND ca.activa AND ca.id NOT IN (SELECT cp.c_id FROM con_paciente cp WHERE cp.c_id IS NOT NULL);
$$;

CREATE FUNCTION renoxi_del_dia(p_dia date)
RETURNS TABLE (servicio_id text, fila_renoxi text, camas integer, operativas integer, sin_o2 integer, con_o2 integer,
               con_vm integer, ocupadas integer, disponibles integer)
LANGUAGE sql STABLE AS $$
  WITH lim AS (SELECT inicio_dia(p_dia + 1) AS corte),
  camas AS (
    SELECT c.servicio_id,
           count(*)::integer AS total,
           (count(*) FILTER (WHERE NOT cama_fuera_al(c.id, lim.corte) AND NOT cama_bloqueada_al(c.id, lim.corte)))::integer AS operativas
    FROM cama c CROSS JOIN lim WHERE c.activa GROUP BY c.servicio_id
  ),
  ocupantes AS (
    SELECT o.servicio_id, soporte_al(o.hospitalizacion_id, lim.corte) AS soporte
    FROM ocupacion_cama o CROSS JOIN lim
    WHERE o.desde < lim.corte AND (o.hasta IS NULL OR o.hasta >= lim.corte)
  ),
  suma AS (
    SELECT o.servicio_id,
           (count(*) FILTER (WHERE o.soporte = 'ninguno'))::integer AS sin_o2,
           (count(*) FILTER (WHERE o.soporte = 'o2'))::integer AS con_o2,
           (count(*) FILTER (WHERE o.soporte = 'vm'))::integer AS con_vm,
           count(*)::integer AS ocupadas
    FROM ocupantes o GROUP BY o.servicio_id
  )
  SELECT c.servicio_id, s.fila_renoxi, c.total, c.operativas,
         coalesce(x.sin_o2, 0), coalesce(x.con_o2, 0), coalesce(x.con_vm, 0), coalesce(x.ocupadas, 0),
         c.operativas - coalesce(x.ocupadas, 0)
  FROM camas c
  JOIN servicio s ON s.id = c.servicio_id
  LEFT JOIN suma x ON x.servicio_id = c.servicio_id;
$$;

-- ── Indicadores ─────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW mv_indicadores_mes AS
WITH censos AS (
  SELECT date_trunc('month', fecha)::date AS mes, servicio_id,
         sum(pacientes_dia)::integer AS b, count(*)::integer AS dias
  FROM censo_diario WHERE estado = 'cerrado'
  GROUP BY 1, 2
),
egresos AS (
  SELECT date_trunc('month', dia_censo(e.fecha_hora))::date AS mes, e.servicio_id,
         count(*)::integer AS e,
         sum(greatest(1, dia_censo(e.fecha_hora) - dia_censo(h.fecha_ingreso)))::integer AS c,
         (count(*) FILTER (WHERE NOT h.fecha_ingreso_estimada))::integer AS e_f,
         (coalesce(sum(greatest(1, dia_censo(e.fecha_hora) - dia_censo(h.fecha_ingreso))) FILTER (WHERE NOT h.fecha_ingreso_estimada), 0))::integer AS c_f
  FROM egreso e JOIN hospitalizacion h ON h.id = e.hospitalizacion_id
  WHERE NOT e.anulado AND e.estado IN ('validado', 'cerrado')
  GROUP BY 1, 2
),
puestos AS (
  SELECT servicio_id, count(*)::integer AS a FROM cama WHERE activa GROUP BY servicio_id
),
servicio_mes AS (
  SELECT mes, servicio_id FROM censos UNION SELECT mes, servicio_id FROM egresos
),
por_servicio AS (
  SELECT sm.mes, s.departamento_id, sm.servicio_id,
         coalesce(p.a, 0) AS a,
         coalesce(c.b, 0) AS b,
         coalesce(e.c, 0) AS c,
         coalesce(p.a, 0) * coalesce(c.dias, 0) AS d,
         coalesce(e.e, 0) AS e,
         coalesce(e.c_f, 0) AS c_f,
         coalesce(e.e_f, 0) AS e_f,
         coalesce(c.dias, 0) AS dias
  FROM servicio_mes sm
  JOIN servicio s ON s.id = sm.servicio_id
  LEFT JOIN puestos p ON p.servicio_id = sm.servicio_id
  LEFT JOIN censos c ON c.mes = sm.mes AND c.servicio_id = sm.servicio_id
  LEFT JOIN egresos e ON e.mes = sm.mes AND e.servicio_id = sm.servicio_id
),
por_departamento AS (
  SELECT x.mes, x.departamento_id,
         coalesce((SELECT sum(dd.n_camas) FROM dotacion_detalle dd
                   JOIN dotacion_version v ON v.id = dd.version_id
                   WHERE dd.departamento_id = x.departamento_id AND v.oficial
                     AND v.vigente_desde <= x.mes AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= x.mes)), 0)::integer AS a,
         sum(x.b)::integer AS b, sum(x.c)::integer AS c, sum(x.e)::integer AS e,
         sum(x.c_f)::integer AS c_f, sum(x.e_f)::integer AS e_f, max(x.dias)::integer AS dias
  FROM por_servicio x
  GROUP BY x.mes, x.departamento_id
),
filas AS (
  SELECT mes, 'mapeo'::text AS base, departamento_id, servicio_id, a, b, c, d, e, c_f, e_f, dias FROM por_servicio
  UNION ALL
  SELECT mes, 'oficial', departamento_id, NULL, a, b, c, a * dias, e, c_f, e_f, dias FROM por_departamento
)
SELECT mes, base, departamento_id, servicio_id, a, b, c, d, e, c_f, e_f,
       round(c_f::numeric / nullif(e_f, 0), 4) AS f,
       round(b * 100::numeric / nullif(d, 0), 4) AS g,
       round(e::numeric / nullif(a, 0), 4) AS h,
       round((d - b)::numeric / nullif(e, 0), 4) AS i,
       dias AS dias_con_censo
FROM filas
WITH NO DATA;

CREATE UNIQUE INDEX un_mv_indicadores ON mv_indicadores_mes (mes, base, departamento_id, servicio_id) NULLS NOT DISTINCT;

CREATE FUNCTION refrescar_indicadores() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  REFRESH MATERIALIZED VIEW mv_indicadores_mes;
END $$;

REFRESH MATERIALIZED VIEW mv_indicadores_mes;
