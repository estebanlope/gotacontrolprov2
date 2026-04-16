import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, TrendingDown } from 'lucide-react'
import type { Expense } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  gasolina: '⛽ Gasolina',
  transporte: '🚌 Transporte',
  salario: '💼 Salario',
  otros: '📦 Otros',
}

export default function ExpensesListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: expenses = [], isLoading } = useQuery<(Expense & { users: { username: string } })[]>({
    queryKey: ['expenses', user?.team_id, user?.id, user?.role],
    queryFn: async () => {
      let q = supabase
        .from('expenses')
        .select('*, users(username)')
        .eq('team_id', user!.team_id!)
        .order('created_at', { ascending: false })

      if (user?.role === 'cobrador') q = q.eq('created_by', user.id)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as (Expense & { users: { username: string } })[]
    },
    enabled: !!user?.team_id,
    staleTime: 1000 * 60,
  })

  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div>
      <PageHeader
        title="Gastos"
        showLogout
        rightElement={
          <Button size="sm" onClick={() => navigate('/gastos/nuevo')}>
            <Plus size={16} className="mr-1" />
            Nuevo
          </Button>
        }
      />

      <div className="p-4 space-y-3">
        {/* Total */}
        {expenses.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <p className="text-xs text-red-500 font-medium uppercase tracking-wide">Total gastos</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{formatCurrency(total)}</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <div className="animate-spin text-3xl mb-2">⏳</div>
            <p>Cargando gastos...</p>
          </div>
        )}

        {!isLoading && expenses.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <TrendingDown size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin gastos registrados</p>
          </div>
        )}

        {expenses.map(e => (
          <Card key={e.id}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{TYPE_LABELS[e.type] ?? e.type}</p>
                {e.notes && <p className="text-xs text-gray-500 truncate">{e.notes}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDate(e.created_at)} · {e.users?.username ?? ''}
                </p>
              </div>
              <p className="text-lg font-bold text-red-600 ml-3 flex-shrink-0">
                -{formatCurrency(e.amount)}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

