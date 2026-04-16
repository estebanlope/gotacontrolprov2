import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { enqueueSync } from '@/lib/syncQueue'
import { useAuth } from '@/context/AuthContext'
import { calcNextPaymentDate, calcLoanStatus } from '@/lib/loanCalculations'
import PageHeader from '@/components/layout/PageHeader'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { Loan, Payment, PaymentMethod, LoanScheduleEntry } from '@/types'

const METHOD_OPTIONS = [
  { value: 'transfer', label: '🔄 Transferencia' },
  { value: 'cash', label: '💵 Efectivo' },
]

export default function PaymentForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const preselectedLoanId = searchParams.get('loan_id') ?? ''

  const [form, setForm] = useState({
    loan_id: preselectedLoanId,
    amount: '',
    method: 'transfer' as PaymentMethod,
    payment_date: new Date().toISOString().split('T')[0],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load loans for selector (non-paid)
  const { data: loans = [] } = useQuery<Loan[]>({
    queryKey: ['loans-active', user?.team_id],
    queryFn: async () => {
      let q = supabase
        .from('loans')
        .select('*, clients(full_name, cedula)')
        .eq('team_id', user!.team_id!)
        .in('status', ['active', 'overdue', 'pending'])
      if (user?.role === 'cobrador') q = q.eq('created_by', user.id)
      const { data } = await q
      return (data ?? []) as unknown as Loan[]
    },
    enabled: !!user?.team_id,
  })

  const selectedLoan = loans.find(l => l.id === form.loan_id) as (Loan & { clients?: { full_name: string; cedula: string } }) | undefined

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.loan_id) errs.loan_id = 'Selecciona un préstamo'
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Monto debe ser mayor a 0'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed')

      const id = uuidv4()
      const amount = parseFloat(form.amount)

      const newPayment: Payment = {
        id,
        loan_id: form.loan_id,
        team_id: user!.team_id!,
        created_by: user!.id,
        amount,
        method: form.method,
        payment_date: form.payment_date,
        created_at: new Date().toISOString(),
      }

      // Save locally
      await db.payments.put({ ...newPayment, synced: false })

      if (navigator.onLine) {
        const { error } = await supabase.from('payments').upsert(newPayment)
        if (error) throw error

        // Fetch all payments to determine which schedule entries to mark paid
        const { data: allPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('loan_id', form.loan_id)

        const { data: scheduleEntries } = await supabase
          .from('loan_schedule')
          .select('*')
          .eq('loan_id', form.loan_id)
          .order('due_date', { ascending: true })

        if (scheduleEntries && allPayments) {
          const totalPaid = allPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0)
          let accumulated = 0
          const updates: string[] = []

          for (const entry of scheduleEntries) {
            accumulated += entry.amount
            if (accumulated <= totalPaid && entry.status !== 'paid') {
              updates.push(entry.id)
            }
          }

          if (updates.length > 0) {
            await supabase.from('loan_schedule').update({ status: 'paid' }).in('id', updates)
          }

          // Recalculate next payment date and loan status
          const updatedSchedule: LoanScheduleEntry[] = scheduleEntries.map(s => ({
            ...s,
            status: updates.includes(s.id) ? 'paid' : s.status
          }))

          const { data: existingPayments } = await supabase
            .from('payments')
            .select('*')
            .eq('loan_id', form.loan_id)

          const nextDate = calcNextPaymentDate(updatedSchedule)
          const newStatus = calcLoanStatus(updatedSchedule, existingPayments ?? [], nextDate)

          await supabase
            .from('loans')
            .update({ next_payment_date: nextDate, status: newStatus })
            .eq('id', form.loan_id)
        }

        await db.payments.update(id, { synced: true })

        // Notify Telegram
        const workerUrl = import.meta.env.VITE_CF_WORKER_URL
        if (workerUrl && selectedLoan) {
          fetch(`${workerUrl}/notify/payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payment: newPayment,
              loan: selectedLoan,
              client: (selectedLoan as unknown as { clients: unknown }).clients,
              team_id: user!.team_id!
            }),
          }).catch(() => {})
        }
      } else {
        await enqueueSync('payments', id, 'insert', newPayment as unknown as Record<string, unknown>)
      }

      return newPayment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['loan-payments'] })
      queryClient.invalidateQueries({ queryKey: ['loan-schedule'] })
      navigate(-1)
    }
  })

  const loanOptions = loans.map(l => {
    const c = (l as unknown as { clients?: { full_name: string } }).clients
    return { value: l.id, label: `${c?.full_name ?? 'Cliente'} — ${formatCurrency(l.capital)}` }
  })

  return (
    <div>
      <PageHeader title="Registrar Pago" showBack />
      <form className="p-4 space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
        <Select
          label="Préstamo *"
          options={loanOptions}
          placeholder="Selecciona un préstamo"
          value={form.loan_id}
          onChange={e => set('loan_id', e.target.value)}
          error={errors.loan_id}
        />

        {selectedLoan && (
          <Card className="bg-gray-50">
            <p className="text-xs text-gray-500 font-medium">Capital: {formatCurrency(selectedLoan.capital)}</p>
            {selectedLoan.next_payment_date && (
              <p className="text-xs text-gray-500">Próximo pago: {formatDate(selectedLoan.next_payment_date)}</p>
            )}
          </Card>
        )}

        <Input
          label="Monto del pago *"
          type="number"
          inputMode="decimal"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
          error={errors.amount}
          placeholder="50000"
          min="1"
        />

        <Select
          label="Método de pago"
          options={METHOD_OPTIONS}
          value={form.method}
          onChange={e => set('method', e.target.value as PaymentMethod)}
        />

        <Input
          label="Fecha del pago"
          type="date"
          value={form.payment_date}
          onChange={e => set('payment_date', e.target.value)}
        />

        {mutation.error && (
          <p className="text-red-600 text-sm text-center">
            {(mutation.error as Error).message !== 'Validation failed'
              ? 'Error al guardar. Intenta de nuevo.'
              : ''}
          </p>
        )}

        <Button type="submit" fullWidth size="lg" isLoading={mutation.isPending}>
          Registrar Pago
        </Button>
      </form>
    </div>
  )
}

