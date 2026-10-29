import { CalendarClock, Check, Pencil, Plus, Power, X } from 'lucide-react'
import { createContext, type FormEvent, type ReactNode, useContext, useState } from 'react'
import { toast } from 'sonner'

import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import {
  type CatalogEntry,
  type Category,
  type CategoryStructure,
  type EntryKind,
  plural,
  STRUCTURE_HINTS,
  STRUCTURE_LABELS,
  usesItems,
  usesTypes,
} from '@/features/catalog/api'
import { DueDateSheet } from '@/features/catalog/DueDateSheet'
import { useCatalogMutations, useCategories } from '@/features/catalog/useCatalog'
import type { Service } from '@/features/services/api'
import { useServices } from '@/features/services/useServices'
import { cn } from '@/lib/utils'

/** Vencimientos programados del hogar y apertura del panel para editar el de un tipo. */
const DueDates = createContext<{
  services: Service[]
  open: (category: Category, type: CatalogEntry) => void
}>({ services: [], open: () => {} })

/** Ejecuta una acción mostrando el resultado en una notificación. Devuelve true si salió bien. */
async function withToast(action: () => Promise<unknown>, success: string): Promise<boolean> {
  try {
    await action()
    toast.success(success)
    return true
  } catch (error) {
    toast.error((error as Error).message)
    return false
  }
}

/** Campo corto para escribir un nombre (agregar o renombrar), con Guardar y Cancelar. */
function InlineNameForm({
  initial = '',
  label,
  onSave,
  onCancel,
  extra,
}: {
  initial?: string
  label: string
  onSave: (name: string) => Promise<boolean>
  onCancel: () => void
  extra?: ReactNode
}) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const name = value.trim()
    if (!name || name === initial) return onCancel()
    setBusy(true)
    const ok = await onSave(name)
    setBusy(false)
    if (ok) onCancel()
  }
  return (
    <form onSubmit={submit} className="inline-flex flex-wrap items-center gap-1">
      <Input
        aria-label={label}
        placeholder={label}
        value={value}
        maxLength={60}
        autoFocus
        className="h-8 w-48"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <Button type="submit" size="icon" variant="ghost" className="size-8" aria-label="Guardar" disabled={busy}>
        <Check />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Cancelar" onClick={onCancel}>
        <X />
      </Button>
      {extra}
    </form>
  )
}

