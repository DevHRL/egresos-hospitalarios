"""El ingreso funciona como el de Estadística: Argon2id, JWT HS256, cambio
obligatorio de clave y freno tras cinco fallos (decisión 0011)."""

import hashlib
import os
import time

import jwt
import pytest
from sqlalchemy import text

from app import autenticacion
from app.autenticacion import CREDENCIALES_INCORRECTAS, MAX_FALLOS, Rechazo
from app.config import variable
from app.seguridad import (
    ALGORITMO,
    AUDIENCIA,
    TokenInvalido,
    crear_token,
    hashear_clave,
    leer_token,
    necesita_rehash,
    secreto,
    verificar_clave,
)

CLAVE = variable("CLAVE_INICIAL_CUENTAS")
B = {"id": "medicina.b", "usuario": "medicina.b", "nombre": "Enfermería Medicina B", "rol": "enfermeria"}


def scrypt_antiguo(clave: str) -> str:
    """Como se guardaban las claves hasta el 2026-11-14."""
    sal = os.urandom(16)
    h = hashlib.scrypt(clave.encode(), salt=sal, n=2**14, r=8, p=1, maxmem=64 * 1024 * 1024)
    return f"scrypt${sal.hex()}${h.hex()}"


def hash_de(conn, cuenta_id):
    return conn.execute(text("SELECT clave_hash FROM cuenta WHERE id = :c"), {"c": cuenta_id}).scalar_one()


def rechazo(funcion, codigo):
    with pytest.raises(Rechazo) as e:
        funcion()
    assert e.value.codigo == codigo
    return e.value.detalle


# ------------------------------------------------------------- contraseñas


def test_la_clave_se_guarda_con_argon2id():
    h = hashear_clave("una-clave-larga")
    assert h.startswith("$argon2id$")
    assert verificar_clave("una-clave-larga", h)
    assert not verificar_clave("otra-clave-larga", h)
    assert not verificar_clave("una-clave-larga", None)
    assert not verificar_clave("una-clave-larga", "no-es-un-hash")
    assert not necesita_rehash(h)


def test_una_clave_scrypt_antigua_sirve_pero_pide_pasar_a_argon2():
    h = scrypt_antiguo("una-clave-larga")
    assert verificar_clave("una-clave-larga", h)
    assert not verificar_clave("otra-clave-larga", h)
    assert necesita_rehash(h)


# ------------------------------------------------------------------ tokens


def test_el_token_es_un_jwt_hs256_para_este_sistema():
    token, expira = crear_token(B, debe_cambiar_clave=False)
    cabecera = jwt.get_unverified_header(token)
    assert cabecera["alg"] == ALGORITMO == "HS256"
    r = leer_token(token)
    assert (r["sub"], r["usr"], r["rol"], r["cc"], r["aud"]) == ("medicina.b", "medicina.b", "enfermeria", False, AUDIENCIA)
    assert r["exp"] == expira


def test_un_token_de_otro_sistema_no_abre_este():
    """Aunque se firme con el mismo secreto: sin `aud` o con otro, se rechaza."""
    ahora = int(time.time())
    for aud in (None, "estadistica"):
        reclamos = {"sub": "medicina.b", "cc": False, "iat": ahora, "exp": ahora + 60}
        if aud:
            reclamos["aud"] = aud
        with pytest.raises(TokenInvalido):
            leer_token(jwt.encode(reclamos, secreto(), algorithm="HS256"))


def test_un_token_alterado_o_sin_firma_no_sirve():
    token, _ = crear_token(B, debe_cambiar_clave=False)
    cabecera, cuerpo, firma = token.split(".")
    with pytest.raises(TokenInvalido):
        leer_token(f"{cabecera}.{cuerpo}.{firma[::-1]}")
    sin_firma = jwt.encode({"sub": "medicina.b", "cc": False, "aud": AUDIENCIA, "iat": 1, "exp": 2**40}, None, algorithm="none")
    with pytest.raises(TokenInvalido):
        leer_token(sin_firma)
    with pytest.raises(TokenInvalido):
        leer_token(None)


def test_el_token_vencido_se_distingue_de_uno_falso():
    token, expira = crear_token(B, debe_cambiar_clave=False)
    with pytest.raises(TokenInvalido) as e:
        leer_token(token, ahora=expira)
    assert e.value.vencido
    with pytest.raises(TokenInvalido) as e:
        leer_token("x.y.z")
    assert not e.value.vencido


# ------------------------------------------------------------------ ingreso


def test_entra_con_su_clave_sin_distinguir_mayusculas(conn):
    r = autenticacion.ingresar(conn, " Medicina.B ", CLAVE, "10.0.0.5")
    assert r["tipo"] == "Bearer" and r["debe_cambiar_clave"] is False
    assert r["usuario"] == {"id": "medicina.b", "usuario": "medicina.b", "nombre": "Enfermería Medicina B", "rol": "enfermeria"}
    assert leer_token(r["token"])["sub"] == "medicina.b"
    ultimo = conn.execute(text("SELECT usuario, host(ip), exitoso FROM intento_acceso ORDER BY id DESC LIMIT 1")).one()
    assert tuple(ultimo) == ("medicina.b", "10.0.0.5", True)


def test_clave_equivocada_y_usuario_inexistente_dicen_lo_mismo(conn):
    assert rechazo(lambda: autenticacion.ingresar(conn, "medicina.b", "equivocada", None), 401) == CREDENCIALES_INCORRECTAS
    assert rechazo(lambda: autenticacion.ingresar(conn, "no.existe", CLAVE, None), 401) == CREDENCIALES_INCORRECTAS
    fallidos = conn.execute(text("SELECT count(*) FROM intento_acceso WHERE NOT exitoso")).scalar_one()
    assert fallidos == 2


