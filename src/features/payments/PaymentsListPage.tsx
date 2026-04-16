import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, CreditCard } from 'lucide-react'
import type { Payment } from '@/types'

export default function PaymentsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const { data: payments = [], isLoading } = useQuery<(Payment & { loans: { capital: number; clients: { full_name: string } } })[]>({
    queryKey: ['payments', user?.team_id, user?.id, user?.role],
    queryFn: async () => {
      let q = supabase
        .from('payments')
        .select('*, loans(capital, clients(full_name))')
        .eq('team_id', user!.team_id!)
        .order('payment_date', { ascending: false })

      if (user?.role === 'cobrador') q = q.eq('created_by', user.id)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as (Payment & { loans: { capital: number; clients: { full_name: string } } })[]
    },
    enabled: !!user?.team_id,
    staleTime: 1000 * 60,
  })

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

      <div className="p-4 space-y-3">
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

        {payments.map(p => (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">
                  {p.loans?.clients?.full_name ?? 'Cliente'}
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(p.payment_date)} · {p.method === 'cash' ? '💵 Efectivo' : '🔄 Transferencia'}
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
}

