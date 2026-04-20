import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { calcNextPaymentDate, calcLoanStatus } from '@/lib/loanCalculations'
import PageHeader from '@/components/layout/PageHeader'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import type { Payment, PaymentMethod, LoanScheduleEntry } from '@/types'

const METHOD_OPTIONS = [
  { value: 'transfer', label: '🔄 Transferencia' },
  { value: 'cash', label: '💵 Efectivo' },
]

export default function PaymentEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: payment, isLoading } = useQuery<Payment | null>({
    queryKey: ['payment', id],
    queryFn: async () => {
      const { data } = await supabase.from('payments').select('*').eq('id', id!).single()
      return data
    },
    enabled: !!id,
  })

  const [form, setForm] = useState({
    amount: '',
    method: 'transfer' as PaymentMethod,
    payment_date: '',
  })
  const [initialized, setInitialized] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (payment && !initialized) {
      setForm({
        amount: String(payment.amount),
        method: payment.method,
        payment_date: payment.payment_date,
      })
      setInitialized(true)
    }
  }, [payment, initialized])

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.amount || parseFloat(form.amount) <= 0) errs.amount = 'Monto debe ser mayor a 0'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!validate() || !payment) throw new Error('Validation failed')

      const amount = parseFloat(form.amount)

      // Update payment metadata
      const { error } = await supabase.from('payments').update({
        method: form.method,
        payment_date: form.payment_date,
      }).eq('id', id!)
      if (error) throw error

      // Apply balance delta for amount change via RPC
      const { data: balanceResult, error: balanceError } = await supabase.rpc('edit_payment_with_balance_delta', {
        p_payment_id: id,
        p_new_amount: amount
      })
      if (balanceError) throw new Error(balanceError.message)
      if (balanceResult && !balanceResult.success) throw new Error(balanceResult.error)

      // Recalculate schedule paid status
      const { data: allPayments } = await supabase.from('payments').select('amount').eq('loan_id', payment.loan_id)
      const { data: scheduleEntries } = await supabase.from('loan_schedule').select('*').eq('loan_id', payment.loan_id).order('due_date', { ascending: true })

      if (scheduleEntries && allPayments) {
        const totalPaid = allPayments.reduce((s: number, p: { amount: number }) => s + p.amount, 0)
        let accumulated = 0
        const paidIds: string[] = []
        const pendingIds: string[] = []

        for (const entry of scheduleEntries) {
          accumulated += entry.amount
          if (accumulated <= totalPaid) {
            paidIds.push(entry.id)
          } else {
            pendingIds.push(entry.id)
          }
        }

        if (paidIds.length > 0) await supabase.from('loan_schedule').update({ status: 'paid' }).in('id', paidIds)
        if (pendingIds.length > 0) await supabase.from('loan_schedule').update({ status: 'pending' }).in('id', pendingIds)

        const updatedSchedule: LoanScheduleEntry[] = scheduleEntries.map(s => ({
          ...s,
          status: paidIds.includes(s.id) ? 'paid' : 'pending'
        }))

        const nextDate = calcNextPaymentDate(updatedSchedule)
        const newStatus = calcLoanStatus(updatedSchedule, (allPayments as unknown as Payment[]), nextDate)

        await supabase.from('loans').update({ next_payment_date: nextDate, status: newStatus }).eq('id', payment.loan_id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-payments', payment?.loan_id] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['collection-breakdown'] })
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
      navigate(-1)
    }
  })

  if (isLoading || !initialized) {
    return <div><PageHeader title="Editar Pago" showBack /><div className="p-4 text-center text-gray-400 py-12">Cargando...</div></div>
  }

  return (
    <div>
      <PageHeader title="Editar Pago" showBack />
      <form className="p-4 space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
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
          <p className="text-red-600 text-sm text-center">Error al guardar. Intenta de nuevo.</p>
        )}
        <Button type="submit" fullWidth isLoading={mutation.isPending}>Guardar Cambios</Button>
      </form>
    </div>
  )
}

