export interface NamedRef {
  id: string
  name: string
}

export interface Attachment {
  id: string
  original_filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

export interface Transaction {
  id: string
  /** Importe exacto como texto ("1234.50"). */
  amount: string
  currency: string
  /** Fecha de pago ("AAAA-MM-DD"). */
  occurred_on: string
  category: NamedRef
  category_type: NamedRef | null
  item: NamedRef | null
  description: string | null
  notes: string | null
  created_by: { id: string; full_name: string }
  attachments_count: number
  /** Lo calcula el backend según los permisos de quien consulta. */
  can_edit: boolean
  created_at: string
  updated_at: string
}

export interface TransactionDetail extends Transaction {
  attachments: Attachment[]
}

export interface TransactionInput {
  amount: string
  occurred_on: string
  category_id: string
  category_type_id: string | null
  item_id: string | null
  description: string | null
  notes: string | null
}

export interface TransactionPage {
  items: Transaction[]
  total: number
  page: number
  page_size: number
  /** Suma de todos los pagos filtrados (todas las páginas). */
  total_amount: string
}

export interface TransactionQuery {
  date_from?: string
  date_to?: string
  category_id?: string
  category_type_id?: string
  item_id?: string
  created_by_id?: string
  q?: string
  sort?: 'date' | 'amount' | 'description' | 'created'
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

/** "Auto · Fiat Cronos · Seguro" */
export function categoryPath(t: Pick<Transaction, 'category' | 'item' | 'category_type'>): string {
  return [t.category.name, t.item?.name, t.category_type?.name].filter(Boolean).join(' · ')
}

/** Título para mostrar: la descripción, o la categoría completa si no hay descripción. */
export function paymentTitle(t: Transaction): string {
  return t.description || categoryPath(t)
}

/** Línea secundaria: la categoría completa, solo si el título es la descripción (sin repetir). */
export function paymentSubtitle(t: Transaction): string | null {
  return t.description ? categoryPath(t) : null
}
