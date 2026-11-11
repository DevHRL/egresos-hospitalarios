-- Tablas del sistema. Definición funcional en docs/tareas/base-de-datos-postgresql.md.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE FUNCTION dia_censo(ts timestamptz) RETURNS date
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN (ts AT TIME ZONE 'America/Lima')::date;

CREATE FUNCTION texto_local(ts timestamptz) RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  RETURN to_char(ts AT TIME ZONE 'America/Lima', 'YYYY-MM-DD"T"HH24:MI');

CREATE FUNCTION desde_local(t text) RETURNS timestamptz
  LANGUAGE sql STABLE PARALLEL SAFE
  RETURN (t::timestamp AT TIME ZONE 'America/Lima');

CREATE FUNCTION inicio_dia(d date) RETURNS timestamptz
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN (d::timestamp AT TIME ZONE 'America/Lima');

-- ── Maestros físicos ────────────────────────────────────────────────────

CREATE TABLE departamento (
  id text PRIMARY KEY,
  nombre text NOT NULL UNIQUE,
  en_dotacion boolean NOT NULL,
  reporte_diresa text CHECK (reporte_diresa IN ('hospitalizacion', 'uci', 'utin')),
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE servicio (
  id text PRIMARY KEY,
  departamento_id text NOT NULL REFERENCES departamento,
  nombre text NOT NULL UNIQUE,
  modalidad_captura text NOT NULL CHECK (modalidad_captura IN ('papel', 'digital')),
  fila_renoxi text,
  camas_referencia integer,
  fecha_arranque date,                         -- nulo: todavía no incorporado
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE piso (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  ancho numeric(6,2) NOT NULL,
  alto numeric(6,2) NOT NULL,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE zona (
  id text PRIMARY KEY,
  piso_id text NOT NULL REFERENCES piso,
  tipo text NOT NULL CHECK (tipo IN ('habitacion', 'pasillo', 'estacion', 'apoyo')),
  codigo text NOT NULL DEFAULT '',
  nombre text NOT NULL DEFAULT '',
  servicio_id text REFERENCES servicio,
  x numeric(6,2) NOT NULL,
  y numeric(6,2) NOT NULL,
  ancho numeric(6,2) NOT NULL,
  alto numeric(6,2) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  CHECK (NOT activo OR tipo <> 'habitacion' OR (servicio_id IS NOT NULL AND codigo <> ''))
);
CREATE UNIQUE INDEX un_zona_codigo ON zona (piso_id, codigo) WHERE codigo <> '' AND activo;

CREATE TABLE cama (
  id text PRIMARY KEY,
  zona_id text NOT NULL REFERENCES zona,
  servicio_id text NOT NULL REFERENCES servicio,
  codigo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('adulto', 'uci', 'pediatrica', 'cuna')),
  x numeric(6,2) NOT NULL,
  y numeric(6,2) NOT NULL,
  rotacion smallint NOT NULL CHECK (rotacion IN (0, 90, 180, 270)),
  fuera_de_servicio boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true          -- baja lógica: la historia sigue apuntando aquí
);
CREATE UNIQUE INDEX un_cama_codigo ON cama (codigo) WHERE activa;
CREATE INDEX ix_cama_servicio ON cama (servicio_id) WHERE activa;

-- ── Cuentas y catálogos ─────────────────────────────────────────────────

CREATE TABLE cuenta (
  id text PRIMARY KEY,
  usuario text NOT NULL UNIQUE,
  nombre text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('admision', 'enfermeria', 'tecnico', 'camas', 'jefatura', 'mantenimiento', 'consulta', 'ti', 'sistema')),
  clave_hash text,
  activo boolean NOT NULL DEFAULT true,
  CHECK (rol = 'sistema' OR clave_hash IS NOT NULL)
);

CREATE TABLE cuenta_servicio (
  cuenta_id text NOT NULL REFERENCES cuenta,
  servicio_id text NOT NULL REFERENCES servicio,
  PRIMARY KEY (cuenta_id, servicio_id)
);

CREATE TABLE bloqueo_cama (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cama_id text NOT NULL REFERENCES cama,
  motivo text NOT NULL CHECK (coalesce(trim(motivo), '') <> ''),
  desde timestamptz NOT NULL,
  hasta timestamptz,
  bloqueado_por text NOT NULL REFERENCES cuenta,
  desbloqueado_por text REFERENCES cuenta,
  CHECK (hasta IS NULL OR hasta >= desde)
);
CREATE UNIQUE INDEX un_bloqueo_abierto ON bloqueo_cama (cama_id) WHERE hasta IS NULL;

CREATE TABLE activo_cama (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_interno text NOT NULL UNIQUE,
  codigo_patrimonial text UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('adulto', 'uci', 'pediatrica', 'cuna')),
  cama_id text REFERENCES cama,
  estado text NOT NULL CHECK (estado IN ('en_uso', 'reportada', 'en_mantenimiento', 'en_almacen', 'de_baja'))
);
CREATE UNIQUE INDEX un_activo_en_puesto ON activo_cama (cama_id) WHERE cama_id IS NOT NULL;

