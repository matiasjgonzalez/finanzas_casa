const dayMonth = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })

/** Fecha en bloque para listas: "29 oct" arriba y el año abajo. */
export function DateBlock({ iso }: { iso: string }) {
  const date = new Date(`${iso.slice(0, 10)}T12:00`)
  return (
    <span className="flex w-14 shrink-0 flex-col leading-tight tabular-nums">
      <span className="text-sm whitespace-nowrap">{dayMonth.format(date).replace('.', '')}</span>
      <span className="text-muted-foreground text-xs">{date.getFullYear()}</span>
    </span>
  )
}
