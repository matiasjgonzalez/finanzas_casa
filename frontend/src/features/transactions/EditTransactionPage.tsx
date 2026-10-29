import { ArrowLeft, Trash2 } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/useAuth'
import type { Category } from '@/features/catalog/api'
import { useCategories } from '@/features/catalog/useCatalog'
import { AttachmentsSection } from '@/features/transactions/AttachmentsSection'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import { categoryPath, paymentTitle, type TransactionDetail } from '@/features/transactions/types'
import {
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/features/transactions/useTransactions'
import { amountToInput } from '@/lib/amount'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'

function ReadOnlyDetails({ payment }: { payment: TransactionDetail }) {
  const rows: [string, string][] = [
    ['Importe', formatMoney(payment.amount, payment.currency)],
    ['Fecha de pago', formatDate(payment.occurred_on)],
    ['Categoría', categoryPath(payment)],
    ['Registrado por', payment.created_by.full_name],
    ['Observaciones', payment.notes ?? '—'],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{paymentTitle(payment)}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground mt-4 text-xs">
          Solo quien lo registró o un administrador pueden modificarlo.
        </p>
      </CardContent>
    </Card>
  )
}

function DeleteButton({ id, title }: { id: string; title: string }) {
  const remove = useDeleteTransaction()
  const navigate = useNavigate()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive self-start">
          <Trash2 aria-hidden="true" /> Eliminar pago
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar «{title}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminarán también sus comprobantes. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              remove.mutate(id, {
                onSuccess: () => {
                  toast.success('Pago eliminado.')
                  navigate('/pagos')
                },
                onError: (error) => toast.error(error.message),
              })
            }
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Si el pago usa una categoría, tipo o elemento desactivado (que un integrante no recibe),
 * se agrega a la lista para no perder el dato al editar.
 */
function withCurrent(list: Category[], payment: TransactionDetail): Category[] {
  const ensure = (entries: Category['types'], ref: { id: string; name: string } | null) =>
    ref && !entries.some((e) => e.id === ref.id) ? [...entries, { ...ref, is_active: false }] : entries

  if (list.some((c) => c.id === payment.category.id)) {
    return list.map((c) =>
      c.id === payment.category.id
        ? { ...c, types: ensure(c.types, payment.category_type), items: ensure(c.items, payment.item) }
        : c,
    )
  }
  return [
    ...list,
    {
      ...payment.category,
      structure: payment.item ? 'items_and_types' : payment.category_type ? 'types' : 'simple',
      item_label: null,
      is_active: false,
      types: ensure([], payment.category_type),
      items: ensure([], payment.item),
    },
  ]
}

export function EditTransactionPage() {
  const { transactionId = '' } = useParams()
  const navigate = useNavigate()
  const { data: payment, error, isPending, refetch } = useTransaction(transactionId)
  const { isAdmin } = useCurrentUser()
  // El administrador recibe también lo desactivado (por si el pago lo usa).
  const categories = useCategories(isAdmin)
  const update = useUpdateTransaction(transactionId)

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/pagos">
          <ArrowLeft aria-hidden="true" /> Pagos
        </Link>
      </Button>
      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <PageHeader
            title={payment.can_edit ? 'Editar pago' : 'Detalle del pago'}
            description={`Registrado por ${payment.created_by.full_name} el ${formatDateTime(payment.created_at)}`}
          />
          {payment.can_edit ? (
            <Card>
              <CardContent>
                {categories.data ? (
                  <TransactionForm
                    defaultValues={{
                      amount: amountToInput(payment.amount),
                      occurred_on: payment.occurred_on,
                      category_id: payment.category.id,
                      item_id: payment.item?.id ?? '',
                      category_type_id: payment.category_type?.id ?? '',
                      description: payment.description ?? '',
                      notes: payment.notes ?? '',
                    }}
                    categories={withCurrent(categories.data, payment)}
                    onSubmit={(input) =>
                      update.mutate(input, {
                        onSuccess: () => {
                          toast.success('Cambios guardados.')
                          navigate('/pagos')
                        },
                      })
                    }
                    submitting={update.isPending}
                    error={update.error}
                    submitLabel="Guardar cambios"
                    onCancel={() => navigate('/pagos')}
                  />
                ) : (
                  <LoadingRows rows={5} />
                )}
              </CardContent>
            </Card>
          ) : (
            <ReadOnlyDetails payment={payment} />
          )}
          <AttachmentsSection
            transactionId={payment.id}
            attachments={payment.attachments}
            canEdit={payment.can_edit}
          />
          {payment.can_edit && <DeleteButton id={payment.id} title={paymentTitle(payment)} />}
        </>
      )}
    </div>
  )
}
