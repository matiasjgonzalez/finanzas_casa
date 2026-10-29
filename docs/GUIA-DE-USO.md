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

En la computadora, el menú está a la izquierda; en el celular, en el botón ☰ de arriba a la
derecha. Arriba están las cinco cosas de todos los días y, más abajo, **Más opciones**.

## Inicio

Tres botones grandes:

- **Cargar un pago**: para anotar algo que se pagó.
- **Por pagar**: cuántas cuentas hay que pagar esta semana (y si hay alguna vencida, en rojo).
- **Cuánto gastamos**: lo gastado en el mes.

Debajo, las **cuentas para pagar pronto** (cada una con su botón **Pagar**) y los últimos pagos.

## Cargar un pago

Tocá **Cargar un pago** (en el menú, arriba a la derecha, o el botón naranja de abajo en el
celular):

1. **Importe**: escribilo sin puntos. `10000` se ve como `10.000` y al salir del campo queda
   `10.000,00`. Los centavos van con coma: `1500,50`.
2. **Fecha de pago**: ya viene la de hoy. Cambiala solo si se pagó otro día.
3. **Categoría**: tocá el botón que corresponda (por ejemplo **Servicio**).
4. Si aparece, tocá el **tipo** (por ejemplo **Luz**) o, en Auto, **qué auto**.
5. Si querés, **Agregar foto o archivo** del comprobante.
6. Tocá **Guardar pago**.

Lo que tiene <span style="color:red">*</span> es obligatorio. Las observaciones están en
**Más detalles**.

Todos ven los pagos del hogar. Cada uno puede corregir o borrar **los que cargó**; los
administradores, todos.

## Por pagar

Las cuentas pendientes, de la más urgente a la menos urgente:

- **Vencidas** (en rojo): por ejemplo, *"Venció hace 5 días"*.
- **Vencen esta semana**: por ejemplo, *"Vence mañana"*.
- **Más adelante**: los próximos 30 días.

Tocá **Pagar** en la cuenta: el importe ya viene completo (si pagaste otro, por ejemplo porque vino
con aumento, cambialo) y tocá **Registrar pago**. El pago aparece solo en **Pagos hechos**.
¿Ya lo habías cargado antes? Usá **«¿Ya lo cargaste en Pagos? Vincular ese pago»** para no
anotarlo dos veces. También se puede adjuntar la factura.

El número junto a **Por pagar** en el menú dice cuántas cuentas hay que atender.

## Pagos hechos

La lista de todo lo pagado, con el **total** arriba. Con los botones de arriba se elige **Este
mes**, **Mes anterior** o **Todo**. Para buscar algo puntual (por categoría, por quién lo cargó o
por texto), tocá **Buscar y filtrar**.

## Cuánto gastamos

El **total del mes**, si es más o menos que el mes anterior y **en qué se gastó**. Con las flechas
se cambia de mes.

## Más opciones

- **Calendario**: todas las cuentas mes por mes, los pagos día por día y la lista de lo programado.

### Presupuestos

Un límite mensual por categoría (ej. Supermercado $650.000). La barra muestra cuánto se usó:
**En regla**, **Cerca del límite** (desde el 80 %) o **Superado**. Los fija un administrador.

### Informes

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
