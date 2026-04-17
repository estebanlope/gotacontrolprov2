import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { enqueueSync } from '@/lib/syncQueue'
import { useAuth } from '@/context/AuthContext'
import {
  calcDueDate, generateSchedule, calcNextPaymentDate,
  paymentTypeLabel
} from '@/lib/loanCalculations'
import PageHeader from '@/components/layout/PageHeader'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { formatDate, formatCurrency, todayISO } from '@/lib/utils'
import type { Loan, PaymentType, Client, Config } from '@/types'

const PAYMENT_TYPE_OPTIONS = [
  { value: 'daily', label: 'Diario' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
]

export default function LoanForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const preselectedClientId = searchParams.get('client_id') ?? ''

  // Load config for default interest rate
  const { data: config } = useQuery<Config | null>({
    queryKey: ['config', user?.team_id],
    queryFn: async () => {
      const { data } = await supabase.from('config').select('*').eq('team_id', user!.team_id!).single()
      return data
    },
    enabled: !!user?.team_id,
  })

  // Load clients for selector
  const { data: clients = [] } = useQuery<Pick<Client, 'id' | 'full_name' | 'cedula' | 'phone'>[]>({
    queryKey: ['clients-selector', user?.team_id, user?.role, user?.id],
    queryFn: async () => {
      let q = supabase.from('clients').select('id, full_name, cedula, phone').eq('team_id', user!.team_id!)
      if (user?.role === 'cobrador') q = q.eq('created_by', user.id)
      const { data } = await q.order('full_name')
      return (data ?? []) as Pick<Client, 'id' | 'full_name' | 'cedula' | 'phone'>[]
    },
    enabled: !!user?.team_id,
  })

  const [form, setForm] = useState({
    client_id: preselectedClientId,
    capital: '',
    interest_rate: '',
    payment_type: 'weekly' as PaymentType,
    term_weeks: '4',
    disbursement_date: todayISO(),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Set default interest rate from config
  useEffect(() => {
    if (config?.default_interest_rate && !form.interest_rate) {
      setForm(prev => ({ ...prev, interest_rate: String(config.default_interest_rate) }))
    }
  }, [config])

  // Pre-fill client search when coming from client detail page
  useEffect(() => {
    if (preselectedClientId && clients.length > 0 && !clientSearch) {
      const found = clients.find(c => c.id === preselectedClientId)
      if (found) setClientSearch(`${found.full_name} — CC ${found.cedula}`)
    }
  }, [clients, preselectedClientId])

  // Derived calculations for preview
  const capital = parseFloat(form.capital) || 0
  const interestRate = parseFloat(form.interest_rate) || 20
  const termWeeks = parseInt(form.term_weeks) || 4
  const disbDate = new Date(form.disbursement_date + 'T12:00:00')
  const dueDate = calcDueDate(disbDate, termWeeks)
  const totalAmount = capital + capital * (interestRate / 100)

  const previewSchedule = capital > 0
    ? generateSchedule('preview', disbDate, capital, interestRate, form.payment_type, termWeeks)
    : []

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.client_id) errs.client_id = 'Selecciona un cliente'
    if (!form.capital || parseFloat(form.capital) <= 0) errs.capital = 'Capital debe ser mayor a 0'
    if (!form.interest_rate) errs.interest_rate = 'Tasa de interés requerida'
    if (!form.term_weeks || parseInt(form.term_weeks) < 1) errs.term_weeks = 'Plazo inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed')

      // Check client does not have active loan
      const existingLoans = await supabase
        .from('loans')
        .select('id, status')
        .eq('client_id', form.client_id)
        .in('status', ['active', 'overdue', 'pending'])

      if (existingLoans.data && existingLoans.data.length > 0) {
        throw new Error('Este cliente ya tiene un préstamo activo')
      }

      const id = uuidv4()
      const disbDateObj = new Date(form.disbursement_date + 'T12:00:00')
      const dueDateObj = calcDueDate(disbDateObj, termWeeks)

      const schedule = generateSchedule(
        id, disbDateObj, capital, interestRate, form.payment_type, termWeeks
      )

      const scheduleWithIds = schedule.map(s => ({
        ...s,
        id: uuidv4(),
      }))

      const nextPaymentDate = calcNextPaymentDate(
        scheduleWithIds.map(s => ({ ...s, status: 'pending' as const }))
      )

      const newLoan: Loan = {
        id,
        team_id: user!.team_id!,
        client_id: form.client_id,
        created_by: user!.id,
        capital,
        interest_rate: interestRate,
        payment_type: form.payment_type,
        term_weeks: termWeeks,
        disbursement_date: form.disbursement_date,
        due_date: dueDateObj.toISOString().split('T')[0],
        next_payment_date: nextPaymentDate,
        status: 'pending',
        created_at: new Date().toISOString(),
      }

      // Save locally
      await db.loans.put({ ...newLoan, synced: false })
      await db.loan_schedule.bulkPut(scheduleWithIds.map(s => ({ ...s, synced: false })))

      if (navigator.onLine) {
        const { error: loanErr } = await supabase.from('loans').upsert(newLoan)
        if (loanErr) throw loanErr
        const { error: schedErr } = await supabase.from('loan_schedule').upsert(scheduleWithIds)
        if (schedErr) throw schedErr

        // Update user balance: reduce by capital (fetch current to avoid stale session value)
        const { data: currentUser } = await supabase
          .from('users')
          .select('balance')
          .eq('id', user!.id)
          .single()
        if (currentUser) {
          const newBalance = Math.max(0, (currentUser.balance ?? 0) - capital)
          await supabase.from('users').update({ balance: newBalance }).eq('id', user!.id)
        }

        await db.loans.update(id, { synced: true })
        await db.loan_schedule.where('loan_id').equals(id).modify({ synced: true })

        // Notify Telegram
        const workerUrl = (import.meta.env.VITE_CF_WORKER_URL as string)?.replace(/\/$/, '')
        if (workerUrl) {
          const client = clients.find(c => c.id === form.client_id)
          fetch(`${workerUrl}/notify/loan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loan: newLoan, client, team_id: user!.team_id!, schedule: scheduleWithIds }),
          }).catch(() => {})
        }
      } else {
        await enqueueSync('loans', id, 'insert', newLoan as unknown as Record<string, unknown>, -capital, user!.id)
        for (const s of scheduleWithIds) {
          await enqueueSync('loan_schedule', s.id, 'insert', s as unknown as Record<string, unknown>)
        }
      }

      return newLoan
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['loans-summary'] })
      queryClient.invalidateQueries({ queryKey: ['collection-breakdown'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
      navigate(-1)
    }
  })

  const [clientSearch, setClientSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  const selectedClient = clients.find(c => c.id === form.client_id)

  const filteredClients = clientSearch.trim()
    ? clients.filter(c =>
        c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        c.cedula.includes(clientSearch)
      )
    : clients

  const handleSelectClient = (id: string, label: string) => {
    set('client_id', id)
    setClientSearch(label)
    setShowDropdown(false)
  }

  return (
    <div>
      <PageHeader title="Nuevo Préstamo" showBack />

      <form className="p-4 space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>

        {/* Client search */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Cliente *</label>
          <div className="relative">
            <input
              type="text"
              value={selectedClient && !showDropdown ? `${selectedClient.full_name} — CC ${selectedClient.cedula}` : clientSearch}
              onChange={e => {
                setClientSearch(e.target.value)
                setShowDropdown(true)
                if (!e.target.value) set('client_id', '')
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="Buscar por nombre o cédula..."
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {showDropdown && filteredClients.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => handleSelectClient(c.id, '')}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                  >
                    <p className="font-medium text-gray-900">{c.full_name}</p>
                    <p className="text-xs text-gray-400">CC {c.cedula}</p>
                  </button>
                ))}
              </div>
            )}
            {showDropdown && clientSearch && filteredClients.length === 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-sm text-gray-400">
                Sin resultados
              </div>
            )}
          </div>
          {errors.client_id && <p className="text-xs text-red-600">{errors.client_id}</p>}
        </div>

        <Input
          label="Capital prestado *"
          type="number"
          inputMode="decimal"
          value={form.capital}
          onChange={e => set('capital', e.target.value)}
          error={errors.capital}
          placeholder="500000"
          min="1"
        />

        <Input
          label={`Tasa de interés (%) *${user?.role === 'cobrador' ? ' — Fija 20%' : ''}`}
          type="number"
          inputMode="decimal"
          value={form.interest_rate}
          onChange={e => set('interest_rate', e.target.value)}
          error={errors.interest_rate}
          placeholder="20"
          hint="Por defecto 20% sobre el capital inicial"
          disabled={user?.role === 'cobrador'}
        />

        <Select
          label="Tipo de pago *"
          options={PAYMENT_TYPE_OPTIONS}
          value={form.payment_type}
          onChange={e => set('payment_type', e.target.value as PaymentType)}
        />

        <Input
          label="Plazo en semanas *"
          type="number"
          inputMode="numeric"
          value={form.term_weeks}
          onChange={e => set('term_weeks', e.target.value)}
          error={errors.term_weeks}
          placeholder="4"
          min="1"
          hint="Por defecto 4 semanas"
        />

        <Input
          label="Fecha de desembolso *"
          type="date"
          value={form.disbursement_date}
          onChange={e => set('disbursement_date', e.target.value)}
        />

        {/* Preview */}
        {capital > 0 && (
          <Card className="bg-blue-50 border-blue-200">
            <p className="text-sm font-semibold text-blue-900 mb-3">📊 Resumen del préstamo</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-blue-600 text-xs">Capital</p><p className="font-semibold">{formatCurrency(capital)}</p></div>
              <div><p className="text-blue-600 text-xs">Interés ({interestRate}%)</p><p className="font-semibold">{formatCurrency(capital * interestRate / 100)}</p></div>
              <div><p className="text-blue-600 text-xs">Total a pagar</p><p className="font-semibold">{formatCurrency(totalAmount)}</p></div>
              <div><p className="text-blue-600 text-xs">Cuotas</p><p className="font-semibold">{previewSchedule.length} ({paymentTypeLabel(form.payment_type)})</p></div>
              <div><p className="text-blue-600 text-xs">Vencimiento</p><p className="font-semibold">{formatDate(dueDate.toISOString().split('T')[0])}</p></div>
              <div><p className="text-blue-600 text-xs">Cuota aprox.</p><p className="font-semibold">{previewSchedule.length > 0 ? formatCurrency(previewSchedule[0].amount) : '—'}</p></div>
            </div>
          </Card>
        )}

        {mutation.error && (
          <p className="text-red-600 text-sm text-center font-medium">
            {(mutation.error as Error).message !== 'Validation failed'
              ? (mutation.error as Error).message
              : ''}
          </p>
        )}

        <Button type="submit" fullWidth size="lg" isLoading={mutation.isPending}>
          Crear Préstamo
        </Button>
      </form>
    </div>
  )
}