/** Un tipo o elemento como etiqueta. Al tocarla: Renombrar / Vencimiento / Activar o desactivar. */
function EntryChip({ entry, kind, category }: { entry: CatalogEntry; kind: EntryKind; category: Category }) {
  const { updateEntry } = useCatalogMutations()
  const dueDates = useContext(DueDates)
  const hasDueDate =
    kind === 'type' && dueDates.services.some((s) => s.category_type?.id === entry.id && s.is_active)
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <InlineNameForm
        initial={entry.name}
        label={`Nuevo nombre para ${entry.name}`}
        onSave={(name) =>
          withToast(() => updateEntry.mutateAsync({ kind, id: entry.id, name }), 'Nombre actualizado.')
        }
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'hover:bg-accent focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3',
            hasDueDate && 'border-brand/60',
            !entry.is_active && 'text-muted-foreground border-dashed line-through',
          )}
          aria-label={`${entry.name}${hasDueDate ? ' (con vencimiento)' : ''}${entry.is_active ? '' : ' (desactivado)'}: opciones`}
        >
          {hasDueDate && <CalendarClock className="text-brand size-3.5" aria-hidden="true" />}
          {entry.name}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => setEditing(true)}>
          <Pencil aria-hidden="true" /> Renombrar
        </DropdownMenuItem>
        {kind === 'type' && (
          <DropdownMenuItem onSelect={() => dueDates.open(category, entry)}>
            <CalendarClock aria-hidden="true" /> Vencimiento…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() =>
            void withToast(
              () => updateEntry.mutateAsync({ kind, id: entry.id, is_active: !entry.is_active }),
              entry.is_active ? `«${entry.name}» desactivado.` : `«${entry.name}» activado.`,
            )
          }
        >
          <Power aria-hidden="true" /> {entry.is_active ? 'Desactivar' : 'Activar'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AddChip({
  label,
  onAdd,
  askDueDate = false,
}: {
  label: string
  onAdd: (name: string, withDueDate: boolean) => Promise<boolean>
  /** Para los tipos: casilla «Tiene vencimiento» (al crearlo se abre el panel para completarlo). */
  askDueDate?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [withDueDate, setWithDueDate] = useState(false)
  if (adding) {
    return (
      <InlineNameForm
        label={label}
        onSave={(name) => onAdd(name, withDueDate)}
        onCancel={() => {
          setAdding(false)
          setWithDueDate(false)
        }}
        extra={
          askDueDate && (
            <label className="flex items-center gap-2 pl-1 text-sm">
              <Switch checked={withDueDate} onCheckedChange={setWithDueDate} />
              Tiene vencimiento
            </label>
          )
        }
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-full border border-dashed px-3 py-1 text-sm outline-none focus-visible:ring-3"
    >
      <Plus className="size-3.5" aria-hidden="true" /> Agregar
    </button>
  )
}

function EntrySection({
  title,
  kind,
  category,
  entries,
  addLabel,
}: {
  title: string
  kind: EntryKind
  category: Category
  entries: CatalogEntry[]
  addLabel: string
}) {
  const { createEntry } = useCatalogMutations()
  const dueDates = useContext(DueDates)
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      <div className="flex flex-wrap items-center gap-2">
        {entries.map((entry) => (
          <EntryChip key={entry.id} entry={entry} kind={kind} category={category} />
        ))}
        <AddChip
          label={addLabel}
          askDueDate={kind === 'type'}
          onAdd={async (name, withDueDate) => {
            let created: CatalogEntry | undefined
            const ok = await withToast(async () => {
              created = await createEntry.mutateAsync({ kind, categoryId: category.id, name })
            }, `Se agregó «${name}».`)
            if (ok && withDueDate && created) dueDates.open(category, created)
            return ok
          }}
        />
      </div>
    </div>
  )
}

function summary(category: Category): string {
  const parts = [STRUCTURE_LABELS[category.structure]]
  const active = (list: CatalogEntry[]) => list.filter((e) => e.is_active).length
  if (usesItems(category)) {
    const n = active(category.items)
    const label = (category.item_label ?? 'elemento').toLowerCase()
    parts.push(`${n} ${n === 1 ? label : plural(label)}`)
  }
  if (usesTypes(category)) {
    const n = active(category.types)
    parts.push(`${n} ${n === 1 ? 'tipo' : 'tipos'}`)
  }
  return parts.join(' · ')
}

function CategoryItem({ category }: { category: Category }) {
  const { updateCategory } = useCatalogMutations()
  const [renaming, setRenaming] = useState(false)
  const itemLabel = category.item_label ?? 'Elemento'

  return (
    <AccordionItem value={category.id} className="px-4">
      <AccordionTrigger className="items-center py-3 hover:no-underline">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2 font-medium">
            <span className={cn(!category.is_active && 'text-muted-foreground line-through')}>
              {category.name}
            </span>
            {!category.is_active && <Badge variant="outline">Desactivada</Badge>}
          </span>
          <span className="text-muted-foreground text-xs font-normal">{summary(category)}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-4 pb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {renaming ? (
            <InlineNameForm
              initial={category.name}
              label={`Nuevo nombre para ${category.name}`}
              onSave={(name) =>
                withToast(() => updateCategory.mutateAsync({ id: category.id, name }), 'Nombre actualizado.')
              }
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>
              <Pencil aria-hidden="true" /> Renombrar
            </Button>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={category.is_active}
              onCheckedChange={(active) =>
                void withToast(
                  () => updateCategory.mutateAsync({ id: category.id, is_active: active }),
                  active ? `«${category.name}» activada.` : `«${category.name}» desactivada.`,
                )
              }
            />
            Categoría activa
          </label>
        </div>

        {category.structure === 'simple' && (
          <p className="text-muted-foreground text-sm">
            Esta categoría no tiene tipos: al cargar un pago solo se elige la categoría.
          </p>
        )}
        {usesItems(category) && (
          <EntrySection
            title={plural(itemLabel)}
            kind="item"
            category={category}
            entries={category.items}
            addLabel={`Nuevo ${itemLabel.toLowerCase()}`}
          />
        )}
        {usesTypes(category) && (
          <EntrySection
            title={usesItems(category) ? `Tipos (para todos los ${plural(itemLabel).toLowerCase()})` : 'Tipos'}
            kind="type"
            category={category}
            entries={category.types}
            addLabel="Nuevo tipo"
          />
        )}
        <p className="text-muted-foreground text-xs">
          Tocá una etiqueta para renombrarla o desactivarla. En los tipos, «Vencimiento…» indica si
          vencen y cuándo: esos figuran en el calendario de vencimientos.
        </p>
      </AccordionContent>
    </AccordionItem>
  )
}

function NewCategoryForm() {
  const { createCategory } = useCatalogMutations()
  const [name, setName] = useState('')
  const [structure, setStructure] = useState<CategoryStructure>('types')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    createCategory.mutate(
      { name: name.trim(), structure },
      {
        onSuccess: (c) => {
          toast.success(`Se creó la categoría «${c.name}».`)
          setName('')
        },
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nueva-categoria">Nueva categoría</Label>
              <Input
                id="nueva-categoria"
                placeholder="Ej.: Supermercado, Moto, Salud"
                maxLength={60}
                className="h-9"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="estructura">Estructura</Label>
              <NativeSelect
                id="estructura"
                className="w-full [&_select]:h-9"
                value={structure}
                onChange={(e) => setStructure(e.target.value as CategoryStructure)}
              >
                {(Object.keys(STRUCTURE_LABELS) as CategoryStructure[]).map((s) => (
                  <NativeSelectOption key={s} value={s}>
                    {STRUCTURE_LABELS[s]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" disabled={createCategory.isPending || !name.trim()}>
              <Plus aria-hidden="true" /> Crear
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">{STRUCTURE_HINTS[structure]}</p>
        </form>
      </CardContent>
    </Card>
  )
}

export function CategoriesAdminPage() {
  const { data, error, isPending, refetch } = useCategories(true)
  const services = useServices(true)
  const [editing, setEditing] = useState<{ categoryId: string; type: CatalogEntry } | null>(null)
  // Se toma la categoría actualizada (ej. si se agregó un auto con el panel abierto).
  const editingCategory = data?.find((c) => c.id === editing?.categoryId)

  return (
    <section aria-labelledby="categorias-titulo" className="flex flex-col gap-4">
      <div>
        <h2 id="categorias-titulo" className="text-lg font-semibold">
          Categorías
        </h2>
        <p className="text-muted-foreground text-sm">
          Tocá una categoría para ver y editar sus tipos. Nada se borra para no perder el
          historial: lo que ya no uses, desactivalo.
        </p>
      </div>
      <NewCategoryForm />
      {isPending ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <DueDates
          value={{
            services: services.data ?? [],
            open: (category, type) => setEditing({ categoryId: category.id, type }),
          }}
        >
          <Card className="py-0">
            <Accordion type="multiple">
              {data.map((category) => (
                <CategoryItem key={category.id} category={category} />
              ))}
            </Accordion>
          </Card>
          {editingCategory && editing && (
            <DueDateSheet
              key={editing.type.id}
              category={editingCategory}
              type={editing.type}
              services={services.data ?? []}
              onClose={() => setEditing(null)}
            />
          )}
        </DueDates>
      )}
    </section>
  )
}
