import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { THEME_STORAGE_KEY } from '@/features/theme/theme'
import { ThemeMenu } from '@/features/theme/ThemeMenu'

function mockSystemTheme(dark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: dark && query === '(prefers-color-scheme: dark)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

async function choose(option: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar tema' }))
  await userEvent.click(await screen.findByRole('menuitemradio', { name: option }))
}

describe('ThemeMenu', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    mockSystemTheme(false)
  })

  it('activa el modo oscuro y recuerda la elección', async () => {
    render(<ThemeMenu />)

    await choose('Oscuro')

    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('vuelve al modo claro', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<ThemeMenu />)
    expect(document.documentElement).toHaveClass('dark')

    await choose('Claro')

    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('"Según el sistema" sigue la configuración del sistema operativo', async () => {
    mockSystemTheme(true)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(<ThemeMenu />)

    await choose('Según el sistema')

    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })
})
