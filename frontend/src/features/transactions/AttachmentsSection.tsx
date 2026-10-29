import { Download, ExternalLink, FileText, LoaderCircle, Trash2, Upload } from 'lucide-react'
import { useRef } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { attachmentUrl } from '@/features/transactions/api'
import { ACCEPTED_FILES, checkFile, MAX_FILE_MB } from '@/features/transactions/schema'
import type { Attachment } from '@/features/transactions/types'
import { useDeleteAttachment, useUploadAttachment } from '@/features/transactions/useTransactions'

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

interface AttachmentsCardProps {
  attachments: Attachment[]
  /** Puede subir y eliminar (los permisos los vuelve a verificar el backend). */
  canEdit: boolean
  onUpload: (file: File) => Promise<unknown>
  uploading: boolean
  onDelete: (attachmentId: string) => Promise<unknown>
  deleting: boolean
  emptyText: string
  title?: string
}

/** Comprobantes de cualquier dueño (un pago o un vencimiento): vista previa, descarga y borrado. */
export function AttachmentsCard({
  attachments,
  canEdit,
  onUpload,
  uploading,
  onDelete,
  deleting,
  emptyText,
  title = 'Comprobantes',
}: AttachmentsCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = async (list: FileList | null) => {
    for (const file of Array.from(list ?? [])) {
      const problem = checkFile(file)
      if (problem) {
        toast.error(problem)
        continue
      }
      try {
        await onUpload(file)
        toast.success(`Se adjuntó «${file.name}».`)
      } catch (error) {
        toast.error(`«${file.name}»: ${(error as Error).message}`)
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>PDF, JPG, PNG o WEBP. Máximo {MAX_FILE_MB} MB cada uno.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {attachments.length === 0 && (
          <p className="text-muted-foreground text-sm">{emptyText}</p>
        )}
        <ul className="grid gap-3 sm:grid-cols-2">
          {attachments.map((a) => {
            const isImage = a.content_type.startsWith('image/')
            return (
              <li key={a.id} className="flex flex-col overflow-hidden rounded-lg border">
                <a
                  href={attachmentUrl(a.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-muted flex h-36 items-center justify-center"
                  aria-label={`Ver ${a.original_filename}`}
                >
                  {isImage ? (
                    <img
                      src={attachmentUrl(a.id)}
                      alt={`Vista previa de ${a.original_filename}`}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <FileText className="text-muted-foreground size-10" aria-hidden="true" />
                  )}
                </a>
                <div className="flex items-center gap-1 p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={a.original_filename}>
                      {a.original_filename}
                    </p>
                    <p className="text-muted-foreground text-xs">{formatSize(a.size_bytes)}</p>
                  </div>
                  <Button asChild variant="ghost" size="icon" className="size-8">
                    <a href={attachmentUrl(a.id)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${a.original_filename}`}>
                      <ExternalLink />
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="icon" className="size-8">
                    <a href={attachmentUrl(a.id, true)} aria-label={`Descargar ${a.original_filename}`}>
                      <Download />
                    </a>
                  </Button>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive size-8"
                      aria-label={`Eliminar ${a.original_filename}`}
                      disabled={deleting}
                      onClick={() =>
                        onDelete(a.id)
                          .then(() => toast.success('Comprobante eliminado.'))
                          .catch((error: Error) => toast.error(error.message))
                      }
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED_FILES}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                void uploadFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <Button
              variant="outline"
              className="self-start"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              Adjuntar comprobante
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** Comprobantes de un pago. */
export function AttachmentsSection({
  transactionId,
  attachments,
  canEdit,
}: {
  transactionId: string
  attachments: Attachment[]
  canEdit: boolean
}) {
  const upload = useUploadAttachment(transactionId)
  const remove = useDeleteAttachment()
  return (
    <AttachmentsCard
      attachments={attachments}
      canEdit={canEdit}
      onUpload={upload.mutateAsync}
      uploading={upload.isPending}
      onDelete={remove.mutateAsync}
      deleting={remove.isPending}
      emptyText="Este pago no tiene comprobantes."
    />
  )
}
