import { addDays, addMonths } from 'date-fns'
import type { PaymentType, LoanStatus, LoanScheduleEntry, Payment } from '@/types'

/**
 * Rounds a number UP to the next multiple of 5.
 * If already a multiple of 5, returns the same value.
 */
export function roundUpToMultipleOf5(n: number): number {
  if (n % 5 === 0) return n
  return Math.ceil(n / 5) * 5
}

/**
 * Calculates the total number of days for the loan.
 * term_weeks * 7, rounded up to next multiple of 5.
 */
export function calcLoanDays(termWeeks: number): number {
  return roundUpToMultipleOf5(termWeeks * 7)
}

/**
 * Calculates the due date of a loan.
 * disbursementDate + (termWeeks * 7 days rounded up to next multiple of 5)
 */
export function calcDueDate(disbursementDate: Date, termWeeks: number): Date {
  const days = calcLoanDays(termWeeks)
  return addDays(disbursementDate, days)
}

/**
 * Calculates the number of installments based on payment type and term.
 */
export function calcNumInstallments(paymentType: PaymentType, termWeeks: number): number {
  switch (paymentType) {
    case 'daily':
      return calcLoanDays(termWeeks)
    case 'weekly':
      return termWeeks
    case 'biweekly':
      return Math.floor(termWeeks / 2)
    case 'monthly':
      // approximate: term_weeks / 4 rounded up
      return Math.ceil(termWeeks / 4)
  }
}

/**
 * Calculates the amount per installment (total = capital + interest).
 */
export function calcInstallmentAmount(
  capital: number,
  interestRate: number,
  numInstallments: number
): number {
  const total = capital + capital * (interestRate / 100)
  return Math.round((total / numInstallments) * 100) / 100
}

/**
 * Generates the full payment schedule for a loan.
 * Returns array of { due_date (ISO string), amount }
 */
export function generateSchedule(
  loanId: string,
  disbursementDate: Date,
  capital: number,
  interestRate: number,
  paymentType: PaymentType,
  termWeeks: number
): Omit<LoanScheduleEntry, 'id'>[] {
  const numInstallments = calcNumInstallments(paymentType, termWeeks)
  const installmentAmount = calcInstallmentAmount(capital, interestRate, numInstallments)

  const schedule: Omit<LoanScheduleEntry, 'id'>[] = []

  for (let i = 0; i < numInstallments; i++) {
    let dueDate: Date

    switch (paymentType) {
      case 'daily':
        dueDate = addDays(disbursementDate, i + 1)
        break
      case 'weekly':
        dueDate = addDays(disbursementDate, (i + 1) * 7)
        break
      case 'biweekly':
        dueDate = addDays(disbursementDate, (i + 1) * 14)
        break
      case 'monthly':
        dueDate = addMonths(disbursementDate, i + 1)
        break
    }

    // Last installment adjusts for rounding differences
    let amount = installmentAmount
    if (i === numInstallments - 1) {
      const paidSoFar = installmentAmount * (numInstallments - 1)
      const total = capital + capital * (interestRate / 100)
      amount = Math.round((total - paidSoFar) * 100) / 100
    }

    schedule.push({
      loan_id: loanId,
      due_date: dueDate.toISOString().split('T')[0],
      amount,
      status: 'pending'
    })
  }

  return schedule
}

/**
 * Finds the next unpaid schedule entry due date.
 */
export function calcNextPaymentDate(
  schedule: LoanScheduleEntry[]
): string | null {
  const pending = schedule
    .filter(s => s.status === 'pending')
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
  return pending.length > 0 ? pending[0].due_date : null
}

/**
 * Determines loan status based on schedule and payments.
 * - paid: all schedule entries are paid
 * - overdue: current date > next_payment_date
 * - pending: no payments yet AND next due date not reached
 * - active: has at least one payment OR next due date has been reached
 */
export function calcLoanStatus(
  schedule: LoanScheduleEntry[],
  payments: Payment[],
  nextPaymentDate: string | null
): LoanStatus {
  if (schedule.length > 0 && schedule.every(s => s.status === 'paid')) {
    return 'paid'
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (nextPaymentDate) {
    const nextDate = new Date(nextPaymentDate)
    nextDate.setHours(0, 0, 0, 0)

    if (today > nextDate) return 'overdue'
  }

  if (payments.length === 0 && nextPaymentDate) {
    const nextDate = new Date(nextPaymentDate)
    nextDate.setHours(0, 0, 0, 0)
    if (today < nextDate) return 'pending'
  }

  return 'active'
}

/**
 * Imputes a payment amount: first to capital, then to interest.
 * Returns updated remainingCapital and remainingInterest.
 */
export function imputePayment(
  remainingCapital: number,
  remainingInterest: number,
  paymentAmount: number
): { newCapital: number; newInterest: number; capitalPaid: number; interestPaid: number } {
  let capitalPaid = 0
  let interestPaid = 0
  let remaining = paymentAmount

  // First apply to capital
  if (remaining > 0 && remainingCapital > 0) {
    capitalPaid = Math.min(remaining, remainingCapital)
    remaining -= capitalPaid
  }

  // Then apply to interest
  if (remaining > 0 && remainingInterest > 0) {
    interestPaid = Math.min(remaining, remainingInterest)
  }

  return {
    newCapital: Math.round((remainingCapital - capitalPaid) * 100) / 100,
    newInterest: Math.round((remainingInterest - interestPaid) * 100) / 100,
    capitalPaid: Math.round(capitalPaid * 100) / 100,
    interestPaid: Math.round(interestPaid * 100) / 100
  }
}


/**
 * Returns a human-readable label for payment type.
 */
export function paymentTypeLabel(type: PaymentType): string {
  const labels: Record<PaymentType, string> = {
    daily: 'Diario',
    weekly: 'Semanal',
    biweekly: 'Quincenal',
    monthly: 'Mensual'
  }
  return labels[type]
}

/**
 * Returns a human-readable label for loan status.
 */
export function loanStatusLabel(status: LoanStatus): string {
  const labels: Record<LoanStatus, string> = {
    pending: 'Sin iniciar',
    active: 'Activo',
    overdue: 'En mora',
    paid: 'Pagado'
  }
  return labels[status]
}

/**
 * Returns Tailwind color classes for loan status badges.
 */
export function loanStatusColors(status: LoanStatus): string {
  const colors: Record<LoanStatus, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    active: 'bg-blue-100 text-blue-800',
    overdue: 'bg-red-100 text-red-800',
    paid: 'bg-green-100 text-green-800'
  }
  return colors[status]
}

