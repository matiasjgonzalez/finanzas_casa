import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom (el navegador simulado de las pruebas) no implementa estas APIs del navegador.
// Se definen versiones mínimas: tema claro del sistema y un ResizeObserver que no hace nada.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Con todas las pruebas en paralelo la máquina puede ir lenta: las búsquedas asíncronas
// (findBy…) esperan hasta 3 s en lugar de 1 s antes de fallar.
configure({ asyncUtilTimeout: 3000 })

// Desmonta lo renderizado entre pruebas para que no se mezclen.
afterEach(() => {
  cleanup()
})
