# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una familia argentina que comparte los gastos de la casa. Todos la usan por igual, de distintas
edades (desde adultos jóvenes hasta una persona de 75 años): cargan pagos, miran qué hay que
pagar y consultan cuánto se gastó. Un integrante administra (usuarios, categorías, vencimientos,
presupuestos) y un superadmin administra los hogares sin ver datos financieros.

Se usa desde el celular y desde la computadora por igual: el celular para cargar un pago con la
foto del ticket en el momento, la computadora para revisar con calma.

## Product Purpose

Llevar en orden los pagos de la casa. Sale bien cuando:

- **ninguna cuenta se paga con recargo**: los vencimientos están a la vista antes de vencer;
- **se sabe en qué se va la plata**: cuánto se gasta en cada cosa (servicio, auto, tarjeta…),
  por mes y por año;
- **todo queda guardado**: cada pago con su comprobante, fácil de encontrar después.

## Positioning

Hecha para una sola familia y su manera de organizarse (sus categorías, sus autos, sus
servicios), con palabras de todos los días en lugar de términos contables. Privada: los datos
de un hogar no los ve nadie más, ni el superadmin.

## Operating Context

- Cargar un pago: importe, categoría (y tipo o elemento, ej. Auto → Camioneta → Nafta), fecha y
  foto del comprobante.
- Por pagar: cuentas vencidas, de esta semana y más adelante; se pagan desde ahí.
- Cuánto gastamos: el total y el detalle por categoría, para entender el gasto.
- Pagos hechos: la lista completa con filtros y exportación a Excel.
- Calendario de vencimientos y presupuestos mensuales por categoría.
- Montos en pesos argentinos con formato es-AR (10.000,00); fechas dd/mm/aaaa.

## Capabilities and Constraints

- Categorías con estructura: sin subdivisión, con tipos (Servicio → Luz, Gas) o con elementos y
  tipos (Auto → Camioneta → Nafta, Lavado, Patente).
- Interfaz en español rioplatense (voseo), sin datos de ejemplo ni inventados.
- Publicada en Railway; tema oscuro por defecto y tema claro.

## Brand Commitments

- Nombre: **Casa en Orden**.
- Paleta elegida por el usuario: #213885, #081849, #ECDFD2, #CCCACC, #5F3475, #893172
  (ver `frontend/src/index.css`).
- Voz: simple y cercana, palabras de todos los días ("Por pagar", "Pagos hechos",
  "Cuánto gastamos").

## Evidence on Hand

Los datos son los pagos reales de la familia. No hay testimonios, clientes ni cifras para
mostrar: no inventarlos.

## Product Principles

1. Lo de todos los días primero: cargar un pago, ver qué hay que pagar, ver cuánto se gastó.
2. Pocas cosas por pantalla, con letra grande y palabras claras: tiene que entenderlo cualquier
   integrante de la familia.
3. Los números se entienden de un vistazo: total, comparación y detalle, sin jerga contable.
4. Nada se pierde: cada pago con su comprobante, nada se borra sin querer.

## Accessibility & Inclusion

Usuarios de hasta 75 años: letra base de 18 px, alto contraste (WCAG AA verificado en la
paleta), botones grandes, el color nunca como único indicador.