CREATE TABLE orden_mantenimiento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cama_id text NOT NULL REFERENCES cama,
  activo_id bigint NOT NULL REFERENCES activo_cama,
  falla text NOT NULL CHECK (coalesce(trim(falla), '') <> ''),
  reportada_en timestamptz NOT NULL,
  reportada_por text NOT NULL REFERENCES cuenta,
  estado text NOT NULL CHECK (estado IN ('pendiente_retiro', 'en_reparacion', 'lista_entrega', 'por_recibir', 'cerrada')),
  con_reemplazo boolean,
  activo_reemplazo_id bigint REFERENCES activo_cama,
  retirada_en timestamptz,
  resuelta_en timestamptz,
  entregada_en timestamptz,
  recibida_en timestamptz,
  diagnostico text,
  resultado text CHECK (resultado IN ('reparada', 'baja'))
);
CREATE UNIQUE INDEX un_orden_mant_abierta ON orden_mantenimiento (cama_id) WHERE estado <> 'cerrada';

CREATE TABLE medico (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE cie10 (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE paciente (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  n_hc text NOT NULL UNIQUE CHECK (n_hc ~ '^[0-9]{4,10}$'),
  tipo_documento text NOT NULL CHECK (tipo_documento IN ('dni', 'ce', 'pasaporte', 'sin_documento')),
  numero_documento text,
  nombres text NOT NULL CHECK (coalesce(trim(nombres), '') <> ''),
  sexo text NOT NULL CHECK (sexo IN ('F', 'M')),
  fecha_nacimiento date,
  origen text NOT NULL CHECK (origen IN ('local', 'aletheia', 'galeno')),
  id_externo text,                              -- identificador en Admisión (Galeno)
  madre_id bigint REFERENCES paciente,          -- recién nacidos
  fusionado_en_id bigint REFERENCES paciente,   -- NN identificado después
  registrado_en timestamptz NOT NULL,
  CHECK (tipo_documento <> 'dni' OR numero_documento ~ '^[0-9]{8}$'),
  CHECK (tipo_documento = 'sin_documento' OR numero_documento IS NOT NULL),
  CHECK (tipo_documento = 'sin_documento' OR fecha_nacimiento IS NOT NULL),
  CHECK (fusionado_en_id IS NULL OR fusionado_en_id <> id)
);
CREATE UNIQUE INDEX un_paciente_documento ON paciente (tipo_documento, numero_documento) WHERE numero_documento IS NOT NULL;
CREATE UNIQUE INDEX un_paciente_externo ON paciente (origen, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX ix_paciente_nombre ON paciente USING gin (lower(nombres) gin_trgm_ops);

-- ── Flujo de hospitalización ────────────────────────────────────────────

CREATE TABLE orden_hospitalizacion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  paciente_id bigint NOT NULL REFERENCES paciente,
  origen text NOT NULL CHECK (origen IN ('consulta_externa', 'emergencia', 'referencia', 'otro_servicio')),
  servicio_id text NOT NULL REFERENCES servicio,
  servicio_procedencia_id text REFERENCES servicio,
  fecha_hora timestamptz NOT NULL,
  medico_ordena text,
  diagnostico_ingreso text,
  enviada_por text,
  estado text NOT NULL CHECK (estado IN ('pendiente', 'ingresada', 'anulada')),
  motivo_anulacion text,
  registrada_por text NOT NULL REFERENCES cuenta,
  id_externo text,                              -- orden validada en Admisión (Galeno)
  CHECK (origen <> 'emergencia' OR coalesce(trim(enviada_por), '') <> ''),
  CHECK (origen <> 'otro_servicio' OR servicio_procedencia_id IS NOT NULL),
  CHECK (estado <> 'anulada' OR coalesce(trim(motivo_anulacion), '') <> '')
);
CREATE UNIQUE INDEX un_orden_pendiente ON orden_hospitalizacion (paciente_id) WHERE estado = 'pendiente';
CREATE UNIQUE INDEX un_orden_externa ON orden_hospitalizacion (id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE hospitalizacion (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  paciente_id bigint NOT NULL REFERENCES paciente,
  orden_id bigint REFERENCES orden_hospitalizacion,
  origen text NOT NULL CHECK (origen IN ('consulta_externa', 'emergencia', 'referencia', 'otro_servicio', 'previo_sistema')),
  fecha_ingreso timestamptz NOT NULL,
  diagnostico_ingreso text,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'egresada', 'anulada')),
  ingreso_previo_sistema boolean NOT NULL DEFAULT false,
  fecha_ingreso_estimada boolean NOT NULL DEFAULT false,
  CHECK (orden_id IS NOT NULL OR ingreso_previo_sistema),
  CHECK (NOT fecha_ingreso_estimada OR ingreso_previo_sistema)
);
CREATE UNIQUE INDEX un_hospitalizacion_abierta ON hospitalizacion (paciente_id) WHERE estado = 'abierta';
CREATE UNIQUE INDEX un_orden_hospitalizada ON hospitalizacion (orden_id) WHERE estado <> 'anulada';

CREATE TABLE movimiento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospitalizacion_id bigint NOT NULL REFERENCES hospitalizacion,
  tipo text NOT NULL CHECK (tipo IN ('ingreso', 'traslado', 'soporte', 'egreso')),
  fecha_hora timestamptz NOT NULL,
  dia date GENERATED ALWAYS AS (dia_censo(fecha_hora)) STORED,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  cuenta_id text NOT NULL REFERENCES cuenta,
  cama_id text NOT NULL REFERENCES cama,
  servicio_id text NOT NULL REFERENCES servicio,
  servicio_origen_id text REFERENCES servicio,
  cama_origen_id text REFERENCES cama,
  soporte text CHECK (soporte IN ('ninguno', 'o2', 'vm')),
  tipo_egreso text CHECK (tipo_egreso IN ('alta_medica', 'alta_voluntaria', 'fuga', 'referido', 'fallecido_menor_48', 'fallecido_mayor_48', 'traslado_no_incorporado')),
  anulado boolean NOT NULL DEFAULT false,
  motivo_anulacion text,
  anulado_en timestamptz,
  anulado_por text REFERENCES cuenta,
  CHECK (NOT anulado OR coalesce(trim(motivo_anulacion), '') <> ''),
  CHECK (tipo <> 'traslado' OR (servicio_origen_id IS NOT NULL AND cama_origen_id IS NOT NULL)),
  CHECK ((tipo = 'soporte') = (soporte IS NOT NULL)),
  CHECK ((tipo = 'egreso') = (tipo_egreso IS NOT NULL))
);
CREATE UNIQUE INDEX un_ingreso_vigente ON movimiento (hospitalizacion_id) WHERE tipo = 'ingreso' AND NOT anulado;
CREATE UNIQUE INDEX un_egreso_vigente ON movimiento (hospitalizacion_id) WHERE tipo = 'egreso' AND NOT anulado;
CREATE INDEX ix_movimiento_hospitalizacion ON movimiento (hospitalizacion_id, fecha_hora, id);
CREATE INDEX ix_movimiento_servicio_dia ON movimiento (servicio_id, dia) WHERE NOT anulado;
CREATE INDEX ix_movimiento_origen_dia ON movimiento (servicio_origen_id, dia) WHERE NOT anulado AND servicio_origen_id IS NOT NULL;

