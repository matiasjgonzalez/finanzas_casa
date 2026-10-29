import {
  CalendarDays,
  CircleHelp,
  House,
  KeyRound,
  type LucideIcon,
  PiggyBank,
  ReceiptText,
  Settings,
  Wallet,
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
          Tocá <b>Cargar un pago</b> (en el menú, arriba a la derecha o el botón naranja de abajo en
          el celular). Escribí el <b>importe</b> sin puntos: <code>10000</code> queda{' '}
          <code>10.000,00</code>. Los centavos van con coma.
        </p>
        <p>
          Después tocá la <b>categoría</b> (por ejemplo, Servicio) y, si aparece, el <b>tipo</b> (por
          ejemplo, Luz) o el auto. La fecha ya viene con la de hoy. Si querés, agregá una{' '}
          <b>foto del comprobante</b>. Al final, <b>Guardar pago</b>. Cada uno corrige o borra los pagos
          que cargó; los administradores, todos.
        </p>
      </>
    ),
  },
  {
    id: 'calendario',
    icon: CalendarDays,
    title: 'Pagar una cuenta (Por pagar)',
    body: (
      <>
        <p>
          <b>Por pagar</b> muestra las cuentas pendientes: primero las <b>vencidas</b> (en rojo),
          después las de la semana y más adelante. El número junto a "Por pagar" en el menú dice
          cuántas hay que atender.
        </p>
        <p>
          Tocá <b>Pagar</b> en la cuenta: el importe ya viene completo (si pagaste otro, cambialo) y
          tocá <b>Registrar pago</b>. El pago aparece solo en "Pagos hechos". Si ya lo habías cargado
          antes, usá <b>Vincular ese pago</b> para no anotarlo dos veces.
        </p>
        <p>En "Más opciones" está el <b>Calendario</b>, con todas las cuentas mes por mes.</p>
      </>
    ),
  },
  {
    id: 'inicio',
    icon: House,
    title: 'Inicio',
    body: (
      <p>
        Tres botones grandes para lo de todos los días: <b>Cargar un pago</b>, <b>Por pagar</b> y{' '}
        <b>Cuánto gastamos</b>. Debajo, las cuentas para pagar pronto (cada una con su botón Pagar)
        y los últimos pagos cargados.
      </p>
    ),
  },
  {
    id: 'gastos',
    icon: Wallet,
    title: 'Cuánto gastamos y pagos hechos',
    body: (
      <p>
        <b>Cuánto gastamos</b> muestra el total del mes, si es más o menos que el mes anterior y en
        qué se gastó. Con las flechas se cambia de mes. <b>Pagos hechos</b> es la lista de todo lo
        pagado: arriba se elige el período (este mes, el anterior o todo) y con{' '}
        <b>Buscar y filtrar</b> se busca algo puntual.
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
          <b>Categorías</b> (en el menú principal): crear categorías y sus tipos (o, en Auto, cada auto). Tocá un tipo para
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
