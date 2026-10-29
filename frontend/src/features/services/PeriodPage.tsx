import { ArrowLeft, History, Link2, LoaderCircle, ReceiptText } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AmountInput } from '@/components/form/AmountInput'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useCurrentUser } from '@/features/auth/useAuth'
import { FREQUENCY_LABELS, type PeriodDetail, periodPath } from '@/features/services/api'
import { PeriodStatusBadge } from '@/features/services/PeriodStatusBadge'
import { useLinkCandidates, usePeriod, usePeriodMutations } from '@/features/services/useServices'
import { AttachmentsCard } from '@/features/transactions/AttachmentsSection'
import { paymentTitle } from '@/features/transactions/types'
import { useDeleteAttachment } from '@/features/transactions/useTransactions'
import { amountToInput, parseAmountInput } from '@/lib/amount'
import { todayISO } from '@/lib/dates'
import { formatDate, formatMoney } from '@/lib/format'

type Mutations = ReturnType<typeof usePeriodMutations>

/** Notas del vencimiento (ej. número de cliente, aviso de corte). */
function NotesCard({ period, mutations }: { period: PeriodDetail; mutations: Mutations }) {
  const [notes, setNotes] = useState(period.notes ?? '')
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Label htmlFor="notas-vencimiento">Notas</Label>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Textarea
          id="notas-vencimiento"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ej.: número de cliente, aviso de corte…"
        />
        {notes !== (period.notes ?? '') && (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            disabled={mutations.update.isPending}
            onClick={() =>
              mutations.update.mutate(
                { notes: notes.trim() || null },
                { onSuccess: () => toast.success('Notas guardadas.'), onError: (e) => toast.error(e.message) },
              )
            }
          >
            Guardar notas
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function LinkExisting({ period, mutations }: { period: PeriodDetail; mutations: Mutations }) {
  const [open, setOpen] = useState(false)
  const candidates = useLinkCandidates(period.id, open)
  if (!open) {
    return (
      <Button variant="link" className="h-auto self-start p-0" onClick={() => setOpen(true)}>
        <Link2 aria-hidden="true" /> ¿Ya lo cargaste en Pagos? Vincular ese pago
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Pagos de la misma categoría, cerca de esta fecha</p>
      {candidates.isPending ? (
        <LoadingRows rows={2} />
      ) : candidates.data?.length ? (
        <ul className="divide-y">
          {candidates.data.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate">{paymentTitle(t)}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(t.occurred_on)} · {t.created_by.full_name}
                </p>
              </div>
              <span className="tabular-nums">{formatMoney(t.amount, t.currency)}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={mutations.pay.isPending}
                onClick={() =>
                  mutations.pay.mutate(
                    { mode: 'link', transaction_id: t.id },
                    {
                      onSuccess: () => toast.success('Pago vinculado: el vencimiento quedó pagado.'),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                Vincular
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No hay pagos sin vincular de esa categoría entre 45 días antes y después del vencimiento.
        </p>
      )}
    </div>
  )
}

function PayCard({ period, mutations }: { period: PeriodDetail; mutations: Mutations }) {
  const [paidOn, setPaidOn] = useState(todayISO())
  const [amount, setAmount] = useState(period.amount_due ? amountToInput(period.amount_due) : '')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const parsed = parseAmountInput(amount)
    if (!parsed || Number(parsed) <= 0) {
      toast.error('Ingresá el importe pagado (ej.: 1.234,56).')
      return
    }
    mutations.pay.mutate(
      { mode: 'create', paid_on: paidOn, amount: parsed },
      {
        onSuccess: () => toast.success('Pago registrado. También aparece en Pagos.'),
        onError: (error) => toast.error(error.message),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar el pago</CardTitle>
        <CardDescription>
          Se carga en Pagos, en {periodPath(period)}, vinculado a este vencimiento. El importe es
          el del vencimiento; si pagaste otro, cambialo y el vencimiento queda con ese importe.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fecha-pago">Fecha de pago</Label>
            <Input id="fecha-pago" type="date" className="h-10" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="importe-pagado">Importe</Label>
            <AmountInput
              id="importe-pagado"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button type="submit" className="h-10" disabled={mutations.pay.isPending}>
            {mutations.pay.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Registrar pago
          </Button>
        </form>
        <LinkExisting period={period} mutations={mutations} />
      </CardContent>
    </Card>
  )
}

function PaidCard({ period, mutations }: { period: PeriodDetail; mutations: Mutations }) {
  const { user, isAdmin } = useCurrentUser()
  const [deletePayment, setDeletePayment] = useState(true)
  const canUnpay = isAdmin || period.paid_by?.id === user.id

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagado</CardTitle>
        <CardDescription>
          El {formatDate(period.paid_on!)} por {period.paid_by?.full_name ?? '—'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-semibold tabular-nums">
          {formatMoney(period.amount_paid!, period.currency)}
        </span>
        {period.transaction_id && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/pagos/${period.transaction_id}`}>
              <ReceiptText aria-hidden="true" /> Ver en Pagos
            </Link>
          </Button>
        )}
        {canUnpay && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                Anular pago
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Anular el pago de este vencimiento?</AlertDialogTitle>
                <AlertDialogDescription>
                  El vencimiento vuelve a quedar pendiente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-brand size-4"
                  checked={deletePayment}
                  onChange={(e) => setDeletePayment(e.target.checked)}
                />
                Eliminar también el pago registrado en Pagos
              </label>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    mutations.unpay.mutate(deletePayment, {
                      onSuccess: () => toast.success('Pago anulado.'),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  Anular
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  )
}

export function PeriodPage() {
  const { periodId = '' } = useParams()
  const { data: period, error, isPending, refetch } = usePeriod(periodId)
  const mutations = usePeriodMutations(periodId)
  const removeAttachment = useDeleteAttachment()

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to={period ? `/calendario?mes=${period.due_date.slice(0, 7)}` : '/calendario'}>
          <ArrowLeft aria-hidden="true" /> Calendario
        </Link>
      </Button>
      {isPending ? (
        <LoadingRows rows={5} />
      ) : error ? (
        <ErrorMessage error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{period.service.name}</h2>
              <PeriodStatusBadge status={period.status} />
            </div>
            <p className="text-muted-foreground text-sm">
              Vence el {formatDate(period.due_date)} · {periodPath(period)} ·{' '}
              {FREQUENCY_LABELS[period.service.frequency]}
              {period.service.provider && ` · ${period.service.provider}`}
            </p>
            <Link
              to={`/calendario/servicios/${period.service.id}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start text-sm underline underline-offset-2"
            >
              <History className="size-3.5" aria-hidden="true" /> Historial del servicio
            </Link>
          </div>
          {period.status === 'paid' ? (
            <PaidCard period={period} mutations={mutations} />
          ) : (
            <PayCard key={period.updated_at} period={period} mutations={mutations} />
          )}
          <NotesCard key={`${period.updated_at}-notes`} period={period} mutations={mutations} />
          <AttachmentsCard
            title="Factura y comprobantes"
            attachments={period.attachments}
            canEdit
            onUpload={mutations.upload.mutateAsync}
            uploading={mutations.upload.isPending}
            onDelete={(id) => removeAttachment.mutateAsync(id).then(() => refetch())}
            deleting={removeAttachment.isPending}
            emptyText="Todavía no adjuntaste la factura ni el comprobante de este vencimiento."
          />
        </>
      )}
    </div>
  )
}
