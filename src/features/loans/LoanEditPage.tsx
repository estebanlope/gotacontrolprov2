import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useLoan } from './useLoans'
import PageHeader from '@/components/layout/PageHeader'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { generateSchedule, calcDueDate, calcNextPaymentDate, calcLoanStatus } from '@/lib/loanCalculations'
import { v4 as uuidv4 } from 'uuid'
import type { PaymentType } from '@/types'

const PAYMENT_TYPE_OPTIONS = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
]

export default function LoanEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: loan, isLoading } = useLoan(id!)

  const [form, setForm] = useState<{
    capital: string
    interest_rate: string
    payment_type: PaymentType
    term_weeks: string
    disbursement_date: string
  } | null>(null)

  // Initialize form once loan is loaded
  if (loan && !form) {
    setForm({
      capital: String(loan.capital),
      interest_rate: String(loan.interest_rate),
      payment_type: loan.payment_type,
      term_weeks: String(loan.term_weeks),
      disbursement_date: loan.disbursement_date,
    })
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form) return

      const capital = parseFloat(form.capital)
      const interestRate = parseFloat(form.interest_rate)
      const termWeeks = parseInt(form.term_weeks)
      // Fix: T17:00:00Z = 12:00 noon Colombia time (UTC-5). Z ensures UTC interpretation
      const disbursementDate = new Date(form.disbursement_date + 'T17:00:00Z')
      const paymentType = form.payment_type

      // Recalculate due date
      const dueDate = calcDueDate(disbursementDate, termWeeks)

      // Regenerate schedule
      const newSchedule = generateSchedule(id!, disbursementDate, capital, interestRate, paymentType, termWeeks)

      // Delete old schedule
      await supabase.from('loan_schedule').delete().eq('loan_id', id!)

      // Insert new schedule with IDs
      const scheduleRows = newSchedule.map(s => ({ id: uuidv4(), ...s }))
      await supabase.from('loan_schedule').insert(scheduleRows)

      // Get existing payments to recalculate paid entries
      const { data: existingPayments } = await supabase.from('payments').select('*').eq('loan_id', id!)
      const totalPaid = (existingPayments ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0)

      let accumulated = 0
      const paidIds: string[] = []
      for (const entry of scheduleRows) {
        accumulated += entry.amount
        if (accumulated <= totalPaid) paidIds.push(entry.id)
      }
      if (paidIds.length > 0) {
        await supabase.from('loan_schedule').update({ status: 'paid' }).in('id', paidIds)
      }

      // Recalculate next payment date and status
      const updatedSchedule = scheduleRows.map(s => ({
        ...s,
        status: paidIds.includes(s.id) ? 'paid' as const : 'pending' as const
      }))
      const nextPaymentDate = calcNextPaymentDate(updatedSchedule)
      const newStatus = calcLoanStatus(updatedSchedule, existingPayments ?? [], nextPaymentDate)

      // Update loan metadata
      const { error } = await supabase.from('loans').update({
        interest_rate: interestRate,
        payment_type: paymentType,
        term_weeks: termWeeks,
        disbursement_date: form.disbursement_date,
        due_date: dueDate.toISOString().split('T')[0],
        next_payment_date: nextPaymentDate,
        status: newStatus,
      }).eq('id', id!)
      if (error) throw error

      // Apply balance delta for capital change via RPC
      const { data: balanceResult, error: balanceError } = await supabase.rpc('edit_loan_with_balance_delta', {
        p_loan_id: id,
        p_new_capital: capital
      })
      if (balanceError) throw new Error(balanceError.message)
      if (balanceResult && !balanceResult.success) throw new Error(balanceResult.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan', id] })
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['loan-schedule', id] })
      queryClient.invalidateQueries({ queryKey: ['collection-breakdown'] })
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
      navigate(-1)
    }
  })

  if (isLoading || !form) {
    return <div><PageHeader title="Editar Préstamo" showBack /><div className="p-4 text-center text-gray-400 py-12">Cargando...</div></div>
  }

  const set = (field: string, value: string) => setForm(prev => prev ? { ...prev, [field]: value } : prev)

  return (
    <div>
      <PageHeader title="Editar Préstamo" showBack />
      <form className="p-4 space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
        <Input label="Capital *" type="number" value={form.capital} onChange={e => set('capital', e.target.value)} />
        <Input label="Tasa de interés (%) *" type="number" value={form.interest_rate} onChange={e => set('interest_rate', e.target.value)} />
        <Select label="Tipo de pago *" options={PAYMENT_TYPE_OPTIONS} value={form.payment_type} onChange={e => set('payment_type', e.target.value as PaymentType)} />
        <Input label="Plazo en semanas *" type="number" value={form.term_weeks} onChange={e => set('term_weeks', e.target.value)} />
        <Input label="Fecha de desembolso *" type="date" value={form.disbursement_date} onChange={e => set('disbursement_date', e.target.value)} />

        {mutation.error && (
          <p className="text-red-600 text-sm text-center">Error al guardar. Intenta de nuevo.</p>
        )}
        <Button type="submit" fullWidth isLoading={mutation.isPending}>Guardar Cambios</Button>
      </form>
    </div>
  )
}
