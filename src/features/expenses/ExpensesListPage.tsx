import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, TrendingDown, Edit2, Trash2 } from 'lucide-react'
import type { Expense, UserRole } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  gasolina: '⛽ Gasolina',
  transporte: '🚌 Transporte',
  salario: '💼 Salario',
  otros: '📦 Otros',
}

type ExpenseWithUser = Expense & { users: { username: string } | null }
type TypeFilter = 'todos' | Expense['type']
type UserFilter = 'todos' | string

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'gasolina', label: TYPE_LABELS.gasolina },
  { value: 'transporte', label: TYPE_LABELS.transporte },
  { value: 'salario', label: TYPE_LABELS.salario },
  { value: 'otros', label: TYPE_LABELS.otros },
]

function toBogotaDateKey(dateTime: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(dateTime))
}

function formatSectionDate(dateKey: string): string {
  const date = new Date(dateKey + 'T17:00:00Z')
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ExpensesListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isAdmin = user?.role === 'admin'

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos')
  const [userFilter, setUserFilter] = useState<UserFilter>('todos')

  const { data: expenses = [], isLoading } = useQuery<ExpenseWithUser[]>({
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
      return (data ?? []) as unknown as ExpenseWithUser[]
    },
    enabled: !!user?.team_id,
    staleTime: 1000 * 60,
  })

  const { data: teamUsers = [] } = useQuery<{ id: string; username: string; role: UserRole }[]>({
    queryKey: ['expense-filter-users', user?.team_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, role')
        .eq('team_id', user!.team_id!)
        .order('username', { ascending: true })

      if (error) throw error
      return (data ?? []) as { id: string; username: string; role: UserRole }[]
    },
    enabled: !!user?.team_id && isAdmin,
    staleTime: 1000 * 60,
  })

  const deleteMutation = useMutation({
    mutationFn: async (expenseId: string) => {
      const { data, error } = await supabase.rpc('delete_expense_with_balance_revert', {
        p_expense_id: expenseId
      })
      if (error) throw new Error(error.message)
      if (data && !data.success) throw new Error(data.error)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['collection-breakdown'] })
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
    }
  })

  const filteredExpenses = useMemo(() => {
    if (!isAdmin) return expenses

    return expenses.filter(expense => {
      const matchesType = typeFilter === 'todos' || expense.type === typeFilter
      const matchesUser = userFilter === 'todos' || expense.created_by === userFilter
      return matchesType && matchesUser
    })
  }, [expenses, isAdmin, typeFilter, userFilter])

  const hasActiveFilters = isAdmin && (typeFilter !== 'todos' || userFilter !== 'todos')
  const isFallbackActive = hasActiveFilters && filteredExpenses.length === 0 && expenses.length > 0
  const visibleExpenses = isFallbackActive ? expenses : filteredExpenses

  const grouped: { date: string; items: ExpenseWithUser[] }[] = []
  for (const expense of visibleExpenses) {
    const date = toBogotaDateKey(expense.created_at)
    const last = grouped[grouped.length - 1]
    if (last && last.date === date) {
      last.items.push(expense)
    } else {
      grouped.push({ date, items: [expense] })
    }
  }

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

      <div className="p-4 space-y-4">
        {isAdmin && (
          <>
            <div className="flex gap-2 overflow-x-auto">
              {TYPE_FILTERS.map(filter => (
                <button
                  key={filter.value}
                  onClick={() => setTypeFilter(filter.value)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    typeFilter === filter.value
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 overflow-x-auto">
              <button
                onClick={() => setUserFilter('todos')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  userFilter === 'todos'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>

              {teamUsers.map(teamUser => (
                <button
                  key={teamUser.id}
                  onClick={() => setUserFilter(teamUser.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    userFilter === teamUser.id
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {teamUser.username}
                </button>
              ))}
            </div>
          </>
        )}

        {isFallbackActive && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Sin coincidencias con filtros, mostrando todos los gastos.
          </p>
        )}

        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <div className="animate-spin text-3xl mb-2">⏳</div>
            <p>Cargando gastos...</p>
          </div>
        )}

        {!isLoading && visibleExpenses.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <TrendingDown size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin gastos registrados</p>
          </div>
        )}

        {grouped.map(group => {
          const dayTotal = group.items.reduce((sum, expense) => sum + expense.amount, 0)
          return (
            <div key={group.date}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide capitalize">
                  {formatSectionDate(group.date)}
                </p>
                <p className="text-xs font-bold text-red-600">-{formatCurrency(dayTotal)}</p>
              </div>

              <div className="space-y-2">
                {group.items.map(e => (
                  <Card key={e.id}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900">{TYPE_LABELS[e.type] ?? e.type}</p>
                        {e.notes && <p className="text-xs text-gray-500 truncate">{e.notes}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDate(e.created_at)} · {e.users?.username ?? ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                        <p className="text-lg font-bold text-red-600">-{formatCurrency(e.amount)}</p>
                        {user?.role === 'admin' && (
                          <>
                            <button
                              onClick={() => navigate(`/gastos/${e.id}/editar`)}
                              className="p-2 hover:bg-blue-100 rounded-lg transition"
                              title="Editar"
                            >
                              <Edit2 size={16} className="text-blue-600" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('¿Eliminar este gasto?')) {
                                  deleteMutation.mutate(e.id)
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              className="p-2 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
                              title="Eliminar"
                            >
                              <Trash2 size={16} className="text-red-600" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

