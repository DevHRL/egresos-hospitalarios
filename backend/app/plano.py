"""Guarda el plano del editor como maestro de camas. Nada con historia se borra:
lo que deja de estar en el plano pasa a baja lógica."""

from sqlalchemy import text

from app.acciones import Ctx, ErrorRegla, falla, preparar

VERSION_MAXIMA = 2


def _ids(c: Ctx, tabla: str, columna: str) -> set[str]:
    return {f["id"] for f in c.todos(f"SELECT id FROM {tabla} WHERE {columna}")}


def guardar_plano(conexion, cuenta: dict, plano: dict, ahora: str, ip: str | None) -> dict:
    if cuenta["rol"] != "jefatura":
        raise ErrorRegla("Esta cuenta no tiene permiso para esta acción.")
    if not isinstance(plano.get("version"), int) or plano["version"] > VERSION_MAXIMA:
        falla("El plano es de una versión que este sistema no admite.")
    preparar(conexion, cuenta, ip)
    c = Ctx(conexion, cuenta, ahora)
    zonas = {z["id"]: z for z in plano["zonas"]}
    actuales = {f["id"]: f for f in c.todos("SELECT * FROM cama WHERE activa")}
    nuevas = {x["id"]: x for x in plano["camas"]}

    for cama_id, cama in actuales.items():
        destino = nuevas.get(cama_id)
        ocupada = c.ocupada(cama_id)
        if destino is None and ocupada:
            falla(f"La cama {cama['codigo']} tiene un paciente: no se puede quitar del plano.")
        if destino is not None and ocupada:
            servicio = destino.get("servicioId") or zonas.get(destino["zonaId"], {}).get("servicioId")
            if servicio != cama["servicio_id"]:
                falla(f"La cama {cama['codigo']} tiene un paciente: no puede cambiar de servicio.")

    # Primero se libera el código de las que cambian: dos camas pueden intercambiarlo.
    for cama_id, cama in actuales.items():
        if cama_id in nuevas and nuevas[cama_id]["codigo"] != cama["codigo"]:
            c.ejec("UPDATE cama SET codigo = :temporal WHERE id = :id", temporal=f"~{cama_id}", id=cama_id)
    for z in c.todos("SELECT id, codigo FROM zona WHERE activo AND codigo <> ''"):
        if z["id"] in zonas and (zonas[z["id"]].get("codigo") or "") != z["codigo"]:
            c.ejec("UPDATE zona SET codigo = :temporal WHERE id = :id", temporal=f"~{z['id']}", id=z["id"])

    for cama_id in actuales.keys() - nuevas.keys():
        c.ejec("UPDATE cama SET activa = false WHERE id = :id", id=cama_id)
        c.ejec("UPDATE activo_cama SET cama_id = NULL, estado = 'en_almacen' WHERE cama_id = :id AND estado = 'en_uso'", id=cama_id)
    for zona_id in _ids(c, "zona", "activo") - zonas.keys():
        c.ejec("UPDATE zona SET activo = false WHERE id = :id", id=zona_id)
    pisos = {p["id"] for p in plano["pisos"]}
    for piso_id in _ids(c, "piso", "activo") - pisos:
        c.ejec("UPDATE piso SET activo = false WHERE id = :id", id=piso_id)

    for p in plano["pisos"]:
        c.ejec(
            """INSERT INTO piso (id, nombre, ancho, alto) VALUES (:id, :nombre, :ancho, :alto)
               ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, ancho = EXCLUDED.ancho, alto = EXCLUDED.alto, activo = true""",
            id=p["id"], nombre=p["nombre"], ancho=p["ancho"], alto=p["alto"],
        )
    for z in plano["zonas"]:
        c.ejec(
            """INSERT INTO zona (id, piso_id, tipo, codigo, nombre, servicio_id, x, y, ancho, alto)
               VALUES (:id, :piso, :tipo, :codigo, :nombre, :servicio, :x, :y, :ancho, :alto)
               ON CONFLICT (id) DO UPDATE SET piso_id = EXCLUDED.piso_id, tipo = EXCLUDED.tipo, codigo = EXCLUDED.codigo, nombre = EXCLUDED.nombre,
                 servicio_id = EXCLUDED.servicio_id, x = EXCLUDED.x, y = EXCLUDED.y, ancho = EXCLUDED.ancho, alto = EXCLUDED.alto, activo = true""",
            id=z["id"], piso=z["pisoId"], tipo=z["tipo"], codigo=z.get("codigo") or "", nombre=z.get("nombre") or "",
            servicio=z.get("servicioId") or None, x=z["x"], y=z["y"], ancho=z["ancho"], alto=z["alto"],
        )
    altas = 0
    for x in plano["camas"]:
        servicio = x.get("servicioId") or zonas.get(x["zonaId"], {}).get("servicioId")
        if not servicio:
            falla(f"La cama {x['codigo']} está en una habitación sin servicio.")
        existia = x["id"] in actuales or c.valor("SELECT EXISTS (SELECT 1 FROM cama WHERE id = :id)", id=x["id"])
        c.ejec(
            """INSERT INTO cama (id, zona_id, servicio_id, codigo, tipo, x, y, rotacion)
               VALUES (:id, :zona, :servicio, :codigo, :tipo, :x, :y, :rotacion)
               ON CONFLICT (id) DO UPDATE SET zona_id = EXCLUDED.zona_id, servicio_id = EXCLUDED.servicio_id, codigo = EXCLUDED.codigo,
                 tipo = EXCLUDED.tipo, x = EXCLUDED.x, y = EXCLUDED.y, rotacion = EXCLUDED.rotacion, activa = true""",
            id=x["id"], zona=x["zonaId"], servicio=servicio, codigo=x["codigo"], tipo=x["tipo"], x=x["x"], y=x["y"], rotacion=x["rotacion"],
        )
        if not c.valor("SELECT EXISTS (SELECT 1 FROM activo_cama WHERE cama_id = :id)", id=x["id"]):
            n = c.valor("SELECT count(*) FROM activo_cama WHERE codigo_interno LIKE :p", p=f"CAM-{x['codigo']}%")
            sufijo = f"-{n}" if n else ""
            c.ejec(
                "INSERT INTO activo_cama (codigo_interno, tipo, cama_id, estado) VALUES (:codigo, :tipo, :id, 'en_uso')",
                codigo=f"CAM-{x['codigo']}{sufijo}", tipo=x["tipo"], id=x["id"],
            )
        altas += 0 if existia else 1
    bajas = len(actuales.keys() - nuevas.keys())
    detalle = f"{len(plano['camas'])} camas, {altas} nuevas, {bajas} dadas de baja"
    conexion.execute(
        text(
            """INSERT INTO bitacora (fecha_hora, cuenta_id, ip, tipo, descripcion, detalle)
               VALUES (desde_local(:ahora), :cuenta, CAST(NULLIF(:ip, '') AS inet), 'plano/guardar', 'Publicó el plano de camas', :detalle)"""
        ),
        {"ahora": ahora, "cuenta": cuenta["id"], "ip": ip or "", "detalle": detalle},
    )
    return {"camas": len(plano["camas"]), "nuevas": altas, "bajas": bajas}
