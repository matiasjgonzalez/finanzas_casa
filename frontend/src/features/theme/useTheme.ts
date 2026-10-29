import { useEffect, useState } from 'react'

import {
  applyTheme,
  getThemePreference,
  onSystemThemeChange,
  saveThemePreference,
  type ThemePreference,
} from '@/features/theme/theme'

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference)

  useEffect(() => {
    applyTheme(preference)
    if (preference !== 'system') return
    // En modo "sistema", seguir los cambios del sistema operativo mientras la app está abierta.
    return onSystemThemeChange(() => applyTheme('system'))
  }, [preference])

  function changePreference(next: ThemePreference) {
    saveThemePreference(next)
    setPreference(next)
  }

  return { preference, setPreference: changePreference }
}
