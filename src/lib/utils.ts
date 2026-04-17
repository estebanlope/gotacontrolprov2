import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats currency in COP (Colombian Pesos).
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

/**
 * Formats a date string (ISO) to a human-readable format in Spanish.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

/**
 * Formats a datetime string to a human-readable format in Spanish.
 */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Returns today's date as ISO string (YYYY-MM-DD) in Colombian time (UTC-5).
 */
export function todayISO(): string {
  return toColombiaDateISO(new Date())
}

/**
 * Converts a Date to YYYY-MM-DD string in Colombian time (UTC-5).
 */
export function toColombiaDateISO(date: Date): string {
  // Colombia is UTC-5, no daylight saving
  const offset = -5 * 60 // minutes
  const local = new Date(date.getTime() + offset * 60 * 1000)
  return local.toISOString().split('T')[0]
}

/**
 * Returns current datetime as ISO string adjusted to Colombian time offset.
 * Use this for created_at fields so the timestamp reflects Colombia local time.
 */
export function nowColombiaISO(): string {
  return new Date().toISOString()
}

/**
 * Returns the start of the current week (Monday) as ISO string in Colombian time.
 */
export function startOfWeekISO(): string {
  const d = new Date(new Date().getTime() + (-5 * 60 * 60 * 1000))
  const day = d.getUTCDay()
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1)
  d.setUTCDate(diff)
  return d.toISOString().split('T')[0]
}

/**
 * Returns the start of the current month as ISO string in Colombian time.
 */
export function startOfMonthISO(): string {
  const d = new Date(new Date().getTime() + (-5 * 60 * 60 * 1000))
  d.setUTCDate(1)
  return d.toISOString().split('T')[0]
}

/**
 * Converts a Colombia date (YYYY-MM-DD) to the UTC ISO timestamp
 * representing the START of that day in Colombia (UTC-5).
 * Colombia 00:00 UTC-5 = 05:00 UTC same day.
 */
export function colombiaDateToUTCStart(dateISO: string): string {
  return `${dateISO}T05:00:00.000Z`
}

/**
 * Converts a Colombia date (YYYY-MM-DD) to the UTC ISO timestamp
 * representing the END of that day in Colombia (UTC-5).
 * Colombia 23:59:59 UTC-5 = 04:59:59 UTC the NEXT day.
 */
export function colombiaDateToUTCEnd(dateISO: string): string {
  const d = new Date(`${dateISO}T05:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCSeconds(d.getUTCSeconds() - 1)
  return d.toISOString().replace(/\.\d{3}Z$/, '.999Z')
}

