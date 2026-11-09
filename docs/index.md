# Egresos Hospitalarios

Sistema de egresos hospitalarios. Recopila información de todas las áreas que
emiten censos, conecta y replica las tablas de Aletheia y hace seguimiento del
paciente desde su ingreso hasta su egreso.

## Situación actual

Hoy intervienen 4 personas solo en redactar los egresos hospitalarios, y cada
dato se transcribe a mano cuatro veces:

1. Enfermería entrega 23 censos en papel (HC, nombre, edad, cama) y las HC de
   los egresados.
2. Dos recepcionistas completan a mano en el censo el CIE-10, la fecha de
   ingreso y el médico del alta, buscándolos en la HC física y en Aletheia.
3. Una digitadora registra cada alta en Aletheia y emite el consolidado
   mensual de egresos.
4. La responsable de camas arma un Excel diario (camas, O2, VM) y lo carga a
   mano en RENOXI.
5. La jefatura de Estadística calcula los indicadores DIRESA a partir del
   consolidado.

Consecuencias medidas en septiembre de 2026:

- **Dos fuentes de pacientes-día** que no coinciden: 5 227 (consolidado) vs
  5 544 (Excel), -317 (-5,7 %). Solo 2 de 14 departamentos cuadran.
- **Dotaciones desactualizadas**: 217 (RD 2023), 235 (Excel) y 249
  (relación actualizada), y ninguna coincide con el conteo físico. Medicina
  tiene 53 camas reales y DIRESA y RENOXI siguen usando 42.
- **Traslados anotados como altas** y **préstamos de cama sin registro**.
  Junto con las dotaciones desactualizadas producen disponibilidades
  negativas (UTIN, Oncología, Medicina) que no reflejan la realidad.
- **Cuadre manual** de los números sin criterio documentado y sin trazabilidad.
- **No existe registro de ingresos**: la fecha de ingreso se reconstruye después.

## Objetivo

Reemplazar la cadena papel → censo completado → Aletheia → Excel → RENOXI por
**un solo registro de movimientos de pacientes por cama**, del que salen
automáticamente el censo diario, los egresos, el reporte RENOXI y los
indicadores DIRESA.

Con ese registro el hospital puede, por primera vez:

- Saber en tiempo real qué pacientes están hospitalizados y en qué cama, con
  ingresos obligatorios (antes solo se subían egresos).
- Ver la ocupación de cada habitación en un plano isométrico por departamento.
- Seguir la trayectoria completa de cada paciente, con traslados.
- Controlar las camas enviadas a mantenimiento.
- Calcular los indicadores con las camas que existen físicamente.

El sistema reemplaza a Aletheia.

## Alcance

- **Incluye:**
    - Catálogo de departamentos, servicios, habitaciones, camas y dotación versionada.
    - Plano isométrico de camas por habitación, en tiempo real.
    - Registro obligatorio de ingresos, y de traslados, préstamos de cama y egresos.
    - Trayectoria de cada paciente.
    - Inventario de camas y órdenes de mantenimiento.
    - Censo diario por servicio con cierre y cuadre automático.
    - Bandeja de completado de datos clínicos desde la HC física.
    - Control de la HC física (recibida, completada, devuelta).
    - Reporte diario para RENOXI y consolidado/indicadores mensuales DIRESA.
    - Migración de Aletheia (pacientes, HC, CIE-10, médicos, servicios, histórico) y su reemplazo.
    - Auditoría de cada cambio.
- **No incluye:**
    - Historia clínica electrónica (los datos clínicos siguen en la HC física).
    - Carga automática a RENOXI (no tiene API; se genera la vista para cargarla).
    - Emergencia como hospitalización: se registra para RENOXI, fuera de la
      dotación e indicadores.
    - Facturación, SIS o seguros.
    - Inventario de equipos distintos de camas (por ahora).

## Usuarios

| Quién | Qué necesita del sistema |
|---|---|
| Enfermería de servicio | Ver su mapa de camas, registrar ingresos, traslados, préstamos y altas, cerrar el censo del día. |
| Técnicos de Estadística (ex recepcionistas y digitadora) | Transcribir censos en papel mientras el servicio no sea digital, completar CIE-10 y médico desde la HC, controlar las HC físicas. |
| Responsable de camas / RENOXI | Ver el censo consolidado del día y obtener el reporte RENOXI listo para cargar. |
| Jefatura de Estadística | Validar, cerrar el mes, emitir indicadores DIRESA, mantener la dotación vigente. |
| Mantenimiento | Recibir las órdenes de camas con falla, registrar retiro, reparación, baja y devolución. |
| Dirección / jefaturas de departamento | Consultar ocupación y tablero en tiempo real. |
| TI | Usuarios, respaldos, integración con Aletheia. |

!!! warning "Sin datos de pacientes"
    Ni en este repositorio ni en su documentación va ningún dato de pacientes:
    ni capturas con nombres, ni Excel de ejemplo, ni volcados de la base.

## Contenido de esta documentación

- [Proceso](proceso/index.md): cómo funciona hoy y cómo funcionará, con diagramas.
- [Reglas de negocio](proceso/reglas.md): definiciones y fórmulas de cálculo.
- [Completado desde la HC física](proceso/completado-hc.md): cómo se capturan
  los datos que solo están en papel.
- [Camas, habitaciones y mantenimiento](proceso/camas-y-mantenimiento.md):
  inventario, estados de cama y flujo de mantenimiento.
- [Módulos y pantallas](modulos.md): qué hace cada módulo y cómo se ve.
- [Arquitectura](arquitectura.md): piezas del sistema, modelo de datos e integraciones.
- [Tecnologías](tecnologias.md): con qué se construye y por qué.
- [Decisiones](decisiones/index.md): registro de las decisiones importantes.
- [Plan de implementación](plan.md): fases, piloto y pendientes que bloquean.
- [Piloto Medicina](piloto-medicina.md): alcance, lo que falta para empezar y secuencia.
- [Preguntas técnicas](preguntas-tecnicas.md): lo que falta responder para
  dimensionar el desarrollo.
