/** "Mozilla/5.0 (Windows NT 10.0…) … Edg/142.0" → "Edge en Windows". El orden importa: Edge y
 * Opera también dicen "Chrome", y Chrome también dice "Safari". */
export function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Desconocido'
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null
  const system = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(userAgent)
            ? 'Mac'
            : /Linux/.test(userAgent)
              ? 'Linux'
              : null
  if (browser && system) return `${browser} en ${system}`
  return browser ?? system ?? 'Otro programa'
}