CREATE TABLE ocupacion_cama (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospitalizacion_id bigint NOT NULL REFERENCES hospitalizacion,
  cama_id text NOT NULL REFERENCES cama,
  servicio_id text NOT NULL REFERENCES servicio,
  desde timestamptz NOT NULL,
  hasta timestamptz,
  rango tstzrange GENERATED ALWAYS AS (tstzrange(desde, hasta, '[)')) STORED,
  CHECK (hasta IS NULL OR hasta > desde),
  CONSTRAINT cama_sin_choque EXCLUDE USING gist (cama_id WITH =, rango WITH &&)
);
CREATE UNIQUE INDEX un_tramo_abierto ON ocupacion_cama (hospitalizacion_id) WHERE hasta IS NULL;
CREATE INDEX ix_ocupacion_servicio ON ocupacion_cama (servicio_id, desde);

CREATE TABLE traslado (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospitalizacion_id bigint NOT NULL REFERENCES hospitalizacion,
  servicio_origen_id text NOT NULL REFERENCES servicio,
  servicio_destino_id text NOT NULL REFERENCES servicio,
  cama_origen_id text NOT NULL REFERENCES cama,
  solicitado_en timestamptz NOT NULL,
  solicitado_por text NOT NULL REFERENCES cuenta,
  estado text NOT NULL CHECK (estado IN ('pendiente', 'confirmado', 'cancelado', 'anulado')),
  confirmado_en timestamptz,
  confirmado_por text REFERENCES cuenta,
  movimiento_id bigint REFERENCES movimiento,
  CHECK (servicio_origen_id <> servicio_destino_id)
);
CREATE UNIQUE INDEX un_traslado_pendiente ON traslado (hospitalizacion_id) WHERE estado = 'pendiente';

