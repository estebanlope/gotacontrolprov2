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
import { formatDate, formatCurrency, todayISO } from '@/lib/utils'
import { Search } from 'lucide-react'
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
    payment_date: todayISO(),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loanSearch, setLoanSearch] = useState('')
  const [showLoanDropdown, setShowLoanDropdown] = useState(false)

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

        // Update user balance: add payment amount (fetch current to avoid stale value)
        const { data: currentUser } = await supabase
          .from('users')
          .select('balance')
          .eq('id', user!.id)
          .single()
        if (currentUser) {
          await supabase
            .from('users')
            .update({ balance: (currentUser.balance ?? 0) + amount })
            .eq('id', user!.id)
        }

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
        const workerUrl = (import.meta.env.VITE_CF_WORKER_URL as string)?.replace(/\/$/, '')
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
        await enqueueSync('payments', id, 'insert', newPayment as unknown as Record<string, unknown>, amount, user!.id)
      }

      return newPayment
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['loan-payments'] })
      queryClient.invalidateQueries({ queryKey: ['loan-schedule'] })
      queryClient.invalidateQueries({ queryKey: ['collection-breakdown'] })
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
      navigate(-1)
    }
  })

  const loanOptions = loans.map(l => {
    const c = (l as unknown as { clients?: { full_name: string } }).clients
    return { value: l.id, label: `${c?.full_name ?? 'Cliente'} — ${formatCurrency(l.capital)}` }
  })

  const filteredLoanOptions = loanSearch.trim()
    ? loanOptions.filter(o => o.label.toLowerCase().includes(loanSearch.toLowerCase()))
    : loanOptions

  const selectedLoanOption = loanOptions.find(o => o.value === form.loan_id)

  return (
    <div>
      <PageHeader title="Registrar Pago" showBack />
      <form className="p-4 space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>

        {/* Loan search */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Préstamo *</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={selectedLoanOption && !showLoanDropdown ? selectedLoanOption.label : loanSearch}
              onChange={e => {
                setLoanSearch(e.target.value)
                setShowLoanDropdown(true)
                if (!e.target.value) set('loan_id', '')
              }}
              onFocus={() => setShowLoanDropdown(true)}
              onBlur={() => setTimeout(() => setShowLoanDropdown(false), 150)}
              placeholder="Buscar por nombre de cliente..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showLoanDropdown && filteredLoanOptions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {filteredLoanOptions.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    onMouseDown={() => {
                      set('loan_id', o.value)
                      setLoanSearch('')
                      setShowLoanDropdown(false)
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {showLoanDropdown && loanSearch && filteredLoanOptions.length === 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                Sin resultados
              </div>
            )}
          </div>
          {errors.loan_id && <p className="text-xs text-red-600">{errors.loan_id}</p>}
        </div>

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
