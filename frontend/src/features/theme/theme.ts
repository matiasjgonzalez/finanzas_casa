/**
 * Preferencia de tema (claro / oscuro / según el sistema).
 *
 * Se guarda en localStorage del navegador: es una preferencia visual de cada dispositivo,
 * no un dato del hogar. index.html aplica el tema antes de que cargue React para evitar
 * un destello de pantalla clara al abrir la app en modo oscuro.
 */

export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Navegación privada o almacenamiento bloqueado: se usa el tema por defecto.
  }
  // Por defecto, oscuro (cada persona puede elegir claro o el del sistema).
  return 'dark'
}

export function saveThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Si no se puede guardar, el tema igual se aplica durante la sesión.
  }
}

export function applyTheme(preference: ThemePreference): void {
  const dark = preference === 'dark' || (preference === 'system' && darkQuery().matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Avisa cuando el sistema operativo cambia entre claro y oscuro. Devuelve la función para dejar de escuchar. */
export function onSystemThemeChange(callback: () => void): () => void {
  const query = darkQuery()
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