CREATE TABLE egreso (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospitalizacion_id bigint NOT NULL REFERENCES hospitalizacion,
  movimiento_id bigint NOT NULL REFERENCES movimiento,
  fecha_hora timestamptz NOT NULL,
  alta_medica_en timestamptz,                   -- puede ser anterior a la salida física
  tipo text NOT NULL CHECK (tipo IN ('alta_medica', 'alta_voluntaria', 'fuga', 'referido', 'fallecido_menor_48', 'fallecido_mayor_48', 'traslado_no_incorporado')),
  condicion text CHECK (condicion IN ('curado', 'mejorado', 'igual', 'peor', 'fallecido')),
  destino text,
  servicio_id text NOT NULL REFERENCES servicio,
  medico_id text REFERENCES medico,
  estado text CHECK (estado IN ('pendiente_hc', 'completo', 'observado', 'validado', 'cerrado')),
  motivo_observacion text,
  completado_en timestamptz,
  validado_en timestamptz,
  completado_por text REFERENCES cuenta,
  validado_por text REFERENCES cuenta,
  anulado boolean NOT NULL DEFAULT false,
  CHECK (tipo <> 'traslado_no_incorporado' OR (estado IS NULL AND coalesce(trim(destino), '') <> '')),
  CHECK (tipo = 'traslado_no_incorporado' OR (estado IS NOT NULL AND condicion IS NOT NULL)),
  CHECK (estado IS NULL OR estado NOT IN ('completo', 'validado', 'cerrado') OR medico_id IS NOT NULL),
  CHECK (alta_medica_en IS NULL OR alta_medica_en <= fecha_hora)
);
CREATE UNIQUE INDEX un_egreso_hospitalizacion ON egreso (hospitalizacion_id) WHERE NOT anulado;
CREATE INDEX ix_egreso_servicio ON egreso (servicio_id, fecha_hora) WHERE NOT anulado;

