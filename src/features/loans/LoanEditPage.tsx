import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useLoan } from './useLoans'
import PageHeader from '@/components/layout/PageHeader'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
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
      const { error } = await supabase
        .from('loans')
        .update({
          capital: parseFloat(form.capital),
          interest_rate: parseFloat(form.interest_rate),
          payment_type: form.payment_type,
          term_weeks: parseInt(form.term_weeks),
          disbursement_date: form.disbursement_date,
        })
        .eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan', id] })
      queryClient.invalidateQueries({ queryKey: ['loans'] })
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

