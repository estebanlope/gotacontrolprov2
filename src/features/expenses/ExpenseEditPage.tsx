import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import type { Expense, ExpenseType } from '@/types'

const EXPENSE_TYPE_OPTIONS = [
  { value: 'gasolina', label: '⛽ Gasolina' },
  { value: 'transporte', label: '🚌 Transporte' },
  { value: 'salario', label: '💼 Salario' },
  { value: 'otros', label: '📦 Otros' },
]

export default function ExpenseEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    type: 'gasolina' as ExpenseType,
    amount: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [initialized, setInitialized] = useState(false)

  // Cargar gasto
  const { data: expense, isLoading } = useQuery<Expense | null>({
    queryKey: ['expense', id],
    queryFn: async () => {
      const { data } = await supabase.from('expenses').select('*').eq('id', id!).single()
      return data
    },
    enabled: !!id,
  })

  // Inicializar form
  useEffect(() => {
    if (expense && !initialized) {
      setForm({
        type: expense.type,
        amount: String(expense.amount),
        notes: expense.notes || '',
      })
      setInitialized(true)
    }
  }, [expense, initialized])

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
      if (!validate() || !expense) throw new Error('Validation failed')

      const newAmount = parseFloat(form.amount)

      // Update expense metadata
      const { error } = await supabase
        .from('expenses')
        .update({
          type: form.type,
          notes: form.notes.trim() || null,
        })
        .eq('id', id!)
      if (error) throw error

      // Apply balance delta for amount change via RPC
      const { data: balanceResult, error: balanceError } = await supabase.rpc('edit_expense_with_balance_delta', {
        p_expense_id: id,
        p_new_amount: newAmount
      })
      if (balanceError) throw new Error(balanceError.message)
      if (balanceResult && !balanceResult.success) throw new Error(balanceResult.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['collection-breakdown'] })
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
      navigate(-1)
    }
  })

  if (isLoading || !initialized) {
    return (
      <div>
        <PageHeader title="Editar Gasto" showBack />
        <div className="p-4 text-center text-gray-400 py-12">Cargando...</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Editar Gasto" showBack />
      <form className="p-4 space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate() }}>
        <Select
          label="Tipo de gasto *"
          options={EXPENSE_TYPE_OPTIONS}
          value={form.type}
          onChange={e => set('type', e.target.value as ExpenseType)}
        />

        <Input
          label="Monto *"
          type="number"
          inputMode="decimal"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
          error={errors.amount}
          placeholder="25000"
          min="1"
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Notas (opcional)</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Descripción del gasto..."
            className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {mutation.error && (
          <p className="text-red-600 text-sm text-center">Error al guardar. Intenta de nuevo.</p>
        )}

        <Button type="submit" fullWidth size="lg" isLoading={mutation.isPending}>
          Guardar Cambios
        </Button>
      </form>
    </div>
  )
}