CREATE TABLE diagnostico_egreso (
  egreso_id bigint NOT NULL REFERENCES egreso,
  cie10 text NOT NULL REFERENCES cie10,
  principal boolean NOT NULL,
  orden smallint NOT NULL,
  PRIMARY KEY (egreso_id, cie10)
);
CREATE UNIQUE INDEX un_diagnostico_principal ON diagnostico_egreso (egreso_id) WHERE principal;

CREATE TABLE control_hc (
  egreso_id bigint PRIMARY KEY REFERENCES egreso,
  estado text NOT NULL CHECK (estado IN ('pendiente_entrega', 'recibida', 'completada', 'devuelta')),
  recibida_en timestamptz,
  completada_en timestamptz,
  devuelta_en timestamptz,
  recibida_por text REFERENCES cuenta,
  devuelta_por text REFERENCES cuenta
);

CREATE TABLE correccion_movimiento (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movimiento_id bigint NOT NULL REFERENCES movimiento,
  fecha_anterior timestamptz NOT NULL,
  fecha_nueva timestamptz NOT NULL,
  motivo text NOT NULL CHECK (coalesce(trim(motivo), '') <> ''),
  registrado_en timestamptz NOT NULL,
  cuenta_id text NOT NULL REFERENCES cuenta
);

-- ── Censo ───────────────────────────────────────────────────────────────

CREATE TABLE censo_diario (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  servicio_id text NOT NULL REFERENCES servicio,
  fecha date NOT NULL,
  estado text NOT NULL CHECK (estado IN ('abierto', 'cerrado', 'reabierto')),
  saldo_anterior integer,
  ingresos integer,
  traslados_entrada integer,
  egresos integer,
  traslados_salida integer,
  pacientes_corte integer,
  entraron_y_salieron integer,
  pacientes_dia integer,
  conteo_fisico integer CHECK (conteo_fisico >= 0),
  observacion text,
  cerrado_en timestamptz,
  cerrado_por text REFERENCES cuenta,
  motivo_reapertura text,
  reabierto_en timestamptz,
  reabierto_por text REFERENCES cuenta,
  UNIQUE (servicio_id, fecha),
  CHECK (estado <> 'cerrado' OR (saldo_anterior IS NOT NULL AND ingresos IS NOT NULL AND traslados_entrada IS NOT NULL
    AND egresos IS NOT NULL AND traslados_salida IS NOT NULL AND pacientes_corte IS NOT NULL
    AND entraron_y_salieron IS NOT NULL AND pacientes_dia IS NOT NULL AND conteo_fisico IS NOT NULL)),
  CHECK (estado <> 'cerrado' OR (conteo_fisico = pacientes_corte
    AND saldo_anterior + ingresos + traslados_entrada - egresos - traslados_salida = pacientes_corte)
    OR coalesce(trim(observacion), '') <> ''),
  CHECK (estado <> 'reabierto' OR coalesce(trim(motivo_reapertura), '') <> '')
);

CREATE TABLE censo_detalle (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  censo_id bigint NOT NULL REFERENCES censo_diario,
  cama_id text REFERENCES cama,
  hospitalizacion_id bigint REFERENCES hospitalizacion,
  estado_cama text CHECK (estado_cama IN ('libre', 'bloqueada', 'fuera')),
  movimiento text,
  relacion text,
  soporte text CHECK (soporte IN ('ninguno', 'o2', 'vm')),
  dias_estancia integer,
  tipo_egreso text,
  presente_al_corte boolean NOT NULL,
  observacion text
);
CREATE INDEX ix_censo_detalle ON censo_detalle (censo_id);

CREATE TABLE censo_nota (
  censo_id bigint NOT NULL REFERENCES censo_diario,
  hospitalizacion_id bigint NOT NULL REFERENCES hospitalizacion,
  nota text NOT NULL,
  PRIMARY KEY (censo_id, hospitalizacion_id)
);