def test_la_cuenta_sistema_no_entra(conn):
    rechazo(lambda: autenticacion.ingresar(conn, "sistema", CLAVE, None), 401)


def test_cinco_fallos_frenan_la_cuenta_aunque_luego_acierte(conn):
    for _ in range(MAX_FALLOS):
        rechazo(lambda: autenticacion.ingresar(conn, "uci", "equivocada", None), 401)
    assert "Demasiados intentos" in rechazo(lambda: autenticacion.ingresar(conn, "uci", CLAVE, None), 429)
    # El freno es por cuenta: las demás siguen entrando.
    assert autenticacion.ingresar(conn, "quemados", CLAVE, None)["token"]


def test_un_ingreso_correcto_borra_los_fallos_anteriores(conn):
    for _ in range(MAX_FALLOS - 1):
        rechazo(lambda: autenticacion.ingresar(conn, "uci", "equivocada", None), 401)
    autenticacion.ingresar(conn, "uci", CLAVE, None)
    rechazo(lambda: autenticacion.ingresar(conn, "uci", "equivocada", None), 401)
    assert autenticacion.ingresar(conn, "uci", CLAVE, None)["token"]


def test_una_cuenta_desactivada_solo_lo_sabe_quien_conoce_la_clave(conn):
    conn.execute(text("UPDATE cuenta SET activo = false WHERE id = 'uci'"))
    assert rechazo(lambda: autenticacion.ingresar(conn, "uci", "equivocada", None), 401) == CREDENCIALES_INCORRECTAS
    assert "desactivada" in rechazo(lambda: autenticacion.ingresar(conn, "uci", CLAVE, None), 403)


def test_la_clave_scrypt_pasa_a_argon2_al_entrar(conn):
    conn.execute(text("UPDATE cuenta SET clave_hash = :h WHERE id = 'uci'"), {"h": scrypt_antiguo(CLAVE)})
    autenticacion.ingresar(conn, "uci", CLAVE, None)
    assert hash_de(conn, "uci").startswith("$argon2id$")
    assert autenticacion.ingresar(conn, "uci", CLAVE, None)["token"]


# -------------------------------------------------------- cambio de clave


def test_la_clave_provisional_obliga_a_cambiarla(conn):
    assert autenticacion.fijar_clave(conn, "medicina.a", "provisional-2026", definitiva=False) == []
    r = autenticacion.ingresar(conn, "medicina.a", "provisional-2026", None)
    assert r["debe_cambiar_clave"] is True and leer_token(r["token"])["cc"] is True

    nueva = autenticacion.cambiar_clave(conn, "medicina.a", "provisional-2026", "clave-definitiva-2026", None)
    assert nueva["debe_cambiar_clave"] is False and leer_token(nueva["token"])["cc"] is False
    rechazo(lambda: autenticacion.ingresar(conn, "medicina.a", "provisional-2026", None), 401)
    assert autenticacion.ingresar(conn, "medicina.a", "clave-definitiva-2026", None)["debe_cambiar_clave"] is False


def test_el_cambio_exige_la_clave_actual_y_la_politica(conn):
    autenticacion.fijar_clave(conn, "medicina.a", "provisional-2026", definitiva=True)
    assert "actual" in rechazo(lambda: autenticacion.cambiar_clave(conn, "medicina.a", "otra", "clave-definitiva-2026", None), 403)
    problemas = rechazo(lambda: autenticacion.cambiar_clave(conn, "medicina.a", "provisional-2026", "corta", None), 422)
    assert any("10 caracteres" in p for p in problemas)
    problemas = rechazo(lambda: autenticacion.cambiar_clave(conn, "medicina.a", "provisional-2026", "medicina.a-2026-x", None), 422)
    assert any("usuario" in p for p in problemas)
    problemas = rechazo(lambda: autenticacion.cambiar_clave(conn, "medicina.a", "provisional-2026", "provisional-2026", None), 422)
    assert any("distinta" in p for p in problemas)


def test_ti_no_puede_fijar_una_clave_que_incumple_la_politica(conn):
    assert autenticacion.fijar_clave(conn, "medicina.a", "corta", definitiva=True)
    assert autenticacion.fijar_clave(conn, "no.existe", "una-clave-larga", definitiva=True) == ["No existe la cuenta «no.existe»."]


def test_la_auditoria_registra_el_cambio_sin_el_hash(conn):
    autenticacion.cambiar_clave(conn, "medicina.b", CLAVE, "clave-definitiva-2026", "10.0.0.7")
    fila = conn.execute(
        text("SELECT valor_anterior, valor_nuevo, cuenta_id, host(ip) FROM auditoria WHERE tabla = 'cuenta' AND registro_id = 'medicina.b' ORDER BY id DESC LIMIT 1")
    ).one()
    assert fila.valor_anterior["debe_cambiar_clave"] is False and fila.valor_nuevo["usuario"] == "medicina.b"
    assert (fila.cuenta_id, fila[3]) == ("medicina.b", "10.0.0.7")
    con_hash = conn.execute(
        text("SELECT count(*) FROM auditoria WHERE tabla = 'cuenta' AND (valor_anterior ? 'clave_hash' OR valor_nuevo ? 'clave_hash')")
    ).scalar_one()
    assert con_hash == 0
