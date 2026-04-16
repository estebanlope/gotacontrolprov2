import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { Plus, CreditCard } from 'lucide-react'
import type { Payment } from '@/types'

type PaymentWithRelations = Payment & { loans: { capital: number; clients: { full_name: string } } }

function formatSectionDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function PaymentsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

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

  // Group by date
  const grouped: { date: string; items: PaymentWithRelations[] }[] = []
  for (const p of payments) {
    const last = grouped[grouped.length - 1]
    if (last && last.date === p.payment_date) {
      last.items.push(p)
    } else {
      grouped.push({ date: p.payment_date, items: [p] })
    }
  }

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
        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <div className="animate-spin text-3xl mb-2">⏳</div>
            <p>Cargando pagos...</p>
          </div>
        )}
        {!isLoading && payments.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin pagos registrados</p>
          </div>
        )}
        {grouped.map(group => (
          <div key={group.date}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 capitalize">
              {formatSectionDate(group.date)}
            </p>
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
        ))}
      </div>
    </div>
  )
}