-- Unidades sin camas mapeadas, como Trauma Shock: solo un conteo diario.
CREATE TABLE conteo_unidad_diario (
  servicio_id text NOT NULL REFERENCES servicio,
  fecha date NOT NULL,
  pacientes integer NOT NULL CHECK (pacientes >= 0),
  observacion text,
  registrado_en timestamptz NOT NULL,
  cuenta_id text NOT NULL REFERENCES cuenta,
  PRIMARY KEY (servicio_id, fecha)
);

-- ── Periodos, dotación y reportes ───────────────────────────────────────

CREATE TABLE dotacion_version (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  documento text,
  oficial boolean NOT NULL DEFAULT false,
  vigente_desde date NOT NULL,
  vigente_hasta date
);

CREATE TABLE dotacion_detalle (
  version_id text NOT NULL REFERENCES dotacion_version,
  departamento_id text NOT NULL REFERENCES departamento,
  servicio_id text REFERENCES servicio,
  n_camas integer NOT NULL CHECK (n_camas >= 0),
  UNIQUE NULLS NOT DISTINCT (version_id, departamento_id, servicio_id)
);

CREATE TABLE periodo (
  mes date PRIMARY KEY CHECK (extract(day FROM mes) = 1),
  estado text NOT NULL CHECK (estado IN ('abierto', 'cerrado')),
  dotacion_version_id text REFERENCES dotacion_version,
  cerrado_en timestamptz,
  cerrado_por text REFERENCES cuenta
);

-- Las cifras reportadas al cerrar el mes. No se recalculan: un cambio posterior
-- del plano o de la dotación no las altera.
CREATE TABLE indicador_mes_cerrado (
  mes date NOT NULL REFERENCES periodo,
  base text NOT NULL CHECK (base IN ('mapeo', 'oficial')),
  departamento_id text NOT NULL REFERENCES departamento,
  servicio_id text REFERENCES servicio,
  a integer NOT NULL,
  b integer NOT NULL,
  c integer NOT NULL,
  d integer NOT NULL,
  e integer NOT NULL,
  c_f integer NOT NULL,                          -- C y E sin fechas de ingreso estimadas
  e_f integer NOT NULL,
  f numeric,
  g numeric,
  h numeric,
  i numeric,
  dias_con_censo integer NOT NULL,
  UNIQUE NULLS NOT DISTINCT (mes, base, departamento_id, servicio_id)
);

-- Corrección posterior al cierre: se muestra junto a la cifra, sin reemplazarla.
CREATE TABLE ajuste_periodo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mes date NOT NULL REFERENCES periodo,
  servicio_id text REFERENCES servicio,
  variable text NOT NULL CHECK (variable IN ('A', 'B', 'C', 'D', 'E')),
  valor_corregido numeric NOT NULL,
  motivo text NOT NULL CHECK (coalesce(trim(motivo), '') <> ''),
  registrado_en timestamptz NOT NULL,
  cuenta_id text NOT NULL REFERENCES cuenta
);

CREATE TABLE renoxi_carga (
  dia date PRIMARY KEY,
  cargado_en timestamptz NOT NULL,
  cuenta_id text NOT NULL REFERENCES cuenta
);

CREATE TABLE parametro (
  clave text NOT NULL,
  vigente_desde date NOT NULL,
  valor jsonb NOT NULL,
  PRIMARY KEY (clave, vigente_desde)
);

-- ── Trazabilidad ────────────────────────────────────────────────────────

CREATE TABLE bitacora (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha_hora timestamptz NOT NULL,
  cuenta_id text NOT NULL REFERENCES cuenta,
  ip inet,
  tipo text NOT NULL,
  descripcion text NOT NULL,
  detalle text NOT NULL DEFAULT ''
);
CREATE INDEX ix_bitacora_fecha ON bitacora (fecha_hora DESC, id DESC);

CREATE TABLE auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabla text NOT NULL,
  registro_id text,
  accion text NOT NULL,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  cuenta_id text,
  ip inet,
  fecha_hora timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_registro ON auditoria (tabla, registro_id);
