import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/PageHeader'
import { ErrorMessage, LoadingRows } from '@/components/QueryState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useCategories } from '@/features/catalog/useCatalog'
import { uploadAttachment } from '@/features/transactions/api'
import { TransactionForm } from '@/features/transactions/TransactionForm'
import type { TransactionInput } from '@/features/transactions/types'
import { useCreateTransaction } from '@/features/transactions/useTransactions'
import { todayISO } from '@/lib/dates'

export function NewTransactionPage() {
  const navigate = useNavigate()
  const categories = useCategories()
  const create = useCreateTransaction()
  const [uploading, setUploading] = useState(false)

  const save = (input: TransactionInput, files: File[]) =>
    create.mutate(input, {
      onSuccess: async (payment) => {
        // Los comprobantes se suben después de guardar el pago (necesitan su id).
        const failed: string[] = []
        setUploading(true)
        for (const file of files) {
          try {
            await uploadAttachment(payment.id, file)
          } catch (error) {
            failed.push(`«${file.name}»: ${(error as Error).message}`)
          }
        }
        setUploading(false)
        if (failed.length) {
          // El pago SÍ se guardó: se abre para reintentar los comprobantes que fallaron.
          toast.error(`El pago se guardó, pero no se pudo adjuntar: ${failed.join(' ')}`)
          navigate(`/pagos/${payment.id}`)
        } else {
          toast.success('Pago registrado.')
          navigate('/pagos')
        }
      },
    })

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/pagos">
          <ArrowLeft aria-hidden="true" /> Pagos
        </Link>
      </Button>
      <PageHeader title="Cargar un pago" description="Anotá algo que se pagó. Lo que tiene * es obligatorio." />
      <Card>
        <CardContent>
          {categories.error ? (
            <ErrorMessage error={categories.error} onRetry={() => categories.refetch()} />
          ) : !categories.data ? (
            <LoadingRows rows={5} />
          ) : (
            <TransactionForm
              defaultValues={{
                amount: '',
                occurred_on: todayISO(),
                category_id: '',
                item_id: '',
                category_type_id: '',
                description: '',
                notes: '',
              }}
              categories={categories.data}
              onSubmit={save}
              submitting={create.isPending || uploading}
              error={create.error}
              submitLabel="Guardar pago"
              allowFiles
              onCancel={() => navigate('/pagos')}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
