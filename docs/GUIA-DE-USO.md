# Casa en Orden — Guía de uso

Esta guía es para quienes usan la aplicación todos los días. No hace falta saber nada técnico.

## Entrar

1. Abrí la dirección que te pasaron (por ejemplo `http://192.168.0.10:8000` desde el celular, o
   `http://localhost:8000` en la computadora donde está instalada).
2. Escribí tu **usuario** y tu **contraseña**.
3. La primera vez la aplicación te pide **cambiar la contraseña** (la que te dieron es provisoria).
   Elegí una de al menos 6 caracteres; una frase fácil de recordar es más segura que una palabra corta.

> Si te olvidaste la contraseña, pedile a un administrador del hogar que te asigne una nueva.
> Después de 5 intentos fallidos, el ingreso se bloquea unos minutos.

En el celular, el menú está en el botón ☰ de arriba a la derecha. El botón naranja **+** de abajo
sirve para cargar un pago desde cualquier pantalla.

## Cargar un pago

**Nuevo pago** (el botón naranja):

- **Importe** y **Categoría** son obligatorios (marcados con <span style="color:red">*</span>).
  Escribí el importe sin puntos: `10000` se ve como `10.000` y al salir del campo queda `10.000,00`.
  Los centavos van con coma: `1500,50`.
- **Fecha de pago**: por defecto, hoy.
- Según la categoría, se elige además el **tipo** (ej. Tarjeta de crédito → Visa) y, en Auto,
  **qué auto**.
- Podés adjuntar la **factura o el comprobante** (foto o PDF, hasta 10 MB).

Todos ven los pagos del hogar. Cada uno puede corregir o borrar **los que cargó**; los
administradores, todos.

## Pagos

La lista de todo lo pagado, de a 10 por página, con el total arriba. Se puede filtrar por período,
categoría, tipo (y auto), quién lo cargó, y buscar por texto (no importan las tildes). Tocando los
títulos de las columnas se ordena por fecha, detalle o importe.

## Calendario

- **Vencimientos**: lo que hay que pagar (servicios, resúmenes de tarjeta, patentes…). Rojo =
  vencido, gris tachado = pagado. Tocá uno para **registrar el pago**: el importe ya viene
  completo; si pagaste otro (por ejemplo, vino con aumento), cambialo antes de registrar. El pago
  aparece solo en la lista de Pagos.
  - ¿Ya lo habías cargado en Pagos? Usá **«¿Ya lo cargaste en Pagos? Vincular ese pago»** para no
    duplicarlo.
  - Podés adjuntar la factura en el mismo vencimiento.
- **Pagos realizados**: lo que se fue pagando, día por día, con el total del mes.
- **Programados**: la lista de todo lo que tiene vencimiento.

El número rojo junto a **Calendario** en el menú indica cuántos vencimientos hay vencidos o por
vencer esta semana.

## Inicio

Un resumen del mes: cuánto se gastó (y si es más o menos que el mes anterior), cuánto se va a
terminar gastando con lo que falta vencer, los próximos vencimientos, el gasto por categoría, los
presupuestos y los últimos pagos cargados.

## Presupuestos

Un límite mensual por categoría (ej. Supermercado $650.000). La barra muestra cuánto se usó:
**En regla**, **Cerca del límite** (desde el 80 %) o **Superado**. Los fija un administrador.

## Informes

- **Resumen**: en qué se gasta en el período que elijas, quién cargó cada pago y en qué días se
  gasta más. Tocá una categoría para ver el detalle (por ejemplo, cuánto cuesta cada auto).
  **Exportar a Excel** descarga los pagos del período.
- **Este mes**: el gasto acumulado día a día contra el mes anterior, y la proyección a fin de mes.
- **Evolución**: el total de cada mes y un gráfico chico por categoría para compararlas.
- **Comparar**: los meses que quieras, lado a lado, con el promedio y la variación.
- **Vencimientos**: qué se pagó a tiempo, qué tarde y qué sigue vencido.

## Mi cuenta

Desde tu nombre (abajo a la izquierda, o el círculo con tus iniciales en el celular): ver tus
datos, **cambiar tu contraseña** y **cerrar sesión**. El botón de la luna cambia entre modo claro
y oscuro.

---

## Para administradores del hogar

**Administración** (solo la ven los administradores):

- **Usuarios**: agregar integrantes (con una contraseña provisoria que deberán cambiar),
  nombrar administradores, desactivar cuentas y asignar una contraseña nueva a quien la olvidó.
- **Categorías**: crear categorías y sus tipos (ej. Servicio → Luz, Gas) o, en Auto, cada auto.
  Tocá un tipo para **renombrarlo**, **desactivarlo** o indicar su **vencimiento**:
  - **Tiene vencimiento**: fecha del primer vencimiento, frecuencia (mensual, bimestral…) e
    importe (fijo, o variable si cambia cada vez). Desde ahí figura en el Calendario.
  - En Auto, cada auto tiene su propio vencimiento (la patente de cada uno vence distinto).
  - Nada se borra para no perder el historial: lo que ya no se usa, se desactiva.
- **Historial**: quién hizo cada cambio importante y cuándo.

## Para quien administra los hogares (superadmin)

El usuario **admin** administra los hogares desde **Hogares**: crea cada hogar con su
administrador, lo renombra, lo desactiva (sus integrantes no pueden entrar hasta reactivarlo) y
gestiona sus usuarios. **No ve los pagos ni los datos de ningún hogar.**

---

## Preguntas frecuentes

**¿Se pierde algo si se corta la luz o se cierra la aplicación?** No: todo se guarda en el momento
en la base de datos. Además, la aplicación hace una **copia de seguridad por día** al iniciarse.

**Cargué un pago dos veces.** Abrilo desde Pagos y usá **Eliminar pago** (si lo cargaste vos, o
pedíselo a un administrador).

**Pagué un vencimiento por error.** Abrí el vencimiento y usá **Anular pago**.

**No veo Administración.** Es solo para administradores del hogar.

**No puedo entrar y la contraseña es correcta.** Puede que tu cuenta o el hogar estén
desactivados, o que se haya bloqueado por varios intentos fallidos: esperá unos minutos o
consultá a un administrador.
