import {
  CalendarDays,
  ChartColumn,
  CircleHelp,
  House,
  KeyRound,
  PiggyBank,
  ReceiptText,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { PageHeader } from '@/components/PageHeader'
import { SectionCard } from '@/components/SectionCard'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useCurrentUser } from '@/features/auth/useAuth'

interface Topic {
  id: string
  icon: LucideIcon
  title: string
  body: ReactNode
  /** Solo para un rol (el resto no lo necesita). */
  only?: 'admin' | 'superadmin'
}

const TOPICS: Topic[] = [
  {
    id: 'pago',
    icon: ReceiptText,
    title: 'Cargar un pago',
    body: (
      <>
        <p>
          Con <b>Nuevo pago</b> (arriba a la derecha, o el botón naranja <b>+</b> en el celular).
          El <b>importe</b> y la <b>categoría</b> son obligatorios. Escribí el importe sin puntos:{' '}
          <code>10000</code> se ve como <code>10.000</code> y al salir queda <code>10.000,00</code>.
          Los centavos van con coma.
        </p>
        <p>
          Según la categoría se elige además el tipo (ej. Visa) y, en Auto, qué auto. Podés adjuntar
          la factura o el comprobante (foto o PDF, hasta 10 MB). Cada uno corrige o borra los pagos
          que cargó; los administradores, todos.
        </p>
      </>
    ),
  },
  {
    id: 'calendario',
    icon: CalendarDays,
    title: 'Vencimientos y calendario',
    body: (
      <>
        <p>
          <b>Vencimientos</b> muestra lo que hay que pagar. Tocá uno para <b>registrar el pago</b>: el
          importe ya viene completo; si pagaste otro, cambialo. El pago aparece solo en Pagos. Si ya
          lo habías cargado, usá <b>Vincular ese pago</b> para no duplicarlo.
        </p>
        <p>
          <b>Pagos realizados</b> muestra lo pagado día por día. La campana de arriba avisa los
          vencimientos vencidos o de los próximos 7 días.
        </p>
      </>
    ),
  },
  {
    id: 'inicio',
    icon: House,
    title: 'Inicio',
    body: (
      <p>
        Un resumen del mes: cuánto se gastó (y contra el mes anterior), la proyección a fin de mes
        con lo que falta vencer, los próximos vencimientos, el gasto por categoría, los presupuestos
        y los últimos pagos.
      </p>
    ),
  },
  {
    id: 'presupuestos',
    icon: PiggyBank,
    title: 'Presupuestos',
    body: (
      <p>
        Un límite mensual por categoría. La barra muestra cuánto se usó: <b>En regla</b>,{' '}
        <b>Cerca del límite</b> (desde el 80 %) o <b>Superado</b>. Rige desde el mes en que se fija
        hasta que se cambia. Los fija un administrador.
      </p>
    ),
  },
  {
    id: 'informes',
    icon: ChartColumn,
    title: 'Informes',
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Resumen</b>: en qué se gasta, quién cargó cada pago y en qué días; exportar a Excel.</li>
        <li><b>Este mes</b>: el gasto acumulado contra el mes anterior y la proyección.</li>
        <li><b>Evolución</b>: el total de cada mes y un gráfico por categoría para compararlas.</li>
        <li><b>Comparar</b>: los meses que quieras, con promedio y variación.</li>
        <li><b>Vencimientos</b>: qué se pagó a tiempo, qué tarde y qué sigue vencido.</li>
      </ul>
    ),
  },
  {
    id: 'cuenta',
    icon: KeyRound,
    title: 'Mi cuenta y contraseña',
    body: (
      <p>
        En <b>Mi cuenta</b> podés cambiar tu contraseña y elegir el tema (claro, oscuro o el del
        sistema). Si te olvidaste la contraseña, pedile a un administrador que te asigne una nueva.
        Después de 5 intentos fallidos el ingreso se bloquea unos minutos.
      </p>
    ),
  },
  {
    id: 'administracion',
    icon: Settings,
    title: 'Administración del hogar',
    only: 'admin',
    body: (
      <>
        <p>
          <b>Usuarios</b>: agregar integrantes (con contraseña provisoria), nombrar administradores,
          desactivar cuentas y asignar contraseñas nuevas.
        </p>
        <p>
          <b>Categorías</b>: crear categorías y sus tipos (o, en Auto, cada auto). Tocá un tipo para
          renombrarlo, desactivarlo o indicar su <b>vencimiento</b> (fecha, frecuencia e importe):
          desde ahí figura en el Calendario. Nada se borra; lo que no se usa, se desactiva.
        </p>
      </>
    ),
  },
  {
    id: 'hogares',
    icon: Settings,
    title: 'Administrar hogares',
    only: 'superadmin',
    body: (
      <p>
        Desde <b>Hogares</b> se crea cada hogar con su administrador, se renombra, se desactiva (sus
        integrantes no pueden entrar hasta reactivarlo) y se gestionan sus usuarios. El superadmin no
        ve los pagos ni los datos de ningún hogar.
      </p>
    ),
  },
]

export function HelpPage() {
  const { user } = useCurrentUser()
  // El superadmin no usa las secciones de un hogar: solo ve lo suyo y su cuenta.
  const topics = TOPICS.filter((t) =>
    user.role === 'superadmin'
      ? t.only === 'superadmin' || t.id === 'cuenta'
      : !t.only || (t.only === 'admin' && user.role === 'admin'),
  )

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <PageHeader title="Ayuda" description="Cómo usar la aplicación, paso a paso." />
      <SectionCard icon={CircleHelp} title="Preguntas frecuentes" flush>
        <Accordion type="single" collapsible className="px-5 sm:px-6">
          {topics.map(({ id, icon: Icon, title, body }) => (
            <AccordionItem key={id} value={id}>
              <AccordionTrigger className="py-4 hover:no-underline">
                <span className="flex items-center gap-3 text-sm font-medium">
                  <Icon className="text-muted-foreground size-4" aria-hidden="true" />
                  {title}
                </span>
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground flex flex-col gap-2 pb-4 pl-7 text-sm leading-relaxed">
                {body}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SectionCard>
    </div>
  )
}
