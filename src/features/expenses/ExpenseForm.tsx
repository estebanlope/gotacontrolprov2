import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { enqueueSync } from '@/lib/syncQueue'
import { useAuth } from '@/context/AuthContext'
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

export default function ExpenseForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    type: 'gasolina' as ExpenseType,
    amount: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

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
      if (!validate()) throw new Error('Validation failed')

      const id = uuidv4()
      const newExpense: Expense = {
        id,
        team_id: user!.team_id!,
        created_by: user!.id,
        type: form.type,
        amount: parseFloat(form.amount),
        notes: form.notes.trim() || null,
        created_at: new Date().toISOString(),
      }

      await db.expenses.put({ ...newExpense, synced: false })

      if (navigator.onLine) {
        const { error } = await supabase.from('expenses').upsert(newExpense)
        if (error) throw error
        await db.expenses.update(id, { synced: true })

        // Notify Telegram
        const workerUrl = import.meta.env.VITE_CF_WORKER_URL
        if (workerUrl) {
          fetch(`${workerUrl}/notify/expense`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expense: newExpense,
              username: user!.username,
              team_id: user!.team_id!
            }),
          }).catch(() => {})
        }
      } else {
        await enqueueSync('expenses', id, 'insert', newExpense as unknown as Record<string, unknown>)
      }

      return newExpense
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      navigate(-1)
    }
  })

  return (
    <div>
      <PageHeader title="Registrar Gasto" showBack />
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
          Guardar Gasto
        </Button>
      </form>
    </div>
  )
}

