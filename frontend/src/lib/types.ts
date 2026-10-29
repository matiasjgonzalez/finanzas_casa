/** Respuesta paginada de la API. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}
