"""Asigna la contraseña de una cuenta. Lo usa TI, como `asignar_clave` de Estadística.

    python -m semillas.asignar_clave medicina.b               # provisional: la cambia al entrar
    python -m semillas.asignar_clave medicina.b --definitiva  # no se le pide cambiarla

La clave se pide dos veces y no se muestra; no se pasa como argumento, para que
no quede en el historial de la consola."""

import argparse
import getpass
import sys

from sqlalchemy import create_engine

from app.autenticacion import fijar_clave
from app.config import url_owner


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("usuario")
    parser.add_argument("--definitiva", action="store_true", help="la cuenta no tendrá que cambiarla al entrar")
    args = parser.parse_args()

    clave = getpass.getpass(f"Contraseña nueva para {args.usuario}: ")
    if clave != getpass.getpass("Repítela: "):
        print("No coinciden. No se cambió nada.", file=sys.stderr)
        return 1
    with create_engine(url_owner()).begin() as conexion:
        problemas = fijar_clave(conexion, args.usuario, clave, definitiva=args.definitiva)
    if problemas:
        print("No se cambió nada:\n- " + "\n- ".join(problemas), file=sys.stderr)
        return 1
    print(f"Listo. {args.usuario} {'ya puede entrar con ella' if args.definitiva else 'la cambiará en su primer ingreso'}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
