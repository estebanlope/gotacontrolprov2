import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { Plus, CreditCard } from 'lucide-react'
import type { Payment, PaymentMethod } from '@/types'

type PaymentWithRelations = Payment & { loans: { capital: number; clients: { full_name: string } } }

type MethodFilter = 'all' | PaymentMethod

const METHOD_FILTERS: { value: MethodFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'cash', label: '💵 Efectivo' },
  { value: 'transfer', label: '🔄 Transferencia' },
]

function formatSectionDate(dateStr: string): string {
  const date = new Date(dateStr + 'T17:00:00Z')
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PaymentsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('all')

  const { data: payments = [], isLoading } = useQuery<PaymentWithRelations[]>({
    queryKey: ['payments', user?.team_id, user?.id, user?.role],
    queryFn: async () => {
      let q = supabase
        .from('payments')
        .select('*, loans(capital, clients(full_name))')
        .eq('team_id', user!.team_id!)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (user?.role === 'cobrador') q = q.eq('created_by', user.id)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as PaymentWithRelations[]
    },
    enabled: !!user?.team_id,
    staleTime: 1000 * 60,
  })

  // Apply method filter, then group by date (preserving original date order)
  const filtered = methodFilter === 'all' ? payments : payments.filter(p => p.method === methodFilter)

  const grouped: { date: string; items: PaymentWithRelations[] }[] = []
  for (const p of filtered) {
    const last = grouped[grouped.length - 1]
    if (last && last.date === p.payment_date) {
      last.items.push(p)
    } else {
      grouped.push({ date: p.payment_date, items: [p] })
    }
  }

  const total = filtered.reduce((sum, p) => sum + p.amount, 0)

  return (
    <div>
      <PageHeader
        title="Pagos"
        showLogout
        rightElement={
          <Button size="sm" onClick={() => navigate('/pagos/nuevo')}>
            <Plus size={16} className="mr-1" />
            Nuevo
          </Button>
        }
      />
      <div className="p-4 space-y-4">
        {/* Method filter pills */}
        <div className="flex gap-2">
          {METHOD_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setMethodFilter(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                methodFilter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Total for current filter */}
        {!isLoading && filtered.length > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-green-600 font-medium">
              Total {methodFilter === 'cash' ? 'efectivo' : methodFilter === 'transfer' ? 'transferencias' : 'recaudado'}
            </p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(total)}</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <div className="animate-spin text-3xl mb-2">⏳</div>
            <p>Cargando pagos...</p>
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin pagos {methodFilter !== 'all' ? 'con este método' : 'registrados'}</p>
          </div>
        )}

        {grouped.map(group => {
          const dayTotal = group.items.reduce((sum, p) => sum + p.amount, 0)
          return (
          <div key={group.date}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide capitalize">
                {formatSectionDate(group.date)}
              </p>
              <p className="text-xs font-bold text-green-600">{formatCurrency(dayTotal)}</p>
            </div>
            <div className="space-y-2">
              {group.items.map(p => (
                <Card key={p.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {p.loans?.clients?.full_name ?? 'Cliente'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {p.method === 'cash' ? '💵 Efectivo' : '🔄 Transferencia'}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-green-600 ml-3 flex-shrink-0">
                      +{formatCurrency(p.amount)}
                    </p>
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
